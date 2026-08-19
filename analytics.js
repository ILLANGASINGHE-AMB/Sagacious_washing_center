// analytics.js — Data Analytics Tab
// Structure: Section01 (fixed "This Month" KPI cards + 5 category buttons),
// Section02 (per-category filter bar), Section03 (Chart/Table/Graph view switch).
// Switching category/view/filters never navigates — only #an-body is re-rendered.

let analyticsCharts = {}; // canvas id -> Chart.js instance, destroyed before every redraw
let analyticsRefData = null; // cached lookup lists (customers, items, drivers, vehicles, expense cats/types)

let analyticsState = {
  activeButton: 'income', // 'income' | 'expenses' | 'drivers' | 'vehicles' | 'items'
  views: { income: 'chart', expenses: 'chart', drivers: 'chart', vehicles: 'chart', items: 'chart' },
  filters: {
    income:   { period: { type: 'all' }, customerId: 'all', itemId: 'all', paymentStatus: 'all' },
    expenses: { period: { type: 'all' }, categoryId: 'all', expenseTypeId: 'all' },
    drivers:  { period: { type: 'all' }, driverId: 'all', status: 'all' },
    vehicles: { period: { type: 'all' }, vehicleId: 'all', category: 'all', status: 'all' },
    items:    { period: { type: 'all' }, itemId: 'all', serviceType: 'all' }
  }
};

const AN_BUTTON_LABELS = { income: 'Income', expenses: 'Expenses', drivers: 'Drivers', vehicles: 'Vehicles', items: 'Items' };
const AN_COLORS = { blue: '#3b82f6', green: '#10b981', red: '#ef4444', amber: '#f59e0b', purple: '#8b5cf6', pink: '#ec4899', cyan: '#0ea5e9', indigo: '#6366f1', gray: '#64748b' };

