// invoice.js - Unified Invoice & Payment Management Module

let invoicePage = 1, invoiceSearch = '', invoiceFilter = '', invoicePerPage = 10;
let invoiceTypeFilter = '';
let invoiceMethodFilter = '';
let invoiceDateType = 'issue_date';
let invoiceStartDate = '';
let invoiceEndDate = '';
let invoiceSortField = 'issue_date';
let invoiceSortAsc = false;
let invoiceFilterPanelOpen = false;
let invoiceActionsVisible = false;

// Cache object to store processed list for filters and export
let _invCache = { invoices: [], oMap: {}, cMap: {}, filteredInvoices: [], invoicePaymentsMap: {} };

// ── Pending / Returned ledger — shared bill-rendering helpers ──────────
// order_item_flags rows are the permanent memory of "kept back" / "handed
// back" items (see supabase_order_item_flags_migration.sql). These two
// helpers turn that ledger into the "P" badge and the three optional
// summary sentences NewChange.md asks for. viewInvoice, printInvoice and
// previewInvoiceByOrder all call the same helpers so the three bill views
// can't drift out of sync with each other.
//
// Row 1 (this order's own items just flagged pending) and the "P" badge
// are scoped to flags still in status 'pending' — once a later order
// actually delivers the item and clears the flag, the badge/sentence
// stops appearing on reprint instead of permanently (and misleadingly)
// claiming it's still owed. Row 2/Row 3 (this order clearing an OLDER
// order's flags) are permanent history — cleared_in_order_id never
// changes once set, so those two rows print identically every time this
// bill is reopened, satisfying NewChange.md's "these bills should be
// saved so I can refer them easily."
async function _getPendingItemIdsForOrder(orderId) {
  let flags = [];
  try { flags = await _billDB.getFlagsBySourceOrder(orderId); } catch (e) { return new Set(); }
  return new Set(
    flags.filter(f => f.flag_type === 'pending' && f.status === 'pending' && f.order_item_id != null)
         .map(f => String(f.order_item_id))
  );
}

async function _buildPendingReturnSummaryHtml(order) {
  if (!order) return '';
  let ownFlags = [], clearedFlags = [];
  try {
    [ownFlags, clearedFlags] = await Promise.all([
      _billDB.getFlagsBySourceOrder(order.id),
      _billDB.getFlagsClearedByOrder(order.id)
    ]);
  } catch (e) { return ''; }

  const rows = [];

  // Row 1 — this order's own items currently kept pending.
  const row1Items = ownFlags.filter(f => f.flag_type === 'pending' && f.status === 'pending');
  if (row1Items.length) {
    const parts = row1Items.map(f => `${escapeHtml(f.item_name)} - ${f.quantity}`).join(', ');
    rows.push(`Related to this bill, ${parts} were kept as pending from order no ${escapeHtml(order.batch_id || '')}`);
  }

  // Rows 2/3 — older orders' flags this bill is resolving, grouped by source order.
  const buildClearedRows = async (flagType, label, verb) => {
    const matches = clearedFlags.filter(f => f.flag_type === flagType);
    if (!matches.length) return [];
    const bySource = {};
    matches.forEach(f => { (bySource[f.order_id] = bySource[f.order_id] || []).push(f); });
    const out = [];
    for (const sourceOrderId of Object.keys(bySource)) {
      const srcOrder = await DB.getOrder(parseInt(sourceOrderId)).catch(() => null);
      const parts = bySource[sourceOrderId].map(f => `${escapeHtml(f.item_name)} - ${f.quantity}`).join(', ');
      out.push(`${label} ${parts} ${verb} ${escapeHtml(srcOrder?.batch_id || ('#' + sourceOrderId))}`);
    }
    return out;
  };

  rows.push(...await buildClearedRows('pending', 'Delivering Pending', 'collected by orderID'));
  rows.push(...await buildClearedRows('returned', 'Delivering returned', 'collected from orderID'));

  if (!rows.length) return '';
  return `<div style="margin-top:18px;padding-top:14px;border-top:1px dashed #cbd5e1;font-size:0.82em;color:#475569;line-height:1.7;">
    ${rows.map(r => `<div>${r}</div>`).join('')}
  </div>`;
}

