// app.js - Main Application

let currentPage = 'dashboard';
// Set by navigate() the first time it's called. initApp()'s own boot-time navigate(defaultPage)
// checks this so it never clobbers a page the user already clicked into during the brief window
// between the sidebar becoming visible and initApp() actually running (both happen after
// enterAppWithSession's own awaited network calls, so that window is real, not theoretical).
let _hasNavigatedOnce = false;
let dashCharts  = {};
let showUndoButtonSetting = 'true';

// Unsaved changes beforeunload listener
window.isFormDirty = false;
window.addEventListener('beforeunload', (e) => {
  if (window.isFormDirty) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    return e.returnValue;
  }
});

// ─────────────────────────────────────────────
// AUTH — real Supabase Auth login (role-based)
// ─────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!email || !password) return toast('Enter email and password', 'error');

  // Give the button an immediate loading state — signing in is a network
  // round-trip, and previously nothing indicated progress on click, which
  // read as unresponsive/laggy for however long that request took.
  const btn = document.querySelector('#login-screen .btn-signin');
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  }

  try {
    const session = await DB.signIn(email, password);
    if (!session) { toast('Invalid email or password', 'error'); return; }
    await enterAppWithSession(session);
  } catch (err) {
    console.error('Login error:', err);
    toast(err.message || 'Invalid email or password', 'error');
  } finally {
    // Only restore the button if login didn't succeed — on success
    // enterAppWithSession() has already hidden #login-screen, so there's
    // nothing left to restore the button on.
    if (btn && document.getElementById('login-screen').style.display !== 'none') {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
}

// Fades the boot loader out instead of an instant display:none cut, then
// removes it from layout once the CSS transition finishes (with a fallback
// timeout in case transitionend doesn't fire for any reason).
function hideBootLoader() {
  const bootLoader = document.getElementById('auth-boot-loader');
  if (!bootLoader || bootLoader.style.display === 'none') return;
  bootLoader.classList.add('boot-fade-out');
  const finish = () => { bootLoader.style.display = 'none'; };
  bootLoader.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 500);
}

// Shared by both the login button and automatic session restore on page load
async function enterAppWithSession(session) {
  currentUser = DB.sessionToCurrentUser(session);
  if (!currentUser) return false;

  // Driver logins are linked via drivers.auth_user_id, not user_metadata —
  // resolve it once here so isDriver() screens (Dashboard, Transport
  // customer scoping) have currentUser.driver_id available immediately.
  if (currentUser.role === 'driver') {
    try { currentUser.driver_id = await DB.getCurrentDriverId(); }
    catch (e) { console.error('getCurrentDriverId failed:', e); currentUser.driver_id = null; }
  }

  document.getElementById('login-screen').style.display = 'none';
  const appEl = document.getElementById('app');
  appEl.style.display = 'flex';
  appEl.classList.add('screen-fade-in');
  hideBootLoader();

  await DB.logAction('User Login', `User "${currentUser.display_name}" logged in successfully`, { username: currentUser.username, role: currentUser.role }, 'User');

  const roleNames = { admin: 'Admin', user: 'User', driver: 'Driver' };
  const avatar = document.getElementById('topbar-avatar');
  if (avatar) {
    const roleText = roleNames[currentUser.role] || 'User';
    avatar.textContent = roleText;
    avatar.title       = `${currentUser.display_name} (${roleText})`;
  }
  updateRoleChip();
  initApp();
  setTimeout(initGlobalSearch, 300);
  return true;
}

// On page load, Supabase Auth may already have a valid persisted session
// (it keeps its own storage independent of anything this app writes) — skip
// straight to the app instead of forcing a re-login every visit.
(async function restoreSessionOnLoad() {
  let loggedIn = false;
  try {
    const session = await DB.getSession();
    if (session) loggedIn = await enterAppWithSession(session);
  } catch (e) {
    console.warn('Session restore failed:', e);
  } finally {
    // enterAppWithSession() already fades the boot loader out and reveals
    // #app on success; only need to handle the "no session" / error path
    // here, since #login-screen starts hidden to avoid flashing it at
    // every logged-in user.
    if (!loggedIn) {
      hideBootLoader();
      const loginEl = document.getElementById('login-screen');
      loginEl.style.display = 'flex';
      loginEl.classList.add('screen-fade-in');
    }
  }
})();

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
    return ['dashboard', 'orders', 'customers', 'drivers', 'vehicles', 'transport', 'paynow', 'invoices', 'deductions', 'items', 'expenses', 'analytics', 'reports', 'pendings', 'recent-actions', 'trash', 'settings'];
  }
  if (isStaffUser()) {
    return ['dashboard', 'orders', 'customers', 'drivers', 'vehicles', 'transport', 'paynow', 'deductions', 'items', 'expenses', 'pendings', 'settings'];
  }
  if (isDriver()) {
    return ['dashboard', 'transport', 'vehicles', 'customers', 'orders', 'settings'];
  }
  return ['dashboard', 'settings'];
}

function canDelete() { return isAdmin(); }
function canAddOrders() { return isAdmin() || isStaffUser() || isDriver(); }
function canEditOrders() { return isAdmin() || isStaffUser(); }
// Narrower than canEditOrders — drivers get exactly this one exception (see
// Solution.md §4.2): recording a customer-returned item only inserts an
// order_item_flags row, it never touches orders/order_items, so it doesn't
// need full order-edit access. Admin/staff can use it too, e.g. to log a
// return without opening the full edit modal.
function canMarkReturned() { return isAdmin() || isStaffUser() || isDriver(); }
function canEditCustomers() { return true; } // Admin, Staff User, Driver all can add/edit customers
function canEditDrivers() { return isAdmin() || isStaffUser(); }
function canEditVehicles() { return isAdmin() || isStaffUser(); }
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

  // Trash is admin-only (only admin can delete anything — canDelete()),
  // same reasoning as the topbar Recent Actions button being effectively
  // admin-only via the page allow-list above.
  const trashBtn = document.getElementById('topbar-trash-btn');
  if (trashBtn) trashBtn.style.display = isAdmin() ? 'inline-flex' : 'none';

  if (!allowed.includes(currentPage)) {
    navigate('dashboard');
  }
}

