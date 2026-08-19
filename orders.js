// orders.js - Orders Module

let ordersPage=1, ordersSearch='', ordersStatusFilter='', ordersDriverFilter='', ordersCustFilter='', ordersDateFilter='', ordersDateFrom='', ordersDateTo='', ordersPerPage=12;
let ordersActionsVisible = true;
let sigPad=null;
let _ordersCustomers=[], _ordersDrivers=[];

async function renderOrders() {
  document.getElementById('page-title').textContent = 'Orders';

  // If the shell already exists just refresh the table (preserves search input)
  if (document.getElementById('orders-table-body')) {
    await _refreshOrdersTable();
    return;
  }

  // ── First load: build the full shell ──────────────────────────────────
  showLoading('content', 'Loading Orders...');
  const [allOrders, customers, drivers] = await Promise.all([DB.getOrders(), DB.getCustomers(), DB.getDrivers()]);
  _ordersCustomers=customers; _ordersDrivers=drivers;
  const hasFilter = ordersStatusFilter||ordersDriverFilter||ordersCustFilter||ordersDateFrom||ordersDateTo;
  const statusOpts = ORDER_STATUSES.map(s=>`<option value="${s}" ${s===ordersStatusFilter?'selected':''}>${s}</option>`).join('');
  const driverOpts = drivers.map(d=>`<option value="${d.id}" ${String(d.id)===ordersDriverFilter?'selected':''}>${escapeHtml(d.name)}</option>`).join('');
  const custOpts   = customers.map(c=>`<option value="${c.id}" ${String(c.id)===ordersCustFilter?'selected':''}>${escapeHtml(c.hotel_name)}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Orders</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${canAddOrders() ? `<button class="btn btn-primary" onclick="showAddOrderModal()"><i class="fas fa-plus"></i> New Order</button>` : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <div class="search-wrap" style="flex:1;min-width:200px;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="orders-search-input"
            placeholder="Search order ID, customer, driver..."
            autocomplete="off" spellcheck="false"
            oninput="ordersSearch=this.value;ordersPage=1;_refreshOrdersTable()"/>
        </div>
        <button class="btn btn-secondary btn-sm" id="orders-filter-btn" onclick="toggleOrdersFilter()">
          <i class="fas fa-filter"></i> Filter
        </button>
        <span id="orders-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
      <div id="orders-filter-panel" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <!-- Date Range Row -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
          <span style="font-size:0.8em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-right:4px;">Period:</span>
          ${['Day','Week','Month','Year'].map(p => `
            <button class="btn btn-sm" id="orders-date-btn-${p.toLowerCase()}" onclick="setOrdersDatePeriod('${p.toLowerCase()}')"
              style="padding:5px 14px;font-weight:600;font-size:0.82em;">${p}
            </button>`).join('')}
          <button class="btn btn-sm btn-secondary" onclick="clearOrdersDatePeriod()"
            id="orders-date-btn-all" style="padding:5px 14px;font-size:0.82em;">All Time</button>
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <label class="form-label" style="margin:0;white-space:nowrap;">From</label>
            <input type="date" class="form-input" id="orders-date-from" style="width:150px;" value="${ordersDateFrom}" onchange="onOrdersDateInputChange()"/>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <label class="form-label" style="margin:0;white-space:nowrap;">To</label>
            <input type="date" class="form-input" id="orders-date-to" style="width:150px;" value="${ordersDateTo}" onchange="onOrdersDateInputChange()"/>
          </div>
          <span style="font-size:0.78em;color:var(--text-muted);">A period button fills in its default range — edit From/To for any specific date or custom range.</span>
        </div>
        <!-- Field Filters Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div><label class="form-label">Status</label>
            <select class="form-input form-select" id="orders-status-sel" onchange="ordersStatusFilter=this.value;ordersPage=1;_refreshOrdersTable()">
              <option value="">All Statuses</option>${statusOpts}
            </select></div>
          <div><label class="form-label">Driver</label>
            <select class="form-input form-select" id="orders-driver-sel" onchange="ordersDriverFilter=this.value;ordersPage=1;_refreshOrdersTable()">
              <option value="">All Drivers</option>${driverOpts}
            </select></div>
          <div><label class="form-label">Customer</label>
            <select class="form-input form-select" id="orders-cust-sel" onchange="ordersCustFilter=this.value;ordersPage=1;_refreshOrdersTable()">
              <option value="">All Customers</option>${custOpts}
            </select></div>
        </div>
        <div style="margin-top:10px;text-align:right;">
          <button class="btn btn-sm btn-secondary" onclick="clearOrdersFilter()"><i class="fas fa-times"></i> Clear All Filters</button>
        </div>
      </div>
    </div>

    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Order ID</th><th>Customer</th><th>Pickup Date</th><th>Status</th>
            <th>Paid Date</th><th>Total</th><th>Driver</th>
            <th style="text-align:center;white-space:nowrap;">
              Actions
              <button id="orders-actions-toggle" onclick="_toggleAllOrderActions()" title="Show / Hide action buttons"
                style="margin-left:6px;padding:2px 7px;font-size:0.75em;cursor:pointer;border-radius:5px;border:1px solid var(--border);background:var(--bg);color:var(--text-muted);vertical-align:middle;">
                <i class="fas fa-eye"></i>
              </button>
            </th>
          </tr></thead>
          <tbody id="orders-table-body"></tbody>
        </table>
      </div>
    </div>`;

  await _refreshOrdersTable();
  document.getElementById('orders-search-input')?.focus();
}

// ── Only updates tbody + count — never touches the search input ──
async function _refreshOrdersTable() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) { await renderOrders(); return; }

  // Use cached data if available, else fetch
  if (!_ordersCustomers.length) {
    const [customers, drivers] = await Promise.all([DB.getCustomers(), DB.getDrivers()]);
    _ordersCustomers=customers; _ordersDrivers=drivers;
  }
  const [allOrders, invoices] = await Promise.all([DB.getOrders(), DB.getInvoices()]);
  const invMap = Object.fromEntries(invoices.map(i => [i.order_id, i]));
  const cMap = Object.fromEntries(_ordersCustomers.map(c=>[c.id,c]));
  const dMap = Object.fromEntries(_ordersDrivers.map(d=>[d.id,d]));

  let filtered = [...allOrders];
  if (ordersSearch) {
    const q = ordersSearch.toLowerCase();
    filtered = filtered.filter(o => {
      const custName = getOrderCustomerName(o, cMap).toLowerCase();
      const drvName  = (dMap[o.driver_id]?.name||'').toLowerCase();
      return (o.batch_id||'').toLowerCase().includes(q)
          || (o.status||'').toLowerCase().includes(q)
          || custName.includes(q)
          || drvName.includes(q);
    });
  }
  if (ordersStatusFilter) filtered = filtered.filter(o=>o.status===ordersStatusFilter);
  if (ordersDriverFilter) filtered = filtered.filter(o=>String(o.driver_id)===ordersDriverFilter);
  if (ordersCustFilter)   filtered = filtered.filter(o=>String(o.customer_id)===ordersCustFilter);
  // Date range filter — Day/Week/Month/Year buttons pre-fill From/To with
  // that period's current instance, but the fields are freely editable so a
  // user can pick any specific date (From === To) or an arbitrary range.
  if (ordersDateFrom || ordersDateTo) {
    filtered = filtered.filter(o => {
      const raw = o.pickup_date || o.created_at;
      if (!raw) return false;
      const dateStr = String(raw).slice(0, 10); // YYYY-MM-DD, compares lexicographically
      if (ordersDateFrom && dateStr < ordersDateFrom) return false;
      if (ordersDateTo && dateStr > ordersDateTo) return false;
      return true;
    });
  }
  filtered.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const items = filtered;
  const total = filtered.length;

  // Update count
  const countEl = document.getElementById('orders-count');
  if (countEl) countEl.textContent = total + ' order' + (total!==1?'s':'');

  // Update filter button style
  const hasFilter = ordersStatusFilter||ordersDriverFilter||ordersCustFilter||ordersDateFrom||ordersDateTo;
  const filterBtn = document.getElementById('orders-filter-btn');
  if (filterBtn) {
    filterBtn.className = 'btn ' + (hasFilter?'btn-primary':'btn-secondary') + ' btn-sm';
    filterBtn.innerHTML = '<i class="fas fa-filter"></i> Filter' + (hasFilter?' ✓':'');
  }
  _syncOrdersDateBtns();

  // Update tbody only
  tbody.innerHTML = items.length===0
    ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No orders found</td></tr>`
    : items.map(o => {
        const custName = getOrderCustomerName(o, cMap);
        const drv=dMap[o.driver_id];
        const inv=invMap[o.id];
        const drvName = drv ? escapeHtml(drv.name) : '<span style="color:var(--text-muted);font-style:italic;">—</span>';
        const extraStyle = ordersActionsVisible ? 'display:inline-flex;gap:4px;' : 'display:none;';
        return `<tr>
          <td><strong style="font-family:monospace;color:var(--primary);">${o.batch_id||'—'}</strong></td>
          <td>${escapeHtml(custName)}</td>
          <td>${formatDate(o.pickup_date)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${o.status === 'Paid' ? (o.payment_date ? formatDate(o.payment_date) : '—') : '—'}</td>
          <td><strong>${formatCurrency(o.total_amount)}</strong></td>
          <td>${drvName}</td>
          <td style="text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:4px;flex-wrap:nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="viewOrderDetails(${o.id})" title="View Order"><i class="fas fa-eye"></i> View</button>
              <span class="order-extra-actions" style="${extraStyle}">
                ${canEditOrders() ? `<button class="btn btn-primary btn-sm" onclick="showEditOrderModal(${o.id})"><i class="fas fa-edit"></i> Edit</button>` : ''}
                <button class="btn btn-success btn-sm" onclick="printInvoiceByOrder(${o.id})" style="background:#10b981;border-color:#10b981;color:#fff;"><i class="fas fa-print"></i> Print</button>
                ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteOrderConfirm(${o.id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
              </span>
            </div>
          </td>
        </tr>`;
      }).join('');

  // Sync the header toggle icon
  const toggleBtn = document.getElementById('orders-actions-toggle');
  if (toggleBtn) toggleBtn.innerHTML = ordersActionsVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

function changeOrdersPage(p){ordersPage=p;renderOrders();}
function toggleOrdersFilter(){
  const p=document.getElementById('orders-filter-panel');
  if(p) p.style.display=p.style.display==='none'?'block':'none';
}
function clearOrdersFilter(){ordersStatusFilter='';ordersDriverFilter='';ordersCustFilter='';ordersDateFilter='';ordersDateFrom='';ordersDateTo='';ordersPage=1;renderOrders();}

function _toggleAllOrderActions() {
  ordersActionsVisible = !ordersActionsVisible;
  // Toggle all rows at once
  document.querySelectorAll('.order-extra-actions').forEach(span => {
    span.style.display = ordersActionsVisible ? 'inline-flex' : 'none';
    if (ordersActionsVisible) span.style.gap = '4px';
  });
  // Update the header toggle button icon
  const toggleBtn = document.getElementById('orders-actions-toggle');
  if (toggleBtn) toggleBtn.innerHTML = ordersActionsVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

function _syncOrdersDateBtns() {
  const isAllTime = !ordersDateFilter && !ordersDateFrom && !ordersDateTo;
  ['day','week','month','year','all'].forEach(p => {
    const btn = document.getElementById('orders-date-btn-' + p);
    if (!btn) return;
    const isActive = (p === 'all') ? isAllTime : (ordersDateFilter === p);
    btn.className = 'btn btn-sm ' + (isActive ? 'btn-primary' : 'btn-secondary');
  });
}

function _syncOrdersDateInputs() {
  const fromEl = document.getElementById('orders-date-from');
  const toEl = document.getElementById('orders-date-to');
  if (fromEl) fromEl.value = ordersDateFrom;
  if (toEl) toEl.value = ordersDateTo;
}

// Default From/To range for a period's *current* instance (today / this
// week / this month / this year) — a starting point the user can then edit
// to pick any other specific date or a custom range.
function _ordersPeriodDefaultRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'day') {
    return { from: toISO(now), to: toISO(now) };
  }
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: toISO(start), to: toISO(end) };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISO(start), to: toISO(end) };
  }
  if (period === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  return { from: '', to: '' };
}

function setOrdersDatePeriod(period) {
  ordersDateFilter = period;
  const range = _ordersPeriodDefaultRange(period);
  ordersDateFrom = range.from;
  ordersDateTo = range.to;
  ordersPage = 1;
  _syncOrdersDateBtns();
  _syncOrdersDateInputs();
  _refreshOrdersTable();
}

function clearOrdersDatePeriod() {
  ordersDateFilter = '';
  ordersDateFrom = '';
  ordersDateTo = '';
  ordersPage = 1;
  _syncOrdersDateBtns();
  _syncOrdersDateInputs();
  _refreshOrdersTable();
}

function onOrdersDateInputChange() {
  const fromEl = document.getElementById('orders-date-from');
  const toEl = document.getElementById('orders-date-to');
  ordersDateFrom = fromEl ? fromEl.value : '';
  ordersDateTo = toEl ? toEl.value : '';
  // Manually clearing both fields drops back to All Time; manually setting
  // either one (without having clicked a preset) is just an unlabeled
  // custom range — filtering itself only ever looks at From/To.
  if (!ordersDateFrom && !ordersDateTo) ordersDateFilter = '';
  ordersPage = 1;
  _syncOrdersDateBtns();
  _refreshOrdersTable();
}

async function deleteOrderConfirm(id) {
  if(!requireAdmin())return;
  const order = await DB.getOrder(id);
  const batchId = order ? order.batch_id : '#' + id;
  let custName = 'Customer';
  if (order && order.customer_id) {
    const c = await DB.getCustomer(order.customer_id);
    if (c) custName = c.hotel_name;
  }
  confirmDialog('Delete this order and all its items?', async () => {
    await DB.deleteOrder(id);
    await DB.logAction(
      'Delete Order',
      `Deleted order #${batchId} (Customer: "${custName}")`,
      { order_id: id, batch_id: batchId, customer: custName },
      'Order'
    );
    toast('Order deleted');
    renderOrders();
    refreshCustomerDetailIfOpen(order ? order.customer_id : null);
  });
}

