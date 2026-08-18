// chatbot.js — SAGA Assistant: a free, rule-based Q&A engine over your own database.
//
// This deliberately makes ZERO external AI calls. There is no API key, no per-message
// cost, and no dependency on Gemini (or anything else) being online. Every answer is
// produced by matching the question against a set of known intents (keyword/pattern
// matching only — no ML, no NLP libraries) and then running the SAME DB.*/Financials.*
// functions the rest of the app already uses, so the numbers always match what you see
// on the Orders/Invoices/Analytics pages.
//
// Trade-off: it can only answer the kinds of questions it was built to recognise (see
// SAGABot.HELP_TOPICS below). It will never hallucinate a number — if it doesn't
// recognise the question, it says so and shows examples, instead of guessing.
//
// To teach it a new question type, add one entry to INTENTS below: a `test(text)`
// matcher and a `run(text)` handler that returns a plain-text (light-markdown) answer.

const SAGABot = {

  HELP_TOPICS: [
    'revenue this month',
    'net profit last month',
    'expenses this week',
    'how much have we collected this month',
    'average order value this month',
    'how many orders today',
    'unpaid orders',
    'outstanding balance',
    'top customers this year',
    'balance for <customer name>',
    'order LND-0826-0001',
    'invoice INV-0826-0001',
    "today's summary"
  ],

  // ── Entry point ─────────────────────────────────────────────
  async answer(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return "I didn't catch a question — try asking something like \"revenue this month\" or \"unpaid orders\".";

    const lower = text.toLowerCase();

    for (const intent of SAGABot._intents) {
      if (intent.test(lower)) {
        try {
          return await intent.run(lower, text);
        } catch (err) {
          console.error('SAGABot intent error:', intent.name, err);
          return `I found a matching question type but couldn't compute the answer (${err.message}). This usually means a table is empty or unreachable right now.`;
        }
      }
    }
    return SAGABot._fallback(text);
  },

  _fallback(text) {
    const examples = SAGABot.HELP_TOPICS.slice(0, 6).map(t => `• ${t}`).join('\n');
    return `I don't recognise that one yet — I only answer questions I've been specifically built to handle (no AI guessing involved). Try things like:\n${examples}\n\nSay "help" to see the full list.`;
  },

  // ── Date-range parsing ──────────────────────────────────────
  // Returns { start: Date, end: Date, label: string } for a recognised phrase, or null
  // if the text has no date phrase (callers decide their own default in that case).
  parsePeriod(text) {
    const now = new Date();
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

    if (/\btoday\b/.test(text)) {
      return { start: startOfDay(now), end: endOfDay(now), label: 'today' };
    }
    if (/\byesterday\b/.test(text)) {
      const y = addDays(now, -1);
      return { start: startOfDay(y), end: endOfDay(y), label: 'yesterday' };
    }
    if (/\blast\s+7\s+days?\b|\bpast\s+week\b/.test(text)) {
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now), label: 'the last 7 days' };
    }
    if (/\blast\s+30\s+days?\b/.test(text)) {
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now), label: 'the last 30 days' };
    }
    if (/\bthis\s+week\b/.test(text)) {
      const dow = now.getDay(); // 0=Sun
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = addDays(now, mondayOffset);
      return { start: startOfDay(monday), end: endOfDay(now), label: 'this week' };
    }
    if (/\blast\s+week\b/.test(text)) {
      const dow = now.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const thisMonday = addDays(now, mondayOffset);
      const lastMonday = addDays(thisMonday, -7);
      const lastSunday = addDays(thisMonday, -1);
      return { start: startOfDay(lastMonday), end: endOfDay(lastSunday), label: 'last week' };
    }
    if (/\bthis\s+month\b/.test(text)) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(start), end: endOfDay(now), label: 'this month' };
    }
    if (/\blast\s+month\b/.test(text)) {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end), label: 'last month' };
    }
    if (/\bthis\s+year\b/.test(text)) {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start: startOfDay(start), end: endOfDay(now), label: 'this year' };
    }
    if (/\blast\s+year\b/.test(text)) {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31);
      return { start: startOfDay(start), end: endOfDay(end), label: 'last year' };
    }

    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthMatch = text.match(new RegExp(`\\b(${months.join('|')})\\b(?:\\s+(\\d{4}))?`));
    if (monthMatch) {
      const mi = months.indexOf(monthMatch[1]);
      const year = monthMatch[2] ? parseInt(monthMatch[2]) : now.getFullYear();
      const start = new Date(year, mi, 1);
      const end = new Date(year, mi + 1, 0);
      const label = `${monthMatch[1][0].toUpperCase()}${monthMatch[1].slice(1)} ${year}`;
      return { start: startOfDay(start), end: endOfDay(end), label };
    }

    const lastNDays = text.match(/\blast\s+(\d+)\s+days?\b/);
    if (lastNDays) {
      const n = parseInt(lastNDays[1]);
      return { start: startOfDay(addDays(now, -(n - 1))), end: endOfDay(now), label: `the last ${n} days` };
    }

    return null;
  },

  // Default period for financial questions when none was specified: this month.
  periodOrDefault(text) {
    return SAGABot.parsePeriod(text) || (() => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now, label: 'this month (no period specified — showing month-to-date)' };
    })();
  },

  inRange(dateVal, start, end) {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    if (isNaN(d)) return false;
    return d >= start && d <= end;
  },

  // ── Shared business-metrics calculator ───────────────────────
  // Mirrors the exact formulas used on the Analytics page (gross revenue → net booked
  // revenue → cash collected → Cash Book expenses → net profit), so numbers the
  // chatbot gives always agree with what's shown there.
  async computeMetrics(start, end) {
    const [orders, invoices, payments, expenseCategories, expenseTypes, expenseEntries, expenseAmounts, trips, fuelConfig] = await Promise.all([
      DB.getOrders(), DB.getInvoices(), DB.getPayments(),
      DB.getExpenseCategories(), DB.getExpenseTypes(), DB.getExpenseEntries(), DB.getExpenseAmounts(),
      DB.getTrips(),
      DB.getFuelPriceSettings ? DB.getFuelPriceSettings() : Promise.resolve({})
    ]);

    const filteredOrders = orders.filter(o => SAGABot.inRange(o.created_at || o.pickup_date, start, end));
    const invMap = Object.fromEntries(invoices.map(i => [i.order_id, i]));
    const payMap = {};
    payments.forEach(p => { (payMap[p.invoice_id] ||= []).push(p); });

    const grossRevenue = filteredOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    let totalDeductions = 0;
    filteredOrders.forEach(o => {
      const inv = invMap[o.id];
      if (inv && inv.deduction_amount) totalDeductions += parseFloat(inv.deduction_amount) || 0;
    });
    const netBookedRevenue = Math.max(0, grossRevenue - totalDeductions);

    const advanceCollected = filteredOrders.reduce((s, o) => s + (parseFloat(o.advance_payment) || 0), 0);
    const periodPayments = payments.filter(p => SAGABot.inRange(p.date || p.created_at, start, end))
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const cashCollected = advanceCollected + periodPayments;

    const flatExpenses = (typeof Financials !== 'undefined' && Financials.flattenExpenseData)
      ? Financials.flattenExpenseData(expenseAmounts, expenseEntries, expenseTypes, expenseCategories)
      : [];
    const expenseCalc = (typeof Financials !== 'undefined' && Financials.computeExpenseTotals)
      ? Financials.computeExpenseTotals(flatExpenses, start, end)
      : { total: 0, byCategory: {} };

    let totalTransportFuelExpenses = 0;
    trips.filter(t => t.status === 'Completed' && SAGABot.inRange(t.start_date || t.created_at, start, end))
      .forEach(t => {
        const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
        const mKey = dateStr ? dateStr.slice(0, 7) : '';
        const mPriceConfig = (fuelConfig.monthly_prices && fuelConfig.monthly_prices[mKey]) ? fuelConfig.monthly_prices[mKey] : fuelConfig;
        const ratePerKm = parseFloat(mPriceConfig.cost_per_km || (mPriceConfig.current_price / (mPriceConfig.km_per_litre || 1)) || 37);
        totalTransportFuelExpenses += (parseFloat(t.distance_km) || 0) * ratePerKm;
      });

    // "Total expenses" is sourced ONLY from the Expenses tab's Cash Book data,
    // so it always agrees with the Expenses tab's own totals. Transport fuel
    // is a separately computed trip cost, not an Expenses-tab entry, so it's
    // still answerable via its own question but doesn't count toward this.
    const totalCashBookExpenses = expenseCalc.total || 0;
    const totalExpenses = totalCashBookExpenses;
    const netProfit = netBookedRevenue - totalExpenses;
    const orderCount = filteredOrders.length;
    const avgOrderValue = orderCount > 0 ? netBookedRevenue / orderCount : 0;

    return {
      orderCount, grossRevenue, netBookedRevenue, cashCollected, avgOrderValue,
      totalCashBookExpenses, byCategory: expenseCalc.byCategory || {}, totalTransportFuelExpenses, totalExpenses, netProfit
    };
  },

  _intents: [] // populated below
};

