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

      // Prorate by the actual number of days each covered month overlaps the report
      // window, not just a binary "does it overlap at all". Without this, a report
      // window of a single day at the edge of a covered month attributed the FULL
      // monthly amount for that month — massively over-counting amortized expense
      // for any custom/partial date range that doesn't align to calendar-month
      // boundaries. For a window that spans a full calendar month (the common case
      // for monthly reports), the overlap fraction is 1, so behavior is unchanged.
      let attributedExpense = 0;
      for (let m = 0; m < monthsCovered; m++) {
        const coveredMonthStart = new Date(expDate.getFullYear(), expDate.getMonth() + m, 1);
        const coveredMonthEnd = new Date(expDate.getFullYear(), expDate.getMonth() + m + 1, 0, 23, 59, 59, 999);
        const daysInMonth = coveredMonthEnd.getDate();

        const overlapStart = coveredMonthStart > start ? coveredMonthStart : start;
        const overlapEnd = coveredMonthEnd < end ? coveredMonthEnd : end;
        if (overlapEnd < overlapStart) continue; // no overlap with this covered month

        // Normalize to whole calendar days (inclusive) so time-of-day components
        // on `start`/`end` don't cause off-by-one drift in the day count.
        const overlapStartDay = new Date(overlapStart.getFullYear(), overlapStart.getMonth(), overlapStart.getDate());
        const overlapEndDay = new Date(overlapEnd.getFullYear(), overlapEnd.getMonth(), overlapEnd.getDate());
        const overlapDays = Math.round((overlapEndDay - overlapStartDay) / 86400000) + 1;
        const fraction = Math.min(1, overlapDays / daysInMonth);

        attributedExpense += monthlyAmount * fraction;
      }

      if (attributedExpense > 0) {
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
   *
   * IMPORTANT: this only works correctly if OUT (usage) entries carry a real
   * unit_price/total_amount, which requires them to be stamped with a
   * weighted-average cost at the time they're logged — see
   * computeWeightedAverageChemicalCost() below, called from
   * expenses.js:saveChemLog(). Without that, every OUT entry prices at 0
   * and 'cogs' mode silently degrades to 'purchase' mode.
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
      // No more silent fallback to purchaseTotal when consumedTotal is 0 —
      // now that OUT entries are correctly priced, a real $0 usage period
      // should show as $0, not be masked by substituting purchases.
      activeCost: mode === 'purchase' ? purchaseTotal : consumedTotal,
      itemizedUsage
    };
  },

  /**
   * Computes the current moving weighted-average unit cost for ONE
   * chemical, given every ledger entry for that chemical (any order —
   * this sorts by date itself). Standard weighted-average inventory
   * costing: each IN entry blends its cost into the running average; each
   * OUT entry is valued at whatever the average was immediately before it
   * (so it doesn't retroactively change past OUT entries' cost basis).
   *
   * Call this BEFORE inserting a new OUT entry (pass the ledger as it
   * exists so far) to get the unit cost that new entry should be stamped
   * with — see expenses.js:saveChemLog().
   */
  computeWeightedAverageChemicalCost(chemicalLedgerForOneChemical = []) {
    const sorted = [...(chemicalLedgerForOneChemical || [])].sort((a, b) => {
      const da = new Date(a.date || a.created_at || 0).getTime();
      const db = new Date(b.date || b.created_at || 0).getTime();
      return da - db;
    });

    let qtyOnHand = 0;
    let valueOnHand = 0;
    let avgUnitCost = 0;

    sorted.forEach(entry => {
      if (entry.type === 'IN') {
        const qtyIn = parseFloat(entry.qty_in) || 0;
        const cost = parseFloat(entry.total_amount) || (qtyIn * (parseFloat(entry.unit_price) || 0));
        qtyOnHand += qtyIn;
        valueOnHand += cost;
        avgUnitCost = qtyOnHand > 0 ? (valueOnHand / qtyOnHand) : 0;
      } else if (entry.type === 'OUT') {
        const qtyOut = parseFloat(entry.qty_out) || 0;
        const costOut = qtyOut * avgUnitCost;
        qtyOnHand = Math.max(0, qtyOnHand - qtyOut);
        valueOnHand = Math.max(0, valueOnHand - costOut);
        // avgUnitCost itself is unchanged by an OUT — only IN entries shift the average.
      }
    });

    return { avgUnitCost, qtyOnHand, valueOnHand };
  },

  /**
   * Replays the same weighted-average logic as
   * computeWeightedAverageChemicalCost(), but returns what EVERY OUT
   * entry's unit_price/total_amount should have been, in order. Used for
   * one-time backfilling of historical ledger entries that were logged
   * before OUT entries carried a real cost (see expenses.js's
   * "Recalculate Historical Costs" action) — this does not touch the
   * database itself, it only computes the corrected values.
   *
   * Returns an array of { id, unit_price, total_amount } for every OUT
   * entry whose current stored value doesn't match — IN entries and
   * already-correct OUT entries are omitted so callers only write what
   * actually changed.
   */
  recomputeChemicalOutEntryCosts(chemicalLedgerForOneChemical = []) {
    const sorted = [...(chemicalLedgerForOneChemical || [])].sort((a, b) => {
      const da = new Date(a.date || a.created_at || 0).getTime();
      const db = new Date(b.date || b.created_at || 0).getTime();
      return da - db;
    });

    let qtyOnHand = 0;
    let valueOnHand = 0;
    let avgUnitCost = 0;
    const corrections = [];

    sorted.forEach(entry => {
      if (entry.type === 'IN') {
        const qtyIn = parseFloat(entry.qty_in) || 0;
        const cost = parseFloat(entry.total_amount) || (qtyIn * (parseFloat(entry.unit_price) || 0));
        qtyOnHand += qtyIn;
        valueOnHand += cost;
        avgUnitCost = qtyOnHand > 0 ? (valueOnHand / qtyOnHand) : 0;
      } else if (entry.type === 'OUT') {
        const qtyOut = parseFloat(entry.qty_out) || 0;
        const correctUnitPrice = avgUnitCost;
        const correctTotal = parseFloat((qtyOut * avgUnitCost).toFixed(2));
        const currentTotal = parseFloat(entry.total_amount) || 0;

        if (Math.abs(currentTotal - correctTotal) > 0.01) {
          corrections.push({ id: entry.id, unit_price: parseFloat(correctUnitPrice.toFixed(4)), total_amount: correctTotal });
        }

        qtyOnHand = Math.max(0, qtyOnHand - qtyOut);
        valueOnHand = Math.max(0, valueOnHand - (qtyOut * avgUnitCost));
      }
    });

    return corrections;
  },

  /**
   * Computes monthly expense allocation over N months
   */
  computeMonthlyExpenseAveraging(amount, monthsCovered = 1) {
    const amt = parseFloat(amount) || 0;
    const months = Math.max(1, parseInt(monthsCovered) || 1);
    return {
      totalAmount: amt,
      monthsCovered: months,
      monthlyAmount: amt / months
    };
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

  /**
   * Computes standardized profit and loss summary for a date range
   */
  computeProfitSummary(orders = [], generalExpenses = [], chemicalLedger = [], trips = [], startDate, endDate) {
    const startStr = startDate ? new Date(startDate).toISOString().slice(0, 10) : '';
    const endStr = endDate ? new Date(endDate).toISOString().slice(0, 10) : '';

    const filterDate = d => {
      if (!d) return true;
      const dateStr = (d || '').slice(0, 10);
      if (startStr && dateStr < startStr) return false;
      if (endStr && dateStr > endStr) return false;
      return true;
    };

    const periodOrders = orders.filter(o => filterDate(o.created_at || o.pickup_date));
    const grossRevenue = periodOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    const expMetrics = this.computePeriodGeneralExpenses(generalExpenses, startDate || '2000-01-01', endDate || '2099-12-31');
    const chemMetrics = this.computeChemicalExpenses(chemicalLedger, startDate || '2000-01-01', endDate || '2099-12-31', 'cogs');

    const periodTrips = trips.filter(t => filterDate(t.start_date || t.created_at));
    const totalDistanceKm = periodTrips.reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0);
    const tripFuelMetrics = this.computeTripFuelCost(totalDistanceKm);

    const totalExpenses = expMetrics.totalAmortized + chemMetrics.activeCost + tripFuelMetrics.estimatedCost;
    const netProfit = grossRevenue - totalExpenses;

    return {
      grossRevenue,
      totalExpenses,
      netProfit,
      breakdown: {
        generalExpenses: expMetrics.totalAmortized,
        chemicalExpenses: chemMetrics.activeCost,
        fuelExpenses: tripFuelMetrics.estimatedCost
      }
    };
  }
};

window.Financials = Financials;
window.Calc = Financials;