function doLogout() {
  confirmDialog('Are you sure you want to logout?', () => {
    // Clearing currentUser and swapping to the login screen is purely local
    // — it doesn't need the Supabase sign-out round trip to finish first.
    // The old version awaited logAction() then signOut() before touching
    // the DOM at all, so the app just sat frozen for however long that
    // network call took (newchanges2.md: "Logout Button is not efficient").
    // Flip the UI now; let sign-out + the audit log finish in the background.
    const loggingOutUser = currentUser;
    currentUser = null;
    // Reset navigation state so the NEXT login always re-renders from
    // scratch — without this, initApp()'s "only navigate on first boot"
    // guard (_hasNavigatedOnce) stayed true across the logout, so logging
    // back in as a different role (e.g. driver after admin) skipped
    // navigate('dashboard') entirely and left the previous user's page on
    // screen (newchanges2.md).
    _hasNavigatedOnce = false;
    currentPage = 'dashboard';
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('app').style.display    = 'none';
    document.getElementById('login-screen').style.display = 'flex';

    DB.signOut().catch(e => console.error('signOut error:', e));
    if (loggingOutUser) {
      DB.logAction('User Logout', `User "${loggingOutUser.display_name}" logged out`, { username: loggingOutUser.username }, 'User').catch(() => {});
    }
  });
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
let _topbarDateInterval = null;
async function initApp() {
  updateTopbarDate();
  // Guard against a second timer stacking up — initApp() runs on every
  // enterAppWithSession, i.e. every login, and the handle was never kept
  // around to clear.
  if (_topbarDateInterval) clearInterval(_topbarDateInterval);
  _topbarDateInterval = setInterval(updateTopbarDate, 60000);
  // Navigate immediately — don't block on seed/settings. Guarded so this boot-time default
  // doesn't clobber a page the user already clicked into during the async gap before initApp()
  // ran (see _hasNavigatedOnce).
  if (!_hasNavigatedOnce) {
    navigate('dashboard');
  }
  // Run these in background so they never delay the first page render
  DB.seedDemoData().catch(e => console.warn('seedDemoData:', e));
  applySettings().catch(e => console.warn('applySettings:', e));
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

  // Toggle SAGA AI topbar button
  const fab = document.getElementById('gemini-fab');
  const drawer = document.getElementById('gemini-drawer');
  if (showAiBtn === 'false') {
    if (fab) fab.style.display = 'none';
    if (drawer) drawer.style.display = 'none';
  } else {
    if (fab) fab.style.display = 'inline-flex';
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
    page = 'dashboard';
  }
  currentPage = page;
  _hasNavigatedOnce = true;
  Object.values(dashCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  dashCharts = {};

  document.querySelectorAll('nav.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  const titles = {
    dashboard: 'Dashboard', customers: 'Customers', drivers: 'Drivers', vehicles: 'Vehicles', transport: 'Transport & Trip Management',
    orders: 'Orders', paynow: 'Pay Now', invoices: 'Invoices',
    items: 'Items', expenses: 'Expenses', analytics: 'Data Analytics', reports: 'Reports', settings: 'Settings', deductions: 'Deductions',
    pendings: 'Pendings & Returns',
    'recent-actions': 'Recent Actions',
    trash: 'Trash'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const pages = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    drivers:   renderDrivers,
    vehicles:  renderVehicles,
    transport: renderTransportPage,
    orders:    renderOrders,
    paynow:    renderPayNow,
    invoices:  renderInvoices,
    items:     renderItems,
    expenses:  renderExpensesPage,
    analytics: () => { if (!isAdmin()) { navigate('dashboard'); } else { renderAnalytics(); } },
    reports:   () => { if (!requireAdmin()) { navigate('dashboard'); } else { renderReports(); } },
    settings:  renderSettings,
    deductions: renderDeductions,
    pendings:  renderPendingsPage,
    'recent-actions': renderRecentActions,
    trash:     () => { if (!requireAdmin()) { navigate('dashboard'); } else { renderTrash(); } }
  };
  if (pages[page]) pages[page]();
}

function renderPendingsPage() {
  const contentDiv = document.getElementById('content');
  contentDiv.innerHTML = `<div id="page-pendings" class="page-content"></div>`;
  PendingsModule.init();
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

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle('collapsed');
  if (main) main.classList.toggle('collapsed', collapsed);
  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn) btn.title = collapsed ? 'Expand Navigation' : 'Collapse Navigation';
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function renderDashboard() {
  if (isDriver()) return renderDriverDashboard();

  document.getElementById('page-title').textContent = 'Dashboard';
  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  let orders = [], invoices = [], payments = [];
  let expenseCategories = [], expenseTypes = [], expenseAmounts = [], expenseEntries = [];
  try {
    [orders, invoices, payments, expenseCategories, expenseTypes, expenseAmounts, expenseEntries] = await Promise.all([
      DB.getOrders().catch(() => []),
      DB.getInvoices().catch(() => []),
      DB.getPayments().catch(() => []),
      DB.getExpenseCategories().catch(() => []),
      DB.getExpenseTypes().catch(() => []),
      DB.getExpenseAmounts().catch(() => []),
      DB.getExpenseEntries().catch(() => [])
    ]);
  } catch (e) { console.warn('Dashboard data fetch:', e); }

  const todayStr = today();
  const todayPickups    = orders.filter(o => o.pickup_date === todayStr).length;
  const curMonth        = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  // "Billed" = accrual figures (what was invoiced, regardless of payment status).
  // "Collected" = actual cash in hand (advance payments taken at order time + later payments logged).
  // These are kept as two distinct figures throughout the system (see Analytics tab) because
  // conflating them overstates real cash position — an order can be "billed" long before it's paid.
  const monthlyOrders   = orders.filter(o => (o.created_at || '').startsWith(curMonth));
  const monthlyBilled   = monthlyOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const monthlyCollectedAdv = monthlyOrders.reduce((s, o) => s + (parseFloat(o.advance_payment) || 0), 0);
  const monthlyCollectedPay = (payments || []).filter(p => (p.date || '').startsWith(curMonth)).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const monthlyCollected = monthlyCollectedAdv + monthlyCollectedPay;
  const invMap = Object.fromEntries((invoices || []).map(i => [i.order_id, i]));
  const payMap = {};
  (payments || []).forEach(p => {
    if (p.invoice_id) {
      (payMap[p.invoice_id] ||= []).push(p);
    }
  });

  const pendingOrders   = orders.filter(o => {
    const inv = invMap[o.id];
    return inv ? inv.paid_status !== 'Paid' : o.status !== 'Paid';
  });
  const pendingPaymentsCount  = pendingOrders.length;
  const pendingPaymentsAmount = pendingOrders.reduce((sum, o) => {
    const inv = invMap[o.id];
    if (inv) {
      if (typeof Financials !== 'undefined' && Financials.computeInvoiceFinancials) {
        const fin = Financials.computeInvoiceFinancials(inv, [], payMap[inv.id] || []);
        return sum + (fin.balance || 0);
      }
      return sum + (inv.balance != null ? (parseFloat(inv.balance) || 0) : Math.max(0, (parseFloat(o.total_amount) || 0) - (parseFloat(o.advance_payment) || 0)));
    }
    return sum + Math.max(0, (parseFloat(o.total_amount) || 0) - (parseFloat(o.advance_payment) || 0));
  }, 0);
  const totalBilled     = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

  // The Promise.all above can resolve well after the user has already navigated to another
  // page (e.g. clicking Data Analytics right after login, before Dashboard's fetch finishes) —
  // without this guard, this stale write clobbers whatever that other page already rendered
  // into the same #content element.
  if (currentPage !== 'dashboard') return;

  contentEl.innerHTML = `
    <div style="margin-bottom:22px;">
      <div style="font-size:0.85em;color:var(--text-muted);">Good ${getGreeting()}, <strong>${escapeHtml(currentUser?.display_name || 'User')}</strong></div>
      <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:var(--text);">Welcome to Sagacious Washing Center</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:16px;margin-bottom:24px;">
      ${statCard("Today's Pickups",          todayPickups,                              "fa-truck",          "#3b82f6", "#dbeafe", "Scheduled for today")}
      ${statCard("Pending Payments",         formatCurrency(pendingPaymentsAmount),     "fa-clock",          "#f59e0b", "#fef9c3", `${pendingPaymentsCount} order${pendingPaymentsCount !== 1 ? 's' : ''} awaiting payment`)}
      ${statCard("Monthly Billed (Accrual)", formatCurrency(monthlyBilled),             "fa-coins",          "#8b5cf6", "#f3e8ff", "All bills invoiced this month")}
      ${statCard("Monthly Cash Collected",   formatCurrency(monthlyCollected),          "fa-wallet",         "#10b981", "#dcfce7", "Actually received this month")}
      ${statCard("Total Billed (All-Time)",  formatCurrency(totalBilled),               "fa-money-bill-wave","#06b6d4", "#cffafe", "All bill types, accrual")}
    </div>
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;margin-bottom:24px;">
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;">Daily Orders by Status (Last 14 Days)</div>
        <div class="chart-container"><canvas id="revenue-chart"></canvas></div>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:14px;font-family:'Playfair Display',serif;"><i class="fas fa-receipt" style="color:var(--primary);margin-right:8px;"></i>Expense Distribution – ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
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

  try { await renderDashCharts(orders, payments, expenseCategories, expenseTypes, expenseAmounts, expenseEntries); } catch(e) { console.warn('charts:', e); }
  try { await renderRecentOrders(orders); } catch(e) { console.warn('recent orders:', e); }
  try { await renderUnpaidInvoices(invoices, orders); } catch(e) { console.warn('unpaid invoices:', e); }
}

// ─────────────────────────────────────────────
// DRIVER DASHBOARD (newchanges2.md) — a driver's own landing page: their
// trip/KM totals plus every order, split into three buckets so all orders
// are visible to all drivers:
//   - "Assigned to Me"   — full actions (bulk-select + Mark Delivered)
//   - "Available Orders" — unassigned, view-only (Order Details)
//   - "Other Drivers"    — assigned to someone else, view-only (Order Details)
// markOrderDelivered/markOrdersDeliveredBulk live in orders.js since they're
// the same order_id-level actions available to admin/staff from the Orders
// tab. Wrapped in an id'd wrapper div so those functions can tell whether to
// refresh this view vs. the admin Orders table.
// ─────────────────────────────────────────────
let driverSelectedOrderIds = new Set();

async function renderDriverDashboard() {
  document.getElementById('page-title').textContent = 'Dashboard';
  const contentEl = document.getElementById('content');
  if (!contentEl) return;
  showLoading('content', 'Loading Dashboard...');

  const driverId = currentUser && currentUser.driver_id;
  if (!driverId) {
    contentEl.innerHTML = `<div id="driver-dashboard-page" class="card" style="text-align:center;padding:48px;color:var(--text-muted);">
      <i class="fas fa-user-slash" style="font-size:2em;margin-bottom:12px;display:block;"></i>
      Your login isn't linked to a driver profile yet — ask an admin to link it from Drivers &gt; Manage Login.
    </div>`;
    return;
  }

  driverSelectedOrderIds = new Set();

  let allTrips = [], allOrders = [], customers = [], drivers = [];
  try {
    [allTrips, allOrders, customers, drivers] = await Promise.all([
      DB.getTrips().catch(() => []),
      DB.getOrders().catch(() => []),
      DB.getCustomers().catch(() => []),
      DB.getDrivers().catch(() => [])
    ]);
  } catch (e) { console.warn('Driver dashboard data fetch:', e); }

  const driverTrips = (allTrips || []).filter(t => t.driver_id != null && String(t.driver_id) === String(driverId));
  const totalTrips = driverTrips.length;
  const totalKms = driverTrips.reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0);
  const custMap = Object.fromEntries((customers || []).map(c => [c.id, c]));
  const drvMap = Object.fromEntries((drivers || []).map(d => [d.id, d]));

  // Delivered orders drop off every driver-facing list entirely once
  // delivered (newchanges2.md) — there's nothing left for a driver to do
  // with them, so they'd just be clutter.
  const nonDelivered = o => o.delivery_status !== 'delivered';
  const myOrders = (allOrders || []).filter(o => String(o.driver_id) === String(driverId) && nonDelivered(o));
  const availableOrders = (allOrders || []).filter(o => !o.driver_id && nonDelivered(o));
  const otherOrders = (allOrders || []).filter(o => o.driver_id != null && String(o.driver_id) !== String(driverId) && nonDelivered(o));

  const custName = o => escapeHtml(custMap[o.customer_id] ? custMap[o.customer_id].hotel_name : getOrderCustomerName(o));

  const myRows = myOrders.map(o => `<tr>
      <td style="text-align:center;"><input type="checkbox" class="drv-row-check" data-order-id="${o.id}" ${driverSelectedOrderIds.has(o.id)?'checked':''} onchange="toggleDriverOrderSelection(${o.id},this.checked)"/></td>
      <td><strong style="font-family:monospace;color:var(--primary);">${o.batch_id || '—'}</strong></td>
      <td>${custName(o)}</td>
      <td><strong>${formatCurrency(o.total_amount)}</strong></td>
      <td>${o.driver_assigned_at ? formatDate(o.driver_assigned_at) : '—'}</td>
      <td>${statusBadge('Out for Delivery')}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary btn-sm" onclick="markOrderDelivered(${o.id})"><i class="fas fa-check"></i> Mark Delivered</button>
      </td>
    </tr>`).join('');

  // Available (unassigned) orders let ANY driver pick them up themselves —
  // newchanges2.md: "any driver can un-assigned order and can deliver them".
  // Self-assigning moves it into "Assigned to Me" above, where Mark
  // Delivered becomes available.
  const availableRows = availableOrders.map(o => `<tr>
      <td><strong style="font-family:monospace;color:var(--primary);">${o.batch_id || '—'}</strong></td>
      <td>${custName(o)}</td>
      <td><strong>${formatCurrency(o.total_amount)}</strong></td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="viewOrderDetails(${o.id})"><i class="fas fa-eye"></i> Order Details</button>
          <button class="btn btn-primary btn-sm" onclick="driverAssignOrderToSelf(${o.id})"><i class="fas fa-hand-holding"></i> Assign to Me</button>
        </div>
      </td>
    </tr>`).join('');

  const viewOnlyRows = (list, extraCol) => list.map(o => `<tr>
      <td><strong style="font-family:monospace;color:var(--primary);">${o.batch_id || '—'}</strong></td>
      <td>${custName(o)}</td>
      <td><strong>${formatCurrency(o.total_amount)}</strong></td>
      ${extraCol ? `<td>${extraCol(o)}</td>` : ''}
      <td style="text-align:center;">
        <button class="btn btn-secondary btn-sm" onclick="viewOrderDetails(${o.id})"><i class="fas fa-eye"></i> Order Details</button>
      </td>
    </tr>`).join('');

  contentEl.innerHTML = `
    <div id="driver-dashboard-page">
      <div class="section-header" style="margin-bottom:16px;">
        <span class="section-title">Welcome, ${escapeHtml(currentUser.display_name || currentUser.username)}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
        <div class="stat-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div class="label">Total Trips</div>
            <div style="background:#dcfce7;color:#16a34a;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-truck-fast"></i></div>
          </div>
          <div class="value" style="color:#16a34a;">${totalTrips}</div>
          <div class="sub">${driverTrips.filter(t => t.status === 'Completed').length} completed</div>
        </div>

        <div class="stat-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div class="label">Total KMs Driven</div>
            <div style="background:#dbeafe;color:#2563eb;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-route"></i></div>
          </div>
          <div class="value" style="color:#2563eb;">${totalKms.toLocaleString('en-LK', { maximumFractionDigits: 1 })} <span style="font-size:0.6em;font-weight:600;">KM</span></div>
          <div class="sub">Across all recorded trips</div>
        </div>

        <div class="stat-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div class="label">Assigned Orders</div>
            <div style="background:#fef9c3;color:#92400e;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-boxes-stacked"></i></div>
          </div>
          <div class="value" style="color:#92400e;">${myOrders.length}</div>
          <div class="sub">Currently out for delivery</div>
        </div>
      </div>

      <div class="card" style="padding:0;margin-bottom:20px;">
        <div class="section-header" style="padding:16px 20px 0;margin-bottom:0;">
          <span class="section-title" style="font-size:1em;">Assigned to Me</span>
          <button id="drv-mark-delivered-btn" class="btn btn-primary btn-sm" style="display:none;" onclick="markOrdersDeliveredBulk(Array.from(driverSelectedOrderIds))">
            <i class="fas fa-check-double"></i> Mark Delivered (<span id="drv-selected-count">0</span>)
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:36px;text-align:center;"><input type="checkbox" id="drv-select-all" onchange="toggleAllDriverOrderSelection(this)"/></th>
              <th>Order ID</th><th>Customer Name</th><th>Order Amount</th><th>Assigned Date</th><th>Status</th><th style="text-align:center;">Action</th>
            </tr></thead>
            <tbody>${myRows || `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No orders assigned to you yet</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="card" style="padding:0;margin-bottom:20px;">
        <div class="section-header" style="padding:16px 20px 0;margin-bottom:0;">
          <span class="section-title" style="font-size:1em;">Available Orders <span style="font-weight:400;color:var(--text-muted);font-size:0.85em;">(not yet assigned to any driver)</span></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Order ID</th><th>Customer Name</th><th>Order Amount</th><th style="text-align:center;">Action</th></tr></thead>
            <tbody>${availableRows || `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">No unassigned orders</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="card" style="padding:0;">
        <div class="section-header" style="padding:16px 20px 0;margin-bottom:0;">
          <span class="section-title" style="font-size:1em;">Other Drivers' Orders</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Order ID</th><th>Customer Name</th><th>Order Amount</th><th>Driver</th><th style="text-align:center;">Action</th></tr></thead>
            <tbody>${viewOnlyRows(otherOrders, o => escapeHtml(drvMap[o.driver_id] ? drvMap[o.driver_id].name : '—')) || `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No orders assigned to other drivers</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function toggleDriverOrderSelection(id, checked) {
  if (checked) driverSelectedOrderIds.add(id); else driverSelectedOrderIds.delete(id);
  _updateDriverMarkDeliveredBar();
}

function toggleAllDriverOrderSelection(checkbox) {
  document.querySelectorAll('.drv-row-check').forEach(cb => {
    cb.checked = checkbox.checked;
    const id = parseInt(cb.dataset.orderId);
    if (checkbox.checked) driverSelectedOrderIds.add(id); else driverSelectedOrderIds.delete(id);
  });
  _updateDriverMarkDeliveredBar();
}

function _updateDriverMarkDeliveredBar() {
  const btn = document.getElementById('drv-mark-delivered-btn');
  const countEl = document.getElementById('drv-selected-count');
  if (countEl) countEl.textContent = driverSelectedOrderIds.size;
  if (btn) btn.style.display = driverSelectedOrderIds.size > 0 ? 'inline-flex' : 'none';
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
  'Partially Paid':   '#f59e0b', // orange
  'Unpaid':           '#ef4444'  // red
};
function statusChartColor(status) { return STATUS_CHART_COLORS[status] || '#94a3b8'; }

// Helper: format LKR value as short label (e.g. 1K, 50K, 1.5M)
function fmtLkr(val) {
  const num = parseFloat(val) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toFixed(0);
}

// Curated palette for expense category doughnut — cycles if more categories than colours
const EXPENSE_CAT_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
  '#84cc16', // lime
];

async function renderDashCharts(orders, payments, expenseCategories = [], expenseTypes = [], expenseAmounts = [], expenseEntries = []) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return toLocalISODate(d);
  });
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  // ── Daily Orders by Status (last 14 days) ──
  // Shows total ORDER VALUE (LKR) per status per day — one stacked bar segment per status.
  // X-axis = dates (pickup date, matching the Orders list), Y-axis = LKR value (formatted with K/M shorthand).
  const datasets = ORDER_STATUSES.map(status => ({
    label: status,
    data: days.map(d =>
      orders
        .filter(o => o.status === status && (o.pickup_date || '').startsWith(d))
        .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0)
    ),
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
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: LKR ${Number(c.parsed.y).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 10 },
              callback: function(value) { return fmtLkr(value); }
            }
          }
        }
      }
    });
  }

  // ── Expense Distribution (doughnut) — current month only, per top-level category ──
  const curMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  // Set of entry IDs that fall in the current month
  const curMonthEntryIds = new Set(
    expenseEntries
      .filter(e => (e.entry_date || '').startsWith(curMonth))
      .map(e => e.id)
  );
  // Build a lookup: expense_type_id → category_id
  const typeToCat = {};
  expenseTypes.forEach(t => { typeToCat[t.expense_type_id] = t.category_id; });
  // Sum amounts for current-month entries only
  const catTotals = {};
  expenseAmounts.forEach(a => {
    if (!curMonthEntryIds.has(a.entry_id)) return;
    const catId = typeToCat[a.expense_type_id];
    if (catId) catTotals[catId] = (catTotals[catId] || 0) + (parseFloat(a.amount) || 0);
  });
  // Build ordered labels + data from expense_categories (already sorted by sort_order)
  const catLabels = [];
  const catData   = [];
  const catColors = [];
  expenseCategories.forEach((cat, idx) => {
    const total = catTotals[cat.category_id] || 0;
    if (total > 0) {
      catLabels.push(cat.name);
      catData.push(total);
      catColors.push(EXPENSE_CAT_COLORS[idx % EXPENSE_CAT_COLORS.length]);
    }
  });
  const sCtx = document.getElementById('status-chart')?.getContext('2d');
  if (sCtx) {
    if (catData.length === 0) {
      // No expense data yet — show a friendly placeholder
      sCtx.canvas.parentElement.innerHTML =
        `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);gap:8px;">
           <i class="fas fa-receipt" style="font-size:2rem;opacity:0.3;"></i>
           <span style="font-size:0.85em;">No expense data yet</span>
         </div>`;
    } else {
      dashCharts.status = new Chart(sCtx, {
        type: 'doughnut',
        data: {
          labels: catLabels,
          datasets: [{
            data: catData,
            backgroundColor: catColors,
            borderWidth: 2,
            borderColor: isDark ? '#1e293b' : '#fff',
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: textColor, font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: {
              callbacks: {
                label: c => ` ${c.label}: LKR ${Number(c.parsed).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }
            }
          }
        }
      });
    }
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
            <td>${escapeHtml(getOrderCustomerName(o, cMap))}</td>
            <td>${statusBadge(o.status)}</td>
            <td>${formatCurrency(o.total_amount)}</td>
          </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No orders yet</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function renderUnpaidInvoices(invoices, passedOrders) {
  // Re-use orders already fetched by dashboard; only fetch customers (small table)
  const orders = passedOrders || await DB.getOrders().catch(() => []);
  const customers = await DB.getCustomers().catch(() => []);
  const oMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const unpaid = (invoices || []).filter(i => i.paid_status !== 'Paid').slice(0, 5);
  const el = document.getElementById('unpaid-invoices-table');
  if (!el) return;
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Balance</th></tr></thead>
        <tbody>
          ${unpaid.map(inv => {
            const o = oMap[inv.order_id];
            return `<tr>
              <td style="font-weight:700;">${inv.invoice_number}</td>
              <td>${escapeHtml(o ? getOrderCustomerName(o, cMap) : '—')}</td>
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
let currentDetailCustomerId = null;
let currentCustDetailTab = 'orders';
let custOrderChartInstance = null;

async function renderCustomers() {
  currentDetailCustomerId = null;
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
          <input class="form-input" id="cust-search-input" placeholder="Search customer name, contact, phone..."
            autocomplete="off" spellcheck="false"
            oninput="custSearch=this.value;custPage=1;_refreshCustomersTable()"/>
        </div>
        <span id="cust-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:70px;text-align:center;">No</th>
              <th>Customer Name</th>
              <th style="width:140px;text-align:center;">Action</th>
            </tr>
          </thead>
          <tbody id="cust-table-body"></tbody>
        </table>
      </div>
      <div id="cust-pagination"></div>
    </div>`;
  await _refreshCustomersTable();
  document.getElementById('cust-search-input')?.focus();
}

async function _refreshCustomersTable() {
  const tbody = document.getElementById('cust-table-body');
  if (!tbody) { await renderCustomers(); return; }
  const customers = await DB.getCustomers();
  let filtered = filterData(customers, custSearch, ['hotel_name','contact_person','phone','email','address']);
  filtered = filtered.sort((a,b) => (a.hotel_name||'').localeCompare(b.hotel_name||''));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / custPerPage));
  if (custPage > totalPages) custPage = totalPages;
  const { items } = paginateData(filtered, custPage, custPerPage);
  const countEl = document.getElementById('cust-count');
  if(countEl) countEl.textContent = total+' customer'+(total!==1?'s':'');
  tbody.innerHTML = items.length===0
    ? `<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-muted);">No customers found</td></tr>`
    : items.map((c, idx) => {
        const rowNum = String((custPage - 1) * custPerPage + idx + 1).padStart(2, '0');
        return `<tr>
          <td style="text-align:center;font-weight:700;color:var(--text-muted);font-family:monospace;font-size:1.05em;">${rowNum}</td>
          <td>
            <div style="font-weight:700;font-size:1.02em;color:var(--text);">${escapeHtml(c.hotel_name)}</div>
            ${c.phone ? `<div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;"><i class="fas fa-phone" style="font-size:0.8em;margin-right:4px;"></i>${escapeHtml(c.phone)}</div>` : ''}
          </td>
          <td style="text-align:center;">
            <button class="btn btn-primary btn-sm" onclick="openCustomerDetail(${c.id})" style="padding:6px 16px;font-weight:600;">
              <i class="fas fa-eye"></i> View
            </button>
          </td>
        </tr>`;
      }).join('');
  const pagEl = document.getElementById('cust-pagination');
  if (pagEl) pagEl.innerHTML = renderPagination(custPage, totalPages, 'changeCustPage');
}
function changeCustPage(p) { custPage = p; _refreshCustomersTable(); }

async function openCustomerDetail(customerId, tab = 'orders') {
  currentDetailCustomerId = customerId;
  currentCustDetailTab = tab;

  const [c, orders, allInvoices, allPayments, openFlags] = await Promise.all([
    DB.getCustomer(customerId),
    DB.getOrdersByCustomer(customerId),
    DB.getInvoices(),
    DB.getPayments(),
    DB.getOpenFlagsForCustomer(customerId).catch(() => [])
  ]);

  if (!c) {
    toast('Customer not found', 'error');
    currentDetailCustomerId = null;
    return renderCustomers();
  }

  // Build a set of order IDs belonging to this customer
  const customerOrderIds = new Set((orders || []).map(o => String(o.id)));

  // Filter invoices for this customer by matching order_id
  const customerInvoices = (allInvoices || []).filter(inv => 
    (inv.order_id && customerOrderIds.has(String(inv.order_id))) ||
    (inv.customer_id && String(inv.customer_id) === String(customerId))
  );

  // Group payments by invoice_id
  const payMap = {};
  (allPayments || []).forEach(p => {
    if (!payMap[p.invoice_id]) payMap[p.invoice_id] = [];
    payMap[p.invoice_id].push(p);
  });

  let totalBilled = 0, totalPaid = 0, totalPending = 0;

  // Also group payments by order_id for orders without invoices
  const payByOrderId = {};
  (allPayments || []).forEach(p => {
    if (p.order_id) {
      if (!payByOrderId[p.order_id]) payByOrderId[p.order_id] = [];
      payByOrderId[p.order_id].push(p);
    }
  });

  // Invoiced orders
  const invoicedOrderIds = new Set(customerInvoices.map(inv => String(inv.order_id)));

  // Compute from invoices — also track which orders are fully paid
  const paidOrderIds = new Set();
  customerInvoices.forEach(inv => {
    if (typeof Financials !== 'undefined' && Financials.computeInvoiceFinancials) {
      const fin = Financials.computeInvoiceFinancials(inv, [], payMap[inv.id] || []);
      totalBilled += fin.netPayableTotal;
      totalPaid += fin.totalPaid;
      totalPending += Math.max(0, fin.balance);
      if (fin.isPaid) paidOrderIds.add(String(inv.order_id));
    } else {
      const invTotal = parseFloat(inv.total_amount) || 0;
      const invPaid = (payMap[inv.id] || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const deduction = parseFloat(inv.deduction_amount) || 0;
      const net = Math.max(0, invTotal - deduction);
      totalBilled += net;
      totalPaid += invPaid;
      totalPending += Math.max(0, net - invPaid);
      if (invPaid >= net && net > 0) paidOrderIds.add(String(inv.order_id));
    }
  });

  // For orders without invoices, compute from order total and direct payments
  (orders || []).forEach(o => {
    if (!invoicedOrderIds.has(String(o.id))) {
      const oTotal = parseFloat(o.total_amount) || 0;
      const oPaid = (payByOrderId[o.id] || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const advance = parseFloat(o.advance_payment) || 0;
      const effectivePaid = oPaid + advance;
      totalBilled += oTotal;
      totalPaid += Math.min(effectivePaid, oTotal);
      totalPending += Math.max(0, oTotal - effectivePaid);
      if (effectivePaid >= oTotal && oTotal > 0) paidOrderIds.add(String(o.id));
    }
  });

  const paidOrdersCount   = paidOrderIds.size;
  const unpaidOrdersCount = (orders || []).length - paidOrdersCount;

  document.getElementById('page-title').textContent = c.hotel_name || 'Customer Details';

  const contentEl = document.getElementById('content');
  contentEl.innerHTML = `
    <div class="section-header" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-secondary btn-sm" onclick="currentDetailCustomerId=null;renderCustomers()"><i class="fas fa-arrow-left"></i> Back to Customers</button>
        <span class="section-title" style="font-size:1.25em;">Customer Profile</span>
      </div>
      <div style="display:flex;gap:8px;">
        ${isAdmin() ? `<button class="btn btn-success btn-sm" onclick="printCustomerSalesSummary(${c.id})" style="background:#10b981; border-color:#10b981; font-weight:600;"><i class="fas fa-file-pdf"></i> Summary Report</button>` : ''}
      </div>
    </div>

    <!-- Customer Financial & Order Stat Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Value of Total Bills</div>
          <div style="background:#dbeafe;color:#2563eb;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-file-invoice-dollar"></i>
          </div>
        </div>
        <div class="value" style="color:#2563eb;">${formatCurrency(totalBilled)}</div>
        <div class="sub">${customerInvoices.length > 0 ? customerInvoices.length + ' invoice' + (customerInvoices.length !== 1 ? 's' : '') + ' generated' : 'From order totals'}</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Value of Paid Bills</div>
          <div style="background:#dcfce7;color:#16a34a;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-circle-check"></i>
          </div>
        </div>
        <div class="value" style="color:#16a34a;">${formatCurrency(totalPaid)}</div>
        <div class="sub">Total payments received</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Value of Pending Bills</div>
          <div style="background:#fee2e2;color:#dc2626;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-clock"></i>
          </div>
        </div>
        <div class="value" style="color:${totalPending > 0 ? '#dc2626' : 'var(--text)'};">${formatCurrency(totalPending)}</div>
        <div class="sub">Outstanding balance</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Total No of Orders</div>
          <div style="background:#f3e8ff;color:#9333ea;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-boxes-stacked"></i>
          </div>
        </div>
        <div class="value" style="color:#9333ea;">${(orders || []).length} <span style="font-size:0.6em;font-weight:600;">Orders</span></div>
        <div class="sub">${(orders || []).filter(o => o.delivery_status === 'delivered').length} completed</div>
      </div>
    </div>

    <!-- Paid / Unpaid filter badges -->
    <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:0.82em;color:var(--text-muted);font-weight:600;">Filter orders:</span>
      <button id="cust-filter-all" onclick="filterCustOrders('all')" style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-size:0.82em;font-weight:700;border:2px solid var(--primary);background:var(--primary);color:#fff;cursor:pointer;transition:all 0.18s;">
        <i class="fas fa-list"></i> All (${(orders || []).length})
      </button>
      <button id="cust-filter-paid" onclick="filterCustOrders('paid')" style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-size:0.82em;font-weight:700;border:2px solid #16a34a;background:#f0fdf4;color:#16a34a;cursor:pointer;transition:all 0.18s;">
        <i class="fas fa-circle-check"></i> Paid (${paidOrdersCount})
      </button>
      <button id="cust-filter-unpaid" onclick="filterCustOrders('unpaid')" style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-size:0.82em;font-weight:700;border:2px solid #dc2626;background:#fef2f2;color:#dc2626;cursor:pointer;transition:all 0.18s;">
        <i class="fas fa-clock"></i> Unpaid (${unpaidOrdersCount})
      </button>
    </div>

    <!-- Customer Details Card -->
    <div class="card" style="margin-bottom:20px;border-left:4px solid var(--primary);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:16px;">
        <div>
          <div style="font-size:0.75em;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Customer Details</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:var(--text);">${escapeHtml(c.hotel_name)}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="showEditCustomerModal(${c.id})"><i class="fas fa-edit"></i> Edit</button>
          ${canDelete() ? `<button class="btn btn-danger btn-sm" onclick="deleteCustomerConfirm(${c.id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:16px;background:var(--bg);border-radius:10px;border:1px solid var(--border);">
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Contact Person</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-user-tie" style="color:var(--primary);margin-right:6px;width:14px;"></i>${escapeHtml(c.contact_person || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Phone Number</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-phone" style="color:var(--success);margin-right:6px;width:14px;"></i>${escapeHtml(c.phone || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Email Address</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-envelope" style="color:#8b5cf6;margin-right:6px;width:14px;"></i>${escapeHtml(c.email || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Joined Date</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-calendar-alt" style="color:#06b6d4;margin-right:6px;width:14px;"></i>${formatDate(c.created_date)}</div>
        </div>
        <div style="grid-column:1 / -1;">
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Address</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-map-marker-alt" style="color:#f59e0b;margin-right:6px;width:14px;"></i>${escapeHtml(c.address || '—')}</div>
        </div>
      </div>
    </div>

    ${(openFlags || []).length > 0 ? `
    <!-- Outstanding Pending/Returned Items — surfaced here so staff can't
         forget them, per NewChange.md ("sometimes our employees forgot
         about those pending items"). Same data as the Pendings & Returns
         tab, just scoped to this customer. -->
    <div class="card" style="margin-bottom:20px;border-left:4px solid #f59e0b;">
      <div style="font-family:'Playfair Display',serif;font-size:1.05em;font-weight:700;color:var(--text);margin-bottom:12px;">
        <i class="fas fa-triangle-exclamation" style="color:#f59e0b;"></i> Outstanding Pending / Returned Items
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${openFlags.map(f => {
          const srcOrder = (orders || []).find(o => o.id === f.order_id);
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);font-size:0.88em;">
            <span>
              <span style="font-weight:700;text-transform:capitalize;color:${f.flag_type === 'pending' ? '#92400e' : '#7c2d12'};">${f.flag_type}</span>:
              ${escapeHtml(f.item_name)} × ${f.quantity}
              <span style="color:var(--text-muted);">— from order ${escapeHtml(srcOrder?.batch_id || ('#' + f.order_id))}</span>
            </span>
            <span style="color:var(--text-muted);font-size:0.9em;">${formatDate(f.created_at)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Details Part (Switchable Tabs) -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--card-bg);padding:10px 16px;gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.8em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-right:4px;">Details:</span>
        <button id="cust-tab-btn-orders" class="btn btn-sm ${currentCustDetailTab === 'orders' ? 'btn-primary' : 'btn-secondary'}" onclick="switchCustomerDetailTab(${c.id}, 'orders')">
          <i class="fas fa-boxes-stacked"></i> Order History
        </button>
        <button id="cust-tab-btn-prices" class="btn btn-sm ${currentCustDetailTab === 'prices' ? 'btn-primary' : 'btn-secondary'}" onclick="switchCustomerDetailTab(${c.id}, 'prices')">
          <i class="fas fa-tags"></i> Custom Prices
        </button>
        <button id="cust-tab-btn-graph" class="btn btn-sm ${currentCustDetailTab === 'graph' ? 'btn-primary' : 'btn-secondary'}" onclick="switchCustomerDetailTab(${c.id}, 'graph')">
          <i class="fas fa-chart-line"></i> Graph View
        </button>
      </div>

      <div id="cust-detail-tab-body" style="padding:20px;">
      </div>
    </div>
  `;

  // Stamp each order with its pay status so the table rows know how to filter
  (orders || []).forEach(o => {
    o._payStatus = paidOrderIds.has(String(o.id)) ? 'paid' : 'unpaid';
  });

  await renderCustomerDetailTabBody(c, orders, currentCustDetailTab);
}

async function switchCustomerDetailTab(customerId, tab) {
  currentCustDetailTab = tab;
  ['orders', 'prices', 'graph'].forEach(t => {
    const btn = document.getElementById('cust-tab-btn-' + t);
    if (btn) {
      btn.className = (t === tab) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    }
  });

  const [c, orders] = await Promise.all([
    DB.getCustomer(customerId),
    DB.getOrdersByCustomer(customerId)
  ]);
  if (c) {
    await renderCustomerDetailTabBody(c, orders, tab);
  }
}

// Re-renders the customer profile (stat cards + active sub-tab) if it's
// currently open for the given customer. Call after any order/invoice/
// payment mutation so the stat cards don't go stale.
function refreshCustomerDetailIfOpen(customerId) {
  if (customerId != null && currentDetailCustomerId === customerId) {
    openCustomerDetail(customerId, currentCustDetailTab);
  }
}

// Same as refreshCustomerDetailIfOpen, but looks the customer up via the
// order — for payment/invoice/deduction flows that only know an order_id.
async function refreshCustomerDetailForOrder(orderId) {
  if (currentDetailCustomerId == null || orderId == null) return;
  const order = await DB.getOrder(orderId);
  if (order) refreshCustomerDetailIfOpen(order.customer_id);
}

// Filter the order history table in the customer profile page.
// filter: 'all' | 'paid' | 'unpaid'
function filterCustOrders(filter) {
  const tbody = document.getElementById('cust-orders-tbody');
  if (!tbody) return;

  // Update button active styles
  const styles = {
    all:    { border: 'var(--primary)', bg: 'var(--primary)',   color: '#fff' },
    paid:   { border: '#16a34a',        bg: '#f0fdf4',          color: '#16a34a' },
    unpaid: { border: '#dc2626',        bg: '#fef2f2',          color: '#dc2626' }
  };
  ['all', 'paid', 'unpaid'].forEach(f => {
    const btn = document.getElementById('cust-filter-' + f);
    if (!btn) return;
    const s = styles[f];
    if (f === filter) {
      btn.style.background    = s.border;  // active: filled
      btn.style.color         = f === 'all' ? '#fff' : '#fff';
      btn.style.borderColor   = s.border;
      btn.style.boxShadow     = '0 2px 8px rgba(0,0,0,0.15)';
    } else {
      btn.style.background    = s.bg;
      btn.style.color         = s.color;
      btn.style.borderColor   = s.border;
      btn.style.boxShadow     = '';
    }
  });

  // Show / hide rows
  let visibleCount = 0;
  Array.from(tbody.querySelectorAll('tr[data-pay-status]')).forEach(row => {
    const rowStatus = row.getAttribute('data-pay-status');
    const visible   = filter === 'all' || rowStatus === filter;
    row.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  });

  // Update the count in the heading
  const countEl = document.getElementById('cust-order-count');
  if (countEl) countEl.textContent = visibleCount;

  updateCustOrdersSelectedTotal();
}

// Ticking 2+ orders in a customer's Order History shows a running total —
// only counts boxes on currently-visible rows, so switching the Paid/
// Unpaid/All filter can't silently include a now-hidden row's amount.
function updateCustOrdersSelectedTotal() {
  const el = document.getElementById('cust-orders-selected-total');
  if (!el) return;
  const checks = Array.from(document.querySelectorAll('.cust-order-check:checked'))
    .filter(cb => cb.closest('tr')?.style.display !== 'none');
  if (checks.length >= 2) {
    const total = checks.reduce((s, cb) => s + (parseFloat(cb.dataset.amount) || 0), 0);
    el.style.display = 'block';
    el.textContent = `Total Amount (${checks.length} orders): ${formatCurrency(total)}`;
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

async function renderCustomerDetailTabBody(c, orders, tab) {
  const container = document.getElementById('cust-detail-tab-body');
  if (!container) return;

  if (custOrderChartInstance) {
    try { custOrderChartInstance.destroy(); } catch(e) {}
    custOrderChartInstance = null;
  }

  if (tab === 'orders') {
    const sortedOrders = [...(orders || [])].sort((a,b) => new Date(b.created_at || b.pickup_date || 0) - new Date(a.created_at || a.pickup_date || 0));
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.15em;">Order History (<span id="cust-order-count">${sortedOrders.length}</span>)</div>
        <div id="cust-orders-selected-total" style="display:none;font-weight:700;color:var(--primary);font-size:0.92em;background:var(--bg);border:1px solid var(--border);padding:6px 12px;border-radius:8px;"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:32px;"></th>
              <th>Order ID</th>
              <th>Status</th>
              <th>Total</th>
              <th>Date</th>
              <th style="text-align:center;width:120px;">Action</th>
            </tr>
          </thead>
          <tbody id="cust-orders-tbody">
            ${sortedOrders.map(o => `
              <tr data-pay-status="${o._payStatus || 'unpaid'}" data-order-id="${o.id}">
                <td style="text-align:center;"><input type="checkbox" class="cust-order-check" data-amount="${o.total_amount || 0}" onchange="updateCustOrdersSelectedTotal()"/></td>
                <td><strong>${escapeHtml(o.batch_id || '#' + o.id)}</strong></td>
                <td>${statusBadge(o.status)}</td>
                <td style="font-weight:700;">${formatCurrency(o.total_amount)}</td>
                <td>${formatDate(o.created_at || o.pickup_date)}</td>
                <td style="text-align:center;">
                  <button class="btn btn-primary btn-sm" onclick="navigate('orders'); setTimeout(()=>viewOrderDetails(${o.id}),200)">
                    <i class="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            `).join('') || `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No order history found for this customer</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } else if (tab === 'prices') {
    const items = await DB.getItems();
    items.sort((a,b) => (a.item_name||'').localeCompare(b.item_name||''));
    const customPrices = c.custom_prices || {};

    const itemsRowsHTML = items.map(item => {
      const custom = customPrices[item.id] || {};
      const dcVal = custom.dry_clean != null ? custom.dry_clean : '';
      const wpVal = custom.wash_press != null ? custom.wash_press : '';
      const wdVal = custom.wash_dry != null ? custom.wash_dry : '';

      return `
        <tr class="cust-price-row" data-item-id="${item.id}" data-search-text="${escapeHtml(item.item_name.toLowerCase())} ${escapeHtml((item.item_id||'').toLowerCase())}">
          <td style="padding:10px 12px; border-top: 1px solid var(--border);">
            <strong>${escapeHtml(item.item_name)}</strong>
            <div style="font-size:0.78em;color:var(--text-muted);font-family:monospace;margin-top:2px;">Code: ${escapeHtml(item.item_id || '—')}</div>
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

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1.15em;font-weight:700;color:var(--primary);">Custom Laundry Prices</div>
          <div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;"><i class="fas fa-info-circle"></i> Leave inputs blank to use default catalog prices (shown as placeholders).</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="search-wrap" style="width:240px;margin:0;">
            <i class="fas fa-search"></i>
            <input class="form-input" placeholder="Search items..." oninput="filterCustomerProfileItems(this.value)" autocomplete="off" spellcheck="false"/>
          </div>
          ${!isDriver() ? `<button class="btn btn-primary btn-sm" onclick="saveCustomerProfilePrices(${c.id})"><i class="fas fa-save"></i> Save Custom Prices</button>` : ''}
        </div>
      </div>

      <div class="table-wrap" style="max-height:420px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr style="position:sticky;top:0;background:var(--bg);z-index:10;box-shadow:0 1px 0 var(--border);">
              <th style="padding:10px 12px;text-align:left;background:var(--bg);">Item Name</th>
              <th style="padding:10px 12px;width:130px;background:var(--bg);">Dry Clean (LKR)</th>
              <th style="padding:10px 12px;width:130px;background:var(--bg);">Wash & Press (LKR)</th>
              <th style="padding:10px 12px;width:130px;background:var(--bg);">Wash & Dry (LKR)</th>
            </tr>
          </thead>
          <tbody id="cust-prices-table-body">
            ${itemsRowsHTML}
          </tbody>
        </table>
      </div>

      ${!isDriver() ? `
        <div style="margin-top:16px;display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" onclick="saveCustomerProfilePrices(${c.id})"><i class="fas fa-save"></i> Save Custom Prices</button>
        </div>
      ` : ''}
    `;
  } else if (tab === 'graph') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1.15em;font-weight:700;">Order Value Fluctuations</div>
          <div style="font-size:0.82em;color:var(--text-muted);">Non-linear timeline of total order values (LKR) across order dates</div>
        </div>
      </div>
      <div id="cust-chart-wrap" style="background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--border);">
        <div class="chart-container" style="height:350px;position:relative;">
          <canvas id="cust-order-chart"></canvas>
        </div>
      </div>
    `;

    renderCustomerOrderGraph(orders || []);
  }
}

function renderCustomerOrderGraph(orders) {
  const chartCanvas = document.getElementById('cust-order-chart');
  if (!chartCanvas) return;

  const validOrders = (orders || []).filter(o => o.created_at || o.pickup_date);
  if (!validOrders.length) {
    const wrap = document.getElementById('cust-chart-wrap');
    if (wrap) {
      wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted);"><i class="fas fa-chart-line" style="font-size:2.8em;opacity:0.3;margin-bottom:12px;display:block;"></i>No order history available yet to plot graph.</div>`;
    }
    return;
  }

  // Aggregate total order amounts per date (YYYY-MM-DD)
  const dateMap = {};
  validOrders.forEach(o => {
    const rawDate = o.created_at || o.pickup_date;
    const dateKey = rawDate.slice(0, 10);
    dateMap[dateKey] = (dateMap[dateKey] || 0) + (parseFloat(o.total_amount) || 0);
  });

  // Sort dates chronologically (oldest to newest)
  const sortedDates = Object.keys(dateMap).sort();
  const labels = sortedDates.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  const values = sortedDates.map(d => dateMap[d]);

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const ctx = chartCanvas.getContext('2d');
  
  // Gradient fill under the smooth curve
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0.02)');

  custOrderChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Order Value (LKR)',
        data: values,
        borderColor: '#8b5cf6',
        backgroundColor: gradient,
        borderWidth: 2.5,
        tension: 0.38, // Smooth non-linear curve
        fill: true,
        pointBackgroundColor: '#8b5cf6',
        pointBorderColor: isDark ? '#1e293b' : '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointHoverBackgroundColor: '#7c3aed',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: textColor, font: { size: 11 }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: c => `Order Value: LKR ${Number(c.parsed.y).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45, minRotation: 0 }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: function(value) { return fmtLkr(value); }
          }
        }
      }
    }
  });
}

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
    if (dup) return toast(`Phone ${phone} is already used by "${escapeHtml(dup.hotel_name)}"`, 'error');
  }
  const custId = await DB.addCustomer({hotel_name,contact_person:contact,phone,address,email});
  await DB.logAction(
    'Add Customer',
    `Added new customer "${hotel_name}" (Phone: ${phone || 'N/A'}, Contact: ${contact || 'N/A'})`,
    { id: custId, hotel_name, phone, contact_person: contact, address, email, undo: { type: 'delete_record', entity_type: 'Customer', id: custId } },
    'Customer'
  );
  hideModal('add-cust-modal');
  toast('Customer added!');
  renderCustomers();
}