// ── Intent definitions ──────────────────────────────────────────

SAGABot._intents.push({
  name: 'greeting',
  test: t => /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(t) && t.length < 25,
  run: async () => `Hi! I'm the SAGA Assistant — I answer questions directly from your database, instantly and for free (no AI calls). Ask me about revenue, profit, expenses, unpaid orders/invoices, or a specific customer/order/invoice. Say "help" for examples.`
});

SAGABot._intents.push({
  name: 'help',
  test: t => /\bhelp\b|what can you do|examples?\b/.test(t),
  run: async () => `Here's what I can answer:\n${SAGABot.HELP_TOPICS.map(t => `• ${t}`).join('\n')}\n\nYou can add a time period to most of these — "today", "this week", "last month", "August 2026", etc. No period usually defaults to this month.`
});

SAGABot._intents.push({
  name: 'todaySummary',
  test: t => /today.{0,10}summary|summary.{0,10}today|how.?s today|how is today/.test(t),
  run: async () => {
    const { start, end } = SAGABot.parsePeriod('today');
    const m = await SAGABot.computeMetrics(start, end);
    const orders = await DB.getOrders();
    const invoices = await DB.getInvoices();
    const payments = await DB.getPayments();
    const payMap = {};
    payments.forEach(p => { (payMap[p.invoice_id] ||= []).push(p); });
    const unpaidToday = invoices.filter(inv => {
      const fin = Financials.computeInvoiceFinancials(inv, [], payMap[inv.id] || []);
      return !fin.isPaid && SAGABot.inRange(inv.created_at, start, end);
    }).length;
    return `**Today's snapshot**\n• Orders placed: ${m.orderCount}\n• Revenue booked: ${formatCurrency(m.grossRevenue)}\n• Cash collected: ${formatCurrency(m.cashCollected)}\n• New unpaid invoices today: ${unpaidToday}`;
  }
});

