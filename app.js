// app.js - Main Application

let currentPage = 'dashboard';
let dashCharts  = {};
let showUndoButtonSetting = 'true';

// ─────────────────────────────────────────────
// AUTH — role-based login
// ─────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) return toast('Enter username and password', 'error');

  try {
    // Ensure default users exist (in case DB is fresh or migrated)
    await DB.ensureDefaultUsers();

    const user = await DB.validateLogin(username, password);
    if (!user) return toast('Invalid username or password', 'error');

    currentUser = { id: user.id, username: user.username, role: user.role, display_name: user.display_name || user.username };
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    await DB.logAction('User Login', `User "${currentUser.display_name}" logged in successfully`, { username: user.username, role: user.role }, 'User');

    // Update topbar role chip
    const roleNames = { admin: 'Admin', user: 'User', driver: 'Driver' };
    const avatar = document.getElementById('topbar-avatar');
    if (avatar) {
      const roleText = roleNames[currentUser.role] || 'User';
      avatar.textContent = roleText;
      avatar.title       = `${currentUser.display_name} (${roleText})`;
    }
    updateRoleChip();
    initApp();
    setTimeout(initGlobalSearch,300);
  } catch (err) {
    console.error('Login error:', err);
    toast('Database error: ' + (err.message || err), 'error');
  }
}

document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function updateRoleChip() {
  const footer = document.getElementById('sidebar-user-info');
  if (footer) footer.innerHTML = ''; // Removed from bottom of navigation bar per user request

  const avatar = document.getElementById('topbar-avatar');
  if (avatar && currentUser) {
    const roleNames = { admin: 'Admin', user: 'User', driver: 'Driver' };
    const roleText = roleNames[currentUser.role] || 'User';
    avatar.textContent = roleText;
    avatar.title       = `${currentUser.display_name} (${roleText})`;
  }
  applyRoleSidebarRestrictions();
}

// ─────────────────────────────────────────────
// ROLE-BASED ACCESS CONTROL (RBAC) HELPERS
// ─────────────────────────────────────────────
function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isStaffUser() { return currentUser && currentUser.role === 'user'; }
function isDriver() { return currentUser && currentUser.role === 'driver'; }

function getRoleAllowedPages() {
  if (isAdmin()) {
    return ['dashboard', 'orders', 'customers', 'drivers', 'transport', 'paynow', 'invoices', 'deductions', 'items', 'expenses', 'analytics', 'reports', 'recent-actions', 'settings'];
  }
  if (isStaffUser()) {
    return ['dashboard', 'orders', 'customers', 'drivers', 'transport', 'paynow', 'deductions', 'items', 'expenses', 'settings'];
  }
  if (isDriver()) {
    return ['transport', 'customers', 'orders', 'settings'];
  }
  return ['dashboard', 'settings'];
}

function canDelete() { return isAdmin(); }
function canAddOrders() { return isAdmin() || isStaffUser(); }
function canEditOrders() { return isAdmin() || isStaffUser(); }
function canEditCustomers() { return true; } // Admin, Staff User, Driver all can add/edit customers
function canEditDrivers() { return isAdmin() || isStaffUser(); }
function canEditTransport() { return isAdmin() || isDriver(); }
function canEditPayNow() { return isAdmin() || isStaffUser(); }
function canEditItems() { return isAdmin() || isStaffUser(); }
function canEditExpenses() { return isAdmin() || isStaffUser(); }
function canUseQuotation() { return isAdmin(); }
function canPrintCatalogue() { return isAdmin(); }
function canBackupRestore() { return isAdmin(); }

function applyRoleSidebarRestrictions() {
  if (!currentUser) return;
  const allowed = getRoleAllowedPages();

  document.querySelectorAll('nav.sidebar-nav a').forEach(a => {
    const page = a.dataset.page;
    a.style.display = allowed.includes(page) ? 'flex' : 'none';
  });

  if (!allowed.includes(currentPage)) {
    const defaultPage = isDriver() ? 'transport' : 'dashboard';
    navigate(defaultPage);
  }
}

