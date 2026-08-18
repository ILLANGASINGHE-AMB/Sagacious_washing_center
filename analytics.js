// analytics.js — Data Analytics & Decision Support Engine

let analyticsCharts = {};
let analyticsFilterState = {
  grain: 'monthly', // 'daily', 'weekly', 'monthly', 'yearly'
  preset: 'this_month', // 'this_month', 'last_month', 'this_quarter', 'this_year', 'all', 'custom'
  startDate: '',
  endDate: '',
  customerId: 'all',
  itemId: 'all',
  paymentStatus: 'all'
};

async function renderAnalytics() {
  document.getElementById('page-title').textContent = 'Data Analytics';
  const content = document.getElementById('content');

  // Set default dates if empty
  if (!analyticsFilterState.startDate || !analyticsFilterState.endDate) {
    setDefaultAnalyticsDates();
  }

  const [customers, catalogItems] = await Promise.all([
    DB.getCustomers(),
    DB.getItems()
  ]);

  content.innerHTML = `
    <div class="section-header" style="flex-wrap:wrap;gap:12px;">
      <div>
        <span class="section-title">Business Analytics & Data Intelligence</span>
        <div style="font-size:0.82em;color:var(--text-muted);margin-top:2px;">Track revenue, profit margins, cost patterns, and operational trends</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-secondary btn-sm" onclick="exportAnalyticsData('csv')"><i class="fas fa-file-csv"></i> CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="exportAnalyticsData('excel')"><i class="fas fa-file-excel"></i> Excel</button>
        <button class="btn btn-primary btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print Report</button>
      </div>
    </div>

    <!-- FILTER & CONTROL TOOLBAR -->
    <div class="card" style="margin-bottom:20px;padding:16px 20px;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;align-items:end;">
        
        <!-- Time Grain -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);"><i class="fas fa-clock"></i> Time View</label>
          <select id="an-grain" class="form-input form-select" onchange="onAnalyticsFilterChange()" style="font-size:0.85em;padding:8px 10px;">
            <option value="daily" ${analyticsFilterState.grain==='daily'?'selected':''}>Daily View</option>
            <option value="weekly" ${analyticsFilterState.grain==='weekly'?'selected':''}>Weekly View</option>
            <option value="monthly" ${analyticsFilterState.grain==='monthly'?'selected':''}>Monthly View</option>
            <option value="yearly" ${analyticsFilterState.grain==='yearly'?'selected':''}>Yearly View</option>
          </select>
        </div>

        <!-- Preset Range -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);"><i class="fas fa-calendar"></i> Date Preset</label>
          <select id="an-preset" class="form-input form-select" onchange="onAnalyticsPresetChange(this.value)" style="font-size:0.85em;padding:8px 10px;">
            <option value="this_month" ${analyticsFilterState.preset==='this_month'?'selected':''}>This Month</option>
            <option value="last_month" ${analyticsFilterState.preset==='last_month'?'selected':''}>Last Month</option>
            <option value="this_quarter" ${analyticsFilterState.preset==='this_quarter'?'selected':''}>This Quarter</option>
            <option value="this_year" ${analyticsFilterState.preset==='this_year'?'selected':''}>This Year</option>
            <option value="all" ${analyticsFilterState.preset==='all'?'selected':''}>All Time</option>
            <option value="custom" ${analyticsFilterState.preset==='custom'?'selected':''}>Custom Range</option>
          </select>
        </div>

        <!-- Custom Start Date -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);">From Date</label>
          <input type="date" id="an-start-date" class="form-input" value="${analyticsFilterState.startDate}" onchange="onAnalyticsCustomDateChange()" style="font-size:0.85em;padding:6px 10px;"/>
        </div>

        <!-- Custom End Date -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);">To Date</label>
          <input type="date" id="an-end-date" class="form-input" value="${analyticsFilterState.endDate}" onchange="onAnalyticsCustomDateChange()" style="font-size:0.85em;padding:6px 10px;"/>
        </div>

        <!-- Customer Filter -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);"><i class="fas fa-hotel"></i> Customer</label>
          <select id="an-customer" class="form-input form-select" onchange="onAnalyticsFilterChange()" style="font-size:0.85em;padding:8px 10px;">
            <option value="all">All Customers</option>
            ${customers.map(c => `<option value="${c.id}" ${String(analyticsFilterState.customerId)===String(c.id)?'selected':''}>${c.hotel_name}</option>`).join('')}
          </select>
        </div>

        <!-- Item Filter -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);"><i class="fas fa-list-check"></i> Item</label>
          <select id="an-item" class="form-input form-select" onchange="onAnalyticsFilterChange()" style="font-size:0.85em;padding:8px 10px;">
            <option value="all">All Catalog Items</option>
            ${catalogItems.map(it => `<option value="${it.id}" ${String(analyticsFilterState.itemId)===String(it.id)?'selected':''}>${it.item_name} (${it.item_id})</option>`).join('')}
          </select>
        </div>

        <!-- Payment Status Filter -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);"><i class="fas fa-money-bill-wave"></i> Payment Status</label>
          <select id="an-status" class="form-input form-select" onchange="onAnalyticsFilterChange()" style="font-size:0.85em;padding:8px 10px;">
            <option value="all" ${analyticsFilterState.paymentStatus==='all'?'selected':''}>All Orders</option>
            <option value="Paid" ${analyticsFilterState.paymentStatus==='Paid'?'selected':''}>Paid Only</option>
            <option value="Unpaid" ${analyticsFilterState.paymentStatus==='Unpaid'?'selected':''}>Unpaid Only</option>
          </select>
        </div>

      </div>
    </div>

    <!-- EXECUTIVE FINANCIAL SUMMARY CARDS -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;" id="an-kpi-cards">
      <!-- Injected via JavaScript -->
    </div>

    <!-- AI BUSINESS INSIGHTS CARDS -->
    <div class="card" style="margin-bottom:24px;background:linear-gradient(135deg,rgba(139,92,246,0.06),rgba(37,99,235,0.06));border:1.5px solid rgba(139,92,246,0.2);border-radius:14px;padding:20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#8b5cf6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.1em;">
          <i class="fas fa-brain"></i>
        </div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1.15em;font-weight:700;color:var(--text);">Automated Business & Decision Insights</div>
          <div style="font-size:0.82em;color:var(--text-muted);">Algorithmic suggestions for revenue optimization, cost control, and staffing</div>
        </div>
      </div>
      <div id="an-insights-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
        <!-- Injected via JavaScript -->
      </div>
    </div>

    <!-- CHARTS SECTION 1: TRENDS & PEAK TRADING -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;margin-bottom:24px;">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas fa-chart-line" style="color:var(--primary);margin-right:8px;"></i>Revenue vs. Expenses Trend</div>
          <span style="font-size:0.78em;color:var(--text-muted);background:var(--bg);padding:3px 8px;border-radius:6px;border:1px solid var(--border);" id="an-trend-label">Monthly View</span>
        </div>
        <div class="chart-container" style="height:320px;"><canvas id="an-chart-trend"></canvas></div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas fa-calendar-day" style="color:#f59e0b;margin-right:8px;"></i>Peak Trading Days (Mon–Sun)</div>
          <span style="font-size:0.78em;color:var(--text-muted);">By Day of Week</span>
        </div>
        <div class="chart-container" style="height:320px;"><canvas id="an-chart-dayofweek"></canvas></div>
      </div>
    </div>

    <!-- CHARTS SECTION 2: TOP ITEMS & EXPENSE CATEGORIES -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas fa-list-check" style="color:#ec4899;margin-right:8px;"></i>Top 10 Best Selling Items (Revenue & Volume)</div>
        <div class="chart-container" style="height:300px;"><canvas id="an-chart-topitems"></canvas></div>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas fa-pie-chart" style="color:#10b981;margin-right:8px;"></i>Expense Category Breakdown</div>
        <div class="chart-container" style="height:300px;"><canvas id="an-chart-expensecat"></canvas></div>
      </div>
    </div>

    <!-- DEEP DIVE PERFORMANCE TABLES -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <!-- Best Performing Customers -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas fa-trophy" style="color:#f59e0b;margin-right:8px;"></i>Customer Performance</div>
          <span style="font-size:0.78em;color:var(--text-muted);" id="an-top-cust-count"></span>
        </div>
        <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
          <table>
            <thead style="position:sticky;top:0;background:var(--bg);z-index:2;">
              <tr>
                <th>Customer</th>
                <th style="text-align:center;">Orders</th>
                <th style="text-align:right;">Total Spend</th>
                <th style="text-align:right;">Avg Order (AOV)</th>
              </tr>
            </thead>
            <tbody id="an-tbl-top-customers"></tbody>
            <tfoot id="an-tfoot-top-customers" style="position:sticky;bottom:0;background:var(--card-bg);border-top:2px solid var(--border);font-weight:700;"></tfoot>
          </table>
        </div>
      </div>

      <!-- Item Sales & Margin Table -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas fa-boxes-stacked" style="color:var(--primary);margin-right:8px;"></i>Item Breakdown</div>
          <span style="font-size:0.78em;color:var(--text-muted);" id="an-top-items-count"></span>
        </div>
        <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
          <table>
            <thead style="position:sticky;top:0;background:var(--bg);z-index:2;">
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th style="text-align:center;">Qty Sold</th>
                <th style="text-align:right;">Total Revenue</th>
              </tr>
            </thead>
            <tbody id="an-tbl-top-items"></tbody>
            <tfoot id="an-tfoot-top-items" style="position:sticky;bottom:0;background:var(--card-bg);border-top:2px solid var(--border);font-weight:700;"></tfoot>
          </table>
        </div>
      </div>
    </div>
  `;

  // Load dataset and compute metrics
  await refreshAnalyticsView();
}

