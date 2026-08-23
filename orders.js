// orders.js - Orders Module

let ordersPage=1, ordersSearch='', ordersStatusFilter='', ordersDriverFilter='', ordersCustFilter='', ordersDateFilter='', ordersDateFrom='', ordersDateTo='', ordersPerPage=12;
let ordersActionsVisible = true;
let ordersDebugMode = false;
let sigPad=null;
let _ordersCustomers=[], _ordersDrivers=[];
// Bulk "Assign Driver" selection (Orders tab, admin/staff only) — reset on
// each fresh render of the Orders page, persists across search/filter/page
// changes within one visit so ticks don't get lost while narrowing down.
let ordersSelectedIds = new Set();

async function renderOrders() {
  document.getElementById('page-title').textContent = 'Orders';

  // If the shell already exists just refresh the table (preserves search input)
  if (document.getElementById('orders-table-body')) {
    await _refreshOrdersTable();
    return;
  }

  // ── First load: build the full shell ──────────────────────────────────
  showLoading('content', 'Loading Orders...');
  ordersSelectedIds = new Set();
  const [allOrders, customers, drivers] = await Promise.all([DB.getOrders(), DB.getCustomers(), DB.getDrivers()]);
  _ordersCustomers=customers; _ordersDrivers=drivers;
  const hasFilter = ordersStatusFilter||ordersDriverFilter||ordersCustFilter||ordersDateFrom||ordersDateTo;
  const statusOpts = ORDER_STATUSES.map(s=>`<option value="${s}" ${s===ordersStatusFilter?'selected':''}>${s}</option>`).join('');
  const driverOpts = drivers.map(d=>`<option value="${d.id}" ${String(d.id)===ordersDriverFilter?'selected':''}>${escapeHtml(d.name)}</option>`).join('');
  const custOpts   = customers.map(c=>`<option value="${c.id}" ${String(c.id)===ordersCustFilter?'selected':''}>${escapeHtml(c.hotel_name)}</option>`).join('');
  // Bulk driver assignment is admin/staff only — it does not matter who
  // originally collected the order (newchanges2.md), so drivers themselves
  // don't get this reassignment tool. The tick column itself is for
  // everyone though: it also drives Batch Print, which every role that can
  // see the per-row Print button is allowed to use.
  const canBulkAssign = isAdmin() || isStaffUser();

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Orders</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${canBulkAssign ? `<button id="orders-assign-driver-btn" class="btn btn-primary" style="display:none;" onclick="showBulkAssignDriverModal()"><i class="fas fa-user-tie"></i> Assign Driver (<span id="orders-selected-count">0</span>)</button>` : ''}
        ${isAdmin() ? `<button id="orders-mark-delivered-btn" class="btn btn-secondary" style="display:none;color:#166534;" onclick="markOrdersDeliveredBulk(Array.from(ordersSelectedIds))"><i class="fas fa-truck-ramp-box"></i> Mark Delivered (<span id="orders-selected-count-2">0</span>)</button>` : ''}
        <button id="orders-batch-print-btn" class="btn btn-success" style="display:none;background:#10b981;border-color:#10b981;color:#fff;" onclick="batchPrintSelectedOrders()"><i class="fas fa-print"></i> Batch Print (<span id="orders-selected-count-3">0</span>)</button>
        ${canAddOrders() ? `<button class="btn btn-primary" onclick="showAddOrderModal()"><i class="fas fa-plus"></i> New Order</button>` : ''}
        ${isAdmin() ? `<button id="orders-debug-mode-btn" class="btn btn-sm" style="background:${ordersDebugMode?'#7f1d1d':'#dc2626'};border-color:${ordersDebugMode?'#7f1d1d':'#dc2626'};color:#fff;font-weight:700;" onclick="toggleOrdersDebugMode()"><i class="fas fa-bug"></i> ${ordersDebugMode?'Exit Debug Mode':'Debug Mode'}</button>` : ''}
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
            <th style="width:36px;text-align:center;"><input type="checkbox" id="orders-select-all" onchange="toggleAllOrdersSelection(this)" title="Select all shown orders"/></th>
            <th>Order ID</th><th>Customer</th><th>Pickup Date</th><th>Status</th>
            <th>Paid Date</th><th>Total</th><th>Driver</th>
            <th style="text-align:left;white-space:nowrap;">
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

  const canBulkAssign = isAdmin() || isStaffUser();
  const colCount = 9; // tick column is always rendered (Batch Print)

  // Update tbody only
  tbody.innerHTML = items.length===0
    ? `<tr><td colspan="${colCount}" style="text-align:center;padding:32px;color:var(--text-muted);">No orders found</td></tr>`
    : items.map(o => {
        const custName = getOrderCustomerName(o, cMap);
        const drv=dMap[o.driver_id];
        const inv=invMap[o.id];
        const drvName = drv ? escapeHtml(drv.name) : '<span style="color:var(--text-muted);font-style:italic;">—</span>';
        const deliveryBadge = o.delivery_status === 'delivered'
          ? `<div style="margin-top:2px;">${statusBadge('Delivered')}</div>`
          : (o.delivery_status === 'out_for_delivery' ? `<div style="margin-top:2px;">${statusBadge('Out for Delivery')}</div>` : '');
        const extraStyle = ordersActionsVisible ? 'display:inline-flex;gap:4px;' : 'display:none;';
        return `<tr>
          <td style="text-align:center;"><input type="checkbox" class="orders-row-check" data-order-id="${o.id}" ${ordersSelectedIds.has(o.id)?'checked':''} onchange="toggleOrderSelection(${o.id},this.checked)"/></td>
          <td><strong style="font-family:monospace;color:var(--primary);">${o.batch_id||'—'}</strong></td>
          <td>${escapeHtml(custName)}</td>
          <td>${formatDate(o.pickup_date)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${o.status === 'Paid' ? (o.payment_date ? formatDate(o.payment_date) : '—') : '—'}</td>
          <td><strong>${formatCurrency(o.total_amount)}</strong></td>
          <td>${drvName}${deliveryBadge}</td>
          <td style="text-align:left;">
            <div style="display:inline-flex;align-items:center;justify-content:flex-start;gap:4px;flex-wrap:nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="viewOrderDetails(${o.id})" title="View Order"><i class="fas fa-eye"></i> View</button>
              <span class="order-extra-actions" style="${extraStyle}">
                ${ordersDebugMode ? (isAdmin() ? `<button class="btn btn-sm" style="background:#dc2626;border-color:#dc2626;color:#fff;" onclick="showDebugEditOrderModal(${o.id})"><i class="fas fa-bug"></i> Debug Edit</button>` : '') : `
                ${canEditOrders() ? `<button class="btn btn-primary btn-sm" onclick="showEditOrderModal(${o.id})"><i class="fas fa-edit"></i> Edit</button>` : ''}
                <button class="btn btn-success btn-sm" onclick="printInvoiceByOrder(${o.id})" style="background:#10b981;border-color:#10b981;color:#fff;"><i class="fas fa-print"></i> Print</button>
                ${canEditOrders() ? `<button class="btn btn-secondary btn-sm" onclick="showMarkFlagModal(${o.id},'pending')" style="color:#92400e;" title="Tick item(s) to keep as pending"><i class="fas fa-hourglass-half"></i> Pending</button>` : ''}
                ${canMarkReturned() ? `<button class="btn btn-secondary btn-sm" onclick="showMarkFlagModal(${o.id},'returned')" style="color:#7c2d12;" title="Record item(s) the customer handed back"><i class="fas fa-rotate-left"></i> Returned</button>` : ''}
                ${(canBulkAssign && o.delivery_status === 'out_for_delivery') ? `<button class="btn btn-secondary btn-sm" onclick="markOrderDelivered(${o.id})" style="color:#166534;" title="Mark this order delivered"><i class="fas fa-truck-ramp-box"></i> Delivered</button>` : ''}
                ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteOrderConfirm(${o.id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
                `}
              </span>
            </div>
          </td>
        </tr>`;
      }).join('');

  // Sync the header toggle icon
  const toggleBtn = document.getElementById('orders-actions-toggle');
  if (toggleBtn) toggleBtn.innerHTML = ordersActionsVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';

  _updateOrdersSelectionBar();
}

// ─────────────────────────────────────────────
// BULK "ASSIGN DRIVER" (admin/staff only) — it does not matter who
// originally collected an order (newchanges2.md); any order can be
// assigned to any driver for delivery. Sets delivery_status to
// 'out_for_delivery' so it immediately shows up on that driver's own
// Dashboard.
// ─────────────────────────────────────────────
function toggleOrderSelection(id, checked) {
  if (checked) ordersSelectedIds.add(id); else ordersSelectedIds.delete(id);
  _updateOrdersSelectionBar();
}

function toggleAllOrdersSelection(checkbox) {
  document.querySelectorAll('.orders-row-check').forEach(cb => {
    cb.checked = checkbox.checked;
    const id = parseInt(cb.dataset.orderId);
    if (checkbox.checked) ordersSelectedIds.add(id); else ordersSelectedIds.delete(id);
  });
  _updateOrdersSelectionBar();
}

// Shows/hides every bulk action that depends on the tick column — Assign
// Driver, Mark Delivered, Batch Print — and keeps their counts in sync.
// "Select all" only ever reflects the currently-rendered page/filter, so
// re-derive it (rather than trust its last checked state) every refresh.
function _updateOrdersSelectionBar() {
  const btn = document.getElementById('orders-assign-driver-btn');
  const countEl = document.getElementById('orders-selected-count');
  if (countEl) countEl.textContent = ordersSelectedIds.size;
  if (btn) btn.style.display = ordersSelectedIds.size > 0 ? 'inline-flex' : 'none';

  const delBtn = document.getElementById('orders-mark-delivered-btn');
  const delCountEl = document.getElementById('orders-selected-count-2');
  if (delCountEl) delCountEl.textContent = ordersSelectedIds.size;
  if (delBtn) delBtn.style.display = ordersSelectedIds.size > 0 ? 'inline-flex' : 'none';

  const printBtn = document.getElementById('orders-batch-print-btn');
  const printCountEl = document.getElementById('orders-selected-count-3');
  if (printCountEl) printCountEl.textContent = ordersSelectedIds.size;
  if (printBtn) printBtn.style.display = ordersSelectedIds.size > 0 ? 'inline-flex' : 'none';

  const rowChecks = document.querySelectorAll('.orders-row-check');
  const selectAll = document.getElementById('orders-select-all');
  if (selectAll) {
    selectAll.checked = rowChecks.length > 0 && Array.from(rowChecks).every(cb => cb.checked);
  }
}

async function showBulkAssignDriverModal() {
  if (!(isAdmin() || isStaffUser())) return toast('Permission required', 'error');
  if (ordersSelectedIds.size === 0) return toast('Select at least one order', 'error');
  const drivers = await DB.getDrivers();
  createModal('bulk-assign-driver-modal', `Assign Driver to ${ordersSelectedIds.size} Order(s)`, `
    <div class="form-group">
      <label class="form-label">Driver *</label>
      <select class="form-input form-select" id="bad-driver-sel">
        <option value="">Select driver...</option>
        ${drivers.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
      <button class="btn btn-secondary" onclick="hideModal('bulk-assign-driver-modal')">Cancel</button>
      <button class="btn btn-primary" id="bad-submit-btn"><i class="fas fa-user-tie"></i> Assign</button>
    </div>`);
  showModal('bulk-assign-driver-modal');
  document.getElementById('bad-submit-btn').onclick = submitBulkAssignDriver;
}

async function submitBulkAssignDriver() {
  const driverId = parseInt(document.getElementById('bad-driver-sel')?.value);
  if (!driverId) return toast('Select a driver', 'error');
  const btn = document.getElementById('bad-submit-btn');
  if (btn) btn.disabled = true;
  try {
    const ids = [...ordersSelectedIds];
    // Snapshot each order's driver/delivery state BEFORE reassigning, so
    // Undo can put it back exactly where it was (rather than just blanking
    // it — this could be a reassignment, not a first assignment).
    const beforeOrders = await DB.getOrders();
    const previous = ids.map(id => {
      const o = beforeOrders.find(o => o.id === id);
      return { order_id: id, driver_id: o?.driver_id ?? null, delivery_status: o?.delivery_status ?? null, driver_assigned_at: o?.driver_assigned_at ?? null };
    });
    await DB.assignDriverToOrders(ids, driverId);
    const drv = await DB.getDriver(driverId);
    const batchIds = ids.map(id => beforeOrders.find(o => o.id === id)?.batch_id || `#${id}`);
    await DB.logAction('Assign Driver', `Assigned ${ids.length} order(s) [${batchIds.join(', ')}] to driver "${drv?.name || driverId}"`, { order_ids: ids, batch_ids: batchIds, driver_id: driverId, undo: { type: 'revert_order_fields', orders: previous } }, 'Order');
    hideModal('bulk-assign-driver-modal');
    toast(`${ids.length} order(s) assigned to ${drv?.name || 'driver'}`);
    ordersSelectedIds.clear();
    await _refreshOrdersTable();
  } catch (err) {
    console.error('bulk assign driver error:', err);
    toast('Failed to assign driver: ' + (err.message || err), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Driver-initiated self-assign from the "Available Orders" section of their
// own Dashboard (newchanges2.md: "any driver can [take an] un-assigned
// order and can deliver them") — reuses the same admin/staff bulk-assign
// path (DB.assignDriverToOrders), just scoped to the logged-in driver and a
// single order.
function driverAssignOrderToSelf(orderId) {
  if (!isDriver() || !currentUser?.driver_id) return toast('Driver login required', 'error');
  confirmDialog('Assign this order to yourself for delivery?', async () => {
    try {
      const before = await DB.getOrder(orderId);
      await DB.assignDriverToOrders([orderId], currentUser.driver_id);
      const batchId = before ? before.batch_id : '#' + orderId;
      const previous = [{ order_id: orderId, driver_id: before?.driver_id ?? null, delivery_status: before?.delivery_status ?? null, driver_assigned_at: before?.driver_assigned_at ?? null }];
      await DB.logAction('Assign Driver', `Driver "${currentUser.display_name}" self-assigned order #${batchId}`, { order_id: orderId, batch_id: batchId, driver_id: currentUser.driver_id, undo: { type: 'revert_order_fields', orders: previous } }, 'Order');
      toast(`Order #${batchId} assigned to you`);
      if (typeof renderDriverDashboard === 'function' && document.getElementById('driver-dashboard-page')) await renderDriverDashboard();
    } catch (err) {
      console.error('driverAssignOrderToSelf error:', err);
      toast('Failed to assign order: ' + (err.message || err), 'error');
    }
  }, 'Assign to Me', false);
}

// Available to admin/staff from the Orders tab, and to the driver
// themselves from their own Dashboard (see renderDriverDashboard in app.js).
async function markOrderDelivered(orderId) {
  confirmDialog('Mark this order as delivered?', async () => {
    try {
      const order = await DB.getOrder(orderId);
      const batchId = order ? order.batch_id : '#' + orderId;
      const previous = [{ order_id: orderId, driver_id: order?.driver_id ?? null, delivery_status: order?.delivery_status ?? null, driver_assigned_at: order?.driver_assigned_at ?? null }];
      await DB.markOrderDelivered(orderId);
      await DB.logAction('Mark Delivered', `Marked order #${batchId} as delivered`, { order_id: orderId, batch_id: batchId, undo: { type: 'revert_order_fields', orders: previous } }, 'Order');
      toast('Order marked delivered');
      if (document.getElementById('orders-table-body')) await _refreshOrdersTable();
      if (typeof renderDriverDashboard === 'function' && document.getElementById('driver-dashboard-page')) await renderDriverDashboard();
    } catch (err) {
      console.error('markOrderDelivered error:', err);
      toast('Failed to mark delivered: ' + (err.message || err), 'error');
    }
  }, 'Mark Delivered', false);
}

// Bulk version for the driver dashboard's checkbox-select "Assigned to Me"
// table (newchanges2.md) — same underlying DB.markOrderDelivered call as the
// single-order action above, looped over the ticked rows.
function markOrdersDeliveredBulk(orderIds) {
  if (!orderIds || !orderIds.length) return;
  confirmDialog(`Mark ${orderIds.length} order(s) as delivered?`, async () => {
    try {
      const beforeOrders = await DB.getOrders();
      const previous = orderIds.map(id => {
        const o = beforeOrders.find(o => o.id === id);
        return { order_id: id, driver_id: o?.driver_id ?? null, delivery_status: o?.delivery_status ?? null, driver_assigned_at: o?.driver_assigned_at ?? null };
      });
      for (const id of orderIds) {
        await DB.markOrderDelivered(id);
      }
      const batchIds = orderIds.map(id => beforeOrders.find(o => o.id === id)?.batch_id || `#${id}`);
      await DB.logAction('Mark Delivered', `Marked ${orderIds.length} order(s) [${batchIds.join(', ')}] as delivered`, { order_ids: orderIds, batch_ids: batchIds, undo: { type: 'revert_order_fields', orders: previous } }, 'Order');
      toast(`${orderIds.length} order(s) marked delivered`);
      if (typeof driverSelectedOrderIds !== 'undefined') driverSelectedOrderIds.clear();
      ordersSelectedIds.clear();
      if (document.getElementById('orders-table-body')) await _refreshOrdersTable();
      if (typeof renderDriverDashboard === 'function' && document.getElementById('driver-dashboard-page')) await renderDriverDashboard();
    } catch (err) {
      console.error('markOrdersDeliveredBulk error:', err);
      toast('Failed to mark delivered: ' + (err.message || err), 'error');
    }
  }, 'Mark Delivered', false);
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

function toggleOrdersDebugMode(){
  if(!isAdmin()) return toast('Admin permission required','error');
  ordersDebugMode=!ordersDebugMode;
  const btn=document.getElementById('orders-debug-mode-btn');
  if(btn){
    btn.style.background=btn.style.borderColor=ordersDebugMode?'#7f1d1d':'#dc2626';
    btn.innerHTML=`<i class="fas fa-bug"></i> ${ordersDebugMode?'Exit Debug Mode':'Debug Mode'}`;
  }
  _refreshOrdersTable();
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
    const snapshot = await DB.getOrderFullSnapshot(id);
    const trashId = snapshot ? await DB.addTrash({ entity_type: 'Order', entity_label: batchId, payload: snapshot, deleted_by: currentUser?.display_name }) : null;
    await DB.deleteOrder(id);
    await DB.logAction(
      'Delete Order',
      `Deleted order #${batchId} (Customer: "${custName}")`,
      { order_id: id, batch_id: batchId, customer: custName, undo: trashId ? { type: 'restore_trash', trash_id: trashId } : undefined },
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
      // Items subtotal ONLY — no delivery charge folded in.
      // Financials.computeInvoiceFinancials reads this column as the
      // pre-discount ITEMS total and then adds delivery_charge itself:
      //   gross = (subtotal_before_discount - discount) + delivery + extra
      // Including delivery here billed it twice on the printed credit bill
      // (and let the discount rate eat into the delivery fee as well).
      subtotal_before_discount: itemsSubtotal
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
  if (!canAddOrders()) return toast('Permission required to add orders', 'error');
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

    <!-- Outstanding Pending/Returned items for this customer -->
    <div id="ao-open-flags-wrap" style="display:none;margin-bottom:14px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
      <div style="font-weight:700;font-size:0.85em;color:#92400e;margin-bottom:2px;"><i class="fas fa-triangle-exclamation"></i> This customer has outstanding pending/returned items — tick any this order is delivering/collecting:</div>
      <div style="font-size:0.78em;color:#92400e;opacity:0.85;margin-bottom:8px;">Ticking an item just marks it resolved by this order — it is not re-billed and does not affect the total below.</div>
      <div id="ao-open-flags-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;"></div>
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
  // Debug Mode rows
  const dboRow = wrap.closest('.dbo-item-row');
  if (dboRow) {
    const svc = dboRow.querySelector('.dbo-svc')?.value || 'Dry Clean';
    const priceInput = dboRow.querySelector('.dbo-price');
    if (priceInput) _applyServicePrice(wrap, svc, priceInput);
    calcDebugOrderTotal(); return;
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
  } else if (context === 'debug-order') {
    await addDebugOrderItemRow();
    containerId = '#dbo-items-container';
    rowClass = '.dbo-item-row';
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
    const flagClears = collectAoFlagClears();

    // Only pass columns that exist on the orders table
    const orderId = await DB.createOrderWithItemsAndClearFlags({
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
    }, orderItems, flagClears);

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
      { order_id: orderId, batch_id: batchId, customer: custName, total_amount: grandTotal, status: orderStatus, undo: { type: 'delete_record', entity_type: 'Order', id: orderId } },
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
  const [order,customers,drivers,existingItems,allCatalog,invoice,itemFlags]=await Promise.all([
    DB.getOrder(id),
    DB.getCustomers(),
    DB.getDrivers(),
    DB.getOrderItems(id),
    DB.getItems(),
    DB.getInvoiceByOrder(id),
    DB.getFlagsBySourceOrder(id).catch(()=>[])
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
    const pendingQty=(itemFlags||[]).filter(f=>f.flag_type==='pending'&&f.status==='pending'&&String(f.order_item_id)===String(item.id)).reduce((s,f)=>s+parseFloat(f.quantity||0),0);
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
        ${pendingQty > 0 ? `<div style="margin-top:3px;font-size:0.72em;font-weight:700;color:#92400e;"><span style="background:#facc15;padding:1px 6px;border-radius:4px;">P</span> ${pendingQty}</div>` : ''}
      </div>
      <select class="form-input form-select eo-svc" onchange="onEoSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">${svcOpts}</select>
      <input type="number" class="form-input eo-qty" value="${item.quantity}" min="1" oninput="calcEditOrderTotal()"/>
      <input type="number" class="form-input eo-price" value="${curPrice}" min="0" oninput="calcEditOrderTotal()" placeholder="Price"/>
      <button class="btn btn-danger btn-icon btn-sm" onclick="this.closest('.eo-item-row').remove();calcEditOrderTotal()"><i class="fas fa-trash"></i></button>
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

// ─────────────────────────────────────────────
// DEBUG MODE — admin-only reconstruction of broken orders' item breakdown.
// Sub Total / Grand Total are frozen at whatever the order already shows
// (the paper-bill ground truth) when the modal opens; item edits here can
// never move them. Only Delivery Charge / Advance / Extra Payment are
// allowed to move the Grand Total, same as they always could. See
// DebugMode.md.
// ─────────────────────────────────────────────
let _dboFrozenSubtotal = 0, _dboFrozenDiscountAmount = 0, _dboFrozenGrandTotal = 0;

async function showDebugEditOrderModal(id){
  if(!isAdmin()) return toast('Admin permission required','error');
  const [order,customers,existingItems,allCatalog,invoice]=await Promise.all([
    DB.getOrder(id),
    DB.getCustomers(),
    DB.getOrderItems(id),
    DB.getItems(),
    DB.getInvoiceByOrder(id)
  ]);
  if(!order)return toast('Order not found','error');
  _editOrderCatalog=allCatalog;

  // Freeze the ground-truth numbers once, at open time — never recomputed
  // from edited item rows.
  _dboFrozenSubtotal = existingItems.reduce((s,i)=>s+(parseFloat(i.quantity)||0)*(parseFloat(i.price)||0),0);
  _dboFrozenDiscountAmount = parseFloat(order.discount_amount)||0;
  _dboFrozenGrandTotal = parseFloat(order.total_amount)||0;

  const itemRows=existingItems.map(item=>{
    const cat=allCatalog.find(c=>c.id===item.catalog_item_id);
    const label=escapeHtml(cat?`${cat.item_id} — ${cat.item_name}`:item.item_name);
    const dryCleanP  = cat ? (cat.dry_clean_price||0)   : 0;
    const washPressP = cat ? (cat.wash_press_price||0)  : 0;
    const washDryP   = cat ? (cat.wash_dry_price||0)    : 0;
    const curSvcItem = item.service_type || 'Wash & Press';
    const curPrice   = item.price || 0;
    const svcOpts = ['Dry Clean','Wash & Press','Wash & Dry'].map(s=>`<option value="${s}" ${s===curSvcItem?'selected':''}>${s}</option>`).join('');
    return `<div class="dbo-item-row" style="display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:6px;align-items:center;">
      <div class="item-picker-wrap" style="position:relative;" data-selected-id="${item.catalog_item_id||''}" data-dry-clean="${dryCleanP}" data-wash-press="${washPressP}" data-wash-dry="${washDryP}">
        <input class="form-input item-picker-input" value="${label}" autocomplete="off" placeholder="Type to search item..."
          oninput="filterDboItemDropdown(this)" onfocus="showDboItemDropdown(this)" onblur="setTimeout(()=>hideDboItemDropdown(this),200)" style="width:100%;"/>
        <div class="item-picker-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
      </div>
      <select class="form-input form-select dbo-svc" onchange="onDboSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">${svcOpts}</select>
      <input type="number" class="form-input dbo-qty" value="${item.quantity}" min="1" oninput="calcDebugOrderTotal()"/>
      <input type="number" class="form-input dbo-price" value="${curPrice}" min="0" oninput="calcDebugOrderTotal()" placeholder="Price"/>
      <button class="btn btn-danger btn-icon btn-sm" onclick="this.closest('.dbo-item-row').remove();calcDebugOrderTotal()"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');

  const delCharge = order.delivery_charge || (invoice ? (invoice.delivery_charge||0) : 0);

  createModal('debug-edit-order-modal',`Debug Edit Order: ${order.batch_id}`,`
    <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 14px;border-radius:8px;font-size:0.85em;margin-bottom:14px;">
      <i class="fas fa-bug"></i> <strong>Debug Mode</strong> — item edits below never change this order's Sub Total / Grand Total (frozen at ${formatCurrency(_dboFrozenGrandTotal)}). Only Delivery Charge / Advance / Extra Payment can move the total.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column: span 2;"><label class="form-label">Customer (locked)</label>
        <input class="form-input" value="${escapeHtml(customers.find(c=>c.id===order.customer_id)?.hotel_name||'—')}" disabled/>
      </div>
      <div class="form-group"><label class="form-label">Pickup Date</label>
        <input type="date" class="form-input" id="dbo-pickup" value="${order.pickup_date||''}"/></div>
      <div class="form-group"><label class="form-label">Delivery Date</label>
        <input type="date" class="form-input" id="dbo-delivery" value="${order.delivery_date||''}"/></div>
      <div class="form-group"><label class="form-label">Advance Payment (LKR)</label>
        <input type="number" class="form-input" id="dbo-advance" value="${order.advance_payment||0}" min="0" oninput="calcDebugOrderTotal()"/></div>
      <div class="form-group"><label class="form-label">Extra Payments (LKR)</label>
        <input type="number" class="form-input" id="dbo-extra-payment" value="${order.extra_payment||0}" min="0" oninput="calcDebugOrderTotal()"/></div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px;">
      <span style="font-family:'Playfair Display',serif;font-size:1em;font-weight:700;color:var(--primary);">Order Items</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="showQuickAddItemModal('debug-order')"><i class="fas fa-box-open"></i> Add New Item</button>
        <button class="btn btn-secondary btn-sm" onclick="addDebugOrderItemRow()"><i class="fas fa-plus"></i> Add Row</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:4px;padding:0 2px;">
      <span class="form-label">Item</span>
      <span class="form-label">Service Type</span>
      <span class="form-label">Qty</span>
      <span class="form-label">Price (LKR)</span>
      <span></span>
    </div>
    <div id="dbo-items-container">${itemRows}</div>

    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">
      <div class="form-group" style="max-width:260px;">
        <label class="form-label">Delivery Charge (LKR)</label>
        <input type="number" class="form-input" id="dbo-delivery-charge" value="${delCharge}" min="0" step="0.01" oninput="calcDebugOrderTotal()"/>
      </div>
    </div>

    <div style="margin-top:10px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:0.85em;" id="dbo-discrepancy"></div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;margin-top:4px;">
      <strong style="font-size:1.15em;">Grand Total (frozen): <span id="dbo-total">${formatCurrency(_dboFrozenGrandTotal)}</span></strong>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="hideModal('debug-edit-order-modal')">Cancel [Esc]</button>
        <button class="btn btn-primary" style="background:#dc2626;border-color:#dc2626;" onclick="saveDebugOrder(${id})"><i class="fas fa-save"></i> Save Debug Edit</button>
      </div>
    </div>`,'modal-lg');
  showModal('debug-edit-order-modal');
  calcDebugOrderTotal();
}

function showDboItemDropdown(input){const wrap=input.closest('.item-picker-wrap');_renderItemList(wrap.querySelector('.item-picker-dropdown'),_editOrderCatalog);wrap.querySelector('.item-picker-dropdown').style.display='block';}
function hideDboItemDropdown(input){const wrap=input.closest('.item-picker-wrap');if(wrap)wrap.querySelector('.item-picker-dropdown').style.display='none';}
function filterDboItemDropdown(input){
  const wrap=input.closest('.item-picker-wrap');
  const q=input.value.toLowerCase();
  _renderItemList(wrap.querySelector('.item-picker-dropdown'),q?_editOrderCatalog.filter(i=>i.item_name.toLowerCase().includes(q)||i.item_id.toLowerCase().includes(q)):_editOrderCatalog);
  wrap.querySelector('.item-picker-dropdown').style.display='block';
}

function onDboSvcChange(sel){
  const row=sel.closest('.dbo-item-row');
  const wrap=row?.querySelector('.item-picker-wrap');
  const priceInput=row?.querySelector('.dbo-price');
  if(wrap && priceInput) _applyServicePrice(wrap, sel.value, priceInput);
  calcDebugOrderTotal();
}

async function addDebugOrderItemRow(){
  const container=document.getElementById('dbo-items-container');
  const row=document.createElement('div'); row.className='dbo-item-row';
  row.style.cssText='display:grid;grid-template-columns:2.5fr 1.6fr 0.8fr 1.2fr auto;gap:8px;margin-bottom:6px;align-items:center;';
  row.innerHTML=`<div class="item-picker-wrap" style="position:relative;" data-selected-id="" data-dry-clean="0" data-wash-press="0" data-wash-dry="0">
    <input class="form-input item-picker-input" value="" autocomplete="off" placeholder="Type to search item..."
      oninput="filterDboItemDropdown(this)" onfocus="showDboItemDropdown(this)" onblur="setTimeout(()=>hideDboItemDropdown(this),200)" style="width:100%;"/>
    <div class="item-picker-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
  </div>
  <select class="form-input form-select dbo-svc" onchange="onDboSvcChange(this)" style="font-size:0.82em;padding:6px 8px;">
    <option value="Dry Clean">Dry Clean</option>
    <option value="Wash &amp; Press" selected>Wash &amp; Press</option>
    <option value="Wash &amp; Dry">Wash &amp; Dry</option>
  </select>
  <input type="number" class="form-input dbo-qty" value="1" min="1" oninput="calcDebugOrderTotal()"/>
  <input type="number" class="form-input dbo-price" value="0" min="0" oninput="calcDebugOrderTotal()" placeholder="Price"/>
  <button class="btn btn-danger btn-icon btn-sm" onclick="this.closest('.dbo-item-row').remove();calcDebugOrderTotal()"><i class="fas fa-trash"></i></button>`;
  container.appendChild(row);
}

function calcDebugOrderTotal(){
  let itemsTotal=0;
  document.querySelectorAll('.dbo-item-row').forEach(row=>{
    const qty=parseFloat(row.querySelector('.dbo-qty')?.value)||0;
    const price=parseFloat(row.querySelector('.dbo-price')?.value)||0;
    itemsTotal+=qty*price;
  });
  const delivery=parseFloat(document.getElementById('dbo-delivery-charge')?.value)||0;
  const extra=parseFloat(document.getElementById('dbo-extra-payment')?.value)||0;

  // Grand total is ALWAYS derived from the frozen subtotal/discount, never
  // from itemsTotal — item edits can never move it.
  const grandTotal=Math.max(0,_dboFrozenSubtotal-_dboFrozenDiscountAmount+delivery+extra);
  const totalEl=document.getElementById('dbo-total');
  if(totalEl) totalEl.textContent=formatCurrency(grandTotal);

  const diff=itemsTotal-_dboFrozenSubtotal;
  const box=document.getElementById('dbo-discrepancy');
  if(box){
    const ok=Math.abs(diff)<0.01;
    box.style.color=ok?'#166534':'#92400e';
    box.innerHTML=`Items Total: <strong>${formatCurrency(itemsTotal)}</strong> &nbsp;|&nbsp; Target Sub Total: <strong>${formatCurrency(_dboFrozenSubtotal)}</strong> &nbsp;|&nbsp; Diff: <strong>${diff>=0?'+':''}${formatCurrency(diff)}</strong>${ok?' ✓ matches':''}`;
  }
}

async function saveDebugOrder(orderId){
  if(!isAdmin()) return toast('Admin permission required','error');
  const saveBtn=document.querySelector('#debug-edit-order-modal .btn-primary');
  if(saveBtn && saveBtn.disabled) return;
  if(saveBtn) saveBtn.disabled=true;
  try {
    const pickup=document.getElementById('dbo-pickup').value;
    const delivery=document.getElementById('dbo-delivery').value;
    const advance=parseFloat(document.getElementById('dbo-advance').value)||0;
    const extra=parseFloat(document.getElementById('dbo-extra-payment').value)||0;
    const deliveryCharge=parseFloat(document.getElementById('dbo-delivery-charge').value)||0;

    const orderItems=[]; let valid=true;
    document.querySelectorAll('.dbo-item-row').forEach(row=>{
      const wrap=row.querySelector('.item-picker-wrap');
      const itemId=parseInt(wrap?.dataset.selectedId);
      const itemTxt=wrap?.querySelector('.item-picker-input')?.value||'';
      const svc=row.querySelector('.dbo-svc')?.value||'Wash & Press';
      const qty=parseFloat(row.querySelector('.dbo-qty')?.value)||0;
      const price=parseFloat(row.querySelector('.dbo-price')?.value)||0;
      if(!itemId){ valid=false; return; }
      orderItems.push({catalog_item_id:itemId,item_name:itemTxt.split('—')[1]?.trim()||itemTxt,quantity:qty,service_type:svc,price,subtotal:qty*price});
    });
    if(!valid){ toast('Please select an item for every row','error'); return; }

    // Grand total recomputed ONLY from the frozen subtotal/discount + live
    // delivery/extra — never from orderItems.
    const grandTotal=Math.max(0,_dboFrozenSubtotal-_dboFrozenDiscountAmount+deliveryCharge+extra);
    const status=advance>=grandTotal?'Paid':'Unpaid';

    const order=await DB.getOrder(orderId);

    await DB.updateOrderWithItems(orderId,{
      pickup_date:     pickup,
      delivery_date:   delivery,
      advance_payment: advance,
      extra_payment:   extra,
      delivery_charge: deliveryCharge,
      total_amount:    grandTotal,
      status,
      debug_edited_by: currentUser?.display_name||null,
      debug_edited_at: new Date().toISOString()
      // customer_id, driver_id, discount_rate, discount_amount deliberately
      // omitted — Debug Mode never touches them.
    }, orderItems);

    const existingInv=await DB.getInvoiceByOrder(orderId);
    if(existingInv){
      await DB.updateInvoice(existingInv.id,{
        total_amount:     grandTotal,
        advance_payment:  advance,
        extra_payment:    extra,
        delivery_charge:  deliveryCharge,
        delivery_date:    delivery,
        balance:          Math.max(0,grandTotal-advance),
        paid_status:      status
        // subtotal_before_discount / discount_amount / discount_rate left untouched (frozen).
      });
    }

    await DB.logAction('Debug Edit Order',`Debug-edited order #${order?.batch_id||orderId} items (Grand Total unchanged: ${formatCurrency(grandTotal)})`,{order_id:orderId,total_amount:grandTotal},'Order');

    clearItemsCache();
    hideModal('debug-edit-order-modal');
    toast('Order updated in Debug Mode');
    await _refreshOrdersTable();
  } catch(err){
    console.error('saveDebugOrder error:',err);
    toast('Failed to save debug edit: '+(err.message||err),'error');
  } finally {
    if(saveBtn) saveBtn.disabled=false;
  }
}

// ─────────────────────────────────────────────
// MARK PENDING / MARK RETURNED — order_item_flags ledger, reached from a
// standalone button on the Orders list (and the bill preview) instead of
// buried inside Edit Order. Tick any number of items and set how many of
// each, in one submission — no order-item-by-order-item single prompt,
// and no need to open Edit at all. Fires immediately as its own
// DB.flagOrderItems call, independent of any order Save.
//
// "Pending" is gated to canEditOrders() (an office/admin decision made
// during processing, per NewChange.md); "Returned" is gated to the wider
// canMarkReturned() so drivers get this one exception to the "drivers
// cannot edit orders" rule (Solution.md §4.2) without gaining any other
// order-edit capability — either way this only ever inserts a ledger row,
// never touches orders/order_items.
// ─────────────────────────────────────────────
async function showMarkFlagModal(orderId,flagType){
  const allowed = flagType==='pending' ? canEditOrders() : canMarkReturned();
  if(!allowed) return toast('Permission required','error');
  const [order,items]=await Promise.all([DB.getOrder(orderId),DB.getOrderItems(orderId)]);
  if(!order) return toast('Order not found','error');
  if(!items.length) return toast('This order has no items','error');
  const isPending = flagType==='pending';
  const title = isPending ? 'Mark Items Pending' : 'Mark Returned Items';
  const verb = isPending ? 'should be kept back as pending (not delivered yet)' : 'the customer handed back';
  const icon = isPending ? 'fa-hourglass-half' : 'fa-rotate-left';
  createModal('mark-flag-modal',`${title} — ${escapeHtml(order.batch_id||'')}`,`
    <div style="margin-bottom:14px;font-size:0.9em;color:var(--text-muted);">Tick any items ${verb}, and how many.</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${items.map(i=>`
        <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          <input type="checkbox" class="mf-check" data-item-id="${i.id}" data-item-name="${escapeHtml(i.item_name)}" data-max-qty="${i.quantity}" onchange="toggleMfQtyInput(this)"/>
          <span style="flex:1;">${escapeHtml(i.item_name)} <span style="color:var(--text-muted);">(qty on order: ${i.quantity})</span></span>
          <input type="number" class="mf-qty" data-item-id="${i.id}" value="" placeholder="Qty" min="1" max="${i.quantity}" disabled style="width:70px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);"/>
        </label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
      <button class="btn btn-secondary" onclick="hideModal('mark-flag-modal')">Cancel</button>
      <button class="btn btn-primary" id="mf-submit-btn"><i class="fas ${icon}"></i> ${title}</button>
    </div>`);
  showModal('mark-flag-modal');
  document.getElementById('mf-submit-btn').onclick=()=>submitMarkFlag(orderId,order.customer_id,flagType);
}

function toggleMfQtyInput(checkbox){
  const qtyInput=document.querySelector(`.mf-qty[data-item-id="${checkbox.dataset.itemId}"]`);
  if(qtyInput) qtyInput.disabled=!checkbox.checked;
}

async function submitMarkFlag(orderId,customerId,flagType){
  const flags=[];
  document.querySelectorAll('.mf-check:checked').forEach(cb=>{
    const itemId=cb.dataset.itemId;
    const maxQty=parseFloat(cb.dataset.maxQty)||0;
    const qtyInput=document.querySelector(`.mf-qty[data-item-id="${itemId}"]`);
    let qty=parseFloat(qtyInput?.value)||maxQty;
    if(qty<=0) qty=maxQty;
    if(qty>maxQty) qty=maxQty;
    flags.push({order_item_id:parseInt(itemId),item_name:cb.dataset.itemName,quantity:qty,flag_type:flagType});
  });
  if(!flags.length) return toast('Select at least one item','error');
  const btn=document.getElementById('mf-submit-btn');
  if(btn) btn.disabled=true;
  try {
    await DB.flagOrderItems(orderId,customerId,flags);
    const order = await DB.getOrder(orderId);
    const batchId = order ? order.batch_id : '#' + orderId;
    const label = flagType==='pending' ? 'Mark Pending' : 'Mark Returned';
    // flagOrderItems (an RPC) doesn't hand back the ids it just inserted, so
    // pick them up with a follow-up read: newest row per order_item_id with
    // this flag_type/status is what we just created.
    const sourceFlags = await DB.getFlagsBySourceOrder(orderId);
    const newFlagIds = flags.map(f => {
      const matches = sourceFlags.filter(sf => String(sf.order_item_id) === String(f.order_item_id) && sf.flag_type === flagType && sf.status === flagType);
      matches.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      return matches[0]?.id;
    }).filter(Boolean);
    await DB.logAction(label,`Marked ${flags.length} item type(s) as ${flagType} on order #${batchId}`,{order_id:orderId,batch_id:batchId,flags,undo: newFlagIds.length ? { type: 'delete_flags', flag_ids: newFlagIds } : undefined},'Order');
    hideModal('mark-flag-modal');
    toast(`Item(s) marked ${flagType}`);
    if(document.getElementById('orders-table-body')) _refreshOrdersTable();
    if(document.getElementById('edit-order-modal')) showEditOrderModal(orderId);
    refreshCustomerDetailIfOpen(customerId);
  } catch(err){
    console.error('mark flag error:',err);
    toast('Failed to update items: '+(err.message||err),'error');
  } finally {
    if(btn) btn.disabled=false;
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
  <button class="btn btn-danger btn-icon btn-sm" onclick="this.closest('.eo-item-row').remove();calcEditOrderTotal()"><i class="fas fa-trash"></i></button>`;
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
  // Snapshot pre-edit state for Undo — captured now, before anything below
  // mutates it.
  const previousItemsRaw = await DB.getOrderItems(orderId);
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
  const previousInvoice = existingInv ? { ...existingInv } : null;
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
    // This modal has no driver field, so the edit must carry the existing
    // assignment forward. Writing null here detached the order from its
    // driver on every save — it dropped off that driver's "Assigned to Me"
    // list, reappeared as unassigned to everyone, and silently zeroed the
    // Driver Report, which aggregates on driver_id.
    driver_id:       originalOrder ? (originalOrder.driver_id ?? null) : null,
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
  const previousOrderData = originalOrder ? {
    customer_id: originalOrder.customer_id,
    driver_id: originalOrder.driver_id,
    pickup_date: originalOrder.pickup_date,
    delivery_date: originalOrder.delivery_date,
    status: originalOrder.status,
    advance_payment: originalOrder.advance_payment,
    extra_payment: originalOrder.extra_payment,
    delivery_charge: originalOrder.delivery_charge,
    discount_rate: originalOrder.discount_rate,
    discount_amount: originalOrder.discount_amount,
    total_amount: originalOrder.total_amount,
    is_pickup_only: originalOrder.is_pickup_only
  } : null;
  const previousItemsForUndo = previousItemsRaw.map(i => ({ catalog_item_id: i.catalog_item_id, item_name: i.item_name, quantity: i.quantity, service_type: i.service_type, price: i.price, subtotal: i.subtotal }));

  await DB.logAction(
    'Edit Order',
    `Updated order #${batchId} (Total: LKR ${eoGrandTotal.toLocaleString()}, Status: ${status})`,
    { order_id: orderId, batch_id: batchId, total_amount: eoGrandTotal, status: status,
      undo: previousOrderData ? { type: 'revert_edit', entity_type: 'Order', order_id: orderId, previous_order: previousOrderData, previous_items: previousItemsForUndo, previous_invoice: previousInvoice } : undefined },
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
    loadOpenFlagsForAddOrder(customerId);
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

// ─────────────────────────────────────────────
// OUTSTANDING PENDING/RETURNED ITEMS — shown in the Add Order modal once a
// customer is picked, so staff don't forget items owed from an earlier
// order (NewChange.md: "sometimes our employees forgot about those
// pending items"). Checked flags are passed to
// create_order_with_items_and_clear_flags as p_clears so the new order and
// the flag-clearing happen atomically. Quantity is editable and capped at
// the flag's outstanding amount — clearing less than that splits the flag
// (see clear_order_item_flags in supabase_order_item_flags_migration.sql),
// leaving the remainder open for a future order.
// ─────────────────────────────────────────────
async function loadOpenFlagsForAddOrder(customerId) {
  const wrap = document.getElementById('ao-open-flags-wrap');
  const list = document.getElementById('ao-open-flags-list');
  if (!wrap || !list) return;
  if (!customerId) { wrap.style.display = 'none'; list.innerHTML = ''; return; }

  let flags = [];
  try { flags = await DB.getOpenFlagsForCustomer(customerId); } catch (e) { flags = []; }
  if (!flags.length) { wrap.style.display = 'none'; list.innerHTML = ''; return; }

  // One card per source order, per your "show them with cards with order
  // IDs" ask — groups multiple flags from the same old order together
  // instead of one flat list.
  const orderIds = [...new Set(flags.map(f => f.order_id))];
  const sourceOrders = await Promise.all(orderIds.map(oid => DB.getOrder(oid).catch(() => null)));
  const orderMap = {};
  sourceOrders.forEach(o => { if (o) orderMap[o.id] = o; });
  const byOrder = {};
  flags.forEach(f => { (byOrder[f.order_id] = byOrder[f.order_id] || []).push(f); });

  wrap.style.display = 'block';
  list.innerHTML = Object.keys(byOrder).map(orderId => {
    const o = orderMap[orderId];
    return `<div style="background:#fff;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;">
      <div style="font-weight:700;font-size:0.82em;color:#78350f;margin-bottom:8px;">
        <i class="fas fa-box"></i> Order ${escapeHtml(o?.batch_id || ('#' + orderId))}
        <span style="font-weight:400;color:var(--text-muted);margin-left:4px;">${o ? formatDate(o.pickup_date) : ''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${byOrder[orderId].map(f => `
          <label style="display:flex;align-items:center;gap:8px;font-size:0.85em;">
            <input type="checkbox" class="ao-flag-check" data-flag-id="${f.id}" data-max-qty="${f.quantity}" onchange="toggleAoFlagQtyInput(this)"/>
            <span style="flex:1;">
              <span style="font-weight:700;color:${f.flag_type === 'pending' ? '#92400e' : '#7c2d12'};text-transform:capitalize;">${f.flag_type}</span>:
              ${escapeHtml(f.item_name)} × ${f.quantity}
            </span>
            <input type="number" class="ao-flag-qty" data-flag-id="${f.id}" value="${f.quantity}" min="1" max="${f.quantity}" disabled style="width:58px;padding:3px 5px;border-radius:6px;border:1px solid var(--border);"/>
          </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleAoFlagQtyInput(checkbox) {
  const qtyInput = document.querySelector(`.ao-flag-qty[data-flag-id="${checkbox.dataset.flagId}"]`);
  if (qtyInput) qtyInput.disabled = !checkbox.checked;
}

function collectAoFlagClears() {
  const clears = [];
  document.querySelectorAll('.ao-flag-check:checked').forEach(cb => {
    const flagId = parseInt(cb.dataset.flagId);
    const maxQty = parseFloat(cb.dataset.maxQty) || 0;
    const qtyInput = document.querySelector(`.ao-flag-qty[data-flag-id="${flagId}"]`);
    let qty = parseFloat(qtyInput?.value) || maxQty;
    if (qty <= 0) qty = maxQty;
    if (qty > maxQty) qty = maxQty;
    clears.push({ flag_id: flagId, quantity: qty });
  });
  return clears;
}

// Resolves the invoice a bill should be printed from for one order.
// A "Single Invoice" batch payment folds this order's own invoice into a
// shared one keyed to a different order — look that up (see invoice.js)
// before assuming this order has no invoice at all. Orders with no invoice
// at all (still unpaid) get a virtual invoice built from the order itself
// so an unpaid order can still be printed as a bill.
async function _resolveInvoiceForOrderPrint(order) {
  const existing = await _findInvoiceForOrder(order.id);
  if (existing) return existing;

  const orderItems = await DB.getOrderItems(order.id);
  const itemsSubtotal = orderItems.reduce((s, i) => s + (i.subtotal || 0), 0);

  return {
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

async function printInvoiceByOrder(orderId) {
  const order = await DB.getOrder(orderId);
  if (!order) return toast('Order not found', 'error');
  const inv = await _resolveInvoiceForOrderPrint(order);
  printInvoice(inv);
}

// ─────────────────────────────────────────────
// BATCH PRINT — tick orders in the Orders table, then print each ticked
// order as its OWN bill. Two modes, because "separate PDFs" means two
// different things depending on how the user saves them:
//
//   combined — one print window holding every bill, each forced onto its
//              own page. One dialog, one "Save as PDF" → a single file
//              whose pages are the individual bills. Popup-blocker safe.
//   separate — one print window (and so one Save-as-PDF dialog) PER order,
//              giving a genuinely separate PDF file per bill. Needs
//              pop-ups allowed, so the count is capped and confirmed.
//
// Both reuse buildInvoiceBillHtml (invoice.js), so a batch-printed bill is
// byte-for-byte the same document as the row's own Print button produces.
// ─────────────────────────────────────────────
const BATCH_PRINT_SEPARATE_LIMIT = 20;

function batchPrintSelectedOrders() {
  const ids = Array.from(ordersSelectedIds);
  if (!ids.length) return toast('Select at least one order to print', 'error');

  createModal('batch-print-modal', `Batch Print ${ids.length} Bill(s)`, `
    <div style="font-size:0.9em;color:var(--text-muted);margin-bottom:14px;">
      Each selected order prints as its own separate bill. Choose how you want to save them.
    </div>
    <div class="form-group">
      <label style="display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:10px;">
        <input type="radio" name="bp-mode" value="combined" checked style="margin-top:3px;"/>
        <span>
          <strong>One PDF, one bill per page</strong>
          <div style="font-size:0.82em;color:var(--text-muted);margin-top:3px;">
            A single print dialog. Save as PDF and you get one file with ${ids.length} page-separated bill(s).
          </div>
        </span>
      </label>
      <label style="display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="radio" name="bp-mode" value="separate" style="margin-top:3px;"/>
        <span>
          <strong>Separate PDF file per bill</strong>
          <div style="font-size:0.82em;color:var(--text-muted);margin-top:3px;">
            Opens ${ids.length} print window(s) — one Save-as-PDF dialog each. Pop-ups must be allowed for this site.
          </div>
        </span>
      </label>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
      <button class="btn btn-secondary" onclick="hideModal('batch-print-modal')">Cancel</button>
      <button class="btn btn-primary" id="bp-submit-btn"><i class="fas fa-print"></i> Print</button>
    </div>`);
  showModal('batch-print-modal');
  document.getElementById('bp-submit-btn').onclick = () => {
    const mode = document.querySelector('input[name="bp-mode"]:checked')?.value || 'combined';
    hideModal('batch-print-modal');
    runBatchPrint(ids, mode);
  };
}

// Builds every selected order's bill up front. Orders that fail to build
// are collected rather than aborting the run — one bad order shouldn't cost
// the user the other nineteen.
async function _buildBatchBills(orderIds) {
  const bills = [], failed = [];
  // Fetch the order list once, and let the first bill's company-header
  // lookup be reused by the rest (cacheSettings) — otherwise a 20-bill run
  // repeats the same six settings queries 20 times over.
  clearBillSettingsCache();
  const allOrders = await DB.getOrders();
  const orderMap = Object.fromEntries(allOrders.map(o => [o.id, o]));

  for (let i = 0; i < orderIds.length; i++) {
    const id = orderIds[i];
    const order = orderMap[id];
    const subEl = document.getElementById('processing-sublabel');
    if (subEl) subEl.textContent = `Building bill ${i + 1} of ${orderIds.length}...`;
    if (!order) { failed.push(`#${id} (not found)`); continue; }
    try {
      const inv = await _resolveInvoiceForOrderPrint(order);
      // includePayments:false keeps a batch-printed bill identical to the
      // one the row's Print button produces for the same order.
      const { html } = await buildInvoiceBillHtml(inv, { includePayments: false, cacheSettings: true });
      bills.push({ orderId: id, batchId: order.batch_id || `#${id}`, html });
    } catch (err) {
      console.error('batch print: failed to build bill for order', id, err);
      failed.push(order.batch_id || `#${id}`);
    }
  }
  clearBillSettingsCache();
  return { bills, failed };
}

async function runBatchPrint(orderIds, mode) {
  if (mode === 'separate' && orderIds.length > BATCH_PRINT_SEPARATE_LIMIT) {
    return toast(`Separate-file printing is capped at ${BATCH_PRINT_SEPARATE_LIMIT} orders at a time (${orderIds.length} selected). Deselect some, or use the one-PDF option.`, 'error');
  }

  // Pop-up blockers only trust window.open() calls made in the same task as
  // the user's click, and building the bills is async — so for separate-file
  // mode every window is opened NOW, blank, and written into once its bill
  // is ready. Opening them afterwards would get all but the first blocked.
  let preOpened = null;
  if (mode === 'separate') {
    preOpened = orderIds.map(() => window.open('', '_blank'));
    if (preOpened.some(w => !w)) {
      preOpened.forEach(w => { try { w && w.close(); } catch (e) {} });
      return toast('Please allow pop-ups for this site to print separate PDF files', 'warning');
    }
    preOpened.forEach(w => {
      w.document.write('<title>Preparing bill…</title><body style="font-family:sans-serif;padding:40px;color:#64748b;">Preparing bill…</body>');
      w.document.close();
    });
  }

  showProcessingOverlay('Batch Printing', `Preparing ${orderIds.length} bill(s)...`);
  let bills, failed;
  try {
    ({ bills, failed } = await _buildBatchBills(orderIds));
  } catch (err) {
    console.error('batch print failed:', err);
    preOpened?.forEach(w => { try { w.close(); } catch (e) {} });
    return toast('Batch print failed: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }

  if (!bills.length) {
    preOpened?.forEach(w => { try { w.close(); } catch (e) {} });
    return toast('No bills could be generated for the selected orders', 'error');
  }

  if (mode === 'separate') {
    // One window per successfully built bill; any window left over (an order
    // whose bill couldn't be built) is closed rather than left hanging.
    bills.forEach((b, i) => Print.openPrintWindow(b.html, `Order_Print_${b.batchId}`, preOpened[i]));
    preOpened.slice(bills.length).forEach(w => { try { w.close(); } catch (e) {} });
  } else {
    // page-break-after on every bill but the last: N bills → exactly N
    // pages' worth of breaks, with no trailing blank page.
    const combined = bills.map((b, idx) => `
      <div style="${idx < bills.length - 1 ? 'page-break-after:always;break-after:page;' : ''}">
        ${b.html}
      </div>`).join('');
    const win = Print.openPrintWindow(combined, `Batch_Print_${bills.length}_Bills`);
    if (!win) return;
  }

  const msg = `Printing ${bills.length} bill(s)` + (failed.length ? ` — skipped ${failed.length} (${failed.join(', ')})` : '');
  toast(msg, failed.length ? 'warning' : 'success');
}