function doLogout() {
  confirmDialog('Are you sure you want to logout?', async () => {
    if (currentUser) {
      await DB.logAction('User Logout', `User "${currentUser.display_name}" logged out`, { username: currentUser.username }, 'User');
    }
    currentUser = null;
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('app').style.display    = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  });
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function initApp() {
  await DB.seedDemoData();
  await applySettings();
  updateTopbarDate();
  setInterval(updateTopbarDate, 60000);
  if (isDriver()) {
    navigate('transport');
  } else {
    navigate('dashboard');
  }
}

function updateTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

async function applySettings() {
  const darkMode    = await DB.getSetting('dark_mode');
  const textSize    = await DB.getSetting('text_size');
  const logoData    = await DB.getSetting('logo_data');
  const companyName = await DB.getSetting('company_name');
  const showUndo    = await DB.getSetting('show_undo_button');
  const showAiBtn   = await DB.getSetting('show_saga_ai_button');
  showUndoButtonSetting = showUndo !== 'false' ? 'true' : 'false';

  // Toggle SAGA AI floating drawer button
  const fab = document.getElementById('gemini-fab');
  const drawer = document.getElementById('gemini-drawer');
  if (showAiBtn === 'false') {
    if (fab) fab.style.display = 'none';
    if (drawer) drawer.style.display = 'none';
  } else {
    if (fab) fab.style.display = 'flex';
  }

  if (darkMode === 'true') {
    document.documentElement.classList.add('dark');
    const icon = document.getElementById('dark-icon');
    if (icon) icon.className = 'fas fa-sun';
  } else {
    document.documentElement.classList.remove('dark');
    const icon = document.getElementById('dark-icon');
    if (icon) icon.className = 'fas fa-moon';
  }

  if (textSize) {
    document.body.classList.remove('text-size-sm', 'text-size-md', 'text-size-lg');
    document.body.classList.add(`text-size-${textSize}`);
  }

  if (companyName) {
    const el = document.getElementById('sidebar-company-name');
    if (el) el.innerHTML = companyName.replace(' ', '<br/>');
  }

  if (logoData && typeof updateLogo === 'function') {
    updateLogo(logoData);
  }
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function navigate(page) {
  const allowed = getRoleAllowedPages();
  if (!allowed.includes(page)) {
    page = isDriver() ? 'transport' : 'dashboard';
  }
  currentPage = page;
  Object.values(dashCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  dashCharts = {};

  document.querySelectorAll('nav.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  const titles = {
    dashboard: 'Dashboard', customers: 'Customers', drivers: 'Drivers', transport: 'Transport & Trip Management',
    orders: 'Orders', paynow: 'Pay Now', invoices: 'Invoices', payments: 'Payments',
    items: 'Items', expenses: 'Expenses & Chemical Register', analytics: 'Data Analytics', reports: 'Reports', settings: 'Settings', deductions: 'Deductions',
    'recent-actions': 'Recent Actions'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const pages = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    drivers:   renderDrivers,
    transport: renderTransportPage,
    orders:    renderOrders,
    paynow:    renderPayNow,
    invoices:  renderInvoices,
    payments:  renderInvoices,
    items:     renderItems,
    expenses:  renderExpensesPage,
    analytics: () => { if (!isAdmin()) { navigate('dashboard'); } else { renderAnalytics(); } },
    reports:   () => { if (!requireAdmin()) { navigate('dashboard'); } else { renderReports(); } },
    settings:  renderSettings,
    deductions: renderDeductions,
    'recent-actions': renderRecentActions
  };
  if (pages[page]) pages[page]();
}

function renderExpensesPage() {
  const contentDiv = document.getElementById('content');
  contentDiv.innerHTML = `<div id="page-expenses" class="page-content"></div>`;
  ExpensesModule.init();
}

function renderTransportPage() {
  const contentDiv = document.getElementById('content');
  contentDiv.innerHTML = `<div id="page-transport" class="page-content"></div>`;
  TransportModule.init();
}

function toggleDark() {
  const isDark = document.documentElement.classList.toggle('dark');
  DB.setSetting('dark_mode', isDark ? 'true' : 'false');
  const icon = document.getElementById('dark-icon');
  if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function renderDashboard() {
  document.getElementById('page-title').textContent = 'Dashboard';
  const [orders, invoices, payments] = await Promise.all([DB.getOrders(), DB.getInvoices(), DB.getPayments()]);
  const todayStr = today();

  const todayPickups    = orders.filter(o => o.pickup_date === todayStr).length;
  const curMonth        = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const monthlyGain     = orders.filter(o => (o.created_at || '').startsWith(curMonth)).reduce((s, o) => s + (o.total_amount || 0), 0);
  const pendingPayments = orders.filter(o => o.status === 'Unpaid').length;
  // Total Income — grand total of every bill in the system (all order types, all time)
  const totalIncome     = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

  document.getElementById('content').innerHTML = `
    <div style="margin-bottom:22px;">
      <div style="font-size:0.85em;color:var(--text-muted);">Good ${getGreeting()}, <strong>${currentUser?.display_name || 'User'}</strong></div>
      <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:var(--text);">Welcome to Sagacious Washing Center</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:16px;margin-bottom:24px;">
      ${statCard("Today's Pickups",   todayPickups,                    "fa-truck",          "#3b82f6", "#dbeafe", "Scheduled for today")}
      ${statCard("Pending Payments",  pendingPayments,                 "fa-clock",          "#f59e0b", "#fef9c3", "Awaiting payment")}
      ${statCard("Monthly Income",    formatCurrency(monthlyGain),     "fa-coins",          "#8b5cf6", "#f3e8ff", "All bills this month")}
      ${statCard("Total Income",      formatCurrency(totalIncome),     "fa-money-bill-wave","#06b6d4", "#cffafe", "All bill types")}
    </div>
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;margin-bottom:24px;">
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;">Daily Orders by Status (Last 14 Days)</div>
        <div class="chart-container"><canvas id="revenue-chart"></canvas></div>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;">Order Status Distribution</div>
        <div class="chart-container"><canvas id="status-chart"></canvas></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;"><i class="fas fa-boxes-stacked" style="color:var(--primary);margin-right:8px;"></i>Recent Orders</div>
        <div id="recent-orders-table"></div>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px;" onclick="navigate('orders')">View All <i class="fas fa-arrow-right"></i></button>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;"><i class="fas fa-file-invoice" style="color:var(--primary);margin-right:8px;"></i>Unpaid Invoices</div>
        <div id="unpaid-invoices-table"></div>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px;" onclick="navigate('invoices')">View All <i class="fas fa-arrow-right"></i></button>
      </div>
    </div>`;

  await renderDashCharts(orders, payments);
  await renderRecentOrders(orders);
  await renderUnpaidInvoices(invoices);
}

function statCard(label, value, icon, color, bgColor, sub) {
  return `<div class="stat-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div class="label">${label}</div>
      <div style="background:${bgColor};color:${color};width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <i class="fas ${icon}"></i>
      </div>
    </div>
    <div class="value">${value}</div>
    <div class="sub">${sub}</div>
  </div>`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

// Shared colour per order status — used by both dashboard charts so they stay consistent.
const STATUS_CHART_COLORS = {
  'Paid':             '#22c55e', // green
  'Unpaid':           '#ef4444'  // red
};
function statusChartColor(status) { return STATUS_CHART_COLORS[status] || '#94a3b8'; }

async function renderDashCharts(orders, payments) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  // ── Daily Orders by Status (last 14 days) ──
  // Counts EVERY order type per day (not just paid/revenue) so pickup requests,
  // credit bills, etc. all show up. One stacked bar segment per status.
  const datasets = ORDER_STATUSES.map(status => ({
    label: status,
    data: days.map(d => orders.filter(o => o.status === status && (o.created_at || '').startsWith(d)).length),
    backgroundColor: statusChartColor(status),
    borderColor: statusChartColor(status),
    borderWidth: 1,
    borderRadius: 4,
    stack: 'orders'
  }));

  const rCtx = document.getElementById('revenue-chart')?.getContext('2d');
  if (rCtx) {
    dashCharts.revenue = new Chart(rCtx, {
      type: 'bar',
      data: {
        labels: days.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
        datasets
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: textColor, font: { size: 10 }, boxWidth: 12, padding: 8 } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y} order${c.parsed.y === 1 ? '' : 's'}` } }
        },
        scales: {
          x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, precision: 0, stepSize: 1 } }
        }
      }
    });
  }

  // ── Order Status Distribution (doughnut) — same colours as the bar chart ──
  const statusCounts = {};
  orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const statusLabels = Object.keys(statusCounts);
  const sCtx = document.getElementById('status-chart')?.getContext('2d');
  if (sCtx) {
    dashCharts.status = new Chart(sCtx, {
      type: 'doughnut',
      data: { labels: statusLabels, datasets: [{ data: Object.values(statusCounts), backgroundColor: statusLabels.map(statusChartColor), borderWidth: 2, borderColor: isDark ? '#1e293b' : '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } } } }
    });
  }
}

async function renderRecentOrders(orders) {
  const customers = await DB.getCustomers();
  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const recent = orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  document.getElementById('recent-orders-table').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Batch ID</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          ${recent.map(o => `<tr>
            <td style="font-family:monospace;font-weight:700;font-size:0.85em;">${o.batch_id}</td>
            <td>${getOrderCustomerName(o, cMap)}</td>
            <td>${statusBadge(o.status)}</td>
            <td>${formatCurrency(o.total_amount)}</td>
          </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No orders yet</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function renderUnpaidInvoices(invoices) {
  const [orders, customers] = await Promise.all([DB.getOrders(), DB.getCustomers()]);
  const oMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const unpaid = invoices.filter(i => i.paid_status !== 'Paid').slice(0, 5);
  document.getElementById('unpaid-invoices-table').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Balance</th></tr></thead>
        <tbody>
          ${unpaid.map(inv => {
            const o = oMap[inv.order_id]; const c = o ? cMap[o.customer_id] : null;
            return `<tr>
              <td style="font-weight:700;">${inv.invoice_number}</td>
              <td>${o ? getOrderCustomerName(o, cMap) : '—'}</td>
              <td style="color:var(--danger);font-weight:700;">${formatCurrency(inv.balance)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px;">All paid!</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ─────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────
let custPage = 1, custSearch = '', custPerPage = 12;

async function renderCustomers() {
  document.getElementById('page-title').textContent = 'Customers';
  if (document.getElementById('cust-table-body')) { await _refreshCustomersTable(); return; }
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Hotel Customers</span>
      <div style="display:flex;gap:8px;">
        ${canBackupRestore() ? `
          <button class="btn btn-secondary" onclick="exportCustomers()" title="Export customers to JSON"><i class="fas fa-download"></i> Backup</button>
          <button class="btn btn-secondary" onclick="document.getElementById('cust-import-file').click()" title="Import customers from JSON"><i class="fas fa-upload"></i> Import</button>
          <input type="file" id="cust-import-file" accept=".json" style="display:none" onchange="importCustomers(this)"/>
        ` : ''}
        <button class="btn btn-primary" onclick="showAddCustomerModal()"><i class="fas fa-plus"></i> Add Customer</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:12px;align-items:center;">
        <div class="search-wrap" style="flex:1;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="cust-search-input" placeholder="Search hotel, contact, phone..."
            autocomplete="off" spellcheck="false"
            oninput="custSearch=this.value;custPage=1;_refreshCustomersTable()"/>
        </div>
        <span id="cust-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Hotel Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Since</th><th>Actions</th></tr></thead>
          <tbody id="cust-table-body"></tbody>
        </table>
      </div>
      <div id="cust-pagination" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);"></div>
    </div>`;
  await _refreshCustomersTable();
  document.getElementById('cust-search-input').focus();
}

async function _refreshCustomersTable() {
  const tbody = document.getElementById('cust-table-body');
  if (!tbody) { await renderCustomers(); return; }
  const customers = await DB.getCustomers();
  let filtered = filterData(customers, custSearch, ['hotel_name','contact_person','phone','email']);
  filtered = filtered.sort((a,b) => (a.hotel_name||'').localeCompare(b.hotel_name||''));
  const {items,totalPages,total} = paginateData(filtered, custPage, custPerPage);
  const countEl = document.getElementById('cust-count');
  if(countEl) countEl.textContent = total+' customer'+(total!==1?'s':'');
  tbody.innerHTML = items.length===0
    ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No customers</td></tr>`
    : items.map(c => `<tr>
        <td><strong>${c.hotel_name}</strong></td>
        <td>${c.contact_person||'—'}</td>
        <td>${c.phone||'—'}</td>
        <td>${c.email||'—'}</td>
        <td>${formatDate(c.created_date)}</td>
        <td><div style="display:flex;gap:5px;">
          <button class="btn btn-sm" onclick="showCustomerProfileModal(${c.id})" title="Profile & Custom Prices" style="background:#8b5cf6; border-color:#7c3aed; color:#fff;"><i class="fas fa-tags"></i></button>
          <button class="btn btn-primary btn-sm" onclick="showEditCustomerModal(${c.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-secondary btn-sm" onclick="viewCustomerOrders(${c.id})"><i class="fas fa-boxes-stacked"></i></button>
          ${isAdmin() ? `<button class="btn btn-success btn-sm" onclick="printCustomerSalesSummary(${c.id})" style="background:#10b981; border-color:#10b981; font-weight:600;"><i class="fas fa-file-pdf"></i> SUMMARY</button>` : ''}
          ${canDelete() ? `<button class="btn btn-danger btn-sm" onclick="deleteCustomerConfirm(${c.id})"><i class="fas fa-trash"></i></button>` : ''}
        </div></td>
      </tr>`).join('');
  const pg=document.getElementById('cust-pagination');
  if(pg) pg.innerHTML=`<span style="font-size:0.82em;color:var(--text-muted);">Page ${custPage} of ${totalPages}</span>`+renderPagination(custPage,totalPages,'changeCustPage');
}

function changeCustPage(p) { custPage=p; _refreshCustomersTable(); }

function showAddCustomerModal() {
  createModal('add-cust-modal','Add Hotel Customer',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Hotel Name *</label>
        <input class="form-input" id="c-hotel" placeholder="Grand Hotel Colombo" maxlength="100"/></div>
      <div class="form-group"><label class="form-label">Contact Person</label>
        <input class="form-input" id="c-contact" placeholder="Mr. Perera" maxlength="80"/></div>
      <div class="form-group"><label class="form-label">Phone <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
        <input class="form-input" id="c-phone" placeholder="0771234567" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address</label>
        <input class="form-input" id="c-address" placeholder="123 Galle Road, Colombo 03" maxlength="200"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Email</label>
        <input class="form-input" id="c-email" type="email" placeholder="laundry@hotel.lk" maxlength="100"/></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('add-cust-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewCustomer()"><i class="fas fa-save"></i> Save</button>
    </div>`);
  showModal('add-cust-modal');
}
async function saveNewCustomer() {
  const hotel_name = document.getElementById('c-hotel').value.trim();
  const phone      = document.getElementById('c-phone').value.trim();
  const contact    = document.getElementById('c-contact').value.trim();
  const address    = document.getElementById('c-address').value.trim();
  const email      = document.getElementById('c-email').value.trim();
  if (!hotel_name) return toast('Hotel name required','error');
  if (phone && (phone.length !== 10 || !/^\d{10}$/.test(phone))) return toast('Phone must be exactly 10 digits','error');
  if (phone) {
    const all = await DB.getCustomers();
    const dup = all.find(c => c.phone && c.phone === phone);
    if (dup) return toast(`Phone ${phone} is already used by "${dup.hotel_name}"`, 'error');
  }
  const custId = await DB.addCustomer({hotel_name,contact_person:contact,phone,address,email});
  await DB.logAction(
    'Add Customer',
    `Added new customer "${hotel_name}" (Phone: ${phone || 'N/A'}, Contact: ${contact || 'N/A'})`,
    { id: custId, hotel_name, phone, contact_person: contact, address, email },
    'Customer'
  );
  hideModal('add-cust-modal'); toast('Customer added!'); renderCustomers();
}
async function showEditCustomerModal(id) {
  const c = await DB.getCustomer(id); if(!c) return;
  createModal('edit-cust-modal','Edit Customer',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Hotel Name *</label>
        <input class="form-input" id="ec-hotel" value="${c.hotel_name||''}" maxlength="100"/></div>
      <div class="form-group"><label class="form-label">Contact Person</label>
        <input class="form-input" id="ec-contact" value="${c.contact_person||''}" maxlength="80"/></div>
      <div class="form-group"><label class="form-label">Phone <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
        <input class="form-input" id="ec-phone" value="${c.phone||''}" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address</label>
        <input class="form-input" id="ec-address" value="${c.address||''}" maxlength="200"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Email</label>
        <input class="form-input" id="ec-email" value="${c.email||''}" maxlength="100"/></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('edit-cust-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditCustomer(${id})"><i class="fas fa-save"></i> Save</button>
    </div>`);
  showModal('edit-cust-modal');
}
async function saveEditCustomer(id) {
  const hotel_name = document.getElementById('ec-hotel').value.trim();
  const phone      = document.getElementById('ec-phone').value.trim();
  const contact    = document.getElementById('ec-contact').value.trim();
  const address    = document.getElementById('ec-address').value.trim();
  const email      = document.getElementById('ec-email').value.trim();
  if (!hotel_name) return toast('Hotel name required','error');
  if (phone && (phone.length !== 10 || !/^\d{10}$/.test(phone))) return toast('Phone must be exactly 10 digits','error');

  const oldCust = await DB.getCustomer(id);

  if (phone) {
    const all = await DB.getCustomers();
    const dup = all.find(c => c.phone && c.phone === phone && String(c.id) !== String(id));
    if (dup) return toast(`Phone ${phone} is already used by "${dup.hotel_name}"`, 'error');
  }

  await DB.updateCustomer(id,{hotel_name,contact_person:contact,phone,address,email});

  const oldPhone = oldCust ? (oldCust.phone || '') : '';
  if (oldPhone !== phone) {
    await DB.logAction(
      'Phone Number Change',
      `Changed phone number for customer "${hotel_name}" from "${oldPhone || 'None'}" to "${phone || 'None'}"`,
      { id, hotel_name, old_phone: oldPhone, new_phone: phone, contact_person: contact },
      'Customer'
    );
  } else {
    await DB.logAction(
      'Edit Customer',
      `Updated profile details for customer "${hotel_name}"`,
      { id, hotel_name, phone, contact_person: contact, address, email },
      'Customer'
    );
  }

  hideModal('edit-cust-modal'); toast('Customer updated!'); renderCustomers();
}
async function deleteCustomerConfirm(id) {
  if (!canDelete()) return toast('Admin permission required to delete customers', 'error');
  const cust = await DB.getCustomer(id);
  const custName = cust ? cust.hotel_name : 'Customer #' + id;
  const custPhone = cust ? cust.phone : '';
  confirmDialog('Delete this customer? (Their past orders will remain in the system)', async () => {
    try {
      await DB.deleteCustomer(id);
      await DB.logAction(
        'Delete Customer',
        `Deleted customer "${custName}" (Phone: ${custPhone || 'N/A'})`,
        { id, hotel_name: custName, phone: custPhone },
        'Customer'
      );
      toast('Customer deleted successfully');
      renderCustomers();
    } catch (err) {
      console.error('Delete customer error:', err);
      toast('Error deleting customer: ' + (err.message || err), 'error');
    }
  });
}
async function viewCustomerOrders(customerId) {
  const [customer, orders] = await Promise.all([DB.getCustomer(customerId), DB.getOrdersByCustomer(customerId)]);
  createModal('cust-orders-modal',`Orders: ${customer?.hotel_name}`,`
    <div class="table-wrap"><table>
      <thead><tr><th>Batch ID</th><th>Status</th><th>Total</th><th>Date</th><th></th></tr></thead>
      <tbody>
        ${orders.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(o=>`<tr>
          <td><strong>${o.batch_id}</strong></td><td>${statusBadge(o.status)}</td>
          <td>${formatCurrency(o.total_amount)}</td><td>${formatDate(o.created_at)}</td>
          <td><button class="btn btn-primary btn-sm" onclick="hideModal('cust-orders-modal');navigate('orders');setTimeout(()=>viewOrderDetails(${o.id}),200)"><i class="fas fa-eye"></i></button></td>
        </tr>`).join('')||`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No orders</td></tr>`}
      </tbody>
    </table></div>
    <div style="margin-top:12px;text-align:right;"><button class="btn btn-secondary" onclick="hideModal('cust-orders-modal')">Close</button></div>`);
  showModal('cust-orders-modal');
}

async function printCustomerSalesSummary(customerId) {
  try {
    const [customer, orders] = await Promise.all([
      DB.getCustomer(customerId),
      DB.getOrdersByCustomer(customerId)
    ]);
    if (!customer) return toast('Customer not found', 'error');

    const settings = {
      company_name:   await DB.getSetting('company_name')||'Sagacious Washing Center',
      address:        await DB.getSetting('address')||'',
      phone:          await DB.getSetting('phone')||'',
      email:          await DB.getSetting('email')||'',
      footer_message: await DB.getSetting('footer_message')||''
    };
    const logoData = await DB.getSetting('logo_data');

    const totalAmount = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const logoHTML = logoData
      ? `<img src="${logoData}" style="height:64px;width:64px;object-fit:cover;border-radius:12px;"/>`
      : `<div style="height:64px;width:64px;border-radius:12px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;">SW</div>`;

    const sortedOrders = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const rowsHTML = sortedOrders.map((o, idx) => `
      <tr style="${idx % 2 === 1 ? 'background:#fafafa;' : ''}">
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${formatDate(o.created_at)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${customer.hotel_name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${o.batch_id || '—'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">${formatCurrency(o.total_amount || 0)}</td>
      </tr>
    `).join('');

    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Sales Summary - ${customer.hotel_name}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;}
        @media print{body{margin:0;}@page{margin:12mm 10mm;size:A4;}}
      </style>
      </head><body>
      <div style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:40px 44px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
          <div style="display:flex;align-items:center;gap:14px;">
            ${logoHTML}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
              ${settings.address?`<div style="font-size:0.85em;color:#64748b;margin-top:4px;">${settings.address}</div>`:''}
              <div style="font-size:0.85em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join(' | ')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:2em;font-weight:700;color:#1a4d8f;font-family:'Playfair Display',serif;">SALES SUMMARY</div>
            <div style="font-size:0.85em;color:#64748b;margin-top:6px;">Date Generated: ${formatDate(new Date())}</div>
          </div>
        </div>
        <!-- Customer Info -->
        <div style="background:#f8fafc;padding:16px;border-radius:10px;margin-bottom:24px;max-width:400px;">
          <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Customer Information</div>
          <div style="font-weight:700;font-size:1.05em;">${customer.hotel_name}</div>
          <div style="color:#64748b;font-size:0.9em;margin-top:4px;">${customer.address || ''}</div>
          <div style="color:#64748b;font-size:0.9em;">Contact: ${customer.contact_person || '—'}</div>
          <div style="color:#64748b;font-size:0.9em;">Phone: ${customer.phone || '—'}</div>
          <div style="color:#64748b;font-size:0.9em;">Email: ${customer.email || '—'}</div>
        </div>
        <!-- Sales Table -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <thead><tr style="background:#1a4d8f;color:#fff;">
            <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Customer name</th>
            <th style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;">Order number</th>
            <th style="padding:10px 12px;text-align:right;font-size:0.82em;text-transform:uppercase;">Amount</th>
          </tr></thead>
          <tbody>
            ${rowsHTML || `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No sales records found</td></tr>`}
            <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #e2e8f0;">
              <td style="padding:12px;font-size:1em;text-transform:uppercase;">Total</td>
              <td style="padding:12px;"></td>
              <td style="padding:12px;"></td>
              <td style="padding:12px;text-align:right;font-size:1.1em;color:#1a4d8f;">${formatCurrency(totalAmount)}</td>
            </tr>
          </tbody>
        </table>
        ${settings.footer_message?`<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;font-size:0.9em;color:#64748b;font-style:italic;">${settings.footer_message}</div>`:''}
        <div style="margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;">
          <div style="text-align:center;min-width:180px;">
            <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
            <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Issued By:-</div>
          </div>
          <div style="text-align:center;min-width:180px;">
            <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
            <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Checked By:-</div>
          </div>
        </div>
      </div>
      <script>document.fonts.ready.then(()=>window.print());<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return toast('Please allow pop-ups to print', 'warning');
    w.document.write(printHTML);
    w.document.close();
  } catch (err) {
    toast('Failed to generate summary: ' + (err.message || err), 'error');
  }
}

// ─────────────────────────────────────────────
// DRIVERS
// ─────────────────────────────────────────────
let drvPage = 1, drvSearch = '';

async function renderDrivers() {
  document.getElementById('page-title').textContent = 'Drivers';
  if (document.getElementById('drv-grid')) { await _refreshDriversGrid(); return; }
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Drivers</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="exportDrivers()" title="Export drivers to JSON"><i class="fas fa-download"></i> Backup</button>
        <button class="btn btn-secondary" onclick="document.getElementById('drv-import-file').click()" title="Import drivers from JSON"><i class="fas fa-upload"></i> Import</button>
        <input type="file" id="drv-import-file" accept=".json" style="display:none" onchange="importDrivers(this)"/>
        <button class="btn btn-primary" onclick="showAddDriverModal()"><i class="fas fa-plus"></i> Add Driver</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <div class="search-wrap" style="max-width:360px;">
        <i class="fas fa-search"></i>
        <input class="form-input" id="drv-search-input" placeholder="Search name, phone, vehicle..."
          autocomplete="off" spellcheck="false"
          oninput="drvSearch=this.value;drvPage=1;_refreshDriversGrid()"/>
      </div>
    </div>
    <div id="drv-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;"></div>
    <div id="drv-pagination" style="margin-top:16px;display:flex;justify-content:flex-end;"></div>`;
  await _refreshDriversGrid();
  document.getElementById('drv-search-input').focus();
}

async function _refreshDriversGrid() {
  const grid = document.getElementById('drv-grid');
  if (!grid) { await renderDrivers(); return; }
  const drivers = await DB.getDrivers();
  let filtered = filterData(drivers, drvSearch, ['name','phone','vehicle']);
  const {items,totalPages} = paginateData(filtered, drvPage, 10);
  grid.innerHTML = items.map(d=>driverCard(d)).join('')
    || `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No drivers found</div>`;
  const pg=document.getElementById('drv-pagination');
  if(pg) pg.innerHTML=renderPagination(drvPage,totalPages,'changeDrvPage');
}

function changeDrvPage(p) { drvPage=p; _refreshDriversGrid(); }

function driverCard(d) {
  const sc = d.status==='available'?'badge-green':d.status==='on-trip'?'badge-yellow':'badge-gray';
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
      <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#1a4d8f,#00b4d8);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.3em;font-weight:700;flex-shrink:0;">
        ${d.name.charAt(0)}</div>
      <div><div style="font-weight:700;">${d.name}</div><span class="badge ${sc}">${d.status||'available'}</span></div>
    </div>
    <div style="font-size:0.88em;color:var(--text-muted);margin-bottom:4px;"><i class="fas fa-phone" style="width:16px;"></i> ${d.phone||'—'}</div>
    <div style="font-size:0.88em;color:var(--text-muted);margin-bottom:14px;"><i class="fas fa-car" style="width:16px;"></i> ${d.vehicle||'—'}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary btn-sm" onclick="showEditDriverModal(${d.id})"><i class="fas fa-edit"></i> Edit</button>
      <button class="btn btn-secondary btn-sm" onclick="toggleDriverStatus(${d.id},'${d.status}')"><i class="fas fa-toggle-on"></i> Status</button>
      <button class="btn btn-danger btn-sm" onclick="deleteDriverConfirm(${d.id})"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

function showAddDriverModal() {
  createModal('add-drv-modal','Add Driver',`
    <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="d-name" placeholder="Kamal Rathnayake" maxlength="80"/></div>
    <div class="form-group"><label class="form-label">Phone <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
      <input class="form-input" id="d-phone" placeholder="0771234567" maxlength="10" inputmode="numeric" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"/></div>
    <div class="form-group"><label class="form-label">Vehicle & Plate</label><input class="form-input" id="d-vehicle" placeholder="Toyota Hiace - WP-AB-1234" maxlength="80"/></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-input form-select" id="d-status">
        <option value="available">Available</option><option value="on-trip">On Trip</option><option value="off-duty">Off Duty</option>
      </select></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('add-drv-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewDriver()"><i class="fas fa-save"></i> Save</button>
    </div>`);
  showModal('add-drv-modal');
}
async function saveNewDriver() {
  const name    = document.getElementById('d-name').value.trim();
  const phone   = document.getElementById('d-phone').value.trim();
  const vehicle = document.getElementById('d-vehicle').value.trim();
  const status  = document.getElementById('d-status').value;
  if (!name) return toast('Name required','error');
  if (phone && (phone.length !== 10 || !/^\d{10}$/.test(phone))) return toast('Phone must be exactly 10 digits','error');
  if (phone) {
    const all = await DB.getDrivers();
    const dup = all.find(d => d.phone && d.phone === phone);
    if (dup) return toast(`Phone ${phone} is already used by driver "${dup.name}"`, 'error');
  }
  const drvId = await DB.addDriver({name,phone,vehicle,status});
  await DB.logAction('Add Driver', `Added new driver "${name}" (Vehicle: ${vehicle || 'N/A'}, Phone: ${phone || 'N/A'})`, { id: drvId, name, phone, vehicle, status }, 'Driver');
  hideModal('add-drv-modal'); toast('Driver added!'); renderDrivers();
}
async function showEditDriverModal(id) {
  const d=await DB.getDriver(id); if(!d) return;
  createModal('edit-drv-modal','Edit Driver',`
    <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="ed-name" value="${d.name||''}" maxlength="80"/></div>
    <div class="form-group"><label class="form-label">Phone <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
      <input class="form-input" id="ed-phone" value="${d.phone||''}" maxlength="10" inputmode="numeric" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"/></div>
    <div class="form-group"><label class="form-label">Vehicle & Plate</label><input class="form-input" id="ed-vehicle" value="${d.vehicle||''}" maxlength="80"/></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-input form-select" id="ed-status">
        ${['available','on-trip','off-duty'].map(s=>`<option value="${s}" ${d.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
      </select></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('edit-drv-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditDriver(${id})"><i class="fas fa-save"></i> Save</button>
    </div>`);
  showModal('edit-drv-modal');
}
async function saveEditDriver(id) {
  const name    = document.getElementById('ed-name').value.trim();
  const phone   = document.getElementById('ed-phone').value.trim();
  const vehicle = document.getElementById('ed-vehicle').value.trim();
  const status  = document.getElementById('ed-status').value;
  if (!name) return toast('Name required','error');
  if (phone && (phone.length !== 10 || !/^\d{10}$/.test(phone))) return toast('Phone must be exactly 10 digits','error');
  if (phone) {
    const all = await DB.getDrivers();
    const dup = all.find(d => d.phone && d.phone === phone && String(d.id) !== String(id));
    if (dup) return toast(`Phone ${phone} is already used by driver "${dup.name}"`, 'error');
  }
  await DB.updateDriver(id,{name,phone,vehicle,status});
  await DB.logAction('Edit Driver', `Updated details for driver "${name}"`, { id, name, phone, vehicle, status }, 'Driver');
  hideModal('edit-drv-modal'); toast('Driver updated!'); renderDrivers();
}
async function toggleDriverStatus(id, current) {
  const s=['available','on-trip','off-duty'];
  const nextStatus = s[(s.indexOf(current)+1)%s.length];
  await DB.updateDriver(id,{status:nextStatus});
  const drv = await DB.getDriver(id);
  await DB.logAction('Edit Driver', `Changed driver "${drv?.name || '#'+id}" status to "${nextStatus}"`, { id, status: nextStatus }, 'Driver');
  toast('Status updated'); renderDrivers();
}
async function deleteDriverConfirm(id) {
  const d = await DB.getDriver(id);
  confirmDialog('Delete this driver?', async()=>{
    await DB.deleteDriver(id);
    await DB.logAction('Delete Driver', `Deleted driver "${d?.name || '#'+id}"`, { id, name: d?.name }, 'Driver');
    toast('Driver deleted'); renderDrivers();
  });
}

// ─────────────────────────────────────────────
// CUSTOMERS BACKUP & IMPORT
// ─────────────────────────────────────────────
async function exportCustomers() {
  const all = await DB.getCustomers();
  const exportData = {
    type:'swc_customers_backup', version:1,
    exported_at:new Date().toISOString(), count:all.length,
    customers:all.map(c=>({
      hotel_name:c.hotel_name, contact_person:c.contact_person||'',
      phone:c.phone||'', email:c.email||'',
      address:c.address||'', created_date:c.created_date||''
    }))
  };
  const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`swc_customers_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast(`Exported ${all.length} customers`,'success');
}

async function importCustomers(input) {
  const file=input.files[0]; if(!file) return;
  input.value='';
  try {
    const data=JSON.parse(await file.text());
    if(data.type!=='swc_customers_backup') return toast('Invalid backup file','error');
    const records=data.customers||[];
    if(!records.length) return toast('No customers found in file','warning');
    confirmDialog(`Import ${records.length} customers? Existing customers (matched by phone number) will be updated. New customers will be added.`, async()=>{
      const existing=await DB.getCustomers();
      const byPhone=Object.fromEntries(existing.filter(c=>c.phone).map(c=>[c.phone,c]));
      const byName =Object.fromEntries(existing.map(c=>[c.hotel_name.toLowerCase().trim(),c]));
      let added=0,updated=0,errors=0;
      for(const rec of records){
        try {
          const match = (rec.phone&&byPhone[rec.phone]) || byName[rec.hotel_name?.toLowerCase().trim()];
          if(match){
            await DB.updateCustomer(match.id,{hotel_name:rec.hotel_name,contact_person:rec.contact_person||'',phone:rec.phone||'',email:rec.email||'',address:rec.address||''});
            updated++;
          } else {
            await DB.addCustomer({hotel_name:rec.hotel_name,contact_person:rec.contact_person||'',phone:rec.phone||'',email:rec.email||'',address:rec.address||''});
            added++;
          }
        } catch(e){errors++;console.error(e);}
      }
      renderCustomers();
      const msg = `Import done: ${added} added, ${updated} updated` + (errors?`, ${errors} failed`:'');
      toast(msg,'success');
    });
  } catch(e){ toast('Failed to read file: '+(e.message||e),'error'); }
}

// ─────────────────────────────────────────────
// DRIVERS BACKUP & IMPORT
// ─────────────────────────────────────────────
async function exportDrivers() {
  const all = await DB.getDrivers();
  const exportData = {
    type:'swc_drivers_backup', version:1,
    exported_at:new Date().toISOString(), count:all.length,
    drivers:all.map(d=>({
      name:d.name, phone:d.phone||'',
      vehicle:d.vehicle||'', status:d.status||'available'
    }))
  };
  const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`swc_drivers_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast(`Exported ${all.length} drivers`,'success');
}

async function importDrivers(input) {
  const file=input.files[0]; if(!file) return;
  input.value='';
  try {
    const data=JSON.parse(await file.text());
    if(data.type!=='swc_drivers_backup') return toast('Invalid backup file','error');
    const records=data.drivers||[];
    if(!records.length) return toast('No drivers found in file','warning');
    confirmDialog(`Import ${records.length} drivers? Existing drivers (matched by phone number) will be updated. New drivers will be added.`, async()=>{
      const existing=await DB.getDrivers();
      const byPhone=Object.fromEntries(existing.filter(d=>d.phone).map(d=>[d.phone,d]));
      const byName =Object.fromEntries(existing.map(d=>[d.name.toLowerCase().trim(),d]));
      let added=0,updated=0,errors=0;
      for(const rec of records){
        try {
          const match = (rec.phone&&byPhone[rec.phone]) || byName[rec.name?.toLowerCase().trim()];
          if(match){
            await DB.updateDriver(match.id,{name:rec.name,phone:rec.phone||'',vehicle:rec.vehicle||'',status:rec.status||'available'});
            updated++;
          } else {
            await DB.addDriver({name:rec.name,phone:rec.phone||'',vehicle:rec.vehicle||'',status:rec.status||'available'});
            added++;
          }
        } catch(e){errors++;console.error(e);}
      }
      renderDrivers();
      const msg = `Import done: ${added} added, ${updated} updated` + (errors?`, ${errors} failed`:'');
      toast(msg,'success');
    });
  } catch(e){ toast('Failed to read file: '+(e.message||e),'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAY NOW PAGE & BATCH PAY
// ─────────────────────────────────────────────────────────────────────────────
let paynowPage = 1;
let paynowSearch = '';
let paynowStatusFilter = '';
let paynowPerPage = 10;
let paynowSelectedIds = [];

async function renderPayNow() {
  document.getElementById('page-title').textContent = 'Pay Now';
  
  if (document.getElementById('paynow-table-body')) {
    await _refreshPayNowTable();
    return;
  }

  const [allOrders, customers] = await Promise.all([DB.getOrders(), DB.getCustomers()]);
  const statusOpts = ORDER_STATUSES.map(s => `<option value="${s}" ${s === paynowStatusFilter ? 'selected' : ''}>${s}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Pending Payments</span>
      <div style="display:flex;gap:8px;align-items:center;" id="batch-pay-header-btn"></div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
        <div class="search-wrap" style="flex:1;min-width:200px;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="paynow-search-input" placeholder="Search invoice #, order batch ID, customer..."
            autocomplete="off" spellcheck="false"
            oninput="paynowSearch=this.value;paynowPage=1;_refreshPayNowTable()"/>
        </div>
        <select class="form-input form-select" id="paynow-filter-sel" style="width:170px;" onchange="paynowStatusFilter=this.value;paynowPage=1;_refreshPayNowTable()">
          <option value="">All Statuses</option>
          ${statusOpts}
        </select>
        <span id="paynow-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">
                <input type="checkbox" id="paynow-select-all" onchange="toggleSelectAllPayNow(this)"/>
              </th>
              <th>Batch ID</th>
              <th>Customer</th>
              <th>Invoice Number</th>
              <th>Status</th>
              <th>Pickup Date</th>
              <th>Unpaid Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="paynow-table-body"></tbody>
        </table>
      </div>
      <div id="paynow-pagination" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);"></div>
    </div>`;

  await _refreshPayNowTable();
  document.getElementById('paynow-search-input').focus();
}

async function _refreshPayNowTable() {
  const tbody = document.getElementById('paynow-table-body');
  if (!tbody) { await renderPayNow(); return; }

  const [orders, invoices, customers] = await Promise.all([
    DB.getOrders(),
    DB.getInvoices(),
    DB.getCustomers()
  ]);

  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const invMap = Object.fromEntries(invoices.map(i => [i.order_id, i]));

  // Sync filters
  const sel = document.getElementById('paynow-filter-sel');
  if (sel && sel.value !== paynowStatusFilter) sel.value = paynowStatusFilter;

  // Filter orders: only pending payment (order status is not 'Paid', or invoice paid_status is not 'Paid')
  let pending = orders.filter(o => {
    const inv = invMap[o.id];
    if (inv) {
      return inv.paid_status !== 'Paid';
    } else {
      return o.status !== 'Paid';
    }
  });

  // Apply search query
  if (paynowSearch) {
    const q = paynowSearch.toLowerCase();
    pending = pending.filter(o => {
      const inv = invMap[o.id];
      const invNum = (inv?.invoice_number || '').toLowerCase();
      const batchId = (o.batch_id || '').toLowerCase();
      const custName = getOrderCustomerName(o, cMap).toLowerCase();
      return invNum.includes(q) || batchId.includes(q) || custName.includes(q);
    });
  }

  // Apply status filter
  if (paynowStatusFilter) {
    pending = pending.filter(o => o.status === paynowStatusFilter);
  }

  // Sort: newest first
  pending.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  // Pagination
  const { items, totalPages, total } = paginateData(pending, paynowPage, paynowPerPage);

  const countEl = document.getElementById('paynow-count');
  if (countEl) countEl.textContent = total + ' pending order' + (total !== 1 ? 's' : '');

  // Render rows
  tbody.innerHTML = items.length === 0
    ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No pending payments found</td></tr>`
    : items.map(o => {
        const cust = cMap[o.customer_id];
        const inv = invMap[o.id];
        const invNum = inv?.invoice_number || '—';
        const balance = inv ? inv.balance : Math.max(0, (o.total_amount || 0) - (o.advance_payment || 0));
        const isChecked = paynowSelectedIds.includes(o.id) ? 'checked' : '';

        return `<tr>
          <td style="text-align: center;">
            <input type="checkbox" class="paynow-checkbox" data-order-id="${o.id}" ${isChecked} onchange="onPayNowCheckboxChange()"/>
          </td>
          <td><strong>${o.batch_id || '—'}</strong></td>
          <td>${getOrderCustomerName(o, cMap)}</td>
          <td>${invNum}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${formatDate(o.pickup_date)}</td>
          <td style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;">${formatCurrency(balance)}</td>
          <td>
            <button class="btn btn-success btn-sm" style="background:#22c55e; border-color:#16a34a; font-weight:700;" onclick="showPayNowOptionsModal(${o.id})">
              <i class="fas fa-money-bill-wave"></i> Pay Now
            </button>
          </td>
        </tr>`;
      }).join('');

  // Update pagination UI
  const pg = document.getElementById('paynow-pagination');
  if (pg) {
    pg.innerHTML = `<span style="font-size:0.82em;color:var(--text-muted);">Page ${paynowPage} of ${totalPages}</span>`
      + renderPagination(paynowPage, totalPages, 'changePayNowPage');
  }

  // Update Master checkbox state
  updatePayNowMasterCheckboxState(items);

  // Update Batch PAY button in header
  updateBatchPayButtonHeader();
}

function changePayNowPage(p) {
  paynowPage = p;
  _refreshPayNowTable();
}

async function toggleSelectAllPayNow(masterCheckbox) {
  if (masterCheckbox.checked) {
    // Select ALL unpaid orders across all pages, not just the visible ones
    const [orders, invoices] = await Promise.all([DB.getOrders(), DB.getInvoices()]);
    const invMap = Object.fromEntries(invoices.map(i => [i.order_id, i]));
    const allPendingIds = orders
      .filter(o => {
        const inv = invMap[o.id];
        return inv ? inv.paid_status !== 'Paid' : o.status !== 'Paid';
      })
      .map(o => o.id);
    paynowSelectedIds = allPendingIds;
  } else {
    paynowSelectedIds = [];
  }
  // Update visible checkboxes to match
  document.querySelectorAll('.paynow-checkbox').forEach(cb => {
    const oId = parseInt(cb.dataset.orderId);
    cb.checked = paynowSelectedIds.includes(oId);
  });
  updateBatchPayButtonHeader();
}

function onPayNowCheckboxChange() {
  const checkboxes = document.querySelectorAll('.paynow-checkbox');
  checkboxes.forEach(cb => {
    const oId = parseInt(cb.dataset.orderId);
    if (cb.checked) {
      if (!paynowSelectedIds.includes(oId)) paynowSelectedIds.push(oId);
    } else {
      paynowSelectedIds = paynowSelectedIds.filter(id => id !== oId);
    }
  });

  const checkboxesArr = Array.from(checkboxes);
  const allChecked = checkboxesArr.length > 0 && checkboxesArr.every(cb => cb.checked);
  const master = document.getElementById('paynow-select-all');
  if (master) master.checked = allChecked;

  updateBatchPayButtonHeader();
}

function updatePayNowMasterCheckboxState(items) {
  const master = document.getElementById('paynow-select-all');
  if (!master) return;
  if (items.length === 0) {
    master.checked = false;
    return;
  }
  const allChecked = items.every(o => paynowSelectedIds.includes(o.id));
  master.checked = allChecked;
}

function updateBatchPayButtonHeader() {
  const container = document.getElementById('batch-pay-header-btn');
  if (!container) return;

  if (paynowSelectedIds.length >= 2) {
    container.innerHTML = `
      <button class="btn btn-success" style="background:#22c55e; border-color:#16a34a; font-weight:700;" onclick="showBatchPayConfirmModal()">
        <i class="fas fa-hand-holding-dollar"></i> Batch PAY (${paynowSelectedIds.length})
      </button>`;
  } else {
    container.innerHTML = '';
  }
}

async function showPayNowOptionsModal(orderId) {
  const order = await DB.getOrder(orderId);
  const items = await DB.getOrderItems(orderId);
  if (!items.length) {
    return toast('Cannot pay: please add items to this order first.', 'warning');
  }

  let inv = await DB.getInvoiceByOrder(orderId);
  let isTempInv = false;
  if (!inv) {
    isTempInv = true;
    const invNum = await DB.generateInvoiceNumber();
    const itemsSubtotal = items.reduce((s,i) => s + (i.subtotal || 0), 0);
    inv = {
      order_id: orderId,
      invoice_number: invNum,
      issue_date: new Date().toISOString(),
      delivery_date: order.delivery_date,
      invoice_type: 'Standard',
      total_amount: order.total_amount || 0,
      advance_payment: order.advance_payment || 0,
      balance: Math.max(0, (order.total_amount || 0) - (order.advance_payment || 0)),
      paid_status: 'Unpaid',
      discount_rate: 0,
      discount_amount: 0,
      delivery_charge: Math.max(0, (order.total_amount || 0) - itemsSubtotal),
      subtotal_before_discount: itemsSubtotal
    };
  }

  window._currentPayNowInvoice = inv;
  window._isTempInvoice = isTempInv;

  const payments = isTempInv ? [] : await DB.getPaymentsByInvoice(inv.id);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + (inv.advance_payment || 0);
  const balance = Math.max(0, inv.total_amount - totalPaid);
  if (balance <= 0) {
    return toast('This order is already fully paid.', 'info');
  }

  const cust = await DB.getCustomer(order.customer_id);

  createModal('paynow-options-modal', `Pay Now: ${order.batch_id}`, `
    <div style="background:var(--bg);padding:16px;border-radius:10px;margin-bottom:18px;font-size:0.9em;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div><span class="form-label">Customer:</span> <strong>${cust?.hotel_name || '—'}</strong></div>
      <div><span class="form-label">Invoice Number:</span> <strong>${inv.invoice_number}</strong></div>
      <div><span class="form-label">Total Amount:</span> <strong>${formatCurrency(inv.total_amount)}</strong></div>
      <div><span class="form-label">Remaining Balance:</span> <strong style="color:var(--danger);">${formatCurrency(balance)}</strong></div>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;">
      <!-- Full Payment Card -->
      <div class="card" onclick="showFullInputContainer()" 
        style="cursor:pointer; text-align:center; transition:all 0.2s; border: 2px solid var(--success); background:rgba(34,197,94,0.04);"
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(34,197,94,0.15)';"
        onmouseout="this.style.transform='';this.style.boxShadow='';">
        <div style="font-size:2em; color:var(--success); margin-bottom:10px;"><i class="fas fa-hand-holding-dollar"></i></div>
        <div style="font-weight:700; font-size:1.1em; color:var(--success); margin-bottom:4px;">Full Payment</div>
        <div style="font-size:0.8em; color:var(--text-muted);">Pay LKR ${balance.toFixed(2)}</div>
      </div>
      
      <!-- Partial Payment Card -->
      <div class="card" onclick="showPartialInputContainer()" 
        style="cursor:pointer; text-align:center; transition:all 0.2s; border: 2px solid var(--warning); background:rgba(245,158,11,0.04);"
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(245,158,11,0.15)';"
        onmouseout="this.style.transform='';this.style.boxShadow='';">
        <div style="font-size:2em; color:var(--warning); margin-bottom:10px;"><i class="fas fa-wallet"></i></div>
        <div style="font-weight:700; font-size:1.1em; color:var(--warning); margin-bottom:4px;">Partial Payment</div>
        <div style="font-size:0.8em; color:var(--text-muted);">Pay a custom partial amount</div>
      </div>

      <!-- Pay with Deductions Card -->
      <div class="card" onclick="showDeductionsInputContainer()" 
        style="cursor:pointer; text-align:center; transition:all 0.2s; border: 2px solid var(--primary); background:rgba(139,92,246,0.04);"
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(139,92,246,0.15)';"
        onmouseout="this.style.transform='';this.style.boxShadow='';">
        <div style="font-size:2em; color:var(--primary); margin-bottom:10px;"><i class="fas fa-scissors"></i></div>
        <div style="font-weight:700; font-size:1.1em; color:var(--primary); margin-bottom:4px;">Pay with Deductions</div>
        <div style="font-size:0.8em; color:var(--text-muted);">Apply a custom deduction</div>
      </div>
    </div>

    <!-- Dynamic Full Payment Form -->
    <div id="full-pay-container" style="display:none; padding-top:14px; border-top:1.5px dashed var(--border); margin-bottom:16px; transition:all 0.3s;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Payment Method *</label>
          <select class="form-input form-select" id="pn-full-method" onchange="onPayNowMethodChange(this, 'pn-full-cheque-wrap')">
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Description (Optional)</label>
          <input class="form-input" id="pn-full-notes" placeholder="e.g. Reference number / notes"/>
        </div>
      </div>
      <div id="pn-full-cheque-wrap" style="display:none;" class="form-group">
        <label class="form-label" style="font-weight:700; color:var(--success);">Cheque Number *</label>
        <input class="form-input" id="pn-full-cheque-num" placeholder="Enter cheque number..."/>
      </div>
      <button class="btn btn-success" style="width:100%; justify-content:center; background:#22c55e; border-color:#16a34a; font-weight:700;" onclick="confirmFullPayment(${order.id}, ${inv.id}, ${balance})">
        <i class="fas fa-check"></i> Confirm Full Payment
      </button>
    </div>
    
    <!-- Dynamic Partial Payment Form -->
    <div id="partial-pay-container" style="display:none; padding-top:14px; border-top:1.5px dashed var(--border); margin-bottom:16px; transition:all 0.3s;">
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="color:var(--warning); font-weight:700;">Amount to Pay (LKR) *</label>
          <input type="number" class="form-input" id="paynow-partial-amount" placeholder="e.g. 5000" min="0.01" max="${balance}" step="0.01"/>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Payment Method *</label>
          <select class="form-input form-select" id="pn-partial-method" onchange="onPayNowMethodChange(this, 'pn-partial-cheque-wrap')">
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Description (Optional)</label>
          <input class="form-input" id="pn-partial-notes" placeholder="e.g. Reference number / notes"/>
        </div>
      </div>
      <div id="pn-partial-cheque-wrap" style="display:none;" class="form-group">
        <label class="form-label" style="font-weight:700; color:var(--warning);">Cheque Number *</label>
        <input class="form-input" id="pn-partial-cheque-num" placeholder="Enter cheque number..."/>
      </div>
      <button class="btn btn-warning" style="width:100%; justify-content:center;" onclick="confirmPartialPayment(${order.id}, ${inv.id}, ${balance})">
        <i class="fas fa-check"></i> Confirm Partial Payment
      </button>
    </div>

    <!-- Dynamic Deductions Form -->
    <div id="deduct-pay-container" style="display:none; padding-top:14px; border-top:1.5px dashed var(--border); margin-bottom:16px; transition:all 0.3s;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="color:var(--primary); font-weight:700;">Deduction Amount (LKR) *</label>
          <input type="number" class="form-input" id="paynow-deduct-amount" placeholder="e.g. 1500" min="0.01" max="${balance}" step="0.01" oninput="recalcPayNowDeduction(${balance})"/>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Reason for Deduction</label>
          <input class="form-input" id="paynow-deduct-reason" placeholder="e.g. Damaged item discount"/>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Payment Method *</label>
          <select class="form-input form-select" id="pn-deduct-method" onchange="onPayNowMethodChange(this, 'pn-deduct-cheque-wrap')">
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Description (Optional)</label>
          <input class="form-input" id="pn-deduct-notes" placeholder="e.g. Reference number / notes"/>
        </div>
      </div>

      <div id="pn-deduct-cheque-wrap" style="display:none;" class="form-group">
        <label class="form-label" style="font-weight:700; color:var(--primary);">Cheque Number *</label>
        <input class="form-input" id="pn-deduct-cheque-num" placeholder="Enter cheque number..."/>
      </div>
      
      <div style="background:#fef2f2; border:1px solid #fca5a5; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:0.9em; display:flex; flex-direction:column; gap:4px; font-weight:600;">
        <div style="display:flex; justify-content:space-between;"><span>Remaining Due:</span> <span style="color:var(--text);">${formatCurrency(balance)}</span></div>
        <div style="display:flex; justify-content:space-between; color:#ef4444;"><span>Minus Deduction:</span> <span id="lbl-paynow-calc-deduct">- LKR 0.00</span></div>
        <div style="display:flex; justify-content:space-between; border-top:1px solid #fca5a5; padding-top:6px; font-weight:700; font-size:1.05em; color:#1e40af;">
          <span>Final Payment Amount:</span> <span id="lbl-paynow-calc-final">${formatCurrency(balance)}</span>
        </div>
      </div>
      
      <button class="btn btn-primary" style="width:100%; justify-content:center; background:#8b5cf6; border-color:#7c3aed;" onclick="confirmDeductionPayment(${order.id}, ${inv.id}, ${balance})">
        <i class="fas fa-check"></i> Confirm Deduction & Finalize
      </button>
    </div>
    
    <div style="display:flex; justify-content:flex-end;">
      <button class="btn btn-secondary" onclick="hideModal('paynow-options-modal')">Cancel</button>
    </div>
  `);
  showModal('paynow-options-modal');
}

function showFullInputContainer() {
  const fContainer = document.getElementById('full-pay-container');
  const pContainer = document.getElementById('partial-pay-container');
  const dContainer = document.getElementById('deduct-pay-container');
  if (fContainer) fContainer.style.display = 'block';
  if (pContainer) pContainer.style.display = 'none';
  if (dContainer) dContainer.style.display = 'none';
}

function showPartialInputContainer() {
  const fContainer = document.getElementById('full-pay-container');
  const pContainer = document.getElementById('partial-pay-container');
  const dContainer = document.getElementById('deduct-pay-container');
  if (fContainer) fContainer.style.display = 'none';
  if (pContainer) pContainer.style.display = 'block';
  if (dContainer) dContainer.style.display = 'none';
  document.getElementById('paynow-partial-amount')?.focus();
}

function showDeductionsInputContainer() {
  const fContainer = document.getElementById('full-pay-container');
  const pContainer = document.getElementById('partial-pay-container');
  const dContainer = document.getElementById('deduct-pay-container');
  if (fContainer) fContainer.style.display = 'none';
  if (pContainer) pContainer.style.display = 'none';
  if (dContainer) dContainer.style.display = 'block';
  document.getElementById('paynow-deduct-amount')?.focus();
}

window.onPayNowMethodChange = function(selectEl, wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  if (wrapper) {
    wrapper.style.display = selectEl.value === 'Cheque' ? 'block' : 'none';
  }
};

function recalcPayNowDeduction(balance) {
  const deductInput = document.getElementById('paynow-deduct-amount');
  const deductAmount = parseFloat(deductInput.value) || 0;
  const lblCalcDeduct = document.getElementById('lbl-paynow-calc-deduct');
  const lblCalcFinal = document.getElementById('lbl-paynow-calc-final');
  
  if (lblCalcDeduct) lblCalcDeduct.textContent = `- LKR ${deductAmount.toFixed(2)}`;
  const finalAmount = Math.max(0, balance - deductAmount);
  if (lblCalcFinal) lblCalcFinal.textContent = `LKR ${finalAmount.toFixed(2)}`;
}

function confirmFullPayment(orderId, invoiceId, amount) {
  const method = document.getElementById('pn-full-method').value;
  const notesInput = document.getElementById('pn-full-notes').value.trim();
  let notes = notesInput || 'Paid fully via Pay Now tab';
  
  if (method === 'Cheque') {
    const chqNum = document.getElementById('pn-full-cheque-num').value.trim();
    if (!chqNum) return toast('Please enter a cheque number', 'error');
    notes = `Cheque No: ${chqNum}. ${notesInput ? 'Notes: ' + notesInput : ''}`;
  }

  confirmDialog(`Confirm Full Payment of LKR ${amount.toFixed(2)} using ${method}?`, async () => {
    await processFullPayment(orderId, invoiceId, amount, method, notes);
  }, 'Confirm', false);
}

function confirmPartialPayment(orderId, invoiceId, maxAmount) {
  const amountInput = document.getElementById('paynow-partial-amount');
  const amount = parseFloat(amountInput?.value || '0');

  if (isNaN(amount) || amount <= 0) {
    return toast('Please enter a valid payment amount', 'error');
  }
  if (amount > maxAmount) {
    return toast(`Amount cannot exceed the remaining balance of LKR ${maxAmount.toFixed(2)}`, 'error');
  }

  const method = document.getElementById('pn-partial-method').value;
  const notesInput = document.getElementById('pn-partial-notes').value.trim();
  let notes = notesInput || 'Partial payment via Pay Now tab';

  if (method === 'Cheque') {
    const chqNum = document.getElementById('pn-partial-cheque-num').value.trim();
    if (!chqNum) return toast('Please enter a cheque number', 'error');
    notes = `Cheque No: ${chqNum}. ${notesInput ? 'Notes: ' + notesInput : ''}`;
  }

  confirmDialog(`Confirm Partial Payment of LKR ${amount.toFixed(2)} using ${method}?`, async () => {
    await processPartialPayment(orderId, invoiceId, maxAmount, amount, method, notes);
  }, 'Confirm', false);
}

function confirmDeductionPayment(orderId, invoiceId, balance) {
  const deductInput = document.getElementById('paynow-deduct-amount');
  const deductionAmount = parseFloat(deductInput?.value || '0');
  const reason = document.getElementById('paynow-deduct-reason')?.value.trim() || 'No reason provided';
  
  if (isNaN(deductionAmount) || deductionAmount <= 0) {
    return toast('Please enter a valid deduction amount', 'error');
  }
  if (deductionAmount > balance) {
    return toast('Deduction cannot exceed the remaining due balance', 'error');
  }

  const method = document.getElementById('pn-deduct-method').value;
  const notesInput = document.getElementById('pn-deduct-notes').value.trim();
  let notes = notesInput || 'Recorded final payment after deduction';

  if (method === 'Cheque') {
    const chqNum = document.getElementById('pn-deduct-cheque-num').value.trim();
    if (!chqNum) return toast('Please enter a cheque number', 'error');
    notes = `Cheque No: ${chqNum}. ${notesInput ? 'Notes: ' + notesInput : ''}`;
  }

  confirmDialog(`Confirm deduction of LKR ${deductionAmount.toFixed(2)} and payment of LKR ${(balance - deductionAmount).toFixed(2)} using ${method}?`, async () => {
    await processDeductionPayment(orderId, invoiceId, balance, deductionAmount, reason, method, notes);
  }, 'Confirm', false);
}

async function processDeductionPayment(orderId, invoiceId, balance, deductionAmount, reason, method, notes) {
  try {
    let activeInvoiceId = invoiceId;
    const isTemp = window._isTempInvoice;
    const invObj = window._currentPayNowInvoice;

    if (isTemp) {
      invObj.deduction_amount = deductionAmount;
      invObj.balance = 0;
      invObj.paid_status = 'Paid';
      invObj.payment_date = new Date().toISOString();
      activeInvoiceId = await DB.addInvoice(invObj);
    }

    // 1. Add deduction record
    await DB.addDeduction({
      invoice_id: activeInvoiceId,
      invoice_number: invObj.invoice_number,
      original_amount: invObj.total_amount,
      deduction_amount: deductionAmount,
      final_amount: invObj.total_amount - deductionAmount,
      reason: reason
    });

    // 2. Add payment record for final remaining payment
    const payAmount = Math.max(0, balance - deductionAmount);
    if (payAmount > 0) {
      await DB.addPayment({
        invoice_id: activeInvoiceId,
        amount: payAmount,
        method: method,
        notes: notes
      });
    }

    // 3. Update invoice (only if it already existed in DB)
    if (!isTemp) {
      await DB.updateInvoice(activeInvoiceId, {
        deduction_amount: (invObj.deduction_amount || 0) + deductionAmount,
        balance: 0,
        paid_status: 'Paid',
        payment_date: new Date().toISOString()
      });
    }

    // 4. Update order to Paid
    await DB.updateOrder(orderId, {
      status: 'Paid',
      payment_date: new Date().toISOString()
    });
    paynowSelectedIds = paynowSelectedIds.filter(id => id !== orderId);

    hideModal('paynow-options-modal');
    toast(`Deduction applied and invoice fully paid!`);
    
    await _refreshPayNowTable();

    setTimeout(() => {
      printInvoice(activeInvoiceId);
    }, 250);
  } catch (err) {
    toast('Error: ' + (err.message || err), 'error');
  }
}

async function processFullPayment(orderId, invoiceId, amount, method, notes) {
  try {
    let activeInvoiceId = invoiceId;
    const isTemp = window._isTempInvoice;
    const invObj = window._currentPayNowInvoice;

    if (isTemp) {
      invObj.paid_status = 'Paid';
      invObj.balance = 0;
      invObj.payment_date = new Date().toISOString();
      activeInvoiceId = await DB.addInvoice(invObj);
    } else {
      await DB.updateInvoice(invoiceId, {
        balance: 0,
        paid_status: 'Paid',
        payment_date: new Date().toISOString()
      });
    }

    await DB.addPayment({
      invoice_id: activeInvoiceId,
      amount: amount,
      method: method,
      notes: notes
    });

    await DB.logAction('Payment Received', `Received payment of LKR ${amount.toLocaleString()} via ${method} for Order #${orderId}`, { order_id: orderId, invoice_id: activeInvoiceId, amount, method, notes }, 'Payment');

    await DB.updateOrder(orderId, {
      status: 'Paid',
      payment_date: new Date().toISOString()
    });

    paynowSelectedIds = paynowSelectedIds.filter(id => id !== orderId);

    hideModal('paynow-options-modal');
    toast(`Order fully paid!`);
    
    await _refreshPayNowTable();

    setTimeout(() => {
      printInvoice(activeInvoiceId);
    }, 250);
  } catch (err) {
    toast('Error: ' + (err.message || err), 'error');
  }
}

async function processPartialPayment(orderId, invoiceId, maxAmount, amount, method, notes) {
  try {
    const isTemp = window._isTempInvoice;
    const invObj = window._currentPayNowInvoice;
    const order = await DB.getOrder(orderId);
    const newAdvance = (order.advance_payment || 0) + amount;
    const isNowPaid = newAdvance >= (order.total_amount || 0);
    const paidStatus = isNowPaid ? 'Paid' : 'Unpaid';

    let activeInvoiceId = invoiceId;

    if (isTemp) {
      if (isNowPaid) {
        invObj.advance_payment = newAdvance;
        invObj.balance = 0;
        invObj.paid_status = 'Paid';
        invObj.payment_date = new Date().toISOString();
        activeInvoiceId = await DB.addInvoice(invObj);

        await DB.addPayment({
          invoice_id: activeInvoiceId,
          amount: amount,
          method: method,
          notes: notes
        });
      }
    } else {
      await DB.addPayment({
        invoice_id: invoiceId,
        amount: amount,
        method: method,
        notes: notes
      });

      const payments = await DB.getPaymentsByInvoice(invoiceId);
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + (invObj.advance_payment || 0);
      const newBalance = Math.max(0, invObj.total_amount - (invObj.deduction_amount || 0) - totalPaid);
      const newPaidStatus = newBalance <= 0 ? 'Paid' : 'Unpaid';

      await DB.updateInvoice(invoiceId, {
        balance: newBalance,
        paid_status: newPaidStatus,
        payment_date: new Date().toISOString()
      });
    }

    await DB.updateOrder(orderId, {
      advance_payment: newAdvance,
      status: paidStatus,
      payment_date: new Date().toISOString()
    });

    if (paidStatus === 'Paid') {
      paynowSelectedIds = paynowSelectedIds.filter(id => id !== orderId);
    }

    hideModal('paynow-options-modal');
    toast(`Partial payment of LKR ${amount.toFixed(2)} recorded!`);

    await _refreshPayNowTable();

    if (paidStatus === 'Paid' && activeInvoiceId) {
      setTimeout(() => {
        printInvoice(activeInvoiceId);
      }, 250);
    }
  } catch (err) {
    toast('Error: ' + (err.message || err), 'error');
  }
}

async function showBatchPayConfirmModal() {
  if (paynowSelectedIds.length < 2) return;

  const [orders, invoices, customers] = await Promise.all([
    DB.getOrders(),
    DB.getInvoices(),
    DB.getCustomers()
  ]);

  const oMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const invMap = Object.fromEntries(invoices.map(i => [i.order_id, i]));

  let totalBatchAmount = 0;
  let batchListHTML = '';
  const selectedBatchDetails = [];

  for (const oId of paynowSelectedIds) {
    const o = oMap[oId];
    if (!o) continue;

    const cust = cMap[o.customer_id];
    let inv = invMap[oId];
    let invNum = inv?.invoice_number;
    let balance = 0;

    if (!inv) {
      const items = await DB.getOrderItems(oId);
      if (!items.length) {
        return toast(`Cannot batch pay: Order ${o.batch_id} has no items. Please deselect it or add items first.`, 'warning');
      }
      const invNumGen = await DB.generateInvoiceNumber();
      const itemsSubtotal = items.reduce((s,i) => s + (i.subtotal || 0), 0);
      const invId = await DB.addInvoice({
        order_id: oId,
        invoice_number: invNumGen,
        issue_date: new Date().toISOString(),
        delivery_date: o.delivery_date,
        invoice_type: o.status === 'Credits' ? 'Credit' : 'Standard',
        total_amount: o.total_amount || 0,
        advance_payment: o.advance_payment || 0,
        balance: Math.max(0, (o.total_amount || 0) - (o.advance_payment || 0)),
        paid_status: (o.advance_payment || 0) >= (o.total_amount || 0) ? 'Paid' : 'Unpaid',
        discount_rate: 0,
        discount_amount: 0,
        delivery_charge: Math.max(0, (o.total_amount || 0) - itemsSubtotal),
        subtotal_before_discount: itemsSubtotal
      });
      inv = await DB.getInvoice(invId);
      invNum = invNumGen;
      invMap[oId] = inv;
    }

    const payments = await DB.getPaymentsByInvoice(inv.id);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + (inv.advance_payment || 0);
    balance = Math.max(0, inv.total_amount - totalPaid);

    totalBatchAmount += balance;
    selectedBatchDetails.push({
      customerName: cust?.hotel_name || '—',
      orderNumber: o.batch_id || '—',
      invoiceNumber: invNum,
      amount: balance,
      orderId: oId,
      invoiceId: inv.id
    });

    batchListHTML += `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 0;">${cust?.hotel_name || '—'}</td>
        <td style="padding:8px 0; font-family:monospace; font-weight:700;">${o.batch_id || '—'}</td>
        <td style="padding:8px 0; font-family:monospace;">${invNum}</td>
        <td style="padding:8px 0; text-align:right; font-weight:600; color:var(--success);">${formatCurrency(balance)}</td>
      </tr>`;
  }

  window._currentBatchDetails = selectedBatchDetails;
  window._currentBatchTotal = totalBatchAmount;
  currentBatchPayOption = 'standard';

  createModal('batch-pay-confirm-modal', 'Batch Payment Summary', `
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="btn btn-sm" id="batch-opt-standard" onclick="selectBatchPayOption('standard')" style="background:var(--success);color:#fff;border-color:var(--success);font-weight:600;"><i class="fas fa-wallet"></i> Standard Batch Payment</button>
      <button class="btn btn-sm" id="batch-opt-deduct" onclick="selectBatchPayOption('deduct')" style="background:var(--secondary);color:var(--text);border-color:var(--border);font-weight:600;"><i class="fas fa-cut"></i> Batch Pay with Deductions</button>
    </div>

    <p style="font-size:0.88em; color:var(--text-muted); margin-bottom:14px;">Please review the summary of selected orders before confirming payment.</p>
    
    <div style="background:var(--bg); padding:16px; border-radius:10px; margin-bottom:18px;">
      <div style="font-size:0.9em; font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">
        No of Orders Selected: ${selectedBatchDetails.length}
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
        <thead>
          <tr style="border-bottom:1.5px solid var(--border); text-transform:uppercase; font-size:0.75em; color:var(--text-muted); font-weight:700;">
            <th style="padding:6px 0; text-align:left;">Customer Name</th>
            <th style="padding:6px 0; text-align:left;">Order #</th>
            <th style="padding:6px 0; text-align:left;">Invoice #</th>
            <th style="padding:6px 0; text-align:right;">Amount (LKR)</th>
          </tr>
        </thead>
        <tbody>
          ${batchListHTML}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:14px; border-top:2px solid var(--border); font-weight:700; font-size:1.05em;">
        <span>Total Amount</span>
        <span style="color:var(--success);">${formatCurrency(totalBatchAmount)}</span>
      </div>
    </div>

    <!-- Batch Deductions Form -->
    <div id="batch-deduct-section" style="display:none; border-top: 1.5px dashed var(--border); padding-top: 14px; margin-top: 14px; margin-bottom: 18px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;"><label class="form-label" style="color:var(--danger); font-weight:700;"><i class="fas fa-scissors"></i> Batch Deduction Amount (LKR) *</label>
          <input type="number" class="form-input" id="batch-deduct-amount" placeholder="e.g. 3000" min="0" max="${totalBatchAmount}" step="0.01" oninput="recalcBatchDeduction(${totalBatchAmount})"/></div>
        <div class="form-group" style="margin:0;"><label class="form-label">Reason for Deduction</label>
          <input class="form-input" id="batch-deduct-reason" placeholder="e.g. Volume discount / refund"/></div>
      </div>
      
      <div style="background:#fef2f2; border:1px solid #fca5a5; padding:12px 16px; border-radius:8px; font-size:0.9em; display:flex; flex-direction:column; gap:4px; font-weight:600;">
        <div style="display:flex; justify-content:space-between;"><span>Batch Combined Total:</span> <span>${formatCurrency(totalBatchAmount)}</span></div>
        <div style="display:flex; justify-content:space-between; color:#ef4444;"><span>Minus Deduction:</span> <span id="lbl-batch-calc-deduct">- LKR 0.00</span></div>
        <div style="display:flex; justify-content:space-between; border-top:1px solid #fca5a5; padding-top:6px; font-weight:700; font-size:1.05em; color:#1e40af;">
          <span>Final Payment Amount:</span> <span id="lbl-batch-calc-final">${formatCurrency(totalBatchAmount)}</span>
        </div>
      </div>
    </div>

    <!-- Batch Payment Details Form -->
    <div style="border-top: 1.5px dashed var(--border); padding-top: 14px; margin-top: 14px; margin-bottom: 18px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-weight:700;">Batch Payment Method *</label>
          <select class="form-input form-select" id="pn-batch-method" onchange="onPayNowMethodChange(this, 'pn-batch-cheque-wrap')">
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Batch Payment Notes / Description (Optional)</label>
          <input class="form-input" id="pn-batch-notes" placeholder="e.g. Bulk settlement reference"/>
        </div>
      </div>
      
      <div id="pn-batch-cheque-wrap" style="display:none;" class="form-group">
        <label class="form-label" style="font-weight:700; color:var(--success);">Batch Cheque Number *</label>
        <input class="form-input" id="pn-batch-cheque-num" placeholder="Enter cheque number..."/>
      </div>
    </div>
    
    <div style="display:flex; gap:10px; justify-content:flex-end;">
      <button class="btn btn-secondary" onclick="hideModal('batch-pay-confirm-modal')">Cancel</button>
      <button class="btn btn-success" style="background:#22c55e; border-color:#16a34a; font-weight:700;" onclick="confirmBatchPayment()">
        <i class="fas fa-check-double"></i> Confirm & Download Receipt
      </button>
    </div>
  `, 'modal-lg');
  showModal('batch-pay-confirm-modal');
}

function confirmBatchPayment() {
  const method = document.getElementById('pn-batch-method').value;
  const notesInput = document.getElementById('pn-batch-notes').value.trim();
  let notes = notesInput || 'Paid fully via Batch Payment';

  if (method === 'Cheque') {
    const chqNum = document.getElementById('pn-batch-cheque-num').value.trim();
    if (!chqNum) return toast('Please enter a cheque number', 'error');
    notes = `Cheque No: ${chqNum}. ${notesInput ? 'Notes: ' + notesInput : ''}`;
  }

  const total = window._currentBatchTotal;
  const isDeduct = currentBatchPayOption === 'deduct';
  let confirmMsg = `Confirm Batch Payment using ${method}?`;
  if (isDeduct) {
    const deductInput = document.getElementById('batch-deduct-amount');
    const deductionAmount = parseFloat(deductInput?.value || '0');
    confirmMsg = `Confirm Batch Deduction of LKR ${deductionAmount.toFixed(2)} and payment of LKR ${(total - deductionAmount).toFixed(2)} using ${method}?`;
  }

  confirmDialog(confirmMsg, async () => {
    await processBatchPayment(method, notes);
  }, 'Confirm Batch Payment', false);
}

async function processBatchPayment(method = 'Cash', notes = 'Paid fully via Batch Payment') {
  const details = window._currentBatchDetails;
  const totalAmount = window._currentBatchTotal;
  if (!details || !details.length) return;

  let deductionAmount = 0;
  let reason = '';
  
  if (currentBatchPayOption === 'deduct') {
    const deductInput = document.getElementById('batch-deduct-amount');
    deductionAmount = parseFloat(deductInput?.value || '0');
    reason = document.getElementById('batch-deduct-reason')?.value.trim() || 'No reason provided';
    
    if (isNaN(deductionAmount) || deductionAmount <= 0) {
      return toast('Please enter a valid deduction amount', 'error');
    }
    if (deductionAmount > totalAmount) {
      return toast('Deduction cannot exceed the total batch due amount', 'error');
    }
  }

  try {
    showProcessingOverlay('Processing Batch Payment', 'Creating invoices and payments...');
    const orderIds = details.map(d => d.orderId);
    
    // Fetch all details from DB
    const [orders, invoices] = await Promise.all([
      DB.getOrders(),
      DB.getInvoices()
    ]);
    
    const oMap = Object.fromEntries(orders.map(o => [o.id, o]));
    const existingInvMap = Object.fromEntries(invoices.filter(i => orderIds.includes(i.order_id)).map(i => [i.order_id, i]));

    const createdInvoiceIds = [];

    // Process each order individually — separate invoice per order
    for (const detail of details) {
      const oId = detail.orderId;
      const order = oMap[oId];
      if (!order) continue;

      // Fetch order items for subtotal calculation
      const orderItems = await DB.getOrderItems(oId);
      const itemsSubtotal = orderItems.reduce((s, i) => s + (i.subtotal || (i.price * i.quantity) || 0), 0);
      const orderTotal = (order.total_amount && order.total_amount > 0) ? order.total_amount : (itemsSubtotal > 0 ? itemsSubtotal : detail.amount);
      const orderAdvance = order.advance_payment || 0;
      const orderBalance = detail.amount; // balance for this order

      // Calculate proportional deduction for this order
      let orderDeduction = 0;
      if (deductionAmount > 0 && totalAmount > 0) {
        orderDeduction = Math.round((orderBalance / totalAmount) * deductionAmount * 100) / 100;
      }

      // Delete any pre-existing invoice/payments for this order
      const existingInv = existingInvMap[oId];
      if (existingInv) {
        await DB.deletePaymentsForInvoice(existingInv.id);
        await DB.deleteInvoice(existingInv.id);
      }

      // Create individual invoice for this order
      const invNum = await DB.generateInvoiceNumber();
      const newInvId = await DB.addInvoice({
        order_id:                 oId,
        invoice_number:           invNum,
        issue_date:               new Date().toISOString(),
        delivery_date:            order.delivery_date || today(),
        invoice_type:             'Standard',
        total_amount:             orderTotal,
        advance_payment:          orderAdvance,
        extra_payment:            order.extra_payment || 0,
        balance:                  0,
        paid_status:              'Paid',
        discount_rate:            order.discount_rate || 0,
        discount_amount:          order.discount_amount || 0,
        delivery_charge:          order.delivery_charge || 0,
        subtotal_before_discount: itemsSubtotal > 0 ? itemsSubtotal : orderTotal,
        deduction_amount:         orderDeduction,
        payment_date:             new Date().toISOString()
      });

      createdInvoiceIds.push(newInvId);

      // If deduction applies to this order, add a deduction record
      if (orderDeduction > 0) {
        await DB.addDeduction({
          invoice_id: newInvId,
          invoice_number: invNum,
          original_amount: orderTotal,
          deduction_amount: orderDeduction,
          final_amount: orderTotal - orderDeduction,
          reason: reason
        });
      }

      // Add payment record for remaining balance after advance and deduction
      const payAmount = Math.max(0, orderBalance - orderDeduction);
      if (payAmount > 0) {
        await DB.addPayment({
          invoice_id: newInvId,
          amount: payAmount,
          method: method,
          notes: notes
        });
      }

      // Mark order as Paid
      await DB.updateOrder(oId, {
        status: 'Paid',
        payment_date: new Date().toISOString()
      });

      // Log action
      await DB.logAction(
        'Payment Received',
        `Batch payment: Order #${order.batch_id || oId} paid LKR ${payAmount.toLocaleString()} via ${method}${orderDeduction > 0 ? ' (Deduction: LKR ' + orderDeduction.toLocaleString() + ')' : ''}`,
        { order_id: oId, batch_id: order.batch_id, amount: payAmount, deduction: orderDeduction, method },
        'Payment'
      );
    }

    paynowSelectedIds = [];

    hideModal('batch-pay-confirm-modal');
    toast(`Batch payment completed! ${createdInvoiceIds.length} separate invoices created.`);

    await _refreshPayNowTable();

    // Print each invoice separately with a small delay between them
    for (let i = 0; i < createdInvoiceIds.length; i++) {
      setTimeout(() => {
        printInvoice(createdInvoiceIds[i]);
      }, 300 * (i + 1));
    }
  } catch (err) {
    toast('Error: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }
}

async function printBatchSummaryReceipt(details, totalAmount) {
  const settings = {
    company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
    address:      await DB.getSetting('address') || '',
    phone:        await DB.getSetting('phone') || '',
    email:        await DB.getSetting('email') || '',
    footer_message: await DB.getSetting('footer_message') || 'Thank you for choosing Sagacious Washing Center!'
  };
  const logoData = await DB.getSetting('logo_data');
  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
    : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

  const rowsHTML = details.map(d => `
    <tr>
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0;">${d.customerName}</td>
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace; font-weight:700;">${d.orderNumber}</td>
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace;">${d.invoiceNumber}</td>
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; text-align:right; font-weight:700; color:#16a34a;">${formatCurrency(d.amount)}</td>
    </tr>
  `).join('');

  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Batch Payment Summary Receipt</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:12px;padding:40px;}
      @page{size:A4 portrait;margin:15mm 15mm;}
      table{width:100%;border-collapse:collapse;margin-top:20px;margin-bottom:20px;}
      th{background:#1a4d8f;color:#fff;padding:10px 12px;text-align:left;font-size:0.85em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;}
      td{border-bottom:1px solid #eef2f7;}
    </style></head><body>
    <div style="position:relative;">
      <div style="position:absolute; right:50px; top:120px; border:4px solid #16a34a; color:#16a34a; font-family:'Playfair Display',serif; font-size:3em; font-weight:900; transform:rotate(-15deg); padding:8px 18px; border-radius:8px; opacity:0.35; text-transform:uppercase; z-index:10; pointer-events:none; user-select:none;">
        PAID
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
            ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>`:''}
            <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join('  |  ')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Playfair Display',serif;font-size:1.8em;font-weight:800;color:#1a4d8f;">Batch Payment Receipt</div>
          <div style="font-size:0.85em;color:#94a3b8;margin-top:6px;">Date: ${formatDateTime(new Date().toISOString())}</div>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:1em; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
          Summary of Paid Orders (Count: ${details.length})
        </div>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Order #</th>
              <th>Invoice #</th>
              <th style="text-align:right;">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
            <tr style="font-weight:700; font-size:1.1em; background:#f8fafc;">
              <td colspan="3" style="text-align:right; padding:12px; border-top:2px solid #1a4d8f;">Grand Total Paid</td>
              <td style="text-align:right; padding:12px; border-top:2px solid #1a4d8f; color:#16a34a;">${formatCurrency(totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:40px; text-align:center; font-size:0.9em; color:#94a3b8; font-style:italic;">
        ${settings.footer_message}
      </div>
      <div style="margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div style="text-align:center;min-width:180px;">
          <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
          <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Issued By:-</div>
        </div>
        <div style="text-align:center;min-width:180px;">
          <div style="height:50px;border-bottom:1.5px solid #1e293b;margin-bottom:6px;"></div>
          <div style="font-size:0.85em;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;">Checked By:-</div>
        </div>
      </div>
    </div>
    <script>document.fonts.ready.then(()=>window.print());<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return toast('Please allow pop-ups to print the receipt', 'warning');
  w.document.write(printHTML);
  w.document.close();
}

async function showCustomerProfileModal(id) {
  const [c, items] = await Promise.all([DB.getCustomer(id), DB.getItems()]);
  if (!c) return;

  const customPrices = c.custom_prices || {};

  // Sort items alphabetically by name
  items.sort((a,b) => (a.item_name||'').localeCompare(b.item_name||''));

  const itemsRowsHTML = items.map(item => {
    const custom = customPrices[item.id] || {};
    const dcVal = custom.dry_clean != null ? custom.dry_clean : '';
    const wpVal = custom.wash_press != null ? custom.wash_press : '';
    const wdVal = custom.wash_dry != null ? custom.wash_dry : '';

    return `
      <tr class="cust-price-row" data-item-id="${item.id}" data-search-text="${item.item_name.toLowerCase()} ${item.item_id.toLowerCase()}">
        <td style="padding:10px 12px; border-top: 1px solid var(--border);">
          <strong>${item.item_name}</strong>
          <div style="font-size:0.78em;color:var(--text-muted);font-family:monospace;margin-top:2px;">Code: ${item.item_id}</div>
        </td>
        <td style="padding:8px; border-top: 1px solid var(--border);">
          <input type="number" step="0.01" min="0" class="form-input cprice-dc" value="${dcVal}" placeholder="${item.dry_clean_price || 0}" style="padding:6px 10px;font-size:0.9em;width:100%;margin:0;"/>
        </td>
        <td style="padding:8px; border-top: 1px solid var(--border);">
          <input type="number" step="0.01" min="0" class="form-input cprice-wp" value="${wpVal}" placeholder="${item.wash_press_price || 0}" style="padding:6px 10px;font-size:0.9em;width:100%;margin:0;"/>
        </td>
        <td style="padding:8px; border-top: 1px solid var(--border);">
          <input type="number" step="0.01" min="0" class="form-input cprice-wd" value="${wdVal}" placeholder="${item.wash_dry_price || 0}" style="padding:6px 10px;font-size:0.9em;width:100%;margin:0;"/>
        </td>
      </tr>`;
  }).join('');

  createModal('customer-profile-modal', `Customer Profile & Custom Prices`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;background:var(--bg);padding:14px;border-radius:10px;">
      <div>
        <div class="form-label" style="font-weight:700;color:var(--primary);font-size:1.1em;margin-bottom:4px;">${c.hotel_name}</div>
        <div style="font-size:0.85em;color:var(--text-muted);margin-bottom:2px;"><i class="fas fa-user-tie" style="width:16px;"></i> ${c.contact_person || '—'}</div>
        <div style="font-size:0.85em;color:var(--text-muted);"><i class="fas fa-map-marker-alt" style="width:16px;"></i> ${c.address || '—'}</div>
      </div>
      <div>
        <div style="font-size:0.85em;color:var(--text-muted);margin-top:4px;margin-bottom:2px;"><i class="fas fa-phone" style="width:16px;"></i> ${c.phone || '—'}</div>
        <div style="font-size:0.85em;color:var(--text-muted);margin-bottom:2px;"><i class="fas fa-envelope" style="width:16px;"></i> ${c.email || '—'}</div>
        <div style="font-size:0.85em;color:var(--text-muted);"><i class="fas fa-calendar-alt" style="width:16px;"></i> Customer since: ${formatDate(c.created_date)}</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
      <span style="font-family:'Playfair Display',serif;font-size:1.1em;font-weight:700;color:var(--primary);">Custom Laundry Prices</span>
      <div class="search-wrap" style="width:250px;margin:0;">
        <i class="fas fa-search"></i>
        <input class="form-input" placeholder="Search items..." oninput="filterCustomerProfileItems(this.value)" autocomplete="off" spellcheck="false"/>
      </div>
    </div>
    
    <div style="font-size:0.8em;color:var(--text-muted);margin-bottom:10px;"><i class="fas fa-info-circle"></i> Leave price inputs empty to use the default catalog prices (displayed as placeholders).</div>

    <div class="table-wrap" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="position:sticky;top:0;background:var(--bg);z-index:10;box-shadow:0 1px 0 var(--border);">
            <th style="padding:10px 12px;text-align:left;background:var(--bg);">Item Name</th>
            <th style="padding:10px 12px;width:120px;background:var(--bg);">Dry Clean</th>
            <th style="padding:10px 12px;width:120px;background:var(--bg);">Wash & Press</th>
            <th style="padding:10px 12px;width:120px;background:var(--bg);">Wash & Dry</th>
          </tr>
        </thead>
        <tbody id="cust-prices-table-body">
          ${itemsRowsHTML}
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('customer-profile-modal')">Close</button>
      ${!isDriver() ? `<button class="btn btn-primary" onclick="saveCustomerProfilePrices(${c.id})"><i class="fas fa-save"></i> Save Custom Prices</button>` : ''}
    </div>`, 'modal-lg');
  
  showModal('customer-profile-modal');
}

function filterCustomerProfileItems(q) {
  const query = q.toLowerCase().trim();
  const rows = document.querySelectorAll('#cust-prices-table-body tr');
  rows.forEach(row => {
    const text = row.dataset.searchText;
    if (!query || text.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

async function saveCustomerProfilePrices(id) {
  const customPricesMap = {};
  let hasErrors = false;

  document.querySelectorAll('#cust-prices-table-body .cust-price-row').forEach(row => {
    const itemId = row.dataset.itemId;
    const dcVal = row.querySelector('.cprice-dc').value.trim();
    const wpVal = row.querySelector('.cprice-wp').value.trim();
    const wdVal = row.querySelector('.cprice-wd').value.trim();

    const custom = {};
    let hasCustom = false;
    
    if (dcVal !== '') {
      const v = parseFloat(dcVal);
      if (isNaN(v) || v < 0) { hasErrors = true; return; }
      custom.dry_clean = v;
      hasCustom = true;
    }
    if (wpVal !== '') {
      const v = parseFloat(wpVal);
      if (isNaN(v) || v < 0) { hasErrors = true; return; }
      custom.wash_press = v;
      hasCustom = true;
    }
    if (wdVal !== '') {
      const v = parseFloat(wdVal);
      if (isNaN(v) || v < 0) { hasErrors = true; return; }
      custom.wash_dry = v;
      hasCustom = true;
    }

    if (hasCustom) {
      customPricesMap[itemId] = custom;
    }
  });

  if (hasErrors) {
    return toast('Please enter valid positive numbers for prices', 'error');
  }

  try {
    await DB.updateCustomer(id, { custom_prices: customPricesMap });
    hideModal('customer-profile-modal');
    toast('Custom prices updated successfully!');
    renderCustomers();
  } catch (err) {
    toast('Failed to save prices: ' + (err.message || err), 'error');
  }
}

let currentBatchPayOption = 'standard';

function selectBatchPayOption(type) {
  currentBatchPayOption = type;
  const deductSec = document.getElementById('batch-deduct-section');
  const optStandard = document.getElementById('batch-opt-standard');
  const optDeduct = document.getElementById('batch-opt-deduct');
  
  if (type === 'standard') {
    if(deductSec) deductSec.style.display = 'none';
    if(optStandard) {
      optStandard.style.background = 'var(--success)';
      optStandard.style.borderColor = 'var(--success)';
      optStandard.style.color = '#fff';
    }
    if(optDeduct) {
      optDeduct.style.background = 'var(--secondary)';
      optDeduct.style.borderColor = 'var(--border)';
      optDeduct.style.color = 'var(--text)';
    }
  } else {
    if(deductSec) deductSec.style.display = 'block';
    if(optStandard) {
      optStandard.style.background = 'var(--secondary)';
      optStandard.style.borderColor = 'var(--border)';
      optStandard.style.color = 'var(--text)';
    }
    if(optDeduct) {
      optDeduct.style.background = '#8b5cf6';
      optDeduct.style.borderColor = '#7c3aed';
      optDeduct.style.color = '#fff';
    }
    document.getElementById('batch-deduct-amount')?.focus();
  }
}

function recalcBatchDeduction(total) {
  const deductInput = document.getElementById('batch-deduct-amount');
  const deductAmount = parseFloat(deductInput.value) || 0;
  const lblCalcDeduct = document.getElementById('lbl-batch-calc-deduct');
  const lblCalcFinal = document.getElementById('lbl-batch-calc-final');
  
  if(lblCalcDeduct) lblCalcDeduct.textContent = `- LKR ${deductAmount.toFixed(2)}`;
  const finalAmount = Math.max(0, total - deductAmount);
  if(lblCalcFinal) lblCalcFinal.textContent = `LKR ${finalAmount.toFixed(2)}`;
}

// ─────────────────────────────────────────────
// RECENT SYSTEM ACTIONS MODULE
// ─────────────────────────────────────────────
let actionsSearch = '';
let actionsCategoryFilter = 'ALL';
let actionsTypeFilter = 'ALL';
let actionsDateFilter = 'ALL';
let actionsPage = 1;
let actionsPerPage = 15;

function getRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

async function renderRecentActions() {
  document.getElementById('page-title').textContent = 'Recent Actions';
  if (document.getElementById('actions-table-body')) {
    await _refreshActionsTable();
    return;
  }

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <div>
        <span class="section-title"><i class="fas fa-history" style="color:var(--primary);margin-right:8px;"></i>Recent System Actions</span>
        <div style="font-size:0.83em;color:var(--text-muted);margin-top:2px;">Complete audit log of system operations, customer additions, phone changes, orders, and payments.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-secondary" onclick="_refreshActionsTable()"><i class="fas fa-sync-alt"></i> Refresh</button>
        <button class="btn btn-secondary" onclick="exportActionsCSV()"><i class="fas fa-file-csv"></i> CSV Export</button>
        <button class="btn btn-secondary" onclick="exportActionsJSON()"><i class="fas fa-file-code"></i> JSON Export</button>
        ${isAdmin() ? `<button class="btn btn-danger" onclick="clearActionsConfirm()"><i class="fas fa-trash-alt"></i> Clear Logs</button>` : ''}
      </div>
    </div>

    <!-- Stats Summary Cards -->
    <div id="actions-stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:22px;"></div>

    <!-- Filter Card -->
    <div class="card" style="margin-bottom:20px;padding:18px;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:12px;align-items:center;">
        <div class="search-wrap">
          <i class="fas fa-search"></i>
          <input class="form-input" id="actions-search-input" placeholder="Search actions, customers, phone numbers, order IDs..."
            value="${actionsSearch}" oninput="actionsSearch=this.value;actionsPage=1;_refreshActionsTable()"/>
        </div>

        <div>
          <select class="form-input form-select" id="actions-category-select" onchange="actionsCategoryFilter=this.value;actionsPage=1;_refreshActionsTable()">
            <option value="ALL" ${actionsCategoryFilter==='ALL'?'selected':''}>All Categories</option>
            <option value="Transport" ${actionsCategoryFilter==='Transport'?'selected':''}>Transport</option>
            <option value="Expense" ${actionsCategoryFilter==='Expense'?'selected':''}>Expense</option>
            <option value="Chemical" ${actionsCategoryFilter==='Chemical'?'selected':''}>Chemical</option>
            <option value="Customer" ${actionsCategoryFilter==='Customer'?'selected':''}>Customer</option>
            <option value="Order" ${actionsCategoryFilter==='Order'?'selected':''}>Order</option>
            <option value="Driver" ${actionsCategoryFilter==='Driver'?'selected':''}>Driver</option>
            <option value="Item" ${actionsCategoryFilter==='Item'?'selected':''}>Item</option>
            <option value="Payment" ${actionsCategoryFilter==='Payment'?'selected':''}>Payment</option>
            <option value="System" ${actionsCategoryFilter==='System'?'selected':''}>System</option>
            <option value="User" ${actionsCategoryFilter==='User'?'selected':''}>User</option>
          </select>
        </div>

        <div>
          <select class="form-input form-select" id="actions-type-select" onchange="actionsTypeFilter=this.value;actionsPage=1;_refreshActionsTable()">
            <option value="ALL">All Action Types</option>
            <option value="Start Trip">Start Trip</option>
            <option value="Set Trip Customers">Set Trip Customers</option>
            <option value="End Trip">End Trip</option>
            <option value="Delete Trip">Delete Trip</option>
            <option value="Add General Expense">Add General Expense</option>
            <option value="Delete Expense">Delete Expense</option>
            <option value="Chemical Stock IN">Chemical Stock IN</option>
            <option value="Chemical Stock OUT">Chemical Stock OUT</option>
            <option value="Add Chemical Master">Add Chemical Master</option>
            <option value="Delete Chemical Master">Delete Chemical Master</option>
            <option value="Add Customer">Add Customer</option>
            <option value="Phone Number Change">Phone Number Change</option>
            <option value="Edit Customer">Edit Customer</option>
            <option value="Delete Customer">Delete Customer</option>
            <option value="New Order Add">New Order Add</option>
            <option value="Edit Order">Edit Order</option>
            <option value="Delete Order">Delete Order</option>
            <option value="Payment Received">Payment Received</option>
            <option value="Deduction Added">Deduction Added</option>
            <option value="Add Driver">Add Driver</option>
            <option value="Add Item">Add Item</option>
            <option value="Settings Updated">Settings Updated</option>
            <option value="User Login">User Login</option>
          </select>
        </div>

        <div>
          <select class="form-input form-select" id="actions-date-select" onchange="actionsDateFilter=this.value;actionsPage=1;_refreshActionsTable()">
            <option value="ALL">All Time</option>
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="LAST_7_DAYS">Last 7 Days</option>
            <option value="LAST_30_DAYS">Last 30 Days</option>
          </select>
        </div>

        <button class="btn btn-secondary" onclick="resetActionsFilters()"><i class="fas fa-undo"></i> Reset</button>
      </div>
    </div>

    <!-- Table Card -->
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action Type</th>
              <th>Category</th>
              <th>Description</th>
              <th>Performed By</th>
              <th style="text-align:center;">Details</th>
            </tr>
          </thead>
          <tbody id="actions-table-body"></tbody>
        </table>
      </div>
      <div id="actions-pagination" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);"></div>
    </div>`;

  await _refreshActionsTable();
}

async function _refreshActionsTable() {
  const tbody = document.getElementById('actions-table-body');
  if (!tbody) return;

  const allActions = await DB.getActions();

  // Filter Data
  let filtered = allActions.filter(a => {
    // Search
    if (actionsSearch) {
      const q = actionsSearch.toLowerCase();
      const matchDesc = (a.description || '').toLowerCase().includes(q);
      const matchType = (a.action_type || '').toLowerCase().includes(q);
      const matchUser = (a.user || '').toLowerCase().includes(q);
      const matchCat = (a.category || '').toLowerCase().includes(q);
      const matchDet = JSON.stringify(a.details || {}).toLowerCase().includes(q);
      if (!matchDesc && !matchType && !matchUser && !matchCat && !matchDet) return false;
    }
    // Category
    if (actionsCategoryFilter !== 'ALL' && a.category !== actionsCategoryFilter) return false;
    // Action Type
    if (actionsTypeFilter !== 'ALL' && a.action_type !== actionsTypeFilter) return false;
    // Date Filter
    if (actionsDateFilter !== 'ALL' && a.timestamp) {
      const actDate = new Date(a.timestamp);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (actionsDateFilter === 'TODAY') {
        if (actDate < todayStart) return false;
      } else if (actionsDateFilter === 'YESTERDAY') {
        const yestStart = new Date(todayStart);
        yestStart.setDate(yestStart.getDate() - 1);
        if (actDate < yestStart || actDate >= todayStart) return false;
      } else if (actionsDateFilter === 'LAST_7_DAYS') {
        const d7 = new Date(todayStart);
        d7.setDate(d7.getDate() - 7);
        if (actDate < d7) return false;
      } else if (actionsDateFilter === 'LAST_30_DAYS') {
        const d30 = new Date(todayStart);
        d30.setDate(d30.getDate() - 30);
        if (actDate < d30) return false;
      }
    }
    return true;
  });

  // Calculate Stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = allActions.filter(a => (a.timestamp || '').startsWith(todayStr)).length;
  const customerCount = allActions.filter(a => a.category === 'Customer').length;
  const orderCount = allActions.filter(a => a.category === 'Order' || a.category === 'Payment').length;

  const statsGrid = document.getElementById('actions-stats-grid');
  if (statsGrid) {
    statsGrid.innerHTML = `
      ${statCard('Total Actions', allActions.length, 'fa-history', '#3b82f6', '#dbeafe', 'All recorded actions')}
      ${statCard("Today's Actions", todayCount, 'fa-calendar-day', '#10b981', '#d1fae5', 'Activities today')}
      ${statCard('Customer Changes', customerCount, 'fa-hotel', '#8b5cf6', '#f3e8ff', 'Add/Edit/Delete/Phone')}
      ${statCard('Orders & Payments', orderCount, 'fa-boxes-stacked', '#06b6d4', '#cffafe', 'Orders & payments')}
    `;
  }

  // Paginate
  const totalPages = Math.ceil(filtered.length / actionsPerPage) || 1;
  if (actionsPage > totalPages) actionsPage = totalPages;
  const startIdx = (actionsPage - 1) * actionsPerPage;
  const pageItems = filtered.slice(startIdx, startIdx + actionsPerPage);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:2em;margin-bottom:8px;">🔍</div>No matching actions found</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(a => {
      const dt = new Date(a.timestamp);
      const timeFormatted = isNaN(dt.getTime()) ? '—' : dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const relTime = getRelativeTime(a.timestamp);

      let badgeStyle = 'background:var(--secondary);color:var(--text);border:1px solid var(--border);';
      let icon = 'fa-info-circle';
      const at = a.action_type || '';

      if (at.includes('Add') || at.includes('New Order')) {
        badgeStyle = 'background:#dcfce7;color:#15803d;border:1px solid #86efac;';
        icon = 'fa-plus-circle';
      } else if (at.includes('Delete')) {
        badgeStyle = 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;';
        icon = 'fa-trash-alt';
      } else if (at.includes('Phone')) {
        badgeStyle = 'background:#fef3c7;color:#92400e;border:1px solid #fde68a;';
        icon = 'fa-phone-alt';
      } else if (at.includes('Edit') || at.includes('Update')) {
        badgeStyle = 'background:#e0f2fe;color:#075985;border:1px solid #bae6fd;';
        icon = 'fa-edit';
      } else if (at.includes('Payment') || at.includes('Deduction')) {
        badgeStyle = 'background:#f3e8ff;color:#7e22ce;border:1px solid #d8b4fe;';
        icon = 'fa-money-bill-wave';
      } else if (at.includes('Login') || at.includes('Logout')) {
        badgeStyle = 'background:#cffafe;color:#0e7490;border:1px solid #a5f3fc;';
        icon = 'fa-user-clock';
      }

      const catIcons = { Customer: 'fa-hotel', Order: 'fa-boxes-stacked', Driver: 'fa-truck', Item: 'fa-list-check', Payment: 'fa-coins', System: 'fa-cog', User: 'fa-user-shield' };
      const catIcon = catIcons[a.category] || 'fa-tag';

      return `<tr>
        <td style="white-space:nowrap;">
          <div style="font-weight:600;font-size:0.88em;">${timeFormatted}</div>
          <span style="font-size:0.75em;color:var(--text-muted);">${relTime}</span>
        </td>
        <td>
          <span class="badge" style="${badgeStyle}">
            <i class="fas ${icon}" style="font-size:0.85em;margin-right:4px;"></i>${at}
          </span>
        </td>
        <td>
          <span style="font-size:0.84em;color:var(--text-muted);font-weight:600;">
            <i class="fas ${catIcon}" style="margin-right:4px;color:var(--primary);"></i>${a.category || 'System'}
          </span>
        </td>
        <td>
          <div style="font-size:0.9em;font-weight:500;line-height:1.4;">${a.description || '—'}</div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72em;font-weight:700;flex-shrink:0;">
              ${(a.user || 'A').charAt(0).toUpperCase()}
            </div>
            <span style="font-size:0.85em;font-weight:600;">${a.user || 'System'}</span>
          </div>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="showActionDetailsModal('${a.id}')" title="View Payload Details">
            <i class="fas fa-info-circle"></i>
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  const pg = document.getElementById('actions-pagination');
  if (pg) {
    pg.innerHTML = `
      <span style="font-size:0.82em;color:var(--text-muted);">Showing ${filtered.length ? startIdx + 1 : 0} to ${Math.min(startIdx + actionsPerPage, filtered.length)} of ${filtered.length} entries</span>
      ` + renderPagination(actionsPage, totalPages, 'changeActionsPage');
  }
}

function changeActionsPage(p) {
  actionsPage = p;
  _refreshActionsTable();
}

function resetActionsFilters() {
  actionsSearch = '';
  actionsCategoryFilter = 'ALL';
  actionsTypeFilter = 'ALL';
  actionsDateFilter = 'ALL';
  actionsPage = 1;

  const sInput = document.getElementById('actions-search-input');
  if (sInput) sInput.value = '';
  const cSel = document.getElementById('actions-category-select');
  if (cSel) cSel.value = 'ALL';
  const tSel = document.getElementById('actions-type-select');
  if (tSel) tSel.value = 'ALL';
  const dSel = document.getElementById('actions-date-select');
  if (dSel) dSel.value = 'ALL';

  _refreshActionsTable();
}

async function showActionDetailsModal(actionId) {
  const actions = await DB.getActions();
  const act = actions.find(a => String(a.id) === String(actionId));
  if (!act) return toast('Action detail not found', 'error');

  const dt = new Date(act.timestamp);
  const timeFormatted = isNaN(dt.getTime()) ? act.timestamp : dt.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let detailsRows = '';
  if (act.details && Object.keys(act.details).length > 0) {
    detailsRows = Object.entries(act.details).map(([k, v]) => `
      <tr>
        <td style="font-family:monospace;font-size:0.84em;font-weight:700;color:var(--primary);width:35%;">${k}</td>
        <td style="font-size:0.88em;word-break:break-all;">${typeof v === 'object' ? '<pre style="margin:0;font-size:0.82em;">' + JSON.stringify(v, null, 2) + '</pre>' : String(v)}</td>
      </tr>
    `).join('');
  } else {
    detailsRows = `<tr><td colspan="2" style="text-align:center;color:var(--text-muted);padding:14px;">No extra payload recorded</td></tr>`;
  }

  createModal('action-details-modal', `Action Details: ${act.action_type}`, `
    <div style="margin-bottom:16px;">
      <div style="font-size:0.85em;color:var(--text-muted);">Timestamp</div>
      <div style="font-weight:700;font-size:1.05em;margin-bottom:10px;">${timeFormatted}</div>
      <div style="font-size:0.85em;color:var(--text-muted);">Description</div>
      <div style="font-size:0.95em;font-weight:600;padding:10px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;">${act.description}</div>
      <div style="display:flex;gap:20px;font-size:0.88em;">
        <div><strong>Category:</strong> ${act.category || 'System'}</div>
        <div><strong>Performed By:</strong> ${act.user || 'System'}</div>
      </div>
    </div>
    <div style="font-weight:700;font-size:0.95em;margin-bottom:8px;">Payload Details</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Property</th><th>Value</th></tr></thead>
        <tbody>${detailsRows}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px;">
      <button class="btn btn-secondary" onclick="hideModal('action-details-modal')">Close</button>
    </div>
  `);
  showModal('action-details-modal');
}

async function exportActionsCSV() {
  const actions = await DB.getActions();
  if (!actions.length) return toast('No actions to export', 'warning');

  let csv = 'ID,Timestamp,Action Type,Category,Description,Performed By,Details\n';
  actions.forEach(a => {
    const row = [
      `"${a.id || ''}"`,
      `"${a.timestamp || ''}"`,
      `"${(a.action_type || '').replace(/"/g, '""')}"`,
      `"${(a.category || '').replace(/"/g, '""')}"`,
      `"${(a.description || '').replace(/"/g, '""')}"`,
      `"${(a.user || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(a.details || {}).replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `recent_system_actions_${today()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Actions exported to CSV!');
}

async function exportActionsJSON() {
  const actions = await DB.getActions();
  if (!actions.length) return toast('No actions to export', 'warning');

  const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `recent_system_actions_${today()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Actions exported to JSON!');
}

async function clearActionsConfirm() {
  if (!requireAdmin()) return;
  confirmDialog('Are you sure you want to clear all logged recent system actions?', async () => {
    await DB.clearActions();
    toast('System actions log cleared');
    _refreshActionsTable();
  });
}