function setDefaultAnalyticsDates() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  analyticsFilterState.startDate = `${y}-${m}-01`;
  
  // Last day of month
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  analyticsFilterState.endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
}

function onAnalyticsPresetChange(preset) {
  analyticsFilterState.preset = preset;
  const now = new Date();
  const y = now.getFullYear();

  if (preset === 'this_month') {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    analyticsFilterState.startDate = `${y}-${m}-01`;
    analyticsFilterState.endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  } else if (preset === 'last_month') {
    const prevDate = new Date(y, now.getMonth() - 1, 1);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(py, prevDate.getMonth() + 1, 0).getDate();
    analyticsFilterState.startDate = `${py}-${pm}-01`;
    analyticsFilterState.endDate = `${py}-${pm}-${String(lastDay).padStart(2, '0')}`;
  } else if (preset === 'this_quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const startQ = new Date(y, qMonth, 1);
    const endQ = new Date(y, qMonth + 3, 0);
    analyticsFilterState.startDate = startQ.toISOString().split('T')[0];
    analyticsFilterState.endDate = endQ.toISOString().split('T')[0];
  } else if (preset === 'this_year') {
    analyticsFilterState.startDate = `${y}-01-01`;
    analyticsFilterState.endDate = `${y}-12-31`;
  } else if (preset === 'all') {
    analyticsFilterState.startDate = '2020-01-01';
    analyticsFilterState.endDate = '2035-12-31';
  }

  document.getElementById('an-start-date').value = analyticsFilterState.startDate;
  document.getElementById('an-end-date').value = analyticsFilterState.endDate;

  onAnalyticsFilterChange();
}

