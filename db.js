// db.js - Supabase Database
const SUPABASE_URL = window.SUPABASE_URL || 'https://mzxpdirmsegsgkrunerk.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eHBkaXJtc2Vnc2drcnVuZXJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0ODIyMDYsImV4cCI6MjA5OTA1ODIwNn0.8qwcNal0BrNaLd7FBg-Om_ZMLbPi_VA_dxFnha-Ma4E';
const { createClient } = supabase;
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function _q(promise) {
  const { data, error } = await promise;
  if (error) { console.error('Supabase error:', error); throw error; }
  return data;
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
    const rows = await _q(_sb.from('customers').insert({ ...data, created_date: new Date().toISOString() }).select());
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
    const rows = await _q(_sb.from('drivers').insert(data).select());
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

  // ── Orders ────────────────────────────────
  async getOrders() {
    const [rows, deletedMap] = await Promise.all([
      _q(_sb.from('orders').select('*').order('created_at', { ascending: false })),
      DB.getDeletedCustomerOrders()
    ]);
    window._deletedCustOrders = deletedMap || {};
    return (rows || []).map(r => { r.status = (r.status === 'Paid' ? 'Paid' : 'Unpaid'); return r; });
  },
  async addOrder(data) {
    const rows = await _q(_sb.from('orders').insert({ ...data, created_at: new Date().toISOString() }).select());
    return rows[0].id;
  },
  async updateOrder(id, data) { await _q(_sb.from('orders').update(data).eq('id', id)); },
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
    if (r) { r.status = (r.status === 'Paid' ? 'Paid' : 'Unpaid'); }
    return r;
  },
  async getOrdersByStatus(status) { return _q(_sb.from('orders').select('*').eq('status', status)); },
  async getOrdersByCustomer(cid) {
    const rows = await _q(_sb.from('orders').select('*').eq('customer_id', cid).order('created_at', { ascending: false }));
    return (rows || []).map(r => { r.status = (r.status === 'Paid' ? 'Paid' : 'Unpaid'); return r; });
  },

  // ── Order Items ───────────────────────────
  async getOrderItems(orderId) { return _q(_sb.from('order_items').select('*').eq('order_id', orderId)); },
  async getAllOrderItems() { return _q(_sb.from('order_items').select('*')); },
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

  // ── Users ─────────────────────────────────
  async getUsers() { return _q(_sb.from('users').select('*').order('username')); },
  async addUser(data) {
    const rows = await _q(_sb.from('users').insert(data).select());
    return rows[0].id;
  },
  async updateUser(id, data) { await _q(_sb.from('users').update(data).eq('id', id)); },
  async deleteUser(id) { await _q(_sb.from('users').delete().eq('id', id)); },
  async getUser(id) {
    const rows = await _q(_sb.from('users').select('*').eq('id', id).limit(1));
    return rows[0] || null;
  },
  async getUserByUsername(username) {
    const rows = await _q(_sb.from('users').select('*').ilike('username', username).limit(1));
    return rows[0] || null;
  },
  async ensureDefaultUsers() {
    try {
      const driverUser = await _q(_sb.from('users').select('id').ilike('username', 'driver').limit(1));
      if (!driverUser || driverUser.length === 0) {
        await _q(_sb.from('users').insert([
          { username: 'driver', password: 'd8590', role: 'driver', display_name: 'Driver User' }
        ]));
      }
    } catch(e) {}

    const rows = await _q(_sb.from('users').select('id').limit(1)).catch(()=>[]);
    if (rows.length === 0) {
      await _q(_sb.from('users').insert([
        { username: 'admin', password: 'admin', role: 'admin', display_name: 'Administrator' },
        { username: 'user', password: 'user', role: 'user', display_name: 'Staff User' },
        { username: 'driver', password: 'd8590', role: 'driver', display_name: 'Driver User' }
      ])).catch(()=>{});
    }
  },
  async validateLogin(username, password) {
    try {
      const rows = await _q(_sb.from('users').select('*').ilike('username', username).eq('password', password).limit(1));
      if (rows && rows[0]) return rows[0];
    } catch(e) {
      console.error('Login validation error:', e);
    }
    // Fail closed: No hardcoded fallback logins
    return null;
  },

  // ── ID Generators — Atomic RPC Sequence with fallback ──
  async generateBatchId() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `LND-${mm}${yy}-`;                          // e.g. LND-0526-
    try {
      const { data, error } = await _sb.rpc('next_batch_id', { prefix });
      if (!error && data) return data;
    } catch (e) {
      console.warn('next_batch_id RPC fallback triggered:', e);
    }
    // Fallback client-side generation if RPC is missing
    const rows = await _q(_sb.from('orders').select('batch_id').like('batch_id', `${prefix}%`));
    let maxSeq = 0;
    (rows || []).forEach(r => {
      const parts = (r.batch_id || '').split('-');
      const n = parseInt(parts[parts.length - 1]) || 0;
      if (n > maxSeq) maxSeq = n;
    });
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  },
  async generateInvoiceNumber() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `INV-${mm}${yy}-`;                          // e.g. INV-0526-
    try {
      const { data, error } = await _sb.rpc('next_invoice_number', { prefix });
      if (!error && data) return data;
    } catch (e) {
      console.warn('next_invoice_number RPC fallback triggered:', e);
    }
    // Fallback client-side generation if RPC is missing
    const rows = await _q(_sb.from('invoices').select('invoice_number').like('invoice_number', `${prefix}%`));
    let maxSeq = 0;
    (rows || []).forEach(r => {
      const parts = (r.invoice_number || '').split('-');
      const n = parseInt(parts[parts.length - 1]) || 0;
      if (n > maxSeq) maxSeq = n;
    });
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  },

  // ── Export / Import ───────────────────────
  async exportAll() {
    const [customers, drivers, orders, order_items, invoices, payments, settings, items, deductions, users, chemicals, chemical_ledger, general_expenses, trips] = await Promise.all([
      DB.getCustomers(), DB.getDrivers(), DB.getOrders(),
      _q(_sb.from('order_items').select('*')),
      DB.getInvoices(), DB.getPayments(),
      _q(_sb.from('settings').select('*')),
      DB.getItems(),
      _q(_sb.from('deductions').select('*')),
      _q(_sb.from('users').select('*')),
      DB.getChemicals(),
      DB.getChemicalLedger(),
      DB.getGeneralExpenses(),
      DB.getTrips()
    ]);
    return { customers, drivers, orders, order_items, invoices, payments, settings, items, deductions, users, chemicals, chemical_ledger, general_expenses, trips, exported_at: new Date().toISOString() };
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
    await _q(_sb.from('users').delete().neq('id', 0));
    await _q(_sb.from('settings').delete().neq('key', 'DOES_NOT_EXIST'));

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

    // 4. Users
    if (data.users?.length) {
      const usersToInsert = data.users.map(r => {
        const copy = { ...r };
        delete copy.id;
        return copy;
      });
      await _q(_sb.from('users').insert(usersToInsert));
    }

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

  // ── QR Delivery Confirmation ───────────────
  async getOrderByToken(token) {
    const rows = await _q(_sb.from('orders').select('*').eq('qr_token', token).limit(1));
    const r = rows[0] || null;
    if (r) { r.status = (r.status === 'Paid' ? 'Paid' : r.status); }
    return r;
  },
  async markOrderReceivedByQR(token) {
    // 1. Find the order by token
    const rows = await _q(_sb.from('orders').select('*').eq('qr_token', token).limit(1));
    const order = rows[0] || null;
    if (!order) throw new Error('Invalid or expired QR token.');
    if (order.status === 'Paid') return { already_paid: true, order };

    const now = new Date().toISOString();

    // 2. Find or create the invoice (mirrors processFullPayment in app.js)
    const invRows = await _q(_sb.from('invoices').select('*').eq('order_id', order.id).limit(1));
    let inv = invRows[0] || null;

    if (inv) {
      // Invoice exists — mark it paid
      await _q(_sb.from('invoices').update({
        balance: 0,
        paid_status: 'Paid',
        payment_date: now
      }).eq('id', inv.id));
      // Record a payment entry
      await _q(_sb.from('payments').insert({
        invoice_id: inv.id,
        amount: Math.max(0, (inv.balance || 0)),
        method: 'Cash on Delivery',
        notes: 'Confirmed via QR delivery scan',
        date: now
      }));
    } else {
      // No invoice yet — create one (mirrors saveNewOrder Paid path)
      const mm = String(new Date().getMonth() + 1).padStart(2, '0');
      const yy = String(new Date().getFullYear()).slice(-2);
      const prefix = `INV-${mm}${yy}-`;
      const invNumRows = await _q(_sb.from('invoices').select('invoice_number').like('invoice_number', `${prefix}%`));
      let maxSeq = 0;
      (invNumRows || []).forEach(r => {
        const parts = (r.invoice_number || '').split('-');
        const n = parseInt(parts[parts.length - 1]) || 0;
        if (n > maxSeq) maxSeq = n;
      });
      const invNum = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

      const orderItemRows = await _q(_sb.from('order_items').select('*').eq('order_id', order.id));
      const itemsSubtotal = (orderItemRows || []).reduce((s, i) => s + (i.subtotal || 0), 0);

      const newInvId = await _q(_sb.from('invoices').insert({
        order_id:                 order.id,
        invoice_number:           invNum,
        issue_date:               now,
        delivery_date:            order.delivery_date,
        invoice_type:             'Standard',
        total_amount:             order.total_amount,
        advance_payment:          order.advance_payment || 0,
        extra_payment:            order.extra_payment || 0,
        balance:                  0,
        paid_status:              'Paid',
        payment_date:             now,
        discount_rate:            order.discount_rate || 0,
        discount_amount:          order.discount_amount || 0,
        delivery_charge:          order.delivery_charge || 0,
        subtotal_before_discount: itemsSubtotal
      }).select());

      const createdInvId = newInvId[0].id;
      const balanceDue = Math.max(0, (order.total_amount || 0) - (order.advance_payment || 0));
      if (balanceDue > 0) {
        await _q(_sb.from('payments').insert({
          invoice_id: createdInvId,
          amount:     balanceDue,
          method:     'Cash on Delivery',
          notes:      'Confirmed via QR delivery scan',
          date:       now
        }));
      }
    }

    // 3. Update order to Paid
    await _q(_sb.from('orders').update({
      status:       'Paid',
      payment_date: now
    }).eq('id', order.id));

    return { already_paid: false, order };
  },

  async seedDemoData() {
    await DB.ensureDefaultUsers();
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

  // ── Chemicals & Expenses ──────────────────
  async getChemicals() {
    try {
      const rows = await _q(_sb.from('chemicals').select('*').order('chemical_id'));
      if (rows && rows.length > 0) return rows;
    } catch(e) {
      // Fallback to setting store
    }
    try {
      const val = await DB.getSetting('chemical_master_list');
      if (val) {
        const parsed = JSON.parse(val);
        // Filter out old seed defaults if present
        const filtered = parsed.filter(c => !['CHM-0001', 'CHM-0002', 'CHM-0003', 'CHM-0004', 'CHM-0005'].includes(c.chemical_id) || c.user_added);
        return filtered;
      }
    } catch(e) {}

    return [];
  },
  async addChemical(data) {
    let nextId = 'CHM-0001';
    try {
      const existing = await DB.getChemicals();
      let maxSeq = 0;
      existing.forEach(c => {
        if (c.chemical_id && c.chemical_id.startsWith('CHM-')) {
          const n = parseInt(c.chemical_id.replace('CHM-', ''), 10) || 0;
          if (n > maxSeq) maxSeq = n;
        }
      });
      nextId = `CHM-${String(maxSeq + 1).padStart(4, '0')}`;
    } catch(e) {}

    const record = {
      chemical_id: data.chemical_id || nextId,
      name: data.name,
      unit: data.unit || 'kg',
      package_size: data.package_size || '',
      status: data.status || 'Active',
      user_added: true,
      created_at: new Date().toISOString()
    };

    try {
      const rows = await _q(_sb.from('chemicals').insert(record).select());
      if (rows && rows[0]) return rows[0];
    } catch(e) {}

    // Fallback store
    const list = await DB.getChemicals();
    record.id = Date.now();
    list.push(record);
    await DB.setSetting('chemical_master_list', JSON.stringify(list));
    return record;
  },
  async updateChemical(id, data) {
    try {
      await _q(_sb.from('chemicals').update(data).eq('id', id));
    } catch(e) {}
    const list = await DB.getChemicals();
    const idx = list.findIndex(c => c.id === id || c.chemical_id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data };
      await DB.setSetting('chemical_master_list', JSON.stringify(list));
    }
  },
  async deleteChemical(id) {
    try {
      await _q(_sb.from('chemicals').delete().eq('id', id));
    } catch(e) {}
    const list = await DB.getChemicals();
    const filtered = list.filter(c => c.id !== id && c.chemical_id !== id);
    await DB.setSetting('chemical_master_list', JSON.stringify(filtered));
  },

  // ── Chemical Stock Ledger (IN / OUT / BAL) ─
  async getChemicalLedger() {
    try {
      const rows = await _q(_sb.from('chemical_ledger').select('*').order('date', { ascending: true }));
      if (rows) return rows;
    } catch(e) {}
    try {
      const val = await DB.getSetting('chemical_ledger_records');
      if (val) return JSON.parse(val);
    } catch(e) {}
    return [];
  },
  async addChemicalLedgerEntry(entry) {
    const record = {
      id: 'chm_log_' + Date.now() + '_' + Math.floor(Math.random()*1000),
      expense_id: entry.expense_id || null,
      date: entry.date || new Date().toISOString().split('T')[0],
      chemical_id: entry.chemical_id, // e.g. CHM-0001
      chemical_name: entry.chemical_name,
      type: entry.type, // 'IN' or 'OUT'
      qty_in: parseFloat(entry.qty_in) || 0,
      qty_out: parseFloat(entry.qty_out) || 0,
      unit: entry.unit || 'kg',
      unit_price: parseFloat(entry.unit_price) || 0,
      total_amount: parseFloat(entry.total_amount) || 0,
      notes: entry.notes || '',
      created_at: new Date().toISOString()
    };

    try {
      await _q(_sb.from('chemical_ledger').insert(record));
    } catch(e) {}

    const logs = await DB.getChemicalLedger();
    logs.push(record);
    logs.sort((a,b) => new Date(a.date) - new Date(b.date));
    await DB.setSetting('chemical_ledger_records', JSON.stringify(logs));
    return record;
  },
  async deleteChemicalLedgerEntry(id) {
    try {
      await _q(_sb.from('chemical_ledger').delete().eq('id', id));
    } catch(e) {}
    const logs = await DB.getChemicalLedger();
    const filtered = logs.filter(l => l.id !== id && l.expense_id !== id);
    await DB.setSetting('chemical_ledger_records', JSON.stringify(filtered));
  },

  // ── General Expenses ──────────────────────
  async getGeneralExpenses() {
    try {
      const rows = await _q(_sb.from('general_expenses').select('*').order('expense_date', { ascending: false }));
      if (rows) return rows;
    } catch(e) {}
    try {
      const val = await DB.getSetting('general_expenses_records');
      if (val) return JSON.parse(val);
    } catch(e) {}
    return [];
  },
  async addGeneralExpense(data) {
    const expenseId = await DB.generateExpenseId();
    const record = {
      id: 'gen_exp_' + Date.now() + '_' + Math.floor(Math.random()*1000),
      expense_id: expenseId,
      expense_name: data.expense_name, // e.g. "Diesel for Delivery Truck", "Electricity Bill"
      expense_date: data.expense_date || new Date().toISOString().split('T')[0],
      amount: parseFloat(data.amount) || 0,
      payment_method: data.payment_method || 'Cash',
      months_covered: parseInt(data.months_covered, 10) || 1, // Multi-month averaging
      monthly_averaged_amount: (parseFloat(data.amount) || 0) / (parseInt(data.months_covered, 10) || 1),
      notes: data.notes || '',
      created_at: new Date().toISOString()
    };

    try {
      await _q(_sb.from('general_expenses').insert(record));
    } catch(e) {}

    const expenses = await DB.getGeneralExpenses();
    expenses.unshift(record);
    await DB.setSetting('general_expenses_records', JSON.stringify(expenses));
    return record;
  },
  async deleteGeneralExpense(id) {
    try {
      await _q(_sb.from('general_expenses').delete().eq('id', id));
    } catch(e) {}
    const expenses = await DB.getGeneralExpenses();
    const filtered = expenses.filter(e => e.id !== id && e.expense_id !== id);
    await DB.setSetting('general_expenses_records', JSON.stringify(filtered));
  },

  // ── Expense ID Generator — EXP-YYYY-XXXXX ─
  async generateExpenseId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const prefix = `EXP-${yyyy}-`;
    
    let maxSeq = 0;
    try {
      const [chemLogs, genExp] = await Promise.all([
        DB.getChemicalLedger(),
        DB.getGeneralExpenses()
      ]);

      chemLogs.forEach(c => {
        if (c.expense_id && c.expense_id.startsWith(prefix)) {
          const seq = parseInt(c.expense_id.replace(prefix, ''), 10) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
      });
      genExp.forEach(g => {
        if (g.expense_id && g.expense_id.startsWith(prefix)) {
          const seq = parseInt(g.expense_id.replace(prefix, ''), 10) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
      });
    } catch(e) {}

    return `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;
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
      const rows = await _q(_sb.from('trips').select('*').order('created_at', { ascending: false }));
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
      driver_name: data.driver_name || (window.currentUser?.display_name || 'Driver'),
      start_date: data.start_date || new Date().toISOString().split('T')[0],
      start_time: data.start_time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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


