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

// Cache object to store processed list for filters and export
let _invCache = { invoices: [], oMap: {}, cMap: {}, filteredInvoices: [], invoicePaymentsMap: {} };

async function renderInvoices() {
  document.getElementById('page-title').textContent = 'Invoice Management';
  
  // Build page shell
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Invoice Management</span>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">
      ${renderInvStatCard("Total Invoices", "0", "fa-file-invoice", "#3b82f6", "#dbeafe", "Across current filter", "card-total-invoices")}
      ${renderInvStatCard("Total Revenue Collected", "LKR 0.00", "fa-hand-holding-dollar", "#22c55e", "#dcfce7", "Calculated from payments", "card-total-revenue")}
      ${renderInvStatCard("Outstanding Balance", "LKR 0.00", "fa-file-invoice-dollar", "#ef4444", "#fee2e2", "Awaiting payment", "card-outstanding-balance")}
      ${renderInvStatCard("Overdue Invoices", "0", "fa-calendar-times", "#f59e0b", "#fef9c3", "Past due date", "card-overdue-count", "card-overdue-container")}
    </div>

    <!-- Filters & Search -->
    <div class="card" style="margin-bottom:18px;padding:20px;">
      <!-- Top Row: Search and Quick Buttons -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;width:100%;">
        <div class="search-wrap" style="flex:1;min-width:200px;margin:0;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="inv-search-input" placeholder="Search invoice #, customer, order batch..."
            value="${invoiceSearch}"
            autocomplete="off" spellcheck="false"
            oninput="invoiceSearch=this.value;invoicePage=1;_refreshInvoicesTable()"/>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="invoices-filter-btn" onclick="toggleInvoicesFilter()">
            <i class="fas fa-filter"></i> Filter
          </button>
          <button class="btn btn-secondary" onclick="resetInvoiceFilters()">
            <i class="fas fa-sync-alt"></i> Reset
          </button>
          <div class="dropdown" style="position:relative;">
            <button class="btn btn-primary" onclick="toggleExportDropdown()">
              <i class="fas fa-file-export"></i> Export <i class="fas fa-chevron-down" style="font-size:0.75em;margin-left:4px;"></i>
            </button>
            <div class="dropdown-menu" id="export-dropdown" style="display:none;position:absolute;right:0;top:100%;z-index:50;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:150px;margin-top:6px;overflow:hidden;">
              <a href="#" class="dropdown-item" onclick="exportInvoices('csv')" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'" style="display:flex;align-items:center;padding:10px 14px;color:var(--text);text-decoration:none;font-size:0.88em;transition:background 0.2s;"><i class="fas fa-file-csv" style="margin-right:10px;color:#10b981;font-size:1.1em;"></i> CSV</a>
              <a href="#" class="dropdown-item" onclick="exportInvoices('excel')" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'" style="display:flex;align-items:center;padding:10px 14px;color:var(--text);text-decoration:none;font-size:0.88em;transition:background 0.2s;"><i class="fas fa-file-excel" style="margin-right:10px;color:#22c55e;font-size:1.1em;"></i> Excel</a>
              <a href="#" class="dropdown-item" onclick="exportInvoices('pdf')" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'" style="display:flex;align-items:center;padding:10px 14px;color:var(--text);text-decoration:none;font-size:0.88em;transition:background 0.2s;"><i class="fas fa-file-pdf" style="margin-right:10px;color:#ef4444;font-size:1.1em;"></i> PDF</a>
            </div>
          </div>
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
      <div class="table-wrap" style="overflow-x:auto;">
        <table style="min-width:1300px;border-collapse:collapse;">
          <thead>
            <tr>
              <th onclick="sortInvoices('invoice_number')" style="cursor:pointer;user-select:none;">Invoice No ${getSortIcon('invoice_number')}</th>
              <th>Order ID</th>
              <th onclick="sortInvoices('customer')" style="cursor:pointer;user-select:none;">Customer ${getSortIcon('customer')}</th>
              <th onclick="sortInvoices('status')" style="cursor:pointer;user-select:none;">Status ${getSortIcon('status')}</th>
              <th onclick="sortInvoices('total')" style="cursor:pointer;text-align:right;user-select:none;">Invoice Total ${getSortIcon('total')}</th>
              <th onclick="sortInvoices('paid')" style="cursor:pointer;text-align:right;user-select:none;">Amount Paid ${getSortIcon('paid')}</th>
              <th>Deduction</th>
              <th onclick="sortInvoices('balance')" style="cursor:pointer;text-align:right;user-select:none;">Remaining Balance ${getSortIcon('balance')}</th>
              <th>Description(Notes)</th>
              <th style="position:sticky;right:0;background:var(--card-bg);box-shadow:-2px 0 5px rgba(0,0,0,0.05);z-index:5;">Actions</th>
            </tr>
          </thead>
          <tbody id="inv-table-body"></tbody>
        </table>
      </div>
      <div id="inv-pagination" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);background:var(--card-bg);"></div>
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

  // Filter logic
  let filtered = invoices.map(inv => {
    const pList = invPayments[inv.id] || [];
    const amountPaid = pList.reduce((s, p) => s + (p.amount || 0), 0) + (inv.advance_payment || 0);
    const balance = Math.max(0, inv.total_amount - (inv.deduction_amount || 0) - amountPaid);
    const latestPayment = pList.length > 0 ? pList[pList.length - 1] : null;

    let computedStatus = balance <= 0 ? 'Paid' : 'Unpaid';

    return {
      ...inv,
      computedPaid: amountPaid,
      computedBalance: balance,
      computedStatus: computedStatus,
      latestPayment: latestPayment
    };
  });

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
  const overdueCount = filtered.filter(inv => {
    const isCredit = inv.invoice_type === 'Credit';
    return isCredit && inv.credit_due_date && new Date(inv.credit_due_date) < new Date() && inv.computedBalance > 0;
  }).length;

  document.getElementById('card-total-invoices').textContent = totalInvoices;
  document.getElementById('card-total-revenue').textContent = formatCurrency(totalRevenue);
  document.getElementById('card-outstanding-balance').textContent = formatCurrency(totalOutstanding);
  
  const overdueEl = document.getElementById('card-overdue-count');
  overdueEl.textContent = overdueCount;
  const overdueContainer = document.getElementById('card-overdue-container');
  if (overdueCount > 0) {
    overdueContainer.style.border = '1px solid var(--danger)';
    overdueContainer.style.background = 'rgba(239, 68, 68, 0.04)';
    overdueEl.style.color = 'var(--danger)';
  } else {
    overdueContainer.style.border = 'none';
    overdueContainer.style.background = 'var(--card-bg)';
    overdueEl.style.color = 'inherit';
  }

  // Set Count Label
  const countEl = document.getElementById('inv-count');
  if (countEl) countEl.textContent = `${totalInvoices} invoice${totalInvoices !== 1 ? 's' : ''}`;

  // Paginate list
  const { items, totalPages } = paginateData(filtered, invoicePage, invoicePerPage);

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
          : '<span class="badge badge-red">Unpaid</span>';
        const overdueBadge = overdue ? '<span class="badge badge-red" style="margin-top:4px;display:inline-block;">Overdue</span>' : '';

        // Notes tooltip helper
        const notesText = inv.latestPayment && inv.latestPayment.notes ? inv.latestPayment.notes : '—';
        const truncatedNotes = notesText.length > 20 
          ? `<span title="${notesText}" style="cursor:help;border-bottom:1px dotted var(--text-muted);">${notesText.slice(0, 18)}...</span>` 
          : notesText;

        const balanceColor = inv.computedBalance === 0 ? 'var(--success)' : 'var(--danger)';

        return `
          <tr style="${overdue ? 'background:rgba(239, 68, 68, 0.04);' : ''} transition:background 0.2s;" class="hover-highlight-row">
            <td style="${overdue ? 'border-left: 4px solid var(--danger);' : ''}"><strong>${inv.invoice_number}</strong></td>
            <td>${o?.batch_id || '—'}</td>
            <td>${o ? getOrderCustomerName(o, cMap) : '—'}</td>
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
            <td>${truncatedNotes}</td>
            <td style="position:sticky;right:0;background:var(--card-bg);box-shadow:-2px 0 5px rgba(0,0,0,0.05);z-index:5;">
              <div style="display:flex;gap:4px;flex-wrap:nowrap;white-space:nowrap;">
                <button class="btn btn-primary btn-sm" onclick="viewInvoice(${inv.id})"><i class="fas fa-eye"></i> View</button>
                <button class="btn btn-secondary btn-sm" onclick="printInvoice(${inv.id})"><i class="fas fa-print"></i> Print</button>
                <button class="btn btn-danger btn-sm" onclick="deleteInvoiceConfirm(${inv.id})"><i class="fas fa-trash"></i> Delete</button>
                ${inv.computedPaid > 0 ? `<button class="btn btn-sm" style="background:#ea580c; border-color:#d97706; color:#fff;" onclick="undoPaymentForInvoice(${inv.id})"><i class="fas fa-undo"></i> Undo</button>` : ''}
              </div>
            </td>
          </tr>`;
      }).join('');

  const pg = document.getElementById('inv-pagination');
  if (pg) pg.innerHTML = `<span style="font-size:0.82em;color:var(--text-muted);font-weight:600;">Page ${invoicePage} of ${totalPages}</span>` + renderPagination(invoicePage, totalPages, 'changeInvoicePage');
}

