// pendings.js - Pendings & Returns Module
//
// The canonical place to review every open (and historical) order_item_flags
// row — items kept back as "pending" because they couldn't be delivered on
// time, or items a customer "returned" after delivery. See
// supabase_order_item_flags_migration.sql for the ledger design and
// Solution.md §4.6 for the spec this implements.

const PendingsModule = {
  _flags: [],
  _customers: [],
  _orders: [],
  _statusFilter: '',
  _typeFilter: '',
  _search: '',

  async init() {
    await this.loadData();
    this.render();
  },

  async loadData() {
    const [flags, customers, orders] = await Promise.all([
      DB.getAllFlags(),
      DB.getCustomers(),
      DB.getOrders()
    ]);
    this._flags = flags || [];
    this._customers = customers || [];
    this._orders = orders || [];
  },

  _customerName(id) {
    const c = this._customers.find(c => c.id === id);
    return c ? c.hotel_name : '—';
  },
  _orderBatch(id) {
    if (id == null) return '—';
    const o = this._orders.find(o => o.id === id);
    return o ? o.batch_id : ('#' + id);
  },

  render() {
    const container = document.getElementById('page-pendings');
    if (!container) return;

    const openPendingCount = this._flags.filter(f => f.flag_type === 'pending' && f.status === 'pending').length;
    const openReturnedCount = this._flags.filter(f => f.flag_type === 'returned' && f.status === 'returned').length;
    const clearedCount = this._flags.filter(f => f.status === 'cleared').length;

    container.innerHTML = `
      <div class="p-4 sm:p-6 space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-clock-rotate-left text-amber-500"></i>
              Pendings &amp; Returns
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Every item kept back as pending or handed back by a customer — across all orders and customers, so nothing gets forgotten.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Open Pending</div>
            <div class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">${openPendingCount}</div>
          </div>
          <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Open Returned</div>
            <div class="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">${openReturnedCount}</div>
          </div>
          <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cleared</div>
            <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">${clearedCount}</div>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-wrap gap-3 items-center">
          <input type="text" id="pnd-search" placeholder="Search customer or item..." class="form-input" style="flex:1;min-width:200px;"
            oninput="PendingsModule.setSearch(this.value)"/>
          <select id="pnd-status-filter" class="form-input form-select" style="max-width:160px;" onchange="PendingsModule.setStatusFilter(this.value)">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="returned">Returned</option>
            <option value="cleared">Cleared</option>
          </select>
          <select id="pnd-type-filter" class="form-input form-select" style="max-width:160px;" onchange="PendingsModule.setTypeFilter(this.value)">
            <option value="">Pending + Returned</option>
            <option value="pending">Pending only</option>
            <option value="returned">Returned only</option>
          </select>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Source Order #</th>
                  <th>Item</th>
                  <th style="text-align:center;">Qty</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Flagged Date</th>
                  <th>Cleared Date</th>
                  <th>Cleared-In Order #</th>
                  <th style="text-align:center;">Action</th>
                </tr>
              </thead>
              <tbody id="pnd-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    this.refreshTable();
  },

  setSearch(v) { this._search = v; this.refreshTable(); },
  setStatusFilter(v) { this._statusFilter = v; this.refreshTable(); },
  setTypeFilter(v) { this._typeFilter = v; this.refreshTable(); },

  refreshTable() {
    const tbody = document.getElementById('pnd-tbody');
    if (!tbody) return;

    const q = (this._search || '').toLowerCase();
    let rows = this._flags.filter(f => {
      if (this._statusFilter && f.status !== this._statusFilter) return false;
      if (this._typeFilter && f.flag_type !== this._typeFilter) return false;
      if (q) {
        const custName = this._customerName(f.customer_id).toLowerCase();
        if (!custName.includes(q) && !(f.item_name || '').toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const statusPill = (status) => {
      const map = {
        pending: 'background:#fef9c3;color:#92400e;',
        returned: 'background:#fee2e2;color:#991b1b;',
        cleared: 'background:#dcfce7;color:#166534;'
      };
      return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.78em;font-weight:700;text-transform:capitalize;${map[status] || ''}">${status}</span>`;
    };

    tbody.innerHTML = rows.length === 0
      ? `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">No pending or returned items found</td></tr>`
      : rows.map(f => `
        <tr>
          <td>${escapeHtml(this._customerName(f.customer_id))}</td>
          <td>${escapeHtml(this._orderBatch(f.order_id))}</td>
          <td>${escapeHtml(f.item_name)}</td>
          <td style="text-align:center;">${f.quantity}</td>
          <td style="text-transform:capitalize;">${escapeHtml(f.flag_type)}</td>
          <td>${statusPill(f.status)}</td>
          <td>${formatDate(f.created_at)}</td>
          <td>${f.cleared_at ? formatDate(f.cleared_at) : '—'}</td>
          <td>${escapeHtml(this._orderBatch(f.cleared_in_order_id))}</td>
          <td style="text-align:center;">
            <div style="display:inline-flex;gap:6px;">
              ${f.status !== 'cleared'
                ? `<button class="btn btn-secondary btn-sm" onclick="PendingsModule.markCleared(${f.id})"><i class="fas fa-check"></i> Mark Cleared</button>`
                : ''}
              ${typeof canDelete === 'function' && canDelete()
                ? `<button class="btn btn-danger btn-sm" onclick="PendingsModule.deleteFlag(${f.id})" title="Permanently delete this record"><i class="fas fa-trash"></i></button>`
                : ''}
            </div>
          </td>
        </tr>`).join('');
  },

  async markCleared(id) {
    confirmDialog('Mark this item as cleared/resolved? Use this when it was resolved without going through a new order.', async () => {
      try {
        await DB.updateFlagStatus(id, 'cleared');
        toast('Marked cleared');
        await this.loadData();
        this.refreshTable();
      } catch (err) {
        console.error('markCleared error:', err);
        toast('Failed to update: ' + (err.message || err), 'error');
      }
    }, 'Mark Cleared', false);
  },

  // Admin-only (see canDelete() gating above the button) — permanently
  // removes the ledger row itself, unlike Mark Cleared which just changes
  // its status. Use for a mistaken/duplicate entry, not routine resolution.
  async deleteFlag(id) {
    confirmDialog('Permanently delete this pending/returned record? This cannot be undone.', async () => {
      try {
        await DB.deleteFlag(id);
        toast('Record deleted');
        await this.loadData();
        this.refreshTable();
      } catch (err) {
        console.error('deleteFlag error:', err);
        toast('Failed to delete: ' + (err.message || err), 'error');
      }
    }, 'Delete', true);
  }
};