SAGABot._intents.push({
  name: 'profit',
  test: t => /\bprofit\b/.test(t),
  run: async (t) => {
    const { start, end, label } = SAGABot.periodOrDefault(t);
    const m = await SAGABot.computeMetrics(start, end);
    const marginPct = m.netBookedRevenue > 0 ? (m.netProfit / m.netBookedRevenue) * 100 : 0;
    return `**Net profit for ${label}:** ${formatCurrency(m.netProfit)}\n(Net booked revenue ${formatCurrency(m.netBookedRevenue)} − total expenses ${formatCurrency(m.totalExpenses)}, ${marginPct.toFixed(1)}% margin)\n\nNote: this reflects revenue booked and expenses logged in the Expenses tab — it won't include costs like staff wages, rent, or transport fuel unless you've entered them there.`;
  }
});

SAGABot._intents.push({
  name: 'expenses',
  test: t => /\bexpenses?\b|\bcosts?\b|\bspent\b|\bspending\b/.test(t) && !/order value/.test(t),
  run: async (t) => {
    const { start, end, label } = SAGABot.periodOrDefault(t);
    const m = await SAGABot.computeMetrics(start, end);
    if (/fuel|transport|diesel|petrol/.test(t)) {
      return `**Transport/fuel expenses for ${label}:** ${formatCurrency(m.totalTransportFuelExpenses)} (completed trips only)`;
    }
    // Category-specific lookup: if the question names one of the user's
    // actual Cash Book categories (e.g. "vehicle expenses this month"),
    // answer with just that category's total instead of the full breakdown.
    const catMatch = Object.values(m.byCategory).find(c => c.name && t.includes(c.name.toLowerCase()));
    if (catMatch) {
      return `**${catMatch.name} expenses for ${label}:** ${formatCurrency(catMatch.total)}`;
    }
    const categoryLines = Object.values(m.byCategory)
      .sort((a, b) => b.total - a.total)
      .map(c => `• ${c.name}: ${formatCurrency(c.total)}`)
      .join('\n');
    return `**Total expenses for ${label}:** ${formatCurrency(m.totalExpenses)} (from the Expenses tab)\n${categoryLines}`;
  }
});