async function showEditCustomerModal(id) {
  const c = await DB.getCustomer(id); if(!c) return;
  createModal('edit-cust-modal','Edit Customer',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Hotel Name *</label>
        <input class="form-input" id="ec-hotel" value="${escapeHtml(c.hotel_name||'')}" maxlength="100"/></div>
      <div class="form-group"><label class="form-label">Contact Person</label>
        <input class="form-input" id="ec-contact" value="${escapeHtml(c.contact_person||'')}" maxlength="80"/></div>
      <div class="form-group"><label class="form-label">Phone <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
        <input class="form-input" id="ec-phone" value="${escapeHtml(c.phone||'')}" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" oninput="this.value=this.value.replace(/\D/g,'').slice(0,10)"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address</label>
        <input class="form-input" id="ec-address" value="${escapeHtml(c.address||'')}" maxlength="200"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Email</label>
        <input class="form-input" id="ec-email" value="${escapeHtml(c.email||'')}" maxlength="100"/></div>
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
    if (dup) return toast(`Phone ${phone} is already used by "${escapeHtml(dup.hotel_name)}"`, 'error');
  }

  await DB.updateCustomer(id,{hotel_name,contact_person:contact,phone,address,email});

  const undoPayload = oldCust ? { type: 'revert_edit', entity_type: 'Customer', id, previous: { hotel_name: oldCust.hotel_name, contact_person: oldCust.contact_person, phone: oldCust.phone, address: oldCust.address, email: oldCust.email } } : undefined;
  const oldPhone = oldCust ? (oldCust.phone || '') : '';
  if (oldPhone !== phone) {
    await DB.logAction(
      'Phone Number Change',
      `Changed phone number for customer "${hotel_name}" from "${oldPhone || 'None'}" to "${phone || 'None'}"`,
      { id, hotel_name, old_phone: oldPhone, new_phone: phone, contact_person: contact, undo: undoPayload },
      'Customer'
    );
  } else {
    await DB.logAction(
      'Edit Customer',
      `Updated profile details for customer "${hotel_name}"`,
      { id, hotel_name, phone, contact_person: contact, address, email, undo: undoPayload },
      'Customer'
    );
  }

  hideModal('edit-cust-modal');
  toast('Customer updated!');
  if (currentDetailCustomerId === id) {
    openCustomerDetail(id, currentCustDetailTab);
  } else {
    renderCustomers();
  }
}

async function deleteCustomerConfirm(id) {
  if (!canDelete()) return toast('Admin permission required to delete customers', 'error');
  const cust = await DB.getCustomer(id);
  const custName = cust ? cust.hotel_name : 'Customer #' + id;
  const custPhone = cust ? cust.phone : '';
  confirmDialog('Delete this customer? (Their past orders will remain in the system)', async () => {
    try {
      const trashId = cust ? await DB.addTrash({ entity_type: 'Customer', entity_label: custName, payload: cust, deleted_by: currentUser?.display_name }) : null;
      await DB.deleteCustomer(id);
      await DB.logAction(
        'Delete Customer',
        `Deleted customer "${custName}" (Phone: ${custPhone || 'N/A'})`,
        { id, hotel_name: custName, phone: custPhone, undo: trashId ? { type: 'restore_trash', trash_id: trashId } : undefined },
        'Customer'
      );
      toast('Customer deleted successfully');
      currentDetailCustomerId = null;
      renderCustomers();
    } catch (err) {
      console.error('Delete customer error:', err);
      toast('Error deleting customer: ' + (err.message || err), 'error');
    }
  });
}

