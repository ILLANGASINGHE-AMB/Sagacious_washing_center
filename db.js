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

// Orders only ever carry one of these three payment states — anything else
// read back from the DB (nulls, legacy values) collapses to 'Unpaid'.
function normalizeOrderStatus(status) {
  if (status === 'Paid' || status === 'Partially Paid') return status;
  return 'Unpaid';
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
  async getCustomers() { return _q(_sb.from('customers').select('*').order('hotel_name')); },
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
  async getDrivers() { return _q(_sb.from('drivers').select('*').order('name')); },
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
  async getVehicles() {
    try {
      const rows = await _q(_sb.from('vehicles').select('*').order('vehicle_no'));
      if (rows && rows.length >= 0) return rows;
    } catch(e) {}
    try {
      const val = await DB.getSetting('transport_vehicles_records');
      if (val) return JSON.parse(val);
    } catch(e) {}
    return [];
  },
  async addVehicle(data) {
    const record = {
      vehicle_no: (data.vehicle_no || '').toUpperCase().trim(),
      category: data.category || 'Car',
      model: data.model || '',
      status: data.status || 'available',
      created_at: new Date().toISOString()
    };
    try {
      const rows = await _q(_sb.from('vehicles').insert(record).select());
      if (rows && rows[0]) {
        return rows[0].id;
      }
    } catch(e) {}

    // Fallback in settings
    const vehicles = await DB.getVehicles();
    const fakeId = Date.now();
    const newVeh = { id: fakeId, ...record };
    vehicles.push(newVeh);
    await DB.setSetting('transport_vehicles_records', JSON.stringify(vehicles));
    return fakeId;
  },
  async updateVehicle(id, data) {
    const updateData = { ...data };
    if (updateData.vehicle_no) {
      updateData.vehicle_no = updateData.vehicle_no.toUpperCase().trim();
    }
    try {
      await _q(_sb.from('vehicles').update(updateData).eq('id', id));
    } catch(e) {}
    const vehicles = await DB.getVehicles();
    const idx = vehicles.findIndex(v => String(v.id) === String(id) || v.vehicle_no === id);
    if (idx >= 0) {
      vehicles[idx] = { ...vehicles[idx], ...updateData };
      await DB.setSetting('transport_vehicles_records', JSON.stringify(vehicles));
    }
  },
  async deleteVehicle(id) {
    try {
      await _q(_sb.from('vehicles').delete().eq('id', id));
    } catch(e) {}
    const vehicles = await DB.getVehicles();
    const filtered = vehicles.filter(v => String(v.id) !== String(id) && v.vehicle_no !== id);
    await DB.setSetting('transport_vehicles_records', JSON.stringify(filtered));
  },
  async getVehicle(id) {
    try {
      const rows = await _q(_sb.from('vehicles').select('*').eq('id', id).limit(1));
      if (rows && rows[0]) return rows[0];
    } catch(e) {}
    const vehicles = await DB.getVehicles();
    return vehicles.find(v => String(v.id) === String(id) || v.vehicle_no === id) || null;
  },
  async getVehicleByNo(vehicleNo) {
    if (!vehicleNo) return null;
    const vNo = String(vehicleNo).toUpperCase().trim();
    try {
      const rows = await _q(_sb.from('vehicles').select('*').eq('vehicle_no', vNo).limit(1));
      if (rows && rows[0]) return rows[0];
    } catch(e) {}
    const vehicles = await DB.getVehicles();
    return vehicles.find(v => (v.vehicle_no || '').toUpperCase().trim() === vNo) || null;
  },

  // ── Orders ────────────────────────────────
  async getOrders() {
    const [rows, deletedMap] = await Promise.all([
      _q(_sb.from('orders').select('*').order('created_at', { ascending: false })),
      DB.getDeletedCustomerOrders()
    ]);
    window._deletedCustOrders = deletedMap || {};
    return (rows || []).map(r => { r.status = normalizeOrderStatus(r.status); return r; });
  },
  async addOrder(data) {
    const rows = await _q(_sb.from('orders').insert({ ...data, created_at: new Date().toISOString() }).select());
    return rows[0].id;
  },
  async updateOrder(id, data) { await _q(_sb.from('orders').update(data).eq('id', id)); },
  // Atomic order+items create/update: order row and its line items are
  // written in one Postgres transaction (RPC), so a failed items insert
  // can never leave behind an order with zero items. See
  // supabase_atomic_order_rpc_migration.sql. Fails loudly on error —
  // no silent fallback — same reasoning as _generateSequentialId below.
  async createOrderWithItems(orderData, items) {
    const { data, error } = await _sb.rpc('create_order_with_items', { p_order: orderData, p_items: items || [] });
    if (error) { console.error('create_order_with_items failed:', error); throw error; }
    return data;
  },
  async updateOrderWithItems(orderId, orderData, items) {
    const { error } = await _sb.rpc('update_order_with_items', { p_order_id: orderId, p_order: orderData, p_items: items || [] });
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

  // ── Order Items ───────────────────────────
  async getOrderItems(orderId) { return _q(_sb.from('order_items').select('*').eq('order_id', orderId).order('id', { ascending: true })); },
  async getAllOrderItems() { return _q(_sb.from('order_items').select('*').order('id', { ascending: true })); },
  async addOrderItem(data) {
    const rows = await _q(_sb.from('order_items').insert(data).select());
    return rows[0].id;
  },
  async updateOrderItem(id, data) { await _q(_sb.from('order_items').update(data).eq('id', id)); },
  async deleteOrderItem(id) { await _q(_sb.from('order_items').delete().eq('id', id)); },
  async deleteOrderItems(orderId) { await _q(_sb.from('order_items').delete().eq('order_id', orderId)); },

  // ── Invoices ──────────────────────────────
  async getInvoices() { return _q(_sb.from('invoices').select('*').order('id', { ascending: false })); },
  async addInvoice(data) {
    const rows = await _q(_sb.from('invoices').insert(data).select());
    return rows[0].id;
  },
  async updateInvoice(id, data) { await _q(_sb.from('invoices').update(data).eq('id', id)); },
  async getInvoice(id) {
    const rows = await _q(_sb.from('invoices').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },
  async getInvoiceByOrder(orderId) {
    const rows = await _q(_sb.from('invoices').select('*').eq('order_id', orderId).limit(1));
    return rows[0] || null;
  },
  async deleteInvoice(id) { await _q(_sb.from('invoices').delete().eq('id', id)); },

  // ── Payments ──────────────────────────────
  async getPayments() { return _q(_sb.from('payments').select('*').order('date', { ascending: false })); },
  async addPayment(data) {
    const rows = await _q(_sb.from('payments').insert({ ...data, date: new Date().toISOString() }).select());
    return rows[0].id;
  },
  async getPaymentsByInvoice(invoiceId) {
    return _q(_sb.from('payments').select('*').eq('invoice_id', invoiceId));
  },
  async deletePaymentsForInvoice(invoiceId) {
    await _q(_sb.from('payments').delete().eq('invoice_id', invoiceId));
  },

  // ── Items Catalog ─────────────────────────
  async getItems() { return _q(_sb.from('items').select('*').order('item_id')); },
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
    };
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
    const [customers, drivers, vehicles, orders, order_items, invoices, payments, settings, items, deductions, expense_categories, expense_types, expense_entries, expense_amounts, trips] = await Promise.all([
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
      DB.getTrips()
    ]);
    return { customers, drivers, vehicles, orders, order_items, invoices, payments, settings, items, deductions, expense_categories, expense_types, expense_entries, expense_amounts, trips, exported_at: new Date().toISOString() };
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
    // 1. Delete all existing data in proper dependency order to avoid FK violation errors
    await _q(_sb.from('deductions').delete().neq('id', 0));
    await _q(_sb.from('payments').delete().neq('id', 0));
    await _q(_sb.from('invoices').delete().neq('id', 0));
    await _q(_sb.from('order_items').delete().neq('id', 0));
    await _q(_sb.from('orders').delete().neq('id', 0));
    await _q(_sb.from('customers').delete().neq('id', 0));
    await _q(_sb.from('drivers').delete().neq('id', 0));
    await _q(_sb.from('items').delete().neq('id', 0));
    await _q(_sb.from('settings').delete().neq('key', 'DOES_NOT_EXIST'));
    // Note: the legacy `users` table is no longer touched here — it's RLS-locked
    // post-migration and login accounts live in Supabase Auth now, managed only
    // via Settings > User Management (admin-users.js), never via backup/restore.

    // 2. Mapping dictionaries
    const customerMap = {};
    const driverMap = {};
    const itemMap = {};
    const orderMap = {};
    const invoiceMap = {};

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

    // 6. Customers
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

    // 7. Drivers
    if (data.drivers?.length) {
      const sortedDrivers = [...data.drivers].sort((a, b) => a.id - b.id);
      for (const d of sortedDrivers) {
        const copy = { ...d };
        delete copy.id;
        const inserted = await _q(_sb.from('drivers').insert(copy).select());
        driverMap[d.id] = inserted[0].id;
      }
    }

    // 8. Orders
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

    // 9. Order Items
    if (data.order_items?.length) {
      const orderItemsToInsert = data.order_items.map(oi => {
        const copy = { ...oi };
        delete copy.id;
        copy.order_id = orderMap[oi.order_id] || null;
        if (oi.catalog_item_id) {
          copy.catalog_item_id = itemMap[oi.catalog_item_id] || null;
        }
        return copy;
      }).filter(oi => oi.order_id !== null);
      
      for (let i = 0; i < orderItemsToInsert.length; i += 50) {
        const chunk = orderItemsToInsert.slice(i, i + 50);
        await _q(_sb.from('order_items').insert(chunk));
      }
    }

    // 10. Invoices
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

    // 11. Payments
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

    // 12. Deductions
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
  },

  // ── Deductions ─────────────────────────────
  async getDeductions() {
    return _q(_sb.from('deductions').select('*').order('created_at', { ascending: false }));
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

  // ── Expenses: Categories (Cash Book top-level columns) ─
  async getExpenseCategories() {
    return _q(_sb.from('expense_categories').select('*').order('sort_order'));
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
    return _q(_sb.from('expense_types').select('*').order('sort_order'));
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
    return _q(_sb.from('expense_entries').select('*').order('entry_date'));
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
    return _q(_sb.from('expense_amounts').select('*'));
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
  async getTrips() {
    try {
      const rows = await _q(_sb.from('trips').select('*').order('start_date', { ascending: false }).order('created_at', { ascending: false }));
      if (rows) return rows;
    } catch(e) {}
    try {
      const val = await DB.getSetting('transport_trips_records');
      if (val) return JSON.parse(val);
    } catch(e) {}
    return [];
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

    try {
      await _q(_sb.from('trips').insert(record));
    } catch(e) {}

    const trips = await DB.getTrips();
    trips.unshift(record);
    await DB.setSetting('transport_trips_records', JSON.stringify(trips));
    return record;
  },
  async updateTrip(id, data) {
    try {
      await _q(_sb.from('trips').update(data).eq('id', id));
    } catch(e) {}
    const trips = await DB.getTrips();
    const idx = trips.findIndex(t => t.id === id || t.trip_id === id);
    if (idx >= 0) {
      trips[idx] = { ...trips[idx], ...data };
      await DB.setSetting('transport_trips_records', JSON.stringify(trips));
    }
  },
  async deleteTrip(id) {
    try {
      await _q(_sb.from('trips').delete().eq('id', id));
    } catch(e) {}
    const trips = await DB.getTrips();
    const filtered = trips.filter(t => t.id !== id && t.trip_id !== id);
    await DB.setSetting('transport_trips_records', JSON.stringify(filtered));
  },
  async generateTripId() {
    const prefix = 'ST-';
    let maxSeq = 0;
    try {
      const trips = await DB.getTrips();
      trips.forEach(t => {
        if (t.trip_id && t.trip_id.startsWith(prefix)) {
          const seq = parseInt(t.trip_id.replace(prefix, ''), 10) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
      });
    } catch(e) {}
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }
};