// Quick pay — find invoice for order then open payment modal
async function quickPayForOrder(orderId) {
  let inv=await DB.getInvoiceByOrder(orderId);
  if(!inv){
    const order=await DB.getOrder(orderId);
    const items=await DB.getOrderItems(orderId);
    if(!items.length) return toast('Add items to this order first','warning');
    const invNum=await DB.generateInvoiceNumber();
    const invId=await DB.addInvoice({
      order_id:orderId, invoice_number:invNum,
      issue_date:new Date().toISOString(), delivery_date:order.delivery_date,
      invoice_type:'Standard', total_amount:order.total_amount,
      advance_payment:order.advance_payment,
      balance:Math.max(0,order.total_amount-order.advance_payment),
      paid_status:order.advance_payment>=(order.total_amount||0)?'Paid':'Unpaid',
      discount_rate:0, discount_amount:0, delivery_charge:0,
      subtotal_before_discount:order.total_amount
    });
    inv=await DB.getInvoice(invId);
    toast('Invoice created');
  }
  showPaymentModal(inv.id);
}


// ─────────────────────────────────────────────
// QUICK PICK-UP MODAL
// ─────────────────────────────────────────────
async function showPickupModal() {
  const [customers,drivers]=await Promise.all([DB.getCustomers(),DB.getDrivers()]);
  createModal('pickup-modal','Quick Pick-Up Request',`
    <p style="font-size:0.88em;color:var(--text-muted);margin-bottom:16px;">Creates a pickup request. Invoice generated only after items are added.</p>
    <div class="form-group"><label class="form-label">Customer *</label>${pickerHTML('pu-cust','Type customer name...')}</div>
    <div class="form-group"><label class="form-label">Driver</label>${pickerHTML('pu-drv','Type driver name...')}</div>
    <div class="form-group"><label class="form-label">Pickup Date *</label>
      <input type="date" class="form-input" id="pu-date" value="${today()}"/></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
      <button class="btn btn-secondary" onclick="hideModal('pickup-modal')">Cancel [Esc]</button>
      <button class="btn btn-primary" onclick="savePickupRequest()"><i class="fas fa-truck-loading"></i> Create [Enter]</button>
    </div>`);
  showModal('pickup-modal');
  initSearchPicker('pu-cust',customers,c=>c.hotel_name,c=>c.id,'');
  initSearchPicker('pu-drv',[{id:'',name:'-- Unassigned --'},...drivers],d=>d.name,d=>d.id,'');
  setTimeout(()=>document.getElementById('pu-cust-input')?.focus(),80);
}

async function savePickupRequest() {
  const custId=getPickerValue('pu-cust');
  const drvId=getPickerValue('pu-drv')||null;
  const pickup=document.getElementById('pu-date')?.value;
  if(!custId) return toast('Please select a customer','error');
  if(!pickup) return toast('Please select a pickup date','error');
  try {
    const batchId=await DB.generateBatchId();
    await DB.addOrder({customer_id:parseInt(custId),driver_id:drvId?parseInt(drvId):null,pickup_date:pickup,status:'Pickup Requested',total_amount:0,advance_payment:0,batch_id:batchId,is_pickup_only:true});
    hideModal('pickup-modal');
    toast(`Pickup request ${batchId} created!`);
    renderOrders();
    refreshCustomerDetailIfOpen(parseInt(custId));
  } catch(err){toast('Failed: '+(err.message||err),'error');}
}