async function viewCustomerOrders(customerId) {
  openCustomerDetail(customerId, 'orders');
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
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(customer.hotel_name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${o.batch_id || '—'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">${formatCurrency(o.total_amount || 0)}</td>
      </tr>
    `).join('');

    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Sales Summary - ${escapeHtml(customer.hotel_name)}</title>
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
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${escapeHtml(settings.company_name)}</div>
              ${settings.address?`<div style="font-size:0.85em;color:#64748b;margin-top:4px;">${escapeHtml(settings.address)}</div>`:''}
              <div style="font-size:0.85em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).map(escapeHtml).join(' | ')}</div>
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
          <div style="font-weight:700;font-size:1.05em;">${escapeHtml(customer.hotel_name)}</div>
          <div style="color:#64748b;font-size:0.9em;margin-top:4px;">${escapeHtml(customer.address || '')}</div>
          <div style="color:#64748b;font-size:0.9em;">Contact: ${escapeHtml(customer.contact_person || '—')}</div>
          <div style="color:#64748b;font-size:0.9em;">Phone: ${escapeHtml(customer.phone || '—')}</div>
          <div style="color:#64748b;font-size:0.9em;">Email: ${escapeHtml(customer.email || '—')}</div>
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
        ${settings.footer_message?`<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;font-size:0.9em;color:#64748b;font-style:italic;">${escapeHtml(settings.footer_message)}</div>`:''}
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
let drvPage = 1, drvSearch = '', drvPerPage = 12;
let currentDetailDriverId = null;
let currentDriverDetailTab = 'trips';
let drvTripChartInstance = null;

async function renderDrivers() {
  currentDetailDriverId = null;
  document.getElementById('page-title').textContent = 'Drivers';
  if (document.getElementById('drv-table-body')) { await _refreshDriversGrid(); return; }
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Drivers</span>
      <div style="display:flex;gap:8px;">
        ${canBackupRestore() ? `
          <button class="btn btn-secondary" onclick="exportDrivers()" title="Export drivers to JSON"><i class="fas fa-download"></i> Backup</button>
          <button class="btn btn-secondary" onclick="document.getElementById('drv-import-file').click()" title="Import drivers from JSON"><i class="fas fa-upload"></i> Import</button>
          <input type="file" id="drv-import-file" accept=".json" style="display:none" onchange="importDrivers(this)"/>
        ` : ''}
        <button class="btn btn-primary" onclick="showAddDriverModal()"><i class="fas fa-plus"></i> Add Driver</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:12px;align-items:center;">
        <div class="search-wrap" style="flex:1;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="drv-search-input" placeholder="Search driver name, nickname, phone, NIC, vehicle..."
            autocomplete="off" spellcheck="false"
            oninput="drvSearch=this.value;drvPage=1;_refreshDriversGrid()"/>
        </div>
        <span id="drv-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:70px;text-align:center;">No</th>
              <th>Driver Name</th>
              <th style="width:160px;text-align:center;">Status</th>
              <th style="width:140px;text-align:center;">Action</th>
            </tr>
          </thead>
          <tbody id="drv-table-body"></tbody>
        </table>
      </div>
      <div id="drv-pagination"></div>
    </div>`;
  await _refreshDriversGrid();
  document.getElementById('drv-search-input')?.focus();
}

async function _refreshDriversGrid() {
  const tbody = document.getElementById('drv-table-body');
  if (!tbody) { await renderDrivers(); return; }
  const drivers = await DB.getDrivers();
  let filtered = filterData(drivers, drvSearch, ['name','nickname','phone','phone2','nic','vehicle','email','address']);
  filtered = filtered.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / drvPerPage));
  if (drvPage > totalPages) drvPage = totalPages;
  const { items } = paginateData(filtered, drvPage, drvPerPage);
  const countEl = document.getElementById('drv-count');
  if(countEl) countEl.textContent = total+' driver'+(total!==1?'s':'');

  tbody.innerHTML = items.length === 0
    ? `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">No drivers found</td></tr>`
    : items.map((d, idx) => {
        const rowNum = String((drvPage - 1) * drvPerPage + idx + 1).padStart(2, '0');
        const statusVal = (d.status || 'available').toLowerCase();
        const stBadgeClass = statusVal === 'available' ? 'badge-green' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'badge-yellow' : 'badge-gray';
        const stLabel = statusVal === 'available' ? 'Available' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'Busy' : 'Off Duty';

        return `<tr>
          <td style="text-align:center;font-weight:700;color:var(--text-muted);font-family:monospace;font-size:1.05em;">${rowNum}</td>
          <td>
            <div style="font-weight:700;font-size:1.02em;color:var(--text);">
              ${escapeHtml(d.name)}${d.nickname ? ` <span style="font-weight:400;font-size:0.85em;color:var(--text-muted);">(${escapeHtml(d.nickname)})</span>` : ''}
            </div>
            ${d.phone ? `<div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;"><i class="fas fa-phone" style="font-size:0.8em;margin-right:4px;"></i>${escapeHtml(d.phone)}</div>` : ''}
          </td>
          <td style="text-align:center;">
            <button class="btn btn-sm badge ${stBadgeClass}" onclick="cycleDriverStatus(${d.id}, '${statusVal}')" title="Click to cycle status: Available / Busy / Off Duty" style="cursor:pointer;padding:5px 12px;font-size:0.82em;border:none;display:inline-flex;align-items:center;gap:6px;">
              <i class="fas fa-circle" style="font-size:0.6em;"></i> ${stLabel} <i class="fas fa-rotate" style="font-size:0.75em;opacity:0.7;"></i>
            </button>
          </td>
          <td style="text-align:center;">
            <button class="btn btn-primary btn-sm" onclick="openDriverDetail(${d.id})" style="padding:6px 16px;font-weight:600;">
              <i class="fas fa-eye"></i> View
            </button>
          </td>
        </tr>`;
      }).join('');
  const pagEl = document.getElementById('drv-pagination');
  if (pagEl) pagEl.innerHTML = renderPagination(drvPage, totalPages, 'changeDrvPage');
}
function changeDrvPage(p) { drvPage = p; _refreshDriversGrid(); }

async function cycleDriverStatus(id, current) {
  const currentNorm = (current || 'available').toLowerCase() === 'on-trip' ? 'busy' : (current || 'available').toLowerCase();
  const statuses = ['available', 'busy', 'off-duty'];
  const nextStatus = statuses[(statuses.indexOf(currentNorm) + 1) % statuses.length];
  await DB.updateDriver(id, { status: nextStatus });
  const drv = await DB.getDriver(id);
  await DB.logAction('Edit Driver', `Changed driver "${drv?.name || '#' + id}" status to "${nextStatus}"`, { id, status: nextStatus }, 'Driver');
  toast(`Status changed to ${nextStatus === 'available' ? 'Available' : nextStatus === 'busy' ? 'Busy' : 'Off Duty'}`);
  if (currentDetailDriverId === id) {
    openDriverDetail(id, currentDriverDetailTab);
  } else {
    _refreshDriversGrid();
  }
}

async function openDriverDetail(driverId, tab = 'trips') {
  currentDetailDriverId = driverId;
  currentDriverDetailTab = tab;

  const [d, allTrips, linkedLogin] = await Promise.all([
    DB.getDriver(driverId),
    DB.getTrips(),
    isAdmin() ? DB.getUserByDriverId(driverId).catch(() => null) : Promise.resolve(null)
  ]);

  if (!d) {
    toast('Driver not found', 'error');
    currentDetailDriverId = null;
    return renderDrivers();
  }

  // Filter trips for this driver
  const driverTrips = (allTrips || []).filter(t => 
    (t.driver_id && String(t.driver_id) === String(d.id)) ||
    (t.driver_name && (
      t.driver_name.toLowerCase().trim() === (d.name || '').toLowerCase().trim() ||
      (d.nickname && t.driver_name.toLowerCase().trim() === d.nickname.toLowerCase().trim())
    ))
  );

  const totalKms = driverTrips.reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0);
  const totalTripsCount = driverTrips.length;

  const statusVal = (d.status || 'available').toLowerCase();
  const stBadgeClass = statusVal === 'available' ? 'badge-green' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'badge-yellow' : 'badge-gray';
  const stLabel = statusVal === 'available' ? 'Available' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'Busy' : 'Off Duty';

  document.getElementById('page-title').textContent = d.name || 'Driver Details';

  const contentEl = document.getElementById('content');
  contentEl.innerHTML = `
    <div class="section-header" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-secondary btn-sm" onclick="currentDetailDriverId=null;renderDrivers()"><i class="fas fa-arrow-left"></i> Back to Drivers</button>
        <span class="section-title" style="font-size:1.25em;">Driver Profile</span>
      </div>
    </div>

    <!-- Top Summary Stat Cards for Driver -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">
      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Total KMs Travelled</div>
          <div style="background:#dbeafe;color:#2563eb;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-route"></i>
          </div>
        </div>
        <div class="value" style="color:#2563eb;">${totalKms.toLocaleString('en-LK', { maximumFractionDigits: 1 })} <span style="font-size:0.6em;font-weight:600;">KM</span></div>
        <div class="sub">Across all recorded trips</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Total Trips Done</div>
          <div style="background:#dcfce7;color:#16a34a;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-truck-fast"></i>
          </div>
        </div>
        <div class="value" style="color:#16a34a;">${totalTripsCount} <span style="font-size:0.6em;font-weight:600;">Trips</span></div>
        <div class="sub">${driverTrips.filter(t => t.status === 'Completed').length} completed, ${driverTrips.filter(t => t.status === 'In Progress').length} in progress</div>
      </div>
    </div>

    <!-- Driver Details Card -->
    <div class="card" style="margin-bottom:20px;border-left:4px solid var(--primary);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:16px;">
        <div>
          <div style="font-size:0.75em;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Driver Details</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:var(--text);">
            ${escapeHtml(d.name)}
            ${d.nickname ? `<span style="font-size:0.65em;color:var(--text-muted);font-weight:400;margin-left:6px;">(${escapeHtml(d.nickname)})</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="showEditDriverModal(${d.id})"><i class="fas fa-edit"></i> Edit</button>
          ${isAdmin() ? `<button class="btn btn-secondary btn-sm" onclick="showManageDriverLoginModal(${d.id})"><i class="fas fa-key"></i> ${linkedLogin ? 'Manage Login' : 'Create Login'}</button>` : ''}
          ${canDelete() ? `<button class="btn btn-danger btn-sm" onclick="deleteDriverConfirm(${d.id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>
      ${isAdmin() ? `<div style="margin-top:-6px;margin-bottom:16px;font-size:0.82em;color:var(--text-muted);">
        <i class="fas fa-mobile-screen-button" style="margin-right:6px;"></i>DriverApp login:
        ${linkedLogin ? `<span style="color:var(--success);font-weight:600;">${escapeHtml(linkedLogin.email)}</span>` : `<span style="color:var(--danger);font-weight:600;">not linked</span>`}
      </div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:16px;background:var(--bg);border-radius:10px;border:1px solid var(--border);">
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Contact No 1</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-phone" style="color:var(--success);margin-right:6px;width:14px;"></i>${escapeHtml(d.phone || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Contact No 2</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-phone-volume" style="color:#06b6d4;margin-right:6px;width:14px;"></i>${escapeHtml(d.phone2 || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">NIC Number</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-id-card" style="color:#8b5cf6;margin-right:6px;width:14px;"></i>${escapeHtml(d.nic || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Joined Date</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-calendar-alt" style="color:#f59e0b;margin-right:6px;width:14px;"></i>${formatDate(d.created_date)}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Current Status</div>
          <div style="margin-top:4px;">
            <button class="btn btn-sm badge ${stBadgeClass}" onclick="cycleDriverStatus(${d.id}, '${statusVal}')" title="Click to cycle status" style="cursor:pointer;padding:4px 10px;font-size:0.82em;border:none;display:inline-flex;align-items:center;gap:6px;">
              <i class="fas fa-circle" style="font-size:0.6em;"></i> ${stLabel} <i class="fas fa-rotate" style="font-size:0.75em;opacity:0.7;"></i>
            </button>
          </div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Email Address</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-envelope" style="color:#3b82f6;margin-right:6px;width:14px;"></i>${escapeHtml(d.email || '—')}</div>
        </div>
        <div style="grid-column:1 / -1;">
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Address</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-map-marker-alt" style="color:#ec4899;margin-right:6px;width:14px;"></i>${escapeHtml(d.address || '—')}</div>
        </div>
      </div>
    </div>

    <!-- Details Part (Switchable Tabs: Trip History, Graph View) -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--card-bg);padding:10px 16px;gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.8em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-right:4px;">Details:</span>
        <button id="drv-tab-btn-trips" class="btn btn-sm ${currentDriverDetailTab === 'trips' ? 'btn-primary' : 'btn-secondary'}" onclick="switchDriverDetailTab(${d.id}, 'trips')">
          <i class="fas fa-truck-fast"></i> Trip History
        </button>
        <button id="drv-tab-btn-graph" class="btn btn-sm ${currentDriverDetailTab === 'graph' ? 'btn-primary' : 'btn-secondary'}" onclick="switchDriverDetailTab(${d.id}, 'graph')">
          <i class="fas fa-chart-line"></i> Graph View
        </button>
      </div>

      <div id="drv-detail-tab-body" style="padding:20px;">
      </div>
    </div>
  `;

  await renderDriverDetailTabBody(d, driverTrips, currentDriverDetailTab);
}

// Admin-only: create or manage the Supabase Auth login a driver uses to
// sign into the separate DriverApp (see DriverApp/driverApp.md). Linking
// happens server-side in netlify/functions/admin-users.js, which writes
// drivers.auth_user_id using the service-role key.
async function showManageDriverLoginModal(driverId) {
  const [d, linked] = await Promise.all([
    DB.getDriver(driverId),
    DB.getUserByDriverId(driverId).catch(() => null)
  ]);
  if (!d) return;

  const bodyHtml = linked ? `
    <div class="form-group"><label class="form-label">Login Email</label>
      <input class="form-input" id="dl-email" value="${escapeHtml(linked.email)}" type="email" maxlength="100"/></div>
    <div class="form-group"><label class="form-label">Reset Password <span style="color:var(--text-muted);font-size:0.82em;">(leave blank to keep current password)</span></label>
      <input class="form-input" id="dl-password" type="text" placeholder="New password" maxlength="72"/></div>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:8px;">
      <button class="btn btn-danger" onclick="unlinkDriverLogin(${d.id}, '${linked.id}')"><i class="fas fa-unlink"></i> Unlink</button>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="hideModal('drv-login-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveDriverLogin(${d.id}, '${linked.id}')"><i class="fas fa-save"></i> Save</button>
      </div>
    </div>
  ` : `
    <div class="form-group"><label class="form-label">Login Email *</label>
      <input class="form-input" id="dl-email" type="email" placeholder="${(d.name||'driver').toLowerCase().replace(/\\s+/g,'.')}@swc.com" maxlength="100"/></div>
    <div class="form-group"><label class="form-label">Password *</label>
      <input class="form-input" id="dl-password" type="text" placeholder="At least 6 characters" maxlength="72"/></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('drv-login-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveDriverLogin(${d.id}, null)"><i class="fas fa-key"></i> Create Login</button>
    </div>
  `;

  createModal('drv-login-modal', linked ? `Manage Login — ${escapeHtml(d.name)}` : `Create Login — ${escapeHtml(d.name)}`, bodyHtml);
  showModal('drv-login-modal');
}

async function saveDriverLogin(driverId, existingUserId) {
  const email = document.getElementById('dl-email').value.trim();
  const password = document.getElementById('dl-password').value;
  if (!email) return toast('Login email is required', 'error');
  if (!existingUserId && (!password || password.length < 6)) return toast('Password must be at least 6 characters', 'error');

  try {
    const d = await DB.getDriver(driverId);
    let result;
    if (existingUserId) {
      result = await DB._callAdminUsersFn('update', { id: existingUserId, email, ...(password ? { password } : {}), driver_id: driverId });
    } else {
      result = await DB._callAdminUsersFn('create', {
        email, password, role: 'driver',
        username: (d?.name || email.split('@')[0]).toLowerCase().replace(/\s+/g, '.'),
        display_name: d?.name || email,
        driver_id: driverId
      });
    }
    if (result.driver_link_error) {
      toast('Login saved, but linking to the driver profile failed: ' + result.driver_link_error, 'error');
    } else {
      toast('Driver login saved successfully!');
    }
    await DB.logAction('Manage Driver Login', `${existingUserId ? 'Updated' : 'Created'} login "${email}" for driver "${d?.name || '#' + driverId}"`, { driverId, email }, 'Driver');
    hideModal('drv-login-modal');
    if (currentDetailDriverId === driverId) openDriverDetail(driverId, currentDriverDetailTab);
  } catch (err) {
    console.error('saveDriverLogin error:', err);
    toast('Failed to save login: ' + (err.message || err), 'error');
  }
}

function unlinkDriverLogin(driverId, userId) {
  confirmDialog("Unlink this login from the driver? The login account itself is kept — this only removes its access to this driver's profile in DriverApp.", async () => {
    try {
      await DB._callAdminUsersFn('update', { id: userId, driver_id: null });
      toast('Login unlinked');
      hideModal('drv-login-modal');
      if (currentDetailDriverId === driverId) openDriverDetail(driverId, currentDriverDetailTab);
    } catch (err) {
      toast('Failed to unlink: ' + (err.message || err), 'error');
    }
  });
}

async function switchDriverDetailTab(driverId, tab) {
  currentDriverDetailTab = tab;
  ['trips', 'graph'].forEach(t => {
    const btn = document.getElementById('drv-tab-btn-' + t);
    if (btn) {
      btn.className = (t === tab) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    }
  });

  const [d, allTrips] = await Promise.all([
    DB.getDriver(driverId),
    DB.getTrips()
  ]);

  if (d) {
    const driverTrips = (allTrips || []).filter(t => 
      (t.driver_id && String(t.driver_id) === String(d.id)) ||
      (t.driver_name && (
        t.driver_name.toLowerCase().trim() === (d.name || '').toLowerCase().trim() ||
        (d.nickname && t.driver_name.toLowerCase().trim() === d.nickname.toLowerCase().trim())
      ))
    );
    await renderDriverDetailTabBody(d, driverTrips, tab);
  }
}

async function renderDriverDetailTabBody(d, driverTrips, tab) {
  const container = document.getElementById('drv-detail-tab-body');
  if (!container) return;

  if (drvTripChartInstance) {
    try { drvTripChartInstance.destroy(); } catch(e) {}
    drvTripChartInstance = null;
  }

  if (tab === 'trips') {
    const sortedTrips = [...(driverTrips || [])].sort((a,b) => new Date(b.start_date || b.created_at || 0) - new Date(a.start_date || a.created_at || 0));
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.15em;">Trip History (${sortedTrips.length})</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Driver Name</th>
              <th>Trip ID</th>
              <th>Distance</th>
              <th>Date</th>
              <th>Status</th>
              <th style="text-align:center;width:120px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${sortedTrips.map(t => `
              <tr>
                <td><strong>${escapeHtml(d.name)}</strong></td>
                <td><span style="font-family:monospace;font-weight:700;color:var(--primary);">${escapeHtml(t.trip_id || t.id)}</span></td>
                <td style="font-weight:700;color:#2563eb;">${t.distance_km != null ? t.distance_km + ' KM' : '—'}</td>
                <td>${formatDate(t.start_date || t.created_at)}</td>
                <td><span class="badge ${t.status === 'Completed' ? 'badge-green' : 'badge-yellow'}">${t.status || 'In Progress'}</span></td>
                <td style="text-align:center;">
                  <button class="btn btn-secondary btn-sm" onclick="navigate('transport'); setTimeout(() => TransportModule?.viewTripDetails?.('${t.id}'), 200)">
                    <i class="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            `).join('') || `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No trip history found for this driver</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } else if (tab === 'graph') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1.15em;font-weight:700;">Trip Distance Fluctuations</div>
          <div style="font-size:0.82em;color:var(--text-muted);">Non-linear timeline of total distance travelled (KM) across trip dates</div>
        </div>
      </div>
      <div id="drv-chart-wrap" style="background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--border);">
        <div class="chart-container" style="height:350px;position:relative;">
          <canvas id="drv-trip-chart"></canvas>
        </div>
      </div>
    `;

    renderDriverTripGraph(driverTrips || []);
  }
}

function renderDriverTripGraph(trips) {
  const chartCanvas = document.getElementById('drv-trip-chart');
  if (!chartCanvas) return;

  const validTrips = (trips || []).filter(t => (t.start_date || t.created_at) && (parseFloat(t.distance_km) > 0));
  if (!validTrips.length) {
    const wrap = document.getElementById('drv-chart-wrap');
    if (wrap) {
      wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted);"><i class="fas fa-chart-line" style="font-size:2.8em;opacity:0.3;margin-bottom:12px;display:block;"></i>No completed distance data available yet to plot graph.</div>`;
    }
    return;
  }

  // Aggregate total distance per date (YYYY-MM-DD)
  const dateMap = {};
  validTrips.forEach(t => {
    const rawDate = t.start_date || t.created_at;
    const dateKey = rawDate.slice(0, 10);
    dateMap[dateKey] = (dateMap[dateKey] || 0) + (parseFloat(t.distance_km) || 0);
  });

  // Sort dates chronologically (oldest to newest)
  const sortedDates = Object.keys(dateMap).sort();
  const labels = sortedDates.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  const values = sortedDates.map(d => dateMap[d]);

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const ctx = chartCanvas.getContext('2d');
  
  // Gradient fill under the smooth curve
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(6, 182, 212, 0.40)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0.02)');

  drvTripChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Trip Distance (KM)',
        data: values,
        borderColor: '#06b6d4',
        backgroundColor: gradient,
        borderWidth: 2.5,
        tension: 0.38, // Smooth non-linear curve
        fill: true,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: isDark ? '#1e293b' : '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointHoverBackgroundColor: '#0891b2',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: textColor, font: { size: 11 }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: c => `Distance: ${Number(c.parsed.y).toLocaleString('en-LK', { maximumFractionDigits: 1 })} KM`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45, minRotation: 0 }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: function(val) {
              if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K KM';
              return val + ' KM';
            }
          }
        }
      }
    }
  });
}