SAGABot._intents.push({
  name: 'cashCollected',
  test: t => /collect(ed)?|cash in hand|received payment|actually (got|received)/.test(t),
  run: async (t) => {
    const { start, end, label } = SAGABot.periodOrDefault(t);
    const m = await SAGABot.computeMetrics(start, end);
    const ratio = m.netBookedRevenue > 0 ? (m.cashCollected / m.netBookedRevenue) * 100 : 0;
    return `**Cash actually collected in ${label}:** ${formatCurrency(m.cashCollected)}\n(${ratio.toFixed(1)}% of the ${formatCurrency(m.netBookedRevenue)} booked in that period — the rest is still outstanding)`;
  }
});

SAGABot._intents.push({
  name: 'avgOrderValue',
  test: t => /average order|avg order|order value/.test(t),
  run: async (t) => {
    const { start, end, label } = SAGABot.periodOrDefault(t);
    const m = await SAGABot.computeMetrics(start, end);
    return `**Average order value for ${label}:** ${formatCurrency(m.avgOrderValue)} across ${m.orderCount} order${m.orderCount === 1 ? '' : 's'}`;
  }
});

SAGABot._intents.push({
  name: 'revenue',
  test: t => /\brevenue\b|\bsales\b|\bincome\b|\bbilled\b|\bbilling\b/.test(t),
  run: async (t) => {
    const { start, end, label } = SAGABot.periodOrDefault(t);
    const m = await SAGABot.computeMetrics(start, end);
    return `**Revenue for ${label}:** ${formatCurrency(m.grossRevenue)} gross (${formatCurrency(m.netBookedRevenue)} after deductions) from ${m.orderCount} order${m.orderCount === 1 ? '' : 's'}.\nNote: this is booked revenue (orders placed), not cash received — ask "how much have we collected" for the cash figure.`;
  }
});

SAGABot._intents.push({
  name: 'ordersCount',
  test: t => /how many orders|orders? count|number of orders/.test(t),
  run: async (t) => {
    const { start, end, label } = SAGABot.periodOrDefault(t);
    const m = await SAGABot.computeMetrics(start, end);
    return `**${m.orderCount}** order${m.orderCount === 1 ? '' : 's'} placed in ${label}, totalling ${formatCurrency(m.grossRevenue)}.`;
  }
});

SAGABot._intents.push({
  name: 'unpaidOrders',
  test: t => /unpaid orders?|orders? (that are |still )?unpaid|which orders.*(unpaid|not paid)/.test(t),
  run: async () => {
    const orders = await DB.getOrders();
    const customers = await DB.getCustomers();
    const cMap = Object.fromEntries(customers.map(c => [c.id, c.hotel_name]));
    const unpaid = orders.filter(o => o.status !== 'Paid');
    const total = unpaid.reduce((s, o) => s + Math.max(0, (parseFloat(o.total_amount) || 0) - (parseFloat(o.advance_payment) || 0)), 0);
    if (unpaid.length === 0) return `No unpaid orders right now — nice.`;
    const balanceOf = o => Math.max(0, (parseFloat(o.total_amount) || 0) - (parseFloat(o.advance_payment) || 0));
    const top = [...unpaid].sort((a, b) => balanceOf(b) - balanceOf(a)).slice(0, 10);
    const lines = top.map(o => `• ${o.batch_id || '#' + o.id} — ${cMap[o.customer_id] || 'Unknown customer'} — ${formatCurrency(balanceOf(o))} due`).join('\n');
    return `**${unpaid.length} unpaid order${unpaid.length === 1 ? '' : 's'}**, totalling ${formatCurrency(total)} outstanding.\n\nTop ${top.length} by value:\n${lines}${unpaid.length > 10 ? `\n…and ${unpaid.length - 10} more.` : ''}`;
  }
});

