// db.js - Supabase Database
// No hardcoded fallback values here on purpose — this file is committed to
// git, so anything hardcoded here is a permanent secret leak. The real
// values only ever come from config.js, which inject-env.js generates fresh
// at build time from Netlify's environment variables.
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY are missing. config.js was not generated correctly at build time — check Netlify env vars.');
}
const { createClient } = supabase;
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function _q(promise) {
  const { data, error } = await promise;
  if (error) { console.error('Supabase error:', error); throw error; }
  return data;
}

// PostgREST caps any single response at 1000 rows by default — a bulk
// "get everything" query silently truncates past that instead of erroring,
// so tables that grow past 1000 rows quietly lose their tail end forever
// (e.g. order_items ordered by id ascending: newest orders' items just
// vanish). buildQuery must return a FRESH query builder each call (a
// builder can't be re-used after being awaited), so pagination can slide
// its own .range() over it page by page until a short page signals the end.
async function _qAll(buildQuery, pageSize = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const rows = await _q(buildQuery().range(from, from + pageSize - 1));
    all = all.concat(rows || []);
    if (!rows || rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// Orders only ever carry one of these three payment states — anything else
// read back from the DB (nulls, legacy values) collapses to 'Unpaid'.
function normalizeOrderStatus(status) {
  if (status === 'Paid' || status === 'Partially Paid') return status;
  return 'Unpaid';
}

// An empty `<input type="date">` reads back as '' — never as null — so any
// form field the user left blank arrives here as an empty string. Postgres
// rejects '' for a date/timestamp column ("invalid input syntax for type
// date"), and the atomic order RPCs make that worse: they build their SQL
// with format('%L', value) off jsonb_each_text, so '' becomes a literal ''
// in the INSERT rather than a bound null. Saving an order with no delivery
// date therefore failed outright.
//
// Rather than patch each of the ~10 call sites (and re-break on the next
// one added), every write that can carry a date goes through here first.
// Only these exact columns are touched, so the text-typed payment_date
// columns and anything else keep their current behaviour untouched.
const _DATE_COLUMNS = new Set([
  'pickup_date', 'delivery_date', 'credit_due_date', 'issue_date',
  'created_at', 'driver_assigned_at', 'debug_edited_at',
  'start_date', 'end_date', 'date', 'cleared_at', 'deleted_at'
]);
function nullEmptyDates(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (_DATE_COLUMNS.has(key) && (out[key] === '' || out[key] === undefined)) {
      out[key] = null;
    }
  }
  return out;
}

const DB = {
  // ── Settings ──────────────────────────────
  async getSetting(key) {
    const rows = await _q(_sb.from('settings').select('value').eq('key', key).limit(1));
    return rows.length ? rows[0].value : null;
  },
  async setSetting(key, value) {
    await _q(_sb.from('settings').upsert({ key, value }, { onConflict: 'key' }));
  },

  // ── Customers ─────────────────────────────
  async getCustomers() { return _qAll(() => _sb.from('customers').select('*').order('hotel_name').order('id')); },
  async addCustomer(data) {
    const rows = await _q(_sb.from('customers').insert({ created_date: new Date().toISOString(), ...data }).select());
    return rows[0].id;
  },
  async updateCustomer(id, data) { await _q(_sb.from('customers').update(data).eq('id', id)); },
  async getDeletedCustomerOrders() {
    try {
      const val = await DB.getSetting('deleted_customer_orders');
      return val ? JSON.parse(val) : {};
    } catch(e) { return {}; }
  },
  async saveDeletedCustomerOrders(map) {
    await DB.setSetting('deleted_customer_orders', JSON.stringify(map));
  },
  async deleteCustomer(id) {
    const cust = await DB.getCustomer(id);
    const custName = cust ? (cust.hotel_name || 'Deleted Customer') : 'Deleted Customer';

    const orders = await DB.getOrdersByCustomer(id);
    const deletedMap = await DB.getDeletedCustomerOrders();

    deletedMap['cust_' + id] = custName;
    for (const o of (orders || [])) {
      deletedMap['order_' + o.id] = custName;
    }
    await DB.saveDeletedCustomerOrders(deletedMap);

    await _q(_sb.from('orders').update({ customer_id: null }).eq('customer_id', id));
    await _q(_sb.from('customers').delete().eq('id', id));
  },
  async getCustomer(id) {
    const rows = await _q(_sb.from('customers').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },

  // ── Drivers ───────────────────────────────
  async getDrivers() { return _qAll(() => _sb.from('drivers').select('*').order('name').order('id')); },
  async addDriver(data) {
    const rows = await _q(_sb.from('drivers').insert({ created_date: new Date().toISOString(), status: 'available', ...data }).select());
    return rows[0].id;
  },
  async updateDriver(id, data) { await _q(_sb.from('drivers').update(data).eq('id', id)); },
  async deleteDriver(id) {
    await _q(_sb.from('orders').update({ driver_id: null }).eq('driver_id', id));
    await _q(_sb.from('drivers').delete().eq('id', id));
  },
  async getDriver(id) {
    const rows = await _q(_sb.from('drivers').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },

  // ── Vehicles ──────────────────────────────
  // No settings-table JSON mirror anymore (HighIssues.md H-04): it was
  // write-only (its own read fallback could never trigger — an empty array
  // is truthy, so `rows && rows.length >= 0` was always true and returned
  // before the fallback ran) and it let a failed insert/update/delete
  // report success while the real `vehicles` row never changed. Errors now
  // propagate so the caller's own try/catch can surface them.
  async getVehicles() {
    return _qAll(() => _sb.from('vehicles').select('*').order('vehicle_no').order('id'));
  },
  async addVehicle(data) {
    const record = {
      vehicle_no: (data.vehicle_no || '').toUpperCase().trim(),
      category: data.category || 'Car',
      model: data.model || '',
      status: data.status || 'available',
      initial_km: parseFloat(data.initial_km) || 0,
      created_at: new Date().toISOString()
    };
    const rows = await _q(_sb.from('vehicles').insert(record).select());
    return rows[0].id;
  },
  async updateVehicle(id, data) {
    const updateData = { ...data };
    if (updateData.vehicle_no) {
      updateData.vehicle_no = updateData.vehicle_no.toUpperCase().trim();
    }
    await _q(_sb.from('vehicles').update(updateData).eq('id', id));
  },
  async deleteVehicle(id) {
    await _q(_sb.from('vehicles').delete().eq('id', id));
  },
  async getVehicle(id) {
    const rows = await _q(_sb.from('vehicles').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },
  async getVehicleByNo(vehicleNo) {
    if (!vehicleNo) return null;
    const vNo = String(vehicleNo).toUpperCase().trim();
    const rows = await _q(_sb.from('vehicles').select('*').eq('vehicle_no', vNo).limit(1));
    return rows[0] || null;
  },

  // ── Orders ────────────────────────────────
  async getOrders() {
    const [rows, deletedMap] = await Promise.all([
      _qAll(() => _sb.from('orders').select('*').order('created_at', { ascending: false }).order('id', { ascending: false })),
      DB.getDeletedCustomerOrders()
    ]);
    window._deletedCustOrders = deletedMap || {};
    return (rows || []).map(r => { r.status = normalizeOrderStatus(r.status); return r; });
  },
  async addOrder(data) {
    const rows = await _q(_sb.from('orders').insert(nullEmptyDates({ ...data, created_at: new Date().toISOString() })).select());
    return rows[0].id;
  },
  async updateOrder(id, data) { await _q(_sb.from('orders').update(nullEmptyDates(data)).eq('id', id)); },
  // Atomic order+items create/update: order row and its line items are
  // written in one Postgres transaction (RPC), so a failed items insert
  // can never leave behind an order with zero items. See
  // supabase_atomic_order_rpc_migration.sql. Fails loudly on error —
  // no silent fallback — same reasoning as _generateSequentialId below.
  async createOrderWithItems(orderData, items) {
    const { data, error } = await _sb.rpc('create_order_with_items', { p_order: nullEmptyDates(orderData), p_items: items || [] });
    if (error) { console.error('create_order_with_items failed:', error); throw error; }
    return data;
  },
  async updateOrderWithItems(orderId, orderData, items) {
    const { error } = await _sb.rpc('update_order_with_items', { p_order_id: orderId, p_order: nullEmptyDates(orderData), p_items: items || [] });
    if (error) { console.error('update_order_with_items failed:', error); throw error; }
  },
  async deleteOrder(id) {
    // Delete in dependency order so foreign-key constraints don't block the order delete.
    // 1. Find the invoice(s) linked to this order
    const invoices = await _q(_sb.from('invoices').select('id').eq('order_id', id));
    // 2. For each invoice: remove its payments, then the invoice (INV) itself
    for (const inv of (invoices || [])) {
      await _q(_sb.from('payments').delete().eq('invoice_id', inv.id));
      await _q(_sb.from('invoices').delete().eq('id', inv.id));
    }
    // 3. Remove the order's line items
    await _q(_sb.from('order_items').delete().eq('order_id', id));
    // 4. Finally remove the order itself
    await _q(_sb.from('orders').delete().eq('id', id));
  },
  // Full snapshot of everything deleteOrder() would remove, in the same
  // shape restoreOrder() (Trash) puts back — used to back up an order
  // before deleting it, not just for display.
  //
  // order_item_flags is deliberately included (HighIssues.md H-03):
  // order_item_flags_order_id_fkey is ON DELETE CASCADE, so deleting the
  // order silently took every pending/returned flag raised against it with
  // it — restoring the order from Trash put back the money but lost the
  // outstanding-items ledger for that customer. Two different things need
  // capturing here, because the two FKs on this table behave differently
  // on delete: flags this order OWNS (order_id = id) are the ones that get
  // deleted outright and need reinserting; flags this order CLEARED on an
  // older order (cleared_in_order_id = id) aren't deleted, just detached
  // (SET NULL) — only their id is needed, to re-link cleared_in_order_id
  // once this order exists again.
  async getOrderFullSnapshot(id) {
    const order = await DB.getOrder(id);
    if (!order) return null;
    const items = await _q(_sb.from('order_items').select('*').eq('order_id', id).order('id', { ascending: true }));
    const invoiceRows = await _q(_sb.from('invoices').select('*').eq('order_id', id));
    const invoices = [];
    for (const inv of (invoiceRows || [])) {
      const payments = await _q(_sb.from('payments').select('*').eq('invoice_id', inv.id));
      invoices.push({ ...inv, payments: payments || [] });
    }
    const ownFlags = await _q(_sb.from('order_item_flags').select('*').eq('order_id', id));
    const clearedFlags = await _q(_sb.from('order_item_flags').select('id').eq('cleared_in_order_id', id));
    return {
      order, items: items || [], invoices,
      order_item_flags: ownFlags || [],
      cleared_flag_ids: (clearedFlags || []).map(f => f.id)
    };
  },
  // Reverse of getOrderFullSnapshot/deleteOrder — re-inserts everything
  // with its original ids (safe: the id sequence has already moved past
  // them, so there's no collision with new rows).
  async restoreOrder(payload) {
    await _q(_sb.from('orders').insert(payload.order));
    if (payload.items && payload.items.length) {
      await _q(_sb.from('order_items').insert(payload.items));
    }
    for (const inv of (payload.invoices || [])) {
      const { payments, ...invRow } = inv;
      await _q(_sb.from('invoices').insert(invRow));
      if (payments && payments.length) {
        await _q(_sb.from('payments').insert(payments));
      }
    }
    // Pending/Returned ledger (HighIssues.md H-03) — see getOrderFullSnapshot.
    if (payload.order_item_flags && payload.order_item_flags.length) {
      await _q(_sb.from('order_item_flags').insert(payload.order_item_flags));
    }
    if (payload.cleared_flag_ids && payload.cleared_flag_ids.length) {
      await _q(_sb.from('order_item_flags').update({ cleared_in_order_id: payload.order.id }).in('id', payload.cleared_flag_ids));
    }
  },
  async getOrder(id) {
    const rows = await _q(_sb.from('orders').select('*').eq('id', id).limit(1));
    const r = rows[0] || null;
    if (r) { r.status = normalizeOrderStatus(r.status); }
    return r;
  },
  async getOrdersByStatus(status) { return _q(_sb.from('orders').select('*').eq('status', status)); },
  async getOrdersByCustomer(cid) {
    const rows = await _q(_sb.from('orders').select('*').eq('customer_id', cid).order('created_at', { ascending: false }));
    return (rows || []).map(r => { r.status = normalizeOrderStatus(r.status); return r; });
  },
  async getOrdersByDriver(driverId) {
    const rows = await _q(_sb.from('orders').select('*').eq('driver_id', driverId).order('driver_assigned_at', { ascending: false }));
    return (rows || []).map(r => { r.status = normalizeOrderStatus(r.status); return r; });
  },
  // Bulk driver assignment (Orders tab "Assign Driver" action) — sets
  // delivery_status to 'out_for_delivery' so the driver's Dashboard picks
  // it up immediately. See supabase_order_delivery_assignment_migration.sql;
  // delivery_status is a separate column from the payment `status` field on
  // purpose, since normalizeOrderStatus() would otherwise silently collapse it.
  async assignDriverToOrders(orderIds, driverId) {
    await _q(_sb.from('orders').update({
      driver_id: driverId,
      delivery_status: 'out_for_delivery',
      driver_assigned_at: new Date().toISOString()
    }).in('id', orderIds));
  },
  async markOrderDelivered(orderId) {
    await _q(_sb.from('orders').update({ delivery_status: 'delivered' }).eq('id', orderId));
  },

  // ── Order Items ───────────────────────────
  async getOrderItems(orderId) { return _q(_sb.from('order_items').select('*').eq('order_id', orderId).order('id', { ascending: true })); },
  async getAllOrderItems() { return _qAll(() => _sb.from('order_items').select('*').order('id', { ascending: true })); },
  // Bulk variants used when several orders are processed in one go (Batch
  // Print). One `.in()` query instead of one round trip per order — same rows,
  // same ordering, so callers can group by order_id and get exactly what the
  // per-order fetch would have returned.
  async getOrderItemsByOrders(orderIds) {
    if (!orderIds || !orderIds.length) return [];
    return _qAll(() => _sb.from('order_items').select('*').in('order_id', orderIds).order('id', { ascending: true }));
  },
  async addOrderItem(data) {
    const rows = await _q(_sb.from('order_items').insert(data).select());
    return rows[0].id;
  },
  async updateOrderItem(id, data) { await _q(_sb.from('order_items').update(data).eq('id', id)); },
  async deleteOrderItem(id) { await _q(_sb.from('order_items').delete().eq('id', id)); },
  async deleteOrderItems(orderId) { await _q(_sb.from('order_items').delete().eq('order_id', orderId)); },

  // ── Order Item Flags (Pending / Returned ledger) ──
  // See supabase_order_item_flags_migration.sql. Flags are created via the
  // flag_order_items RPC (atomic multi-row insert), never via a plain
  // .insert() — keeps the "who cleared what" bookkeeping server-side and
  // consistent with the create_order_with_items RPC convention used
  // everywhere else in this file.
  async flagOrderItems(orderId, customerId, flags) {
    const { error } = await _sb.rpc('flag_order_items', { p_order_id: orderId, p_customer_id: customerId, p_flags: flags || [] });
    if (error) { console.error('flag_order_items failed:', error); throw error; }
  },
  async createOrderWithItemsAndClearFlags(orderData, items, clears) {
    const { data, error } = await _sb.rpc('create_order_with_items_and_clear_flags', { p_order: nullEmptyDates(orderData), p_items: items || [], p_clears: clears || [] });
    if (error) { console.error('create_order_with_items_and_clear_flags failed:', error); throw error; }
    return data;
  },
  async getOpenFlagsForCustomer(customerId) {
    return _q(_sb.from('order_item_flags').select('*').eq('customer_id', customerId).in('status', ['pending', 'returned']).order('created_at', { ascending: true }));
  },
  async getFlagsBySourceOrder(orderId) {
    return _q(_sb.from('order_item_flags').select('*').eq('order_id', orderId).order('created_at', { ascending: true }));
  },
  async getFlagsClearedByOrder(orderId) {
    return _q(_sb.from('order_item_flags').select('*').eq('cleared_in_order_id', orderId).order('created_at', { ascending: true }));
  },
  async getFlagsBySourceOrders(orderIds) {
    if (!orderIds || !orderIds.length) return [];
    return _qAll(() => _sb.from('order_item_flags').select('*').in('order_id', orderIds).order('created_at', { ascending: true }));
  },
  async getFlagsClearedByOrders(orderIds) {
    if (!orderIds || !orderIds.length) return [];
    return _qAll(() => _sb.from('order_item_flags').select('*').in('cleared_in_order_id', orderIds).order('created_at', { ascending: true }));
  },
  async getAllFlags() {
    return _qAll(() => _sb.from('order_item_flags').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }));
  },
  async updateFlagStatus(id, status) {
    const data = { status };
    if (status === 'cleared') data.cleared_at = new Date().toISOString();
    await _q(_sb.from('order_item_flags').update(data).eq('id', id));
  },
  async deleteFlag(id) {
    await _q(_sb.from('order_item_flags').delete().eq('id', id));
  },

  // ── Invoices ──────────────────────────────
  async getInvoices() { return _qAll(() => _sb.from('invoices').select('*').order('id', { ascending: false })); },
  async addInvoice(data) {
    const rows = await _q(_sb.from('invoices').insert(nullEmptyDates(data)).select());
    return rows[0].id;
  },
  async updateInvoice(id, data) { await _q(_sb.from('invoices').update(nullEmptyDates(data)).eq('id', id)); },
  async getInvoice(id) {
    const rows = await _q(_sb.from('invoices').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },
  async getInvoiceByOrder(orderId) {
    const rows = await _q(_sb.from('invoices').select('*').eq('order_id', orderId).limit(1));
    return rows[0] || null;
  },
  // Bulk sibling of getInvoiceByOrder — one indexed query for a whole batch
  // instead of one per order. Ordered by id so a duplicate order_id resolves
  // to the most recent invoice, deterministically.
  async getInvoicesByOrders(orderIds) {
    if (!orderIds || !orderIds.length) return [];
    return _qAll(() => _sb.from('invoices').select('*').in('order_id', orderIds).order('id', { ascending: false }));
  },
  async deleteInvoice(id) { await _q(_sb.from('invoices').delete().eq('id', id)); },

  // ── Payments ──────────────────────────────
  async getPayments() { return _qAll(() => _sb.from('payments').select('*').order('date', { ascending: false }).order('id', { ascending: false })); },
  async addPayment(data) {
    // `date` may be caller-supplied (user-editable "paying date" from the
    // payment modals) — only default to now when none was given, never
    // overwrite a provided one.
    const rows = await _q(_sb.from('payments').insert(nullEmptyDates({ ...data, date: data.date || new Date().toISOString() })).select());
    return rows[0].id;
  },
  async getPaymentsByInvoice(invoiceId) {
    return _q(_sb.from('payments').select('*').eq('invoice_id', invoiceId));
  },
  async deletePaymentsForInvoice(invoiceId) {
    await _q(_sb.from('payments').delete().eq('invoice_id', invoiceId));
  },
  // Moves a settled invoice's payment history onto another invoice instead
  // of destroying it. Used when a "Single Invoice" batch payment folds
  // several standalone invoices into one consolidated invoice: the money
  // was really received, so the payments (and the deductions below) have to
  // survive the merge or every revenue figure that sums the payments table
  // silently drops by whatever had already been collected.
  async reassignPaymentsToInvoice(fromInvoiceId, toInvoiceId) {
    await _q(_sb.from('payments').update({ invoice_id: toInvoiceId }).eq('invoice_id', fromInvoiceId));
  },
  // Same reasoning for the deduction ledger. deductions.invoice_id is
  // ON DELETE CASCADE, so these rows would otherwise vanish the moment the
  // old invoice row is removed. invoice_number is a denormalised copy shown
  // in the Deductions register, so it moves to the surviving number too.
  async reassignDeductionsToInvoice(fromInvoiceId, toInvoiceId, toInvoiceNumber) {
    const patch = { invoice_id: toInvoiceId };
    if (toInvoiceNumber) patch.invoice_number = toInvoiceNumber;
    await _q(_sb.from('deductions').update(patch).eq('invoice_id', fromInvoiceId));
  },

  // ── Items Catalog ─────────────────────────
  async getItems() { return _qAll(() => _sb.from('items').select('*').order('item_id')); },
  async addItem(data) {
    const rows = await _q(_sb.from('items').insert(data).select());
    return rows[0].id;
  },
  async updateItem(id, data) { await _q(_sb.from('items').update(data).eq('id', id)); },
  async deleteItem(id) { await _q(_sb.from('items').delete().eq('id', id)); },
  async getItem(id) {
    const rows = await _q(_sb.from('items').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },
  async getItemByCode(itemId) {
    const rows = await _q(_sb.from('items').select('*').ilike('item_id', itemId).limit(1));
    return rows[0] || null;
  },

  // ── Auth (real Supabase Auth — replaces the old plaintext `users` table login) ──
  // The `users` table is no longer used for authentication. Login, sessions, and
  // password storage/hashing are all handled by Supabase Auth itself. Role and
  // display info live in each auth user's user_metadata, set via the
  // netlify/functions/admin-users.js server-side function (the only place with
  // permission to create/edit/delete accounts — never done from the browser).
  async signIn(email, password) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },
  async signOut() {
    await _sb.auth.signOut();
  },
  async getSession() {
    const { data, error } = await _sb.auth.getSession();
    if (error) { console.error('getSession error:', error); return null; }
    return data.session;
  },
  onAuthStateChange(callback) {
    return _sb.auth.onAuthStateChange((event, session) => callback(event, session));
  },
  sessionToCurrentUser(session) {
    if (!session || !session.user) return null;
    const u = session.user;
    const meta = u.user_metadata || {};
    return {
      id: u.id,
      email: u.email,
      username: meta.username || u.email,
      role: meta.role || 'user',
      display_name: meta.display_name || meta.username || u.email
      // driver_id is NOT in user_metadata — a driver login is linked via
      // drivers.auth_user_id (set by admin-users.js), not a metadata field.
      // app.js's enterAppWithSession() fills currentUser.driver_id in
      // separately via DB.getCurrentDriverId() once role === 'driver' is known.
    };
  },
  // Resolves the drivers.id row linked to the CURRENTLY authenticated
  // session (via drivers.auth_user_id), using the current_driver_id()
  // Postgres function from supabase_driver_app_migration.sql. Returns null
  // if this login isn't linked to any driver row.
  async getCurrentDriverId() {
    const { data, error } = await _sb.rpc('current_driver_id');
    if (error) { console.error('current_driver_id failed:', error); return null; }
    return data;
  },

  // ── User management — proxied through the admin-only Netlify function.
  //    These calls all require the caller's current session to belong to an
  //    admin (enforced server-side; the function checks the access token).
  async _callAdminUsersFn(action, payload) {
    const session = await DB.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    const res = await fetch('/.netlify/functions/admin-users', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, payload })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Admin user request failed (HTTP ${res.status})`);
    return body;
  },
  async getUsers() {
    const { users } = await DB._callAdminUsersFn('list');
    return users || [];
  },
  async getUser(id) {
    const users = await DB.getUsers();
    return users.find(u => String(u.id) === String(id)) || null;
  },
  async getUserByUsername(username) {
    const users = await DB.getUsers();
    return users.find(u => (u.username || '').toLowerCase() === String(username).toLowerCase()) || null;
  },
  async getUserByDriverId(driverId) {
    const users = await DB.getUsers();
    return users.find(u => String(u.driver_id) === String(driverId)) || null;
  },
  async addUser({ email, password, username, display_name, role }) {
    const result = await DB._callAdminUsersFn('create', { email, password, username, display_name, role });
    return result.id;
  },
  async updateUser(id, data) {
    await DB._callAdminUsersFn('update', { id, ...data });
  },
  async deleteUser(id) {
    await DB._callAdminUsersFn('delete', { id });
  },

  // ── ID Generators — Atomic, per-month RPC (no unsafe client-side fallback) ──
  //
  // There is deliberately NO client-side "scan existing rows, take max, add 1"
  // fallback here anymore. That pattern is exactly the non-atomic race
  // condition this RPC was built to replace: two concurrent requests can both
  // read the same "current max" before either writes back, and both mint the
  // same ID. A rare, loud failure (this call throws, the caller's existing
  // try/catch shows a toast and the save doesn't go through) is a much safer
  // outcome than a rare, silent duplicate batch/invoice number.
  //
  // The RPC itself (next_batch_id/next_invoice_number, see
  // supabase_id_generation_fix.sql) is atomic under concurrency via
  // Postgres's INSERT ... ON CONFLICT DO UPDATE, and is keyed per-month by
  // `prefix` so the 4-digit suffix resets to 0001 each month as the ID
  // format implies, instead of climbing forever.
  async _generateSequentialId(rpcName, prefix, entityLabel) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await _sb.rpc(rpcName, { prefix });
        if (!error && data) return data;
        lastErr = error || new Error(`${rpcName} returned no data`);
      } catch (e) {
        lastErr = e;
      }
      if (attempt === 1) await new Promise(r => setTimeout(r, 400)); // one retry after a short delay, in case of a transient blip
    }
    console.error(`${rpcName} failed after retry — refusing to fall back to unsafe client-side ID generation:`, lastErr);
    throw new Error(`Could not generate a unique ${entityLabel} right now (ID service unavailable). Please try again in a moment — if this keeps happening, the ${rpcName} database function may not be deployed; see supabase_id_generation_fix.sql.`);
  },
  async generateBatchId() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `LND-${mm}${yy}-`;                          // e.g. LND-0826-
    return DB._generateSequentialId('next_batch_id', prefix, 'batch ID');
  },
  async generateInvoiceNumber() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `INV-${mm}${yy}-`;                          // e.g. INV-0826-
    return DB._generateSequentialId('next_invoice_number', prefix, 'invoice number');
  },

  // ── Export / Import ───────────────────────
  async exportAll() {
    // Note: login accounts are no longer exported here. They live in Supabase
    // Auth (not a regular table the anon/authenticated client can read), and
    // are managed exclusively through Settings > User Management, which calls
    // the admin-only Netlify function. This avoids ever putting credentials
    // in a downloadable backup file.
    //
    // order_item_flags and trash were missing from both this export and
    // importAll's restore (HighIssues.md H-02) — a restore silently dropped
    // the pending/returned ledger and the Trash tab's contents. Both are
    // included now.
    const [customers, drivers, vehicles, orders, order_items, invoices, payments, settings, items, deductions, expense_categories, expense_types, expense_entries, expense_amounts, trips, order_item_flags, trash] = await Promise.all([
      DB.getCustomers(), DB.getDrivers(), DB.getVehicles(), DB.getOrders(),
      _q(_sb.from('order_items').select('*')),
      DB.getInvoices(), DB.getPayments(),
      _q(_sb.from('settings').select('*')),
      DB.getItems(),
      _q(_sb.from('deductions').select('*')),
      DB.getExpenseCategories(),
      DB.getExpenseTypes(),
      DB.getExpenseEntries(),
      DB.getExpenseAmounts(),
      DB.getTrips(),
      DB.getAllFlags(),
      DB.getTrash()
    ]);
    return { customers, drivers, vehicles, orders, order_items, invoices, payments, settings, items, deductions, expense_categories, expense_types, expense_entries, expense_amounts, trips, order_item_flags, trash, exported_at: new Date().toISOString() };
  },
  async addOrderItemsBatch(dataArray) {
    if (!dataArray || dataArray.length === 0) return [];
    return _q(_sb.from('order_items').insert(dataArray).select());
  },
  async getOrdersPaged(page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const to = page * limit - 1;
    const { data, count, error } = await _sb.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
    if (error) throw error;
    const rows = (data || []).map(r => { r.status = normalizeOrderStatus(r.status); return r; });
    return { data: rows, count: count || rows.length };
  },
  async getInvoicesPaged(page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const to = page * limit - 1;
    const { data, count, error } = await _sb.from('invoices').select('*', { count: 'exact' }).order('id', { ascending: false }).range(from, to);
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },
  async getCustomersPaged(page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const to = page * limit - 1;
    const { data, count, error } = await _sb.from('customers').select('*', { count: 'exact' }).order('hotel_name').range(from, to);
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },
  async importAll(data) {
    // 1. Delete all existing data in proper dependency order to avoid FK
    // violation errors. HighIssues.md H-02/H-08: this list used to stop at
    // deductions/payments/invoices/order_items/orders/customers/drivers/
    // items/settings — every expense table, every trip, every vehicle,
    // every order flag and the whole Trash table survived a "restore" (and
    // survived "Reset All Data", which routes through importAll({}) with no
    // data to reinsert), left referencing customers/orders that had just
    // been replaced with fresh ids or deleted outright.
    await _q(_sb.from('order_item_flags').delete().neq('id', 0));
    await _q(_sb.from('deductions').delete().neq('id', 0));
    await _q(_sb.from('payments').delete().neq('id', 0));
    await _q(_sb.from('invoices').delete().neq('id', 0));
    await _q(_sb.from('order_items').delete().neq('id', 0));
    await _q(_sb.from('trash').delete().neq('id', 0));
    await _q(_sb.from('orders').delete().neq('id', 0));
    await _q(_sb.from('expense_amounts').delete().neq('id', 0));
    await _q(_sb.from('expense_entries').delete().neq('id', 0));
    await _q(_sb.from('expense_types').delete().neq('id', 0));
    await _q(_sb.from('expense_categories').delete().neq('id', 0));
    await _q(_sb.from('trips').delete().neq('id', ''));
    await _q(_sb.from('vehicles').delete().neq('id', 0));
    await _q(_sb.from('customers').delete().neq('id', 0));
    await _q(_sb.from('drivers').delete().neq('id', 0));
    await _q(_sb.from('items').delete().neq('id', 0));
    // `.neq('key', 'DOES_NOT_EXIST')` never matched rows whose key is NULL
    // (NULL <> anything is NULL, not true, in SQL) — settings.key is
    // nullable, so those rows survived every "delete everything" call.
    // Deleting by the table's own `id` (never null) has no such gap.
    await _q(_sb.from('settings').delete().neq('id', 0));
    // Note: the legacy `users` table is no longer touched here — it's RLS-locked
    // post-migration and login accounts live in Supabase Auth now, managed only
    // via Settings > User Management (admin-users.js), never via backup/restore.

    // 2. Mapping dictionaries
    const customerMap = {};
    const driverMap = {};
    const itemMap = {};
    const orderMap = {};
    const invoiceMap = {};
    const vehicleMap = {};
    const orderItemMap = {};
    const expenseEntryMap = {};

    // 3. Settings
    if (data.settings?.length) {
      await _q(_sb.from('settings').insert(data.settings));
    }

    // 4. Users — intentionally skipped. Older backup files may still contain a
    //    `users` array from before the Supabase Auth migration; it's ignored on
    //    purpose since that table no longer governs login and is RLS-locked.

    // 5. Items
    if (data.items?.length) {
      const sortedItems = [...data.items].sort((a, b) => a.id - b.id);
      for (const it of sortedItems) {
        const copy = { ...it };
        delete copy.id;
        const inserted = await _q(_sb.from('items').insert(copy).select());
        itemMap[it.id] = inserted[0].id;
      }
    }

    // 6. Vehicles — no other table's FK points at vehicles.id (trips.vehicle_id
    // is a loosely-typed text column, not an FK), so this only needs a map for
    // remapping trips.vehicle_id below; nothing else depends on ordering here.
    if (data.vehicles?.length) {
      const sortedVehicles = [...data.vehicles].sort((a, b) => a.id - b.id);
      for (const v of sortedVehicles) {
        const copy = { ...v };
        delete copy.id;
        const inserted = await _q(_sb.from('vehicles').insert(copy).select());
        vehicleMap[v.id] = inserted[0].id;
      }
    }

    // 7. Customers
    if (data.customers?.length) {
      const sortedCustomers = [...data.customers].sort((a, b) => a.id - b.id);
      for (const c of sortedCustomers) {
        const copy = { ...c };
        delete copy.id;
        if (copy.custom_prices) {
          try {
            const oldPrices = typeof copy.custom_prices === 'string' ? JSON.parse(copy.custom_prices) : copy.custom_prices;
            const newPrices = {};
            Object.entries(oldPrices).forEach(([oldItemId, val]) => {
              const newItemId = itemMap[oldItemId] || oldItemId;
              newPrices[newItemId] = val;
            });
            copy.custom_prices = newPrices;
          } catch(e) {
            console.error("Error parsing custom prices:", e);
          }
        }
        const inserted = await _q(_sb.from('customers').insert(copy).select());
        customerMap[c.id] = inserted[0].id;
      }
    }

    // 8. Drivers
    if (data.drivers?.length) {
      const sortedDrivers = [...data.drivers].sort((a, b) => a.id - b.id);
      for (const d of sortedDrivers) {
        const copy = { ...d };
        delete copy.id;
        const inserted = await _q(_sb.from('drivers').insert(copy).select());
        driverMap[d.id] = inserted[0].id;
      }
    }

    // 9. Orders
    if (data.orders?.length) {
      const sortedOrders = [...data.orders].sort((a, b) => a.id - b.id);
      for (const o of sortedOrders) {
        const copy = { ...o };
        delete copy.id;
        copy.customer_id = customerMap[o.customer_id] || null;
        if (o.driver_id) {
          copy.driver_id = driverMap[o.driver_id] || null;
        }
        copy.extra_payment = o.extra_payment || 0.00;
        copy.delivery_charge = o.delivery_charge || 0.00;
        copy.discount_rate = o.discount_rate || 0.00;
        copy.discount_amount = o.discount_amount || 0.00;
        const inserted = await _q(_sb.from('orders').insert(copy).select());
        orderMap[o.id] = inserted[0].id;
      }
    }

    // 10. Order Items — builds orderItemMap (old id -> new id) so Order Item
    // Flags below can re-link to the item it was raised against. Each chunk
    // is a single INSERT ... RETURNING, so the returned rows come back in
    // the same order the chunk was given in — safe to correlate by index.
    if (data.order_items?.length) {
      const orderItemPairs = data.order_items.map(oi => {
        const copy = { ...oi };
        delete copy.id;
        copy.order_id = orderMap[oi.order_id] || null;
        if (oi.catalog_item_id) {
          copy.catalog_item_id = itemMap[oi.catalog_item_id] || null;
        }
        return { oldId: oi.id, copy };
      }).filter(x => x.copy.order_id !== null);

      for (let i = 0; i < orderItemPairs.length; i += 50) {
        const chunk = orderItemPairs.slice(i, i + 50);
        const inserted = await _q(_sb.from('order_items').insert(chunk.map(x => x.copy)).select());
        chunk.forEach((x, idx) => { if (inserted[idx]) orderItemMap[x.oldId] = inserted[idx].id; });
      }
    }

    // 11. Invoices
    if (data.invoices?.length) {
      const sortedInvoices = [...data.invoices].sort((a, b) => a.id - b.id);
      for (const inv of sortedInvoices) {
        const copy = { ...inv };
        delete copy.id;
        if (inv.order_id) {
          copy.order_id = orderMap[inv.order_id] || null;
        }
        if (inv.batch_order_ids) {
          copy.batch_order_ids = inv.batch_order_ids.split(',')
            .map(id => orderMap[id] || id)
            .join(',');
        }
        copy.extra_payment = inv.extra_payment || 0.00;
        const inserted = await _q(_sb.from('invoices').insert(copy).select());
        invoiceMap[inv.id] = inserted[0].id;
      }
    }

    // 12. Payments
    if (data.payments?.length) {
      const paymentsToInsert = data.payments.map(p => {
        const copy = { ...p };
        delete copy.id;
        copy.invoice_id = invoiceMap[p.invoice_id] || null;
        return copy;
      }).filter(p => p.invoice_id !== null);

      for (let i = 0; i < paymentsToInsert.length; i += 50) {
        const chunk = paymentsToInsert.slice(i, i + 50);
        await _q(_sb.from('payments').insert(chunk));
      }
    }

    // 13. Deductions
    if (data.deductions?.length) {
      const deductionsToInsert = data.deductions.map(d => {
        const copy = { ...d };
        delete copy.id;
        copy.invoice_id = invoiceMap[d.invoice_id] || null;
        return copy;
      }).filter(d => d.invoice_id !== null);

      for (let i = 0; i < deductionsToInsert.length; i += 50) {
        const chunk = deductionsToInsert.slice(i, i + 50);
        await _q(_sb.from('deductions').insert(chunk));
      }
    }

    // 14. Order Item Flags (Pending/Returned ledger) — HighIssues.md H-02.
    // order_item_id/cleared_in_order_id are nullable on the live schema (SET
    // NULL on delete), so a flag whose linked order/item didn't come back
    // (e.g. a partial backup) degrades to an unlinked-but-present row
    // instead of being dropped outright.
    if (data.order_item_flags?.length) {
      const flagsToInsert = data.order_item_flags.map(f => {
        const copy = { ...f };
        delete copy.id;
        copy.order_id = orderMap[f.order_id] || null;
        copy.customer_id = customerMap[f.customer_id] || null;
        copy.order_item_id = f.order_item_id != null ? (orderItemMap[f.order_item_id] || null) : null;
        copy.cleared_in_order_id = f.cleared_in_order_id != null ? (orderMap[f.cleared_in_order_id] || null) : null;
        return copy;
      }).filter(f => f.order_id !== null && f.customer_id !== null);

      for (let i = 0; i < flagsToInsert.length; i += 50) {
        const chunk = flagsToInsert.slice(i, i + 50);
        await _q(_sb.from('order_item_flags').insert(chunk));
      }
    }

    // 15. Expense Categories / Types — category_id and expense_type_id are
    // the actual business keys other rows reference (expense_types.category_id
    // and expense_amounts.expense_type_id are TEXT columns holding these, not
    // the synthetic `id`), so they're preserved as-is; only the bigint `id`
    // is dropped and left to the identity default.
    if (data.expense_categories?.length) {
      const catsToInsert = data.expense_categories.map(c => { const copy = { ...c }; delete copy.id; return copy; });
      await _q(_sb.from('expense_categories').insert(catsToInsert));
    }
    if (data.expense_types?.length) {
      const typesToInsert = data.expense_types.map(t => { const copy = { ...t }; delete copy.id; return copy; });
      await _q(_sb.from('expense_types').insert(typesToInsert));
    }

    // 16. Expense Entries — id IS the synthetic key expense_amounts.entry_id
    // points at, so this does need a map, same as Order Items above.
    if (data.expense_entries?.length) {
      const sortedEntries = [...data.expense_entries].sort((a, b) => a.id - b.id);
      for (const e of sortedEntries) {
        const copy = { ...e };
        delete copy.id;
        const inserted = await _q(_sb.from('expense_entries').insert(copy).select());
        expenseEntryMap[e.id] = inserted[0].id;
      }
    }

    // 17. Expense Amounts (Cash Book cells)
    if (data.expense_amounts?.length) {
      const amountsToInsert = data.expense_amounts.map(a => {
        const copy = { ...a };
        delete copy.id;
        copy.entry_id = expenseEntryMap[a.entry_id] || null;
        return copy;
      }).filter(a => a.entry_id !== null);

      for (let i = 0; i < amountsToInsert.length; i += 50) {
        const chunk = amountsToInsert.slice(i, i + 50);
        await _q(_sb.from('expense_amounts').insert(chunk));
      }
    }

    // 18. Trips — id/trip_id are meaningful, already-unique text keys and
    // nothing else references them, so they're kept as exported (the table
    // was just fully wiped, so there's no collision risk). driver_id is
    // remapped through driverMap (real FK, ON DELETE SET NULL); vehicle_id
    // is a text column holding the vehicle's id as a string with no FK, so
    // it's remapped through vehicleMap for consistency but not filtered out
    // if the vehicle wasn't in this backup.
    if (data.trips?.length) {
      const tripsToInsert = data.trips.map(t => {
        const copy = { ...t };
        if (t.driver_id != null) copy.driver_id = driverMap[t.driver_id] || null;
        if (t.vehicle_id != null) {
          const remapped = vehicleMap[t.vehicle_id] ?? vehicleMap[String(t.vehicle_id)];
          copy.vehicle_id = remapped != null ? String(remapped) : t.vehicle_id;
        }
        return copy;
      });

      for (let i = 0; i < tripsToInsert.length; i += 50) {
        const chunk = tripsToInsert.slice(i, i + 50);
        await _q(_sb.from('trips').insert(chunk));
      }
    }

    // 19. Trash — restored as opaque historical snapshots. Its `payload`
    // holds a deleted record's own id/foreign-key values from before this
    // restore, which this pass has just replaced everywhere else, so trying
    // to rewrite ids inside an arbitrary per-entity-type payload isn't
    // attempted here; entity_type/entity_label/payload/deleted_by/deleted_at
    // are preserved so the Trash tab and audit trail aren't silently
    // emptied by a restore (HighIssues.md H-02). Only `id` is dropped.
    if (data.trash?.length) {
      const trashToInsert = data.trash.map(t => { const copy = { ...t }; delete copy.id; return copy; });
      for (let i = 0; i < trashToInsert.length; i += 50) {
        const chunk = trashToInsert.slice(i, i + 50);
        await _q(_sb.from('trash').insert(chunk));
      }
    }

    // 20. Resync id_counters from whatever batch/invoice/trip numbers just
    // came back in. importAll never restores id_counters itself, and the
    // restored rows can carry higher numbers than the counter currently
    // holds — without this, the very next order/invoice/trip created after
    // a restore could mint an ID that collides with one just imported.
    // Best-effort: an older database that hasn't run
    // supabase_duplicate_id_hardening_migration.sql yet won't have this
    // RPC, and the restore itself has already fully succeeded by this
    // point, so a missing function shouldn't be reported as a failed
    // restore — just logged.
    try {
      const { error } = await _sb.rpc('sync_id_counters');
      if (error) console.warn('sync_id_counters failed after restore:', error.message);
    } catch (e) {
      console.warn('sync_id_counters failed after restore:', e.message);
    }
  },

  // ── Deductions ─────────────────────────────
  async getDeductions() {
    return _qAll(() => _sb.from('deductions').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }));
  },
  async addDeduction(data) {
    const rows = await _q(_sb.from('deductions').insert({ ...data, created_at: new Date().toISOString() }).select());
    return rows[0].id;
  },
  async deleteDeduction(id) {
    await _q(_sb.from('deductions').delete().eq('id', id));
  },

  // QR delivery-confirmation feature removed by request (confirm.html and
  // its getOrderByToken/markOrderReceivedByQR helpers deleted — nothing
  // else in the app referenced them).

  async seedDemoData() {
    // Login accounts are no longer seeded here — create the first admin
    // account via Settings > User Management (or the one-time bootstrap
    // flow described in AUTH_MIGRATION_GUIDE.md) instead.
    const existing = await DB.getSetting('company_name');
    if (!existing) {
      const defaults = [
        { key: 'company_name', value: 'Sagacious Washing Center' },
        { key: 'address', value: '' },
        { key: 'phone', value: '' },
        { key: 'email', value: '' },
        { key: 'invoice_prefix', value: 'INV' },
        { key: 'footer_message', value: 'Thank you for choosing Sagacious Washing Center!' },
        { key: 'dark_mode', value: 'false' },
        { key: 'text_size', value: 'md' },
        { key: 'min_discount_amount', value: '30000' },
        { key: 'delivery_charge', value: '0' },
        { key: 'quotation_terms', value: '- Free pick-up and delivery for orders exceeding Rs 3,000.00\n- Contact instruction for pricing queries' }
      ];
      for (const s of defaults) await DB.setSetting(s.key, s.value);
    }
  },

  // ── Quotations ─────────────────────────────
  async getQuotations() {
    try {
      const val = await DB.getSetting('quotation_history');
      return val ? JSON.parse(val) : [];
    } catch(e) {
      console.error('Error reading quotation history:', e);
      return [];
    }
  },
  async saveQuotation(quoteData) {
    try {
      const history = await DB.getQuotations();
      const existingIdx = history.findIndex(q => q.quote_id === quoteData.quote_id);
      if (existingIdx >= 0) {
        history[existingIdx] = quoteData;
      } else {
        history.unshift(quoteData);
      }
      await DB.setSetting('quotation_history', JSON.stringify(history));
      return quoteData;
    } catch(e) {
      console.error('Error saving quotation:', e);
    }
  },
  async deleteQuotation(quoteId) {
    try {
      const history = await DB.getQuotations();
      const filtered = history.filter(q => q.quote_id !== quoteId);
      await DB.setSetting('quotation_history', JSON.stringify(filtered));
    } catch(e) {
      console.error('Error deleting quotation:', e);
    }
  },
  async getQuotation(quoteId) {
    const history = await DB.getQuotations();
    return history.find(q => q.quote_id === quoteId) || null;
  },
  async generateQuotationId(dateStr) {
    const dateObj = dateStr ? new Date(dateStr) : new Date();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yy = String(dateObj.getFullYear()).slice(-2);
    const suffix = `${mm}${yy}`;
    
    const history = await DB.getQuotations();
    let maxSeq = 0;
    history.forEach(q => {
      if (q.quote_id && q.quote_id.startsWith('QUO-') && q.quote_id.endsWith(suffix)) {
        const seqStr = q.quote_id.slice(4, 7);
        const seq = parseInt(seqStr, 10) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    });
    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `QUO-${nextSeq}${mm}${yy}`;
  },

  // ── Recent System Actions ─────────────────
  async getActions() {
    try {
      const val = await DB.getSetting('recent_system_actions');
      if (val) {
        return JSON.parse(val);
      }
      const seed = [
        {
          id: 'act_' + (Date.now() - 3600000),
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          action_type: 'Add Customer',
          category: 'Customer',
          description: 'Added new customer "Grand Hyatt Colombo" (Phone: +94 11 234 5678)',
          details: { hotel_name: 'Grand Hyatt Colombo', phone: '+94 11 234 5678', contact_person: 'Mr. Silva' },
          user: 'Administrator'
        },
        {
          id: 'act_' + (Date.now() - 2400000),
          timestamp: new Date(Date.now() - 2400000).toISOString(),
          action_type: 'Phone Number Change',
          category: 'Customer',
          description: 'Changed phone number for customer "Shangri-La Hotel" from "0771234567" to "0779998877"',
          details: { customer: 'Shangri-La Hotel', old_phone: '0771234567', new_phone: '0779998877' },
          user: 'Administrator'
        },
        {
          id: 'act_' + (Date.now() - 1200000),
          timestamp: new Date(Date.now() - 1200000).toISOString(),
          action_type: 'New Order Add',
          category: 'Order',
          description: 'Created new order #LND-0826-0012 for "Cinnamon Grand" (Total: LKR 45,000.00)',
          details: { batch_id: 'LND-0826-0012', customer: 'Cinnamon Grand', total_amount: 45000 },
          user: 'Administrator'
        }
      ];
      await DB.setSetting('recent_system_actions', JSON.stringify(seed));
      return seed;
    } catch(e) {
      console.error('Error fetching system actions:', e);
      return [];
    }
  },
  async logAction(actionType, description, details = {}, category = 'System') {
    try {
      const actions = await DB.getActions();
      const user = (window.currentUser && (window.currentUser.display_name || window.currentUser.username)) || 'Administrator';
      const newAction = {
        id: 'act_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        timestamp: new Date().toISOString(),
        action_type: actionType,
        category: category,
        description: description,
        details: details || {},
        user: user
      };
      actions.unshift(newAction);
      if (actions.length > 1000) actions.length = 1000;
      await DB.setSetting('recent_system_actions', JSON.stringify(actions));
      return newAction;
    } catch(e) {
      console.error('Error logging action:', e);
    }
  },
  async clearActions() {
    await DB.setSetting('recent_system_actions', JSON.stringify([]));
  },
  // Rewrites one entry's `details.undone = true` after a successful Undo,
  // so its Undo button doesn't get shown/used twice.
  async markActionUndone(actionId) {
    const actions = await DB.getActions();
    const idx = actions.findIndex(a => a.id === actionId);
    if (idx < 0) return;
    actions[idx] = { ...actions[idx], details: { ...(actions[idx].details || {}), undone: true } };
    await DB.setSetting('recent_system_actions', JSON.stringify(actions));
  },

  // ── Trash / Recycle Bin ───────────────────
  // Anything deleted (Customer/Driver/Vehicle/Item/Trip/Order) is
  // snapshotted here first and kept for 7 days before being purged for
  // good — see supabase_trash_migration.sql. Also what Undo restores from
  // for Delete-type Recent Actions entries.
  async getTrash() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    try { await _q(_sb.from('trash').delete().lt('deleted_at', cutoff)); } catch (e) { console.warn('trash purge failed:', e); }
    return _qAll(() => _sb.from('trash').select('*').order('deleted_at', { ascending: false }).order('id', { ascending: false }));
  },
  async addTrash({ entity_type, entity_label, payload, deleted_by }) {
    const rows = await _q(_sb.from('trash').insert({ entity_type, entity_label, payload, deleted_by }).select());
    return rows[0].id;
  },
  async getTrashItem(id) {
    const rows = await _q(_sb.from('trash').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },
  async deleteTrashForever(id) {
    await _q(_sb.from('trash').delete().eq('id', id));
  },
  async restoreCustomer(payload) { await _q(_sb.from('customers').insert(payload)); },
  async restoreDriver(payload) { await _q(_sb.from('drivers').insert(payload)); },
  async restoreVehicle(payload) { await _q(_sb.from('vehicles').insert(payload)); },
  async restoreItem(payload) { await _q(_sb.from('items').insert(payload)); },
  async restoreTrip(payload) { await _q(_sb.from('trips').insert(payload)); },
  // Dispatches to the right restore* function by entity_type and removes
  // the trash row once restored. Shared by the Trash page's Restore button
  // and the Recent Actions Undo button (undoRecentAction in app.js).
  async restoreFromTrash(trashId) {
    const row = await DB.getTrashItem(trashId);
    if (!row) throw new Error('Trash item not found (already restored or purged)');
    const restorers = {
      Customer: DB.restoreCustomer,
      Driver: DB.restoreDriver,
      Vehicle: DB.restoreVehicle,
      Item: DB.restoreItem,
      Trip: DB.restoreTrip,
      Order: DB.restoreOrder
    };
    const fn = restorers[row.entity_type];
    if (!fn) throw new Error(`Don't know how to restore entity_type "${row.entity_type}"`);
    await fn(row.payload);
    await DB.deleteTrashForever(trashId);
    return row;
  },

  // ── Expenses: Categories (Cash Book top-level columns) ─
  async getExpenseCategories() {
    return _qAll(() => _sb.from('expense_categories').select('*').order('sort_order').order('category_id'));
  },
  async addExpenseCategory(name) {
    const category_id = await DB._generateSequentialId('next_category_id', 'CAT-', 'category ID');
    const cats = await DB.getExpenseCategories();
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    const rows = await _q(_sb.from('expense_categories').insert({ category_id, name, sort_order: maxOrder + 1 }).select());
    return rows[0];
  },
  async reorderExpenseCategory(categoryId, direction) {
    const cats = await DB.getExpenseCategories();
    const idx = cats.findIndex(c => c.category_id === categoryId);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= cats.length) return;
    const a = cats[idx], b = cats[swapIdx];
    await Promise.all([
      _q(_sb.from('expense_categories').update({ sort_order: b.sort_order }).eq('category_id', a.category_id)),
      _q(_sb.from('expense_categories').update({ sort_order: a.sort_order }).eq('category_id', b.category_id))
    ]);
  },

  // ── Expenses: Types (Cash Book sub-columns nested under a category) ─
  async getExpenseTypes() {
    // sort_order is scoped per-category (see addExpenseType), so it ties
    // across categories — add expense_type_id as a stable tiebreaker so
    // paged .range() calls don't skip/duplicate rows.
    return _qAll(() => _sb.from('expense_types').select('*').order('sort_order').order('expense_type_id'));
  },
  async addExpenseType(name, categoryId) {
    const expense_type_id = await DB._generateSequentialId('next_expense_type_id', 'EXP-', 'expense ID');
    const types = await DB.getExpenseTypes();
    const maxOrder = types.filter(t => t.category_id === categoryId).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const rows = await _q(_sb.from('expense_types').insert({ expense_type_id, name, category_id: categoryId, sort_order: maxOrder + 1 }).select());
    return rows[0];
  },
  async reorderExpenseType(expenseTypeId, direction) {
    const types = await DB.getExpenseTypes();
    const type = types.find(t => t.expense_type_id === expenseTypeId);
    if (!type) return;
    const siblings = types.filter(t => t.category_id === type.category_id);
    const idx = siblings.findIndex(t => t.expense_type_id === expenseTypeId);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx], b = siblings[swapIdx];
    await Promise.all([
      _q(_sb.from('expense_types').update({ sort_order: b.sort_order }).eq('expense_type_id', a.expense_type_id)),
      _q(_sb.from('expense_types').update({ sort_order: a.sort_order }).eq('expense_type_id', b.expense_type_id))
    ]);
  },

  // ── Expenses: Cash Book rows (Date + Description journal lines) ─
  async getExpenseEntries() {
    return _qAll(() => _sb.from('expense_entries').select('*').order('entry_date').order('id'));
  },
  async addExpenseEntry(entry_date, description = '') {
    const rows = await _q(_sb.from('expense_entries').insert({ entry_date, description }).select());
    return rows[0];
  },
  async updateExpenseEntry(id, data) {
    await _q(_sb.from('expense_entries').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id));
  },
  async deleteExpenseEntry(id) {
    await _q(_sb.from('expense_entries').delete().eq('id', id)); // cascades to expense_amounts via FK
  },

  // ── Expenses: Cash Book cells (one amount per row x expense type) ─
  async getExpenseAmounts() {
    // No surrogate id column here (entry_id+expense_type_id is the natural
    // key, see the upsert onConflict below) — order by that pair so paged
    // .range() calls see a stable, non-overlapping row order.
    return _qAll(() => _sb.from('expense_amounts').select('*').order('entry_id').order('expense_type_id'));
  },
  async setExpenseAmount(entryId, expenseTypeId, amount) {
    // Sparse-matrix convention: a blank/zero cell is DELETED, not stored as
    // 0, so Category View and column totals never carry zero-amount rows.
    if (!amount || parseFloat(amount) === 0) {
      await _q(_sb.from('expense_amounts').delete().eq('entry_id', entryId).eq('expense_type_id', expenseTypeId));
      return null;
    }
    const rows = await _q(_sb.from('expense_amounts')
      .upsert({ entry_id: entryId, expense_type_id: expenseTypeId, amount: parseFloat(amount), updated_at: new Date().toISOString() },
              { onConflict: 'entry_id,expense_type_id' }).select());
    return rows[0];
  },

  // ── Fuel Price Settings & History ─────────
  async getFuelPriceSettings() {
    try {
      const val = await DB.getSetting('transport_fuel_price_config');
      if (val) return JSON.parse(val);
    } catch(e) {}
    // Default configuration: Fuel Price = 370 LKR/Litre, Mileage = 10 KM/L (Cost = 37 LKR/KM)
    return {
      current_price: 370.00, // LKR per Litre
      km_per_litre: 10.00,   // KM per Litre
      cost_per_km: 37.00,    // LKR per KM
      monthly_prices: {}     // { 'YYYY-MM': { price: 370, km_per_litre: 10, cost_per_km: 37 } }
    };
  },
  async saveFuelPriceSettings(config) {
    await DB.setSetting('transport_fuel_price_config', JSON.stringify(config));
    return config;
  },

  // ── Transport & Trips ─────────────────────
  // No settings-table JSON mirror anymore (HighIssues.md H-04) — same
  // reasoning as Vehicles above: it was write-only (its read fallback was
  // dead — a non-null `rows` array from a successful query, even empty,
  // short-circuited the fallback every time) and swallowed real insert/
  // update/delete failures behind a fake success.
  async getTrips() {
    return _qAll(() => _sb.from('trips').select('*').order('start_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }));
  },
  async getTrip(id) {
    const trips = await DB.getTrips();
    return trips.find(t => t.id === id || t.trip_id === id) || null;
  },
  async addTrip(data) {
    const tripId = await DB.generateTripId();
    const record = {
      id: 'trip_' + Date.now() + '_' + Math.floor(Math.random()*1000),
      trip_id: tripId,
      driver_id: (data.driver_id !== undefined && data.driver_id !== null && data.driver_id !== '') ? Number(data.driver_id) : null,
      driver_name: data.driver_name || (window.currentUser?.display_name || 'Driver'),
      vehicle_id: (data.vehicle_id !== undefined && data.vehicle_id !== null && data.vehicle_id !== '') ? String(data.vehicle_id) : null,
      vehicle_no: data.vehicle_no || null,
      start_date: data.start_date || new Date().toISOString().split('T')[0],
      start_time: data.start_time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
      starting_km: parseFloat(data.starting_km) || 0,
      selected_customers: data.selected_customers || [], // [{ customer_id, hotel_name, visit_order }]
      notes: data.notes || '',
      end_date: data.end_date || null,
      end_time: data.end_time || null,
      final_km: data.final_km !== undefined && data.final_km !== null ? parseFloat(data.final_km) : null,
      distance_km: data.distance_km !== undefined && data.distance_km !== null ? parseFloat(data.distance_km) : null,
      status: data.status || 'In Progress', // 'In Progress' | 'Completed'
      created_at: new Date().toISOString()
    };
    await _q(_sb.from('trips').insert(nullEmptyDates(record)));
    return record;
  },
  async updateTrip(id, data) {
    await _q(_sb.from('trips').update(nullEmptyDates(data)).eq('id', id));
  },
  async deleteTrip(id) {
    await _q(_sb.from('trips').delete().eq('id', id));
  },
  async generateTripId() {
    // Atomic RPC (supabase_driver_app_migration.sql) — a client-side
    // "scan visible trips, take max, add 1" approach (the old body of
    // this function) mints colliding IDs once RLS restricts a driver
    // session to only their own trips, since each driver's scan would
    // only cover their own subset.
    const { data, error } = await _sb.rpc('next_trip_id');
    if (error) throw error;
    return data;
  }
};