function onAnalyticsCustomDateChange() {
  analyticsFilterState.preset = 'custom';
  const pSelect = document.getElementById('an-preset');
  if (pSelect) pSelect.value = 'custom';
  analyticsFilterState.startDate = document.getElementById('an-start-date').value;
  analyticsFilterState.endDate = document.getElementById('an-end-date').value;
  onAnalyticsFilterChange();
}

async function onAnalyticsFilterChange() {
  analyticsFilterState.grain = document.getElementById('an-grain').value;
  analyticsFilterState.startDate = document.getElementById('an-start-date').value;
  analyticsFilterState.endDate = document.getElementById('an-end-date').value;
  analyticsFilterState.customerId = document.getElementById('an-customer').value;
  analyticsFilterState.itemId = document.getElementById('an-item').value;
  analyticsFilterState.paymentStatus = document.getElementById('an-status').value;

  const trendLbl = document.getElementById('an-trend-label');
  if (trendLbl) {
    trendLbl.textContent = {
      daily: 'Daily View',
      weekly: 'Weekly View',
      monthly: 'Monthly View',
      yearly: 'Yearly View'
    }[analyticsFilterState.grain] || 'Trend View';
  }

  await refreshAnalyticsView();
}

async function refreshAnalyticsView() {
  // Destroy previous charts
  Object.values(analyticsCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  analyticsCharts = {};

  // Show loading state
  const kpiEl = document.getElementById('an-kpi-cards');
  const insEl = document.getElementById('an-insights-grid');
  if (kpiEl) kpiEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:1.5em;"></i><div style="margin-top:8px;font-size:0.85em;">Calculating financial analytics...</div></div>`;

  try {
    const data = await calculateAnalyticsData(analyticsFilterState);
    window._analyticsExportData = data;

    renderKPICards(data);
    renderBusinessInsights(data);
    renderTrendChart(data);
    renderDayOfWeekChart(data);
    renderTopItemsChart(data);
    renderExpenseCategoryChart(data);
    renderTables(data);
  } catch(err) {
    console.error('Analytics error:', err);
    if (kpiEl) kpiEl.innerHTML = `<div style="grid-column:1/-1;padding:20px;background:#fee2e2;border-radius:10px;color:#b91c1c;font-size:0.88em;"><i class="fas fa-triangle-exclamation"></i> Failed to load analytics: ${err.message || err}</div>`;
  }
}

// ─────────────────────────────────────────────
// DATA CALCULATION ENGINE & PRECISE FORMULAS
// ─────────────────────────────────────────────
async function calculateAnalyticsData(filters) {
  const [orders, allOrderItems, customers, catalogItems, expenseCategories, expenseTypes, expenseEntries, expenseAmounts, trips, fuelConfig, invoices, payments] = await Promise.all([
    DB.getOrders(),
    DB.getAllOrderItems(),
    DB.getCustomers(),
    DB.getItems(),
    DB.getExpenseCategories(),
    DB.getExpenseTypes(),
    DB.getExpenseEntries(),
    DB.getExpenseAmounts(),
    DB.getTrips(),
    DB.getFuelPriceSettings(),
    DB.getInvoices(),
    DB.getPayments()
  ]);

  const flatExpenses = Financials.flattenExpenseData(expenseAmounts, expenseEntries, expenseTypes, expenseCategories);

  const cMap = Object.fromEntries((customers || []).map(c => [c.id, c]));
  const itemMap = Object.fromEntries((catalogItems || []).map(it => [it.id, it]));
  const invMap = Object.fromEntries((invoices || []).map(i => [i.order_id, i]));
  const payMap = {};
  (payments || []).forEach(p => {
    if (!payMap[p.invoice_id]) payMap[p.invoice_id] = [];
    payMap[p.invoice_id].push(p);
  });

  const start = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : new Date('2000-01-01');
  const end = filters.endDate ? new Date(filters.endDate + 'T23:59:59') : new Date('2099-12-31');

  // 1. Filter Orders
  const isAllTime = filters.preset === 'all' || (!filters.startDate && !filters.endDate);

  const filteredOrders = (orders || []).filter(o => {
    if (!isAllTime) {
      const dateStr = o.created_at || o.pickup_date || o.delivery_date || o.date;
      const oDate = dateStr ? new Date(dateStr) : null;
      if (!oDate || isNaN(oDate.getTime()) || oDate < start || oDate > end) return false;
    }

    if (filters.customerId !== 'all' && String(o.customer_id) !== String(filters.customerId)) return false;
    if (filters.paymentStatus !== 'all' && o.status !== filters.paymentStatus) return false;

    // Filter by item if specified
    if (filters.itemId !== 'all') {
      const itemsInOrder = (allOrderItems || []).filter(oi => String(oi.order_id) === String(o.id));
      const hasItem = itemsInOrder.some(oi => String(oi.catalog_item_id) === String(filters.itemId));
      if (!hasItem) return false;
    }

    return true;
  });

  // 2. Filter Order Items
  const orderIdsSet = new Set(filteredOrders.map(o => o.id));
  const filteredOrderItems = (allOrderItems || []).filter(oi => orderIdsSet.has(oi.order_id));

  // 3. Filter Transport Fuel Costs
  const filteredCompletedTrips = (trips || []).filter(t => {
    if (t.status !== 'Completed' || !t.distance_km) return false;
    const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
    const tDate = dateStr ? new Date(dateStr + 'T00:00:00') : null;
    return !isNaN(tDate) && tDate >= start && tDate <= end;
  });

  let totalTransportFuelExpenses = 0;
  filteredCompletedTrips.forEach(t => {
    const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
    const mKey = dateStr ? dateStr.slice(0, 7) : '';
    const mPriceConfig = (fuelConfig.monthly_prices && fuelConfig.monthly_prices[mKey]) 
      ? fuelConfig.monthly_prices[mKey] 
      : fuelConfig;
    const ratePerKm = parseFloat(mPriceConfig.cost_per_km || (mPriceConfig.current_price / (mPriceConfig.km_per_litre || 1)) || 37);
    const tripCost = (parseFloat(t.distance_km) || 0) * ratePerKm;
    totalTransportFuelExpenses += tripCost;
  });

  // 4. Gross Revenue & Net Booked Revenue (Deducting Invoice Deductions)
  const grossRevenue = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
  let totalDeductions = 0;
  filteredOrders.forEach(o => {
    const inv = invMap[o.id];
    if (inv && inv.deduction_amount) {
      totalDeductions += parseFloat(inv.deduction_amount) || 0;
    }
  });
  const netBookedRevenue = Math.max(0, grossRevenue - totalDeductions);

  // 5. Cash Inflow (Cash Collected in period)
  const advanceCollected = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.advance_payment) || 0), 0);
  const periodPayments = (payments || []).filter(p => {
    const pDate = new Date(p.date || p.created_at);
    return !isNaN(pDate) && pDate >= start && pDate <= end;
  }).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const cashCollected = advanceCollected + periodPayments;

  // 6. Outstanding Receivables
  let uncollectedReceivables = 0;
  let unpaidInvoicesCount = 0;
  (invoices || []).forEach(inv => {
    const pList = payMap[inv.id] || [];
    const fin = Financials.computeInvoiceFinancials(inv, [], pList);
    if (!fin.isPaid) {
      uncollectedReceivables += fin.balance;
      unpaidInvoicesCount++;
    }
  });

  // 7. Cash Book Expenses — plain date-range sum + per-category breakdown,
  // no amortization/COGS (see Financials.computeExpenseTotals).
  const expenseCalc = Financials.computeExpenseTotals(flatExpenses, start, end);
  const totalCashBookExpenses = expenseCalc.total;

  // Total Expenses & Net Profit
  const totalExpenses = totalCashBookExpenses + totalTransportFuelExpenses;
  const netProfit = netBookedRevenue - totalExpenses;
  const profitMargin = netBookedRevenue > 0 ? (netProfit / netBookedRevenue) * 100 : 0;
  const costRatio = netBookedRevenue > 0 ? (totalExpenses / netBookedRevenue) * 100 : 0;
  const cashFlowRatio = netBookedRevenue > 0 ? (cashCollected / netBookedRevenue) * 100 : 0;

  // Order Metrics
  const orderCount = filteredOrders.length;
  const avgOrderValue = orderCount > 0 ? netBookedRevenue / orderCount : 0;

  // Day of Week Distribution (Mon = 1, Sun = 0)
  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeekStats = Array.from({ length: 7 }, (_, i) => ({ day: dayOfWeekNames[i], revenue: 0, orders: 0 }));

  filteredOrders.forEach(o => {
    const d = new Date(o.pickup_date || o.created_at);
    if (!isNaN(d)) {
      const dayIdx = d.getDay();
      dayOfWeekStats[dayIdx].revenue += (parseFloat(o.total_amount) || 0);
      dayOfWeekStats[dayIdx].orders += 1;
    }
  });

  // Customer Analytics
  const customerStatsMap = {};
  filteredOrders.forEach(o => {
    const cId = o.customer_id || 'unknown';
    const cName = cMap[cId]?.hotel_name || (typeof getOrderCustomerName === 'function' ? getOrderCustomerName(o, cMap) : 'Unknown Customer');
    if (!customerStatsMap[cId]) {
      customerStatsMap[cId] = { id: cId, name: cName, revenue: 0, orders: 0, paidOrders: 0 };
    }
    customerStatsMap[cId].revenue += (parseFloat(o.total_amount) || 0);
    customerStatsMap[cId].orders += 1;
    if (o.status === 'Paid') customerStatsMap[cId].paidOrders += 1;
  });

  const customerStatsList = Object.values(customerStatsMap).sort((a, b) => b.revenue - a.revenue);

  // Item Analytics
  const itemStatsMap = {};
  (filteredOrderItems || []).forEach(oi => {
    const catId = oi.catalog_item_id || oi.item_id;
    const catItem = (catalogItems || []).find(it => String(it.id) === String(catId) || String(it.item_id) === String(catId));

    const code = catItem ? (catItem.item_id || `ITM-${catItem.id}`) : (oi.item_id || (oi.catalog_item_id ? `ITM-${oi.catalog_item_id}` : 'MISC'));
    const name = oi.item_name || (catItem ? catItem.item_name : 'Laundry Service');

    // NOT `parseInt(...) || 1` — that treats a genuine 0 quantity (e.g. a voided/returned
    // line) as 1, silently inflating Qty Sold. Only fall back to 1 when the field is
    // actually missing or unparseable.
    const parsedQty = parseInt(oi.quantity, 10);
    const qty = isNaN(parsedQty) ? 1 : parsedQty;
    let rev = 0;
    if (oi.subtotal !== undefined && oi.subtotal !== null && !isNaN(parseFloat(oi.subtotal))) {
      rev = parseFloat(oi.subtotal);
    } else if (oi.total_price !== undefined && oi.total_price !== null && !isNaN(parseFloat(oi.total_price))) {
      rev = parseFloat(oi.total_price);
    } else if (oi.price !== undefined && oi.price !== null && !isNaN(parseFloat(oi.price))) {
      rev = parseFloat(oi.price) * qty;
    } else if (oi.unit_price !== undefined && oi.unit_price !== null && !isNaN(parseFloat(oi.unit_price))) {
      rev = parseFloat(oi.unit_price) * qty;
    }

    const key = code + '||' + name;
    if (!itemStatsMap[key]) {
      itemStatsMap[key] = { code, name, qty: 0, revenue: 0 };
    }
    itemStatsMap[key].qty += qty;
    itemStatsMap[key].revenue += rev;
  });

  const itemStatsList = Object.values(itemStatsMap).sort((a, b) => b.revenue - a.revenue);

  // Expense Categories Breakdown
  const expenseCatMap = {};
  Object.values(expenseCalc.byCategory).forEach(c => {
    expenseCatMap[c.name] = (expenseCatMap[c.name] || 0) + c.total;
  });
  if (totalTransportFuelExpenses > 0) {
    expenseCatMap['Transport Fuel Cost'] = totalTransportFuelExpenses;
  }

  // Time Bucket Grouping
  const timeBuckets = groupDataByTimeGrain(filteredOrders, flatExpenses, filteredCompletedTrips, fuelConfig, filters.grain, start, end);

  return {
    grossRevenue,
    totalDeductions,
    netBookedRevenue,
    cashCollected,
    cashFlowRatio,
    uncollectedReceivables,
    unpaidInvoicesCount,
    totalExpenses,
    totalCashBookExpenses,
    totalTransportFuelExpenses,
    hasFixedOverhead: Object.keys(expenseCalc.byCategory).length > 0,
    netProfit,
    profitMargin,
    costRatio,
    orderCount,
    avgOrderValue,
    dayOfWeekStats,
    customerStatsList,
    itemStatsList,
    expenseCatMap,
    timeBuckets,
    ordersCount: filteredOrders.length,
    startDateStr: start.toISOString().split('T')[0],
    endDateStr: end.toISOString().split('T')[0]
  };
}