function changeInvoicePage(p) {
  invoicePage = p;
  _refreshInvoicesTable();
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

function toggleExportDropdown() {
  const dropdown = document.getElementById('export-dropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  }
}

// Global click listener to close dropdown on outer click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    const dropdown = document.getElementById('export-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }
});

function resetInvoiceFilters() {
  invoiceSearch = '';
  invoiceFilter = '';
  invoiceTypeFilter = '';
  invoiceMethodFilter = '';
  invoiceDateType = 'issue_date';
  invoiceStartDate = '';
  invoiceEndDate = '';
  invoicePage = 1;

  // Clear elements in DOM
  const searchInput = document.getElementById('inv-search-input');
  if (searchInput) searchInput.value = '';
  const statusSel = document.getElementById('inv-filter-sel');
  if (statusSel) statusSel.value = '';
  const typeSel = document.getElementById('inv-type-sel');
  if (typeSel) typeSel.value = '';
  const methodSel = document.getElementById('inv-method-sel');
  if (methodSel) methodSel.value = '';
  const dateTypeSel = document.getElementById('inv-date-type-sel');
  if (dateTypeSel) dateTypeSel.value = 'issue_date';
  const startDate = document.getElementById('inv-start-date');
  if (startDate) startDate.value = '';
  const endDate = document.getElementById('inv-end-date');
  if (endDate) endDate.value = '';

  _refreshInvoicesTable();
  toast('Filters reset!');
}