// ─────────────────────────────────────────────
// CREDIT BILL MODAL
// Full order dialog with credit-specific fields.
// Saves order with status="Credits" + auto-generates
// a Credit invoice with due date printed on the PDF.
// ─────────────────────────────────────────────
async function showCreditBillModal() {
  const [customers, drivers] = await Promise.all([DB.getCustomers(), DB.getDrivers()]);
  window._aoCustomersList = customers;
  window._cbMinDiscount = parseFloat(await DB.getSetting('min_discount_amount')||'0') || 0;

  // Quick-pick due date helpers
  const d7=new Date(); d7.setDate(d7.getDate()+7);
  const d14=new Date(); d14.setDate(d14.getDate()+14);
  const d30=new Date(); d30.setDate(d30.getDate()+30);
  const iso=d=>d.toISOString().split('T')[0];

  createModal('credit-bill-modal','Credit Bill',`
    <!-- Purple header banner -->
    <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
      <i class="fas fa-credit-card" style="font-size:1.5em;opacity:0.9;"></i>
      <div>
        <div style="font-weight:700;font-size:1em;">Credit Bill</div>
        <div style="font-size:0.82em;opacity:0.85;">Deferred payment — due date and credit amount printed on the bill</div>
      </div>
    </div>

    <!-- Customer + Driver + Dates -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group"><label class="form-label">Customer *</label>
        ${pickerHTML('cb-cust','Type customer name...')}
      </div>
      <div class="form-group"><label class="form-label">Driver</label>
        ${pickerHTML('cb-drv','Type driver name...')}
      </div>
      <div class="form-group"><label class="form-label">Pickup Date *</label>
        <input type="date" class="form-input" id="cb-pickup" value="${today()}"/>
      </div>
      <div class="form-group"><label class="form-label">Delivery Date</label>
        <input type="date" class="form-input" id="cb-delivery"/>
      </div>

      <!-- Due date -->
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label" style="color:#7c3aed;font-weight:700;">
          <i class="fas fa-calendar-alt"></i> Payment Due Date *
        </label>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="btn btn-sm" onclick="setCbDue('${iso(d7)}')"
            style="background:#7c3aed;color:#fff;border-color:#6d28d9;font-size:0.8em;padding:4px 10px;">7 days</button>
          <button class="btn btn-sm" onclick="setCbDue('${iso(d14)}')"
            style="background:#7c3aed;color:#fff;border-color:#6d28d9;font-size:0.8em;padding:4px 10px;">14 days</button>
          <button class="btn btn-sm" onclick="setCbDue('${iso(d30)}')"
            style="background:#7c3aed;color:#fff;border-color:#6d28d9;font-size:0.8em;padding:4px 10px;">30 days</button>
        </div>
        <input type="date" class="form-input" id="cb-due-date" value="${iso(d14)}" min="${today()}"
          style="border-color:#c4b5fd;"/>
      </div>
    </div>

    <!-- Order Items -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-family:'Playfair Display',serif;font-size:1em;font-weight:700;color:#7c3aed;">
        <i class="fas fa-list"></i> Order Items
      </span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm" onclick="showQuickAddItemModal('credit-bill')" style="background:#7c3aed;color:#fff;border-color:#6d28d9;">
          <i class="fas fa-box-open"></i> Add New Item
        </button>
        <button class="btn btn-sm" onclick="addCbItemRow()" style="background:#7c3aed;color:#fff;border-color:#6d28d9;">
          <i class="fas fa-plus"></i> Add Row
        </button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:4px;padding:0 2px;">
      <span class="form-label">Item</span>
      <span class="form-label">Service Type</span>
      <span class="form-label">Qty</span>
      <span class="form-label">Price (LKR)</span>
      <span></span>
    </div>
    <div id="cb-items-container"></div>

    <!-- Delivery + Discount + Total -->
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Delivery Charge (LKR)</label>
        <input type="number" class="form-input" id="cb-delivery-charge" value="0" min="0" step="0.01" oninput="calcCbItemTotal()"/>
      </div>
      <div class="form-group" id="cb-discount-wrap" style="margin:0;display:none;">
        <label class="form-label" style="color:#16a34a;font-weight:700;">
          <i class="fas fa-tag"></i> Discount %
          <span id="cb-discount-hint" style="font-weight:400;font-size:0.78em;color:var(--text-muted);margin-left:4px;"></span>
        </label>
        <input type="number" class="form-input" id="cb-discount" value="0" min="0" max="100" step="0.1" oninput="calcCbItemTotal()"/>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;margin-top:8px;">
      <div>
        <div style="font-size:0.82em;color:var(--text-muted);" id="cb-breakdown"></div>
        <strong style="font-size:1.15em;">Grand Total: <span id="cb-total">LKR 0.00</span></strong>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="hideModal('credit-bill-modal')">Cancel [Esc]</button>
        <button class="btn" onclick="saveCreditBill()"
          style="background:#7c3aed;color:#fff;border-color:#6d28d9;font-weight:700;">
          <i class="fas fa-credit-card"></i> Save Credit Bill [Enter]
        </button>
      </div>
    </div>`, 'modal-lg');

  showModal('credit-bill-modal');
  initSearchPicker('cb-cust', customers, c=>c.hotel_name, c=>c.id, '');
  initSearchPicker('cb-drv',  [{id:'',name:'-- Unassigned --'},...drivers], d=>d.name, d=>d.id, '');
  addCbItemRow();
  setTimeout(()=>document.getElementById('cb-cust-input')?.focus(), 80);
}

function setCbDue(dateStr) {
  const el = document.getElementById('cb-due-date');
  if(el) el.value = dateStr;
}

// Item rows for Credit Bill (use cb- prefix to avoid conflicts)
async function addCbItemRow() {
  const container = document.getElementById('cb-items-container');
  const row = document.createElement('div');
  row.className = 'cb-item-row';
  row.style.cssText = 'display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:6px;align-items:center;';
  row.innerHTML = `${buildItemPickerHTML()}
    <select class="form-input form-select cb-svc" onchange="onCbSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">
      <option value="Dry Clean">Dry Clean</option>
      <option value="Wash &amp; Press" selected>Wash &amp; Press</option>
      <option value="Wash &amp; Dry">Wash &amp; Dry</option>
    </select>
    <input type="number" class="form-input cb-qty" value="1" min="1" oninput="calcCbItemTotal()"/>
    <input type="number" class="form-input cb-price" value="0" min="0" oninput="calcCbItemTotal()" placeholder="Price"/>
    <button class="btn btn-danger btn-icon btn-sm" onclick="this.parentElement.remove();calcCbItemTotal()"><i class="fas fa-trash"></i></button>`;
  container.appendChild(row);
}

function calcCbItemTotal() {
  let subtotal = 0;
  document.querySelectorAll('.cb-item-row').forEach(row => {
    const qty   = parseFloat(row.querySelector('.cb-qty')?.value)   || 0;
    const price = parseFloat(row.querySelector('.cb-price')?.value) || 0;
    subtotal += qty * price;
  });
  const delivery     = parseFloat(document.getElementById('cb-delivery-charge')?.value)||0;
  const runningTotal = subtotal + delivery;

  // Show/hide discount row based on min_discount_amount setting
  const minDisc  = window._cbMinDiscount || 0;
  const discWrap = document.getElementById('cb-discount-wrap');
  if(discWrap) {
    const eligible = minDisc > 0 && runningTotal >= minDisc;
    discWrap.style.display = eligible ? '' : 'none';
    const hint = document.getElementById('cb-discount-hint');
    if(hint) hint.textContent = eligible ? `(min. ${formatCurrency(minDisc)} reached)` : '';
    if(!eligible) { const d=document.getElementById('cb-discount'); if(d) d.value='0'; }
  }

  const discRate = parseFloat(document.getElementById('cb-discount')?.value)||0;
  const fin = Financials.computeOrderFinancials(
    { discount_rate: discRate, delivery_charge: delivery, extra_payment: 0 },
    [{ subtotal }]
  );
  const discAmt = fin.discountAmount;
  const grand   = fin.grandTotal;
  const el = document.getElementById('cb-total');
  if(el) el.textContent = formatCurrency(grand);
  const bd = document.getElementById('cb-breakdown');
  if(bd) {
    let parts=[];
    if(delivery>0) parts.push(`Delivery: +${formatCurrency(delivery)}`);
    if(discRate>0) parts.push(`Discount ${discRate}%: -${formatCurrency(discAmt)}`);
    bd.textContent = parts.join('  |  ');
  }
}


