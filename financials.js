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
   * Calculates multi-month amortized operational expenses for a specific date window
   */
  computeAmortizedExpenses(expenses = [], startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let totalAmortized = 0;
    const breakdownByCategory = {};

    (expenses || []).forEach(exp => {
      const expDate = new Date(exp.expense_date || exp.created_at);
      if (isNaN(expDate)) return;

      const rawAmount = parseFloat(exp.amount) || 0;
      const monthsCovered = Math.max(1, parseInt(exp.months_covered) || 1);
      const monthlyAmount = parseFloat(exp.monthly_averaged_amount) || (rawAmount / monthsCovered);
      const category = exp.expense_category || 'General Operational';

      // Check month overlap
      let activeMonthsInWindow = 0;
      for (let m = 0; m < monthsCovered; m++) {
        const coveredMonthDate = new Date(expDate.getFullYear(), expDate.getMonth() + m, 1);
        const coveredMonthEnd = new Date(expDate.getFullYear(), expDate.getMonth() + m + 1, 0, 23, 59, 59);

        if (coveredMonthEnd >= start && coveredMonthDate <= end) {
          activeMonthsInWindow++;
        }
      }

      if (activeMonthsInWindow > 0) {
        const attributedExpense = monthlyAmount * activeMonthsInWindow;
        totalAmortized += attributedExpense;
        breakdownByCategory[category] = (breakdownByCategory[category] || 0) + attributedExpense;
      }
    });

    return {
      totalAmortized,
      breakdownByCategory
    };
  },

  /**
   * Computes chemical expenses based on selected costing mode ('purchase' | 'cogs')
   */
  computeChemicalExpenses(chemicalLedger = [], startDate, endDate, mode = 'cogs') {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let purchaseTotal = 0;
    let consumedTotal = 0;
    const itemizedUsage = {};

    (chemicalLedger || []).forEach(entry => {
      const entryDate = new Date(entry.date || entry.created_at);
      if (isNaN(entryDate) || entryDate < start || entryDate > end) return;

      if (entry.type === 'IN') {
        purchaseTotal += parseFloat(entry.total_amount) || 0;
      } else if (entry.type === 'OUT') {
        const qtyOut = parseFloat(entry.qty_out) || 0;
        const unitPrice = parseFloat(entry.unit_price) || 0;
        const usageCost = parseFloat(entry.total_amount) || (qtyOut * unitPrice);
        consumedTotal += usageCost;

        const chemName = entry.chemical_name || entry.chemical_id || 'Unknown Chemical';
        itemizedUsage[chemName] = (itemizedUsage[chemName] || 0) + usageCost;
      }
    });

    return {
      purchaseTotal,
      consumedTotal,
      activeCost: mode === 'purchase' ? purchaseTotal : (consumedTotal > 0 ? consumedTotal : purchaseTotal),
      itemizedUsage
    };
  }
};

window.Financials = Financials;