async function renderInvoices() {
  document.getElementById('page-title').textContent = 'Invoice Management';
  showLoading('content', 'Loading Invoices...');
  
  // Build page shell
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Invoice Management</span>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">
      ${renderInvStatCard("Total Invoices", "0", "fa-file-invoice", "#3b82f6", "#dbeafe", '<span id="card-total-invoices-sub">Across current filter</span>', "card-total-invoices")}
      ${renderInvStatCard("Total Revenue Collected", "LKR 0.00", "fa-hand-holding-dollar", "#22c55e", "#dcfce7", "Calculated from payments", "card-total-revenue")}
      ${renderInvStatCard("Outstanding Balance", "LKR 0.00", "fa-file-invoice-dollar", "#ef4444", "#fee2e2", '<span id="card-outstanding-balance-sub">Awaiting payment</span>', "card-outstanding-balance")}
    </div>

    <!-- Filters & Search -->
    <div class="card" style="margin-bottom:18px;padding:20px;">
      <!-- Top Row: Search and Quick Buttons -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;width:100%;">
        <div class="search-wrap" style="flex:1;min-width:200px;margin:0;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="inv-search-input" placeholder="Search invoice #, customer, order batch..."
            value="${escapeHtml(invoiceSearch)}"
            autocomplete="off" spellcheck="false"
            oninput="invoiceSearch=this.value;invoicePage=1;_refreshInvoicesTable()"/>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="invoices-filter-btn" onclick="toggleInvoicesFilter()">
            <i class="fas fa-filter"></i> Filter
          </button>
          <span id="inv-count" style="font-size:0.82em;color:var(--text-muted);font-weight:600;margin-left:8px;"></span>
        </div>
      </div>

      <!-- Collapsible Filter Panel -->
      <div id="invoices-filter-panel" style="display:none;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:600;font-size:0.8em;color:var(--text-muted);">Status</label>
          <select class="form-input form-select" id="inv-filter-sel" onchange="invoiceFilter=this.value;invoicePage=1;_refreshInvoicesTable()">
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:600;font-size:0.8em;color:var(--text-muted);">Invoice Type</label>
          <select class="form-input form-select" id="inv-type-sel" onchange="invoiceTypeFilter=this.value;invoicePage=1;_refreshInvoicesTable()">
            <option value="">All Types</option>
            <option value="Standard">Standard</option>
            <option value="Credit">Credit</option>
          </select>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:600;font-size:0.8em;color:var(--text-muted);">Payment Method</label>
          <select class="form-input form-select" id="inv-method-sel" onchange="invoiceMethodFilter=this.value;invoicePage=1;_refreshInvoicesTable()">
            <option value="">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:600;font-size:0.8em;color:var(--text-muted);">Date Filter Base</label>
          <select class="form-input form-select" id="inv-date-type-sel" onchange="invoiceDateType=this.value;invoicePage=1;_refreshInvoicesTable()">
            <option value="issue_date">Issue Date</option>
            <option value="payment_date">Payment Date</option>
          </select>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:600;font-size:0.8em;color:var(--text-muted);">Start Date</label>
          <input type="date" class="form-input" id="inv-start-date" value="${invoiceStartDate}" onchange="invoiceStartDate=this.value;invoicePage=1;_refreshInvoicesTable()"/>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:600;font-size:0.8em;color:var(--text-muted);">End Date</label>
          <input type="date" class="form-input" id="inv-end-date" value="${invoiceEndDate}" onchange="invoiceEndDate=this.value;invoicePage=1;_refreshInvoicesTable()"/>
        </div>
      </div>
    </div>

    <!-- Invoices Table -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap" style="overflow-x:auto;" data-rows-scroll>
        <table style="min-width:1300px;border-collapse:collapse;">
          <thead>
            <tr>
              <th onclick="sortInvoices('invoice_number')" style="cursor:pointer;user-select:none;white-space:nowrap;">Invoice No ${getSortIcon('invoice_number')}</th>
              <th style="white-space:nowrap;">Order ID</th>
              <th onclick="sortInvoices('customer')" style="cursor:pointer;user-select:none;">Customer ${getSortIcon('customer')}</th>
              <th onclick="sortInvoices('status')" style="cursor:pointer;user-select:none;">Status ${getSortIcon('status')}</th>
              <th onclick="sortInvoices('total')" style="cursor:pointer;text-align:right;user-select:none;">Invoice Total ${getSortIcon('total')}</th>
              <th onclick="sortInvoices('paid')" style="cursor:pointer;text-align:right;user-select:none;">Amount Paid ${getSortIcon('paid')}</th>
              <th>Deduction</th>
              <th onclick="sortInvoices('balance')" style="cursor:pointer;text-align:right;user-select:none;">Remaining Balance ${getSortIcon('balance')}</th>
              <th style="position:sticky;right:0;top:0;background:var(--card-bg);box-shadow:-2px 0 5px rgba(0,0,0,0.05);z-index:7;white-space:nowrap;">
                Actions
                <button id="inv-actions-toggle" onclick="_toggleAllInvoiceActions()" title="Show / Hide action buttons"
                  style="margin-left:6px;padding:2px 7px;font-size:0.85em;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--bg);color:var(--text-muted);vertical-align:middle;">
                  <i class="fas fa-eye-slash"></i>
                </button>
              </th>
            </tr>
          </thead>
          <tbody id="inv-table-body"></tbody>
        </table>
      </div>
    </div>`;

  // Apply visual state for filter drawer if previously toggled
  if (invoiceFilterPanelOpen) {
    const panel = document.getElementById('invoices-filter-panel');
    const btn = document.getElementById('invoices-filter-btn');
    if (panel) panel.style.display = 'grid';
    if (btn) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
    }
  }

  await _refreshInvoicesTable();
  const searchInput = document.getElementById('inv-search-input');
  if (searchInput) searchInput.focus();
}

function renderInvStatCard(label, value, icon, color, bgColor, sub, id, containerId = '') {
  return `
    <div class="stat-card" id="${containerId || id + '-container'}" style="transition:all 0.3s; margin:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div class="label" style="font-size:0.8em;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
        <div style="background:${bgColor};color:${color};width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <i class="fas ${icon}"></i>
        </div>
      </div>
      <div class="value" id="${id}">${value}</div>
      <div class="sub">${sub}</div>
    </div>`;
}

function toggleInvoicesFilter() {
  const panel = document.getElementById('invoices-filter-panel');
  const btn = document.getElementById('invoices-filter-btn');
  if (panel && btn) {
    invoiceFilterPanelOpen = !invoiceFilterPanelOpen;
    panel.style.display = invoiceFilterPanelOpen ? 'grid' : 'none';
    btn.classList.toggle('btn-primary', invoiceFilterPanelOpen);
    btn.classList.toggle('btn-secondary', !invoiceFilterPanelOpen);
  }
}

function _toggleAllInvoiceActions() {
  invoiceActionsVisible = !invoiceActionsVisible;
  document.querySelectorAll('.invoice-extra-actions').forEach(span => {
    span.style.display = invoiceActionsVisible ? 'inline-flex' : 'none';
    if (invoiceActionsVisible) span.style.gap = '4px';
  });
  const toggleBtn = document.getElementById('inv-actions-toggle');
  if (toggleBtn) toggleBtn.innerHTML = invoiceActionsVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

async function _refreshInvoicesTable() {
  const tbody = document.getElementById('inv-table-body');
  if (!tbody) return;

  const [invoices, orders, customers, payments] = await Promise.all([
    DB.getInvoices(),
    DB.getOrders(),
    DB.getCustomers(),
    DB.getPayments()
  ]);

  const oMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));

  // Group payments by invoice
  const invPayments = {};
  payments.forEach(p => {
    if (!invPayments[p.invoice_id]) invPayments[p.invoice_id] = [];
    invPayments[p.invoice_id].push(p);
  });

  // Sort grouped payments by date ascending
  Object.keys(invPayments).forEach(iid => {
    invPayments[iid].sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  // Cache maps for global exports
  _invCache.oMap = oMap;
  _invCache.cMap = cMap;
  _invCache.invoicePaymentsMap = invPayments;

  // Sync DOM selectors
  const statusSel = document.getElementById('inv-filter-sel');
  if (statusSel && statusSel.value !== invoiceFilter) statusSel.value = invoiceFilter;
  const typeSel = document.getElementById('inv-type-sel');
  if (typeSel && typeSel.value !== invoiceTypeFilter) typeSel.value = invoiceTypeFilter;
  const methodSel = document.getElementById('inv-method-sel');
  if (methodSel && methodSel.value !== invoiceMethodFilter) methodSel.value = invoiceMethodFilter;
  const dateTypeSel = document.getElementById('inv-date-type-sel');
  if (dateTypeSel && dateTypeSel.value !== invoiceDateType) dateTypeSel.value = invoiceDateType;

  // Filter logic with canonical financial calculation
  let filtered = invoices.map(inv => {
    const pList = invPayments[inv.id] || [];
    const fin = Financials.computeInvoiceFinancials(inv, [], pList);
    const latestPayment = pList.length > 0 ? pList[pList.length - 1] : null;

    return {
      ...inv,
      computedPaid: fin.totalPaid,
      computedBalance: fin.balance,
      computedStatus: fin.status,
      latestPayment: latestPayment
    };
  });

  // Unpaid invoices are listed here too. An invoice is raised when the order
  // is billed, not when it is settled, so hiding the Unpaid ones made every
  // invoice raised before its payment (and the whole legacy book carried over
  // from the old POS) look as though it had vanished. Use the Status filter
  // to narrow to Paid / Partially Paid / Unpaid.

  // Apply filters
  if (invoiceSearch) {
    const q = invoiceSearch.toLowerCase().trim();
    filtered = filtered.filter(inv => {
      const o = oMap[inv.order_id];
      const cName = o ? getOrderCustomerName(o, cMap) : '';
      return inv.invoice_number?.toLowerCase().includes(q) ||
             (o && o.batch_id?.toLowerCase().includes(q)) ||
             cName.toLowerCase().includes(q);
    });
  }

  if (invoiceFilter) {
    filtered = filtered.filter(inv => inv.computedStatus === invoiceFilter);
  }

  if (invoiceTypeFilter) {
    filtered = filtered.filter(inv => inv.invoice_type === invoiceTypeFilter);
  }

  if (invoiceMethodFilter) {
    filtered = filtered.filter(inv => {
      const method = inv.latestPayment ? inv.latestPayment.method : (inv.advance_payment > 0 ? 'Cash' : null);
      return method === invoiceMethodFilter;
    });
  }

  // Date Range Filter
  if (invoiceStartDate) {
    const start = new Date(invoiceStartDate);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter(inv => {
      if (invoiceDateType === 'issue_date') {
        return new Date(inv.issue_date) >= start;
      } else {
        const lastPayDate = inv.latestPayment ? new Date(inv.latestPayment.date) : (inv.advance_payment > 0 ? new Date(inv.issue_date) : null);
        return lastPayDate && lastPayDate >= start;
      }
    });
  }

  if (invoiceEndDate) {
    const end = new Date(invoiceEndDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter(inv => {
      if (invoiceDateType === 'issue_date') {
        return new Date(inv.issue_date) <= end;
      } else {
        const lastPayDate = inv.latestPayment ? new Date(inv.latestPayment.date) : (inv.advance_payment > 0 ? new Date(inv.issue_date) : null);
        return lastPayDate && lastPayDate <= end;
      }
    });
  }

  // Sorting
  filtered.sort((a, b) => {
    let valA, valB;

    if (invoiceSortField === 'customer') {
      const oA = oMap[a.order_id];
      const cA = oA ? cMap[oA.customer_id] : null;
      valA = (cA ? cA.hotel_name : (oA ? getOrderCustomerName(oA, cMap) : '')).toLowerCase();
      const oB = oMap[b.order_id];
      const cB = oB ? cMap[oB.customer_id] : null;
      valB = (cB ? cB.hotel_name : (oB ? getOrderCustomerName(oB, cMap) : '')).toLowerCase();
    } else if (invoiceSortField === 'invoice_number') {
      valA = a.invoice_number.toLowerCase();
      valB = b.invoice_number.toLowerCase();
    } else if (invoiceSortField === 'total') {
      valA = a.total_amount;
      valB = b.total_amount;
    } else if (invoiceSortField === 'paid') {
      valA = a.computedPaid;
      valB = b.computedPaid;
    } else if (invoiceSortField === 'balance') {
      valA = a.computedBalance;
      valB = b.computedBalance;
    } else if (invoiceSortField === 'status') {
      valA = a.computedStatus.toLowerCase();
      valB = b.computedStatus.toLowerCase();
    } else if (invoiceSortField === 'due_date') {
      valA = a.invoice_type === 'Credit' && a.credit_due_date ? new Date(a.credit_due_date) : new Date(0);
      valB = b.invoice_type === 'Credit' && b.credit_due_date ? new Date(b.credit_due_date) : new Date(0);
    } else { // default issue_date
      valA = new Date(a.issue_date);
      valB = new Date(b.issue_date);
    }

    if (valA < valB) return invoiceSortAsc ? -1 : 1;
    if (valA > valB) return invoiceSortAsc ? 1 : -1;
    return 0;
  });

  _invCache.filteredInvoices = filtered;

  // Render cards statistics
  const totalInvoices = filtered.length;
  const totalRevenue = filtered.reduce((s, inv) => {
    const pList = invPayments[inv.id] || [];
    return s + pList.reduce((sum, p) => sum + (p.amount || 0), 0) + (inv.advance_payment || 0);
  }, 0);
  const totalOutstanding = filtered.reduce((s, inv) => s + inv.computedBalance, 0);
  const paidCount = filtered.filter(inv => inv.computedStatus === 'Paid').length;
  const partialCount = filtered.filter(inv => inv.computedStatus === 'Partially Paid').length;
  const unpaidCount = filtered.filter(inv => inv.computedStatus === 'Unpaid').length;
  // Every invoice still owing money, not just the partially paid ones — the
  // Unpaid rows are visible now, so they have to be counted here as well or
  // the card contradicts the balances listed directly under it.
  const outstandingCount = filtered.filter(inv => inv.computedBalance > 0).length;

  const elInvoices = document.getElementById('card-total-invoices');
  if (elInvoices) elInvoices.textContent = totalInvoices;
  const elInvoicesSub = document.getElementById('card-total-invoices-sub');
  if (elInvoicesSub) elInvoicesSub.textContent = `${paidCount} Paid · ${partialCount} Partially Paid · ${unpaidCount} Unpaid`;
  const elRevenue = document.getElementById('card-total-revenue');
  if (elRevenue) elRevenue.textContent = formatCurrency(totalRevenue);
  const elOutstanding = document.getElementById('card-outstanding-balance');
  if (elOutstanding) elOutstanding.textContent = formatCurrency(totalOutstanding);
  const elOutstandingSub = document.getElementById('card-outstanding-balance-sub');
  if (elOutstandingSub) elOutstandingSub.textContent = `Across ${outstandingCount} invoice${outstandingCount !== 1 ? 's' : ''}`;

  // Set Count Label
  const countEl = document.getElementById('inv-count');
  if (countEl) countEl.textContent = `${totalInvoices} invoice${totalInvoices !== 1 ? 's' : ''}`;

  // Display all filtered items in a single list
  const items = filtered;

  tbody.innerHTML = items.length === 0
    ? `<tr><td colspan="14" style="text-align:center;padding:48px;color:var(--text-muted);font-weight:500;">No invoices found.<br/><span style="font-size:0.85em;font-weight:400;margin-top:6px;display:block;">Create an invoice or adjust filters to get started.</span></td></tr>`
    : items.map(inv => {
        const o = oMap[inv.order_id];
        const c = o ? cMap[o.customer_id] : null;
        const isCredit = inv.invoice_type === 'Credit';
        const overdue = isCredit && inv.credit_due_date && new Date(inv.credit_due_date) < new Date() && inv.computedBalance > 0;
        
        const typeBadge = isCredit ? '<span class="badge badge-purple">Credit</span>' : '<span class="badge badge-blue">Standard</span>';
        const paidBadge = inv.computedStatus === 'Paid'
          ? '<span class="badge badge-green">Paid</span>'
          : inv.computedStatus === 'Partially Paid'
            ? '<span class="badge badge-orange">Partially Paid</span>'
            : '<span class="badge badge-red">Unpaid</span>';
        const overdueBadge = overdue ? '<span class="badge badge-red" style="margin-top:4px;display:inline-block;">Overdue</span>' : '';

        const balanceColor = inv.computedBalance === 0 ? 'var(--success)' : 'var(--danger)';

        const extraStyle = invoiceActionsVisible ? 'display:inline-flex;gap:4px;' : 'display:none;';

        return `
          <tr style="${overdue ? 'background:rgba(239, 68, 68, 0.04);' : ''} transition:background 0.2s;" class="hover-highlight-row">
            <td style="${overdue ? 'border-left: 4px solid var(--danger);' : ''}white-space:nowrap;font-size:0.85em;"><strong>${inv.invoice_number}</strong></td>
            <td style="white-space:nowrap;font-size:0.85em;">${o?.batch_id || '—'}</td>
            <td>${escapeHtml(o ? getOrderCustomerName(o, cMap) : '—')}</td>
            <td>
              <div style="display:flex;flex-direction:column;align-items:flex-start;">
                ${paidBadge}
                ${overdueBadge}
              </div>
            </td>
            <td style="text-align:right;"><strong>${formatCurrency(inv.total_amount)}</strong></td>
            <td style="text-align:right;"><strong>${formatCurrency(inv.computedPaid)}</strong></td>
            <td style="text-align:right;color:var(--danger);"><strong>${formatCurrency(inv.deduction_amount || 0)}</strong></td>
            <td style="text-align:right;color:${balanceColor};"><strong>${formatCurrency(inv.computedBalance)}</strong></td>
            <td style="position:sticky;right:0;background:var(--card-bg);box-shadow:-2px 0 5px rgba(0,0,0,0.05);z-index:5;">
              <div style="display:inline-flex;align-items:center;gap:4px;flex-wrap:nowrap;">
                <button class="btn btn-primary btn-sm" onclick="viewInvoice(${inv.id})"><i class="fas fa-eye"></i> View</button>
                <span class="invoice-extra-actions" style="${extraStyle}">
                  ${inv.computedPaid > 0 ? `<button class="btn btn-sm" style="background:#ea580c; border-color:#d97706; color:#fff;" onclick="undoPaymentForInvoice(${inv.id})"><i class="fas fa-undo"></i> Undo</button>` : ''}
                </span>
              </div>
            </td>
          </tr>`;
      }).join('');
}

function sortInvoices(field) {
  if (invoiceSortField === field) {
    invoiceSortAsc = !invoiceSortAsc;
  } else {
    invoiceSortField = field;
    invoiceSortAsc = true;
  }
  _refreshInvoicesTable();
}

function getSortIcon(field) {
  if (invoiceSortField !== field) return '<i class="fas fa-sort" style="color:var(--text-muted);opacity:0.4;margin-left:4px;font-size:0.85em;"></i>';
  return invoiceSortAsc 
    ? '<i class="fas fa-sort-up" style="color:var(--primary);margin-left:4px;font-size:0.95em;"></i>' 
    : '<i class="fas fa-sort-down" style="color:var(--primary);margin-left:4px;font-size:0.95em;"></i>';
}

// ── VIEW / PRINT INVOICE ──
// ── Shared invoice/order resolution for bill preview & print ──
// A "Single Invoice" batch payment writes one invoice row (keyed to the first
// of the orders it covers) for every order listed in `batch_order_ids`. Those
// orders had no invoice of their own to begin with — that is the only reason
// they were eligible to be merged (see processBatchPayment in app.js) — so
// looking one up by `order_id` alone finds nothing for all but the first;
// this fallback finds the shared invoice by scanning `batch_order_ids`.
async function _findInvoiceForOrder(orderId) {
  const direct = await _billDB.getInvoiceByOrder(orderId);
  if (direct) return direct;
  const invoices = await _billDB.getInvoices();
  return invoices.find(i => i.batch_order_ids &&
    i.batch_order_ids.split(',').map(Number).includes(Number(orderId))) || null;
}

// Resolves the item list for an invoice. For a "Single Invoice" batch this
// pulls items from every order it covers (not just `inv.order_id`, which is
// only the first of them) and also returns a per-order breakdown — item rows
// plus qty/subtotal totals — so the bill can be rendered grouped by order
// instead of one flat list that hides which items belong to which order.
async function _resolveInvoiceItemGroups(inv, fallbackOrder) {
  if (inv.batch_order_ids) {
    const orderIds = inv.batch_order_ids.split(',').map(Number);
    const ordersList = await Promise.all(orderIds.map(oid => _billDB.getOrder(oid)));
    const activeOrders = ordersList.filter(Boolean);
    // Item lists are fetched in parallel; the groups are still assembled in
    // activeOrders order so the bill's per-order sections keep their sequence.
    const perOrderItems = await Promise.all(activeOrders.map(o => _billDB.getOrderItems(o.id)));
    const items = [];
    const groups = [];
    activeOrders.forEach((o, idx) => {
      const orderItems = perOrderItems[idx];
      orderItems.forEach(item => { item.order_batch_id = o.batch_id; });
      items.push(...orderItems);
      groups.push({
        orderLabel: o.batch_id,
        items: orderItems,
        qtyTotal: orderItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0),
        subtotalTotal: orderItems.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0)
      });
    });
    return { items, groups, orders: activeOrders };
  }
  const itemsOrderId = fallbackOrder ? fallbackOrder.id : inv.order_id;
  const items = itemsOrderId ? await _billDB.getOrderItems(itemsOrderId) : [];
  return { items, groups: [], orders: fallbackOrder ? [fallbackOrder] : [] };
}

async function viewInvoice(id) {
  const inv = await DB.getInvoice(id); if (!inv) return;
  const order = await DB.getOrder(inv.order_id);
  const customerRaw = (order && order.customer_id) ? await DB.getCustomer(order.customer_id) : null;
  const customer = customerRaw || (order ? { hotel_name: getOrderCustomerName(order) } : null);
  // For a "Single Invoice" batch, this pulls items from every order the
  // invoice covers (not just `order`, which is only the first of them) —
  // previously this only ever showed one order's items on a multi-order
  // invoice.
  const { items, groups: batchItemGroups, orders: batchOrders } = await _resolveInvoiceItemGroups(inv, order);
  const payments = await DB.getPaymentsByInvoice(id);

  const settings = {
    company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
    address: await DB.getSetting('address') || '',
    phone: await DB.getSetting('phone') || '',
    email: await DB.getSetting('email') || '',
    footer_message: await DB.getSetting('footer_message') || ''
  };
  const logoData = await DB.getSetting('logo_data');
  const isCredit = inv.invoice_type === 'Credit';

  const fin = Financials.computeInvoiceFinancials(inv, items, payments);
  const totalPaid = fin.totalPaid;
  const balance = fin.balance;
  const discount = fin.discountAmount;
  const deliveryCharge = fin.deliveryCharge;
  const extraPayment = fin.extraPayment;
  const itemsSubtotal = fin.itemsSubtotal;
  const grandTotal = fin.grossInvoiceTotal;
  const deduction = fin.deductionAmount;
  const finalTotal = fin.netPayableTotal;

  const _svcColor = { 'Dry Clean': '#7c3aed', 'Wash & Press': '#0369a1', 'Wash & Dry': '#16a34a' };
  // For a batch invoice, "pending" badges must be computed per-item's own
  // order across every order it covers — a single order's pending list
  // would miss items belonging to the other orders folded into this bill.
  let pendingItemIds = new Set();
  if (batchItemGroups.length > 0) {
    const sets = await Promise.all(batchOrders.map(o => _getPendingItemIdsForOrder(o.id)));
    sets.forEach(s => s.forEach(v => pendingItemIds.add(v)));
  } else if (order) {
    pendingItemIds = await _getPendingItemIdsForOrder(order.id);
  }
  const pendingReturnSummaryHtml = (batchItemGroups.length === 0 && order) ? await _buildPendingReturnSummaryHtml(order) : '';

  const _itemRowHTML = i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(i.item_name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${pendingItemIds.has(String(i.id)) ? '<span style="display:inline-block;background:#facc15;color:#78350f;font-weight:800;font-size:0.85em;width:20px;height:20px;line-height:20px;border-radius:5px;">P</span>' : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:0.82em;font-weight:600;padding:3px 8px;border-radius:5px;background:${_svcColor[i.service_type] || '#64748b'}18;color:${_svcColor[i.service_type] || '#64748b'};">${i.service_type || '—'}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(i.price)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(i.subtotal)}</td>
    </tr>`;

  // Batch invoice: item rows grouped under a heading per order, each group
  // closed with its own Order Total row, followed by one Invoice Total row
  // summing every order's subtotal. Non-batch: the plain flat item list.
  const itemsHTML = batchItemGroups.length > 0
    ? batchItemGroups.map(g => `
        <tr><td colspan="6" style="padding:14px 12px 6px;font-weight:800;font-size:0.95em;color:#1a4d8f;border-top:2px solid #e2e8f0;">Order: ${escapeHtml(g.orderLabel)}</td></tr>
        ${g.items.map(_itemRowHTML).join('')}
        <tr style="background:#f8fafc;">
          <td style="padding:8px 12px;font-weight:700;">Order Total</td>
          <td style="padding:8px 12px;text-align:center;font-weight:700;">${g.qtyTotal}</td>
          <td></td><td></td><td></td>
          <td style="padding:8px 12px;text-align:right;font-weight:800;color:#1a4d8f;">${formatCurrency(g.subtotalTotal)}</td>
        </tr>`).join('') +
      `<tr style="border-top:2px solid #1a4d8f;">
          <td colspan="5" style="padding:12px;text-align:right;font-weight:800;">Invoice Total</td>
          <td style="padding:12px;text-align:right;font-weight:800;color:#16a34a;">${formatCurrency(batchItemGroups.reduce((s, g) => s + g.subtotalTotal, 0))}</td>
        </tr>`
    : items.map(_itemRowHTML).join('');

  const paymentsHTML = payments.map(p => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${formatDate(p.date)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${p.method}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(p.amount)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:var(--text-muted);">${escapeHtml(p.notes || '—')}</td>
    </tr>`).join('');

  const paidStamp = balance <= 0 ? `
    <div style="position:absolute;left:0;bottom:20px;pointer-events:none;z-index:10;">
      <div style="color:#16a34a;font-family:'Playfair Display',serif;font-size:4.5em;font-weight:900;letter-spacing:8px;text-transform:uppercase;opacity:0.25;transform:rotate(-12deg);line-height:1;user-select:none;">PAID</div>
    </div>` : (totalPaid > 0 ? `
    <div style="position:absolute;left:0;bottom:20px;pointer-events:none;z-index:10;">
      <div style="color:#f59e0b;font-family:'Playfair Display',serif;font-size:3em;font-weight:900;letter-spacing:4px;text-transform:uppercase;opacity:0.25;transform:rotate(-12deg);line-height:1;user-select:none;">PARTIALLY PAID</div>
    </div>` : '');

  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:64px;width:64px;object-fit:cover;border-radius:12px;"/>`
    : `<div style="height:64px;width:64px;border-radius:12px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;"><i class="fas fa-soap"></i></div>`;

  const creditBanner = isCredit ? `
    <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="font-size:1.15em;font-weight:800;letter-spacing:0.5px;margin-bottom:4px;"><i class="fas fa-credit-card"></i> &nbsp;CREDIT BILL</div>
        <div style="font-size:0.85em;opacity:0.85;">Payment agreed for a deferred due date</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.78em;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Credit Amount Due</div>
        <div style="font-size:2.2em;font-weight:900;line-height:1;">${formatCurrency(balance)}</div>
        <div style="font-size:0.88em;margin-top:8px;background:rgba(255,255,255,0.15);padding:6px 12px;border-radius:6px;font-weight:700;">
          <i class="fas fa-calendar-alt"></i> &nbsp;Pay By: ${formatDate(inv.credit_due_date)}
        </div>
      </div>
    </div>` : '';

  const invoiceHTML = `
    <div class="invoice-page" id="invoice-print-area" style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:40px 44px;box-shadow:0 4px 32px rgba(0,0,0,0.1);border-radius:4px;">
      ${creditBanner}
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:16px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.65em;font-weight:700;color:#1a4d8f;line-height:1.15;">${escapeHtml(settings.company_name)}</div>
            ${settings.address ? `<div style="font-size:0.83em;color:#64748b;margin-top:5px;">${escapeHtml(settings.address)}</div>` : ''}
            <div style="font-size:0.83em;color:#64748b;margin-top:2px;">${[settings.phone, settings.email].filter(Boolean).map(escapeHtml).join(' | ')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Playfair Display',serif;font-size:2.4em;font-weight:800;color:${isCredit ? '#7c3aed' : '#1a4d8f'};letter-spacing:1px;line-height:1;">${isCredit ? 'CREDIT BILL' : 'INVOICE'}</div>
          <div style="font-size:1em;font-weight:700;color:#374151;margin-top:8px;">${inv.invoice_number}</div>
          <div style="font-size:0.83em;color:#64748b;margin-top:4px;">Issue Date: ${formatDate(inv.issue_date)}</div>
          ${inv.delivery_date ? `<div style="font-size:0.83em;color:#64748b;">Delivery: ${formatDate(inv.delivery_date)}</div>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;">
        <div>
          <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;">Bill To</div>
          ${(() => {
            if (batchItemGroups.length > 0 && inv.batch_invoice_details) {
              const batchDetails = JSON.parse(inv.batch_invoice_details || '[]');
              const customerNames = [...new Set(batchDetails.map(d => d.customerName))];
              return `<div style="font-weight:700;font-size:1.05em;color:#1e293b;line-height:1.4;">${customerNames.map(escapeHtml).join('<br/>')}</div>`;
            }
            return `
              <div style="font-weight:700;font-size:1.05em;color:#1e293b;">${escapeHtml(customer?.hotel_name || (order ? getOrderCustomerName(order) : '—'))}</div>
              ${customer?.address ? `<div style="font-size:0.88em;color:#64748b;margin-top:3px;">${escapeHtml(customer.address)}</div>` : ''}
              ${customer?.contact_person ? `<div style="font-size:0.88em;color:#64748b;">${escapeHtml(customer.contact_person)}</div>` : ''}
              ${customer?.phone ? `<div style="font-size:0.88em;color:#64748b;">${escapeHtml(customer.phone)}</div>` : ''}
            `;
          })()}
        </div>
        <div>
          <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;">Order Info</div>
          ${batchItemGroups.length > 0 ? `
            <div style="font-size:0.9em;color:#64748b;">Order IDs: <strong style="color:#1e293b;">${batchOrders.map(o => o.batch_id).join(', ')}</strong></div>
            <div style="font-size:0.9em;color:#64748b;margin-top:3px;">Invoice Type: Consolidated Batch</div>
          ` : `
            <div style="font-size:0.9em;color:#64748b;">Batch: <strong style="color:#1e293b;">${order?.batch_id || '—'}</strong></div>
            <div style="font-size:0.9em;color:#64748b;margin-top:3px;">Pickup: ${formatDate(order?.pickup_date)}</div>
          `}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
        <thead>
          <tr style="border-bottom:2px solid #1a4d8f;">
            <th style="padding:10px 0;text-align:left;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Item</th>
            <th style="padding:10px 8px;text-align:center;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Qty</th>
            <th style="padding:10px 8px;text-align:center;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Status</th>
            <th style="padding:10px 8px;text-align:left;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Service</th>
            <th style="padding:10px 8px;text-align:right;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Unit Price</th>
            <th style="padding:10px 0;text-align:right;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-top:20px;position:relative;">
        ${paidStamp}
        <div style="width:340px;border-top:2px solid #e2e8f0;padding-top:4px;">
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
            <span style="color:#64748b;">Items Subtotal</span>
            <span style="font-weight:600;">${formatCurrency(itemsSubtotal)}</span>
          </div>
          ${discount > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#64748b;">Discount ${inv.discount_rate ? `(${inv.discount_rate}%)` : ''}</span>
              <span style="color:#16a34a;font-weight:600;">− ${formatCurrency(discount)}</span>
            </div>` : ''}
          ${deliveryCharge > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#64748b;">Delivery Cost</span>
              <span>+ ${formatCurrency(deliveryCharge)}</span>
            </div>` : ''}
          ${extraPayment > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#64748b;">Extra Payment</span>
              <span>+ ${formatCurrency(extraPayment)}</span>
            </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:12px 0;border-top:2px solid #1a4d8f;border-bottom:2px solid #1a4d8f;font-size:1em;font-weight:800;color:#1e293b;">
            <span>Grand Total</span>
            <span>${formatCurrency(grandTotal)}</span>
          </div>
          ${deduction > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;color:#e11d48;font-weight:600;">
              <span>Deductions / Damage</span>
              <span>− ${formatCurrency(deduction)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:0.95em;font-weight:700;color:#1e40af;">
              <span>Final Total Bill</span>
              <span>${formatCurrency(finalTotal)}</span>
            </div>` : ''}
          ${inv.advance_payment > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#16a34a;">Advance Payment</span>
              <span style="color:#16a34a;">− ${formatCurrency(inv.advance_payment)}</span>
            </div>` : ''}
          ${payments.map(p => `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#16a34a;">Payment (${p.method})</span>
              <span style="color:#16a34a;">− ${formatCurrency(p.amount)}</span>
            </div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:4px;border-top:2px solid #1a4d8f;font-size:0.98em;font-weight:800;color:${balance <= 0.009 ? '#16a34a' : '#ef4444'};">
            <span>Balance Due</span>
            <span>${formatCurrency(balance)}</span>
          </div>
        </div>
      </div>

      ${pendingReturnSummaryHtml}

      ${payments.length > 0 ? `
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #f1f5f9;">
          <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;">Payment History</div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid #e2e8f0;">
                <th style="padding:6px 0;text-align:left;font-size:0.78em;color:#94a3b8;font-weight:600;">Date</th>
                <th style="padding:6px 8px;text-align:left;font-size:0.78em;color:#94a3b8;font-weight:600;">Method</th>
                <th style="padding:6px 8px;text-align:right;font-size:0.78em;color:#94a3b8;font-weight:600;">Amount</th>
                <th style="padding:6px 8px;text-align:left;font-size:0.78em;color:#94a3b8;font-weight:600;">Notes</th>
              </tr>
            </thead>
            <tbody>${paymentsHTML}</tbody>
          </table>
        </div>` : ''}

      ${settings.footer_message ? `<div style="margin-top:36px;text-align:center;font-size:0.88em;color:#94a3b8;font-style:italic;">${escapeHtml(settings.footer_message)}</div>` : ''}
    </div>`;

  createModal('view-invoice-modal', `${isCredit ? 'Credit Bill' : 'Invoice'}: ${inv.invoice_number}`, `
    ${invoiceHTML}
    <div class="no-print" style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('view-invoice-modal')">Close [Esc]</button>
      <button class="btn btn-primary" onclick="printInvoice(${inv.id})"><i class="fas fa-print"></i> Print [Ctrl+P]</button>
    </div>`, 'modal-xl');
  showModal('view-invoice-modal');
}

// Bill header settings (company details + logo) are the same for every bill
// in a run, but DB.getSetting is one network round trip each — six per bill.
// Fetching them in parallel speeds up every print; the opt-in cache lets a
// batch run fetch them once instead of once per bill.
let _billSettingsCache = null;
async function _getBillSettings(useCache = false) {
  if (useCache && _billSettingsCache) return _billSettingsCache;
  const [company_name, address, phone, email, footer_message, logo_data] = await Promise.all([
    DB.getSetting('company_name'),
    DB.getSetting('address'),
    DB.getSetting('phone'),
    DB.getSetting('email'),
    DB.getSetting('footer_message'),
    DB.getSetting('logo_data')
  ]);
  const resolved = {
    company_name: company_name || 'Sagacious Washing Center',
    address: address || '',
    phone: phone || '',
    email: email || '',
    footer_message: footer_message || '',
    logo_data
  };
  if (useCache) _billSettingsCache = resolved;
  return resolved;
}

// ── Batch bill lookup memo ────────────────────────────────────────────
// Building one bill costs a chain of round trips (its invoice, its order, its
// customer, its items, its pending/returned flags). Printing N bills used to
// pay that chain N times over, in series — which is what made Batch Print
// slow. Between beginBillBatch()/endBillBatch():
//
//   • primeBillBatch() fetches invoices, items and flags for the WHOLE
//     selection in one bulk query each, and seeds them per order id;
//   • anything not pre-seeded is memoised by id on first use, so a row is
//     fetched at most once per run however many bills reference it;
//   • which in turn makes it safe to build bills in parallel — concurrency
//     no longer multiplies the queries.
//
// Outside a batch every wrapper is a straight pass-through to DB, so
// single-bill printing issues exactly the queries it always did.
let _billBatch = null;   // Map<string, Promise> | null

function beginBillBatch() { _billBatch = new Map(); }
function endBillBatch() { _billBatch = null; _billSettingsCache = null; }

function _memo(key, fetch) {
  if (!_billBatch) return fetch();
  if (!_billBatch.has(key)) _billBatch.set(key, fetch());
  return _billBatch.get(key);
}
function _seed(key, value) { if (_billBatch) _billBatch.set(key, Promise.resolve(value)); }

// Replaces the per-bill query storm with four bulk reads. `orders` is the
// caller's already-loaded order list (the Orders tab has one), so those rows
// cost nothing extra. Failures here are non-fatal: an unseeded key simply
// falls back to its per-order query.
async function primeBillBatch(orderIds, orders) {
  if (!_billBatch) return;
  (orders || []).forEach(o => { if (o && o.id != null) _seed('order:' + o.id, o); });
  if (!orderIds || !orderIds.length) return;

  const group = (rows, key) => {
    const map = new Map();
    (rows || []).forEach(r => {
      const k = r[key];
      if (k == null) return;
      if (!map.has(Number(k))) map.set(Number(k), []);
      map.get(Number(k)).push(r);
    });
    return map;
  };

  try {
    const [invoices, items, flagsSrc, flagsClr] = await Promise.all([
      DB.getInvoicesByOrders(orderIds),
      DB.getOrderItemsByOrders(orderIds),
      DB.getFlagsBySourceOrders(orderIds),
      DB.getFlagsClearedByOrders(orderIds),
      _getBillSettings(true)   // warms the shared company-header cache too
    ]);
    const invByOrder = group(invoices, 'order_id');
    const itemsByOrder = group(items, 'order_id');
    const srcByOrder = group(flagsSrc, 'order_id');
    const clrByOrder = group(flagsClr, 'cleared_in_order_id');

    orderIds.forEach(id => {
      const n = Number(id);
      // Seeding the empty cases matters as much as the populated ones —
      // that's what stops a bill with no items or no flags from firing its
      // own query to rediscover that.
      _seed('invByOrder:' + id, (invByOrder.get(n) || [])[0] || null);
      _seed('items:' + id, itemsByOrder.get(n) || []);
      _seed('flagSrc:' + id, srcByOrder.get(n) || []);
      _seed('flagClr:' + id, clrByOrder.get(n) || []);
    });
  } catch (err) {
    // Nothing seeded → every lookup just takes its normal per-order path.
    console.warn('primeBillBatch: bulk prefetch failed, falling back to per-bill queries', err);
  }
}

const _billDB = {
  getOrder:                id => _memo('order:' + id,      () => DB.getOrder(id)),
  getCustomer:             id => _memo('cust:' + id,       () => DB.getCustomer(id)),
  getOrderItems:           id => _memo('items:' + id,      () => DB.getOrderItems(id)),
  getInvoiceByOrder:       id => _memo('invByOrder:' + id, () => DB.getInvoiceByOrder(id)),
  getPaymentsByInvoice:    id => _memo('pay:' + id,        () => DB.getPaymentsByInvoice(id)),
  getFlagsBySourceOrder:   id => _memo('flagSrc:' + id,    () => DB.getFlagsBySourceOrder(id)),
  getFlagsClearedByOrder:  id => _memo('flagClr:' + id,    () => DB.getFlagsClearedByOrder(id)),
  // The full-table scan behind the batch_order_ids fallback below. Only
  // reached when an order has no invoice of its own, and memoised so a run
  // pays for it at most once instead of once per bill.
  getInvoices:             () => _memo('invoices',         () => DB.getInvoices())
};

// ── Bill body builder ─────────────────────────────────────────────────
// Returns ONLY the bill <div> (no <html>/<head>/<body> wrapper) so the same
// markup can be dropped into a single-invoice print window (printInvoice)
// or repeated, one per page, inside a batch print window
// (batchPrintSelectedOrders in orders.js). Anything that changes here changes
// every bill the app prints — that is the point.
// `includePayments` mirrors the old printInvoice behaviour: a caller that
// hands over an already-resolved invoice OBJECT (Orders tab → Print) prints
// the bill without re-listing individual payment rows, while a caller that
// passes an invoice id (Invoices tab) gets them.
async function buildInvoiceBillHtml(inv, { includePayments = true, cacheSettings = false } = {}) {
  const order = await _billDB.getOrder(inv.order_id);
  // Everything below depends only on `order`, not on each other, so the
  // customer / payments / item lookups go out together rather than in series.
  // For a "Single Invoice" batch, _resolveInvoiceItemGroups pulls items from
  // every order the invoice covers, grouped per order (batchItemGroups),
  // instead of just `inv.order_id`'s items.
  const [customerRaw, payments, itemGroups] = await Promise.all([
    (order && order.customer_id) ? _billDB.getCustomer(order.customer_id) : Promise.resolve(null),
    (inv.id && includePayments) ? _billDB.getPaymentsByInvoice(inv.id) : Promise.resolve([]),
    _resolveInvoiceItemGroups(inv, order)
  ]);
  const customer = customerRaw || (order ? { hotel_name: getOrderCustomerName(order) } : null);
  const { items, groups: batchItemGroups, orders: activeOrders } = itemGroups;

  let orderInfoHTML = '';
  if (inv.batch_order_ids) {
    orderInfoHTML = `
      <div><span style="color:#64748b;">Invoice Number:</span> <strong>${inv.invoice_number}</strong></div>
      <div style="margin-top:4.5px;"><span style="color:#64748b;">Order IDs:</span> <strong>${activeOrders.map(o => o.batch_id).join(', ')}</strong></div>
      <div style="margin-top:4.5px;"><span style="color:#64748b;">Invoice Type:</span> Consolidated Batch</div>
    `;
  } else {
    orderInfoHTML = `
      <div><span style="color:#64748b;">Batch:</span> <strong>${order?.batch_id || '—'}</strong></div>
      <div><span style="color:#64748b;">Pickup:</span> ${formatDate(order?.pickup_date)}</div>
    `;
  }

  const settings = await _getBillSettings(cacheSettings);
  const logoData = settings.logo_data;
  const isCredit = inv.invoice_type === 'Credit';

  const fin = Financials.computeInvoiceFinancials(inv, items, payments);
  const totalPaid = fin.totalPaid;
  const discount = fin.discountAmount;
  const deliveryCharge = fin.deliveryCharge;
  const extraPayment = fin.extraPayment;
  const itemsSubtotal = fin.itemsSubtotal;
  const grandTotal = fin.grossInvoiceTotal;
  const deduction = fin.deductionAmount;
  const finalTotal = fin.netPayableTotal;
  const balance = fin.balance;

  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:64px;width:64px;object-fit:cover;border-radius:12px;"/>`
    : `<div style="height:64px;width:64px;border-radius:12px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;">SW</div>`;

  const _svcColorPrint = { 'Dry Clean': '#7c3aed', 'Wash & Press': '#0369a1', 'Wash & Dry': '#16a34a' };

  // Pending/Returned ledger — P badge + summary sentences. For a
  // consolidated batch invoice, items come from several orders at once
  // (each item already carries its own order_id from order_items), so the
  // badge is computed per-item's own order; the three summary sentences
  // are skipped there since "this bill" doesn't map to one single order.
  let pendingItemIds = new Set();
  if (inv.batch_order_ids) {
    const uniqueOrderIds = [...new Set(items.map(i => i.order_id).filter(Boolean))];
    const sets = await Promise.all(uniqueOrderIds.map(oid => _getPendingItemIdsForOrder(oid)));
    sets.forEach(s => s.forEach(v => pendingItemIds.add(v)));
  }
  // The single-order path needs both of these and neither depends on the
  // other; the memo also collapses their shared getFlagsBySourceOrder call.
  let pendingReturnSummaryHtml = '';
  if (!inv.batch_order_ids && order) {
    [pendingItemIds, pendingReturnSummaryHtml] = await Promise.all([
      _getPendingItemIdsForOrder(order.id),
      _buildPendingReturnSummaryHtml(order)
    ]);
  }

  const _itemRowHTMLPrint = (i, idx) => `
    <tr style="${idx % 2 === 1 ? 'background:#fafafa;' : ''}">
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(i.item_name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${pendingItemIds.has(String(i.id)) ? '<span style="display:inline-block;background:#facc15;color:#78350f;font-weight:800;font-size:0.85em;width:20px;height:20px;line-height:20px;border-radius:5px;">P</span>' : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:0.8em;font-weight:600;padding:3px 8px;border-radius:5px;background:${_svcColorPrint[i.service_type] || '#64748b'}18;color:${_svcColorPrint[i.service_type] || '#64748b'};">${i.service_type || '—'}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatCurrency(i.price)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">${formatCurrency(i.subtotal)}</td>
    </tr>`;

  // Batch invoice ("Single Invoice" across multiple orders): item rows
  // grouped under a heading per order, each group closed with its own Order
  // Total row, followed by one Invoice Total row summing every order's
  // subtotal. Non-batch: the plain flat item list.
  const itemsHTML = batchItemGroups.length > 0
    ? batchItemGroups.map(g => `
        <tr><td colspan="6" style="padding:14px 12px 6px;font-weight:800;font-size:0.95em;color:#1a4d8f;border-top:2px solid #e2e8f0;">Order: ${escapeHtml(g.orderLabel)}</td></tr>
        ${g.items.map(_itemRowHTMLPrint).join('')}
        <tr style="background:#f8fafc;">
          <td style="padding:8px 12px;font-weight:700;">Order Total</td>
          <td style="padding:8px 12px;text-align:center;font-weight:700;">${g.qtyTotal}</td>
          <td></td><td></td><td></td>
          <td style="padding:8px 12px;text-align:right;font-weight:800;color:#1a4d8f;">${formatCurrency(g.subtotalTotal)}</td>
        </tr>`).join('') +
      `<tr style="border-top:2px solid #1a4d8f;">
          <td colspan="5" style="padding:12px;text-align:right;font-weight:800;font-size:1em;">Invoice Total</td>
          <td style="padding:12px;text-align:right;font-weight:800;font-size:1.05em;color:#16a34a;">${formatCurrency(batchItemGroups.reduce((s, g) => s + g.subtotalTotal, 0))}</td>
        </tr>`
    : items.map(_itemRowHTMLPrint).join('');

  const paidStamp = balance <= 0 ? `
    <div style="position:absolute;left:0;bottom:20px;pointer-events:none;z-index:10;">
      <div style="color:#16a34a;font-family:'Playfair Display',serif;font-size:72px;font-weight:900;letter-spacing:8px;text-transform:uppercase;opacity:0.30;transform:rotate(-12deg);line-height:1;user-select:none;">PAID</div>
    </div>` : '';

  const creditBanner = isCredit ? `
    <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="font-size:1.15em;font-weight:800;margin-bottom:4px;">CREDIT BILL</div>
        <div style="font-size:0.85em;opacity:0.85;">Payment agreed for a deferred due date</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.78em;opacity:0.8;text-transform:uppercase;margin-bottom:4px;">Credit Amount Due</div>
        <div style="font-size:2.2em;font-weight:900;line-height:1;">${formatCurrency(balance)}</div>
        <div style="font-size:0.88em;margin-top:8px;background:rgba(255,255,255,0.15);padding:6px 12px;border-radius:6px;font-weight:700;">
          Pay By: ${formatDate(inv.credit_due_date)}
        </div>
      </div>
    </div>` : '';

  const summaryHTML = `
    <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <span style="color:#64748b;">Items Subtotal</span><strong>${formatCurrency(itemsSubtotal)}</strong>
    </div>
    ${discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;">
      <span>Discount (${inv.discount_rate || 0}%)</span><span>- ${formatCurrency(discount)}</span>
    </div>` : ''}
    ${deliveryCharge > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <span style="color:#64748b;">Delivery Charge</span><span>+ ${formatCurrency(deliveryCharge)}</span>
    </div>` : ''}
    ${extraPayment > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <span style="color:#64748b;">Extra Payment</span><span>+ ${formatCurrency(extraPayment)}</span>
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:${deduction > 0 ? '1px' : '2px'} solid #e5e7eb;font-weight:700;">
      <span>Grand Total</span><span>${formatCurrency(grandTotal)}</span>
    </div>
    ${deduction > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:2px solid #ef4444;font-weight:700;color:#ef4444;background:#fef2f2;">
      <span>Deduction</span><span>- ${formatCurrency(deduction)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:2px solid #e5e7eb;font-weight:700;color:#1e40af;">
      <span>Final Total Bill</span><span>${formatCurrency(finalTotal)}</span>
    </div>
    ` : ''}
    ${inv.advance_payment > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;">
      <span>Advance Payment</span><span>- ${formatCurrency(inv.advance_payment)}</span>
    </div>` : ''}
    ${payments.map(p => `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;">
        <span>Payment (${p.method})</span><span>- ${formatCurrency(p.amount)}</span>
      </div>`).join('')}
    <div style="display:flex;justify-content:space-between;padding:10px 12px;border-top:2px solid #1a4d8f;font-weight:800;color:${balance <= 0.009 ? '#16a34a' : '#ef4444'};">
      <span>Balance Due</span><span>${formatCurrency(balance)}</span>
    </div>`;

  const billHTML = `
    <div style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:40px 44px;">
      ${creditBanner}
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:14px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${escapeHtml(settings.company_name)}</div>
            ${settings.address ? `<div style="font-size:0.85em;color:#64748b;margin-top:4px;">${escapeHtml(settings.address)}</div>` : ''}
            <div style="font-size:0.85em;color:#64748b;">${[settings.phone, settings.email].filter(Boolean).map(escapeHtml).join(' | ')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:2em;font-weight:700;color:${isCredit ? '#7c3aed' : '#1a4d8f'};font-family:'Playfair Display',serif;">${isCredit ? 'CREDIT BILL' : 'INVOICE'}</div>
          <div style="font-size:0.95em;color:#374151;margin-top:6px;"><strong>${inv.invoice_number}</strong></div>
          <div style="font-size:0.85em;color:#64748b;margin-top:4px;">Issue Date: ${formatDate(inv.issue_date)}</div>
          ${inv.delivery_date ? `<div style="font-size:0.85em;color:#64748b;">Delivery: ${formatDate(inv.delivery_date)}</div>` : ''}
        </div>
      </div>

      <div style="font-size:12px;">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
        <div style="background:#f8fafc;padding:16px;border-radius:10px;">
          <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Bill To</div>
          ${(() => {
            if (inv.batch_invoice_details) {
              const batchDetails = JSON.parse(inv.batch_invoice_details || '[]');
              const customerNames = [...new Set(batchDetails.map(d => d.customerName))];
              return `<div style="font-weight:700;font-size:1.05em;color:#1e293b;line-height:1.4;">${customerNames.map(escapeHtml).join('<br/>')}</div>`;
            } else {
              return `
                <div style="font-weight:700;font-size:1.05em;">${escapeHtml(customer?.hotel_name || (order ? getOrderCustomerName(order) : '—'))}</div>
                <div style="color:#64748b;font-size:0.9em;margin-top:4px;">${escapeHtml(customer?.address || '')}</div>
                <div style="color:#64748b;font-size:0.9em;">${escapeHtml(customer?.contact_person || '')}</div>
                <div style="color:#64748b;font-size:0.9em;">${escapeHtml(customer?.phone || '')}</div>
              `;
            }
          })()}
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:10px;">
          <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Order Info</div>
          ${orderInfoHTML}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#1a4d8f;color:#fff;">
            <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Item</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;">Qty</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;">Status</th>
            <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Service</th>
            <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Unit Price</th>
            <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-bottom:24px;position:relative;">
        ${paidStamp}
        <div style="min-width:300px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          ${summaryHTML}
        </div>
      </div>

      ${pendingReturnSummaryHtml}

      ${settings.footer_message ? `<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;font-size:0.9em;color:#64748b;font-style:italic;">${escapeHtml(settings.footer_message)}</div>` : ''}
    </div><!-- /font-size:12px -->
    </div><!-- /bill root -->`;
  return { html: billHTML, order, invoice: inv };
}

async function printInvoice(id) {
  showProcessingOverlay('Generating Invoice', 'Preparing print layout...');
  try {
    let inv;
    if (id && typeof id === 'object') {
      inv = id;
    } else {
      inv = await DB.getInvoice(id);
    }
    if (!inv) return toast('Invoice not found', 'error');

    const { html, order } = await buildInvoiceBillHtml(inv, { includePayments: typeof id !== 'object' });
    Print.openPrintWindow(html, `Order_Print_${order?.batch_id || inv.invoice_number}`);
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// BILL PREVIEW — shows invoice as rendered bill inside a modal (no print dialog)
// Used by "View" button in Orders Tab and Customer Profile
// ─────────────────────────────────────────────
async function previewInvoiceByOrder(orderId) {
  showProcessingOverlay('Loading Bill', 'Preparing bill preview...');
  try {
    const order = await DB.getOrder(orderId);
    if (!order) return toast('Order not found', 'error');

    // A "Single Invoice" batch payment folds this order's own invoice into
    // a shared one keyed to a different order — look that up before
    // assuming this order has no invoice at all.
    let inv = await _findInvoiceForOrder(orderId);
    if (!inv) {
      const orderItems = await DB.getOrderItems(orderId);
      const itemsSubtotal = orderItems.reduce((s, i) => s + (i.subtotal || 0), 0);
      inv = {
        order_id: order.id,
        invoice_number: order.batch_id,
        invoice_type: 'Standard',
        advance_payment: order.advance_payment || 0,
        discount_amount: order.discount_amount || 0,
        discount_rate: order.discount_rate || 0,
        delivery_charge: order.delivery_charge || 0,
        extra_payment: order.extra_payment || 0,
        subtotal_before_discount: itemsSubtotal,
        total_amount: order.total_amount,
        deduction_amount: 0,
        batch_order_ids: null,
        payment_date: null,
        issue_date: (order.pickup_date || order.created_at || '').slice(0, 10),
        delivery_date: order.delivery_date || '',
        paid_status: 'Unpaid'
      };
    }

    // Build the same bill HTML used for printing
    const customerRaw = order.customer_id ? await DB.getCustomer(order.customer_id) : null;
    const customer = customerRaw || { hotel_name: getOrderCustomerName(order) };
    const payments = (inv.id && typeof inv.id !== 'undefined') ? await DB.getPaymentsByInvoice(inv.id) : [];
    // If `inv` is the shared invoice for a "Single Invoice" batch, this
    // pulls items from every order it covers, not just this one.
    const { items, groups: batchItemGroups, orders: batchOrders } = await _resolveInvoiceItemGroups(inv, order);

    const settings = {
      company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
      address:      await DB.getSetting('address')      || '',
      phone:        await DB.getSetting('phone')        || '',
      email:        await DB.getSetting('email')        || '',
      footer_message: await DB.getSetting('footer_message') || ''
    };
    const logoData = await DB.getSetting('logo_data');
    const isCredit = inv.invoice_type === 'Credit';

    const fin = Financials.computeInvoiceFinancials(inv, items, payments);
    const discount       = fin.discountAmount;
    const deliveryCharge = fin.deliveryCharge;
    const extraPayment   = fin.extraPayment;
    const itemsSubtotal  = fin.itemsSubtotal;
    const grandTotal     = fin.grossInvoiceTotal;
    const deduction      = fin.deductionAmount;
    const finalTotal     = fin.netPayableTotal;
    const balance        = fin.balance;

    const logoHTML = logoData
      ? `<img src="${logoData}" style="height:64px;width:64px;object-fit:cover;border-radius:12px;"/>`
      : `<div style="height:64px;width:64px;border-radius:12px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;">SW</div>`;

    const _svcColorPrint = { 'Dry Clean': '#7c3aed', 'Wash & Press': '#0369a1', 'Wash & Dry': '#16a34a' };
    let pendingItemIds = new Set();
    if (batchItemGroups.length > 0) {
      const sets = await Promise.all(batchOrders.map(o => _getPendingItemIdsForOrder(o.id)));
      sets.forEach(s => s.forEach(v => pendingItemIds.add(v)));
    } else {
      pendingItemIds = await _getPendingItemIdsForOrder(order.id);
    }
    const pendingReturnSummaryHtml = batchItemGroups.length === 0 ? await _buildPendingReturnSummaryHtml(order) : '';

    const _itemRowHTMLPreview = (i, idx) => `
      <tr style="${idx % 2 === 1 ? 'background:#fafafa;' : ''}">
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(i.item_name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${i.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${pendingItemIds.has(String(i.id)) ? '<span style="display:inline-block;background:#facc15;color:#78350f;font-weight:800;font-size:0.85em;width:20px;height:20px;line-height:20px;border-radius:5px;">P</span>' : ''}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:0.8em;font-weight:600;padding:3px 8px;border-radius:5px;background:${(_svcColorPrint[i.service_type] || '#64748b')}18;color:${_svcColorPrint[i.service_type] || '#64748b'};">${i.service_type || '—'}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatCurrency(i.price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">${formatCurrency(i.subtotal)}</td>
      </tr>`;

    const itemsHTML = batchItemGroups.length > 0
      ? batchItemGroups.map(g => `
          <tr><td colspan="6" style="padding:14px 12px 6px;font-weight:800;font-size:0.95em;color:#1a4d8f;border-top:2px solid #e2e8f0;">Order: ${escapeHtml(g.orderLabel)}</td></tr>
          ${g.items.map(_itemRowHTMLPreview).join('')}
          <tr style="background:#f8fafc;">
            <td style="padding:8px 12px;font-weight:700;">Order Total</td>
            <td style="padding:8px 12px;text-align:center;font-weight:700;">${g.qtyTotal}</td>
            <td></td><td></td><td></td>
            <td style="padding:8px 12px;text-align:right;font-weight:800;color:#1a4d8f;">${formatCurrency(g.subtotalTotal)}</td>
          </tr>`).join('') +
        `<tr style="border-top:2px solid #1a4d8f;">
            <td colspan="5" style="padding:12px;text-align:right;font-weight:800;font-size:1em;">Invoice Total</td>
            <td style="padding:12px;text-align:right;font-weight:800;font-size:1.05em;color:#16a34a;">${formatCurrency(batchItemGroups.reduce((s, g) => s + g.subtotalTotal, 0))}</td>
          </tr>`
      : items.map(_itemRowHTMLPreview).join('');

    const summaryHTML = `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#64748b;">Items Subtotal</span><strong>${formatCurrency(itemsSubtotal)}</strong>
      </div>
      ${discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;">
        <span>Discount (${inv.discount_rate || 0}%)</span><span>- ${formatCurrency(discount)}</span>
      </div>` : ''}
      ${deliveryCharge > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#64748b;">Delivery Charge</span><span>+ ${formatCurrency(deliveryCharge)}</span>
      </div>` : ''}
      ${extraPayment > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <span style="color:#64748b;">Extra Payment</span><span>+ ${formatCurrency(extraPayment)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:${deduction > 0 ? '1px' : '2px'} solid #e5e7eb;font-weight:700;">
        <span>Grand Total</span><span>${formatCurrency(grandTotal)}</span>
      </div>
      ${deduction > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:2px solid #ef4444;font-weight:700;color:#ef4444;background:#fef2f2;">
        <span>Deduction</span><span>- ${formatCurrency(deduction)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:2px solid #e5e7eb;font-weight:700;color:#1e40af;">
        <span>Final Total Bill</span><span>${formatCurrency(finalTotal)}</span>
      </div>` : ''}
      ${inv.advance_payment > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;">
        <span>Advance Payment</span><span>- ${formatCurrency(inv.advance_payment)}</span>
      </div>` : ''}
      ${payments.map(p => `
        <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;">
          <span>Payment (${p.method})</span><span>- ${formatCurrency(p.amount)}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 12px;border-top:2px solid #1a4d8f;font-weight:800;color:${balance <= 0.009 ? '#16a34a' : '#ef4444'};">
        <span>Balance Due</span><span>${formatCurrency(balance)}</span>
      </div>`;

    const paidStamp = balance <= 0 ? `
      <div style="position:absolute;left:0;bottom:20px;pointer-events:none;z-index:10;">
        <div style="color:#16a34a;font-family:'Playfair Display',serif;font-size:72px;font-weight:900;letter-spacing:8px;text-transform:uppercase;opacity:0.30;transform:rotate(-12deg);line-height:1;user-select:none;">PAID</div>
      </div>` : '';

    const orderInfoHTML = batchItemGroups.length > 0 ? `
      <div><span style="color:#64748b;">Order IDs:</span> <strong>${batchOrders.map(o => o.batch_id).join(', ')}</strong></div>
      <div style="margin-top:4px;"><span style="color:#64748b;">Invoice Type:</span> Consolidated Batch</div>` : `
      <div><span style="color:#64748b;">Batch:</span> <strong>${order?.batch_id || '—'}</strong></div>
      <div style="margin-top:4px;"><span style="color:#64748b;">Pickup:</span> ${formatDate(order?.pickup_date)}</div>`;

    // Full bill HTML identical to printInvoice (but WITHOUT the window.print script)
    const billHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;line-height:1.5;}
      </style>
    </head><body>
      <div style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:40px 44px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
          <div style="display:flex;align-items:center;gap:14px;">
            ${logoHTML}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${escapeHtml(settings.company_name)}</div>
              ${settings.address ? `<div style="font-size:0.85em;color:#64748b;margin-top:4px;">${escapeHtml(settings.address)}</div>` : ''}
              <div style="font-size:0.85em;color:#64748b;">${[settings.phone, settings.email].filter(Boolean).map(escapeHtml).join(' | ')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:2em;font-weight:700;color:${isCredit ? '#7c3aed' : '#1a4d8f'};font-family:'Playfair Display',serif;">${isCredit ? 'CREDIT BILL' : 'INVOICE'}</div>
            <div style="font-size:0.95em;color:#374151;margin-top:6px;"><strong>${inv.invoice_number}</strong></div>
            <div style="font-size:0.85em;color:#64748b;margin-top:4px;">Issue Date: ${formatDate(inv.issue_date)}</div>
            ${inv.delivery_date ? `<div style="font-size:0.85em;color:#64748b;">Delivery: ${formatDate(inv.delivery_date)}</div>` : ''}
          </div>
        </div>

        <div style="font-size:12px;">
          <!-- Bill To + Order Info -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
            <div style="background:#f8fafc;padding:16px;border-radius:10px;">
              <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Bill To</div>
              ${(() => {
                if (batchItemGroups.length > 0 && inv.batch_invoice_details) {
                  const batchDetails = JSON.parse(inv.batch_invoice_details || '[]');
                  const customerNames = [...new Set(batchDetails.map(d => d.customerName))];
                  return `<div style="font-weight:700;font-size:1.05em;line-height:1.4;">${customerNames.map(escapeHtml).join('<br/>')}</div>`;
                }
                return `
                  <div style="font-weight:700;font-size:1.05em;">${escapeHtml(customer?.hotel_name || getOrderCustomerName(order) || '—')}</div>
                  <div style="color:#64748b;font-size:0.9em;margin-top:4px;">${escapeHtml(customer?.address || '')}</div>
                  <div style="color:#64748b;font-size:0.9em;">${escapeHtml(customer?.contact_person || '')}</div>
                  <div style="color:#64748b;font-size:0.9em;">${escapeHtml(customer?.phone || '')}</div>
                `;
              })()}
            </div>
            <div style="background:#f8fafc;padding:16px;border-radius:10px;">
              <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Order Info</div>
              ${orderInfoHTML}
            </div>
          </div>

          <!-- Items Table -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="background:#1a4d8f;color:#fff;">
                <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Item</th>
                <th style="padding:10px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;">Qty</th>
                <th style="padding:10px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;">Status</th>
                <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Service</th>
                <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHTML || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#64748b;">No items on this order</td></tr>`}</tbody>
          </table>

          <!-- Summary -->
          <div style="display:flex;justify-content:flex-end;margin-bottom:24px;position:relative;">
            ${paidStamp}
            <div style="min-width:320px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              ${summaryHTML}
            </div>
          </div>

          ${pendingReturnSummaryHtml}

          ${settings.footer_message ? `<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;font-size:0.9em;color:#64748b;font-style:italic;">${escapeHtml(settings.footer_message)}</div>` : ''}
        </div>
      </div>
    </body></html>`;

    hideProcessingOverlay();

    // Render in full-height modal via iframe
    const modalId = 'bill-preview-modal';
    const existing = document.getElementById(modalId + '-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId + '-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px;backdrop-filter:blur(4px);';

    overlay.innerHTML = `
      <div style="background:var(--card-bg);border-radius:18px;width:100%;max-width:900px;height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 80px rgba(0,0,0,0.35);overflow:hidden;">
        <!-- Modal header toolbar -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--card-bg);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:9px;background:rgba(26,77,143,0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;">
              <i class="fas fa-file-invoice"></i>
            </div>
            <div>
              <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.05em;color:var(--text);">Bill Preview</div>
              <div style="font-size:0.78em;color:var(--text-muted);">Order ${order.batch_id}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${window.canEditOrders && canEditOrders() ? `<button onclick="document.getElementById('${modalId}-overlay').remove();showEditOrderModal(${order.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i> Edit Order</button>` : ''}
            ${window.canEditOrders && canEditOrders() ? `<button onclick="document.getElementById('${modalId}-overlay').remove();showMarkFlagModal(${order.id},'pending')" class="btn btn-secondary btn-sm" style="color:#92400e;"><i class="fas fa-hourglass-half"></i> Mark Pending</button>` : ''}
            ${window.canMarkReturned && canMarkReturned() ? `<button onclick="document.getElementById('${modalId}-overlay').remove();showMarkFlagModal(${order.id},'returned')" class="btn btn-secondary btn-sm" style="color:#7c2d12;"><i class="fas fa-rotate-left"></i> Mark Returned</button>` : ''}
            <button onclick="document.getElementById('${modalId}-overlay').remove();printInvoiceByOrder(${orderId})" class="btn btn-primary btn-sm"><i class="fas fa-print"></i> Print Bill</button>
            <button onclick="document.getElementById('${modalId}-overlay').remove()" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:7px 12px;cursor:pointer;color:var(--text-muted);font-size:0.9em;display:inline-flex;align-items:center;gap:5px;"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <!-- Scrollable Bill Preview -->
        <div style="flex:1;overflow:hidden;background:#e8ecf0;padding:16px;">
          <iframe id="${modalId}-frame" style="width:100%;height:100%;border:none;border-radius:10px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.12);" scrolling="yes"></iframe>
        </div>
      </div>`;

    // Close on overlay background click
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    // Close on Escape
    const escHandler = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);

    // Write bill HTML into the iframe
    const frame = document.getElementById(modalId + '-frame');
    frame.contentDocument.open();
    frame.contentDocument.write(billHTML);
    frame.contentDocument.close();

  } catch (err) {
    hideProcessingOverlay();
    console.error('previewInvoiceByOrder error:', err);
    toast('Could not load bill preview', 'error');
  }
}

// ── STANDARD INVOICE with discount + delivery ──
async function generateInvoiceForOrder(orderId) {
  showProcessingOverlay('Generating Invoice', 'Creating invoice for order...');
  try {
  const order = await DB.getOrder(orderId); if (!order) { hideProcessingOverlay(); return toast('Order not found', 'error'); }
  const items = await DB.getOrderItems(orderId);
  if (!items.length) return toast('Add items to this order first', 'warning');

  let inv = await DB.getInvoiceByOrder(orderId);
  if (!inv) {
    const itemsSubtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
    const invNum = await DB.generateInvoiceNumber();
    // Credit Bills were removed (HighIssues.md H-01) — every invoice
    // generated here is Standard.
    const invId = await DB.addInvoice({
      order_id: orderId,
      invoice_number: invNum,
      issue_date: new Date().toISOString(),
      delivery_date: order.delivery_date,
      invoice_type: 'Standard',
      total_amount: order.total_amount || 0,
      advance_payment: order.advance_payment || 0,
      balance: Math.max(0, (order.total_amount || 0) - (order.advance_payment || 0)),
      paid_status: (order.advance_payment || 0) >= (order.total_amount || 0) ? 'Paid' : 'Unpaid',
      discount_rate: 0,
      discount_amount: 0,
      delivery_charge: Math.max(0, (order.total_amount || 0) - itemsSubtotal),
      subtotal_before_discount: itemsSubtotal
    });
    inv = { id: invId };
    toast('Invoice created');
    refreshCustomerDetailForOrder(orderId);
  }
  viewInvoice(inv.id);
  } finally {
    hideProcessingOverlay();
  }
}

// Kept for compatibility
async function saveGeneratedInvoice(orderId, subtotal) {
  const order = await DB.getOrder(orderId);
  let inv = await DB.getInvoiceByOrder(orderId);
  if (!inv) {
    const invNum = await DB.generateInvoiceNumber();
    const invId = await DB.addInvoice({
      order_id: orderId,
      invoice_number: invNum,
      issue_date: new Date().toISOString(),
      delivery_date: order?.delivery_date,
      invoice_type: 'Standard',
      total_amount: subtotal,
      advance_payment: order?.advance_payment || 0,
      balance: Math.max(0, subtotal - (order?.advance_payment || 0)),
      paid_status: (order?.advance_payment || 0) >= subtotal ? 'Paid' : 'Unpaid',
      discount_rate: 0,
      discount_amount: 0,
      delivery_charge: 0,
      subtotal_before_discount: subtotal
    });
    inv = { id: invId };
    refreshCustomerDetailForOrder(orderId);
  }
  toast('Invoice generated!');
  navigate('invoices');
  setTimeout(() => viewInvoice(inv.id), 200);
}

async function showInvoiceForOrder(orderId) {
  return generateInvoiceForOrder(orderId);
}

// ── PAYMENT MODAL ──
async function showPaymentModal(invoiceId) {
  const inv = await DB.getInvoice(invoiceId); if (!inv) return;
  const payments = await DB.getPaymentsByInvoice(invoiceId);
  const fin = Financials.computeInvoiceFinancials(inv, [], payments);
  const totalPaid = fin.totalPaid;
  const balance = fin.balance;
  const methodOpts = PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('');

  createModal('payment-modal', 'Record Payment', `
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="btn btn-sm" id="pay-opt-standard" onclick="selectPayOption('standard')" style="background:var(--success);color:#fff;border-color:var(--success);font-weight:600;"><i class="fas fa-wallet"></i> Standard Payment</button>
      <button class="btn btn-sm" id="pay-opt-deduct" onclick="selectPayOption('deduct')" style="background:var(--secondary);color:var(--text);border-color:var(--border);font-weight:600;"><i class="fas fa-cut"></i> Pay with Deductions</button>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;background:var(--bg);padding:14px;border-radius:10px;">
      <div><div class="form-label">Invoice Total</div><div style="font-weight:700;">${formatCurrency(inv.total_amount)}</div></div>
      <div><div class="form-label">Total Paid So Far</div><div style="font-weight:700;color:var(--success);">${formatCurrency(totalPaid)}</div></div>
      <div><div class="form-label">Remaining Due</div><div style="font-weight:700;color:var(--danger);" id="lbl-remaining-due">${formatCurrency(balance)}</div></div>
    </div>

    <!-- Standard Section -->
    <div id="standard-pay-section">
      <div class="form-group"><label class="form-label">Payment Amount (LKR) *</label>
        <input type="number" class="form-input" id="pay-amount" placeholder="Enter amount..." min="0.01" step="0.01" value="${balance.toFixed(2)}"/></div>
    </div>

    <!-- Deductions Section -->
    <div id="deductions-pay-section" style="display:none; border-top: 1.5px dashed var(--border); padding-top: 14px; margin-top: 14px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;"><label class="form-label" style="color:var(--danger); font-weight:700;"><i class="fas fa-scissors"></i> Deduction Amount (LKR) *</label>
          <input type="number" class="form-input" id="pay-deduct-amount" placeholder="e.g. 1500" min="0" max="${balance}" step="0.01" oninput="recalcDeductionBalance(${balance})"/></div>
        <div class="form-group" style="margin:0;"><label class="form-label">Reason for Deduction *</label>
          <input class="form-input" id="pay-deduct-reason" placeholder="e.g. Damaged item discount"/></div>
      </div>
      
      <div id="deduct-calc-box" style="background:#fef2f2; border:1px solid #fca5a5; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:0.9em; display:flex; flex-direction:column; gap:4px; font-weight:600;">
        <div style="display:flex; justify-content:space-between;"><span>Remaining Due:</span> <span style="color:var(--text);">${formatCurrency(balance)}</span></div>
        <div style="display:flex; justify-content:space-between; color:#ef4444;"><span>Minus Deduction:</span> <span id="lbl-calc-deduct">- LKR 0.00</span></div>
        <div style="display:flex; justify-content:space-between; border-top:1px solid #fca5a5; padding-top:6px; font-weight:700; font-size:1.05em; color:#1e40af;">
          <span>Final Payment Amount:</span> <span id="lbl-calc-final">${formatCurrency(balance)}</span>
        </div>
      </div>
    </div>

    <div class="form-group"><label class="form-label">Paying Date *</label>
      <input type="date" class="form-input" id="pay-date" value="${today()}" max="${today()}"/></div>
    <div class="form-group"><label class="form-label">Payment Method</label>
      <select class="form-input form-select" id="pay-method">${methodOpts}</select></div>
    <div class="form-group"><label class="form-label">Notes</label>
      <input class="form-input" id="pay-notes" placeholder="Optional notes"/></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
      <button class="btn btn-secondary" onclick="hideModal('payment-modal')">Cancel [Esc]</button>
      <button class="btn btn-success" id="btn-submit-payment" onclick="submitRecordedPayment(${invoiceId},${balance})"><i class="fas fa-check"></i> Record Payment [Enter]</button>
    </div>`);
  showPaymentModalFixFocus();
}

function showPaymentModalFixFocus() {
  showModal('payment-modal');
  setTimeout(() => document.getElementById('pay-amount')?.focus(), 80);
}

let currentPayOption = 'standard';

function selectPayOption(type) {
  currentPayOption = type;
  const standardSec = document.getElementById('standard-pay-section');
  const deductSec = document.getElementById('deductions-pay-section');
  const optStandard = document.getElementById('pay-opt-standard');
  const optDeduct = document.getElementById('pay-opt-deduct');
  
  if (type === 'standard') {
    if(standardSec) standardSec.style.display = 'block';
    if(deductSec) deductSec.style.display = 'none';
    if(optStandard) {
      optStandard.style.background = 'var(--success)';
      optStandard.style.borderColor = 'var(--success)';
      optStandard.style.color = '#fff';
    }
    if(optDeduct) {
      optDeduct.style.background = 'var(--secondary)';
      optDeduct.style.borderColor = 'var(--border)';
      optDeduct.style.color = 'var(--text)';
    }
    document.getElementById('pay-amount')?.focus();
  } else {
    if(standardSec) standardSec.style.display = 'none';
    if(deductSec) deductSec.style.display = 'block';
    if(optStandard) {
      optStandard.style.background = 'var(--secondary)';
      optStandard.style.borderColor = 'var(--border)';
      optStandard.style.color = 'var(--text)';
    }
    if(optDeduct) {
      optDeduct.style.background = '#8b5cf6';
      optDeduct.style.borderColor = '#7c3aed';
      optDeduct.style.color = '#fff';
    }
    document.getElementById('pay-deduct-amount')?.focus();
  }
}

function recalcDeductionBalance(balance) {
  const deductInput = document.getElementById('pay-deduct-amount');
  const deductAmount = parseFloat(deductInput.value) || 0;
  
  const lblCalcDeduct = document.getElementById('lbl-calc-deduct');
  const lblCalcFinal = document.getElementById('lbl-calc-final');
  
  if(lblCalcDeduct) lblCalcDeduct.textContent = `- LKR ${deductAmount.toFixed(2)}`;
  
  const finalAmount = Math.max(0, balance - deductAmount);
  if(lblCalcFinal) lblCalcFinal.textContent = `LKR ${finalAmount.toFixed(2)}`;
}

// A "Single Invoice" batch payment stores every order it covers in
// batch_order_ids and only the first in order_id (see invoice creation in
// processBatchPayment) — updating just inv.order_id left every other order
// in the batch stuck Unpaid in the Orders list and Pay Now even though the
// invoice covering them was fully paid (HighIssues.md H-09). Push the same
// order fields to every order the invoice actually covers.
async function _applyOrderUpdateForInvoice(inv, orderData) {
  if (inv.batch_order_ids) {
    const orderIds = inv.batch_order_ids.split(',').map(Number);
    for (const oId of orderIds) {
      await DB.updateOrder(oId, orderData);
      refreshCustomerDetailForOrder(oId);
    }
  } else {
    await DB.updateOrder(inv.order_id, orderData);
    refreshCustomerDetailForOrder(inv.order_id);
  }
}

async function submitRecordedPayment(invoiceId, balance) {
  let paymentDateISO;
  try {
    paymentDateISO = resolvePaymentTimestamp('pay-date');
  } catch (err) {
    return toast(err.message, 'error');
  }

  if (currentPayOption === 'standard') {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;
    const notes = document.getElementById('pay-notes').value;
    if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');

    await DB.addPayment({ invoice_id: invoiceId, amount, method, notes, date: paymentDateISO });
    const inv = await DB.getInvoice(invoiceId);
    const payments = await DB.getPaymentsByInvoice(invoiceId);
    // Canonical calc — the old manual `newBalance <= 0 ? 'Paid' : 'Unpaid'`
    // check never recognized 'Partially Paid', so a partial payment recorded
    // here silently left both the invoice and its order stuck on 'Unpaid'.
    const fin = Financials.computeInvoiceFinancials(inv, [], payments);
    const paidStatus = fin.status;

    await DB.updateInvoice(invoiceId, {
      balance: fin.balance,
      paid_status: paidStatus,
      payment_date: paymentDateISO
    });
    await _applyOrderUpdateForInvoice(inv, {
      status: paidStatus,
      payment_date: paymentDateISO
    });

    hideModal('payment-modal');
    toast(`Payment of ${formatCurrency(amount)} recorded!`);
    _refreshInvoicesTable();

    if (paidStatus === 'Paid') {
      setTimeout(() => printInvoice(invoiceId), 300);
    }
  } else {
    const deductInput = document.getElementById('pay-deduct-amount');
    const deductionAmount = parseFloat(deductInput.value) || 0;
    const reason = document.getElementById('pay-deduct-reason').value.trim() || 'No reason provided';
    const method = document.getElementById('pay-method').value;
    const notes = document.getElementById('pay-notes').value.trim() || 'Paid with Deductions';

    if (deductionAmount <= 0) return toast('Deduction amount must be greater than zero', 'error');
    if (deductionAmount > balance) return toast('Deduction cannot exceed remaining due balance', 'error');

    const inv = await DB.getInvoice(invoiceId);

    await DB.addDeduction({
      invoice_id: invoiceId,
      invoice_number: inv.invoice_number,
      original_amount: inv.total_amount,
      deduction_amount: deductionAmount,
      final_amount: inv.total_amount - deductionAmount,
      reason: reason
    });

    const payAmount = Math.max(0, balance - deductionAmount);
    if (payAmount > 0) {
      await DB.addPayment({
        invoice_id: invoiceId,
        amount: payAmount,
        method: method,
        notes: `Final payment after deduction (Reason: ${reason}). Notes: ${notes}`,
        date: paymentDateISO
      });
    }

    await DB.updateInvoice(invoiceId, {
      deduction_amount: (inv.deduction_amount || 0) + deductionAmount,
      balance: 0,
      paid_status: 'Paid',
      payment_date: paymentDateISO
    });

    await _applyOrderUpdateForInvoice(inv, {
      status: 'Paid',
      payment_date: paymentDateISO
    });

    hideModal('payment-modal');
    toast('Recorded deduction and finalized invoice payment!');
    _refreshInvoicesTable();

    setTimeout(() => printInvoice(invoiceId), 300);
  }
}

// ── UNDO PAYMENT (REVERSE PAYMENTS) ──
// onDone is optional — passed by undoRecentAction() (app.js) so the Recent
// Actions dispatcher can mark that log entry undone only after this actually
// succeeds, without stacking a second confirm dialog on top of this one.
async function undoPaymentForInvoice(invoiceId, onDone) {
  confirmDialog('Are you sure you want to undo payment for this invoice? All recorded payments will be deleted and the status reverted.', async () => {
    try {
      const inv = await DB.getInvoice(invoiceId);
      if (!inv) return toast('Invoice not found', 'error');

      // Delete payments
      await DB.deletePaymentsForInvoice(invoiceId);

      // Undo any "Pay with Deductions" applied to this invoice too
      // (HighIssues.md H-05) — leaving deduction_amount in place understated
      // the restored balance by exactly that amount (the invoice could never
      // be collected in full again through the UI), and the Deductions
      // Register kept showing a deduction against an invoice that's back to
      // Unpaid. Undoing every payment restores the invoice to its
      // pre-deduction state, same as pre-payment.
      const allDeductions = await DB.getDeductions();
      const invDeductions = allDeductions.filter(d => String(d.invoice_id) === String(invoiceId));
      for (const d of invDeductions) {
        await DB.deleteDeduction(d.id);
      }
      inv.deduction_amount = 0;

      // Restore invoice balance and status — canonical calc, so any
      // discount/delivery/extra already on this invoice is still accounted
      // for, and 'Partially Paid' is recognized rather than only Paid/Unpaid.
      // Payments and deductions are already gone at this point, so only
      // advance_payment counts toward what's still considered paid.
      const fin = Financials.computeInvoiceFinancials(inv, [], []);
      const balance = fin.balance;
      const paidStatus = fin.status;

      await DB.updateInvoice(invoiceId, {
        balance: balance,
        paid_status: paidStatus,
        deduction_amount: 0
      });

      // Push the reversal to every order this invoice covers, or Orders/Pay
      // Now silently keep showing the old paid state.
      if (inv.batch_order_ids) {
        // A "Single Invoice" batch payment never touched each order's own
        // advance_payment (only its status) — see processBatchPayment — so
        // only status needs reverting here; writing inv.advance_payment
        // (the batch's combined total) into each order would corrupt it.
        const orderIds = inv.batch_order_ids.split(',').map(Number);
        for (const oId of orderIds) {
          await DB.updateOrder(oId, { status: 'Unpaid' });
          refreshCustomerDetailForOrder(oId);
        }
      } else {
        // A Pay Now partial payment bumps order.advance_payment directly
        // without ever touching the invoice's own advance_payment — so
        // undoing every payment must reset the order back to what the
        // invoice was created with, or its balance stays understated.
        await DB.updateOrder(inv.order_id, {
          status: paidStatus,
          advance_payment: inv.advance_payment || 0
        });
        refreshCustomerDetailForOrder(inv.order_id);
      }

      toast('Payment undone successfully!');

      hideModal('view-invoice-modal');

      if (currentPage === 'orders') renderOrders();
      else if (currentPage === 'invoices') _refreshInvoicesTable();
      else if (currentPage === 'paynow') renderPayNow();
      if (onDone) await onDone();
    } catch (err) {
      toast('Failed to undo payment: ' + (err.message || err), 'error');
    }
  }, 'Undo Payment');
}

async function renderDeductions() {
  document.getElementById('page-title').textContent = 'Deductions';
  
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Deductions Register</span>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:20px;">
      ${renderInvStatCard("Total Deductions Applied", "0", "fa-scissors", "#ef4444", "#fee2e2", "Count of deduction entries", "deduct-card-count")}
      ${renderInvStatCard("Total Deducted Value", "LKR 0.00", "fa-calculator", "#ea580c", "#ffedd5", "Sum of all deduction amounts", "deduct-card-total")}
    </div>

    <!-- Table Container -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="overflow-x:auto;" data-rows-scroll>
        <table class="table" style="width:100%;border-collapse:collapse;margin:0;">
          <thead>
            <tr>
              <th>Date</th>
              <th>OrderID</th>
              <th>Customer</th>
              <th style="text-align:right;">Total Paid Amount</th>
              <th style="text-align:right;color:#ef4444;">Deduction Amt</th>
              <th>Reason</th>
              <th style="text-align:right;color:#16a34a;">Final Paid Amt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="deductions-table-body">
            <tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading deductions...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await _refreshDeductionsTable();
}

async function _refreshDeductionsTable() {
  try {
    const [deductions, invoices, orders, customers] = await Promise.all([
      DB.getDeductions(),
      DB.getInvoices(),
      DB.getOrders(),
      DB.getCustomers()
    ]);

    const invMap = Object.fromEntries(invoices.map(i => [i.id, i]));
    const oMap = Object.fromEntries(orders.map(o => [o.id, o]));
    const cMap = Object.fromEntries(customers.map(c => [c.id, c]));

    const tbody = document.getElementById('deductions-table-body');
    if (!tbody) return;

    if (!deductions || deductions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No deductions found</td></tr>`;
      document.getElementById('deduct-card-count').textContent = '0';
      document.getElementById('deduct-card-total').textContent = 'LKR 0.00';
      return;
    }

    const totalDeductedVal = deductions.reduce((s, d) => s + (parseFloat(d.deduction_amount) || 0), 0);
    document.getElementById('deduct-card-count').textContent = deductions.length.toString();
    document.getElementById('deduct-card-total').textContent = formatCurrency(totalDeductedVal);

    tbody.innerHTML = deductions.map(d => {
      const inv = invMap[d.invoice_id];
      const order = inv ? oMap[inv.order_id] : null;
      const customerName = order ? getOrderCustomerName(order, cMap) : '—';

      return `
        <tr style="border-bottom:1px solid var(--border);">
          <td>${formatDate(d.created_at)}</td>
          <td><strong>${order ? order.id : '—'}</strong></td>
          <td>${escapeHtml(customerName)}</td>
          <td style="text-align:right;"><strong>${formatCurrency(d.original_amount)}</strong></td>
          <td style="text-align:right;color:#ef4444;font-weight:700;">-${formatCurrency(d.deduction_amount)}</td>
          <td><span style="font-size:0.9em;color:var(--text-muted);">${escapeHtml(d.reason || '—')}</span></td>
          <td style="text-align:right;color:#16a34a;font-weight:700;">${formatCurrency(d.final_amount)}</td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="printInvoice(${d.invoice_id})"><i class="fas fa-print"></i> Print</button>
              ${isAdmin() ? `<button class="btn btn-sm" style="background:#ea580c;border-color:#d97706;color:#fff;" onclick="undoDeductionConfirm(${d.id}, ${d.invoice_id}, ${d.deduction_amount})"><i class="fas fa-undo"></i> Undo</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    toast('Error loading deductions: ' + (err.message || err), 'error');
  }
}

async function undoDeductionConfirm(deductionId, invoiceId, amount, onDone) {
  confirmDialog(`Are you sure you want to undo this deduction of LKR ${amount.toFixed(2)}? The amount will be re-added to the total paid amount and the final paid amount will be updated accordingly.`, async () => {
    try {
      const inv = await DB.getInvoice(invoiceId);
      if (inv) {
        const newDeduct = Math.max(0, (inv.deduction_amount || 0) - amount);
        const payments = await DB.getPaymentsByInvoice(invoiceId);
        const fin = Financials.computeInvoiceFinancials({ ...inv, deduction_amount: newDeduct }, [], payments);

        await DB.updateInvoice(invoiceId, {
          deduction_amount: newDeduct,
          balance: fin.balance,
          paid_status: fin.status
        });

        if (inv.batch_order_ids) {
          const orderIds = inv.batch_order_ids.split(',').map(Number);
          for (const oId of orderIds) {
            await DB.updateOrder(oId, { status: fin.status });
            refreshCustomerDetailForOrder(oId);
          }
        } else {
          await DB.updateOrder(inv.order_id, { status: fin.status });
          refreshCustomerDetailForOrder(inv.order_id);
        }
      }

      await DB.deleteDeduction(deductionId);

      toast('Deduction undone successfully!');
      await _refreshDeductionsTable();
      if (onDone) await onDone();
    } catch (err) {
      toast('Error undoing deduction: ' + (err.message || err), 'error');
    }
  }, 'Undo Deduction');
}