function exportInvoices(type) {
  const filtered = _invCache.filteredInvoices;
  if (!filtered || !filtered.length) {
    return toast('No data to export', 'error');
  }

  const exportDataList = filtered.map(inv => {
    const o = _invCache.oMap[inv.order_id];
    const c = o ? _invCache.cMap[o.customer_id] : null;
    const isCredit = inv.invoice_type === 'Credit';
    const latestPayment = inv.latestPayment;

    return {
      "Invoice #": inv.invoice_number,
      "Order #": o ? o.batch_id : '—',
      "Customer": o ? getOrderCustomerName(o, cMap) : '—',
      "Type": inv.invoice_type,
      "Issue Date": formatDate(inv.issue_date),
      "Due Date": isCredit && inv.credit_due_date ? formatDate(inv.credit_due_date) : '—',
      "Invoice Total": inv.total_amount,
      "Amount Paid": inv.computedPaid,
      "Outstanding Balance": inv.computedBalance,
      "Payment Method": latestPayment ? latestPayment.method : (inv.advance_payment > 0 ? 'Advance' : '—'),
      "Last Payment Date": latestPayment ? formatDate(latestPayment.date) : '—',
      "Status": inv.computedStatus
    };
  });

  const filename = `Invoices_Export_${new Date().toISOString().slice(0, 10)}`;

  if (type === 'csv') {
    const headers = Object.keys(exportDataList[0]);
    const csv = [headers.join(','), ...exportDataList.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(','))].join('\n');
    downloadFile(csv, `${filename}.csv`, 'text/csv');
    toast('CSV exported!');
  } else if (type === 'excel') {
    const ws = XLSX.utils.json_to_sheet(exportDataList);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast('Excel exported!');
  } else if (type === 'pdf') {
    let printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Invoices Export</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
      <style>
        body { font-family:'DM Sans',sans-serif; padding: 20px; color: #1e293b; }
        table { width:100%; border-collapse:collapse; margin-top:20px; font-size:12px; }
        th { background:#1a4d8f; color:#fff; padding:8px; text-align:left; }
        td { padding:8px; border-bottom:1px solid #e2e8f0; }
        .text-right { text-align:right; }
        .badge { display:inline-block; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; text-transform:uppercase; }
        .badge-green { background:#dcfce7; color:#15803d; }
        .badge-yellow { background:#fef9c3; color:#a16207; }
        .badge-red { background:#fee2e2; color:#b91c1c; }
        .badge-purple { background:#f3e8ff; color:#6b21a8; }
        .badge-blue { background:#dbeafe; color:#1d4ed8; }
      </style>
      </head><body>
      <h2>Invoice Management Report</h2>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Issue Date</th>
            <th class="text-right">Total</th>
            <th class="text-right">Paid</th>
            <th class="text-right">Balance</th>
            <th>Method</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${exportDataList.map(row => `
            <tr>
              <td><strong>${row["Invoice #"]}</strong></td>
              <td>${row["Customer"]}</td>
              <td><span class="badge ${row["Type"] === 'Credit' ? 'badge-purple' : 'badge-blue'}">${row["Type"]}</span></td>
              <td>${row["Issue Date"]}</td>
              <td class="text-right"><strong>LKR ${row["Invoice Total"].toFixed(2)}</strong></td>
              <td class="text-right">LKR ${row["Amount Paid"].toFixed(2)}</td>
              <td class="text-right" style="font-weight:700;color:${row["Outstanding Balance"] > 0 ? '#b91c1c' : '#15803d'};">LKR ${row["Outstanding Balance"].toFixed(2)}</td>
              <td>${row["Payment Method"]}</td>
              <td><span class="badge ${row["Status"] === 'Paid' ? 'badge-green' : 'badge-red'}">${row["Status"]}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div style="text-align:center;min-width:180px;">
          <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
          <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Issued By:-</div>
        </div>
        <div style="text-align:center;min-width:180px;">
          <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
          <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Checked By:-</div>
        </div>
      </div>
      <script>window.print();<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast('Please allow pop-ups to export PDF', 'warning');
    w.document.write(printHTML);
    w.document.close();
  }
}

// ── VIEW / PRINT INVOICE ──
async function viewInvoice(id) {
  const inv = await DB.getInvoice(id); if (!inv) return;
  const order = await DB.getOrder(inv.order_id);
  const customerRaw = (order && order.customer_id) ? await DB.getCustomer(order.customer_id) : null;
  const customer = customerRaw || (order ? { hotel_name: getOrderCustomerName(order) } : null);
  const items = order ? await DB.getOrderItems(order.id) : [];
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

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0) + (inv.advance_payment || 0);
  const balance = Math.max(0, inv.total_amount - totalPaid);
  const discount = inv.discount_amount || 0;
  const deliveryCharge = inv.delivery_charge || 0;
  const itemsSubtotal = (inv.subtotal_before_discount != null ? inv.subtotal_before_discount : inv.total_amount);

  const _svcColor = { 'Dry Clean': '#7c3aed', 'Wash & Press': '#0369a1', 'Wash & Dry': '#16a34a' };
  
  const itemsHTML = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${i.item_name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:0.82em;font-weight:600;padding:3px 8px;border-radius:5px;background:${_svcColor[i.service_type] || '#64748b'}18;color:${_svcColor[i.service_type] || '#64748b'};">${i.service_type || '—'}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(i.price)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(i.subtotal)}</td>
    </tr>`).join('');

  const paymentsHTML = payments.map(p => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${formatDate(p.date)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${p.method}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(p.amount)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:var(--text-muted);">${p.notes || '—'}</td>
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

  const discountedItems = itemsSubtotal - discount;
  const grandTotal = discountedItems + deliveryCharge;

  const invoiceHTML = `
    <div class="invoice-page" id="invoice-print-area" style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:40px 44px;box-shadow:0 4px 32px rgba(0,0,0,0.1);border-radius:4px;">
      ${creditBanner}
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:16px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.65em;font-weight:700;color:#1a4d8f;line-height:1.15;">${settings.company_name}</div>
            ${settings.address ? `<div style="font-size:0.83em;color:#64748b;margin-top:5px;">${settings.address}</div>` : ''}
            <div style="font-size:0.83em;color:#64748b;margin-top:2px;">${[settings.phone, settings.email].filter(Boolean).join(' | ')}</div>
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
          <div style="font-weight:700;font-size:1.05em;color:#1e293b;">${customer?.hotel_name || (order ? getOrderCustomerName(order) : '—')}</div>
          ${customer?.address ? `<div style="font-size:0.88em;color:#64748b;margin-top:3px;">${customer.address}</div>` : ''}
          ${customer?.contact_person ? `<div style="font-size:0.88em;color:#64748b;">${customer.contact_person}</div>` : ''}
          ${customer?.phone ? `<div style="font-size:0.88em;color:#64748b;">${customer.phone}</div>` : ''}
        </div>
        <div>
          <div style="font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;">Order Info</div>
          <div style="font-size:0.9em;color:#64748b;">Batch: <strong style="color:#1e293b;">${order?.batch_id || '—'}</strong></div>
          <div style="font-size:0.9em;color:#64748b;margin-top:3px;">Pickup: ${formatDate(order?.pickup_date)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
        <thead>
          <tr style="border-bottom:2px solid #1a4d8f;">
            <th style="padding:10px 0;text-align:left;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Item</th>
            <th style="padding:10px 8px;text-align:center;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Qty</th>
            <th style="padding:10px 8px;text-align:left;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Service</th>
            <th style="padding:10px 8px;text-align:right;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Unit Price</th>
            <th style="padding:10px 0;text-align:right;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((i, idx) => `
            <tr style="border-bottom:1px solid #f1f5f9;${idx % 2 === 1 ? 'background:#fafafa;' : ''}">
              <td style="padding:12px 0;font-size:0.92em;">${i.item_name}</td>
              <td style="padding:12px 8px;text-align:center;font-size:0.92em;">${i.quantity}</td>
              <td style="padding:12px 8px;font-size:0.88em;">
                <span style="font-weight:600;padding:3px 8px;border-radius:5px;background:${_svcColor[i.service_type] || '#64748b'}18;color:${_svcColor[i.service_type] || '#64748b'};">${i.service_type || '—'}</span>
              </td>
              <td style="padding:12px 8px;text-align:right;font-size:0.92em;">${formatCurrency(i.price)}</td>
              <td style="padding:12px 0;text-align:right;font-size:0.92em;font-weight:700;">${formatCurrency(i.subtotal)}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-top:20px;position:relative;">
        ${paidStamp}
        <div style="width:340px;border-top:2px solid #e2e8f0;padding-top:4px;">
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
            <span style="color:#64748b;">Items Subtotal</span>
            <span style="font-weight:600;">${formatCurrency(itemsSubtotal)}</span>
          </div>
          ${deliveryCharge > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#64748b;">Delivery Cost</span>
              <span>${formatCurrency(deliveryCharge)}</span>
            </div>` : ''}
          ${discount > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.9em;">
              <span style="color:#64748b;">Discount ${inv.discount_rate ? `(${inv.discount_rate}%)` : ''}</span>
              <span style="color:#16a34a;font-weight:600;">− ${formatCurrency(discount)}</span>
            </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:2px solid #1a4d8f;border-bottom:2px solid #1a4d8f;font-size:1em;font-weight:800;color:#1e293b;">
            <span>Grand Total</span>
            <span>${formatCurrency(grandTotal)}</span>
          </div>
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
          <div style="display:flex;justify-content:space-between;padding:12px 0 4px;font-size:0.95em;">
            <span style="color:#94a3b8;">Balance Due</span>
            <span style="font-weight:700;color:${balance > 0 ? '#e11d48' : '#16a34a'};">${formatCurrency(Math.max(0, balance))}</span>
          </div>
        </div>
      </div>

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

      ${settings.footer_message ? `<div style="margin-top:36px;text-align:center;font-size:0.88em;color:#94a3b8;font-style:italic;">${settings.footer_message}</div>` : ''}
    </div>`;

  createModal('view-invoice-modal', `${isCredit ? 'Credit Bill' : 'Invoice'}: ${inv.invoice_number}`, `
    ${invoiceHTML}
    <div class="no-print" style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('view-invoice-modal')">Close [Esc]</button>
      <button class="btn btn-primary" onclick="printInvoice(${inv.id})"><i class="fas fa-print"></i> Print [Ctrl+P]</button>
    </div>`, 'modal-xl');
  showModal('view-invoice-modal');
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

  const order = await DB.getOrder(inv.order_id);
  const customerRaw = (order && order.customer_id) ? await DB.getCustomer(order.customer_id) : null;
  const customer = customerRaw || (order ? { hotel_name: getOrderCustomerName(order) } : null);
  const payments = (inv.id && typeof id !== 'object') ? await DB.getPaymentsByInvoice(inv.id) : [];
  
  let orderInfoHTML = '';
  let items = [];

  if (inv.batch_order_ids) {
    const orderIds = inv.batch_order_ids.split(',').map(Number);
    const ordersList = await Promise.all(orderIds.map(oid => DB.getOrder(oid)));
    const activeOrders = ordersList.filter(Boolean);
    
    orderInfoHTML = `
      <div><span style="color:#64748b;">Invoice Number:</span> <strong>${inv.invoice_number}</strong></div>
      <div style="margin-top:4.5px;"><span style="color:#64748b;">Order IDs:</span> <strong>${activeOrders.map(o => o.batch_id).join(', ')}</strong></div>
      <div style="margin-top:4.5px;"><span style="color:#64748b;">Invoice Type:</span> Consolidated Batch</div>
    `;

    for (const o of activeOrders) {
      const orderItems = await DB.getOrderItems(o.id);
      orderItems.forEach(item => {
        item.order_batch_id = o.batch_id;
      });
      items.push(...orderItems);
    }
  } else {
    orderInfoHTML = `
      <div><span style="color:#64748b;">Batch:</span> <strong>${order?.batch_id || '—'}</strong></div>
      <div><span style="color:#64748b;">Pickup:</span> ${formatDate(order?.pickup_date)}</div>
    `;
    items = order ? await DB.getOrderItems(order.id) : (inv.order_id ? await DB.getOrderItems(inv.order_id) : []);
  }
  
  const settings = {
    company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
    address: await DB.getSetting('address') || '',
    phone: await DB.getSetting('phone') || '',
    email: await DB.getSetting('email') || '',
    footer_message: await DB.getSetting('footer_message') || ''
  };
  const logoData = await DB.getSetting('logo_data');
  const isCredit = inv.invoice_type === 'Credit';

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0) + (inv.advance_payment || 0);
  const discount = inv.discount_amount || 0;
  const deliveryCharge = inv.delivery_charge || 0;
  const extraPayment = inv.extra_payment || 0;
  const calcSubtotal = items.reduce((s, i) => s + (i.subtotal || (i.price * i.quantity) || 0), 0);
  const itemsSubtotal = (inv.subtotal_before_discount != null && inv.subtotal_before_discount > 0)
    ? inv.subtotal_before_discount
    : (calcSubtotal > 0 ? calcSubtotal : (inv.total_amount || 0));
  const discountedItems = itemsSubtotal - discount;
  const grandTotal = discountedItems + deliveryCharge + extraPayment;
  const deduction = inv.deduction_amount || 0;
  const finalTotal = grandTotal - deduction;
  const balance = Math.max(0, finalTotal - totalPaid);

  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:64px;width:64px;object-fit:cover;border-radius:12px;"/>`
    : `<div style="height:64px;width:64px;border-radius:12px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;">SW</div>`;

  const _svcColorPrint = { 'Dry Clean': '#7c3aed', 'Wash & Press': '#0369a1', 'Wash & Dry': '#16a34a' };
  
  const itemsHTML = items.map((i, idx) => `
    <tr style="${idx % 2 === 1 ? 'background:#fafafa;' : ''}">
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
        ${i.item_name}
        ${i.order_batch_id ? `<span style="display:block;font-size:0.75em;color:#64748b;margin-top:2px;">Order: ${i.order_batch_id}</span>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:0.8em;font-weight:600;padding:3px 8px;border-radius:5px;background:${_svcColorPrint[i.service_type] || '#64748b'}18;color:${_svcColorPrint[i.service_type] || '#64748b'};">${i.service_type || '—'}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatCurrency(i.price)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">${formatCurrency(i.subtotal)}</td>
    </tr>`).join('');

  const paymentsRows = payments.map(p => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;">${formatDate(p.date)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;">${p.method}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(p.amount)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:var(--text-muted);">${p.notes || '—'}</td>
    </tr>`).join('');

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
    <div style="display:flex;justify-content:space-between;padding:12px;background:#1a4d8f;color:#fff;border-radius:0 0 10px 10px;font-weight:700;font-size:1.05em;">
      <span>Balance Due</span><span>${formatCurrency(Math.max(0, balance))}</span>
    </div>`;

  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Invoice ${inv.invoice_number}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;}
      @media print{body{margin:0;}@page{margin:12mm 10mm;size:A4;}}
    </style>
    </head><body>
    <div style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:40px 44px;">
      ${creditBanner}
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:14px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
            ${settings.address ? `<div style="font-size:0.85em;color:#64748b;margin-top:4px;">${settings.address}</div>` : ''}
            <div style="font-size:0.85em;color:#64748b;">${[settings.phone, settings.email].filter(Boolean).join(' | ')}</div>
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
              return `<div style="font-weight:700;font-size:1.05em;color:#1e293b;line-height:1.4;">${customerNames.join('<br/>')}</div>`;
            } else {
              return `
                <div style="font-weight:700;font-size:1.05em;">${customer?.hotel_name || (order ? getOrderCustomerName(order) : '—')}</div>
                <div style="color:#64748b;font-size:0.9em;margin-top:4px;">${customer?.address || ''}</div>
                <div style="color:#64748b;font-size:0.9em;">${customer?.contact_person || ''}</div>
                <div style="color:#64748b;font-size:0.9em;">${customer?.phone || ''}</div>
              `;
            }
          })()}
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:10px;">
          <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Order Info</div>
          ${orderInfoHTML}
        </div>
      </div>

      ${(() => {
        if (inv.batch_invoice_details) {
          const batchDetails = JSON.parse(inv.batch_invoice_details || '[]');
          const rows = batchDetails.map((d, idx) => `
            <tr style="${idx % 2 === 1 ? 'background:#fafafa;' : ''}">
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:700;">${d.invoiceNumber}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;">${d.orderNumber}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${d.customerName}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#16a34a;">${formatCurrency(d.amount)}</td>
            </tr>
          `).join('');

          return `
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <thead>
                <tr style="background:#1a4d8f;color:#fff;">
                  <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Invoice Number</th>
                  <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Order Number</th>
                  <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Customer</th>
                  <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Payment per Invoice</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `;
        } else {
          return `
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <thead>
                <tr style="background:#1a4d8f;color:#fff;">
                  <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Item</th>
                  <th style="padding:10px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;">Qty</th>
                  <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Service</th>
                  <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Unit Price</th>
                  <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemsHTML}</tbody>
            </table>
          `;
        }
      })()}

      <div style="display:flex;justify-content:flex-end;margin-bottom:24px;position:relative;">
        ${paidStamp}
        <div style="min-width:300px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          ${summaryHTML}
        </div>
      </div>

      ${payments.length > 0 ? `
        <div style="margin-bottom:24px;">
          <div style="font-size:0.8em;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px;letter-spacing:0.5px;">Payment History</div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 12px;text-align:left;font-size:0.8em;color:#64748b;">Date</th>
                <th style="padding:8px 12px;text-align:left;font-size:0.8em;color:#64748b;">Method</th>
                <th style="padding:8px 12px;text-align:right;font-size:0.8em;color:#64748b;">Amount</th>
                <th style="padding:8px 12px;text-align:left;font-size:0.8em;color:#64748b;">Notes</th>
              </tr>
            </thead>
            <tbody>${paymentsRows}</tbody>
          </table>
        </div>` : ''}

      ${settings.footer_message ? `<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;font-size:0.9em;color:#64748b;font-style:italic;">${settings.footer_message}</div>` : ''}
      <div style="margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div style="text-align:center;min-width:180px;">
          <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
          <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Issued By:-</div>
        </div>
        <div style="text-align:center;min-width:180px;">
          <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
          <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Checked By:-</div>
        </div>
      </div>
      </div>
    </div>
    <script>document.fonts.ready.then(()=>window.print());<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return toast('Please allow pop-ups to print', 'warning');
  w.document.write(printHTML);
  w.document.close();
  } finally {
    hideProcessingOverlay();
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
    const invType = order.status === 'Credits' ? 'Credit' : 'Standard';
    const invId = await DB.addInvoice({
      order_id: orderId,
      invoice_number: invNum,
      issue_date: new Date().toISOString(),
      delivery_date: order.delivery_date,
      invoice_type: invType,
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
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + (inv.advance_payment || 0);
  const balance = Math.max(0, inv.total_amount - (inv.deduction_amount || 0) - totalPaid);
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

async function submitRecordedPayment(invoiceId, balance) {
  if (currentPayOption === 'standard') {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;
    const notes = document.getElementById('pay-notes').value;
    if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
    
    await DB.addPayment({ invoice_id: invoiceId, amount, method, notes });
    const inv = await DB.getInvoice(invoiceId);
    const payments = await DB.getPaymentsByInvoice(invoiceId);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + (inv.advance_payment || 0);
    const newBalance = Math.max(0, inv.total_amount - (inv.deduction_amount || 0) - totalPaid);
    const paidStatus = newBalance <= 0 ? 'Paid' : 'Unpaid';
    
    await DB.updateInvoice(invoiceId, {
      balance: newBalance,
      paid_status: paidStatus,
      payment_date: new Date().toISOString()
    });
    await DB.updateOrder(inv.order_id, {
      status: paidStatus,
      payment_date: new Date().toISOString()
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
        notes: `Final payment after deduction (Reason: ${reason}). Notes: ${notes}`
      });
    }
    
    await DB.updateInvoice(invoiceId, {
      deduction_amount: (inv.deduction_amount || 0) + deductionAmount,
      balance: 0,
      paid_status: 'Paid',
      payment_date: new Date().toISOString()
    });
    
    await DB.updateOrder(inv.order_id, {
      status: 'Paid',
      payment_date: new Date().toISOString()
    });
    
    hideModal('payment-modal');
    toast('Recorded deduction and finalized invoice payment!');
    _refreshInvoicesTable();
    
    setTimeout(() => printInvoice(invoiceId), 300);
  }
}

// ── UNDO PAYMENT (REVERSE PAYMENTS) ──
async function undoPaymentForInvoice(invoiceId) {
  confirmDialog('Are you sure you want to undo payment for this invoice? All recorded payments will be deleted and the status reverted to Unpaid.', async () => {
    try {
      const inv = await DB.getInvoice(invoiceId);
      if (!inv) return toast('Invoice not found', 'error');

      // Delete payments
      await DB.deletePaymentsForInvoice(invoiceId);

      // Restore invoice balance and status
      const balance = Math.max(0, inv.total_amount - (inv.advance_payment || 0));
      const paidStatus = (inv.advance_payment || 0) >= inv.total_amount ? 'Paid' : 'Unpaid';

      await DB.updateInvoice(invoiceId, {
        balance: balance,
        paid_status: paidStatus
      });

      // Update order status back
      await DB.updateOrder(inv.order_id, {
        status: paidStatus
      });

      toast('Payment undone successfully!');
      
      hideModal('view-invoice-modal');

      if (currentPage === 'orders') renderOrders();
      else if (currentPage === 'invoices') _refreshInvoicesTable();
      else if (currentPage === 'paynow') renderPayNow();
    } catch (err) {
      toast('Failed to undo payment: ' + (err.message || err), 'error');
    }
  }, 'Undo Payment');
}

function deleteInvoiceConfirm(invoiceId) {
  confirmDialog('Are you sure you want to delete this invoice? Linked orders will revert to Unpaid.', async () => {
    try {
      const inv = await DB.getInvoice(invoiceId);
      if (!inv) return toast('Invoice not found', 'error');

      await DB.deletePaymentsForInvoice(invoiceId);
      await DB.deleteInvoice(invoiceId);

      if (inv.batch_order_ids) {
        const orderIds = inv.batch_order_ids.split(',').map(Number);
        for (const oId of orderIds) {
          await DB.updateOrder(oId, { status: 'Unpaid' });
        }
      } else {
        await DB.updateOrder(inv.order_id, { status: 'Unpaid' });
      }

      toast('Invoice deleted successfully!');
      _refreshInvoicesTable();
    } catch (err) {
      toast('Error: ' + (err.message || err), 'error');
    }
  });
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
      <div style="overflow-x:auto;">
        <table class="table" style="width:100%;border-collapse:collapse;margin:0;">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice #</th>
              <th>Customer</th>
              <th style="text-align:right;">Original Total</th>
              <th style="text-align:right;color:#ef4444;">Deduction Amt</th>
              <th style="text-align:right;color:#16a34a;">Final Paid Amt</th>
              <th>Reason</th>
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
          <td><strong>${d.invoice_number}</strong></td>
          <td>${customerName}</td>
          <td style="text-align:right;"><strong>${formatCurrency(d.original_amount)}</strong></td>
          <td style="text-align:right;color:#ef4444;font-weight:700;">-${formatCurrency(d.deduction_amount)}</td>
          <td style="text-align:right;color:#16a34a;font-weight:700;">${formatCurrency(d.final_amount)}</td>
          <td><span style="font-size:0.9em;color:var(--text-muted);">${d.reason || '—'}</span></td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="printInvoice(${d.invoice_id})"><i class="fas fa-print"></i> Print</button>
              ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteDeductionConfirm(${d.id}, ${d.invoice_id}, ${d.deduction_amount})"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    toast('Error loading deductions: ' + (err.message || err), 'error');
  }
}

async function deleteDeductionConfirm(deductionId, invoiceId, amount) {
  confirmDialog(`Are you sure you want to revert this deduction of LKR ${amount.toFixed(2)}? This deduction entry will be deleted and the invoice balance updated.`, async () => {
    try {
      const inv = await DB.getInvoice(invoiceId);
      if (inv) {
        const newDeduct = Math.max(0, (inv.deduction_amount || 0) - amount);
        const payments = await DB.getPaymentsByInvoice(invoiceId);
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + (inv.advance_payment || 0);
        const newBalance = Math.max(0, inv.total_amount - newDeduct - totalPaid);
        const paidStatus = newBalance <= 0 ? 'Paid' : 'Unpaid';

        await DB.updateInvoice(invoiceId, {
          deduction_amount: newDeduct,
          balance: newBalance,
          paid_status: paidStatus
        });

        await DB.updateOrder(inv.order_id, {
          status: paidStatus
        });
      }

      await DB.deleteDeduction(deductionId);

      toast('Deduction successfully reverted!');
      await _refreshDeductionsTable();
    } catch (err) {
      toast('Error reverting deduction: ' + (err.message || err), 'error');
    }
  });
}
