// financials.js - Canonical Financial Calculation Engine
// Standardizes formulas across Orders, Invoices, Analytics, Expenses, and Reports

const Financials = {
  /**
   * Computes standardized financial totals for an invoice
   * @param {Object} invoice - The invoice object
   * @param {Array} items - Line items associated with the invoice/order
   * @param {Array} payments - Payment records for this invoice
   * @returns {Object} Standardized financial metrics
   */
  computeInvoiceFinancials(invoice, items = [], payments = []) {
    if (!invoice) {
      return {
        itemsSubtotal: 0,
        discountRate: 0,
        discountAmount: 0,
        deliveryCharge: 0,
        extraPayment: 0,
        grossInvoiceTotal: 0,
        deductionAmount: 0,
        netPayableTotal: 0,
        advancePayment: 0,
        paymentsTotal: 0,
        totalPaid: 0,
        balance: 0,
        isPaid: false,
        status: 'Unpaid'
      };
    }

    const inv = invoice || {};
    const pList = payments || [];
    const iList = items || [];

    // 1. Calculate raw items subtotal before discount
    let calcItemsSubtotal = 0;
    if (iList.length > 0) {
      calcItemsSubtotal = iList.reduce((s, i) => s + (parseFloat(i.subtotal) || (parseFloat(i.price || 0) * parseFloat(i.quantity || 0)) || 0), 0);
    }

    let itemsSubtotal = 0;
    if (inv.subtotal_before_discount != null && parseFloat(inv.subtotal_before_discount) > 0) {
      itemsSubtotal = parseFloat(inv.subtotal_before_discount);
    } else if (calcItemsSubtotal > 0) {
      itemsSubtotal = calcItemsSubtotal;
    } else {
      itemsSubtotal = parseFloat(inv.total_amount) || 0;
    }

    // 2. Discounts, Delivery & Extra Payment
    const discountRate = parseFloat(inv.discount_rate) || 0;
    let discountAmount = parseFloat(inv.discount_amount) || 0;
    if (discountAmount === 0 && discountRate > 0 && itemsSubtotal > 0) {
      discountAmount = itemsSubtotal * (discountRate / 100);
    }

    const deliveryCharge = parseFloat(inv.delivery_charge) || 0;
    const extraPayment = parseFloat(inv.extra_payment) || 0;

    // 3. Gross Invoice Total (after item discount, plus delivery & extra)
    const discountedSubtotal = Math.max(0, itemsSubtotal - discountAmount);
    const grossInvoiceTotal = discountedSubtotal + deliveryCharge + extraPayment;

    // 4. Invoice Deductions & Net Payable Total
    const deductionAmount = parseFloat(inv.deduction_amount) || 0;
    const netPayableTotal = Math.max(0, grossInvoiceTotal - deductionAmount);

    // 5. Total Paid & Remaining Balance
    const advancePayment = parseFloat(inv.advance_payment) || 0;
    const paymentsTotal = pList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalPaid = advancePayment + paymentsTotal;

    const balance = Math.max(0, parseFloat((netPayableTotal - totalPaid).toFixed(2)));
    const isPaid = balance <= 0.009;
    const status = isPaid ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Unpaid');

    return {
      itemsSubtotal,
      discountRate,
      discountAmount,
      deliveryCharge,
      extraPayment,
      discountedSubtotal,
      grossInvoiceTotal,
      deductionAmount,
      netPayableTotal,
      advancePayment,
      paymentsTotal,
      totalPaid,
      balance,
      isPaid,
      status
    };
  },

  /**
   * Computes standardized order totals
   */
  computeOrderFinancials(order, items = []) {
    if (!order) return { itemsSubtotal: 0, grandTotal: 0, balance: 0, isPaid: false };

    let itemsSubtotal = 0;
    (items || []).forEach(i => {
      itemsSubtotal += parseFloat(i.subtotal) || ((parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0));
    });

    const discRate = parseFloat(order.discount_rate) || 0;
    const discAmt = parseFloat(order.discount_amount) || (itemsSubtotal * (discRate / 100));
    const deliveryCharge = parseFloat(order.delivery_charge) || 0;
    const extra = parseFloat(order.extra_payment) || 0;
    const advance = parseFloat(order.advance_payment) || 0;

    const grandTotal = Math.max(0, itemsSubtotal - discAmt + deliveryCharge + extra);
    const balance = Math.max(0, grandTotal - advance);
    const isPaid = advance >= grandTotal;

    return {
      itemsSubtotal,
      discountRate: discRate,
      discountAmount: discAmt,
      deliveryCharge,
      extraPayment: extra,
      advancePayment: advance,
      grandTotal,
      balance,
      isPaid,
      status: isPaid ? 'Paid' : (advance > 0 ? 'Partially Paid' : 'Unpaid')
    };
  },

  /**
   * Joins the 4 raw Expenses tables into one flat row per filled Cash
   * Book cell — shared by expenses.js (Category View), analytics.js, and
   * chatbot.js so all three agree on the same numbers from one join.
   */
  flattenExpenseData(amounts = [], entries = [], types = [], categories = []) {
    const entryMap = Object.fromEntries((entries || []).map(e => [e.id, e]));
    const typeMap = Object.fromEntries((types || []).map(t => [t.expense_type_id, t]));
    const catMap = Object.fromEntries((categories || []).map(c => [c.category_id, c]));

    return (amounts || []).map(a => {
      const entry = entryMap[a.entry_id] || {};
      const type = typeMap[a.expense_type_id] || {};
      const cat = catMap[type.category_id] || {};
      return {
        expense_type_id: a.expense_type_id,
        expense_name: type.name || 'Unknown',
        category_id: type.category_id || '',
        category_name: cat.name || 'Uncategorized',
        entry_date: entry.entry_date,
        description: entry.description || '',
        amount: parseFloat(a.amount) || 0
      };
    }).filter(r => r.entry_date); // drop orphans if an entry/type was deleted out from under an amount
  },

  /**
   * Plain date-range sum + per-category breakdown over flattened expense
   * rows (see flattenExpenseData). No amortization, no COGS — the new
   * Cash Book schema records a real dated amount per cell, so a period
   * total is just a straight sum over that window.
   */
  computeExpenseTotals(flatRows = [], startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const inRange = (flatRows || []).filter(r => {
      const d = new Date(r.entry_date);
      return !isNaN(d) && d >= start && d <= end;
    });

    const byCategory = {};
    inRange.forEach(r => {
      if (!byCategory[r.category_id]) byCategory[r.category_id] = { name: r.category_name, total: 0 };
      byCategory[r.category_id].total += r.amount;
    });

    const total = inRange.reduce((s, r) => s + r.amount, 0);

    let mostExpensiveCategory = null;
    Object.values(byCategory).forEach(c => {
      if (!mostExpensiveCategory || c.total > mostExpensiveCategory.total) mostExpensiveCategory = c;
    });

    return { total, byCategory, mostExpensiveCategory, count: inRange.length };
  },

  /**
   * Day-bucketed amount series over a date range, for the Category View
   * trend graph.
   */
  computeExpenseDailySeries(flatRows = [], startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const byDay = {};

    (flatRows || []).forEach(r => {
      const d = new Date(r.entry_date);
      if (isNaN(d) || d < start || d > end) return;
      byDay[r.entry_date] = (byDay[r.entry_date] || 0) + r.amount;
    });

    return Object.keys(byDay).sort().map(date => ({ date, amount: byDay[date] }));
  },

  /**
   * Computes trip fuel cost based on distance, fuel price, and efficiency
   */
  computeTripFuelCost(distanceKm, fuelPrice = 370, kmPerLiter = 10) {
    const dist = Math.max(0, parseFloat(distanceKm) || 0);
    const price = Math.max(0, parseFloat(fuelPrice) || 370);
    const efficiency = Math.max(0.1, parseFloat(kmPerLiter) || 10);
    const litersUsed = dist / efficiency;
    const estimatedCost = litersUsed * price;
    return {
      distanceKm: dist,
      litersUsed: parseFloat(litersUsed.toFixed(2)),
      estimatedCost: parseFloat(estimatedCost.toFixed(2))
    };
  },

};

window.Financials = Financials;
window.Calc = Financials;