SAGABot._intents.push({
  name: 'unpaidInvoices',
  test: t => /unpaid invoices?|outstanding (balance|invoices?|receivables?)|who owes|balance due|dues?\b/.test(t),
  run: async () => {
    const [invoices, payments, customers, orders] = await Promise.all([DB.getInvoices(), DB.getPayments(), DB.getCustomers(), DB.getOrders()]);
    const payMap = {};
    payments.forEach(p => { (payMap[p.invoice_id] ||= []).push(p); });
    const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));
    const cMap = Object.fromEntries(customers.map(c => [c.id, c.hotel_name]));

    const unpaid = [];
    let totalOutstanding = 0;
    invoices.forEach(inv => {
      const fin = Financials.computeInvoiceFinancials(inv, [], payMap[inv.id] || []);
      if (!fin.isPaid && fin.balance > 0) {
        totalOutstanding += fin.balance;
        const custId = inv.customer_id || orderMap[inv.order_id]?.customer_id;
        unpaid.push({ inv, balance: fin.balance, custName: cMap[custId] || 'Unknown customer' });
      }
    });
    if (unpaid.length === 0) return `No outstanding invoice balances — all invoices are settled.`;
    const top = unpaid.sort((a, b) => b.balance - a.balance).slice(0, 10);
    const lines = top.map(u => `• ${u.inv.invoice_number || '#' + u.inv.id} — ${u.custName} — ${formatCurrency(u.balance)} due`).join('\n');
    return `**${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}**, totalling ${formatCurrency(totalOutstanding)} outstanding.\n\nTop ${top.length} by balance:\n${lines}${unpaid.length > 10 ? `\n…and ${unpaid.length - 10} more.` : ''}`;
  }
});

SAGABot._intents.push({
  name: 'topCustomers',
  test: t => /top customers?|best customers?|biggest customers?|highest.{0,15}customers?/.test(t),
  run: async (t) => {
    const period = SAGABot.parsePeriod(t);
    const orders = await DB.getOrders();
    const customers = await DB.getCustomers();
    const cMap = Object.fromEntries(customers.map(c => [c.id, c.hotel_name]));
    const filtered = period ? orders.filter(o => SAGABot.inRange(o.created_at || o.pickup_date, period.start, period.end)) : orders;
    const byCust = {};
    filtered.forEach(o => {
      const key = o.customer_id;
      byCust[key] = byCust[key] || { revenue: 0, count: 0 };
      byCust[key].revenue += parseFloat(o.total_amount) || 0;
      byCust[key].count += 1;
    });
    const ranked = Object.entries(byCust).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);
    if (ranked.length === 0) return `No order data ${period ? 'for ' + period.label : 'yet'} to rank customers by.`;
    const lines = ranked.map(([id, d], i) => `${i + 1}. ${cMap[id] || 'Unknown'} — ${formatCurrency(d.revenue)} across ${d.count} order${d.count === 1 ? '' : 's'}`).join('\n');
    return `**Top customers${period ? ' — ' + period.label : ' (all time)'}:**\n${lines}`;
  }
});

SAGABot._intents.push({
  name: 'orderCounts_misc',
  test: t => /how many customers/.test(t),
  run: async () => {
    const customers = await DB.getCustomers();
    return `You have **${customers.length}** customers registered.`;
  }
});