async function saveCreditBill() {
  const custId  = parseInt(getPickerValue('cb-cust'));
  const drvRaw  = getPickerValue('cb-drv');
  const drvId   = drvRaw ? parseInt(drvRaw) : null;
  const pickup  = document.getElementById('cb-pickup')?.value;
  const delivery= document.getElementById('cb-delivery')?.value;
  const dueDate = document.getElementById('cb-due-date')?.value;
  if(!custId)  return toast('Please select a customer', 'error');
  if(!pickup)  return toast('Please select a pickup date', 'error');
  if(!dueDate) return toast('Please select a payment due date', 'error');

  const billSvc        = 'Wash & Press'; // kept for compat; actual svc is per-row
  const deliveryCharge = parseFloat(document.getElementById('cb-delivery-charge')?.value)||0;
  const discRate       = parseFloat(document.getElementById('cb-discount')?.value)||0;

  // Collect items
  const orderItems = []; let itemsSubtotal = 0; let valid = true;
  document.querySelectorAll('.cb-item-row').forEach(row => {
    const wrap   = row.querySelector('.item-picker-wrap');
    const itemId = parseInt(wrap?.dataset.selectedId);
    const itemTxt= wrap?.querySelector('.item-picker-input')?.value || '';
    const svc    = row.querySelector('.cb-svc')?.value || 'Wash & Press';
    const qty    = parseFloat(row.querySelector('.cb-qty')?.value)   || 0;
    const price  = parseFloat(row.querySelector('.cb-price')?.value) || 0;
    if(!itemId) { valid = false; return; }
    const subtotal = qty * price;
    orderItems.push({ catalog_item_id:itemId, item_name:itemTxt.split('—')[1]?.trim()||itemTxt, quantity:qty, service_type:svc, price, subtotal });
    itemsSubtotal += subtotal;
  });

  if(!valid)             return toast('Please select an item for every row', 'error');
  if(!orderItems.length) return toast('Add at least one item', 'error');

  const cbFin = Financials.computeOrderFinancials(
    { discount_rate: discRate, delivery_charge: deliveryCharge, extra_payment: 0 },
    orderItems
  );
  const discAmt   = cbFin.discountAmount;
  const billTotal = cbFin.grandTotal;

  try {
    showProcessingOverlay('Generating Bill', 'Saving credit bill details...');
    const batchId = await DB.generateBatchId();
    const orderId = await DB.createOrderWithItems({
      customer_id:     custId,
      driver_id:       drvId,
      pickup_date:     pickup,
      delivery_date:   delivery,
      status:          'Credits',
      advance_payment: 0,
      total_amount:    billTotal,
      batch_id:        batchId
    }, orderItems);

    // Auto-generate the Credit invoice immediately
    const invNum = await DB.generateInvoiceNumber();
    const invId  = await DB.addInvoice({
      order_id:                 orderId,
      invoice_number:           invNum,
      issue_date:               new Date().toISOString(),
      delivery_date:            delivery,
      invoice_type:             'Credit',
      credit_due_date:          dueDate,
      total_amount:             billTotal,
      advance_payment:          0,
      balance:                  billTotal,
      paid_status:              'Unpaid',
      discount_rate:            discRate,
      discount_amount:          discAmt,
      delivery_charge:          deliveryCharge,
      subtotal_before_discount: itemsSubtotal+deliveryCharge
    });

    clearItemsCache();
    hideModal('credit-bill-modal');
    toast(`Credit Bill ${batchId} saved!`, 'success');
    refreshCustomerDetailIfOpen(custId);

    // Navigate to invoice so they can print it immediately
    navigate('invoices');
    setTimeout(() => viewInvoice(invId), 200);
  } catch(err) {
    console.error(err);
    toast('Failed to save: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// ADD ORDER MODAL
// ─────────────────────────────────────────────
async function showAddOrderModal() {
  if (!canAddOrders()) return toast('Staff or Admin permission required to add orders', 'error');
  const [customers,drivers]=await Promise.all([DB.getCustomers(),DB.getDrivers()]);
  window._aoCustomersList = customers;
  window._aoMinDiscount = parseFloat(await DB.getSetting('min_discount_amount')||'0') || 0;
  const driverOpts = drivers.map(d=>`<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  createModal('add-order-modal','New Order',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column: span 2;"><label class="form-label">Customer *</label>${pickerHTML('ao-cust','Type customer name...')}</div>
      <div class="form-group"><label class="form-label">Pickup Date</label>
        <input type="date" class="form-input" id="ao-pickup" value="${today()}"/></div>
      <div class="form-group"><label class="form-label">Delivery Date</label>
        <input type="date" class="form-input" id="ao-delivery"/></div>
      <div class="form-group" style="grid-column: span 2;">
        <label class="form-label"><i class="fas fa-user-tie" style="color:var(--primary);margin-right:6px;"></i>Assign Driver <span style="color:var(--text-muted);font-weight:400;font-size:0.85em;">(optional)</span></label>
        <select class="form-input form-select" id="ao-driver">
          <option value="">— No driver assigned —</option>
          ${driverOpts}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Advance Payment (LKR)</label>
        <input type="number" class="form-input" id="ao-advance" value="0" min="0" oninput="calcOrderTotal()"/></div>
      <div class="form-group"><label class="form-label">Extra Payments (LKR)</label>
        <input type="number" class="form-input" id="ao-extra-payment" value="0" min="0" oninput="calcOrderTotal()"/></div>
    </div>

    <!-- Items -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-family:'Playfair Display',serif;font-size:1em;font-weight:700;color:var(--primary);">Order Items</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="showQuickAddItemModal('new-order')"><i class="fas fa-box-open"></i> Add New Item</button>
        <button class="btn btn-secondary btn-sm" onclick="addOrderItemRow()"><i class="fas fa-plus"></i> Add Row</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:4px;padding:0 2px;">
      <span class="form-label">Item</span>
      <span class="form-label">Service Type</span>
      <span class="form-label">Qty</span>
      <span class="form-label">Price (LKR)</span>
      <span></span>
    </div>
    <div id="ao-items-container"></div>

    <!-- Delivery + Discount + Total -->
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Delivery Charge (LKR)</label>
        <input type="number" class="form-input" id="ao-delivery-charge" value="0" min="0" step="0.01" oninput="calcOrderTotal()"/>
      </div>
      <div class="form-group" id="ao-discount-wrap" style="margin:0;display:none;">
        <label class="form-label" style="color:#16a34a;font-weight:700;">
          <i class="fas fa-tag"></i> Discount %
          <span id="ao-discount-hint" style="font-weight:400;font-size:0.78em;color:var(--text-muted);margin-left:4px;"></span>
        </label>
        <input type="number" class="form-input" id="ao-discount" value="0" min="0" max="100" step="0.1" oninput="calcOrderTotal()"/>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;margin-top:8px;">
      <div>
        <div style="font-size:0.82em;color:var(--text-muted);" id="ao-breakdown"></div>
        <strong style="font-size:1.15em;">Grand Total: <span id="ao-total">LKR 0.00</span></strong>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="hideModal('add-order-modal')">Cancel [Esc]</button>
        <button class="btn btn-primary" onclick="saveNewOrder()"><i class="fas fa-save"></i> Create [Enter]</button>
      </div>
    </div>`,'modal-lg');
  showModal('add-order-modal');
  initSearchPicker('ao-cust',customers,c=>c.hotel_name,c=>c.id,'');
  addOrderItemRow();
  setTimeout(()=>document.getElementById('ao-cust-input')?.focus(),80);
}

function onAoSvcChange(sel) {
  const row = sel.closest('.ao-item-row');
  if(!row) return;
  const wrap = row.querySelector('.item-picker-wrap');
  const priceInput = row.querySelector('.ao-price');
  if(wrap && priceInput) _applyServicePrice(wrap, sel.value, priceInput);
  calcOrderTotal();
}
function onEoSvcChange(sel) {
  const row = sel.closest('.eo-item-row');
  if(!row) return;
  const wrap = row.querySelector('.item-picker-wrap');
  const priceInput = row.querySelector('.eo-price');
  if(wrap && priceInput) _applyServicePrice(wrap, sel.value, priceInput);
  calcEditOrderTotal();
}
function onCbSvcChange(sel) {
  const row = sel.closest('.cb-item-row');
  if(!row) return;
  const wrap = row.querySelector('.item-picker-wrap');
  const priceInput = row.querySelector('.cb-price');
  if(wrap && priceInput) _applyServicePrice(wrap, sel.value, priceInput);
  calcCbItemTotal();
}
function _applyServicePrice(wrap, svc, priceInput) {
  if(svc==='Dry Clean')      priceInput.value = parseFloat(wrap.dataset.dryClean)  || 0;
  else if(svc==='Wash & Press') priceInput.value = parseFloat(wrap.dataset.washPress) || 0;
  else                        priceInput.value = parseFloat(wrap.dataset.washDry)   || 0;
}
// Stubs — global service toggle removed; kept for safety
function setAoBillSvc(){}
function setEoBillSvc(){}
function setCbBillSvc(){}

// ─────────────────────────────────────────────
// ITEM SEARCH AUTOCOMPLETE
// ─────────────────────────────────────────────
let _itemsCache=null;
async function getItemsCache(){if(!_itemsCache)_itemsCache=await DB.getItems();return _itemsCache;}
function clearItemsCache(){_itemsCache=null;}

function buildItemPickerHTML(){
  return `<div class="item-picker-wrap" style="position:relative;" data-selected-id="" data-dry-clean="0" data-wash-press="0" data-wash-dry="0">
    <input class="form-input item-picker-input" placeholder="Type to search item..." autocomplete="off"
      oninput="filterItemDropdown(this)" onfocus="showItemDropdown(this)" onblur="if(!window._pickerClicking)hideItemDropdown(this)" style="width:100%;"/>
    <div class="item-picker-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
  </div>`;
}
async function showItemDropdown(input){
  const wrap=input.closest('.item-picker-wrap');
  const allItems=await getItemsCache();
  _renderItemList(wrap.querySelector('.item-picker-dropdown'),allItems);
  wrap.querySelector('.item-picker-dropdown').style.display='block';
}
function hideItemDropdown(input){const wrap=input.closest('.item-picker-wrap');if(wrap)wrap.querySelector('.item-picker-dropdown').style.display='none';}
async function filterItemDropdown(input){
  const wrap=input.closest('.item-picker-wrap');
  const allItems=await getItemsCache();
  const q=input.value.toLowerCase();
  _renderItemList(wrap.querySelector('.item-picker-dropdown'),q?allItems.filter(i=>i.item_name.toLowerCase().includes(q)||i.item_id.toLowerCase().includes(q)):allItems);
  wrap.querySelector('.item-picker-dropdown').style.display='block';
}
function _renderItemList(dropdown,items){
  dropdown.innerHTML=items.length
    ?items.map(i=>{
        const prices = getItemPricesForCurrentCustomer(i);
        return `<div style="padding:10px 14px;cursor:pointer;font-size:0.88em;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);"
            onmousedown="window._pickerClicking=true"
            onmouseup="window._pickerClicking=false;selectItemFromDropdown(event,'${i.id}','${escapeHtml(i.item_id.replace(/'/g,"\\'"))} — ${escapeHtml(i.item_name.replace(/'/g,"\\'"))}',${prices.dry_clean},${prices.wash_press},${prices.wash_dry})">
            <span><strong style="font-family:monospace;font-size:0.85em;">${escapeHtml(i.item_id)}</strong> &nbsp;${escapeHtml(i.item_name)}</span>
            <span style="color:var(--text-muted);font-size:0.78em;display:flex;gap:6px;">
              <span style="color:#7c3aed;">DC:${prices.dry_clean}</span>
              <span style="color:#0369a1;">WP:${prices.wash_press}</span>
              <span style="color:#16a34a;">WD:${prices.wash_dry}</span>
            </span>
          </div>`;
      }).join('')
    :`<div style="padding:12px 14px;color:var(--text-muted);font-size:0.88em;">No items found</div>`;
}
function applyItemToWrap(wrap, itemId, itemLabel, dryCleanPrice, washPressPrice, washDryPrice) {
  wrap.dataset.selectedId = itemId;
  wrap.dataset.dryClean = dryCleanPrice;
  wrap.dataset.washPress = washPressPrice;
  wrap.dataset.washDry = washDryPrice;
  wrap.querySelector('.item-picker-input').value = itemLabel;
  const dropdown = wrap.querySelector('.item-picker-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  // Credit Bill rows
  const cbRow = wrap.closest('.cb-item-row');
  if (cbRow) {
    const svc = cbRow.querySelector('.cb-svc')?.value || 'Dry Clean';
    const priceInput = cbRow.querySelector('.cb-price');
    if (priceInput) _applyServicePrice(wrap, svc, priceInput);
    calcCbItemTotal(); return;
  }
  // Standard add row
  const aoRow = wrap.closest('.ao-item-row');
  if (aoRow) {
    const svc = aoRow.querySelector('.ao-svc')?.value || 'Dry Clean';
    const priceInput = aoRow.querySelector('.ao-price');
    if (priceInput) _applyServicePrice(wrap, svc, priceInput);
    calcOrderTotal(); return;
  }
  // Edit rows
  const eoRow = wrap.closest('.eo-item-row');
  if (eoRow) {
    const svc = eoRow.querySelector('.eo-svc')?.value || 'Dry Clean';
    const priceInput = eoRow.querySelector('.eo-price');
    if (priceInput) _applyServicePrice(wrap, svc, priceInput);
    calcEditOrderTotal(); return;
  }
}

function selectItemFromDropdown(event,itemId,itemLabel,dryCleanPrice,washPressPrice,washDryPrice){
  window._pickerClicking=false;
  if(event) event.preventDefault();
  const wrap = event ? event.currentTarget.closest('.item-picker-wrap') : null;
  if (wrap) applyItemToWrap(wrap, itemId, itemLabel, dryCleanPrice, washPressPrice, washDryPrice);
}

// QUICK ADD NEW ITEM TO CATALOGUE & ORDER
function showQuickAddItemModal(context = 'new-order') {
  const overlay = createModal('quick-add-item-modal', 'Add New Item to Catalogue', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Item Code / ID *</label>
        <input class="form-input" id="qit-id" placeholder="e.g. BS, TW, PC" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()"/>
        <span style="font-size:0.78em;color:var(--text-muted);">Short unique code (e.g. BS)</span>
      </div>
      <div class="form-group">
        <label class="form-label">Item Name *</label>
        <input class="form-input" id="qit-name" placeholder="e.g. Bed Sheet"/>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Description (Optional)</label>
        <input class="form-input" id="qit-desc" placeholder="e.g. Cotton double bed sheet"/>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label" style="font-weight:700;margin-bottom:8px;">Service Prices (LKR)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div>
            <label class="form-label"><span class="badge badge-purple" style="font-size:0.75em;">Dry Clean</span></label>
            <input type="number" class="form-input" id="qit-dry-clean" placeholder="0.00" min="0" step="0.01"/>
          </div>
          <div>
            <label class="form-label"><span class="badge badge-cyan" style="font-size:0.75em;">Wash &amp; Press</span></label>
            <input type="number" class="form-input" id="qit-wash-press" placeholder="0.00" min="0" step="0.01"/>
          </div>
          <div>
            <label class="form-label"><span class="badge badge-green" style="font-size:0.75em;">Wash &amp; Dry</span></label>
            <input type="number" class="form-input" id="qit-wash-dry" placeholder="0.00" min="0" step="0.01"/>
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
      <button class="btn btn-secondary" onclick="hideModal('quick-add-item-modal')">Cancel [Esc]</button>
      <button class="btn btn-primary" onclick="saveQuickAddItem('${context}')"><i class="fas fa-save"></i> Save &amp; Add to Order</button>
    </div>
  `, 'modal-md');
  if (overlay) overlay.style.zIndex = '1050';
  showModal('quick-add-item-modal');
  setTimeout(() => document.getElementById('qit-id')?.focus(), 80);
}

async function saveQuickAddItem(context = 'new-order') {
  const item_id          = document.getElementById('qit-id')?.value.trim().toUpperCase();
  const item_name        = document.getElementById('qit-name')?.value.trim();
  const dry_clean_price  = parseFloat(document.getElementById('qit-dry-clean')?.value) || 0;
  const wash_press_price = parseFloat(document.getElementById('qit-wash-press')?.value) || 0;
  const wash_dry_price   = parseFloat(document.getElementById('qit-wash-dry')?.value) || 0;
  const description      = document.getElementById('qit-desc')?.value.trim() || '';

  if (!item_id)   return toast('Item ID / Code is required', 'error');
  if (!item_name) return toast('Item Name is required', 'error');

  const existing = await DB.getItemByCode(item_id);
  if (existing) return toast(`Item ID "${escapeHtml(item_id)}" already exists in catalogue`, 'error');

  const newItemObj = { item_id, item_name, dry_clean_price, wash_press_price, wash_dry_price, description };
  const dbId = await DB.addItem(newItemObj);
  newItemObj.id = dbId;

  clearItemsCache();
  hideModal('quick-add-item-modal');

  // Auto add row with this new item pre-selected
  let containerId = '#ao-items-container';
  let rowClass = '.ao-item-row';
  if (context === 'edit-order') {
    await addEditOrderItemRow();
    containerId = '#eo-items-container';
    rowClass = '.eo-item-row';
  } else if (context === 'credit-bill') {
    await addCbItemRow();
    containerId = '#cb-items-container';
    rowClass = '.cb-item-row';
  } else {
    await addOrderItemRow();
  }

  const rows = document.querySelectorAll(`${containerId} ${rowClass}`);
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const wrap = lastRow.querySelector('.item-picker-wrap');
    if (wrap) {
      const prices = getItemPricesForCurrentCustomer(newItemObj);
      applyItemToWrap(wrap, dbId, `${item_id} — ${item_name}`, prices.dry_clean, prices.wash_press, prices.wash_dry);
    }
  }

  toast(`Item "${escapeHtml(item_name)}" saved to catalogue & added to order!`);
}

async function addOrderItemRow(){
  const container=document.getElementById('ao-items-container');
  const row=document.createElement('div');
  row.className='ao-item-row';
  row.style.cssText='display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:6px;align-items:center;';
  row.innerHTML=`${buildItemPickerHTML()}
    <select class="form-input form-select ao-svc" onchange="onAoSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">
      <option value="Dry Clean">Dry Clean</option>
      <option value="Wash &amp; Press" selected>Wash &amp; Press</option>
      <option value="Wash &amp; Dry">Wash &amp; Dry</option>
    </select>
    <input type="number" class="form-input ao-qty" value="1" min="1" oninput="calcOrderTotal()"/>
    <input type="number" class="form-input ao-price" value="0" min="0" oninput="calcOrderTotal()" placeholder="Price"/>
    <button class="btn btn-danger btn-icon btn-sm" onclick="this.parentElement.remove();calcOrderTotal()"><i class="fas fa-trash"></i></button>`;
  container.appendChild(row);
}
function calcOrderTotal(){
  let subtotal=0;
  document.querySelectorAll('.ao-item-row').forEach(row=>{
    const qty   = parseFloat(row.querySelector('.ao-qty')?.value)   || 0;
    const price = parseFloat(row.querySelector('.ao-price')?.value) || 0;
    subtotal += qty * price;
  });
  const delivery    = parseFloat(document.getElementById('ao-delivery-charge')?.value)||0;
  const extra       = parseFloat(document.getElementById('ao-extra-payment')?.value)||0;
  const runningTotal = subtotal + delivery + extra;

  // Show/hide discount row based on min_discount_amount setting
  const minDisc  = window._aoMinDiscount || 0;
  const discWrap = document.getElementById('ao-discount-wrap');
  if(discWrap) {
    const eligible = minDisc > 0 && runningTotal >= minDisc;
    discWrap.style.display = eligible ? '' : 'none';
    const hint = document.getElementById('ao-discount-hint');
    if(hint) hint.textContent = eligible ? `(min. ${formatCurrency(minDisc)} reached)` : '';
    if(!eligible) { const d=document.getElementById('ao-discount'); if(d) d.value='0'; }
  }

  const discRate  = parseFloat(document.getElementById('ao-discount')?.value)||0;
  const fin = Financials.computeOrderFinancials(
    { discount_rate: discRate, delivery_charge: delivery, extra_payment: extra },
    [{ subtotal }]
  );
  const discAmt    = fin.discountAmount;
  const grandTotal = fin.grandTotal;
  const el = document.getElementById('ao-total');
  if(el) el.textContent = formatCurrency(grandTotal);
  const bd = document.getElementById('ao-breakdown');
  if(bd) {
    let parts=[];
    if(delivery>0) parts.push(`Delivery: +${formatCurrency(delivery)}`);
    if(extra>0) parts.push(`Extra Payment: +${formatCurrency(extra)}`);
    if(discRate>0) parts.push(`Discount ${discRate}%: -${formatCurrency(discAmt)}`);
    bd.textContent = parts.join('  |  ');
  }
}
async function saveNewOrder(){
  const saveBtn = document.querySelector('#add-order-modal .btn-primary');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) saveBtn.disabled = true;

  const custId  = parseInt(getPickerValue('ao-cust'));
  const pickup  = document.getElementById('ao-pickup').value;
  const delivery= document.getElementById('ao-delivery').value;
  const advance = parseFloat(document.getElementById('ao-advance').value)||0;
  const extra   = parseFloat(document.getElementById('ao-extra-payment')?.value)||0;
  const deliveryCharge = parseFloat(document.getElementById('ao-delivery-charge')?.value)||0;
  const discRate       = parseFloat(document.getElementById('ao-discount')?.value)||0;
  const driverIdRaw    = document.getElementById('ao-driver')?.value || '';
  const driverId       = driverIdRaw ? parseInt(driverIdRaw) : null;
  if(!custId) {
    if (saveBtn) saveBtn.disabled = false;
    return toast('Please select a customer','error');
  }
  const orderItems=[]; let itemsSubtotal=0; let valid=true;
  document.querySelectorAll('.ao-item-row').forEach(row=>{
    const wrap  =row.querySelector('.item-picker-wrap');
    const itemId=parseInt(wrap?.dataset.selectedId);
    const itemTxt=wrap?.querySelector('.item-picker-input')?.value||'';
    const svc   =row.querySelector('.ao-svc')?.value || 'Wash & Press';
    const qty   =parseFloat(row.querySelector('.ao-qty')?.value)  ||0;
    const price =parseFloat(row.querySelector('.ao-price')?.value)||0;
    if(!itemId){valid=false;return;}
    const subtotal=qty*price;
    orderItems.push({catalog_item_id:itemId,item_name:itemTxt.split('—')[1]?.trim()||itemTxt,quantity:qty,service_type:svc,price,subtotal});
    itemsSubtotal+=subtotal;
  });
  if(!valid) {
    if (saveBtn) saveBtn.disabled = false;
    return toast('Please select an item for every row','error');
  }
  if(!orderItems.length) {
    if (saveBtn) saveBtn.disabled = false;
    return toast('Add at least one item','error');
  }
  const newOrderFin = Financials.computeOrderFinancials(
    { discount_rate: discRate, delivery_charge: deliveryCharge, extra_payment: extra },
    orderItems
  );
  const discAmt    = newOrderFin.discountAmount;
  const grandTotal = newOrderFin.grandTotal;
  try {
    const batchId = await DB.generateBatchId();
    const orderStatus = advance >= grandTotal ? 'Paid' : 'Unpaid';
    
    // Only pass columns that exist on the orders table
    const orderId = await DB.createOrderWithItems({
      customer_id:     custId,
      driver_id:       driverId,
      pickup_date:     pickup,
      delivery_date:   delivery,
      status:          orderStatus,
      advance_payment: advance,
      extra_payment:   extra,
      delivery_charge: deliveryCharge,
      discount_rate:   discRate,
      discount_amount: discAmt,
      total_amount:    grandTotal,
      batch_id:        batchId
    }, orderItems);

    if (orderStatus === 'Paid') {
      const invNum = await DB.generateInvoiceNumber();
      await DB.addInvoice({
        order_id:                 orderId,
        invoice_number:           invNum,
        issue_date:               new Date().toISOString(),
        delivery_date:            delivery,
        invoice_type:             'Standard',
        total_amount:             grandTotal,
        advance_payment:          advance,
        extra_payment:            extra,
        balance:                  0,
        paid_status:              'Paid',
        discount_rate:            discRate,
        discount_amount:          discAmt,
        delivery_charge:          deliveryCharge,
        subtotal_before_discount: itemsSubtotal
      });
    }

    const cust = await DB.getCustomer(custId);
    const custName = cust ? cust.hotel_name : 'Customer #' + custId;
    await DB.logAction(
      'New Order Add',
      `Created new order #${batchId} for customer "${custName}" (Total: LKR ${grandTotal.toLocaleString()})`,
      { order_id: orderId, batch_id: batchId, customer: custName, total_amount: grandTotal, status: orderStatus },
      'Order'
    );

    clearItemsCache();
    hideModal('add-order-modal');
    toast(`Order ${batchId} created!`);
    renderOrders();
    refreshCustomerDetailIfOpen(custId);
  } catch(err) {
    console.error('saveNewOrder error:', err);
    toast('Failed to save order: ' + (err.message||err), 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────
// EDIT ORDER MODAL
// ─────────────────────────────────────────────
let _editOrderCatalog=[];
async function showEditOrderModal(id){
  if (!canEditOrders()) return toast('Staff or Admin permission required to edit orders', 'error');
  const [order,customers,drivers,existingItems,allCatalog,invoice]=await Promise.all([
    DB.getOrder(id),
    DB.getCustomers(),
    DB.getDrivers(),
    DB.getOrderItems(id),
    DB.getItems(),
    DB.getInvoiceByOrder(id)
  ]);
  if(!order)return;
  window._aoCustomersList = customers;
  window._editOrderCustomerId = order.customer_id;
  _editOrderCatalog=allCatalog;
  const statusOpts=ORDER_STATUSES.map(s=>`<option value="${s}" ${s===order.status?'selected':''}>${s}</option>`).join('');
  const ro=!isAdmin();
  const itemRows=existingItems.map(item=>{
    const cat=allCatalog.find(c=>c.id===item.catalog_item_id);
    const label=escapeHtml(cat?`${cat.item_id} — ${cat.item_name}`:item.item_name);
    const dryCleanP  = cat ? (cat.dry_clean_price||0)   : 0;
    const washPressP = cat ? (cat.wash_press_price||0)  : 0;
    const washDryP   = cat ? (cat.wash_dry_price||0)    : 0;
    const curSvcItem = item.service_type || 'Wash & Press';
    const curPrice   = item.price || 0;
    const svcOpts = ['Dry Clean','Wash & Press','Wash & Dry'].map(s=>`<option value="${s}" ${s===curSvcItem?'selected':''}>${s}</option>`).join('');
    return `<div class="eo-item-row" style="display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:6px;align-items:center;">
      <div class="item-picker-wrap" style="position:relative;" data-selected-id="${item.catalog_item_id||''}" data-dry-clean="${dryCleanP}" data-wash-press="${washPressP}" data-wash-dry="${washDryP}">
        <input class="form-input item-picker-input" value="${label}" autocomplete="off" placeholder="Type to search item..."
          oninput="filterEditItemDropdown(this)" onfocus="showEditItemDropdown(this)" onblur="setTimeout(()=>hideEditItemDropdown(this),200)" style="width:100%;"/>
        <div class="item-picker-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
      </div>
      <select class="form-input form-select eo-svc" onchange="onEoSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">${svcOpts}</select>
      <input type="number" class="form-input eo-qty" value="${item.quantity}" min="1" oninput="calcEditOrderTotal()"/>
      <input type="number" class="form-input eo-price" value="${curPrice}" min="0" oninput="calcEditOrderTotal()" placeholder="Price"/>
      <button class="btn btn-danger btn-icon btn-sm" onclick="this.parentElement.remove();calcEditOrderTotal()"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');
  const wasPickupOnly=order.is_pickup_only&&order.status==='Pickup Requested';
  const delCharge = invoice ? (invoice.delivery_charge || 0) : 0;
  
  createModal('edit-order-modal',`Edit Order: ${order.batch_id}`,`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column: span 2;"><label class="form-label">Customer</label>
        ${ro?`<input class="form-input" value="${escapeHtml(customers.find(c=>c.id===order.customer_id)?.hotel_name||'—')}" disabled/>`:pickerHTML('eo-cust','Type customer name...')}
      </div>
      <div class="form-group"><label class="form-label">Pickup Date</label>
        <input type="date" class="form-input" id="eo-pickup" value="${order.pickup_date||''}" ${ro?'disabled':''}/></div>
      <div class="form-group"><label class="form-label">Delivery Date</label>
        <input type="date" class="form-input" id="eo-delivery" value="${order.delivery_date||''}" ${ro?'disabled':''}/></div>
      <div class="form-group"><label class="form-label">Status</label>
        <input class="form-input" id="eo-status" value="${order.status}" disabled/></div>
      <div class="form-group"><label class="form-label">Advance Payment (LKR)</label>
        <input type="number" class="form-input" id="eo-advance" value="${order.advance_payment||0}" min="0" ${ro?'disabled':''}/></div>
      <div class="form-group"><label class="form-label">Extra Payments (LKR)</label>
        <input type="number" class="form-input" id="eo-extra-payment" value="${order.extra_payment||0}" min="0" ${ro?'disabled':''} oninput="calcEditOrderTotal()"/></div>
    </div>
    ${ro?`<div style="font-size:0.8em;color:var(--text-muted);margin-bottom:8px;"><i class="fas fa-info-circle"></i> Staff can only edit Status and Order Items.</div>`:''}
    ${wasPickupOnly?`<div style="font-size:0.82em;background:#fef9c3;color:#92400e;padding:8px 12px;border-radius:8px;margin-bottom:10px;"><i class="fas fa-info-circle"></i> Adding items will automatically set status to <strong>Received</strong>.</div>`:''}

    <!-- Items — per-row service type -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-family:'Playfair Display',serif;font-size:1em;font-weight:700;color:var(--primary);">Order Items</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="showQuickAddItemModal('edit-order')"><i class="fas fa-box-open"></i> Add New Item</button>
        <button class="btn btn-secondary btn-sm" onclick="addEditOrderItemRow()"><i class="fas fa-plus"></i> Add Row</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:4px;padding:0 2px;">
      <span class="form-label">Item</span>
      <span class="form-label">Service Type</span>
      <span class="form-label">Qty</span>
      <span class="form-label">Price (LKR)</span>
      <span></span>
    </div>
    <div id="eo-items-container">${itemRows}</div>

    <!-- Delivery + Total — same as New Order -->
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">
      <div class="form-group" style="max-width:260px;">
        <label class="form-label">Delivery Charge (LKR)</label>
        <input type="number" class="form-input" id="eo-delivery-charge" value="${delCharge}" min="0" step="0.01" oninput="calcEditOrderTotal()"/>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;margin-top:4px;">
      <div>
        <div style="font-size:0.82em;color:var(--text-muted);" id="eo-breakdown"></div>
        <strong style="font-size:1.15em;">Grand Total: <span id="eo-total">${formatCurrency(order.total_amount)}</span></strong>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="hideModal('edit-order-modal')">Cancel [Esc]</button>
        <button class="btn btn-primary" onclick="saveEditOrder(${id},${wasPickupOnly})"><i class="fas fa-save"></i> Save [Enter]</button>
      </div>
    </div>`,'modal-lg');
  showModal('edit-order-modal');
  if(!ro){
    initSearchPicker('eo-cust',customers,c=>c.hotel_name,c=>c.id,order.customer_id);
  }
}

function showEditItemDropdown(input){const wrap=input.closest('.item-picker-wrap');_renderItemList(wrap.querySelector('.item-picker-dropdown'),_editOrderCatalog);wrap.querySelector('.item-picker-dropdown').style.display='block';}
function hideEditItemDropdown(input){const wrap=input.closest('.item-picker-wrap');if(wrap)wrap.querySelector('.item-picker-dropdown').style.display='none';}
function filterEditItemDropdown(input){
  const wrap=input.closest('.item-picker-wrap');
  const q=input.value.toLowerCase();
  _renderItemList(wrap.querySelector('.item-picker-dropdown'),q?_editOrderCatalog.filter(i=>i.item_name.toLowerCase().includes(q)||i.item_id.toLowerCase().includes(q)):_editOrderCatalog);
  wrap.querySelector('.item-picker-dropdown').style.display='block';
}
async function addEditOrderItemRow(){
  const container=document.getElementById('eo-items-container');
  const row=document.createElement('div'); row.className='eo-item-row';
  row.style.cssText='display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:6px;align-items:center;';
  row.innerHTML=`<div class="item-picker-wrap" style="position:relative;" data-selected-id="" data-dry-clean="0" data-wash-press="0" data-wash-dry="0">
    <input class="form-input item-picker-input" value="" autocomplete="off" placeholder="Type to search item..."
      oninput="filterEditItemDropdown(this)" onfocus="showEditItemDropdown(this)" onblur="setTimeout(()=>hideEditItemDropdown(this),200)" style="width:100%;"/>
    <div class="item-picker-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
  </div>
  <select class="form-input form-select eo-svc" onchange="onEoSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">
    <option value="Dry Clean">Dry Clean</option>
    <option value="Wash &amp; Press" selected>Wash &amp; Press</option>
    <option value="Wash &amp; Dry">Wash &amp; Dry</option>
  </select>
  <input type="number" class="form-input eo-qty" value="1" min="1" oninput="calcEditOrderTotal()"/>
  <input type="number" class="form-input eo-price" value="0" min="0" oninput="calcEditOrderTotal()" placeholder="Price"/>
  <button class="btn btn-danger btn-icon btn-sm" onclick="this.parentElement.remove();calcEditOrderTotal()"><i class="fas fa-trash"></i></button>`;
  container.appendChild(row);
}

function calcEditOrderTotal(){
  let subtotal=0;
  document.querySelectorAll('.eo-item-row').forEach(row=>{
    const qty   = parseFloat(row.querySelector('.eo-qty')?.value)   || 0;
    const price = parseFloat(row.querySelector('.eo-price')?.value) || 0;
    subtotal += qty * price;
  });
  const delivery = parseFloat(document.getElementById('eo-delivery-charge')?.value)||0;
  const extra = parseFloat(document.getElementById('eo-extra-payment')?.value)||0;
  const total = subtotal + delivery + extra;
  const el=document.getElementById('eo-total'); if(el)el.textContent=formatCurrency(total);
  const bd=document.getElementById('eo-breakdown');
  if(bd) {
    let parts=[];
    if(delivery>0) parts.push(`Delivery: +${formatCurrency(delivery)}`);
    if(extra>0) parts.push(`Extra Payment: +${formatCurrency(extra)}`);
    bd.textContent = parts.join('  |  ');
  }
}
async function saveEditOrder(orderId,wasPickupOnly=false){
  const ro=!isAdmin();
  const originalOrder=await DB.getOrder(orderId);
  const custId=ro?originalOrder.customer_id:parseInt(getPickerValue('eo-cust'));
  const pickup=ro?originalOrder.pickup_date:document.getElementById('eo-pickup').value;
  const delivery=ro?originalOrder.delivery_date:document.getElementById('eo-delivery').value;
  const advance=ro?originalOrder.advance_payment:(parseFloat(document.getElementById('eo-advance').value)||0);
  const extra=ro?originalOrder.extra_payment:(parseFloat(document.getElementById('eo-extra-payment').value)||0);
  const orderItems=[]; let total=0;
  document.querySelectorAll('.eo-item-row').forEach(row=>{
    const wrap=row.querySelector('.item-picker-wrap');
    const itemId=parseInt(wrap?.dataset.selectedId);
    const itemTxt=wrap?.querySelector('.item-picker-input')?.value||'';
    const svc  =row.querySelector('.eo-svc')?.value||'Dry Clean';
    const qty  =parseFloat(row.querySelector('.eo-qty')?.value)  ||0;
    const price=parseFloat(row.querySelector('.eo-price')?.value)||0;
    if(!itemId)return;
    const subtotal=qty*price;
    orderItems.push({catalog_item_id:itemId,item_name:itemTxt.split('—')[1]?.trim()||itemTxt,quantity:qty,service_type:svc,price,subtotal});
    total+=subtotal;
  });
  const eoDelivery=parseFloat(document.getElementById('eo-delivery-charge')?.value)||0;

  // Sync existing invoice and calculate totals
  const existingInv=await DB.getInvoiceByOrder(orderId);
  const discRate = existingInv ? (existingInv.discount_rate || 0) : 0;
  const eoFin = Financials.computeOrderFinancials(
    { discount_rate: discRate, delivery_charge: eoDelivery, extra_payment: extra },
    orderItems
  );
  const discAmt = eoFin.discountAmount;
  const eoGrandTotal = eoFin.grandTotal;

  let status = 'Unpaid';
  if(existingInv){
    const payments=await DB.getPaymentsByInvoice(existingInv.id);
    // Canonical calc — carries forward existingInv.deduction_amount (if any
    // deduction was already applied to this invoice) instead of silently
    // dropping it every time the order is edited.
    const invFin = Financials.computeInvoiceFinancials(
      { ...existingInv, advance_payment: advance, extra_payment: extra,
        discount_rate: discRate, discount_amount: discAmt, delivery_charge: eoDelivery,
        subtotal_before_discount: total, total_amount: eoGrandTotal },
      orderItems,
      payments
    );
    const newBalance = invFin.balance;
    status = invFin.isPaid ? 'Paid' : 'Unpaid';
    await DB.updateInvoice(existingInv.id,{total_amount:eoGrandTotal,advance_payment:advance,extra_payment:extra,balance:newBalance,paid_status:status,delivery_date:delivery,subtotal_before_discount:total,discount_amount:discAmt,delivery_charge:eoDelivery});
  } else {
    status = advance>=eoGrandTotal?'Paid':'Unpaid';
    if (status === 'Paid') {
      const invNum = await DB.generateInvoiceNumber();
      await DB.addInvoice({
        order_id:                 orderId,
        invoice_number:           invNum,
        issue_date:               new Date().toISOString(),
        delivery_date:            delivery,
        invoice_type:             'Standard',
        total_amount:             eoGrandTotal,
        advance_payment:          advance,
        extra_payment:            extra,
        balance:                  0,
        paid_status:              'Paid',
        discount_rate:            discRate,
        discount_amount:          discAmt,
        delivery_charge:          eoDelivery,
        subtotal_before_discount: total
      });
    }
  }

  await DB.updateOrderWithItems(orderId,{
    customer_id:     custId,
    driver_id:       null,
    pickup_date:     pickup,
    delivery_date:   delivery,
    status,
    advance_payment: advance,
    extra_payment:   extra,
    delivery_charge: eoDelivery,
    discount_rate:   discRate,
    discount_amount: discAmt,
    total_amount:    eoGrandTotal,
    is_pickup_only:  orderItems.length===0
  }, orderItems);

  const existingOrder = await DB.getOrder(orderId);
  const batchId = existingOrder ? existingOrder.batch_id : '#' + orderId;
  await DB.logAction(
    'Edit Order',
    `Updated order #${batchId} (Total: LKR ${eoGrandTotal.toLocaleString()}, Status: ${status})`,
    { order_id: orderId, batch_id: batchId, total_amount: eoGrandTotal, status: status },
    'Order'
  );

  hideModal('edit-order-modal');
  toast('Order updated!');
  renderOrders();
  refreshCustomerDetailIfOpen(custId);
  if (originalOrder && originalOrder.customer_id !== custId) {
    refreshCustomerDetailIfOpen(originalOrder.customer_id);
  }
}

// ─────────────────────────────────────────────
// VIEW ORDER DETAILS
// ─────────────────────────────────────────────
async function viewOrderDetails(id){
  // Show the actual bill preview (same as the printed invoice) instead of a generic info modal
  previewInvoiceByOrder(id);
}

// ─────────────────────────────────────────────
// SIGNATURE
// ─────────────────────────────────────────────
async function showSignatureCapture(orderId){
  createModal('sig-modal','Customer Signature',`
    <div style="margin-bottom:12px;font-size:0.9em;color:var(--text-muted);">Customer signs below to confirm laundry pickup.</div>
    <canvas id="sig-canvas" width="500" height="200" style="border:2px solid var(--border);border-radius:10px;width:100%;touch-action:none;background:#fff;"></canvas>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-secondary" onclick="sigPad.clear()"><i class="fas fa-undo"></i> Clear</button>
      <button class="btn btn-secondary" onclick="hideModal('sig-modal')">Cancel [Esc]</button>
      <button class="btn btn-primary" onclick="saveSignature(${orderId})"><i class="fas fa-save"></i> Save [Enter]</button>
    </div>`);
  showModal('sig-modal');
  setTimeout(()=>{const canvas=document.getElementById('sig-canvas');if(canvas)sigPad=new SignaturePad(canvas,{backgroundColor:'rgb(255,255,255)',penColor:'rgb(0,0,0)'});},100);
}
async function saveSignature(orderId){
  if(!sigPad||sigPad.isEmpty())return toast('Please provide a signature','error');
  await DB.updateOrder(orderId,{signature:sigPad.toDataURL()});
  hideModal('sig-modal'); toast('Signature saved!');
}

function getCurrentSelectedCustomerId() {
  const addModal = document.getElementById('add-order-modal');
  const editModal = document.getElementById('edit-order-modal');
  const cbModal = document.getElementById('credit-bill-modal');
  
  if (addModal) {
    return document.getElementById('ao-cust-value')?.value || '';
  } else if (editModal) {
    return document.getElementById('eo-cust-value')?.value || window._editOrderCustomerId || '';
  } else if (cbModal) {
    return document.getElementById('cb-cust-value')?.value || '';
  }
  return '';
}

function getCustomerCustomPrices(customerId) {
  if (!customerId || !window._aoCustomersList) return null;
  const cust = window._aoCustomersList.find(c => String(c.id) === String(customerId));
  return cust?.custom_prices || null;
}

function getItemPricesForCurrentCustomer(item) {
  const custId = getCurrentSelectedCustomerId();
  const customPrices = getCustomerCustomPrices(custId);
  
  let dc = item.dry_clean_price || 0;
  let wp = item.wash_press_price || 0;
  let wd = item.wash_dry_price || 0;
  
  if (customPrices) {
    const custom = customPrices[item.id];
    if (custom) {
      if (custom.dry_clean != null) dc = parseFloat(custom.dry_clean);
      if (custom.wash_press != null) wp = parseFloat(custom.wash_press);
      if (custom.wash_dry != null) wd = parseFloat(custom.wash_dry);
    }
  }
  
  return { dry_clean: dc, wash_press: wp, wash_dry: wd };
}

window.onCustomerPickerChange = function(pickerId, customerId) {
  if (pickerId === 'ao-cust') {
    reapplyPricesForOrderRows('.ao-item-row', customerId, calcOrderTotal);
  } else if (pickerId === 'eo-cust') {
    reapplyPricesForOrderRows('.eo-item-row', customerId, calcEditOrderTotal);
  } else if (pickerId === 'cb-cust') {
    reapplyPricesForOrderRows('.cb-item-row', customerId, calcCbItemTotal);
  }
};

async function reapplyPricesForOrderRows(rowSelector, customerId, totalCallback) {
  const rows = document.querySelectorAll(rowSelector);
  if (!rows.length) return;
  
  const allItems = await getItemsCache();
  const customPrices = getCustomerCustomPrices(customerId);

  rows.forEach(row => {
    const wrap = row.querySelector('.item-picker-wrap');
    if (!wrap) return;
    const itemId = wrap.dataset.selectedId;
    if (!itemId) return;

    const item = allItems.find(i => String(i.id) === String(itemId));
    if (!item) return;

    let dc = item.dry_clean_price || 0;
    let wp = item.wash_press_price || 0;
    let wd = item.wash_dry_price || 0;

    if (customPrices && customPrices[item.id]) {
      const custom = customPrices[item.id];
      if (custom.dry_clean != null) dc = parseFloat(custom.dry_clean);
      if (custom.wash_press != null) wp = parseFloat(custom.wash_press);
      if (custom.wash_dry != null) wd = parseFloat(custom.wash_dry);
    }

    wrap.dataset.dryClean = dc;
    wrap.dataset.washPress = wp;
    wrap.dataset.washDry = wd;

    const svcSel = row.querySelector('select');
    const priceInput = row.querySelector('input[type="number"].ao-price, input[type="number"].eo-price, input[type="number"].cb-price');
    if (svcSel && priceInput) {
      const svc = svcSel.value;
      if (svc === 'Dry Clean') priceInput.value = dc;
      else if (svc === 'Wash & Press') priceInput.value = wp;
      else priceInput.value = wd;
    }
  });

  if (totalCallback) totalCallback();
}

async function printInvoiceByOrder(orderId) {
  const order = await DB.getOrder(orderId);
  if (!order) return toast('Order not found', 'error');

  let inv = await DB.getInvoiceByOrder(orderId);
  if (!inv) {
    const orderItems = await DB.getOrderItems(orderId);
    const itemsSubtotal = orderItems.reduce((s, i) => s + (i.subtotal || 0), 0);

    // Construct virtual invoice for unpaid order printing
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
  printInvoice(inv);
}