// ─────────────────────────────────────────────
// TIME GRAIN GROUPING HELPER
// ─────────────────────────────────────────────
function groupDataByTimeGrain(orders, flatExpenses, completedTrips, fuelConfig, grain, start, end) {
  const buckets = {};

  function getBucketKey(dateObj) {
    if (isNaN(dateObj)) return 'Unknown';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');

    if (grain === 'daily') {
      return `${y}-${m}-${d}`;
    } else if (grain === 'weekly') {
      const firstJan = new Date(y, 0, 1);
      const dayNum = Math.floor((dateObj - firstJan) / 86400000);
      const weekNum = Math.ceil((dayNum + firstJan.getDay() + 1) / 7);
      return `${y}-W${String(weekNum).padStart(2, '0')}`;
    } else if (grain === 'yearly') {
      return `${y}`;
    } else {
      return `${y}-${m}`;
    }
  }

  orders.forEach(o => {
    const d = new Date(o.pickup_date || o.created_at);
    const key = getBucketKey(d);
    if (!buckets[key]) buckets[key] = { key, revenue: 0, expenses: 0, orders: 0 };
    buckets[key].revenue += (parseFloat(o.total_amount) || 0);
    buckets[key].orders += 1;
  });

  // Cash Book expenses are simple dated amounts — no amortization spreading
  // needed, just bucket each flattened row by its own entry_date.
  flatExpenses.forEach(r => {
    const d = new Date(r.entry_date);
    if (isNaN(d) || d < start || d > end) return;
    const key = getBucketKey(d);
    if (!buckets[key]) buckets[key] = { key, revenue: 0, expenses: 0, orders: 0 };
    buckets[key].expenses += r.amount;
  });

  completedTrips.forEach(t => {
    const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
    const tDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    const key = getBucketKey(tDate);
    if (!buckets[key]) buckets[key] = { key, revenue: 0, expenses: 0, orders: 0 };

    const mKey = dateStr ? dateStr.slice(0, 7) : '';
    const mPriceConfig = (fuelConfig.monthly_prices && fuelConfig.monthly_prices[mKey]) 
      ? fuelConfig.monthly_prices[mKey] 
      : fuelConfig;
    const ratePerKm = parseFloat(mPriceConfig.cost_per_km || (mPriceConfig.current_price / (mPriceConfig.km_per_litre || 1)) || 37);
    const tripCost = (parseFloat(t.distance_km) || 0) * ratePerKm;

    buckets[key].expenses += tripCost;
  });

  const sortedKeys = Object.keys(buckets).sort();
  return sortedKeys.map(k => buckets[k]);
}