// ─────────────────────────────────────────────
// PAGE SHELL
// ─────────────────────────────────────────────
async function renderAnalytics() {
  document.getElementById('page-title').textContent = 'Data Analytics';
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="section-header" style="flex-wrap:wrap;gap:12px;">
      <div>
        <span class="section-title">Business Analytics & Data Intelligence</span>
        <div style="font-size:0.82em;color:var(--text-muted);margin-top:2px;">Track income, expenses, drivers, vehicles and item performance</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;" id="an-kpi-cards">
      <div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i></div>
    </div>

    <div class="card" style="margin-bottom:20px;padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap;" id="an-category-buttons"></div>

    <div id="an-body"></div>
  `;

  await anLoadRefData();

  const summary = await calculateThisMonthSummary();
  renderKPICards(summary);
  renderCategoryButtons();
  await renderAnalyticsBody();
}

async function anLoadRefData() {
  const [customers, items, drivers, vehicles, expenseCategories, expenseTypes] = await Promise.all([
    DB.getCustomers(), DB.getItems(), DB.getDrivers(), DB.getVehicles(),
    DB.getExpenseCategories(), DB.getExpenseTypes()
  ]);
  analyticsRefData = { customers, items, drivers, vehicles, expenseCategories, expenseTypes };
}

function renderCategoryButtons() {
  const el = document.getElementById('an-category-buttons');
  if (!el) return;
  el.innerHTML = Object.keys(AN_BUTTON_LABELS).map(key => `
    <button class="btn ${analyticsState.activeButton === key ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="anOnButtonChange('${key}')">${AN_BUTTON_LABELS[key]}</button>
  `).join('');
}

function anOnButtonChange(buttonKey) {
  analyticsState.activeButton = buttonKey;
  renderCategoryButtons();
  renderAnalyticsBody();
}

function anOnViewChange(view) {
  analyticsState.views[analyticsState.activeButton] = view;
  renderAnalyticsBody();
}

function anOnFilterChange(field, value) {
  analyticsState.filters[analyticsState.activeButton][field] = value;
  renderAnalyticsBody();
}

function anOnPeriodTypeChange(type) {
  const period = { type };
  const today = new Date();
  if (type === 'year') period.year = today.getFullYear();
  if (type === 'month') period.month = today.toISOString().slice(0, 7);
  if (type === 'range') { const t = today.toISOString().slice(0, 10); period.start = t; period.end = t; }
  if (type === 'day') period.day = today.toISOString().slice(0, 10);
  analyticsState.filters[analyticsState.activeButton].period = period;
  renderAnalyticsBody();
}

function anOnPeriodValueChange(field, value) {
  analyticsState.filters[analyticsState.activeButton].period[field] = value;
  renderAnalyticsBody();
}

function anDestroyCharts() {
  Object.values(analyticsCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
  analyticsCharts = {};
}

// ─────────────────────────────────────────────
// SECTION 02 + 03 DISPATCH
// ─────────────────────────────────────────────
async function renderAnalyticsBody() {
  const body = document.getElementById('an-body');
  if (!body) return;
  const key = analyticsState.activeButton;
  const view = analyticsState.views[key];

  body.innerHTML = `
    <div class="card" style="margin-bottom:20px;padding:16px 20px;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;align-items:end;" id="an-filter-grid">
        ${anRenderPeriodControl(key)}
        ${anRenderButtonFilters(key)}
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="btn ${view === 'chart' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="anOnViewChange('chart')"><i class="fas fa-chart-column"></i> Chart View</button>
      <button class="btn ${view === 'table' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="anOnViewChange('table')"><i class="fas fa-table"></i> Table View</button>
      <button class="btn ${view === 'graph' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="anOnViewChange('graph')"><i class="fas fa-chart-line"></i> Graph View</button>
    </div>

    <div id="an-view">
      <div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:1.5em;"></i></div>
    </div>
  `;

  anDestroyCharts();

  try {
    if (key === 'income') {
      const data = await calculateIncomeAnalytics(analyticsState.filters.income);
      if (view === 'chart') renderIncomeChart(data); else if (view === 'table') renderIncomeTable(data); else renderIncomeGraph(data);
    } else if (key === 'expenses') {
      const data = await calculateExpensesAnalytics(analyticsState.filters.expenses);
      if (view === 'chart') renderExpensesChart(data); else if (view === 'table') renderExpensesTable(data); else renderExpensesGraph(data);
    } else if (key === 'drivers') {
      const data = await calculateDriversAnalytics(analyticsState.filters.drivers);
      if (view === 'chart') renderDriversChart(data); else if (view === 'table') renderDriversTable(data); else renderDriversGraph(data);
    } else if (key === 'vehicles') {
      const data = await calculateVehiclesAnalytics(analyticsState.filters.vehicles);
      if (view === 'chart') renderVehiclesChart(data); else if (view === 'table') renderVehiclesTable(data); else renderVehiclesGraph(data);
    } else if (key === 'items') {
      const data = await calculateItemsAnalytics(analyticsState.filters.items);
      if (view === 'chart') renderItemsChart(data); else if (view === 'table') renderItemsTable(data); else renderItemsGraph(data);
    }
  } catch (err) {
    console.error('Analytics error:', err);
    const viewEl = document.getElementById('an-view');
    if (viewEl) viewEl.innerHTML = `<div class="card" style="padding:20px;background:#fee2e2;border-radius:10px;color:#b91c1c;font-size:0.88em;"><i class="fas fa-triangle-exclamation"></i> Failed to load analytics: ${escapeHtml(err.message || String(err))}</div>`;
  }
}

function anFilterLabel(text, icon) {
  return `<label class="form-label" style="font-size:0.78em;font-weight:700;text-transform:uppercase;color:var(--text-muted);"><i class="fas ${icon}"></i> ${text}</label>`;
}

function anRenderPeriodControl(key) {
  const period = analyticsState.filters[key].period;
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear + 1; y >= currentYear - 6; y--) years.push(y);

  let secondary = '';
  if (period.type === 'year') {
    secondary = `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Year', 'fa-calendar')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnPeriodValueChange('year', this.value)">
          ${years.map(y => `<option value="${y}" ${Number(period.year) === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>`;
  } else if (period.type === 'month') {
    secondary = `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Month', 'fa-calendar')}
        <input type="month" class="form-input" style="font-size:0.85em;padding:6px 10px;" value="${period.month || ''}" onchange="anOnPeriodValueChange('month', this.value)"/>
      </div>`;
  } else if (period.type === 'range') {
    secondary = `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('From Date', 'fa-calendar')}
        <input type="date" class="form-input" style="font-size:0.85em;padding:6px 10px;" value="${period.start || ''}" onchange="anOnPeriodValueChange('start', this.value)"/>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('To Date', 'fa-calendar')}
        <input type="date" class="form-input" style="font-size:0.85em;padding:6px 10px;" value="${period.end || ''}" onchange="anOnPeriodValueChange('end', this.value)"/>
      </div>`;
  } else if (period.type === 'day') {
    secondary = `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Date', 'fa-calendar')}
        <input type="date" class="form-input" style="font-size:0.85em;padding:6px 10px;" value="${period.day || ''}" onchange="anOnPeriodValueChange('day', this.value)"/>
      </div>`;
  }

  return `
    <div class="form-group" style="margin:0;">
      ${anFilterLabel('Time Period', 'fa-clock')}
      <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnPeriodTypeChange(this.value)">
        <option value="all" ${period.type === 'all' ? 'selected' : ''}>All Time</option>
        <option value="year" ${period.type === 'year' ? 'selected' : ''}>Yearly</option>
        <option value="month" ${period.type === 'month' ? 'selected' : ''}>Monthly</option>
        <option value="range" ${period.type === 'range' ? 'selected' : ''}>Weekly (Date Range)</option>
        <option value="day" ${period.type === 'day' ? 'selected' : ''}>Daily</option>
      </select>
    </div>
    ${secondary}
  `;
}

function anRenderButtonFilters(key) {
  const f = analyticsState.filters[key];
  const r = analyticsRefData;

  if (key === 'income') {
    return `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Customer', 'fa-hotel')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('customerId', this.value)">
          <option value="all">All Customers</option>
          ${r.customers.map(c => `<option value="${c.id}" ${String(f.customerId) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.hotel_name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Item', 'fa-list-check')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('itemId', this.value)">
          <option value="all">All Items</option>
          ${r.items.map(it => `<option value="${it.id}" ${String(f.itemId) === String(it.id) ? 'selected' : ''}>${escapeHtml(it.item_name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Payment Status', 'fa-money-bill-wave')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('paymentStatus', this.value)">
          <option value="all" ${f.paymentStatus === 'all' ? 'selected' : ''}>All Orders</option>
          <option value="Paid" ${f.paymentStatus === 'Paid' ? 'selected' : ''}>Paid Only</option>
          <option value="Unpaid" ${f.paymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid Only</option>
        </select>
      </div>`;
  }

  if (key === 'expenses') {
    const typesForCategory = f.categoryId === 'all' ? r.expenseTypes : r.expenseTypes.filter(t => String(t.category_id) === String(f.categoryId));
    return `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Expense Category', 'fa-folder')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('categoryId', this.value); anOnFilterChange('expenseTypeId', 'all')">
          <option value="all">All Categories</option>
          ${r.expenseCategories.map(c => `<option value="${c.category_id}" ${String(f.categoryId) === String(c.category_id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Expense Name', 'fa-receipt')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('expenseTypeId', this.value)">
          <option value="all">All Expenses</option>
          ${typesForCategory.map(t => `<option value="${t.expense_type_id}" ${String(f.expenseTypeId) === String(t.expense_type_id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>`;
  }

  if (key === 'drivers') {
    return `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Driver', 'fa-id-card')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('driverId', this.value)">
          <option value="all">All Drivers</option>
          ${r.drivers.map(d => `<option value="${d.id}" ${String(f.driverId) === String(d.id) ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Status', 'fa-circle-dot')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('status', this.value)">
          <option value="all">All Statuses</option>
          <option value="available" ${f.status === 'available' ? 'selected' : ''}>Available</option>
          <option value="busy" ${f.status === 'busy' ? 'selected' : ''}>Busy</option>
          <option value="off-duty" ${f.status === 'off-duty' ? 'selected' : ''}>Off Duty</option>
        </select>
      </div>`;
  }

  if (key === 'vehicles') {
    return `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Vehicle', 'fa-truck')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('vehicleId', this.value)">
          <option value="all">All Vehicles</option>
          ${r.vehicles.map(v => `<option value="${v.id}" ${String(f.vehicleId) === String(v.id) ? 'selected' : ''}>${escapeHtml(v.vehicle_no)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Category', 'fa-tags')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('category', this.value)">
          <option value="all">All Categories</option>
          ${[...new Set(r.vehicles.map(v => v.category).filter(Boolean))].map(c => `<option value="${c}" ${f.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Status', 'fa-circle-dot')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('status', this.value)">
          <option value="all">All Statuses</option>
          <option value="available" ${f.status === 'available' ? 'selected' : ''}>Available</option>
          <option value="busy" ${f.status === 'busy' ? 'selected' : ''}>Busy / On Trip</option>
          <option value="maintenance" ${f.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
        </select>
      </div>`;
  }

  if (key === 'items') {
    return `
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Item', 'fa-list-check')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('itemId', this.value)">
          <option value="all">All Items</option>
          ${r.items.map(it => `<option value="${it.id}" ${String(f.itemId) === String(it.id) ? 'selected' : ''}>${escapeHtml(it.item_name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        ${anFilterLabel('Service Type', 'fa-soap')}
        <select class="form-input form-select" style="font-size:0.85em;padding:8px 10px;" onchange="anOnFilterChange('serviceType', this.value)">
          <option value="all">All Service Types</option>
          <option value="Dry Clean" ${f.serviceType === 'Dry Clean' ? 'selected' : ''}>Dry Clean</option>
          <option value="Wash & Press" ${f.serviceType === 'Wash & Press' ? 'selected' : ''}>Wash & Press</option>
          <option value="Wash & Dry" ${f.serviceType === 'Wash & Dry' ? 'selected' : ''}>Wash & Dry</option>
        </select>
      </div>`;
  }

  return '';
}

// ─────────────────────────────────────────────
// SHARED HELPERS: period resolution + time-grain bucketing
// ─────────────────────────────────────────────
function anResolvePeriodRange(period) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (period.type === 'year') {
    const y = period.year || today.getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31`, grain: 'monthly' };
  }
  if (period.type === 'month') {
    const ym = period.month || todayStr.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { start: `${ym}-01`, end: `${ym}-${String(lastDay).padStart(2, '0')}`, grain: 'daily' };
  }
  if (period.type === 'range') {
    return { start: period.start || todayStr, end: period.end || todayStr, grain: 'daily' };
  }
  if (period.type === 'day') {
    const d = period.day || todayStr;
    return { start: d, end: d, grain: 'daily' };
  }
  return { start: '2000-01-01', end: todayStr, grain: 'yearly' };
}

function anBucketKey(dateObj, grain) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  if (grain === 'yearly') return `${y}`;
  if (grain === 'monthly') return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function anBucketLabel(key, grain) {
  if (grain === 'yearly') return key;
  if (grain === 'monthly') {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  return new Date(key + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Buckets `rows` into sorted {key,label,...} objects. `dateGetter` returns a date string/obj for
// each row (or falsy to skip it); `seed`/`accumulate` shape what each bucket accumulates.
function anBucketRows(rows, dateGetter, grain, start, end, seed, accumulate) {
  const startD = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T23:59:59');
  const buckets = {};
  (rows || []).forEach(r => {
    const raw = dateGetter(r);
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d) || d < startD || d > endD) return;
    const key = anBucketKey(d, grain);
    if (!buckets[key]) buckets[key] = seed();
    accumulate(buckets[key], r);
  });
  return Object.keys(buckets).sort().map(k => ({ key: k, label: anBucketLabel(k, grain), ...buckets[k] }));
}

function anThemeColors() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    text: isDark ? '#94a3b8' : '#64748b',
    isDark
  };
}

// ─────────────────────────────────────────────
// SHARED CHART FACTORIES (Chart.js v4)
// ─────────────────────────────────────────────
function anBarChart(canvasId, labels, datasets, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { grid, text } = anThemeColors();
  analyticsCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: datasets.map(ds => ({ borderRadius: 6, ...ds })) },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'bottom', labels: { color: text, font: { size: 11 } } },
        tooltip: opts.tooltip || {}
      },
      scales: opts.stacked ? {
        x: { stacked: true, grid: { color: grid }, ticks: { color: text, font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true, grid: { color: grid }, ticks: { color: text, font: { size: 10 }, callback: opts.yFormat } }
      } : {
        x: { grid: { color: grid }, ticks: { color: text, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text, font: { size: 10 }, callback: opts.yFormat } }
      }
    }
  });
}

// Non-linear (curved) line chart — matches the Vehicle/Driver Profile graph look.
function anLineChart(canvasId, labels, series, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { grid, text, isDark } = anThemeColors();
  const ctx = canvas.getContext('2d');

  const datasets = series.map(s => {
    let bg = s.color + '22';
    if (opts.fill !== false && series.length === 1) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 320);
      gradient.addColorStop(0, s.color + '66');
      gradient.addColorStop(1, s.color + '05');
      bg = gradient;
    }
    return {
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: bg,
      borderWidth: 2.5,
      tension: 0.38,
      fill: series.length === 1 && opts.fill !== false,
      pointBackgroundColor: s.color,
      pointBorderColor: isDark ? '#1e293b' : '#ffffff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 7
    };
  });

  analyticsCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: series.length > 1, position: 'top', labels: { color: text, font: { size: 11 }, boxWidth: 12 } },
        tooltip: opts.tooltip || {}
      },
      scales: {
        x: { grid: { color: grid }, ticks: { color: text, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text, font: { size: 10 }, callback: opts.yFormat } }
      }
    }
  });
}

function anDonutChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { text } = anThemeColors();
  const palette = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#0ea5e9', '#64748b'];
  analyticsCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length) }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: text, font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed.toLocaleString()}` } }
      }
    }
  });
}

function anLkrTick(v) { return 'LKR ' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v); }

function anChartCard(title, icon, color, canvasId, height = 300) {
  return `<div class="card" style="margin-bottom:20px;">
    <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas ${icon}" style="color:${color};margin-right:8px;"></i>${title}</div>
    <div class="chart-container" style="height:${height}px;"><canvas id="${canvasId}"></canvas></div>
  </div>`;
}

function anTableCard(title, icon, color, tableHtml) {
  return `<div class="card" style="margin-bottom:20px;">
    <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;font-size:1.05em;"><i class="fas ${icon}" style="color:${color};margin-right:8px;"></i>${title}</div>
    <div class="table-wrap" style="max-height:440px;overflow-y:auto;">${tableHtml}</div>
  </div>`;
}

// ─────────────────────────────────────────────
// SECTION 01 — FIXED "THIS MONTH" KPI CARDS
// ─────────────────────────────────────────────
async function calculateThisMonthSummary() {
  const now = new Date();
  const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
  const start = `${y}-${m}-01`;
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  const startD = new Date(start + 'T00:00:00'), endD = new Date(end + 'T23:59:59');

  const [orders, expEntries, expAmounts] = await Promise.all([DB.getOrders(), DB.getExpenseEntries(), DB.getExpenseAmounts()]);
  const flatExpenses = Financials.flattenExpenseData(expAmounts, expEntries, analyticsRefData.expenseTypes, analyticsRefData.expenseCategories);

  const monthOrders = (orders || []).filter(o => {
    const raw = o.pickup_date || o.created_at;
    const d = raw ? new Date(raw) : null;
    return d && !isNaN(d) && d >= startD && d <= endD;
  });

  const totalIncome = monthOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
  const paidAmount = monthOrders.filter(o => o.status === 'Paid').reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
  const unpaidAmount = monthOrders.filter(o => o.status !== 'Paid')
    .reduce((s, o) => s + Math.max(0, (parseFloat(o.total_amount) || 0) - (parseFloat(o.advance_payment) || 0)), 0);

  const expenseCalc = Financials.computeExpenseTotals(flatExpenses, start, end);
  const totalExpenses = expenseCalc.total;
  const profit = totalIncome - totalExpenses;
  const margin = totalIncome > 0 ? (profit / totalIncome * 100) : 0;

  return { totalIncome, totalExpenses, profit, margin, paidAmount, unpaidAmount, monthLabel: startD.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
}

function renderKPICards(s) {
  const el = document.getElementById('an-kpi-cards');
  if (!el) return;
  const profitColor = s.profit >= 0 ? '#10b981' : '#ef4444';

  const card = (label, value, icon, color, bg, sub) => `
    <div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--card-bg);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="label">${label}</div>
        <div class="icon" style="background:${bg};color:${color};"><i class="fas ${icon}"></i></div>
      </div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </div>`;

  el.innerHTML = `
    ${card('Total Income', formatCurrency(s.totalIncome), 'fa-coins', '#3b82f6', '#dbeafe', s.monthLabel)}
    ${card('Total Expenses', formatCurrency(s.totalExpenses), 'fa-receipt', '#ef4444', '#fee2e2', s.monthLabel)}
    ${card('Profit', formatCurrency(s.profit), 'fa-scale-balanced', profitColor, s.profit >= 0 ? '#dcfce7' : '#fee2e2', `Margin: ${s.margin.toFixed(1)}%`)}
    ${card('Paid Amount', formatCurrency(s.paidAmount), 'fa-circle-check', '#10b981', '#dcfce7', s.monthLabel)}
    ${card('Unpaid Amount', formatCurrency(s.unpaidAmount), 'fa-hourglass-half', '#f59e0b', '#fef3c7', s.monthLabel)}
  `;
}

// ─────────────────────────────────────────────
// INCOME
// ─────────────────────────────────────────────
async function calculateIncomeAnalytics(filters) {
  const { start, end, grain } = anResolvePeriodRange(filters.period);
  const startD = new Date(start + 'T00:00:00'), endD = new Date(end + 'T23:59:59');

  const [orders, orderItems, expEntries, expAmounts] = await Promise.all([
    DB.getOrders(), DB.getAllOrderItems(), DB.getExpenseEntries(), DB.getExpenseAmounts()
  ]);
  const flatExpenses = Financials.flattenExpenseData(expAmounts, expEntries, analyticsRefData.expenseTypes, analyticsRefData.expenseCategories);
  const cMap = Object.fromEntries(analyticsRefData.customers.map(c => [c.id, c]));

  const filteredOrders = (orders || []).filter(o => {
    const raw = o.pickup_date || o.created_at;
    const d = raw ? new Date(raw) : null;
    if (!d || isNaN(d) || d < startD || d > endD) return false;
    if (filters.customerId !== 'all' && String(o.customer_id) !== String(filters.customerId)) return false;
    if (filters.paymentStatus !== 'all' && o.status !== filters.paymentStatus) return false;
    if (filters.itemId !== 'all') {
      const has = (orderItems || []).some(oi => String(oi.order_id) === String(o.id) && String(oi.catalog_item_id) === String(filters.itemId));
      if (!has) return false;
    }
    return true;
  });

  const orderIds = new Set(filteredOrders.map(o => o.id));
  const filteredOrderItems = (orderItems || []).filter(oi => orderIds.has(oi.order_id));

  // Revenue + order-count buckets, merged with expense buckets for the trend chart/table.
  const revBuckets = anBucketRows(filteredOrders, o => o.pickup_date || o.created_at, grain, start, end,
    () => ({ revenue: 0, orders: 0 }), (b, o) => { b.revenue += parseFloat(o.total_amount) || 0; b.orders += 1; });
  const expBuckets = anBucketRows(flatExpenses, r => r.entry_date, grain, start, end,
    () => ({ expenses: 0 }), (b, r) => { b.expenses += r.amount; });

  const merged = {};
  revBuckets.forEach(b => { merged[b.key] = { key: b.key, label: b.label, revenue: b.revenue, orders: b.orders, expenses: 0 }; });
  expBuckets.forEach(b => { if (!merged[b.key]) merged[b.key] = { key: b.key, label: b.label, revenue: 0, orders: 0, expenses: 0 }; merged[b.key].expenses = b.expenses; });
  const trend = Object.keys(merged).sort().map(k => merged[k]);

  // Peak trading days, Monday-first.
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayStats = dayNames.map(n => ({ day: n, revenue: 0, orders: 0, items: 0 }));
  const orderDayIndex = {};
  filteredOrders.forEach(o => {
    const d = new Date(o.pickup_date || o.created_at);
    if (isNaN(d)) return;
    const jsDay = d.getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    orderDayIndex[o.id] = idx;
    dayStats[idx].revenue += parseFloat(o.total_amount) || 0;
    dayStats[idx].orders += 1;
  });
  filteredOrderItems.forEach(oi => {
    const idx = orderDayIndex[oi.order_id];
    if (idx === undefined) return;
    const qty = parseInt(oi.quantity, 10);
    dayStats[idx].items += isNaN(qty) ? 1 : qty;
  });

  // Customer performance.
  const custMap = {};
  filteredOrders.forEach(o => {
    const cId = o.customer_id || 'unknown';
    const name = cMap[cId]?.hotel_name || 'Unknown Customer';
    (custMap[cId] ??= { id: cId, name, orders: 0, revenue: 0 });
    custMap[cId].orders += 1;
    custMap[cId].revenue += parseFloat(o.total_amount) || 0;
  });
  const customerStatsList = Object.values(custMap).sort((a, b) => b.revenue - a.revenue);

  // Top selling items.
  const itemMap = {};
  filteredOrderItems.forEach(oi => {
    const code = oi.item_name ? (analyticsRefData.items.find(it => String(it.id) === String(oi.catalog_item_id))?.item_id || 'MISC') : 'MISC';
    const name = oi.item_name || 'Laundry Service';
    const qty = parseInt(oi.quantity, 10);
    const rev = parseFloat(oi.subtotal) || (parseFloat(oi.price) || 0) * (isNaN(qty) ? 1 : qty);
    const key = code + '||' + name;
    (itemMap[key] ??= { code, name, qty: 0, revenue: 0 });
    itemMap[key].qty += isNaN(qty) ? 1 : qty;
    itemMap[key].revenue += rev;
  });
  const itemStatsList = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = filteredOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
  const totalExpenses = flatExpenses.filter(r => { const d = new Date(r.entry_date); return !isNaN(d) && d >= startD && d <= endD; }).reduce((s, r) => s + r.amount, 0);

  return { trend, dayStats, customerStatsList, itemStatsList, totalRevenue, totalExpenses, orderCount: filteredOrders.length };
}

function renderIncomeChart(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Revenue vs. Expenses Trend', 'fa-chart-line', AN_COLORS.blue, 'an-inc-c1')}
    ${anChartCard('Peak Trading Days (Mon–Sun)', 'fa-calendar-day', AN_COLORS.amber, 'an-inc-c2')}
    ${anChartCard('Order Volume Fluctuation', 'fa-cart-shopping', AN_COLORS.purple, 'an-inc-c3')}
    ${anChartCard('Customer Performance', 'fa-trophy', AN_COLORS.pink, 'an-inc-c4')}
    ${anChartCard('Top 10 Best Selling Items', 'fa-list-check', AN_COLORS.cyan, 'an-inc-c5', 340)}
  `;
  anBarChart('an-inc-c1', d.trend.map(b => b.label),
    [{ label: 'Income (LKR)', data: d.trend.map(b => b.revenue), backgroundColor: AN_COLORS.green },
     { label: 'Expenses (LKR)', data: d.trend.map(b => b.expenses), backgroundColor: AN_COLORS.red }],
    { yFormat: anLkrTick });
  anBarChart('an-inc-c2', d.dayStats.map(s => s.day), [{ label: 'Revenue (LKR)', data: d.dayStats.map(s => s.revenue), backgroundColor: AN_COLORS.amber }], { yFormat: anLkrTick });
  anBarChart('an-inc-c3', d.trend.map(b => b.label), [{ label: 'Orders', data: d.trend.map(b => b.orders), backgroundColor: AN_COLORS.purple }]);
  const topCust = d.customerStatsList.slice(0, 10);
  anBarChart('an-inc-c4', topCust.map(c => c.name), [{ label: 'Revenue (LKR)', data: topCust.map(c => c.revenue), backgroundColor: AN_COLORS.pink }], { yFormat: anLkrTick });
  const topItems = d.itemStatsList.slice(0, 10);
  anBarChart('an-inc-c5', topItems.map(i => i.name), [{ label: 'Revenue (LKR)', data: topItems.map(i => i.revenue), backgroundColor: AN_COLORS.cyan }], { horizontal: true, yFormat: anLkrTick });
}

function renderIncomeTable(d) {
  const view = document.getElementById('an-view');
  const totalIncome = d.trend.reduce((s, b) => s + b.revenue, 0);
  const totalExp = d.trend.reduce((s, b) => s + b.expenses, 0);
  const totalItems = d.dayStats.reduce((s, x) => s + x.items, 0);
  const totalDayRev = d.dayStats.reduce((s, x) => s + x.revenue, 0);
  const totalCustOrders = d.customerStatsList.reduce((s, c) => s + c.orders, 0);
  const totalCustRev = d.customerStatsList.reduce((s, c) => s + c.revenue, 0);
  const top10Items = d.itemStatsList.slice(0, 10);
  const top10Qty = top10Items.reduce((s, i) => s + i.qty, 0);
  const top10Rev = top10Items.reduce((s, i) => s + i.revenue, 0);

  view.innerHTML = `
    ${anTableCard('Income vs. Expenses', 'fa-table', AN_COLORS.blue, `
      <table><thead><tr><th>Period</th><th style="text-align:right;">Income</th><th style="text-align:right;">Expenses</th></tr></thead>
      <tbody>${d.trend.map(b => `<tr><td>${b.label}</td><td style="text-align:right;">${formatCurrency(b.revenue)}</td><td style="text-align:right;">${formatCurrency(b.expenses)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:right;">${formatCurrency(totalIncome)}</td><td style="text-align:right;">${formatCurrency(totalExp)}</td></tr></tfoot></table>`)}

    ${anTableCard('Peak Trading Days', 'fa-calendar-day', AN_COLORS.amber, `
      <table><thead><tr><th>Day</th><th style="text-align:right;">Items Sold</th><th style="text-align:right;">Bill Amount</th></tr></thead>
      <tbody>${d.dayStats.map(s => `<tr><td>${s.day}</td><td style="text-align:right;">${s.items}</td><td style="text-align:right;">${formatCurrency(s.revenue)}</td></tr>`).join('')}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:right;">${totalItems}</td><td style="text-align:right;">${formatCurrency(totalDayRev)}</td></tr></tfoot></table>`)}

    ${anTableCard('Customer Performance', 'fa-trophy', AN_COLORS.pink, `
      <table><thead><tr><th>Customer</th><th style="text-align:center;">Orders</th><th style="text-align:right;">Total Spend</th></tr></thead>
      <tbody>${d.customerStatsList.map(c => `<tr><td>${escapeHtml(c.name)}</td><td style="text-align:center;">${c.orders}</td><td style="text-align:right;">${formatCurrency(c.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:center;">${totalCustOrders}</td><td style="text-align:right;">${formatCurrency(totalCustRev)}</td></tr></tfoot></table>`)}

    ${anTableCard('Top 10 Best Selling Items', 'fa-list-check', AN_COLORS.cyan, `
      <table><thead><tr><th>Item ID</th><th>Item Name</th><th style="text-align:center;">Qty Sold</th><th style="text-align:right;">Revenue</th></tr></thead>
      <tbody>${top10Items.map(i => `<tr><td><span style="font-family:monospace;">${escapeHtml(i.code)}</span></td><td>${escapeHtml(i.name)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${formatCurrency(i.revenue)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td colspan="2">Total</td><td style="text-align:center;">${top10Qty}</td><td style="text-align:right;">${formatCurrency(top10Rev)}</td></tr></tfoot></table>`)}
  `;
}

function renderIncomeGraph(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Income & Expense Fluctuation', 'fa-chart-line', AN_COLORS.blue, 'an-inc-g1')}
    ${anChartCard('Peak Trading Days', 'fa-calendar-day', AN_COLORS.amber, 'an-inc-g2')}
    ${anChartCard('Customer Performance Fluctuation', 'fa-trophy', AN_COLORS.pink, 'an-inc-g3')}
  `;
  anLineChart('an-inc-g1', d.trend.map(b => b.label),
    [{ label: 'Income', data: d.trend.map(b => b.revenue), color: AN_COLORS.blue }, { label: 'Expenses', data: d.trend.map(b => b.expenses), color: AN_COLORS.red }],
    { yFormat: anLkrTick });
  anLineChart('an-inc-g2', d.dayStats.map(s => s.day), [{ label: 'Revenue', data: d.dayStats.map(s => s.revenue), color: AN_COLORS.amber }], { yFormat: anLkrTick });
  const topCust = d.customerStatsList.slice(0, 10);
  anLineChart('an-inc-g3', topCust.map(c => c.name), [{ label: 'Revenue', data: topCust.map(c => c.revenue), color: AN_COLORS.pink }], { yFormat: anLkrTick });
}

// ─────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────
async function calculateExpensesAnalytics(filters) {
  const { start, end, grain } = anResolvePeriodRange(filters.period);
  const startD = new Date(start + 'T00:00:00'), endD = new Date(end + 'T23:59:59');

  const [expEntries, expAmounts] = await Promise.all([DB.getExpenseEntries(), DB.getExpenseAmounts()]);
  const allFlat = Financials.flattenExpenseData(expAmounts, expEntries, analyticsRefData.expenseTypes, analyticsRefData.expenseCategories);

  const flat = allFlat.filter(r => {
    const d = new Date(r.entry_date);
    if (isNaN(d) || d < startD || d > endD) return false;
    if (filters.categoryId !== 'all' && String(r.category_id) !== String(filters.categoryId)) return false;
    if (filters.expenseTypeId !== 'all' && String(r.expense_type_id) !== String(filters.expenseTypeId)) return false;
    return true;
  });

  const byCategory = {};
  flat.forEach(r => { (byCategory[r.category_name] ??= { name: r.category_name, total: 0, count: 0 }); byCategory[r.category_name].total += r.amount; byCategory[r.category_name].count += 1; });
  const byExpense = {};
  flat.forEach(r => { (byExpense[r.expense_name] ??= { name: r.expense_name, category: r.category_name, total: 0 }); byExpense[r.expense_name].total += r.amount; });

  const totalAmount = flat.reduce((s, r) => s + r.amount, 0);
  const topCategories = Object.values(byCategory).sort((a, b) => b.total - a.total).slice(0, 5).map(c => c.name);

  const trend = anBucketRows(flat, r => r.entry_date, grain, start, end,
    () => ({ total: 0, byCategory: {} }),
    (b, r) => { b.total += r.amount; b.byCategory[r.category_name] = (b.byCategory[r.category_name] || 0) + r.amount; });

  let running = 0;
  const cumulative = trend.map(b => { running += b.total; return { key: b.key, label: b.label, cumulative: running }; });

  // Cash-Book-style pivot: category -> its expense types, one totals row.
  const categoriesForPivot = analyticsRefData.expenseCategories.filter(c => filters.categoryId === 'all' || String(c.category_id) === String(filters.categoryId));
  const pivot = categoriesForPivot.map(c => {
    const typesInCat = analyticsRefData.expenseTypes.filter(t => String(t.category_id) === String(c.category_id) && (filters.expenseTypeId === 'all' || String(t.expense_type_id) === String(filters.expenseTypeId)));
    return {
      category: c.name,
      types: typesInCat.map(t => ({ name: t.name, total: byExpense[t.name]?.total || 0 })),
      total: byCategory[c.name]?.total || 0
    };
  }).filter(c => c.types.length > 0);

  return { flat, byCategory, byExpense, totalAmount, topCategories, trend, cumulative };
}

function renderExpensesChart(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Expense Category Breakdown', 'fa-folder', AN_COLORS.blue, 'an-exp-c1')}
    ${anChartCard('Expense by Expense Name', 'fa-receipt', AN_COLORS.purple, 'an-exp-c2')}
    ${anChartCard('Expense Trend Over Time (by Category)', 'fa-chart-column', AN_COLORS.indigo, 'an-exp-c3')}
    ${anChartCard('Expense Category Share', 'fa-chart-pie', AN_COLORS.green, 'an-exp-c4')}
  `;
  const cats = Object.values(d.byCategory).sort((a, b) => b.total - a.total);
  anBarChart('an-exp-c1', cats.map(c => c.name), [{ label: 'Amount (LKR)', data: cats.map(c => c.total), backgroundColor: AN_COLORS.blue }], { yFormat: anLkrTick });

  const exps = Object.values(d.byExpense).sort((a, b) => b.total - a.total);
  anBarChart('an-exp-c2', exps.map(e => e.name), [{ label: 'Amount (LKR)', data: exps.map(e => e.total), backgroundColor: AN_COLORS.purple }], { yFormat: anLkrTick });

  const palette = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
  const stackedDatasets = d.topCategories.map((catName, i) => ({
    label: catName, data: d.trend.map(b => b.byCategory[catName] || 0), backgroundColor: palette[i % palette.length]
  }));
  anBarChart('an-exp-c3', d.trend.map(b => b.label), stackedDatasets, { stacked: true, yFormat: anLkrTick });

  anDonutChart('an-exp-c4', cats.map(c => c.name), cats.map(c => c.total));
}

function renderExpensesTable(d) {
  const view = document.getElementById('an-view');
  const cats = Object.values(d.byCategory).sort((a, b) => b.total - a.total);

  view.innerHTML = `
    ${anTableCard('Category Totals', 'fa-table', AN_COLORS.blue, `
      <table><thead><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${cats.map(c => `<tr><td>${escapeHtml(c.name)}</td><td style="text-align:right;">${formatCurrency(c.total)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:right;">${formatCurrency(d.totalAmount)}</td></tr></tfoot></table>`)}

    ${anTableCard('Expense List', 'fa-list', AN_COLORS.purple, `
      <table><thead><tr><th>Expense ID</th><th>Category</th><th>Expense Name</th><th>Date</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${d.flat.map(r => `<tr><td><span style="font-family:monospace;">${escapeHtml(r.expense_type_id)}</span></td><td>${escapeHtml(r.category_name)}</td><td>${escapeHtml(r.expense_name)}</td><td>${formatDate(r.entry_date)}</td><td>${escapeHtml(r.description || '—')}</td><td style="text-align:right;">${formatCurrency(r.amount)}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td colspan="5">Total</td><td style="text-align:right;">${formatCurrency(d.totalAmount)}</td></tr></tfoot></table>`)}

    ${anTableCard('Category Summary', 'fa-chart-pie', AN_COLORS.green, `
      <table><thead><tr><th>Category</th><th style="text-align:center;">No. of Entries</th><th style="text-align:right;">Total Amount</th><th style="text-align:right;">% of Total</th></tr></thead>
      <tbody>${cats.map(c => `<tr><td>${escapeHtml(c.name)}</td><td style="text-align:center;">${c.count}</td><td style="text-align:right;">${formatCurrency(c.total)}</td><td style="text-align:right;">${d.totalAmount > 0 ? (c.total / d.totalAmount * 100).toFixed(1) : 0}%</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:center;">${cats.reduce((s, c) => s + c.count, 0)}</td><td style="text-align:right;">${formatCurrency(d.totalAmount)}</td><td style="text-align:right;">100%</td></tr></tfoot></table>`)}
  `;
}

function renderExpensesGraph(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Total Expense Fluctuation', 'fa-chart-line', AN_COLORS.red, 'an-exp-g1')}
    ${anChartCard('Category Trend Comparison', 'fa-chart-line', AN_COLORS.indigo, 'an-exp-g2')}
    ${anChartCard('Cumulative Expense Burn', 'fa-fire', AN_COLORS.amber, 'an-exp-g3')}
  `;
  anLineChart('an-exp-g1', d.trend.map(b => b.label), [{ label: 'Expenses', data: d.trend.map(b => b.total), color: AN_COLORS.red }], { yFormat: anLkrTick });

  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const series = d.topCategories.map((catName, i) => ({ label: catName, data: d.trend.map(b => b.byCategory[catName] || 0), color: palette[i % palette.length] }));
  anLineChart('an-exp-g2', d.trend.map(b => b.label), series, { yFormat: anLkrTick, fill: false });

  anLineChart('an-exp-g3', d.cumulative.map(b => b.label), [{ label: 'Cumulative Total', data: d.cumulative.map(b => b.cumulative), color: AN_COLORS.amber }], { yFormat: anLkrTick });
}

// ─────────────────────────────────────────────
// DRIVERS
// ─────────────────────────────────────────────
async function calculateDriversAnalytics(filters) {
  const { start, end, grain } = anResolvePeriodRange(filters.period);
  const startD = new Date(start + 'T00:00:00'), endD = new Date(end + 'T23:59:59');

  const [trips, orders] = await Promise.all([DB.getTrips(), DB.getOrders()]);

  const tripDate = t => t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : null);

  const periodTrips = (trips || []).filter(t => {
    const raw = tripDate(t);
    const d = raw ? new Date(raw + 'T00:00:00') : null;
    if (!d || isNaN(d) || d < startD || d > endD) return false;
    if (filters.driverId !== 'all' && String(t.driver_id) !== String(filters.driverId)) return false;
    return true;
  });

  const statusFilteredDrivers = analyticsRefData.drivers.filter(dr => {
    if (filters.driverId !== 'all' && String(dr.id) !== String(filters.driverId)) return false;
    if (filters.status !== 'all' && (dr.status || 'available').toLowerCase() !== filters.status) return false;
    return true;
  });

  const driverStatsMap = {};
  statusFilteredDrivers.forEach(dr => { driverStatsMap[dr.id] = { id: dr.id, name: dr.name, status: dr.status || 'available', trips: 0, completed: 0, inProgress: 0, distance: 0 }; });
  periodTrips.forEach(t => {
    const st = driverStatsMap[t.driver_id];
    if (!st) return;
    st.trips += 1;
    if (t.status === 'Completed') { st.completed += 1; st.distance += parseFloat(t.distance_km) || 0; } else st.inProgress += 1;
  });
  const driverStatsList = Object.values(driverStatsMap).sort((a, b) => b.distance - a.distance);

  // Orders handled per driver (within period, respecting driver filter, not status).
  const ordersForDrivers = (orders || []).filter(o => {
    const raw = o.pickup_date || o.created_at;
    const d = raw ? new Date(raw) : null;
    if (!d || isNaN(d) || d < startD || d > endD) return false;
    if (filters.driverId !== 'all' && String(o.driver_id) !== String(filters.driverId)) return false;
    return !!o.driver_id;
  });
  const ordersByDriver = {};
  ordersForDrivers.forEach(o => {
    const st = driverStatsMap[o.driver_id];
    const name = st ? st.name : (analyticsRefData.drivers.find(dr => String(dr.id) === String(o.driver_id))?.name || 'Unknown');
    (ordersByDriver[o.driver_id] ??= { name, orders: 0, value: 0 });
    ordersByDriver[o.driver_id].orders += 1;
    ordersByDriver[o.driver_id].value += parseFloat(o.total_amount) || 0;
  });
  const ordersByDriverList = Object.values(ordersByDriver).sort((a, b) => b.value - a.value);

  // Status distribution ignores the status filter itself, but respects the driver filter.
  const statusSource = analyticsRefData.drivers.filter(dr => filters.driverId === 'all' || String(dr.id) === String(filters.driverId));
  const statusCounts = { available: 0, busy: 0, 'off-duty': 0 };
  statusSource.forEach(dr => { const s = (dr.status || 'available').toLowerCase(); statusCounts[s] = (statusCounts[s] || 0) + 1; });

  const trend = anBucketRows(periodTrips, tripDate, grain, start, end,
    () => ({ trips: 0, distance: 0 }),
    (b, t) => { b.trips += 1; if (t.status === 'Completed') b.distance += parseFloat(t.distance_km) || 0; });

  const topDrivers = driverStatsList.slice(0, 5);
  const driverSeries = topDrivers.map(dr => ({
    label: dr.name,
    data: anBucketRows(periodTrips.filter(t => String(t.driver_id) === String(dr.id)), tripDate, grain, start, end,
      () => ({ distance: 0 }), (b, t) => { if (t.status === 'Completed') b.distance += parseFloat(t.distance_km) || 0; })
  }));

  return { driverStatsList, ordersByDriverList, statusCounts, trend, driverSeries, tripLog: periodTrips.slice().sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')) };
}

function renderDriversChart(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Trips Completed per Driver', 'fa-route', AN_COLORS.blue, 'an-drv-c1')}
    ${anChartCard('Distance Travelled per Driver', 'fa-road', AN_COLORS.cyan, 'an-drv-c2')}
    ${anChartCard('Driver Activity Trend', 'fa-chart-column', AN_COLORS.purple, 'an-drv-c3')}
    ${anChartCard('Driver Status Distribution', 'fa-circle-dot', AN_COLORS.green, 'an-drv-c4')}
  `;
  anBarChart('an-drv-c1', d.driverStatsList.map(dr => dr.name), [{ label: 'Trips', data: d.driverStatsList.map(dr => dr.trips), backgroundColor: AN_COLORS.blue }]);
  anBarChart('an-drv-c2', d.driverStatsList.map(dr => dr.name), [{ label: 'Distance (KM)', data: d.driverStatsList.map(dr => dr.distance), backgroundColor: AN_COLORS.cyan }]);
  anBarChart('an-drv-c3', d.trend.map(b => b.label), [{ label: 'Trips', data: d.trend.map(b => b.trips), backgroundColor: AN_COLORS.purple }]);
  anDonutChart('an-drv-c4', ['Available', 'Busy', 'Off Duty'], [d.statusCounts.available, d.statusCounts.busy, d.statusCounts['off-duty']]);
}

function renderDriversTable(d) {
  const view = document.getElementById('an-view');
  const totTrips = d.driverStatsList.reduce((s, dr) => s + dr.trips, 0);
  const totCompleted = d.driverStatsList.reduce((s, dr) => s + dr.completed, 0);
  const totInProgress = d.driverStatsList.reduce((s, dr) => s + dr.inProgress, 0);
  const totDistance = d.driverStatsList.reduce((s, dr) => s + dr.distance, 0);
  const totOrders = d.ordersByDriverList.reduce((s, o) => s + o.orders, 0);
  const totValue = d.ordersByDriverList.reduce((s, o) => s + o.value, 0);
  const statusLabel = { available: 'Available', busy: 'Busy', 'off-duty': 'Off Duty' };

  view.innerHTML = `
    ${anTableCard('Driver Performance', 'fa-id-card', AN_COLORS.blue, `
      <table><thead><tr><th>Driver</th><th style="text-align:center;">Total Trips</th><th style="text-align:center;">Completed</th><th style="text-align:center;">In Progress</th><th style="text-align:right;">Distance (KM)</th><th>Status</th></tr></thead>
      <tbody>${d.driverStatsList.map(dr => `<tr><td>${escapeHtml(dr.name)}</td><td style="text-align:center;">${dr.trips}</td><td style="text-align:center;">${dr.completed}</td><td style="text-align:center;">${dr.inProgress}</td><td style="text-align:right;">${dr.distance.toFixed(1)}</td><td>${statusLabel[(dr.status || 'available').toLowerCase()] || dr.status}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:center;">${totTrips}</td><td style="text-align:center;">${totCompleted}</td><td style="text-align:center;">${totInProgress}</td><td style="text-align:right;">${totDistance.toFixed(1)}</td><td></td></tr></tfoot></table>`)}

    ${anTableCard('Trip Log', 'fa-clipboard-list', AN_COLORS.cyan, `
      <table><thead><tr><th>Trip ID</th><th>Driver</th><th>Vehicle</th><th>Start</th><th>End</th><th style="text-align:right;">Distance (KM)</th><th>Status</th></tr></thead>
      <tbody>${d.tripLog.map(t => `<tr><td><span style="font-family:monospace;">${escapeHtml(t.trip_id)}</span></td><td>${escapeHtml(t.driver_name || '—')}</td><td>${escapeHtml(t.vehicle_no || '—')}</td><td>${formatDate(t.start_date)} ${escapeHtml(t.start_time || '')}</td><td>${t.end_date ? formatDate(t.end_date) + ' ' + escapeHtml(t.end_time || '') : '—'}</td><td style="text-align:right;">${t.distance_km != null ? Number(t.distance_km).toFixed(1) : '—'}</td><td>${escapeHtml(t.status)}</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">No trips</td></tr>'}</tbody></table>`)}

    ${anTableCard('Orders Handled by Driver', 'fa-box', AN_COLORS.purple, `
      <table><thead><tr><th>Driver</th><th style="text-align:center;">Orders Handled</th><th style="text-align:right;">Total Order Value</th></tr></thead>
      <tbody>${d.ordersByDriverList.map(o => `<tr><td>${escapeHtml(o.name)}</td><td style="text-align:center;">${o.orders}</td><td style="text-align:right;">${formatCurrency(o.value)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:center;">${totOrders}</td><td style="text-align:right;">${formatCurrency(totValue)}</td></tr></tfoot></table>`)}
  `;
}

function renderDriversGraph(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Trips Over Time', 'fa-route', AN_COLORS.blue, 'an-drv-g1')}
    ${anChartCard('Distance Travelled Over Time', 'fa-road', AN_COLORS.cyan, 'an-drv-g2')}
    ${anChartCard('Driver Performance Fluctuation', 'fa-chart-line', AN_COLORS.purple, 'an-drv-g3')}
  `;
  anLineChart('an-drv-g1', d.trend.map(b => b.label), [{ label: 'Trips', data: d.trend.map(b => b.trips), color: AN_COLORS.blue }]);
  anLineChart('an-drv-g2', d.trend.map(b => b.label), [{ label: 'Distance (KM)', data: d.trend.map(b => b.distance), color: AN_COLORS.cyan }]);
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const series = d.driverSeries.map((s, i) => ({ label: s.label, data: s.data.map(b => b.distance), color: palette[i % palette.length] }));
  const labels = d.driverSeries[0]?.data.map(b => b.label) || [];
  anLineChart('an-drv-g3', labels, series, { fill: false });
}

// ─────────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────────
async function calculateVehiclesAnalytics(filters) {
  const { start, end, grain } = anResolvePeriodRange(filters.period);
  const startD = new Date(start + 'T00:00:00'), endD = new Date(end + 'T23:59:59');

  const trips = await DB.getTrips();
  const tripDate = t => t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : null);

  const periodTrips = (trips || []).filter(t => {
    const raw = tripDate(t);
    const d = raw ? new Date(raw + 'T00:00:00') : null;
    if (!d || isNaN(d) || d < startD || d > endD) return false;
    if (filters.vehicleId !== 'all' && String(t.vehicle_id) !== String(filters.vehicleId)) return false;
    return true;
  });

  const filteredVehicles = analyticsRefData.vehicles.filter(v => {
    if (filters.vehicleId !== 'all' && String(v.id) !== String(filters.vehicleId)) return false;
    if (filters.category !== 'all' && v.category !== filters.category) return false;
    if (filters.status !== 'all' && (v.status || 'available').toLowerCase() !== filters.status) return false;
    return true;
  });

  const vehicleStatsMap = {};
  filteredVehicles.forEach(v => { vehicleStatsMap[v.id] = { id: v.id, vehicleNo: v.vehicle_no, category: v.category, model: v.model, status: v.status || 'available', trips: 0, distance: 0 }; });
  periodTrips.forEach(t => {
    const st = vehicleStatsMap[t.vehicle_id];
    if (!st) return;
    st.trips += 1;
    if (t.status === 'Completed') st.distance += parseFloat(t.distance_km) || 0;
  });
  const vehicleStatsList = Object.values(vehicleStatsMap).sort((a, b) => b.distance - a.distance);

  // Category breakdown ignores the category filter itself (respects vehicleId/status).
  const categorySource = analyticsRefData.vehicles.filter(v => {
    if (filters.vehicleId !== 'all' && String(v.id) !== String(filters.vehicleId)) return false;
    if (filters.status !== 'all' && (v.status || 'available').toLowerCase() !== filters.status) return false;
    return true;
  });
  const byCategory = {};
  categorySource.forEach(v => { (byCategory[v.category] ??= { category: v.category, count: 0, distance: 0 }); byCategory[v.category].count += 1; });
  periodTrips.forEach(t => {
    const v = categorySource.find(veh => String(veh.id) === String(t.vehicle_id));
    if (!v) return;
    if (t.status === 'Completed') byCategory[v.category].distance += parseFloat(t.distance_km) || 0;
  });
  const categoryList = Object.values(byCategory).sort((a, b) => b.distance - a.distance);

  const statusCounts = { available: 0, busy: 0, maintenance: 0 };
  analyticsRefData.vehicles.filter(v => filters.vehicleId === 'all' || String(v.id) === String(filters.vehicleId))
    .forEach(v => { const s = (v.status || 'available').toLowerCase(); statusCounts[s] = (statusCounts[s] || 0) + 1; });

  const trend = anBucketRows(periodTrips, tripDate, grain, start, end,
    () => ({ trips: 0, distance: 0 }),
    (b, t) => { b.trips += 1; if (t.status === 'Completed') b.distance += parseFloat(t.distance_km) || 0; });

  const topVehicles = vehicleStatsList.slice(0, 5);
  const vehicleSeries = topVehicles.map(v => ({
    label: v.vehicleNo,
    data: anBucketRows(periodTrips.filter(t => String(t.vehicle_id) === String(v.id)), tripDate, grain, start, end,
      () => ({ distance: 0 }), (b, t) => { if (t.status === 'Completed') b.distance += parseFloat(t.distance_km) || 0; })
  }));

  return { vehicleStatsList, categoryList, statusCounts, trend, vehicleSeries, tripLog: periodTrips.slice().sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')) };
}

function renderVehiclesChart(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Distance Travelled per Vehicle', 'fa-road', AN_COLORS.cyan, 'an-veh-c1')}
    ${anChartCard('Trips per Vehicle', 'fa-route', AN_COLORS.blue, 'an-veh-c2')}
    ${anChartCard('Fleet Utilization by Category', 'fa-truck', AN_COLORS.purple, 'an-veh-c3')}
    ${anChartCard('Vehicle Status Distribution', 'fa-circle-dot', AN_COLORS.green, 'an-veh-c4')}
  `;
  anBarChart('an-veh-c1', d.vehicleStatsList.map(v => v.vehicleNo), [{ label: 'Distance (KM)', data: d.vehicleStatsList.map(v => v.distance), backgroundColor: AN_COLORS.cyan }]);
  anBarChart('an-veh-c2', d.vehicleStatsList.map(v => v.vehicleNo), [{ label: 'Trips', data: d.vehicleStatsList.map(v => v.trips), backgroundColor: AN_COLORS.blue }]);
  anBarChart('an-veh-c3', d.categoryList.map(c => c.category), [{ label: 'Distance (KM)', data: d.categoryList.map(c => c.distance), backgroundColor: AN_COLORS.purple }]);
  anDonutChart('an-veh-c4', ['Available', 'Busy / On Trip', 'Maintenance'], [d.statusCounts.available, d.statusCounts.busy, d.statusCounts.maintenance]);
}

function renderVehiclesTable(d) {
  const view = document.getElementById('an-view');
  const totTrips = d.vehicleStatsList.reduce((s, v) => s + v.trips, 0);
  const totDistance = d.vehicleStatsList.reduce((s, v) => s + v.distance, 0);
  const totVehicles = d.categoryList.reduce((s, c) => s + c.count, 0);
  const totCatDistance = d.categoryList.reduce((s, c) => s + c.distance, 0);
  const statusLabel = { available: 'Available', busy: 'Busy / On Trip', maintenance: 'Maintenance' };

  view.innerHTML = `
    ${anTableCard('Vehicle Performance', 'fa-truck', AN_COLORS.cyan, `
      <table><thead><tr><th>Vehicle No</th><th>Category</th><th>Model</th><th style="text-align:center;">Total Trips</th><th style="text-align:right;">Distance (KM)</th><th>Status</th></tr></thead>
      <tbody>${d.vehicleStatsList.map(v => `<tr><td><span style="font-family:monospace;">${escapeHtml(v.vehicleNo)}</span></td><td>${escapeHtml(v.category || '—')}</td><td>${escapeHtml(v.model || '—')}</td><td style="text-align:center;">${v.trips}</td><td style="text-align:right;">${v.distance.toFixed(1)}</td><td>${statusLabel[(v.status || 'available').toLowerCase()] || v.status}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td colspan="3">Total</td><td style="text-align:center;">${totTrips}</td><td style="text-align:right;">${totDistance.toFixed(1)}</td><td></td></tr></tfoot></table>`)}

    ${anTableCard('Trip Log', 'fa-clipboard-list', AN_COLORS.blue, `
      <table><thead><tr><th>Trip ID</th><th>Vehicle No</th><th>Driver</th><th>Start</th><th>End</th><th style="text-align:right;">Distance (KM)</th><th>Status</th></tr></thead>
      <tbody>${d.tripLog.map(t => `<tr><td><span style="font-family:monospace;">${escapeHtml(t.trip_id)}</span></td><td>${escapeHtml(t.vehicle_no || '—')}</td><td>${escapeHtml(t.driver_name || '—')}</td><td>${formatDate(t.start_date)} ${escapeHtml(t.start_time || '')}</td><td>${t.end_date ? formatDate(t.end_date) + ' ' + escapeHtml(t.end_time || '') : '—'}</td><td style="text-align:right;">${t.distance_km != null ? Number(t.distance_km).toFixed(1) : '—'}</td><td>${escapeHtml(t.status)}</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">No trips</td></tr>'}</tbody></table>`)}

    ${anTableCard('Category Summary', 'fa-tags', AN_COLORS.purple, `
      <table><thead><tr><th>Category</th><th style="text-align:center;">No. of Vehicles</th><th style="text-align:right;">Total Distance (KM)</th><th style="text-align:right;">Avg. Distance / Vehicle</th></tr></thead>
      <tbody>${d.categoryList.map(c => `<tr><td>${escapeHtml(c.category)}</td><td style="text-align:center;">${c.count}</td><td style="text-align:right;">${c.distance.toFixed(1)}</td><td style="text-align:right;">${(c.count > 0 ? c.distance / c.count : 0).toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:center;">${totVehicles}</td><td style="text-align:right;">${totCatDistance.toFixed(1)}</td><td></td></tr></tfoot></table>`)}
  `;
}

function renderVehiclesGraph(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Distance Travelled Over Time', 'fa-road', AN_COLORS.cyan, 'an-veh-g1')}
    ${anChartCard('Trips Over Time', 'fa-route', AN_COLORS.blue, 'an-veh-g2')}
    ${anChartCard('Vehicle Performance Fluctuation', 'fa-chart-line', AN_COLORS.purple, 'an-veh-g3')}
  `;
  anLineChart('an-veh-g1', d.trend.map(b => b.label), [{ label: 'Distance (KM)', data: d.trend.map(b => b.distance), color: AN_COLORS.cyan }]);
  anLineChart('an-veh-g2', d.trend.map(b => b.label), [{ label: 'Trips', data: d.trend.map(b => b.trips), color: AN_COLORS.blue }]);
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const series = d.vehicleSeries.map((s, i) => ({ label: s.label, data: s.data.map(b => b.distance), color: palette[i % palette.length] }));
  const labels = d.vehicleSeries[0]?.data.map(b => b.label) || [];
  anLineChart('an-veh-g3', labels, series, { fill: false });
}

// ─────────────────────────────────────────────
// ITEMS
// ─────────────────────────────────────────────
async function calculateItemsAnalytics(filters) {
  const { start, end, grain } = anResolvePeriodRange(filters.period);
  const startD = new Date(start + 'T00:00:00'), endD = new Date(end + 'T23:59:59');

  const [orders, orderItems] = await Promise.all([DB.getOrders(), DB.getAllOrderItems()]);
  const orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]));
  const oiDate = oi => { const o = orderMap[oi.order_id]; return o ? (o.pickup_date || o.created_at) : null; };

  const filteredOI = (orderItems || []).filter(oi => {
    const raw = oiDate(oi);
    const d = raw ? new Date(raw) : null;
    if (!d || isNaN(d) || d < startD || d > endD) return false;
    if (filters.itemId !== 'all' && String(oi.catalog_item_id) !== String(filters.itemId)) return false;
    if (filters.serviceType !== 'all' && oi.service_type !== filters.serviceType) return false;
    return true;
  });

  const itemMap = {};
  filteredOI.forEach(oi => {
    const catItem = analyticsRefData.items.find(it => String(it.id) === String(oi.catalog_item_id));
    const code = catItem ? catItem.item_id : 'MISC';
    const name = oi.item_name || (catItem ? catItem.item_name : 'Laundry Service');
    const qty = parseInt(oi.quantity, 10);
    const q = isNaN(qty) ? 1 : qty;
    const rev = parseFloat(oi.subtotal) || (parseFloat(oi.price) || 0) * q;
    const key = code + '||' + name;
    (itemMap[key] ??= { code, name, qty: 0, revenue: 0 });
    itemMap[key].qty += q;
    itemMap[key].revenue += rev;
  });
  const itemStatsList = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);

  const byService = {};
  filteredOI.forEach(oi => {
    const svc = oi.service_type || 'Unspecified';
    const qty = parseInt(oi.quantity, 10);
    const q = isNaN(qty) ? 1 : qty;
    const rev = parseFloat(oi.subtotal) || (parseFloat(oi.price) || 0) * q;
    (byService[svc] ??= { service: svc, qty: 0, revenue: 0 });
    byService[svc].qty += q;
    byService[svc].revenue += rev;
  });
  const serviceList = Object.values(byService).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = itemStatsList.reduce((s, i) => s + i.revenue, 0);

  const catalogItems = analyticsRefData.items.filter(it => filters.itemId === 'all' || String(it.id) === String(filters.itemId));

  const trend = anBucketRows(filteredOI, oiDate, grain, start, end,
    () => ({ revenue: 0, qty: 0 }),
    (b, oi) => { const qty = parseInt(oi.quantity, 10); const q = isNaN(qty) ? 1 : qty; b.qty += q; b.revenue += parseFloat(oi.subtotal) || (parseFloat(oi.price) || 0) * q; });

  const topItems = itemStatsList.slice(0, 5);
  const itemSeries = topItems.map(it => ({
    label: it.name,
    data: anBucketRows(filteredOI.filter(oi => (oi.item_name || '') + (analyticsRefData.items.find(x => String(x.id) === String(oi.catalog_item_id))?.item_id || 'MISC') === it.name + it.code), oiDate, grain, start, end,
      () => ({ revenue: 0 }), (b, oi) => { const qty = parseInt(oi.quantity, 10); const q = isNaN(qty) ? 1 : qty; b.revenue += parseFloat(oi.subtotal) || (parseFloat(oi.price) || 0) * q; })
  }));

  return { itemStatsList, serviceList, totalRevenue, catalogItems, trend, itemSeries };
}

function renderItemsChart(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Top Selling Items by Revenue', 'fa-list-check', AN_COLORS.blue, 'an-itm-c1')}
    ${anChartCard('Top Selling Items by Volume', 'fa-boxes-stacked', AN_COLORS.cyan, 'an-itm-c2')}
    ${anChartCard('Revenue by Service Type', 'fa-soap', AN_COLORS.purple, 'an-itm-c3')}
    ${anChartCard('Item Price Comparison', 'fa-tags', AN_COLORS.amber, 'an-itm-c4')}
  `;
  const topRev = d.itemStatsList.slice(0, 10);
  anBarChart('an-itm-c1', topRev.map(i => i.name), [{ label: 'Revenue (LKR)', data: topRev.map(i => i.revenue), backgroundColor: AN_COLORS.blue }], { yFormat: anLkrTick });

  const topQty = d.itemStatsList.slice().sort((a, b) => b.qty - a.qty).slice(0, 10);
  anBarChart('an-itm-c2', topQty.map(i => i.name), [{ label: 'Qty Sold', data: topQty.map(i => i.qty), backgroundColor: AN_COLORS.cyan }]);

  anBarChart('an-itm-c3', d.serviceList.map(s => s.service), [{ label: 'Revenue (LKR)', data: d.serviceList.map(s => s.revenue), backgroundColor: AN_COLORS.purple }], { yFormat: anLkrTick });

  anBarChart('an-itm-c4', d.catalogItems.map(it => it.item_name), [
    { label: 'Dry Clean', data: d.catalogItems.map(it => it.dry_clean_price || 0), backgroundColor: AN_COLORS.purple },
    { label: 'Wash & Press', data: d.catalogItems.map(it => it.wash_press_price || 0), backgroundColor: AN_COLORS.cyan },
    { label: 'Wash & Dry', data: d.catalogItems.map(it => it.wash_dry_price || 0), backgroundColor: AN_COLORS.green }
  ], { yFormat: anLkrTick });
}

function renderItemsTable(d) {
  const view = document.getElementById('an-view');
  const totQty = d.itemStatsList.reduce((s, i) => s + i.qty, 0);
  const totRev = d.itemStatsList.reduce((s, i) => s + i.revenue, 0);
  const totSvcQty = d.serviceList.reduce((s, x) => s + x.qty, 0);
  const totSvcRev = d.serviceList.reduce((s, x) => s + x.revenue, 0);

  view.innerHTML = `
    ${anTableCard('Item Sales', 'fa-list-check', AN_COLORS.blue, `
      <table><thead><tr><th>Item ID</th><th>Item Name</th><th style="text-align:center;">Qty Sold</th><th style="text-align:right;">Revenue</th></tr></thead>
      <tbody>${d.itemStatsList.map(i => `<tr><td><span style="font-family:monospace;">${escapeHtml(i.code)}</span></td><td>${escapeHtml(i.name)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${formatCurrency(i.revenue)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td colspan="2">Total</td><td style="text-align:center;">${totQty}</td><td style="text-align:right;">${formatCurrency(totRev)}</td></tr></tfoot></table>`)}

    ${anTableCard('Service Type Breakdown', 'fa-soap', AN_COLORS.purple, `
      <table><thead><tr><th>Service Type</th><th style="text-align:center;">Qty Sold</th><th style="text-align:right;">Revenue</th><th style="text-align:right;">% of Total</th></tr></thead>
      <tbody>${d.serviceList.map(s => `<tr><td>${escapeHtml(s.service)}</td><td style="text-align:center;">${s.qty}</td><td style="text-align:right;">${formatCurrency(s.revenue)}</td><td style="text-align:right;">${d.totalRevenue > 0 ? (s.revenue / d.totalRevenue * 100).toFixed(1) : 0}%</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td style="text-align:center;">${totSvcQty}</td><td style="text-align:right;">${formatCurrency(totSvcRev)}</td><td style="text-align:right;">100%</td></tr></tfoot></table>`)}

    ${anTableCard('Item Catalog Prices', 'fa-tags', AN_COLORS.amber, `
      <table><thead><tr><th>Item ID</th><th>Item Name</th><th style="text-align:right;">Dry Clean</th><th style="text-align:right;">Wash & Press</th><th style="text-align:right;">Wash & Dry</th></tr></thead>
      <tbody>${d.catalogItems.map(it => `<tr><td><span style="font-family:monospace;">${escapeHtml(it.item_id)}</span></td><td>${escapeHtml(it.item_name)}</td><td style="text-align:right;">${formatCurrency(it.dry_clean_price || 0)}</td><td style="text-align:right;">${formatCurrency(it.wash_press_price || 0)}</td><td style="text-align:right;">${formatCurrency(it.wash_dry_price || 0)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">No items</td></tr>'}</tbody></table>`)}
  `;
}

function renderItemsGraph(d) {
  const view = document.getElementById('an-view');
  view.innerHTML = `
    ${anChartCard('Revenue Trend', 'fa-chart-line', AN_COLORS.blue, 'an-itm-g1')}
    ${anChartCard('Quantity Sold Trend', 'fa-chart-line', AN_COLORS.cyan, 'an-itm-g2')}
    ${anChartCard('Item Performance Fluctuation', 'fa-chart-line', AN_COLORS.pink, 'an-itm-g3')}
  `;
  anLineChart('an-itm-g1', d.trend.map(b => b.label), [{ label: 'Revenue', data: d.trend.map(b => b.revenue), color: AN_COLORS.blue }], { yFormat: anLkrTick });
  anLineChart('an-itm-g2', d.trend.map(b => b.label), [{ label: 'Qty Sold', data: d.trend.map(b => b.qty), color: AN_COLORS.cyan }]);
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const series = d.itemSeries.map((s, i) => ({ label: s.label, data: s.data.map(b => b.revenue), color: palette[i % palette.length] }));
  const labels = d.itemSeries[0]?.data.map(b => b.label) || [];
  anLineChart('an-itm-g3', labels, series, { fill: false, yFormat: anLkrTick });
}