function showAddDriverModal() {
  createModal('add-drv-modal','Add Driver',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group"><label class="form-label">Full Name *</label>
        <input class="form-input" id="d-name" placeholder="Kamal Rathnayake" maxlength="80"/></div>
      <div class="form-group"><label class="form-label">Nick Name</label>
        <input class="form-input" id="d-nickname" placeholder="Kamal" maxlength="50"/></div>
      <div class="form-group"><label class="form-label">Phone No 1 * <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
        <input class="form-input" id="d-phone" placeholder="0771234567" maxlength="10" inputmode="numeric" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"/></div>
      <div class="form-group"><label class="form-label">Phone No 2 <span style="color:var(--text-muted);font-size:0.82em;">(Optional, 10 digits)</span></label>
        <input class="form-input" id="d-phone2" placeholder="0719876543" maxlength="10" inputmode="numeric" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"/></div>
      <div class="form-group"><label class="form-label">NIC Number *</label>
        <input class="form-input" id="d-nic" placeholder="951234567V / 199512345678" maxlength="20"/></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-input form-select" id="d-status">
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="off-duty">Off Duty</option>
        </select></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Email</label>
        <input class="form-input" id="d-email" type="email" placeholder="driver@swc.lk" maxlength="100"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address *</label>
        <input class="form-input" id="d-address" placeholder="No. 45, Temple Road, Colombo" maxlength="200"/></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('add-drv-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewDriver()"><i class="fas fa-save"></i> Save</button>
    </div>`, 'modal-lg');
  showModal('add-drv-modal');
}

async function saveNewDriver() {
  const name     = document.getElementById('d-name').value.trim();
  const nickname = document.getElementById('d-nickname').value.trim();
  const phone    = document.getElementById('d-phone').value.trim();
  const phone2   = document.getElementById('d-phone2').value.trim();
  const nic      = document.getElementById('d-nic').value.trim();
  const address  = document.getElementById('d-address').value.trim();
  const email    = document.getElementById('d-email').value.trim();
  const status   = document.getElementById('d-status').value;

  if (!name) return toast('Full Name is required', 'error');
  if (!phone) return toast('Phone No 1 is required', 'error');
  if (phone.length !== 10 || !/^\d{10}$/.test(phone)) return toast('Phone No 1 must be exactly 10 digits', 'error');
  if (phone2 && (phone2.length !== 10 || !/^\d{10}$/.test(phone2))) return toast('Phone No 2 must be exactly 10 digits', 'error');
  if (!nic) return toast('NIC Number is required', 'error');
  if (!address) return toast('Address is required', 'error');

  const all = await DB.getDrivers();

  // Duplicate Phone Check
  const dupPhone = all.find(d => 
    (d.phone && d.phone === phone) || 
    (d.phone2 && d.phone2 === phone) ||
    (phone2 && (d.phone === phone2 || d.phone2 === phone2))
  );
  if (dupPhone) {
    return toast(`Phone number is already registered to driver "${escapeHtml(dupPhone.name)}"`, 'error');
  }

  // Duplicate NIC Check
  const dupNic = all.find(d => d.nic && d.nic.toLowerCase().trim() === nic.toLowerCase().trim());
  if (dupNic) {
    return toast(`NIC "${nic}" is already registered to driver "${escapeHtml(dupNic.name)}"`, 'error');
  }

  try {
    const drvId = await DB.addDriver({
      name, nickname, phone, phone2, nic, address, email, status
    });

    await DB.logAction(
      'Add Driver',
      `Added new driver "${name}" (Phone: ${phone}, NIC: ${nic})`,
      { id: drvId, name, nickname, phone, phone2, nic, address, email, status, undo: { type: 'delete_record', entity_type: 'Driver', id: drvId } },
      'Driver'
    );

    hideModal('add-drv-modal');
    toast('Driver added successfully!');
    renderDrivers();
  } catch (err) {
    console.error('saveNewDriver error:', err);
    toast('Failed to save driver: ' + (err.message || err), 'error');
  }
}

async function showEditDriverModal(id) {
  const d = await DB.getDriver(id);
  if(!d) return;

  const statusVal = (d.status || 'available').toLowerCase() === 'on-trip' ? 'busy' : (d.status || 'available').toLowerCase();

  createModal('edit-drv-modal','Edit Driver',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group"><label class="form-label">Full Name *</label>
        <input class="form-input" id="ed-name" value="${escapeHtml(d.name||'')}" maxlength="80"/></div>
      <div class="form-group"><label class="form-label">Nick Name</label>
        <input class="form-input" id="ed-nickname" value="${escapeHtml(d.nickname||'')}" maxlength="50"/></div>
      <div class="form-group"><label class="form-label">Phone No 1 * <span style="color:var(--text-muted);font-size:0.82em;">(10 digits)</span></label>
        <input class="form-input" id="ed-phone" value="${escapeHtml(d.phone||'')}" maxlength="10" inputmode="numeric" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"/></div>
      <div class="form-group"><label class="form-label">Phone No 2 <span style="color:var(--text-muted);font-size:0.82em;">(Optional, 10 digits)</span></label>
        <input class="form-input" id="ed-phone2" value="${escapeHtml(d.phone2||'')}" maxlength="10" inputmode="numeric" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"/></div>
      <div class="form-group"><label class="form-label">NIC Number *</label>
        <input class="form-input" id="ed-nic" value="${escapeHtml(d.nic||'')}" maxlength="20"/></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-input form-select" id="ed-status">
          <option value="available" ${statusVal==='available'?'selected':''}>Available</option>
          <option value="busy" ${statusVal==='busy'?'selected':''}>Busy</option>
          <option value="off-duty" ${statusVal==='off-duty'?'selected':''}>Off Duty</option>
        </select></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Email</label>
        <input class="form-input" id="ed-email" type="email" value="${escapeHtml(d.email||'')}" maxlength="100"/></div>
      <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address *</label>
        <input class="form-input" id="ed-address" value="${escapeHtml(d.address||'')}" maxlength="200"/></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn btn-secondary" onclick="hideModal('edit-drv-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditDriver(${id})"><i class="fas fa-save"></i> Save</button>
    </div>`, 'modal-lg');
  showModal('edit-drv-modal');
}

async function saveEditDriver(id) {
  const name     = document.getElementById('ed-name').value.trim();
  const nickname = document.getElementById('ed-nickname').value.trim();
  const phone    = document.getElementById('ed-phone').value.trim();
  const phone2   = document.getElementById('ed-phone2').value.trim();
  const nic      = document.getElementById('ed-nic').value.trim();
  const address  = document.getElementById('ed-address').value.trim();
  const email    = document.getElementById('ed-email').value.trim();
  const status   = document.getElementById('ed-status').value;

  if (!name) return toast('Full Name is required', 'error');
  if (!phone) return toast('Phone No 1 is required', 'error');
  if (phone.length !== 10 || !/^\d{10}$/.test(phone)) return toast('Phone No 1 must be exactly 10 digits', 'error');
  if (phone2 && (phone2.length !== 10 || !/^\d{10}$/.test(phone2))) return toast('Phone No 2 must be exactly 10 digits', 'error');
  if (!nic) return toast('NIC Number is required', 'error');
  if (!address) return toast('Address is required', 'error');

  const all = await DB.getDrivers();

  // Duplicate Phone Check
  const dupPhone = all.find(d => 
    String(d.id) !== String(id) && (
      (d.phone && d.phone === phone) || 
      (d.phone2 && d.phone2 === phone) ||
      (phone2 && (d.phone === phone2 || d.phone2 === phone2))
    )
  );
  if (dupPhone) {
    return toast(`Phone number is already registered to driver "${escapeHtml(dupPhone.name)}"`, 'error');
  }

  // Duplicate NIC Check
  const dupNic = all.find(d => String(d.id) !== String(id) && d.nic && d.nic.toLowerCase().trim() === nic.toLowerCase().trim());
  if (dupNic) {
    return toast(`NIC "${nic}" is already registered to driver "${escapeHtml(dupNic.name)}"`, 'error');
  }

  const oldDriver = all.find(d => String(d.id) === String(id));

  await DB.updateDriver(id, {
    name, nickname, phone, phone2, nic, address, email, status
  });

  await DB.logAction(
    'Edit Driver',
    `Updated details for driver "${name}"`,
    { id, name, nickname, phone, phone2, nic, address, email, status,
      undo: oldDriver ? { type: 'revert_edit', entity_type: 'Driver', id, previous: { name: oldDriver.name, nickname: oldDriver.nickname, phone: oldDriver.phone, phone2: oldDriver.phone2, nic: oldDriver.nic, address: oldDriver.address, email: oldDriver.email, status: oldDriver.status } } : undefined },
    'Driver'
  );

  hideModal('edit-drv-modal');
  toast('Driver updated successfully!');
  if (currentDetailDriverId === id) {
    openDriverDetail(id, currentDriverDetailTab);
  } else {
    renderDrivers();
  }
}

async function deleteDriverConfirm(id) {
  if (!canDelete()) return toast('Admin permission required to delete drivers', 'error');
  const d = await DB.getDriver(id);
  const drvName = d ? d.name : 'Driver #' + id;
  const drvPhone = d ? d.phone : '';
  confirmDialog('Delete this driver? (Their past trip records will remain in the system)', async () => {
    try {
      const trashId = d ? await DB.addTrash({ entity_type: 'Driver', entity_label: drvName, payload: d, deleted_by: currentUser?.display_name }) : null;
      await DB.deleteDriver(id);
      await DB.logAction(
        'Delete Driver',
        `Deleted driver "${drvName}" (Phone: ${drvPhone || 'N/A'})`,
        { id, name: drvName, phone: drvPhone, undo: trashId ? { type: 'restore_trash', trash_id: trashId } : undefined },
        'Driver'
      );
      toast('Driver deleted successfully');
      currentDetailDriverId = null;
      renderDrivers();
    } catch (err) {
      console.error('Delete driver error:', err);
      toast('Error deleting driver: ' + (err.message || err), 'error');
    }
  });
}

// ─────────────────────────────────────────────
// CUSTOMERS BACKUP & IMPORT
// ─────────────────────────────────────────────
async function exportCustomers() {
  const all = await DB.getCustomers();
  const exportData = {
    type:'swc_customers_backup', version:2,
    exported_at:new Date().toISOString(), count:all.length,
    customers:all.map(c=>({
      hotel_name:c.hotel_name, contact_person:c.contact_person||'',
      phone:c.phone||'', email:c.email||'',
      address:c.address||'', created_date:c.created_date||'',
      custom_prices:c.custom_prices||{}
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
            const updateData = {hotel_name:rec.hotel_name,contact_person:rec.contact_person||'',phone:rec.phone||'',email:rec.email||'',address:rec.address||''};
            if(rec.created_date) updateData.created_date = rec.created_date;
            if(rec.custom_prices && Object.keys(rec.custom_prices).length > 0) updateData.custom_prices = rec.custom_prices;
            await DB.updateCustomer(match.id, updateData);
            updated++;
          } else {
            const addData = {hotel_name:rec.hotel_name,contact_person:rec.contact_person||'',phone:rec.phone||'',email:rec.email||'',address:rec.address||''};
            if(rec.custom_prices && Object.keys(rec.custom_prices).length > 0) addData.custom_prices = rec.custom_prices;
            // Use the original created_date if available, otherwise DB.addCustomer will set it
            if(rec.created_date) addData.created_date = rec.created_date;
            await DB.addCustomer(addData);
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
    type:'swc_drivers_backup', version:2,
    exported_at:new Date().toISOString(), count:all.length,
    drivers:all.map(d=>({
      name:d.name, nickname:d.nickname||'',
      phone:d.phone||'', phone2:d.phone2||'',
      nic:d.nic||'', address:d.address||'',
      email:d.email||'', vehicle:d.vehicle||'',
      status:d.status||'available', created_date:d.created_date||''
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
    confirmDialog(`Import ${records.length} drivers? Existing drivers (matched by phone number or NIC) will be updated. New drivers will be added.`, async()=>{
      const existing=await DB.getDrivers();
      const byPhone=Object.fromEntries(existing.filter(d=>d.phone).map(d=>[d.phone,d]));
      const byNic=Object.fromEntries(existing.filter(d=>d.nic).map(d=>[d.nic.toLowerCase().trim(),d]));
      const byName=Object.fromEntries(existing.map(d=>[d.name.toLowerCase().trim(),d]));
      let added=0,updated=0,errors=0;
      for(const rec of records){
        try {
          const match = (rec.phone && byPhone[rec.phone]) || 
                        (rec.nic && byNic[rec.nic.toLowerCase().trim()]) || 
                        byName[rec.name?.toLowerCase().trim()];
          const driverData = {
            name: rec.name,
            nickname: rec.nickname || '',
            phone: rec.phone || '',
            phone2: rec.phone2 || '',
            nic: rec.nic || '',
            address: rec.address || '',
            email: rec.email || '',
            vehicle: rec.vehicle || '',
            status: rec.status || 'available'
          };
          if (rec.created_date) driverData.created_date = rec.created_date;

          if(match){
            await DB.updateDriver(match.id, driverData);
            updated++;
          } else {
            await DB.addDriver(driverData);
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


// ─────────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────────
let vehPage = 1, vehSearch = '', vehPerPage = 12;
let currentDetailVehicleId = null;
let currentVehicleDetailTab = 'details';
let vehTripChartInstance = null;

async function renderVehicles() {
  currentDetailVehicleId = null;
  document.getElementById('page-title').textContent = 'Vehicles';
  if (document.getElementById('veh-table-body')) { await _refreshVehiclesGrid(); return; }

  const [vehicles, trips] = await Promise.all([
    DB.getVehicles(),
    DB.getTrips()
  ]);

  const totalDistance = (trips || []).reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0);

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Vehicles</span>
      <div style="display:flex;gap:8px;">
        ${canBackupRestore() ? `
          <button class="btn btn-secondary" onclick="exportVehicles()" title="Export vehicles to JSON"><i class="fas fa-download"></i> Backup</button>
          <button class="btn btn-secondary" onclick="document.getElementById('veh-import-file').click()" title="Import vehicles from JSON"><i class="fas fa-upload"></i> Import</button>
          <input type="file" id="veh-import-file" accept=".json" style="display:none" onchange="importVehicles(this)"/>
        ` : ''}
        ${canEditVehicles() ? `
          <button class="btn btn-primary" onclick="showAddVehicleModal()"><i class="fas fa-plus"></i> Add Vehicle</button>
        ` : ''}
      </div>
    </div>

    <!-- Overview Element Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">
      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Total Vehicles</div>
          <div style="background:#e0f2fe;color:#0284c7;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-car"></i>
          </div>
        </div>
        <div class="value" style="color:#0284c7;" id="veh-stat-count">${vehicles.length} <span style="font-size:0.6em;font-weight:600;">Vehicles</span></div>
        <div class="sub" id="veh-stat-sub">${vehicles.filter(v => (v.status || 'available') === 'available').length} available</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Total Distance Travelled</div>
          <div style="background:#dcfce7;color:#16a34a;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-route"></i>
          </div>
        </div>
        <div class="value" style="color:#16a34a;" id="veh-stat-distance">${totalDistance.toLocaleString('en-LK', { maximumFractionDigits: 1 })} <span style="font-size:0.6em;font-weight:600;">KM</span></div>
        <div class="sub">Across all registered vehicles</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:12px;align-items:center;">
        <div class="search-wrap" style="flex:1;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="veh-search-input" placeholder="Search vehicle no, category, model..."
            autocomplete="off" spellcheck="false"
            oninput="vehSearch=this.value;vehPage=1;_refreshVehiclesGrid()"/>
        </div>
        <span id="veh-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
    </div>

    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:60px;text-align:center;">No</th>
              <th>Vehicle NO</th>
              <th>Vehicle Type</th>
              <th>Model</th>
              <th>Total Distance</th>
              <th style="width:140px;text-align:center;">Status</th>
              <th style="width:120px;text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody id="veh-table-body"></tbody>
        </table>
      </div>
      <div id="veh-pagination"></div>
    </div>`;

  await _refreshVehiclesGrid();
  document.getElementById('veh-search-input')?.focus();
}

async function _refreshVehiclesGrid() {
  const tbody = document.getElementById('veh-table-body');
  if (!tbody) { await renderVehicles(); return; }

  const [vehicles, trips] = await Promise.all([
    DB.getVehicles(),
    DB.getTrips()
  ]);

  // Compute distance map per vehicle
  const distMap = {};
  (trips || []).forEach(t => {
    const vNo = (t.vehicle_no || t.vehicle || '').toUpperCase().trim();
    if (vNo) distMap[vNo] = (distMap[vNo] || 0) + (parseFloat(t.distance_km) || 0);
    if (t.vehicle_id) distMap[String(t.vehicle_id)] = (distMap[String(t.vehicle_id)] || 0) + (parseFloat(t.distance_km) || 0);
  });

  let filtered = filterData(vehicles, vehSearch, ['vehicle_no', 'category', 'model', 'status']);
  filtered = filtered.sort((a, b) => (a.vehicle_no || '').localeCompare(b.vehicle_no || ''));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / vehPerPage));
  if (vehPage > totalPages) vehPage = totalPages;
  const { items } = paginateData(filtered, vehPage, vehPerPage);
  const countEl = document.getElementById('veh-count');
  if (countEl) countEl.textContent = total + ' vehicle' + (total !== 1 ? 's' : '');

  // Update stat cards
  const statCount = document.getElementById('veh-stat-count');
  if (statCount) statCount.innerHTML = `${vehicles.length} <span style="font-size:0.6em;font-weight:600;">Vehicles</span>`;
  const statSub = document.getElementById('veh-stat-sub');
  if (statSub) statSub.textContent = `${vehicles.filter(v => (v.status || 'available') === 'available').length} available`;
  const statDist = document.getElementById('veh-stat-distance');
  if (statDist) {
    const totalDist = (trips || []).reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0);
    statDist.innerHTML = `${totalDist.toLocaleString('en-LK', { maximumFractionDigits: 1 })} <span style="font-size:0.6em;font-weight:600;">KM</span>`;
  }

  const catIcons = { 'car':'fa-car','double cab':'fa-truck-pickup','bike':'fa-motorcycle','lorry':'fa-truck' };

  tbody.innerHTML = items.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No vehicles found</td></tr>`
    : items.map((v, idx) => {
        const rowNum = String((vehPage - 1) * vehPerPage + idx + 1).padStart(2, '0');
        const vNo = (v.vehicle_no || '').toUpperCase().trim();
        const vDist = distMap[vNo] || distMap[String(v.id)] || 0;
        const statusVal = (v.status || 'available').toLowerCase();
        const stBadgeClass = statusVal === 'available' ? 'badge-green' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'badge-yellow' : 'badge-gray';
        const stLabel = statusVal === 'available' ? 'Available' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'On Trip' : 'Maintenance';
        const catIcon = catIcons[(v.category || '').toLowerCase()] || 'fa-car';

        return `<tr>
          <td style="text-align:center;font-weight:700;color:var(--text-muted);font-family:monospace;font-size:1.05em;">${rowNum}</td>
          <td><div style="font-weight:700;font-size:1.05em;color:var(--primary);font-family:monospace;letter-spacing:0.5px;">${escapeHtml(v.vehicle_no)}</div></td>
          <td><span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:0.9em;color:var(--text);"><i class="fas ${catIcon}" style="color:var(--primary);width:16px;"></i> ${escapeHtml(v.category || 'Car')}</span></td>
          <td><div style="font-weight:600;font-size:0.95em;color:var(--text);">${escapeHtml(v.model || '—')}</div></td>
          <td><span style="font-weight:700;color:#16a34a;">${vDist.toLocaleString('en-LK', { maximumFractionDigits: 1 })} KM</span></td>
          <td style="text-align:center;">
            <button class="btn btn-sm badge ${stBadgeClass}" onclick="cycleVehicleStatus(${v.id}, '${statusVal}')" title="Click to cycle status" style="cursor:pointer;padding:5px 12px;font-size:0.82em;border:none;display:inline-flex;align-items:center;gap:6px;">
              <i class="fas fa-circle" style="font-size:0.6em;"></i> ${stLabel} <i class="fas fa-rotate" style="font-size:0.75em;opacity:0.7;"></i>
            </button>
          </td>
          <td style="text-align:center;">
            <button class="btn btn-primary btn-sm" onclick="openVehicleDetail(${v.id})" style="padding:6px 16px;font-weight:600;">
              <i class="fas fa-eye"></i> View
            </button>
          </td>
        </tr>`;
      }).join('');
  const pagEl = document.getElementById('veh-pagination');
  if (pagEl) pagEl.innerHTML = renderPagination(vehPage, totalPages, 'changeVehPage');
}
function changeVehPage(p) { vehPage = p; _refreshVehiclesGrid(); }

async function cycleVehicleStatus(id, current) {
  const currentNorm = (current || 'available').toLowerCase() === 'on-trip' ? 'busy' : (current || 'available').toLowerCase();
  const statuses = ['available', 'busy', 'maintenance'];
  const nextStatus = statuses[(statuses.indexOf(currentNorm) + 1) % statuses.length];
  try {
    await DB.updateVehicle(id, { status: nextStatus });
    const veh = await DB.getVehicle(id);
    await DB.logAction('Edit Vehicle', `Changed vehicle "${veh?.vehicle_no || '#' + id}" status to "${nextStatus}"`, { id, status: nextStatus }, 'Vehicle');
    toast(`Status changed to ${nextStatus === 'available' ? 'Available' : nextStatus === 'busy' ? 'On Trip' : 'Maintenance'}`);
  } catch (err) {
    console.error('cycleVehicleStatus error:', err);
    toast('Failed to change vehicle status: ' + (err.message || err), 'error');
    return;
  }
  if (currentDetailVehicleId === id) {
    openVehicleDetail(id, currentVehicleDetailTab);
  } else {
    _refreshVehiclesGrid();
  }
}

async function openVehicleDetail(vehicleId, tab = 'details') {
  currentDetailVehicleId = vehicleId;
  currentVehicleDetailTab = tab;

  const [v, allTrips] = await Promise.all([
    DB.getVehicle(vehicleId),
    DB.getTrips()
  ]);

  if (!v) {
    toast('Vehicle not found', 'error');
    currentDetailVehicleId = null;
    return renderVehicles();
  }

  const vNo = (v.vehicle_no || '').toUpperCase().trim();
  const vehicleTrips = (allTrips || []).filter(t =>
    (t.vehicle_id && String(t.vehicle_id) === String(v.id)) ||
    (t.vehicle_no && t.vehicle_no.toUpperCase().trim() === vNo) ||
    (t.vehicle && t.vehicle.toUpperCase().trim() === vNo)
  );

  const totalKms = vehicleTrips.reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0);
  const totalTripsCount = vehicleTrips.length;

  const catIcons = { 'car':'fa-car','double cab':'fa-truck-pickup','bike':'fa-motorcycle','lorry':'fa-truck' };
  const catIcon = catIcons[(v.category || '').toLowerCase()] || 'fa-car';
  const statusVal = (v.status || 'available').toLowerCase();
  const stBadgeClass = statusVal === 'available' ? 'badge-green' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'badge-yellow' : 'badge-gray';
  const stLabel = statusVal === 'available' ? 'Available' : (statusVal === 'busy' || statusVal === 'on-trip') ? 'Busy / On Trip' : 'Maintenance';

  document.getElementById('page-title').textContent = v.vehicle_no || 'Vehicle Details';

  const contentEl = document.getElementById('content');
  contentEl.innerHTML = `
    <div class="section-header" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-secondary btn-sm" onclick="currentDetailVehicleId=null;renderVehicles()"><i class="fas fa-arrow-left"></i> Back to Vehicles</button>
        <span class="section-title" style="font-size:1.25em;">Vehicle Profile</span>
      </div>
      <div style="display:flex;gap:8px;">
        ${canEditVehicles() ? `<button class="btn btn-primary btn-sm" onclick="showEditVehicleModal(${v.id})"><i class="fas fa-edit"></i> Edit</button>` : ''}
        ${canDelete() ? `<button class="btn btn-danger btn-sm" onclick="deleteVehicleConfirm(${v.id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
      </div>
    </div>

    <!-- 4 Element Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">
      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Vehicle No</div>
          <div style="background:#e0f2fe;color:#0284c7;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-id-badge"></i></div>
        </div>
        <div class="value" style="color:#0284c7;font-family:monospace;">${escapeHtml(v.vehicle_no)}</div>
        <div class="sub">Registered plate identifier</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Vehicle Type</div>
          <div style="background:#f3e8ff;color:#9333ea;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas ${catIcon}"></i></div>
        </div>
        <div class="value" style="color:#9333ea;">${escapeHtml(v.category || 'Car')}</div>
        <div class="sub">Category classification</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Vehicle Model</div>
          <div style="background:#fef3c7;color:#d97706;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-car-side"></i></div>
        </div>
        <div class="value" style="color:#d97706;">${escapeHtml(v.model || '—')}</div>
        <div class="sub">Model name / variant</div>
      </div>

      <div class="stat-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="label">Total Distance Travelled</div>
          <div style="background:#dcfce7;color:#16a34a;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-route"></i></div>
        </div>
        <div class="value" style="color:#16a34a;">${totalKms.toLocaleString('en-LK', { maximumFractionDigits: 1 })} <span style="font-size:0.6em;font-weight:600;">KM</span></div>
        <div class="sub">Across ${totalTripsCount} trip${totalTripsCount !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <!-- Details summary box -->
    <div class="card" style="margin-bottom:20px;border-left:4px solid var(--primary);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:14px;">
        <div>
          <div style="font-size:0.75em;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Vehicle Profile</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:var(--text);">
            ${escapeHtml(v.vehicle_no)} <span style="font-weight:400;font-size:0.75em;color:var(--text-muted);">(${escapeHtml(v.model || v.category)})</span>
          </div>
        </div>
        <div>
          <button class="btn btn-sm badge ${stBadgeClass}" onclick="cycleVehicleStatus(${v.id}, '${statusVal}')" title="Click to cycle status" style="cursor:pointer;padding:6px 14px;font-size:0.85em;border:none;display:inline-flex;align-items:center;gap:6px;">
            <i class="fas fa-circle" style="font-size:0.6em;"></i> ${stLabel} <i class="fas fa-rotate" style="font-size:0.75em;opacity:0.7;"></i>
          </button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:14px;background:var(--bg);border-radius:10px;border:1px solid var(--border);">
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Category</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas ${catIcon}" style="color:var(--primary);margin-right:6px;width:14px;"></i>${escapeHtml(v.category || 'Car')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Model Name</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-tag" style="color:#06b6d4;margin-right:6px;width:14px;"></i>${escapeHtml(v.model || '—')}</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Completed Trips</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-check-double" style="color:#10b981;margin-right:6px;width:14px;"></i>${vehicleTrips.filter(t => t.status === 'Completed').length} Completed</div>
        </div>
        <div>
          <div style="font-size:0.72em;text-transform:uppercase;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;">Registered Date</div>
          <div style="font-weight:600;font-size:0.95em;color:var(--text);margin-top:4px;"><i class="fas fa-calendar-alt" style="color:#f59e0b;margin-right:6px;width:14px;"></i>${formatDate(v.created_at)}</div>
        </div>
      </div>
    </div>

    <!-- Bottom: Switchable Tabs -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--card-bg);padding:10px 16px;gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.8em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-right:4px;">View:</span>
        <button id="veh-tab-btn-details" class="btn btn-sm ${currentVehicleDetailTab === 'details' ? 'btn-primary' : 'btn-secondary'}" onclick="switchVehicleDetailTab(${v.id}, 'details')">
          <i class="fas fa-list"></i> Details
        </button>
        <button id="veh-tab-btn-graph" class="btn btn-sm ${currentVehicleDetailTab === 'graph' ? 'btn-primary' : 'btn-secondary'}" onclick="switchVehicleDetailTab(${v.id}, 'graph')">
          <i class="fas fa-chart-line"></i> Graph
        </button>
      </div>
      <div id="veh-detail-tab-body" style="padding:20px;"></div>
    </div>
  `;

  await renderVehicleDetailTabBody(v, vehicleTrips, currentVehicleDetailTab);
}

async function switchVehicleDetailTab(vehicleId, tab) {
  currentVehicleDetailTab = tab;
  ['details', 'graph'].forEach(t => {
    const btn = document.getElementById('veh-tab-btn-' + t);
    if (btn) btn.className = (t === tab) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
  });

  const [v, allTrips] = await Promise.all([DB.getVehicle(vehicleId), DB.getTrips()]);
  if (v) {
    const vNo = (v.vehicle_no || '').toUpperCase().trim();
    const vehicleTrips = (allTrips || []).filter(t =>
      (t.vehicle_id && String(t.vehicle_id) === String(v.id)) ||
      (t.vehicle_no && t.vehicle_no.toUpperCase().trim() === vNo) ||
      (t.vehicle && t.vehicle.toUpperCase().trim() === vNo)
    );
    await renderVehicleDetailTabBody(v, vehicleTrips, tab);
  }
}

async function renderVehicleDetailTabBody(v, vehicleTrips, tab) {
  const container = document.getElementById('veh-detail-tab-body');
  if (!container) return;

  if (vehTripChartInstance) {
    try { vehTripChartInstance.destroy(); } catch(e) {}
    vehTripChartInstance = null;
  }

  if (tab === 'details') {
    const sortedTrips = [...(vehicleTrips || [])].sort((a,b) => new Date(b.start_date || b.created_at || 0) - new Date(a.start_date || a.created_at || 0));
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-weight:700;font-family:'Playfair Display',serif;font-size:1.15em;">Vehicle Trip History (${sortedTrips.length})</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trip ID</th><th>Vehicle No</th><th>Driver</th>
              <th>Start Date / Time</th><th>End Date / Time</th>
              <th>Total Distance</th><th>Status</th>
              <th style="text-align:center;width:100px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${sortedTrips.map(t => {
              const startDT = `${t.start_date ? formatDate(t.start_date) : '—'} ${t.start_time || ''}`;
              const endDT   = t.end_date ? `${formatDate(t.end_date)} ${t.end_time || ''}` : '—';
              const dist    = parseFloat(t.distance_km) > 0 ? `${parseFloat(t.distance_km).toFixed(1)} KM` : (t.status === 'Completed' ? '0 KM' : 'In Progress');
              const stBadge = t.status === 'Completed' ? 'badge-green' : 'badge-yellow';
              return `<tr>
                <td><strong>${escapeHtml(t.trip_id || t.id)}</strong></td>
                <td><span style="font-family:monospace;font-weight:700;color:var(--primary);">${escapeHtml(v.vehicle_no)}</span></td>
                <td>${escapeHtml(t.driver_name || '—')}</td>
                <td>${escapeHtml(startDT)}</td>
                <td>${escapeHtml(endDT)}</td>
                <td style="font-weight:700;color:${parseFloat(t.distance_km) > 0 ? '#16a34a' : 'var(--text-muted)'};">${dist}</td>
                <td><span class="badge ${stBadge}">${escapeHtml(t.status || 'In Progress')}</span></td>
                <td style="text-align:center;">
                  <button class="btn btn-primary btn-sm" onclick="navigate('transport'); if (typeof TransportModule !== 'undefined') setTimeout(() => TransportModule.viewTripDetails('${t.id}'), 200);">
                    <i class="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No trip history found for this vehicle</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } else if (tab === 'graph') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1.15em;font-weight:700;">Distance Travelled Over Days</div>
          <div style="font-size:0.82em;color:var(--text-muted);">Non-linear timeline of distance (KM) by ${escapeHtml(v.vehicle_no)} over days</div>
        </div>
      </div>
      <div id="veh-chart-wrap" style="background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--border);">
        <div class="chart-container" style="height:350px;position:relative;">
          <canvas id="veh-trip-chart"></canvas>
        </div>
      </div>
    `;
    renderVehicleTripGraph(vehicleTrips || []);
  }
}

function renderVehicleTripGraph(trips) {
  const chartCanvas = document.getElementById('veh-trip-chart');
  if (!chartCanvas) return;

  const validTrips = (trips || []).filter(t => (t.start_date || t.created_at) && parseFloat(t.distance_km) > 0);
  if (!validTrips.length) {
    const wrap = document.getElementById('veh-chart-wrap');
    if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted);"><i class="fas fa-chart-line" style="font-size:2.8em;opacity:0.3;margin-bottom:12px;display:block;"></i>No completed distance data available yet to plot graph.</div>`;
    return;
  }

  const dateMap = {};
  validTrips.forEach(t => {
    const rawDate = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
    if (rawDate) {
      const dateKey = rawDate.slice(0, 10);
      dateMap[dateKey] = (dateMap[dateKey] || 0) + (parseFloat(t.distance_km) || 0);
    }
  });

  const sortedDates = Object.keys(dateMap).sort();
  const labels = sortedDates.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  const values = sortedDates.map(d => dateMap[d]);

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const ctx = chartCanvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(14, 165, 233, 0.40)');
  gradient.addColorStop(1, 'rgba(14, 165, 233, 0.02)');

  vehTripChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Distance (KM)',
        data: values,
        borderColor: '#0ea5e9',
        backgroundColor: gradient,
        borderWidth: 2.5,
        tension: 0.38,
        fill: true,
        pointBackgroundColor: '#0ea5e9',
        pointBorderColor: isDark ? '#1e293b' : '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointHoverBackgroundColor: '#0284c7',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `Distance: ${Number(c.parsed.y).toLocaleString('en-LK', { maximumFractionDigits: 1 })} KM` } }
      },
      scales: {
        x: {
          title: { display: true, text: 'Days', color: textColor, font: { size: 12, weight: 'bold' } },
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 } }
        },
        y: {
          title: { display: true, text: 'Distance in (KM)', color: textColor, font: { size: 12, weight: 'bold' } },
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 }, callback: v => `${v} KM` }
        }
      }
    }
  });
}

function showAddVehicleModal() {
  createModal('add-veh-modal', 'Add New Vehicle', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Vehicle No * <span style="color:var(--text-muted);font-size:0.82em;">(e.g. CAD8590)</span></label>
        <input class="form-input" id="v-no" placeholder="CAD8590" maxlength="20" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()"/>
      </div>
      <div class="form-group">
        <label class="form-label">Vehicle Category *</label>
        <select class="form-input form-select" id="v-category">
          <option value="Car">Car</option>
          <option value="Double Cab">Double Cab</option>
          <option value="Bike">Bike</option>
          <option value="Lorry">Lorry</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Model <span style="color:var(--text-muted);font-size:0.82em;">(e.g. Prius, Hilux)</span></label>
        <input class="form-input" id="v-model" placeholder="Prius" maxlength="50"/>
      </div>
      <div class="form-group">
        <label class="form-label">Odometer Reading (KM)</label>
        <input type="number" class="form-input" id="v-initial-km" placeholder="0" min="0" step="0.1"/>
      </div>
      <div class="form-group">
        <label class="form-label">Initial Status</label>
        <select class="form-input form-select" id="v-status">
          <option value="available">Available</option>
          <option value="busy">Busy / On Trip</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-secondary" onclick="hideModal('add-veh-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewVehicle()"><i class="fas fa-save"></i> Save</button>
    </div>`, 'modal-md');
  showModal('add-veh-modal');
  setTimeout(() => document.getElementById('v-no')?.focus(), 150);
}

async function saveNewVehicle() {
  const vehicleNo = (document.getElementById('v-no')?.value || '').toUpperCase().trim();
  const category  = document.getElementById('v-category')?.value || 'Car';
  const model     = (document.getElementById('v-model')?.value || '').trim();
  const status    = document.getElementById('v-status')?.value || 'available';
  const initialKm = parseFloat(document.getElementById('v-initial-km')?.value) || 0;

  if (!vehicleNo) return toast('Vehicle No is required', 'error');

  const cleanPlate = vehicleNo.replace(/[\s-]/g, '');
  if (cleanPlate.length < 3 || cleanPlate.length > 12) {
    return toast('Vehicle No must be a valid registration plate (e.g. CAD8590)', 'error');
  }

  const all = await DB.getVehicles();
  const dup = all.find(v => (v.vehicle_no || '').replace(/[\s-]/g, '').toUpperCase() === cleanPlate);
  if (dup) return toast(`Vehicle No "${vehicleNo}" is already registered`, 'error');

  try {
    const newId = await DB.addVehicle({ vehicle_no: vehicleNo, category, model, status, initial_km: initialKm });
    await DB.logAction('Add Vehicle', `Added vehicle "${vehicleNo}" (${category}, ${model || 'N/A'})`, { id: newId, vehicle_no: vehicleNo, category, model, status, initial_km: initialKm, undo: { type: 'delete_record', entity_type: 'Vehicle', id: newId } }, 'Vehicle');

    hideModal('add-veh-modal');
    toast('Vehicle added successfully!');
    renderVehicles();
  } catch (err) {
    console.error('saveNewVehicle error:', err);
    toast('Failed to add vehicle: ' + (err.message || err), 'error');
  }
}

async function showEditVehicleModal(id) {
  const v = await DB.getVehicle(id);
  if (!v) return;
  const statusVal = (v.status || 'available').toLowerCase() === 'on-trip' ? 'busy' : (v.status || 'available').toLowerCase();

  createModal('edit-veh-modal', 'Edit Vehicle', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Vehicle No *</label>
        <input class="form-input" id="ev-no" value="${escapeHtml(v.vehicle_no || '')}" maxlength="20" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()"/>
      </div>
      <div class="form-group">
        <label class="form-label">Vehicle Category *</label>
        <select class="form-input form-select" id="ev-category">
          <option value="Car" ${v.category === 'Car' ? 'selected' : ''}>Car</option>
          <option value="Double Cab" ${v.category === 'Double Cab' ? 'selected' : ''}>Double Cab</option>
          <option value="Bike" ${v.category === 'Bike' ? 'selected' : ''}>Bike</option>
          <option value="Lorry" ${v.category === 'Lorry' ? 'selected' : ''}>Lorry</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Model</label>
        <input class="form-input" id="ev-model" value="${escapeHtml(v.model || '')}" maxlength="50"/>
      </div>
      <div class="form-group">
        <label class="form-label">Odometer Reading (KM) <span style="color:var(--text-muted);font-size:0.82em;">(initial reading, used until this vehicle's first trip)</span></label>
        <input type="number" class="form-input" id="ev-initial-km" value="${v.initial_km || 0}" min="0" step="0.1"/>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-input form-select" id="ev-status">
          <option value="available" ${statusVal === 'available' ? 'selected' : ''}>Available</option>
          <option value="busy" ${statusVal === 'busy' ? 'selected' : ''}>Busy / On Trip</option>
          <option value="maintenance" ${statusVal === 'maintenance' ? 'selected' : ''}>Maintenance</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-secondary" onclick="hideModal('edit-veh-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditVehicle(${id})"><i class="fas fa-save"></i> Save</button>
    </div>`, 'modal-md');
  showModal('edit-veh-modal');
}

async function saveEditVehicle(id) {
  const vehicleNo = (document.getElementById('ev-no')?.value || '').toUpperCase().trim();
  const category  = document.getElementById('ev-category')?.value || 'Car';
  const model     = (document.getElementById('ev-model')?.value || '').trim();
  const status    = document.getElementById('ev-status')?.value || 'available';
  const initialKm = parseFloat(document.getElementById('ev-initial-km')?.value) || 0;

  if (!vehicleNo) return toast('Vehicle No is required', 'error');
  const cleanPlate = vehicleNo.replace(/[\s-]/g, '');
  if (cleanPlate.length < 3 || cleanPlate.length > 12) return toast('Vehicle No must be a valid registration plate', 'error');

  const all = await DB.getVehicles();
  const dup = all.find(v => String(v.id) !== String(id) && (v.vehicle_no || '').replace(/[\s-]/g, '').toUpperCase() === cleanPlate);
  if (dup) return toast(`Vehicle No "${vehicleNo}" is already registered to another vehicle`, 'error');

  const oldVehicle = all.find(v => String(v.id) === String(id));

  try {
    await DB.updateVehicle(id, { vehicle_no: vehicleNo, category, model, status, initial_km: initialKm });
    await DB.logAction('Edit Vehicle', `Updated vehicle "${vehicleNo}"`, { id, vehicle_no: vehicleNo, category, model, status, initial_km: initialKm,
      undo: oldVehicle ? { type: 'revert_edit', entity_type: 'Vehicle', id, previous: { vehicle_no: oldVehicle.vehicle_no, category: oldVehicle.category, model: oldVehicle.model, status: oldVehicle.status, initial_km: oldVehicle.initial_km } } : undefined }, 'Vehicle');

    hideModal('edit-veh-modal');
    toast('Vehicle updated successfully!');
    if (currentDetailVehicleId === id) {
      openVehicleDetail(id, currentVehicleDetailTab);
    } else {
      _refreshVehiclesGrid();
    }
  } catch (err) {
    console.error('saveEditVehicle error:', err);
    toast('Failed to update vehicle: ' + (err.message || err), 'error');
  }
}

async function deleteVehicleConfirm(id) {
  if (!canDelete()) return toast('Admin permission required to delete vehicles', 'error');
  const v = await DB.getVehicle(id);
  const vNo = v ? v.vehicle_no : 'Vehicle #' + id;
  confirmDialog(`Delete vehicle "${vNo}"? (Past trip records will remain in the system)`, async () => {
    try {
      const trashId = v ? await DB.addTrash({ entity_type: 'Vehicle', entity_label: vNo, payload: v, deleted_by: currentUser?.display_name }) : null;
      await DB.deleteVehicle(id);
      await DB.logAction('Delete Vehicle', `Deleted vehicle "${vNo}"`, { id, vehicle_no: vNo, undo: trashId ? { type: 'restore_trash', trash_id: trashId } : undefined }, 'Vehicle');
      toast('Vehicle deleted successfully');
      currentDetailVehicleId = null;
      renderVehicles();
    } catch (err) {
      toast('Error deleting vehicle: ' + (err.message || err), 'error');
    }
  });
}

// ─────────────────────────────────────────────
// VEHICLES BACKUP & IMPORT
// ─────────────────────────────────────────────
async function exportVehicles() {
  const all = await DB.getVehicles();
  const exportData = { type: 'swc_vehicles_backup', version: 1, exported_at: new Date().toISOString(), count: all.length,
    vehicles: all.map(v => ({ vehicle_no: v.vehicle_no, category: v.category || 'Car', model: v.model || '', status: v.status || 'available', created_at: v.created_at || '' }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `swc_vehicles_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast(`Exported ${all.length} vehicles`, 'success');
}

async function importVehicles(input) {
  const file = input.files[0]; if (!file) return; input.value = '';
  try {
    const data = JSON.parse(await file.text());
    if (data.type !== 'swc_vehicles_backup') return toast('Invalid vehicles backup file', 'error');
    const records = data.vehicles || [];
    if (!records.length) return toast('No vehicles found in file', 'warning');
    confirmDialog(`Import ${records.length} vehicles?`, async () => {
      const existing = await DB.getVehicles();
      const byNo = Object.fromEntries(existing.map(v => [(v.vehicle_no || '').toUpperCase().trim(), v]));
      let added = 0, updated = 0, errors = 0;
      for (const rec of records) {
        try {
          const vNo = (rec.vehicle_no || '').toUpperCase().trim();
          if (!vNo) continue;
          const match = byNo[vNo];
          const vehData = { vehicle_no: vNo, category: rec.category || 'Car', model: rec.model || '', status: rec.status || 'available' };
          if (rec.created_at) vehData.created_at = rec.created_at;
          if (match) { await DB.updateVehicle(match.id, vehData); updated++; }
          else { await DB.addVehicle(vehData); added++; }
        } catch(e) { errors++; console.error(e); }
      }
      renderVehicles();
      toast(`Import done: ${added} added, ${updated} updated` + (errors ? `, ${errors} failed` : ''), 'success');
    });
  } catch(e) { toast('Failed to read file: ' + (e.message || e), 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAY NOW PAGE & BATCH PAY

// ─────────────────────────────────────────────────────────────────────────────
let paynowPage = 1;
let paynowSearch = '';
let paynowStatusFilter = '';
let paynowPerPage = 10;
let paynowSelectedIds = [];

// Payment status filter for Pay Now — distinct from the global ORDER_STATUSES
// (which only drives the Paid/Unpaid dropdown on order creation) since this
// list also needs to surface the 'Partially Paid' status.
const PAYNOW_STATUSES = ['Unpaid', 'Partially Paid', 'Paid'];

async function renderPayNow() {
  document.getElementById('page-title').textContent = 'Pay Now';

  if (document.getElementById('paynow-table-body')) {
    await _refreshPayNowTable();
    return;
  }

  const [allOrders, customers] = await Promise.all([DB.getOrders(), DB.getCustomers()]);
  const statusOpts = PAYNOW_STATUSES.map(s => `<option value="${s}" ${s === paynowStatusFilter ? 'selected' : ''}>${s}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Pending Payments</span>
      <div style="display:flex;gap:8px;align-items:center;" id="batch-pay-header-btn"></div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
        <div class="search-wrap" style="flex:1;min-width:200px;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="paynow-search-input" placeholder="Search order ID, customer..."
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
              <th>Order ID</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Pickup Date</th>
              <th>Unpaid Balance</th>
              <th>OverDue (days)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="paynow-table-body"></tbody>
        </table>
      </div>
    </div>`;

  await _refreshPayNowTable();
  document.getElementById('paynow-search-input')?.focus();
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
      const batchId = (o.batch_id || '').toLowerCase();
      const custName = getOrderCustomerName(o, cMap).toLowerCase();
      return batchId.includes(q) || custName.includes(q);
    });
  }

  // Apply status filter
  if (paynowStatusFilter) {
    pending = pending.filter(o => o.status === paynowStatusFilter);
  }

  // Sort: newest first
  pending.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const items = pending;
  const total = pending.length;

  const countEl = document.getElementById('paynow-count');
  if (countEl) countEl.textContent = total + ' pending order' + (total !== 1 ? 's' : '');

  // Render rows
  tbody.innerHTML = items.length === 0
    ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No pending payments found</td></tr>`
    : items.map(o => {
        const cust = cMap[o.customer_id];
        const inv = invMap[o.id];
        const balance = inv ? inv.balance : Math.max(0, (o.total_amount || 0) - (o.advance_payment || 0));
        const isChecked = paynowSelectedIds.includes(o.id) ? 'checked' : '';
        const overdueDays = getOverdueDays(o.created_at);

        return `<tr>
          <td style="text-align: center;">
            <input type="checkbox" class="paynow-checkbox" data-order-id="${o.id}" ${isChecked} onchange="onPayNowCheckboxChange()"/>
          </td>
          <td><strong>${o.batch_id || '—'}</strong></td>
          <td>${escapeHtml(getOrderCustomerName(o, cMap))}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${formatDate(o.pickup_date)}</td>
          <td style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;">${formatCurrency(balance)}</td>
          <td style="color:${overdueDays > 7 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:${overdueDays > 7 ? '700' : '400'};">${overdueDays} day${overdueDays !== 1 ? 's' : ''}</td>
          <td>
            <button class="btn btn-success btn-sm" style="background:#22c55e; border-color:#16a34a; font-weight:700;" onclick="showPayNowOptionsModal(${o.id})">
              <i class="fas fa-money-bill-wave"></i> Pay Now
            </button>
          </td>
        </tr>`;
      }).join('');

  // Update Master checkbox state
  updatePayNowMasterCheckboxState(items);

  // Update Batch PAY button in header
  updateBatchPayButtonHeader();
}

function changePayNowPage(p) {
  paynowPage = p;
  _refreshPayNowTable();
}

// Days between order placement and now — the Pay Now list is already
// filtered to unpaid/partially-paid orders, so every row shown is overdue-eligible.
function getOverdueDays(createdAt) {
  if (!createdAt) return 0;
  // Diff calendar dates (local midnight to local midnight), not raw
  // timestamps — a raw ms diff floors away a day whenever the order's
  // time-of-day is later than the current time-of-day (e.g. created 2:30pm,
  // checked 9:00am 16 calendar days later reads as 15.77 -> floors to 15).
  const start = new Date(createdAt);
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((nowDay - startDay) / 86400000));
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
  // Canonical calc — accounts for deduction_amount, discount, delivery charge
  // and extra payment, not just total_amount minus payments (the old formula
  // silently ignored any deduction already applied to this invoice).
  const fin = Financials.computeInvoiceFinancials(inv, items, payments);
  const balance = fin.balance;
  if (balance <= 0) {
    return toast('This order is already fully paid.', 'info');
  }

  const cust = await DB.getCustomer(order.customer_id);

  createModal('paynow-options-modal', `Pay Now: ${order.batch_id}`, `
    <div style="background:var(--bg);padding:16px;border-radius:10px;margin-bottom:18px;font-size:0.9em;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div><span class="form-label">Customer:</span> <strong>${escapeHtml(cust?.hotel_name || '—')}</strong></div>
      <div><span class="form-label">Invoice Number:</span> <strong>${inv.invoice_number}</strong></div>
      <div><span class="form-label">Total Amount:</span> <strong>${formatCurrency(inv.total_amount)}</strong></div>
      <div><span class="form-label">Remaining Balance:</span> <strong style="color:var(--danger);">${formatCurrency(balance)}</strong></div>
    </div>

    <div class="form-group" style="max-width:240px;">
      <label class="form-label">Paying Date *</label>
      <input type="date" class="form-input" id="pn-payment-date" value="${today()}" max="${today()}"/>
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
          <input type="number" class="form-input" id="paynow-partial-amount" placeholder="e.g. 5000" min="0.01" max="${balance}" step="0.01" oninput="recalcPayNowPartial(${balance})"/>
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

      <div style="background:#fffbeb; border:1px solid #fde68a; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:0.9em; display:flex; flex-direction:column; gap:4px; font-weight:600;">
        <div style="display:flex; justify-content:space-between;"><span>Unpaid Balance:</span> <span>${formatCurrency(balance)}</span></div>
        <div style="display:flex; justify-content:space-between; color:#b45309;"><span>Amount to Pay:</span> <span id="lbl-paynow-partial-amount">LKR 0.00</span></div>
        <div style="display:flex; justify-content:space-between; border-top:1px solid #fde68a; padding-top:6px; font-weight:700; font-size:1.05em; color:#1e40af;">
          <span>Balance Remaining:</span> <span id="lbl-paynow-partial-remaining">${formatCurrency(balance)}</span>
        </div>
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

function recalcPayNowPartial(balance) {
  const amountInput = document.getElementById('paynow-partial-amount');
  const amount = parseFloat(amountInput.value) || 0;
  const lblAmount = document.getElementById('lbl-paynow-partial-amount');
  const lblRemaining = document.getElementById('lbl-paynow-partial-remaining');

  if (lblAmount) lblAmount.textContent = `LKR ${amount.toFixed(2)}`;
  const remaining = Math.max(0, balance - amount);
  if (lblRemaining) lblRemaining.textContent = `LKR ${remaining.toFixed(2)}`;
}

function confirmFullPayment(orderId, invoiceId, amount) {
  let paymentDateISO;
  try {
    paymentDateISO = resolvePaymentTimestamp('pn-payment-date');
  } catch (err) {
    return toast(err.message, 'error');
  }

  const method = document.getElementById('pn-full-method').value;
  const notesInput = document.getElementById('pn-full-notes').value.trim();
  let notes = notesInput || 'Paid fully via Pay Now tab';

  if (method === 'Cheque') {
    const chqNum = document.getElementById('pn-full-cheque-num').value.trim();
    if (!chqNum) return toast('Please enter a cheque number', 'error');
    notes = `Cheque No: ${chqNum}. ${notesInput ? 'Notes: ' + notesInput : ''}`;
  }

  confirmDialog(`Confirm Full Payment of LKR ${amount.toFixed(2)} using ${method}?`, async () => {
    await processFullPayment(orderId, invoiceId, amount, method, notes, paymentDateISO);
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

  let paymentDateISO;
  try {
    paymentDateISO = resolvePaymentTimestamp('pn-payment-date');
  } catch (err) {
    return toast(err.message, 'error');
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
    await processPartialPayment(orderId, invoiceId, maxAmount, amount, method, notes, paymentDateISO);
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

  let paymentDateISO;
  try {
    paymentDateISO = resolvePaymentTimestamp('pn-payment-date');
  } catch (err) {
    return toast(err.message, 'error');
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
    await processDeductionPayment(orderId, invoiceId, balance, deductionAmount, reason, method, notes, paymentDateISO);
  }, 'Confirm', false);
}

async function processDeductionPayment(orderId, invoiceId, balance, deductionAmount, reason, method, notes, paymentDateISO) {
  try {
    paymentDateISO = paymentDateISO || new Date().toISOString();
    let activeInvoiceId = invoiceId;
    const isTemp = window._isTempInvoice;
    const invObj = window._currentPayNowInvoice;

    if (isTemp) {
      invObj.deduction_amount = deductionAmount;
      invObj.balance = 0;
      invObj.paid_status = 'Paid';
      invObj.payment_date = paymentDateISO;
      activeInvoiceId = await DB.addInvoice(invObj);
    }

    // 1. Add deduction record
    const deductionId = await DB.addDeduction({
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
        notes: notes,
        date: paymentDateISO
      });
    }

    // 3. Update invoice (only if it already existed in DB)
    if (!isTemp) {
      await DB.updateInvoice(activeInvoiceId, {
        deduction_amount: (invObj.deduction_amount || 0) + deductionAmount,
        balance: 0,
        paid_status: 'Paid',
        payment_date: paymentDateISO
      });
    }

    // 4. Update order to Paid
    await DB.updateOrder(orderId, {
      status: 'Paid',
      payment_date: paymentDateISO
    });
    paynowSelectedIds = paynowSelectedIds.filter(id => id !== orderId);

    const dpOrder = await DB.getOrder(orderId);
    const dpBatchId = dpOrder ? dpOrder.batch_id : '#' + orderId;
    await DB.logAction('Payment Received', `Applied deduction of LKR ${deductionAmount.toLocaleString()} (${reason || 'no reason given'}) and fully paid order #${dpBatchId}`, { order_id: orderId, batch_id: dpBatchId, invoice_id: activeInvoiceId, deduction_amount: deductionAmount, reason, method, notes, undo: { type: 'undo_deduction', deduction_id: deductionId, invoice_id: activeInvoiceId, amount: deductionAmount } }, 'Payment');

    hideModal('paynow-options-modal');
    toast(`Deduction applied and invoice fully paid!`);

    await _refreshPayNowTable();
    await refreshCustomerDetailForOrder(orderId);
  } catch (err) {
    toast('Error: ' + (err.message || err), 'error');
  }
}

async function processFullPayment(orderId, invoiceId, amount, method, notes, paymentDateISO) {
  try {
    paymentDateISO = paymentDateISO || new Date().toISOString();
    let activeInvoiceId = invoiceId;
    const isTemp = window._isTempInvoice;
    const invObj = window._currentPayNowInvoice;

    if (isTemp) {
      invObj.paid_status = 'Paid';
      invObj.balance = 0;
      invObj.payment_date = paymentDateISO;
      activeInvoiceId = await DB.addInvoice(invObj);
    } else {
      await DB.updateInvoice(invoiceId, {
        balance: 0,
        paid_status: 'Paid',
        payment_date: paymentDateISO
      });
    }

    await DB.addPayment({
      invoice_id: activeInvoiceId,
      amount: amount,
      method: method,
      notes: notes,
      date: paymentDateISO
    });

    const fpOrder = await DB.getOrder(orderId);
    const fpBatchId = fpOrder ? fpOrder.batch_id : '#' + orderId;
    await DB.logAction('Payment Received', `Received payment of LKR ${amount.toLocaleString()} via ${method} for order #${fpBatchId}`, { order_id: orderId, batch_id: fpBatchId, invoice_id: activeInvoiceId, amount, method, notes, undo: { type: 'undo_payment', invoice_id: activeInvoiceId } }, 'Payment');

    await DB.updateOrder(orderId, {
      status: 'Paid',
      payment_date: paymentDateISO
    });

    paynowSelectedIds = paynowSelectedIds.filter(id => id !== orderId);

    hideModal('paynow-options-modal');
    toast(`Order fully paid!`);

    await _refreshPayNowTable();
    await refreshCustomerDetailForOrder(orderId);
  } catch (err) {
    toast('Error: ' + (err.message || err), 'error');
  }
}

async function processPartialPayment(orderId, invoiceId, maxAmount, amount, method, notes, paymentDateISO) {
  try {
    paymentDateISO = paymentDateISO || new Date().toISOString();
    const isTemp = window._isTempInvoice;
    const invObj = window._currentPayNowInvoice;
    const order = await DB.getOrder(orderId);
    const newAdvance = (order.advance_payment || 0) + amount;

    let activeInvoiceId = invoiceId;
    // The order's `status` and the invoice's `paid_status` must always be derived from
    // the SAME canonical calculation, or they silently diverge (e.g. an invoice with a
    // deduction applied could be marked "Paid" while the order stayed stuck on
    // "Unpaid" because a raw `advance >= total_amount` check ignores the deduction).
    // That calculation now also yields 'Partially Paid' (not just Paid/Unpaid), so a
    // partial payment persists correctly instead of silently vanishing.
    let paidStatus;

    if (isTemp) {
      const provisional = { ...invObj, advance_payment: newAdvance };
      const finCheck = Financials.computeInvoiceFinancials(provisional, [], []);
      paidStatus = finCheck.status;

      invObj.advance_payment = newAdvance;
      invObj.balance = finCheck.balance;
      invObj.paid_status = paidStatus;
      invObj.payment_date = paymentDateISO;
      activeInvoiceId = await DB.addInvoice(invObj);

      await DB.addPayment({
        invoice_id: activeInvoiceId,
        amount: amount,
        method: method,
        notes: notes,
        date: paymentDateISO
      });
    } else {
      await DB.addPayment({
        invoice_id: invoiceId,
        amount: amount,
        method: method,
        notes: notes,
        date: paymentDateISO
      });

      const payments = await DB.getPaymentsByInvoice(invoiceId);
      const fin = Financials.computeInvoiceFinancials(invObj, [], payments);
      paidStatus = fin.status;

      await DB.updateInvoice(invoiceId, {
        balance: fin.balance,
        paid_status: paidStatus,
        payment_date: paymentDateISO
      });
    }

    await DB.updateOrder(orderId, {
      advance_payment: newAdvance,
      status: paidStatus,
      payment_date: paymentDateISO
    });

    if (paidStatus === 'Paid') {
      paynowSelectedIds = paynowSelectedIds.filter(id => id !== orderId);
    }

    const ppBatchId = order ? order.batch_id : '#' + orderId;
    // Use activeInvoiceId, not the invoiceId param — the isTemp branch above
    // creates a brand new invoice row, so invoiceId itself can be stale/null
    // at this point; using it here would point Undo at the wrong invoice.
    await DB.logAction('Payment Received', `Received partial payment of LKR ${amount.toLocaleString()} via ${method} for order #${ppBatchId} (Status: ${paidStatus})`, { order_id: orderId, batch_id: ppBatchId, invoice_id: activeInvoiceId, amount, method, notes, status: paidStatus, undo: { type: 'undo_payment', invoice_id: activeInvoiceId } }, 'Payment');

    hideModal('paynow-options-modal');
    toast(`Partial payment of LKR ${amount.toFixed(2)} recorded!`);

    await _refreshPayNowTable();
    refreshCustomerDetailIfOpen(order.customer_id);
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
    let payments = [];

    if (!inv) {
      const items = await DB.getOrderItems(oId);
      if (!items.length) {
        return toast(`Cannot batch pay: Order ${o.batch_id} has no items. Please deselect it or add items first.`, 'warning');
      }
      // Preview only — no DB write. An invoice must only ever be generated
      // once a payment actually happens (here, at confirm time in
      // processBatchPayment), never just for opening this summary. Writing
      // one here would leave a stray Unpaid invoice behind if the user
      // cancels instead of confirming.
      const itemsSubtotal = items.reduce((s,i) => s + (i.subtotal || 0), 0);
      inv = {
        order_id: oId,
        invoice_number: null,
        issue_date: new Date().toISOString(),
        delivery_date: o.delivery_date,
        // Credit Bills were removed (HighIssues.md H-01) — every invoice
        // built here is Standard.
        invoice_type: 'Standard',
        total_amount: o.total_amount || 0,
        advance_payment: o.advance_payment || 0,
        balance: Math.max(0, (o.total_amount || 0) - (o.advance_payment || 0)),
        paid_status: (o.advance_payment || 0) >= (o.total_amount || 0) ? 'Paid' : 'Unpaid',
        discount_rate: 0,
        discount_amount: 0,
        delivery_charge: Math.max(0, (o.total_amount || 0) - itemsSubtotal),
        subtotal_before_discount: itemsSubtotal
      };
      invNum = null;
      invMap[oId] = inv;
    } else {
      payments = await DB.getPaymentsByInvoice(inv.id);
    }

    // Canonical calc — the raw `total_amount - totalPaid` formula this replaced
    // ignored `inv.deduction_amount`, which would overcharge a batch payment for
    // any invoice that had a deduction applied (collecting the pre-deduction amount).
    const finBatch = Financials.computeInvoiceFinancials(inv, [], payments);
    balance = finBatch.balance;

    totalBatchAmount += balance;
    selectedBatchDetails.push({
      customerName: cust?.hotel_name || '—',
      orderNumber: o.batch_id || '—',
      invoiceNumber: invNum,
      amount: balance,
      orderId: oId,
      invoiceId: inv.id,
      pickupDate: o.pickup_date
    });

    batchListHTML += `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 0; font-family:monospace; font-weight:700;">${o.batch_id || '—'}</td>
        <td style="padding:8px 0;">${escapeHtml(cust?.hotel_name || '—')}</td>
        <td style="padding:8px 0; font-family:monospace;">${escapeHtml(invNum || '—')}</td>
        <td style="padding:8px 0; text-align:right; font-weight:600; color:var(--success);">${formatCurrency(balance)}</td>
        <td style="padding:8px 0;">${formatDate(o.pickup_date)}</td>
      </tr>`;
  }

  window._currentBatchDetails = selectedBatchDetails;
  window._currentBatchTotal = totalBatchAmount;
  currentBatchPayOption = 'standard';
  currentBatchInvoiceMode = 'separate';

  createModal('batch-pay-confirm-modal', 'Batch Payment Summary', `
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <button class="btn btn-sm" id="batch-opt-standard" onclick="selectBatchPayOption('standard')" style="background:var(--success);color:#fff;border-color:var(--success);font-weight:600;"><i class="fas fa-wallet"></i> Standard Batch Payment</button>
      <button class="btn btn-sm" id="batch-opt-deduct" onclick="selectBatchPayOption('deduct')" style="background:var(--secondary);color:var(--text);border-color:var(--border);font-weight:600;"><i class="fas fa-cut"></i> Batch Pay with Deductions</button>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="btn btn-sm" id="batch-inv-separate" onclick="selectBatchInvoiceMode('separate')" style="background:#1a4d8f;color:#fff;border-color:#1a4d8f;font-weight:600;"><i class="fas fa-file-invoice"></i> Separate Invoice</button>
      <button class="btn btn-sm" id="batch-inv-single" onclick="selectBatchInvoiceMode('single')" style="background:var(--secondary);color:var(--text);border-color:var(--border);font-weight:600;"><i class="fas fa-layer-group"></i> Single Invoice</button>
    </div>
    <p id="batch-inv-mode-hint" style="font-size:0.8em; color:var(--text-muted); margin-bottom:14px;">Each order will be saved under its own separate invoice number.</p>

    <p style="font-size:0.88em; color:var(--text-muted); margin-bottom:14px;">Please review the summary of selected orders before confirming payment.</p>

    <div style="background:var(--bg); padding:16px; border-radius:10px; margin-bottom:18px;">
      <div style="font-size:0.9em; font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">
        No of Orders Selected: ${selectedBatchDetails.length}
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
        <thead>
          <tr style="border-bottom:1.5px solid var(--border); text-transform:uppercase; font-size:0.75em; color:var(--text-muted); font-weight:700;">
            <th style="padding:6px 0; text-align:left;">Order ID</th>
            <th style="padding:6px 0; text-align:left;">Customer</th>
            <th style="padding:6px 0; text-align:left;">Invoice No</th>
            <th style="padding:6px 0; text-align:right;">Amount (LKR)</th>
            <th style="padding:6px 0; text-align:left;">Pickup Date</th>
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
      <div class="form-group" style="max-width:240px;">
        <label class="form-label" style="font-weight:700;">Paying Date *</label>
        <input type="date" class="form-input" id="pn-batch-date" value="${today()}" max="${today()}"/>
      </div>
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
  let paymentDateISO;
  try {
    paymentDateISO = resolvePaymentTimestamp('pn-batch-date');
  } catch (err) {
    return toast(err.message, 'error');
  }

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
    await processBatchPayment(method, notes, paymentDateISO);
  }, 'Confirm Batch Payment', false);
}

async function processBatchPayment(method = 'Cash', notes = 'Paid fully via Batch Payment', paymentDateISO) {
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
    paymentDateISO = paymentDateISO || new Date().toISOString();
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
    const touchedCustomerIds = new Set();
    const isSingleInvoice = currentBatchInvoiceMode === 'single';
    const singleInvoiceNumber = isSingleInvoice ? await DB.generateInvoiceNumber() : null;

    // Phase 1 — pure computation, no writes yet. Doing every order's math
    // up front (and only starting to write once it's all known-good) means
    // a mid-batch failure can't leave an order half-updated: marked Paid
    // with no invoice behind it, or its old invoice deleted with nothing to
    // replace it — the "invoice missing" bug this replaced.
    let deductionAssigned = 0;
    const computed = [];
    for (let idx = 0; idx < details.length; idx++) {
      const detail = details[idx];
      const oId = detail.orderId;
      const order = oMap[oId];
      if (!order) continue;
      touchedCustomerIds.add(order.customer_id);

      const orderItems = await DB.getOrderItems(oId);
      const itemsSubtotal = orderItems.reduce((s, i) => s + (i.subtotal || (i.price * i.quantity) || 0), 0);
      const orderTotal = (order.total_amount && order.total_amount > 0) ? order.total_amount : (itemsSubtotal > 0 ? itemsSubtotal : detail.amount);
      const orderAdvance = order.advance_payment || 0;
      const orderBalance = detail.amount; // balance for this order

      // Proportional deduction split — only meaningful in Separate Invoice
      // mode (Single Invoice mode below records the un-split deductionAmount
      // directly on the one consolidated invoice). The last order absorbs
      // whatever rounding remainder is left, so the per-order pieces always
      // sum to exactly `deductionAmount` instead of silently drifting a cent
      // or two off it.
      let orderDeduction = 0;
      if (!isSingleInvoice && deductionAmount > 0 && totalAmount > 0) {
        const isLast = idx === details.length - 1;
        orderDeduction = isLast
          ? Math.round((deductionAmount - deductionAssigned) * 100) / 100
          : Math.round((orderBalance / totalAmount) * deductionAmount * 100) / 100;
        deductionAssigned += orderDeduction;
      }

      computed.push({
        oId, order, itemsSubtotal, orderTotal, orderAdvance, orderBalance, orderDeduction,
        customerName: detail.customerName,
        existingInv: existingInvMap[oId],
        payAmount: Math.max(0, orderBalance - orderDeduction)
      });
    }

    if (isSingleInvoice) {
      // Build + write the consolidated invoice FIRST. Only once it (and its
      // deduction/payment) exist do we touch each order's own pre-existing
      // invoice or status, so a failure here leaves every order exactly as
      // it was before — never "Paid" with no invoice behind it.
      const singleInvoiceTotal = computed.reduce((s, c) => s + c.orderTotal, 0);
      const singleInvoiceAdvance = computed.reduce((s, c) => s + c.orderAdvance, 0);
      const singleInvoiceDetails = computed.map(c => ({
        invoiceNumber: singleInvoiceNumber,
        orderNumber: c.order.batch_id || ('#' + c.oId),
        customerName: c.customerName,
        amount: c.orderBalance
      }));
      const primaryOrderId = computed[0].oId;
      const primaryOrder = computed[0].order;

      // Any order in this batch may already carry a deduction from an
      // earlier Pay Now settlement. Those deduction rows get moved onto the
      // consolidated invoice below (rather than being cascade-deleted with
      // their old invoice), so its deduction_amount has to carry them too —
      // otherwise the invoice's own recomputed balance won't come back to
      // zero. See the reconciliation note by the fold-in loop.
      const carriedDeduction = computed.reduce(
        (s, c) => s + (parseFloat(c.existingInv?.deduction_amount) || 0), 0);

      const newInvId = await DB.addInvoice({
        order_id:         primaryOrderId,
        invoice_number:   singleInvoiceNumber,
        issue_date:       paymentDateISO,
        delivery_date:    primaryOrder?.delivery_date || today(),
        invoice_type:     'Standard',
        total_amount:     singleInvoiceTotal,
        advance_payment:  singleInvoiceAdvance,
        balance:          0,
        paid_status:      'Paid',
        deduction_amount: deductionAmount + carriedDeduction,
        payment_date:     paymentDateISO,
        batch_order_ids:      computed.map(c => c.oId).join(','),
        batch_invoice_details: JSON.stringify(singleInvoiceDetails)
      });
      createdInvoiceIds.push(newInvId);

      if (deductionAmount > 0) {
        await DB.addDeduction({
          invoice_id: newInvId,
          invoice_number: singleInvoiceNumber,
          original_amount: totalAmount,
          deduction_amount: deductionAmount,
          final_amount: totalAmount - deductionAmount,
          reason: reason
        });
      }

      const totalPayAmount = Math.max(0, totalAmount - deductionAmount);
      if (totalPayAmount > 0) {
        await DB.addPayment({
          invoice_id: newInvId,
          amount: totalPayAmount,
          method: method,
          notes: notes,
          date: paymentDateISO
        });
      }

      // Consolidated invoice is safely written — now fold in each order:
      // retire its old standalone invoice (can't be reused once merged) and
      // mark it Paid.
      //
      // The old invoice ROW goes, but its money does not. Payments and
      // deductions are re-pointed at the consolidated invoice first;
      // deleting them (as this used to) permanently erased cash that had
      // genuinely been collected through Pay Now, so every report summing
      // the payments table — including "Monthly Cash Collected" for months
      // already closed — retroactively dropped by that amount. Deductions
      // would have gone the same way via the ON DELETE CASCADE on
      // deductions.invoice_id.
      //
      // Carrying both across is also what makes the consolidated invoice
      // internally consistent. With P = prior payments, D = prior
      // deductions and A = advances:
      //   netPayable = Σ orderTotal − (newDeduction + D)
      //   totalPaid  = Σ A + Σ P + (batchDue − newDeduction)
      // and since each orderBalance already equals
      // orderTotal − A − P − D, the two sides cancel and the recomputed
      // balance lands on exactly 0 — matching the balance:0 / Paid we
      // write above. Deleting the history left it short by Σ P.
      for (const c of computed) {
        if (c.existingInv) {
          await DB.reassignPaymentsToInvoice(c.existingInv.id, newInvId);
          await DB.reassignDeductionsToInvoice(c.existingInv.id, newInvId, singleInvoiceNumber);
          await DB.deleteInvoice(c.existingInv.id);
        }
        await DB.updateOrder(c.oId, { status: 'Paid', payment_date: paymentDateISO });
        await DB.logAction(
          'Payment Received',
          `Batch payment: Order #${c.order.batch_id || c.oId} folded into single invoice ${singleInvoiceNumber}`,
          { order_id: c.oId, batch_id: c.order.batch_id, amount: c.payAmount, deduction: c.orderDeduction, method },
          'Payment'
        );
      }
    } else {
      // Separate Invoice mode — each order settles independently.
      for (const c of computed) {
        const { oId, order, itemsSubtotal, orderTotal, orderAdvance, orderDeduction, payAmount, existingInv } = c;

        if (existingInv) {
          // This order already has its own invoice (e.g. from an earlier Pay
          // Now partial payment) — settle it in place under its existing
          // invoice number instead of discarding it and minting a new one.
          const newInvId = existingInv.id;
          const invNum = existingInv.invoice_number;

          await DB.updateInvoice(newInvId, {
            balance: 0,
            paid_status: 'Paid',
            deduction_amount: (existingInv.deduction_amount || 0) + orderDeduction,
            payment_date: paymentDateISO
          });

          createdInvoiceIds.push(newInvId);

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

          if (payAmount > 0) {
            await DB.addPayment({
              invoice_id: newInvId,
              amount: payAmount,
              method: method,
              notes: notes,
              date: paymentDateISO
            });
          }
        } else {
          // First ever payment on this order — one invoice per order.
          const invNum = await DB.generateInvoiceNumber();
          const newInvId = await DB.addInvoice({
            order_id:                 oId,
            invoice_number:           invNum,
            issue_date:               paymentDateISO,
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
            payment_date:             paymentDateISO
          });

          createdInvoiceIds.push(newInvId);

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

          if (payAmount > 0) {
            await DB.addPayment({
              invoice_id: newInvId,
              amount: payAmount,
              method: method,
              notes: notes,
              date: paymentDateISO
            });
          }
        }

        await DB.updateOrder(oId, { status: 'Paid', payment_date: paymentDateISO });

        await DB.logAction(
          'Payment Received',
          `Batch payment: Order #${order.batch_id || oId} paid LKR ${payAmount.toLocaleString()} via ${method}${orderDeduction > 0 ? ' (Deduction: LKR ' + orderDeduction.toLocaleString() + ')' : ''}`,
          { order_id: oId, batch_id: order.batch_id, amount: payAmount, deduction: orderDeduction, method },
          'Payment'
        );
      }
    }

    paynowSelectedIds = [];

    hideModal('batch-pay-confirm-modal');
    toast(isSingleInvoice
      ? `Batch payment completed! Orders saved under a single invoice (${singleInvoiceNumber}).`
      : `Batch payment completed! ${createdInvoiceIds.length} separate invoices created.`);

    await _refreshPayNowTable();
    touchedCustomerIds.forEach(cid => refreshCustomerDetailIfOpen(cid));
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
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0;">${escapeHtml(d.customerName)}</td>
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace; font-weight:700;">${escapeHtml(d.orderNumber)}</td>
      <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace;">${escapeHtml(d.invoiceNumber)}</td>
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
            <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:#1a4d8f;">${escapeHtml(settings.company_name)}</div>
            ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${escapeHtml(settings.address)}</div>`:''}
            <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).map(escapeHtml).join('  |  ')}</div>
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
        ${escapeHtml(settings.footer_message)}
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
  openCustomerDetail(id, 'prices');
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
    const dcVal = row.querySelector('.cprice-dc')?.value.trim() ?? '';
    const wpVal = row.querySelector('.cprice-wp')?.value.trim() ?? '';
    const wdVal = row.querySelector('.cprice-wd')?.value.trim() ?? '';

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
    if (currentDetailCustomerId === id) {
      const [c, orders] = await Promise.all([
        DB.getCustomer(id),
        DB.getOrdersByCustomer(id)
      ]);
      if (c) await renderCustomerDetailTabBody(c, orders, 'prices');
    } else {
      renderCustomers();
    }
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

let currentBatchInvoiceMode = 'separate';

function selectBatchInvoiceMode(mode) {
  currentBatchInvoiceMode = mode;
  const optSeparate = document.getElementById('batch-inv-separate');
  const optSingle = document.getElementById('batch-inv-single');
  const hint = document.getElementById('batch-inv-mode-hint');

  if (mode === 'separate') {
    if (optSeparate) { optSeparate.style.background = '#1a4d8f'; optSeparate.style.borderColor = '#1a4d8f'; optSeparate.style.color = '#fff'; }
    if (optSingle) { optSingle.style.background = 'var(--secondary)'; optSingle.style.borderColor = 'var(--border)'; optSingle.style.color = 'var(--text)'; }
    if (hint) hint.textContent = 'Each order will be saved under its own separate invoice number.';
  } else {
    if (optSingle) { optSingle.style.background = '#1a4d8f'; optSingle.style.borderColor = '#1a4d8f'; optSingle.style.color = '#fff'; }
    if (optSeparate) { optSeparate.style.background = 'var(--secondary)'; optSeparate.style.borderColor = 'var(--border)'; optSeparate.style.color = 'var(--text)'; }
    if (hint) hint.textContent = 'All selected orders will be saved under one shared invoice number (with their own order IDs).';
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
            value="${escapeHtml(actionsSearch)}" oninput="actionsSearch=this.value;actionsPage=1;_refreshActionsTable()"/>
        </div>

        <div>
          <select class="form-input form-select" id="actions-category-select" onchange="actionsCategoryFilter=this.value;actionsPage=1;_refreshActionsTable()">
            <option value="ALL" ${actionsCategoryFilter==='ALL'?'selected':''}>All Categories</option>
            <option value="Transport" ${actionsCategoryFilter==='Transport'?'selected':''}>Transport</option>
            <option value="Expense" ${actionsCategoryFilter==='Expense'?'selected':''}>Expense</option>
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
            <option value="Add Expense Category">Add Expense Category</option>
            <option value="Add Expense Type">Add Expense Type</option>
            <option value="Reorder Expense Category">Reorder Expense Category</option>
            <option value="Reorder Expense Type">Reorder Expense Type</option>
            <option value="Add Cash Book Entry">Add Cash Book Entry</option>
            <option value="Edit Cash Book Cell">Edit Cash Book Cell</option>
            <option value="Delete Cash Book Entry">Delete Cash Book Entry</option>
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
              <th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody id="actions-table-body"></tbody>
        </table>
      </div>
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

  const pageItems = filtered;

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
          <div style="font-size:0.9em;font-weight:500;line-height:1.4;">${escapeHtml(a.description || '—')}</div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72em;font-weight:700;flex-shrink:0;">
              ${escapeHtml((a.user || 'A').charAt(0).toUpperCase())}
            </div>
            <span style="font-size:0.85em;font-weight:600;">${escapeHtml(a.user || 'System')}</span>
          </div>
        </td>
        <td style="text-align:center;">
          <div style="display:inline-flex;gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="showActionDetailsModal('${a.id}')" title="View Payload Details">
              <i class="fas fa-info-circle"></i>
            </button>
            ${isAdmin() && a.details?.undo && !a.details?.undone
              ? `<button class="btn btn-secondary btn-sm" style="color:#b45309;" onclick="undoRecentAction('${a.id}')" title="Undo this action"><i class="fas fa-rotate-left"></i> Undo</button>`
              : (a.details?.undone ? `<span class="badge badge-gray" style="font-size:0.72em;">Undone</span>` : '')}
          </div>
        </td>
      </tr>`;
    }).join('');
  }
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
        <td style="font-family:monospace;font-size:0.84em;font-weight:700;color:var(--primary);width:35%;">${escapeHtml(k)}</td>
        <td style="font-size:0.88em;word-break:break-all;">${typeof v === 'object' ? '<pre style="margin:0;font-size:0.82em;">' + escapeHtml(JSON.stringify(v, null, 2)) + '</pre>' : escapeHtml(String(v))}</td>
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
      <div style="font-size:0.95em;font-weight:600;padding:10px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;">${escapeHtml(act.description)}</div>
      <div style="display:flex;gap:20px;font-size:0.88em;">
        <div><strong>Category:</strong> ${escapeHtml(act.category || 'System')}</div>
        <div><strong>Performed By:</strong> ${escapeHtml(act.user || 'System')}</div>
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

// ─────────────────────────────────────────────
// UNDO — central dispatcher for the Recent Actions "Undo" button. Every
// undoable log entry carries a details.undo = { type, ...whatever that
// type needs } payload written at the time of the original action (see the
// various logAction() call sites across app.js/orders.js/items.js/
// transport.js). Payments/Deductions deliberately reuse the existing,
// already-tested undoPaymentForInvoice()/undoDeductionConfirm() (invoice.js)
// instead of a second reversal path for money.
// ─────────────────────────────────────────────
async function undoRecentAction(actionId) {
  if (!isAdmin()) return toast('Admin permission required', 'error');
  const actions = await DB.getActions();
  const action = actions.find(a => String(a.id) === String(actionId));
  if (!action) return toast('Action not found', 'error');
  const undo = action.details && action.details.undo;
  if (!undo || action.details.undone) return toast('This action cannot be undone', 'error');

  const finish = async () => {
    await DB.markActionUndone(actionId);
    if (document.getElementById('actions-table-body')) await _refreshActionsTable();
  };

  if (undo.type === 'undo_payment') return undoPaymentForInvoice(undo.invoice_id, finish);
  if (undo.type === 'undo_deduction') return undoDeductionConfirm(undo.deduction_id, undo.invoice_id, undo.amount, finish);

  confirmDialog(`Undo "${action.action_type}"? ${escapeHtml(action.description || '')}`, async () => {
    try {
      switch (undo.type) {
        case 'restore_trash': {
          const row = await DB.restoreFromTrash(undo.trash_id);
          toast(`${row.entity_type} "${row.entity_label}" restored`);
          break;
        }
        case 'revert_order_fields': {
          for (const o of (undo.orders || [])) {
            await DB.updateOrder(o.order_id, { driver_id: o.driver_id, delivery_status: o.delivery_status, driver_assigned_at: o.driver_assigned_at });
          }
          toast('Order assignment/delivery status reverted');
          break;
        }
        case 'delete_flags': {
          for (const id of (undo.flag_ids || [])) await DB.deleteFlag(id);
          toast('Pending/Returned flag(s) removed');
          break;
        }
        case 'delete_record': {
          await _undoCreateByDeleting(undo.entity_type, undo.id);
          toast(`${undo.entity_type} removed`);
          break;
        }
        case 'revert_edit': {
          await _revertEdit(undo);
          toast('Edit reverted');
          break;
        }
        default:
          toast('Unknown undo type', 'error');
          return;
      }
      await finish();
      _refreshOpenPageAfterUndo();
    } catch (err) {
      console.error('undoRecentAction error:', err);
      toast('Failed to undo: ' + (err.message || err), 'error');
    }
  }, 'Undo', false);
}

// "Undo" on a create ("Add X") log entry = delete what was created — routed
// through the same snapshot-to-Trash step the normal delete flows use, so
// it's itself undoable again from Trash if that turns out to be a mistake.
async function _undoCreateByDeleting(entityType, id) {
  if (entityType === 'Order') {
    const snapshot = await DB.getOrderFullSnapshot(id);
    if (snapshot) await DB.addTrash({ entity_type: 'Order', entity_label: snapshot.order.batch_id, payload: snapshot, deleted_by: currentUser?.display_name });
    await DB.deleteOrder(id);
    return;
  }
  const meta = {
    Customer: { get: DB.getCustomer, del: DB.deleteCustomer, label: r => r.hotel_name },
    Driver:   { get: DB.getDriver,   del: DB.deleteDriver,   label: r => r.name },
    Vehicle:  { get: DB.getVehicle,  del: DB.deleteVehicle,  label: r => r.vehicle_no },
    Item:     { get: DB.getItem,     del: DB.deleteItem,     label: r => r.item_name }
  }[entityType];
  if (!meta) throw new Error(`Don't know how to undo a "${entityType}" creation`);
  const record = await meta.get(id);
  if (record) {
    await DB.addTrash({ entity_type: entityType, entity_label: meta.label(record), payload: record, deleted_by: currentUser?.display_name });
  }
  await meta.del(id);
}

// "Undo" on an "Edit X" log entry = re-apply the field values captured
// right before that edit was saved (see saveEditOrder/saveEditCustomer/
// saveEditDriver/saveEditVehicle).
async function _revertEdit(undo) {
  if (undo.entity_type === 'Order') {
    await DB.updateOrderWithItems(undo.order_id, undo.previous_order, undo.previous_items || []);
    if (undo.previous_invoice) {
      const { id: invId, payments, ...invFields } = undo.previous_invoice;
      await DB.updateInvoice(invId, invFields);
    }
    return;
  }
  const updaters = { Customer: DB.updateCustomer, Driver: DB.updateDriver, Vehicle: DB.updateVehicle };
  const fn = updaters[undo.entity_type];
  if (!fn) throw new Error(`Don't know how to revert edit for "${undo.entity_type}"`);
  await fn(undo.id, undo.previous);
}

// Best-effort refresh of whatever page is currently open after an undo —
// mirrors the same "refresh if that view happens to be mounted" pattern
// already used throughout orders.js (e.g. markOrderDelivered).
function _refreshOpenPageAfterUndo() {
  if (document.getElementById('orders-table-body')) _refreshOrdersTable();
  if (document.getElementById('driver-dashboard-page')) renderDriverDashboard();
  if (currentPage === 'customers') renderCustomers();
  if (currentPage === 'drivers') renderDrivers();
  if (currentPage === 'vehicles') _refreshVehiclesGrid();
  if (currentPage === 'items') renderItems();
  if (currentPage === 'trash') renderTrash();
  if (currentPage === 'transport' && typeof TransportModule !== 'undefined') TransportModule.renderTripsList();
}

// ─────────────────────────────────────────────
// TRASH / RECYCLE BIN — anything deleted (Customer/Driver/Vehicle/Item/
// Trip/Order) lands here first via DB.addTrash (see the delete-confirm
// functions in this file, orders.js, items.js, transport.js). DB.getTrash()
// purges anything past 7 days before returning the rest. Restoring here is
// the exact same DB.restoreFromTrash() the Recent Actions "Undo" button
// uses for Delete-type entries — this page is just a direct view onto it.
// ─────────────────────────────────────────────
async function renderTrash() {
  document.getElementById('page-title').textContent = 'Trash';
  showLoading('content', 'Loading Trash...');

  const items = await DB.getTrash();

  const rows = items.map(t => {
    const deletedAt = new Date(t.deleted_at);
    const ageMs = Date.now() - deletedAt.getTime();
    const daysLeft = Math.max(0, 7 - Math.floor(ageMs / (24 * 60 * 60 * 1000)));
    const daysLeftColor = daysLeft <= 2 ? '#dc2626' : 'var(--text)';
    return `<tr>
      <td><span class="badge badge-blue">${escapeHtml(t.entity_type)}</span></td>
      <td><strong>${escapeHtml(t.entity_label || '—')}</strong></td>
      <td>${escapeHtml(t.deleted_by || 'Unknown')}</td>
      <td>${formatDate(t.deleted_at)}</td>
      <td style="font-weight:700;color:${daysLeftColor};">${daysLeft} day${daysLeft === 1 ? '' : 's'}</td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:6px;">
          <button class="btn btn-primary btn-sm" onclick="restoreTrashItemConfirm(${t.id})"><i class="fas fa-trash-arrow-up"></i> Restore</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTrashForeverConfirm(${t.id})"><i class="fas fa-trash"></i> Delete Forever</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title"><i class="fas fa-trash-can" style="color:var(--primary);margin-right:8px;"></i>Trash</span>
      <div style="font-size:0.83em;color:var(--text-muted);margin-top:2px;">Deleted records are kept here for 7 days before being permanently removed.</div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Item</th><th>Deleted By</th><th>Deleted At</th><th>Days Left</th><th style="text-align:center;">Actions</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:2em;margin-bottom:8px;">🗑️</div>Trash is empty</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function restoreTrashItemConfirm(trashId) {
  confirmDialog('Restore this item back to the system?', async () => {
    try {
      const row = await DB.restoreFromTrash(trashId);
      toast(`${row.entity_type} "${row.entity_label}" restored`);
      renderTrash();
    } catch (err) {
      console.error('restoreTrashItemConfirm error:', err);
      toast('Failed to restore: ' + (err.message || err), 'error');
    }
  }, 'Restore', false);
}

function deleteTrashForeverConfirm(trashId) {
  if (!canDelete()) return toast('Admin permission required', 'error');
  confirmDialog('Permanently delete this item? This cannot be undone.', async () => {
    try {
      await DB.deleteTrashForever(trashId);
      toast('Deleted permanently');
      renderTrash();
    } catch (err) {
      console.error('deleteTrashForeverConfirm error:', err);
      toast('Failed to delete: ' + (err.message || err), 'error');
    }
  });
}