// ─────────────────────────────────────────────
// UI RENDERING FUNCTIONS
// ─────────────────────────────────────────────
function renderKPICards(d) {
  const container = document.getElementById('an-kpi-cards');
  if (!container) return;

  const marginColor = d.profitMargin >= 25 ? '#10b981' : (d.profitMargin >= 10 ? '#f59e0b' : '#ef4444');
  const profitColor = d.netProfit >= 0 ? '#10b981' : '#ef4444';

  container.innerHTML = `
    ${anStatCard("Booked Sales (Accrual)", formatCurrency(d.netBookedRevenue), "fa-coins", "#3b82f6", "#dbeafe", `Gross: ${formatCurrency(d.grossRevenue)} (less ${formatCurrency(d.totalDeductions)} deductions)`)}
    ${anStatCard("Cash Collected", formatCurrency(d.cashCollected), "fa-wallet", "#10b981", "#dcfce7", `${d.cashFlowRatio.toFixed(1)}% realized vs booked sales`)}
    ${anStatCard("Total Expenses", formatCurrency(d.totalExpenses), "fa-receipt", "#ef4444", "#fee2e2", `Cost ratio: ${d.costRatio.toFixed(1)}%`)}
    ${anStatCard("Net Operating Profit", formatCurrency(d.netProfit), "fa-scale-balanced", profitColor, d.netProfit >= 0 ? "#dcfce7" : "#fee2e2", `Margin: ${d.profitMargin.toFixed(1)}% ${!d.hasFixedOverhead ? '⚠️ (No OPEX entered)' : ''}`, marginColor)}
    ${anStatCard("Uncollected Receivables (All-Time)", formatCurrency(d.uncollectedReceivables), "fa-clock", "#f59e0b", "#fef3c7", `Across ${d.unpaidInvoicesCount} unpaid invoices — NOT scoped to the date filter above`)}
  `;
}