SAGABot._intents.push({
  name: 'orderLookup',
  test: t => /\b(lnd-\S+|order\s*#?\d+)\b/.test(t),
  run: async (t) => {
    const idMatch = t.match(/lnd-\S+/i);
    const orders = await DB.getOrders();
    let order;
    if (idMatch) {
      order = orders.find(o => (o.batch_id || '').toLowerCase() === idMatch[0].toLowerCase());
    } else {
      const numMatch = t.match(/order\s*#?(\d+)/);
      if (numMatch) order = orders.find(o => String(o.id) === numMatch[1]);
    }
    if (!order) return `I couldn't find an order matching that ID. Double-check the batch ID (e.g. LND-0826-0001).`;
    const customers = await DB.getCustomers();
    const cust = customers.find(c => c.id === order.customer_id);
    return `**Order ${order.batch_id}**\n• Customer: ${cust ? cust.hotel_name : 'Unknown'}\n• Status: ${order.status}\n• Pickup: ${formatDate(order.pickup_date)} | Delivery: ${formatDate(order.delivery_date)}\n• Total: ${formatCurrency(order.total_amount)} | Advance paid: ${formatCurrency(order.advance_payment)}`;
  }
});

SAGABot._intents.push({
  name: 'invoiceLookup',
  test: t => /\binv-\S+/i.test(t),
  run: async (t) => {
    const idMatch = t.match(/inv-\S+/i);
    const [invoices, payments, customers, orders] = await Promise.all([DB.getInvoices(), DB.getPayments(), DB.getCustomers(), DB.getOrders()]);
    const inv = invoices.find(i => (i.invoice_number || '').toLowerCase() === idMatch[0].toLowerCase());
    if (!inv) return `I couldn't find an invoice matching that number.`;
    const pList = payments.filter(p => p.invoice_id === inv.id);
    const fin = Financials.computeInvoiceFinancials(inv, [], pList);
    const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));
    const custId = inv.customer_id || orderMap[inv.order_id]?.customer_id;
    const cust = customers.find(c => c.id === custId);
    return `**Invoice ${inv.invoice_number}**\n• Customer: ${cust ? cust.hotel_name : 'Unknown'}\n• Status: ${fin.status}\n• Total: ${formatCurrency(fin.netPayableTotal)}\n• Paid so far: ${formatCurrency(fin.totalPaid)}\n• Balance due: ${formatCurrency(fin.balance)}`;
  }
});

// Customer-name lookup needs to check against real customer names, so instead of a
// fixed intent it's handled as a lower-priority catch-all inside _fallback (below) —
// it only runs if nothing else matched AND the text contains "balance for X" /
// "X balance" / "customer X" style phrasing.
SAGABot._customerLookupPatterns = [/balance for (.+)/, /(.+?)\s+balance$/, /customer\s+(.+)/, /(.+?)\s+(orders|history)$/];

const _originalFallback = SAGABot._fallback;
SAGABot._fallback = async function (text) {
  const lower = text.toLowerCase();
  for (const pat of SAGABot._customerLookupPatterns) {
    const m = lower.match(pat);
    if (m && m[1] && m[1].trim().length > 2) {
      const nameGuess = m[1].trim();
      const customers = await DB.getCustomers();
      const match = customers.find(c => (c.hotel_name || '').toLowerCase().includes(nameGuess));
      if (match) {
        const [orders, invoices, payments] = await Promise.all([DB.getOrders(), DB.getInvoices(), DB.getPayments()]);
        const custOrders = orders.filter(o => o.customer_id === match.id);
        const custInvoiceIds = invoices.filter(i => custOrders.some(o => o.id === i.order_id) || i.customer_id === match.id).map(i => i.id);
        let outstanding = 0;
        invoices.filter(i => custInvoiceIds.includes(i.id)).forEach(inv => {
          const pList = payments.filter(p => p.invoice_id === inv.id);
          const fin = Financials.computeInvoiceFinancials(inv, [], pList);
          if (!fin.isPaid) outstanding += fin.balance;
        });
        const totalRevenue = custOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
        return `**${match.hotel_name}**\n• Total orders: ${custOrders.length}\n• Lifetime billed: ${formatCurrency(totalRevenue)}\n• Outstanding balance: ${formatCurrency(outstanding)}\n• Phone: ${match.phone || '—'}`;
      }
    }
  }
  return _originalFallback(text);
};

window.SAGABot = SAGABot;