function anStatCard(label, value, icon, color, bgColor, sub, badgeColor = null) {
  return `<div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--card-bg);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div class="label" style="font-size:0.82em;font-weight:700;text-transform:uppercase;color:var(--text-muted);">${label}</div>
      <div style="background:${bgColor};color:${color};width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.05em;">
        <i class="fas ${icon}"></i>
      </div>
    </div>
    <div class="value" style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:var(--text);">${value}</div>
    <div class="sub" style="font-size:0.8em;color:${badgeColor || 'var(--text-muted)'};font-weight:600;margin-top:4px;">${sub}</div>
  </div>`;
}

function renderBusinessInsights(d) {
  const grid = document.getElementById('an-insights-grid');
  if (!grid) return;

  const insights = [];

  // Insight 1: Peak Trading Day
  const sortedDays = [...d.dayOfWeekStats].sort((a, b) => b.revenue - a.revenue);
  if (sortedDays[0] && sortedDays[0].revenue > 0) {
    const peakDay = sortedDays[0];
    const dayPct = d.grossRevenue > 0 ? ((peakDay.revenue / d.grossRevenue) * 100).toFixed(0) : 0;
    insights.push({
      icon: 'fa-calendar-check',
      color: '#3b82f6',
      title: `Peak Demand: ${peakDay.day}s`,
      desc: `<strong>${peakDay.day}s</strong> generate <strong>${dayPct}%</strong> of total revenue (${formatCurrency(peakDay.revenue)}). Ensure transport drivers & laundry crew are fully scheduled.`
    });
  }

  // Insight 2: Best Customer
  if (d.customerStatsList.length > 0) {
    const topCust = d.customerStatsList[0];
    const custPct = d.grossRevenue > 0 ? ((topCust.revenue / d.grossRevenue) * 100).toFixed(0) : 0;
    insights.push({
      icon: 'fa-hotel',
      color: '#8b5cf6',
      title: `Top Client: ${topCust.name}`,
      desc: `<strong>${topCust.name}</strong> is your highest revenue contributor (<strong>${custPct}%</strong> of total sales, LKR ${topCust.revenue.toLocaleString()}). Maintain key account priorities.`
    });
  }

  // Insight 3: Financial Health & Cost Ratio
  if (d.costRatio > 70) {
    insights.push({
      icon: 'fa-triangle-exclamation',
      color: '#ef4444',
      title: `High Operating Expense Ratio (${d.costRatio.toFixed(1)}%)`,
      desc: `Expenses consume over 70% of gross revenue. Review utility bills, highest-spend expense categories, and driver transport fuel routes.`
    });
  } else if (d.profitMargin >= 30) {
    insights.push({
      icon: 'fa-chart-line-up',
      color: '#10b981',
      title: `Strong Profit Margin (${d.profitMargin.toFixed(1)}%)`,
      desc: `Your net operating profit margin is in a healthy growth tier. Capitalize by offering volume discounts to secondary accounts.`
    });
  } else {
    insights.push({
      icon: 'fa-scale-balanced',
      color: '#f59e0b',
      title: `Balanced Margin (${d.profitMargin.toFixed(1)}%)`,
      desc: `Net profit margin is steady. Review your highest-spend expense categories for bulk-purchasing or vendor-negotiation savings.`
    });
  }

  grid.innerHTML = insights.map(ins => `
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;gap:12px;align-items:flex-start;">
      <div style="width:34px;height:34px;border-radius:8px;background:${ins.color}15;color:${ins.color};display:flex;align-items:center;justify-content:center;font-size:1em;flex-shrink:0;margin-top:2px;">
        <i class="fas ${ins.icon}"></i>
      </div>
      <div>
        <div style="font-weight:700;font-size:0.88em;color:var(--text);margin-bottom:2px;">${ins.title}</div>
        <div style="font-size:0.8em;color:var(--text-muted);line-height:1.4;">${ins.desc}</div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// CHART RENDERING (Chart.js v4)
// ─────────────────────────────────────────────
function renderTrendChart(d) {
  const ctx = document.getElementById('an-chart-trend')?.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = d.timeBuckets.map(b => b.key);
  const revenueData = d.timeBuckets.map(b => b.revenue);
  const expenseData = d.timeBuckets.map(b => b.expenses);

  analyticsCharts.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue (LKR)',
          data: revenueData,
          backgroundColor: '#3b82f6',
          borderRadius: 6
        },
        {
          label: 'Expenses (LKR)',
          data: expenseData,
          backgroundColor: '#ef4444',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: textColor, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: LKR ${c.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, callback: v => 'LKR ' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
      }
    }
  });
}

function renderDayOfWeekChart(d) {
  const ctx = document.getElementById('an-chart-dayofweek')?.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = d.dayOfWeekStats.map(s => s.day);
  const revenueData = d.dayOfWeekStats.map(s => s.revenue);

  analyticsCharts.dayOfWeek = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue by Day (LKR)',
        data: revenueData,
        backgroundColor: '#f59e0b',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `Revenue: LKR ${c.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, callback: v => 'LKR ' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
      }
    }
  });
}

function renderTopItemsChart(d) {
  const ctx = document.getElementById('an-chart-topitems')?.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  // Was slice(0, 8) — didn't match the "Top 10 Best Selling Items" heading above the chart,
  // so it silently dropped the 9th and 10th best-selling items from the view.
  const topItems = (d.itemStatsList || []).slice(0, 10);
  const labels = topItems.map(i => i.name.length > 18 ? i.name.substring(0, 18) + '...' : i.name);
  const revenueData = topItems.map(i => i.revenue);

  analyticsCharts.topItems = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (LKR)',
        data: revenueData,
        backgroundColor: '#ec4899',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const val = c.parsed ? (c.parsed.x || 0) : 0;
              const item = topItems[c.dataIndex];
              return `Revenue: LKR ${val.toLocaleString()} (${item ? item.qty : 0} pcs)`;
            }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, callback: v => 'LKR ' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } }
      }
    }
  });
}

function renderExpenseCategoryChart(d) {
  const ctx = document.getElementById('an-chart-expensecat')?.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = Object.keys(d.expenseCatMap);
  const values = Object.values(d.expenseCatMap);

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#06b6d4', '#64748b'];

  analyticsCharts.expenseCat = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: textColor, font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.label}: LKR ${c.parsed.toLocaleString()}` } }
      }
    }
  });
}

function renderTables(d) {
  // 1. Customers Table
  const custTbody = document.getElementById('an-tbl-top-customers');
  const custTfoot = document.getElementById('an-tfoot-top-customers');
  const custCount = document.getElementById('an-top-cust-count');
  if (custCount) custCount.textContent = `${d.customerStatsList.length} clients`;

  if (custTbody) {
    custTbody.innerHTML = d.customerStatsList.length === 0
      ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No client data</td></tr>`
      : d.customerStatsList.map(c => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td style="text-align:center;"><span class="badge badge-purple">${c.orders}</span></td>
          <td style="text-align:right;font-weight:700;">LKR ${c.revenue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
          <td style="text-align:right;color:var(--text-muted);font-size:0.88em;">LKR ${c.orders > 0 ? (c.revenue / c.orders).toLocaleString(undefined, {maximumFractionDigits:0}) : 0}</td>
        </tr>
      `).join('');
  }

  if (custTfoot && d.customerStatsList.length > 0) {
    const totalOrders = d.customerStatsList.reduce((s, c) => s + c.orders, 0);
    // Sums to the same number as d.grossRevenue today (every order's full total_amount is
    // attributed to exactly one customer bucket), but computed directly from the visible
    // rows rather than relying on that equivalence — the Item Breakdown footer used to take
    // the same shortcut and it silently went wrong once item-level and order-level revenue
    // diverged. Keeping this self-consistent avoids the same failure mode here.
    const totalCustRev = d.customerStatsList.reduce((s, c) => s + (c.revenue || 0), 0);
    custTfoot.innerHTML = `
      <tr>
        <td style="padding:10px 16px;">Total (${d.customerStatsList.length} Clients)</td>
        <td style="text-align:center;padding:10px 16px;"><span class="badge badge-purple">${totalOrders}</span></td>
        <td style="text-align:right;padding:10px 16px;color:var(--primary);font-size:1em;">LKR ${totalCustRev.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        <td style="text-align:right;padding:10px 16px;color:var(--text-muted);font-size:0.88em;">LKR ${totalOrders > 0 ? (totalCustRev / totalOrders).toLocaleString(undefined, {maximumFractionDigits:0}) : 0}</td>
      </tr>
    `;
  }

  // 2. Item Breakdown Table
  const itemTbody = document.getElementById('an-tbl-top-items');
  const itemTfoot = document.getElementById('an-tfoot-top-items');
  const itemCount = document.getElementById('an-top-items-count');
  if (itemCount) itemCount.textContent = `${d.itemStatsList.length} items`;

  if (itemTbody) {
    itemTbody.innerHTML = d.itemStatsList.length === 0
      ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No item data</td></tr>`
      : d.itemStatsList.map(it => `
        <tr>
          <td><span style="font-family:monospace;font-weight:700;font-size:0.85em;background:var(--bg);padding:3px 6px;border-radius:4px;border:1px solid var(--border);">${it.code}</span></td>
          <td><strong>${it.name}</strong></td>
          <td style="text-align:center;"><span class="badge badge-cyan">${it.qty}</span></td>
          <td style="text-align:right;font-weight:700;">LKR ${it.revenue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        </tr>
      `).join('');
  }

  if (itemTfoot && d.itemStatsList.length > 0) {
    const totalQty = d.itemStatsList.reduce((s, i) => s + i.qty, 0);
    // Sum the rows actually shown in the table, NOT d.grossRevenue. grossRevenue is the
    // order-level total (includes delivery_charge/extra_payment, which aren't attributed
    // to any catalog item, plus any order that has no itemized order_items rows at all) —
    // using it here silently substituted a bigger, unrelated number for what this footer
    // claims to be: the total of the item lines above it. If itemized revenue is notably
    // less than Booked Sales on the KPI card above, that gap is real and worth checking —
    // it means either delivery/extra charges make up a big share of billing, or some
    // orders were never itemized (their revenue would otherwise be untraceable to a catalog item).
    const totalItemRev = d.itemStatsList.reduce((s, i) => s + (i.revenue || 0), 0);
    itemTfoot.innerHTML = `
      <tr>
        <td colspan="2" style="padding:10px 16px;">Total (${d.itemStatsList.length} Items)</td>
        <td style="text-align:center;padding:10px 16px;"><span class="badge badge-cyan">${totalQty} pcs</span></td>
        <td style="text-align:right;padding:10px 16px;color:var(--primary);font-size:1em;">LKR ${totalItemRev.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      </tr>
    `;
  }
}

// ─────────────────────────────────────────────
// MULTI-FORMAT DATA EXPORT (CSV, EXCEL, PRINT)
// ─────────────────────────────────────────────
function exportAnalyticsData(type) {
  const d = window._analyticsExportData;
  if (!d) return typeof toast === 'function' ? toast('No analytics data available to export', 'error') : alert('No data');

  const filename = `analytics_report_${d.startDateStr}_to_${d.endDateStr}`;

  if (type === 'csv') {
    // Deductions and Net Booked Revenue are included so the chain
    // Gross Revenue - Deductions = Net Booked Revenue - Operating Expenses = Net Profit
    // is fully reconcilable from the exported file alone. Previously the export only had
    // Gross Revenue and Net Profit, and Net Profit is actually computed from the smaller
    // (deduction-adjusted) Net Booked Revenue — so anyone checking "Gross - Expenses" by
    // hand against the export would land on a number that doesn't match Net Profit whenever
    // any deductions existed in the period.
    const csvRows = [
      ['Metric', 'Value'],
      ['Date Range', `${d.startDateStr} to ${d.endDateStr}`],
      ['Gross Revenue (LKR)', d.grossRevenue],
      ['Deductions (LKR)', d.totalDeductions],
      ['Net Booked Revenue (LKR)', d.netBookedRevenue],
      ['Cash Collected (LKR)', d.cashCollected],
      ['Uncollected Receivables — All-Time (LKR)', d.uncollectedReceivables],
      ['Operating Expenses (LKR)', d.totalExpenses],
      ['Net Operating Profit (LKR)', d.netProfit],
      ['Profit Margin (%)', d.profitMargin.toFixed(2)],
      ['Cost Ratio (%)', d.costRatio.toFixed(2)],
      ['Total Orders', d.orderCount],
      ['Average Order Value (LKR)', d.avgOrderValue.toFixed(2)],
      [],
      ['Customer Name', 'Total Orders', 'Total Revenue (LKR)', 'Average Order (LKR)']
    ];

    d.customerStatsList.forEach(c => {
      csvRows.push([c.name, c.orders, c.revenue, c.orders > 0 ? (c.revenue / c.orders).toFixed(2) : 0]);
    });

    let csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof toast === 'function') toast('Analytics CSV exported!');

  } else if (type === 'excel') {
    if (typeof XLSX === 'undefined') return typeof toast === 'function' ? toast('Excel library not loaded', 'error') : alert('XLSX not loaded');

    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: 'Date Range', Value: `${d.startDateStr} to ${d.endDateStr}` },
      { Metric: 'Gross Revenue (LKR)', Value: d.grossRevenue },
      { Metric: 'Deductions (LKR)', Value: d.totalDeductions },
      { Metric: 'Net Booked Revenue (LKR)', Value: d.netBookedRevenue },
      { Metric: 'Cash Collected (LKR)', Value: d.cashCollected },
      { Metric: 'Uncollected Receivables — All-Time (LKR)', Value: d.uncollectedReceivables },
      { Metric: 'Operating Expenses (LKR)', Value: d.totalExpenses },
      { Metric: 'Net Operating Profit (LKR)', Value: d.netProfit },
      { Metric: 'Profit Margin (%)', Value: d.profitMargin.toFixed(2) },
      { Metric: 'Total Orders', Value: d.orderCount },
      { Metric: 'Average Order Value (LKR)', Value: d.avgOrderValue.toFixed(2) }
    ]);

    const customerSheet = XLSX.utils.json_to_sheet(
      d.customerStatsList.map(c => ({
        'Customer Name': c.name,
        'Orders': c.orders,
        'Revenue (LKR)': c.revenue,
        'AOV (LKR)': c.orders > 0 ? (c.revenue / c.orders) : 0
      }))
    );

    const itemSheet = XLSX.utils.json_to_sheet(
      d.itemStatsList.map(it => ({
        'Item Code': it.code,
        'Item Name': it.name,
        'Quantity Sold': it.qty,
        'Revenue (LKR)': it.revenue
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Financial Summary');
    XLSX.utils.book_append_sheet(wb, customerSheet, 'Top Customers');
    XLSX.utils.book_append_sheet(wb, itemSheet, 'Item Performance');

    XLSX.writeFile(wb, `${filename}.xlsx`);
    if (typeof toast === 'function') toast('Analytics Excel workbook exported!');
  }
}
