// reports.js - Reports Module

async function renderReports() {
  document.getElementById('page-title').textContent = 'Reports';
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Reports & Analytics</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:24px;">
      ${reportCard('Daily Orders',      "Today's order summary",             'fa-calendar-day',  'badge-blue',   'generateDailyOrdersReport()')}
      ${reportCard('Monthly Revenue',   'Revenue breakdown by month',        'fa-chart-line',    'badge-green',  'generateMonthlyRevenueReport()')}
      ${reportCard('Customer Billing',  'Per-customer billing summary',      'fa-hotel',         'badge-purple', 'generateCustomerBillingReport()')}
      ${reportCard('Full Report',       'Complete report with date filter',  'fa-file-alt',      'badge-cyan',   'showFullReportModal()')}
      ${reportCard('Customer Summary',  'Customer details and item columns', 'fa-file-invoice',  'badge-red',    'showCustomerSummaryModal()')}
      ${reportCard('Expenses Report',   'Fully customizable expense breakdown', 'fa-file-invoice-dollar', 'badge-yellow', 'showExpensesReportModal()')}
      ${reportCard('Monthly Bills',     'Per-month order bills summary',     'fa-receipt',       'badge-orange', 'showMonthlyBillsModal()')}
      ${reportCard('Driver Report',     'Per-driver performance, customizable', 'fa-id-card',    'badge-blue',   'showDriverReportModal()')}
      ${reportCard('Vehicle Report',    'Trips, distance & fuel cost, customizable', 'fa-truck', 'badge-purple', 'showVehicleReportModal()')}
    </div>
    <div id="report-output"></div>`;
}

function reportCard(title, desc, icon, badge, onclick) {
  return `<div class="card" style="cursor:pointer;transition:box-shadow 0.2s;" onclick="${onclick}"
    onmouseover="this.style.boxShadow='0 8px 28px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow=''">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
      <div class="icon badge ${badge}" style="width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3em;">
        <i class="fas ${icon}"></i>
      </div>
      <div>
        <div style="font-weight:700;font-size:1em;">${title}</div>
        <div style="font-size:0.82em;color:var(--text-muted);">${desc}</div>
      </div>
    </div>
    <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;">
      <i class="fas fa-chart-bar"></i> Generate Report
    </button>
  </div>`;
}

function reportWrapper(title, content, exportFn) {
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-family:'Playfair Display',serif;font-size:1.1em;font-weight:700;">${title}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="${exportFn}('csv')"><i class="fas fa-file-csv"></i> CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="${exportFn}('excel')"><i class="fas fa-file-excel"></i> Excel</button>
        <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
      </div>
    </div>
    ${content}
  </div>`;
}

// ─────────────────────────────────────────────
// DAILY ORDERS
// ─────────────────────────────────────────────
async function generateDailyOrdersReport() {
  const todayStr = today();
  const [orders, customers] = await Promise.all([DB.getOrders(), DB.getCustomers()]);
  const cMap = Object.fromEntries(customers.map(c=>[c.id,c]));
  const todayOrders = orders.filter(o=>(o.pickup_date||'').startsWith(todayStr)||(o.created_at||'').startsWith(todayStr));
  window._reportData = todayOrders;

  const rows = todayOrders.map(o=>`<tr>
    <td>${o.batch_id||'—'}</td>
    <td>${getOrderCustomerName(o, cMap)}</td>
    <td>${statusBadge(o.status)}</td>
    <td>${formatCurrency(o.total_amount)}</td>
    <td>${formatCurrency(o.advance_payment)}</td>
  </tr>`).join('')||`<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No orders today</td></tr>`;
  // "Total Billed" = order value regardless of payment status (accrual).
  // "Collected Today" = actual cash taken in on these orders (advance only
  // — any later Pay Now payment on an older order is a different day's
  // collection and correctly belongs to that other day's number instead).
  // These were previously combined under one misleading "Total Revenue"
  // label that was really just the billed total.
  const totalBilled = todayOrders.reduce((s,o)=>s+(o.total_amount||0),0);
  const totalCollected = todayOrders.reduce((s,o)=>s+(o.advance_payment||0),0);

  document.getElementById('report-output').innerHTML = reportWrapper(`Daily Orders — ${todayDisplay()}`,
    `<div class="table-wrap"><table>
      <thead><tr><th>Batch ID</th><th>Customer</th><th>Status</th><th>Total</th><th>Advance</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="font-weight:700;padding:12px 16px;text-align:right;">Total Billed Today</td>
        <td colspan="2" style="font-weight:700;padding:12px 16px;">${formatCurrency(totalBilled)}</td></tr>
      <tr><td colspan="3" style="font-weight:700;padding:12px 16px;text-align:right;color:var(--success);">Cash Collected Today</td>
        <td colspan="2" style="font-weight:700;padding:12px 16px;color:var(--success);">${formatCurrency(totalCollected)}</td></tr></tfoot>
    </table></div>`, 'exportDailyOrders');
}
function exportDailyOrders(type) {
  exportData((window._reportData||[]).map(o=>({'Batch ID':o.batch_id,'Status':o.status,'Total':o.total_amount,'Advance':o.advance_payment})),'daily_orders',type);
}

// ─────────────────────────────────────────────
// MONTHLY REVENUE
// ─────────────────────────────────────────────
async function generateMonthlyRevenueReport() {
  // Cash actually collected, by month — but the month is the ORDER's own
  // month (pickup date, falling back to when it was created), not whenever
  // each payment happened to be logged. Bucketing by payment date meant
  // paying off a month-old unpaid order today dumped its whole amount into
  // *this* month's row, making the business look like it suddenly earned
  // extra revenue this month for work actually done (and billed) earlier.
  // Every LKR collected on an order — its advance_payment plus any later
  // `payments` rows against its invoice (Pay Now, deduction payoff, etc.)
  // — is summed together and attributed to that order's own month instead.
  const [orders, invoices, payments] = await Promise.all([DB.getOrders(), DB.getInvoices(), DB.getPayments()]);
  const invByOrder = Object.fromEntries(invoices.map(i => [i.order_id, i]));
  const paymentsByInvoice = {};
  payments.forEach(p => { (paymentsByInvoice[p.invoice_id] ||= []).push(p); });

  const monthMap = {};
  orders.forEach(o=>{
    const advance = parseFloat(o.advance_payment) || 0;
    const inv = invByOrder[o.id];
    const laterPayments = inv ? (paymentsByInvoice[inv.id] || []).reduce((s,p) => s + (parseFloat(p.amount) || 0), 0) : 0;
    const collected = advance + laterPayments;
    if (collected <= 0) return;
    const month = (o.pickup_date || o.created_at || '').slice(0,7);
    if (!month) return;
    monthMap[month] = (monthMap[month]||0) + collected;
  });
  const sorted = Object.entries(monthMap).sort((a,b)=>a[0].localeCompare(b[0]));
  window._reportData = sorted.map(([m,a])=>({Month:m,Revenue:a}));

  const rows = sorted.map(([m,a])=>`<tr><td>${m}</td><td><strong>${formatCurrency(a)}</strong></td></tr>`).join('')
    || `<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>`;
  const grandTotal = sorted.reduce((s,[,a])=>s+a,0);

  document.getElementById('report-output').innerHTML = reportWrapper('Monthly Revenue Report',
    `<div style="font-size:0.8em;color:var(--text-muted);margin-bottom:12px;">Revenue is grouped by each order's pickup date, not the date it was paid — settling an old unpaid order today still counts toward its original month.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Month</th><th>Revenue (LKR)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td style="font-weight:700;padding:12px 16px;">Grand Total</td><td style="font-weight:700;padding:12px 16px;">${formatCurrency(grandTotal)}</td></tr></tfoot>
    </table></div>`, 'exportMonthlyRevenue');
}
function exportMonthlyRevenue(type) { exportData(window._reportData||[],'monthly_revenue',type); }

// ─────────────────────────────────────────────
// CUSTOMER BILLING
// ─────────────────────────────────────────────
async function generateCustomerBillingReport() {
  const [orders,customers,invoices,payments] = await Promise.all([DB.getOrders(),DB.getCustomers(),DB.getInvoices(),DB.getPayments()]);
  const invMap = Object.fromEntries(invoices.map(i=>[i.order_id,i]));
  const payMap = {};
  payments.forEach(p => { 
    if (!payMap[p.invoice_id]) payMap[p.invoice_id] = [];
    payMap[p.invoice_id].push(p);
  });

  const custSummary = {};
  customers.forEach(c => { custSummary[c.id] = { name: c.hotel_name, total: 0, paid: 0, balance: 0, orders: 0 }; });
  orders.forEach(o => {
    if (!custSummary[o.customer_id]) return;
    custSummary[o.customer_id].orders++;
    const inv = invMap[o.id];
    if (inv) {
      const pList = payMap[inv.id] || [];
      const fin = Financials.computeInvoiceFinancials(inv, [], pList);
      custSummary[o.customer_id].total += fin.netPayableTotal;
      custSummary[o.customer_id].paid += fin.totalPaid;
      custSummary[o.customer_id].balance += fin.balance;
    } else {
      const ordFin = Financials.computeOrderFinancials(o, []);
      custSummary[o.customer_id].total += ordFin.grandTotal;
      custSummary[o.customer_id].paid += ordFin.advancePayment;
      custSummary[o.customer_id].balance += ordFin.balance;
    }
  });

  const rows = Object.values(custSummary).map(s=>`<tr>
    <td>${s.name}</td><td>${s.orders}</td>
    <td>${formatCurrency(s.total)}</td>
    <td style="color:var(--success);">${formatCurrency(s.paid)}</td>
    <td style="color:${s.balance>0?'var(--danger)':'var(--success)'};">${formatCurrency(Math.max(0,s.balance))}</td>
  </tr>`).join('');

  window._reportData = Object.values(custSummary).map(s=>({Customer:s.name,Orders:s.orders,Total:s.total,Paid:s.paid,Balance:Math.max(0,s.balance)}));
  document.getElementById('report-output').innerHTML = reportWrapper('Customer Billing Summary',
    `<div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th>Orders</th><th>Total Billed</th><th>Paid</th><th>Balance</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No data</td></tr>`}</tbody>
    </table></div>`, 'exportCustomerBilling');
}
function exportCustomerBilling(type) { exportData(window._reportData||[],'customer_billing',type); }

// ─────────────────────────────────────────────
// DRIVER REPORT — customizable (date range + driver select)
// ─────────────────────────────────────────────
async function showDriverReportModal() {
  const firstDay = new Date(); firstDay.setDate(1);
  const from = toLocalISODate(firstDay);
  const to   = today();

  const drivers = await DB.getDrivers();
  const driverCheckboxes = drivers.map(d => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.88em; cursor:pointer; user-select:none; font-weight:600; color:var(--text);">
      <input type="checkbox" class="dr-driver-chk" value="${d.id}" checked style="cursor:pointer;" />
      ${d.name}
    </label>
  `).join('');

  createModal('driver-report-modal', 'Driver Report', `
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:18px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">From Date</label>
        <input type="date" class="form-input" id="dr-from" value="${from}"/>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">To Date</label>
        <input type="date" class="form-input" id="dr-to" value="${to}"/>
      </div>
      <button class="btn btn-primary" onclick="generateDriverReport()" style="height:40px;">
        <i class="fas fa-chart-bar"></i> Generate
      </button>
      <div class="form-group" style="grid-column: span 3; margin-top:10px; margin-bottom:0;">
        <label class="form-label" style="font-weight:700;">Select Drivers:</label>
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAllDrChecks(true)">Select All</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllDrChecks(false)">Clear All</button>
        </div>
        <div id="dr-driver-checkboxes" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px; max-height:110px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--bg);">
          ${driverCheckboxes}
        </div>
      </div>
    </div>
    <div id="dr-report-body" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">
      Select parameters and click Generate.
    </div>
    <div id="dr-report-export" style="display:none;margin-top:14px;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary btn-sm" onclick="exportDriverReport('csv')"><i class="fas fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportDriverReport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="printDriverReport()"><i class="fas fa-print"></i> Print</button>
    </div>`, 'modal-xl');

  window.toggleAllDrChecks = function(checked) {
    document.querySelectorAll('.dr-driver-chk').forEach(chk => chk.checked = checked);
  };

  showModal('driver-report-modal');
}

async function generateDriverReport() {
  const from = document.getElementById('dr-from')?.value;
  const to   = document.getElementById('dr-to')?.value;
  if(!from||!to) return toast('Select both dates','error');
  if(from>to)    return toast('From date must be before To date','error');

  const selectedDriverIds = [...document.querySelectorAll('.dr-driver-chk:checked')].map(chk => Number(chk.value));
  if (!selectedDriverIds.length) return toast('Please select at least one driver', 'warning');

  showProcessingOverlay('Generating Driver Report', 'Fetching order data...');

  let summaryList;
  try {
    const [orders, drivers] = await Promise.all([DB.getOrders(), DB.getDrivers()]);
    const dMap = Object.fromEntries(drivers.map(d=>[d.id,d]));
    const _orderDate = o => (o.pickup_date || o.created_at || '').slice(0,10);

    const drvSummary = {};
    selectedDriverIds.forEach(id => {
      const d = dMap[id];
      if (d) drvSummary[id] = { name: d.name, trips: 0, delivered: 0, total: 0 };
    });

    orders.forEach(o=>{
      if(!o.driver_id||!drvSummary[o.driver_id])return;
      const d = _orderDate(o);
      if (d && (d < from || d > to)) return;
      drvSummary[o.driver_id].trips++;
      drvSummary[o.driver_id].total+=o.total_amount||0;
      if(o.delivery_status==='delivered') drvSummary[o.driver_id].delivered++;
    });

    summaryList = Object.values(drvSummary).sort((a,b)=>b.total-a.total);
    window._driverReportData = summaryList;
    window._driverReportMeta = { from, to };
  } catch(err) {
    hideProcessingOverlay();
    toast('Error generating report: ' + (err.message||err), 'error');
    return;
  }

  if (!summaryList.length) {
    hideProcessingOverlay();
    toast('No data found for the selected drivers', 'warning');
    return;
  }

  await printDriverReport();
  hideModal('driver-report-modal');
}

function exportDriverReport(type) {
  const rows = (window._driverReportData||[]).map(d=>({Driver:d.name,'Total Trips':d.trips,Delivered:d.delivered,'Success Rate %':d.trips>0?Math.round(d.delivered/d.trips*100):0,'Total Value':d.total}));
  const meta = window._driverReportMeta||{};
  exportData(rows, `driver_report_${meta.from||''}__${meta.to||''}`, type);
}

async function printDriverReport() {
  const rows = window._driverReportData || [];
  const meta = window._driverReportMeta || {};
  if (!rows.length) return toast('Generate the report first', 'error');

  showProcessingOverlay('Printing Driver Report', 'Preparing print layout...');
  try {
    const settings = {
      company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
      address:      await DB.getSetting('address') || '',
      phone:        await DB.getSetting('phone') || '',
      email:        await DB.getSetting('email') || ''
    };
    const logoData = await DB.getSetting('logo_data');
    const logoHTML = logoData
      ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
      : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

    const grandTotal = rows.reduce((s,d)=>s+d.total,0);

    let shade = false;
    const bodyRows = rows.map(d => {
      shade = !shade;
      const bg = shade ? '#f6f9fc' : '#ffffff';
      return `<tr style="background:${bg};">
        <td style="padding:7px 9px;">${d.name}</td>
        <td style="padding:7px 9px;text-align:center;">${d.trips}</td>
        <td style="padding:7px 9px;text-align:center;">${d.delivered}</td>
        <td style="padding:7px 9px;text-align:center;">${d.trips>0?Math.round(d.delivered/d.trips*100):0}%</td>
        <td style="padding:7px 9px;text-align:right;font-weight:600;">${formatCurrency(d.total)}</td>
      </tr>`;
    }).join('');

    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Driver Report ${meta.from||''} to ${meta.to||''}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:11px;}
        @page{size:A4 portrait;margin:14mm 12mm;}
        table{width:100%;border-collapse:collapse;}
        thead{display:table-header-group;}
        tr{page-break-inside:avoid;}
        th{background:#1a4d8f;color:#fff;padding:8px 9px;text-align:left;font-size:0.78em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;}
        td{border-bottom:1px solid #eef2f7;}
      </style></head><body>
      <div style="padding:4px 6px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoHTML}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
              ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>`:''}
              <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join('  |  ')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:800;color:#1a4d8f;">Driver Report</div>
            <div style="font-size:0.95em;color:#374151;margin-top:4px;"><strong>${formatDate(meta.from)} &rarr; ${formatDate(meta.to)}</strong></div>
            <div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">Generated: ${formatDateTime(new Date().toISOString())}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Driver</th><th style="text-align:center;">Total Trips</th><th style="text-align:center;">Delivered</th><th style="text-align:center;">Success Rate</th><th style="text-align:right;">Total Value</th></tr></thead>
          <tbody>${bodyRows}
            <tr style="page-break-inside:avoid;">
              <td colspan="4" style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Grand Total</td>
              <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:18px;text-align:center;font-size:0.82em;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
          ${settings.company_name} &mdash; Driver Report &mdash; ${formatDate(meta.from)} to ${formatDate(meta.to)}
        </div>
      </div>
      <script>document.fonts.ready.then(()=>window.print());<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { hideProcessingOverlay(); return toast('Please allow pop-ups to print', 'warning'); }
    w.document.write(printHTML);
    w.document.close();
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// FULL REPORT MODAL — date range picker
// ─────────────────────────────────────────────
function showFullReportModal() {
  const firstDay = new Date(); firstDay.setDate(1);
  const from = toLocalISODate(firstDay);
  const to   = today();

  createModal('full-report-modal','Full Report',`
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;margin-bottom:18px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">From Date</label>
        <input type="date" class="form-input" id="fr-from" value="${from}"/>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">To Date</label>
        <input type="date" class="form-input" id="fr-to" value="${to}"/>
      </div>
      <button class="btn btn-primary" onclick="generateFullReport()" style="height:40px;">
        <i class="fas fa-chart-bar"></i> Generate
      </button>
    </div>
    <div id="full-report-body" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">
      Select a date range and click Generate.
    </div>
    <div id="full-report-export" style="display:none;margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary btn-sm" onclick="exportFullReport('csv')"><i class="fas fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportFullReport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="printFullReport()"><i class="fas fa-print"></i> Print</button>
    </div>`,'modal-xl');
  showModal('full-report-modal');
}

async function generateFullReport() {
  const from = document.getElementById('fr-from')?.value;
  const to   = document.getElementById('fr-to')?.value;
  if(!from||!to) return toast('Select both dates','error');
  if(from>to)    return toast('From date must be before To date','error');

  showProcessingOverlay('Generating Full Report', 'Fetching orders and calculations...');
  try {

  const [orders,customers,drivers,invoices,payments,orderItemsAll] = await Promise.all([
    DB.getOrders(), DB.getCustomers(), DB.getDrivers(),
    DB.getInvoices(), DB.getPayments(), DB.getAllOrderItems()
  ]);

  const cMap   = Object.fromEntries(customers.map(c=>[c.id,c]));
  const dMap   = Object.fromEntries(drivers.map(d=>[d.id,d]));
  const invMap = Object.fromEntries(invoices.map(i=>[i.order_id,i]));
  const payMap = {};
  payments.forEach(p=>{ payMap[p.invoice_id]=(payMap[p.invoice_id]||0)+p.amount; });
  const itemsByOrder = {};
  orderItemsAll.forEach(i=>{ if(!itemsByOrder[i.order_id]) itemsByOrder[i.order_id]=[]; itemsByOrder[i.order_id].push(i); });

  // Filter orders within date range by pickup_date or created_at.
  const _orderDate = o => (o.pickup_date || o.created_at || '').slice(0,10);
  const filtered = orders.filter(o=>{
    const d = _orderDate(o);
    if(!d) return true;                 // date-less order → always count
    return d>=from && d<=to;
  }).sort((a,b)=>{
    const da=_orderDate(a), db=_orderDate(b);
    if(!da) return -1;                  // date-less orders shown first
    if(!db) return 1;
    return new Date(da)-new Date(db);
  });

  if(!filtered.length){
    hideProcessingOverlay();
    toast('No orders in this date range', 'warning');
    return;
  }

  // Build flat rows — one row per order-item
  const reportRows = [];
  let grandTotal=0, grandAdvance=0, grandPaid=0, grandRemaining=0;

  for(const o of filtered){
    const cust=cMap[o.customer_id];
    const drv=dMap[o.driver_id];
    const inv=invMap[o.id];
    const advanceAmt=o.advance_payment||0;
    const paidAmt=inv?(payMap[inv.id]||0):0;
    const fullPaid=advanceAmt+paidAmt;
    // Subtract any deduction already applied to this invoice — otherwise a
    // forgiven/deducted amount shows up here as if it's still owed.
    const remaining=Math.max(0,(o.total_amount||0)-(inv?.deduction_amount||0)-fullPaid);
    const items=itemsByOrder[o.id]||[];
    const pickupDate = o.pickup_date ? formatDate(o.pickup_date) : '—';
    const paidDate    = inv?.payment_date ? formatDate(inv.payment_date) : '—';

    if(items.length===0){
      reportRows.push({
        date: _orderDate(o) || 'No date',
        pickup_date: pickupDate,
        paid_date: paidDate,
        batch_id: o.batch_id,
        customer: getOrderCustomerName(o, cMap),
        driver:   drv?.name||'—',
        item:     '—', qty:'—', unit_price:'—', service_type:'—',
        advance:  advanceAmt, full_payments: paidAmt,
        remaining: remaining, total: o.total_amount||0,
        status: o.status
      });
    } else {
      items.forEach((it,idx)=>{
        reportRows.push({
          date:         idx===0?(_orderDate(o) || 'No date'):'',
          pickup_date:  idx===0?pickupDate:'',
          paid_date:    idx===0?paidDate:'',
          batch_id:     idx===0?o.batch_id:'',
          customer:     idx===0?(cust?.hotel_name||'—'):'',
          driver:       idx===0?(drv?.name||'—'):'',
          item:         it.item_name||'—',
          qty:          it.quantity,
          unit_price:   it.price,
          service_type: it.service_type||'—',
          advance:      idx===0?advanceAmt:'',
          full_payments:idx===0?paidAmt:'',
          remaining:    idx===0?remaining:'',
          total:        idx===0?(o.total_amount||0):'',
          status:       idx===0?o.status:''
        });
      });
    }
    grandTotal+=o.total_amount||0;
    grandAdvance+=advanceAmt;
    grandPaid+=paidAmt;
    grandRemaining+=remaining;
  }

  window._fullReportData = reportRows;
  window._fullReportMeta = { from, to, grandTotal, grandAdvance, grandPaid, grandRemaining, count: filtered.length };
  } catch(err) {
    hideProcessingOverlay();
    toast('Error generating report: ' + (err.message||err), 'error');
    return;
  }

  await printFullReport();
  hideModal('full-report-modal');
}

function exportFullReport(type) {
  const rows = (window._fullReportData||[]).map(r=>({
    'Order Date':     r.date,
    'Pickup Date':    r.pickup_date,
    'Paid Date':      r.paid_date,
    'Batch ID':       r.batch_id,
    'Customer':       r.customer,
    'Driver':         r.driver,
    'Item':           r.item,
    'Qty':            r.qty,
    'Unit Price':     r.unit_price,
    'Service Type':   r.service_type||'—',
    'Advance (LKR)':  r.advance,
    'Paid (LKR)':     r.full_payments,
    'Remaining (LKR)':r.remaining,
    'Total (LKR)':    r.total
  }));
  const meta = window._fullReportMeta||{};
  exportData(rows, `full_report_${meta.from||''}__${meta.to||''}`, type);
}

async function printFullReport() {
  showProcessingOverlay('Printing Full Report', 'Preparing print layout...');
  try {
  const rows = window._fullReportData || [];
  const meta = window._fullReportMeta || {};
  if (!rows.length) return toast('Generate the report first', 'error');

  const settings = {
    company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
    address:      await DB.getSetting('address') || '',
    phone:        await DB.getSetting('phone') || '',
    email:        await DB.getSetting('email') || ''
  };
  const logoData = await DB.getSetting('logo_data');
  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
    : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

  const svcColor = { 'Dry Clean':'#7c3aed', 'Wash & Press':'#0369a1', 'Wash & Dry':'#16a34a' };
  const money = v => (v === '' || v === null || v === undefined || v === '—') ? '' : formatCurrency(v);

  // Alternate a subtle band per ORDER group (a new order row always has a batch_id)
  let shade = false;
  const bodyRows = rows.map(r => {
    if (r.batch_id) shade = !shade;
    const bg = shade ? '#f6f9fc' : '#ffffff';
    const svc = (r.service_type && r.service_type !== '—')
      ? `<span style="font-size:0.82em;font-weight:600;padding:2px 7px;border-radius:5px;background:${(svcColor[r.service_type]||'#64748b')}1a;color:${svcColor[r.service_type]||'#64748b'};white-space:nowrap;">${r.service_type}</span>`
      : '—';
    return `<tr style="background:${bg};${r.batch_id?'border-top:1.5px solid #d8e2ee;':''}">
      <td style="padding:7px 9px;white-space:nowrap;">${r.date==='No date'?'<span style="color:#e11d48;font-style:italic;">No date</span>':(r.date?formatDate(r.date):'')}</td>
      <td style="padding:7px 9px;white-space:nowrap;">${r.pickup_date||''}</td>
      <td style="padding:7px 9px;white-space:nowrap;">${r.paid_date||''}</td>
      <td style="padding:7px 9px;font-family:monospace;font-weight:700;white-space:nowrap;">${r.batch_id||''}</td>
      <td style="padding:7px 9px;">${r.customer||''}</td>
      <td style="padding:7px 9px;">${r.driver||''}</td>
      <td style="padding:7px 9px;">${r.item||'—'}</td>
      <td style="padding:7px 9px;text-align:center;">${(r.qty!==undefined&&r.qty!=='—'&&r.qty!=='')?r.qty:'—'}</td>
      <td style="padding:7px 9px;text-align:right;">${(r.unit_price!==undefined&&r.unit_price!=='—'&&r.unit_price!=='')?formatCurrency(r.unit_price):'—'}</td>
      <td style="padding:7px 9px;text-align:center;">${svc}</td>
      <td style="padding:7px 9px;text-align:right;color:#16a34a;">${money(r.advance)}</td>
      <td style="padding:7px 9px;text-align:right;color:#16a34a;">${money(r.full_payments)}</td>
      <td style="padding:7px 9px;text-align:right;color:#e11d48;">${money(r.remaining)}</td>
      <td style="padding:7px 9px;text-align:right;font-weight:700;">${money(r.total)}</td>
    </tr>`;
  }).join('');

  const totalPaid = (meta.grandAdvance || 0) + (meta.grandPaid || 0);

  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Full Report ${meta.from||''} to ${meta.to||''}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:11px;}
      @page{size:A4 landscape;margin:11mm 9mm;}
      table{width:100%;border-collapse:collapse;}
      thead{display:table-header-group;}
      tr{page-break-inside:avoid;}
      th{background:#1a4d8f;color:#fff;padding:8px 9px;text-align:left;font-size:0.78em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;}
      td{border-bottom:1px solid #eef2f7;}
    </style></head><body>
    <div style="padding:4px 6px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
            ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>`:''}
            <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join('  |  ')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:800;color:#1a4d8f;">Full Report</div>
          <div style="font-size:0.95em;color:#374151;margin-top:4px;"><strong>${formatDate(meta.from)} &rarr; ${formatDate(meta.to)}</strong></div>
          <div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">Generated: ${formatDateTime(new Date().toISOString())}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Orders</div>
          <div style="font-size:1.5em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${meta.count||0}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Grand Total</div>
          <div style="font-size:1.25em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${formatCurrency(meta.grandTotal||0)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f0fdf4;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#15803d;font-weight:700;">Total Paid</div>
          <div style="font-size:1.25em;font-weight:800;color:#16a34a;font-family:'Playfair Display',serif;">${formatCurrency(totalPaid)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fef2f2;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#b91c1c;font-weight:700;">Remaining</div>
          <div style="font-size:1.25em;font-weight:800;color:#e11d48;font-family:'Playfair Display',serif;">${formatCurrency(meta.grandRemaining||0)}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Order Date</th><th>Pickup Date</th><th>Paid Date</th><th>Batch ID</th><th>Customer</th><th>Driver</th>
          <th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th>
          <th style="text-align:center;">Service</th>
          <th style="text-align:right;">Advance</th><th style="text-align:right;">Paid</th>
          <th style="text-align:right;">Remaining</th><th style="text-align:right;">Total</th>
        </tr></thead>
        <tbody>${bodyRows}
          <tr style="page-break-inside:avoid;">
            <td colspan="10" style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Totals</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#16a34a;">${formatCurrency(meta.grandAdvance||0)}</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#16a34a;">${formatCurrency(meta.grandPaid||0)}</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#e11d48;">${formatCurrency(meta.grandRemaining||0)}</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(meta.grandTotal||0)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:18px;text-align:center;font-size:0.82em;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
        ${settings.company_name} &mdash; Full Report &mdash; ${formatDate(meta.from)} to ${formatDate(meta.to)}
      </div>
    </div>
    <script>document.fonts.ready.then(()=>window.print());<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    hideProcessingOverlay();
    return toast('Please allow pop-ups to print', 'warning');
  }
  w.document.write(printHTML);
  w.document.close();
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// CUSTOMER SUMMARY REPORT (Dynamic Catalog Columns with Selection)
// ─────────────────────────────────────────────
// Matches an order_item to a catalog item for report grouping: prefer the
// stored catalog_item_id, but fall back to a case/whitespace-insensitive
// name match — order_items.item_name is a point-in-time snapshot, so a
// later-renamed or recreated catalog item can't be found by id alone, and
// an exact-string name match is too brittle (drops the quantity silently).
function matchCatalogItem(displayItems, orderItem) {
  if (orderItem.catalog_item_id != null) {
    const byId = displayItems.find(c => c.id === orderItem.catalog_item_id);
    if (byId) return byId;
  }
  const name = (orderItem.item_name || '').trim().toLowerCase();
  if (!name) return null;
  return displayItems.find(c => (c.item_name || '').trim().toLowerCase() === name) || null;
}

async function showCustomerSummaryModal() {
  // All-time by default (still fully customizable) — a "this month only"
  // default silently hid historical data and looked like the report just
  // wasn't fetching it.
  const from = '2000-01-01';
  const to   = today();

  const [customers, items] = await Promise.all([
    DB.getCustomers(),
    DB.getItems()
  ]);

  items.sort((a,b) => a.item_name.localeCompare(b.item_name));
  const custOptions = customers.map(c => `<option value="${c.id}">${c.hotel_name}</option>`).join('');

  const itemCheckboxes = items.map(it => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.88em; cursor:pointer; user-select:none; font-weight:600; color:var(--text);">
      <input type="checkbox" class="cs-item-chk" value="${it.id}" checked style="cursor:pointer;" />
      ${it.item_name}
    </label>
  `).join('');

  createModal('customer-summary-modal', 'Customer Summary Report', `
    <div style="display:grid; grid-template-columns:1.5fr 1fr 1fr auto; gap:12px; align-items:flex-end; margin-bottom:18px; border-bottom:1px solid var(--border); padding-bottom:18px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Customer *</label>
        <select class="form-input form-select" id="cs-customer">
          <option value="all">All Customers</option>
          ${custOptions}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">From Date</label>
        <input type="date" class="form-input" id="cs-from" value="${from}"/>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">To Date</label>
        <input type="date" class="form-input" id="cs-to" value="${to}"/>
      </div>
      <button class="btn btn-primary" onclick="generateCustomerSummaryReport()" style="height:40px;">
        <i class="fas fa-chart-bar"></i> Generate
      </button>
      
      <div class="form-group" style="grid-column: span 4; margin-top: 10px; margin-bottom:0;">
        <label class="form-label" style="font-weight:700;">Select Items to include:</label>
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAllCsItems(true)">Select All</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllCsItems(false)">Clear All</button>
        </div>
        <div id="cs-items-checkboxes" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px; max-height:110px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--bg);">
          ${itemCheckboxes}
        </div>
      </div>
    </div>
    
    <div id="cs-report-body" style="min-height:120px; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">
      Select parameters and click Generate.
    </div>
    
    <div id="cs-report-export" style="display:none; margin-top:14px; display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-secondary btn-sm" onclick="exportCustomerSummary('csv')"><i class="fas fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportCustomerSummary('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="printCustomerSummary()"><i class="fas fa-print"></i> Print</button>
    </div>
  `, 'modal-xl');

  window.toggleAllCsItems = function(checked) {
    document.querySelectorAll('.cs-item-chk').forEach(chk => chk.checked = checked);
  };

  showModal('customer-summary-modal');
}

async function generateCustomerSummaryReport() {
  const customerId = document.getElementById('cs-customer')?.value;
  const from = document.getElementById('cs-from')?.value;
  const to   = document.getElementById('cs-to')?.value;
  if(!from||!to) return toast('Select both dates','error');
  if(from>to)    return toast('From date must be before To date','error');

  const selectedItemIds = [...document.querySelectorAll('.cs-item-chk:checked')].map(chk => Number(chk.value));
  if (!selectedItemIds.length) {
    return toast('Please select at least one item to include in the report', 'warning');
  }

  showProcessingOverlay('Generating Customer Summary', 'Fetching order data...');

  try {
    const [orders, customers, invoices, payments, deductions, catalogItems, orderItemsAll] = await Promise.all([
      DB.getOrders(), DB.getCustomers(), DB.getInvoices(), DB.getPayments(), DB.getDeductions(), DB.getItems(),
      DB.getAllOrderItems()
    ]);

    catalogItems.sort((a, b) => a.item_name.localeCompare(b.item_name));
    const displayItems = catalogItems.filter(it => selectedItemIds.includes(it.id));

    const cMap   = Object.fromEntries(customers.map(c=>[c.id,c]));
    const invMap = Object.fromEntries(invoices.map(i=>[i.order_id,i]));
    
    const payListMap = {};
    payments.forEach(p => {
      if (!payListMap[p.invoice_id]) payListMap[p.invoice_id] = [];
      payListMap[p.invoice_id].push(p);
    });

    const deductListMap = {};
    deductions.forEach(d => {
      if (!deductListMap[d.invoice_id]) deductListMap[d.invoice_id] = [];
      deductListMap[d.invoice_id].push(d);
    });

    const payMap = {};
    payments.forEach(p=>{ payMap[p.invoice_id]=(payMap[p.invoice_id]||0)+p.amount; });

    const itemsByOrder = {};
    orderItemsAll.forEach(i=>{ 
      if(!itemsByOrder[i.order_id]) itemsByOrder[i.order_id]=[]; 
      itemsByOrder[i.order_id].push(i); 
    });

    const _orderDate = o => (o.pickup_date || o.created_at || '').slice(0,10);
    const filtered = orders.filter(o=>{
      const d = _orderDate(o);
      const matchesDate = !d || (d>=from && d<=to);
      const matchesCust = customerId === 'all' || o.customer_id === Number(customerId);
      return matchesDate && matchesCust;
    }).sort((a,b)=>{
      const da=_orderDate(a), db=_orderDate(b);
      if(!da) return -1;
      if(!db) return 1;
      return new Date(da)-new Date(db);
    });

    if(!filtered.length){
      hideProcessingOverlay();
      toast('No orders found matching parameters', 'warning');
      return;
    }

    let grandTotal=0, grandPaid=0, grandRemaining=0;
    const displayItemTotals = {};
    displayItems.forEach(dItem => { displayItemTotals[dItem.id] = 0; });

    filtered.forEach(o => {
      const inv = invMap[o.id];
      const advanceAmt = o.advance_payment || 0;
      const paidAmt = inv ? (payMap[inv.id] || 0) : 0;
      const fullPaid = advanceAmt + paidAmt;
      const remaining = Math.max(0, (o.total_amount || 0) - (inv?.deduction_amount || 0) - fullPaid);

      const orderItems = itemsByOrder[o.id] || [];
      orderItems.forEach(ot => {
        const dItem = matchCatalogItem(displayItems, ot);
        if (dItem) displayItemTotals[dItem.id] += parseFloat(ot.quantity) || 0;
      });

      grandTotal += o.total_amount || 0;
      grandPaid += fullPaid;
      grandRemaining += remaining;
    });

    window._csReportData = {
      filteredOrders: filtered,
      displayItems: displayItems,
      cMap: cMap,
      invMap: invMap,
      payMap: payMap,
      payListMap: payListMap,
      deductListMap: deductListMap,
      itemsByOrder: itemsByOrder,
      displayItemTotals: displayItemTotals,
      meta: { from, to, grandTotal, grandPaid, grandRemaining, customerId }
    };
  } catch (err) {
    hideProcessingOverlay();
    toast('Error generating report: ' + (err.message || err), 'error');
    return;
  }

  await printCustomerSummary();
  hideModal('customer-summary-modal');
}

function exportCustomerSummary(type) {
  const data = window._csReportData;
  if (!data) return toast('Generate the report first', 'error');

  const { filteredOrders, displayItems, cMap, invMap, payMap, payListMap, deductListMap, itemsByOrder } = data;
  const _orderDate = o => (o.pickup_date || o.created_at || '').slice(0,10);

  const rows = filteredOrders.map(o => {
    const cust = cMap[o.customer_id];
    const inv = invMap[o.id];
    const advanceAmt = o.advance_payment || 0;
    const paidAmt = inv ? (payMap[inv.id] || 0) : 0;
    const fullPaid = advanceAmt + paidAmt;
    const remaining = Math.max(0, (o.total_amount || 0) - (inv?.deduction_amount || 0) - fullPaid);
    const paidDate = o.payment_date ? formatDate(o.payment_date) : (inv?.payment_date ? formatDate(inv.payment_date) : '—');

    const descList = [];
    if (o.advance_payment > 0) descList.push(`Advance: ${o.advance_payment}`);
    if (inv) {
      const pList = payListMap[inv.id] || [];
      const dList = deductListMap[inv.id] || [];
      pList.forEach(p => { if (p.notes) descList.push(p.notes); });
      dList.forEach(d => { if (d.reason) descList.push(`Deduction: ${d.reason}`); });
    }
    const orderDescription = descList.join('; ') || '—';

    const orderItems = itemsByOrder[o.id] || [];
    const qtyMap = {};
    displayItems.forEach(dItem => { qtyMap[dItem.id] = 0; });
    orderItems.forEach(ot => {
      const dItem = matchCatalogItem(displayItems, ot);
      if (dItem) { qtyMap[dItem.id] += parseFloat(ot.quantity) || 0; }
    });

    const exportObj = {
      'Order Date': _orderDate(o) || 'No date',
      'Customer': getOrderCustomerName(o, cMap),
      'Order Number': o.batch_id || '—'
    };

    displayItems.forEach(dItem => { exportObj[dItem.item_name] = qtyMap[dItem.id] || 0; });

    exportObj['Total Amount'] = o.total_amount || 0;
    exportObj['Paid Amount'] = fullPaid;
    exportObj['Paid Date'] = paidDate;
    exportObj['Remaining Amount'] = remaining;
    exportObj['Order Description'] = orderDescription;

    return exportObj;
  });

  const meta = data.meta;
  exportData(rows, `customer_summary_${meta.from||''}__${meta.to||''}`, type);
}

async function printCustomerSummary() {
  showProcessingOverlay('Printing Customer Summary', 'Preparing print layout...');
  try {
  const data = window._csReportData;
  if (!data) return toast('Generate the report first', 'error');

  const { filteredOrders, displayItems, cMap, invMap, payMap, payListMap, deductListMap, itemsByOrder, displayItemTotals, meta } = data;
  const _orderDate = o => (o.pickup_date || o.created_at || '').slice(0,10);

  const settings = {
    company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
    address:      await DB.getSetting('address') || '',
    phone:        await DB.getSetting('phone') || '',
    email:        await DB.getSetting('email') || ''
  };
  const logoData = await DB.getSetting('logo_data');
  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
    : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

  const bodyRowsHTML = filteredOrders.map(o => {
    const custName = getOrderCustomerName(o, cMap);
    const inv = invMap[o.id];
    const advanceAmt = o.advance_payment || 0;
    const paidAmt = inv ? (payMap[inv.id] || 0) : 0;
    const fullPaid = advanceAmt + paidAmt;
    const remaining = Math.max(0, (o.total_amount || 0) - (inv?.deduction_amount || 0) - fullPaid);
    const paidDate = o.payment_date ? formatDate(o.payment_date) : (inv?.payment_date ? formatDate(inv.payment_date) : '—');
    
    const descList = [];
    if (o.advance_payment > 0) descList.push(`Advance: ${o.advance_payment}`);
    if (inv) {
      const pList = payListMap[inv.id] || [];
      const dList = deductListMap[inv.id] || [];
      pList.forEach(p => { if (p.notes) descList.push(p.notes); });
      dList.forEach(d => { if (d.reason) descList.push(`Deduction: ${d.reason}`); });
    }
    const orderDescription = descList.join('; ') || '—';

    const orderItems = itemsByOrder[o.id] || [];
    const qtyMap = {};
    displayItems.forEach(dItem => { qtyMap[dItem.id] = 0; });
    orderItems.forEach(ot => {
      const dItem = matchCatalogItem(displayItems, ot);
      if (dItem) { qtyMap[dItem.id] += parseFloat(ot.quantity) || 0; }
    });

    const qtyCells = displayItems.map(dItem => {
      const q = qtyMap[dItem.id] || 0;
      return `<td style="text-align:center;">${q > 0 ? q : '0'}</td>`;
    }).join('');

    return `
      <tr>
        <td style="white-space:nowrap;">${_orderDate(o) ? formatDate(_orderDate(o)) : 'No date'}</td>
        <td>${custName}</td>
        <td style="font-family:monospace;font-weight:700;">${o.batch_id}</td>
        ${qtyCells}
        <td style="text-align:right;font-weight:600;">${formatCurrency(o.total_amount)}</td>
        <td style="text-align:right;font-weight:600;color:#16a34a;">${formatCurrency(fullPaid)}</td>
        <td>${paidDate}</td>
        <td style="text-align:right;font-weight:600;color:${remaining > 0 ? '#b91c1c' : '#16a34a'};">${formatCurrency(remaining)}</td>
        <td>${orderDescription}</td>
      </tr>`;
  }).join('');

  const qtyFooterCells = displayItems.map(dItem => {
    return `<td style="text-align:center;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${displayItemTotals[dItem.id]}</td>`;
  }).join('');

  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Customer Summary Report</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:10px;}
      @page{size:A4 landscape;margin:11mm 9mm;}
      table{width:100%;border-collapse:collapse;margin-top:10px;}
      thead{display:table-header-group;}
      tr{page-break-inside:avoid;}
      th{background:#1a4d8f;color:#fff;padding:6px 8px;text-align:left;font-size:0.75em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;border:1px solid #d8e2ee;}
      td{border:1px solid #eef2f7;padding:5px 7px;font-size:0.85em;}
    </style></head><body>
    <div style="padding:4px 6px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
            ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>`:''}
            <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join('  |  ')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:800;color:#1a4d8f;">Customer Summary Report</div>
          <div style="font-size:0.95em;color:#374151;margin-top:4px;"><strong>${formatDate(meta.from)} &rarr; ${formatDate(meta.to)}</strong></div>
          <div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">Generated: ${formatDateTime(new Date().toISOString())}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Orders</div>
          <div style="font-size:1.5em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${filteredOrders.length}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Grand Total</div>
          <div style="font-size:1.25em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${formatCurrency(meta.grandTotal||0)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f0fdf4;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#15803d;font-weight:700;">Total Paid</div>
          <div style="font-size:1.25em;font-weight:800;color:#16a34a;font-family:'Playfair Display',serif;">${formatCurrency(meta.grandPaid || 0)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fef2f2;">
          <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#b91c1c;font-weight:700;">Remaining</div>
          <div style="font-size:1.25em;font-weight:800;color:#e11d48;font-family:'Playfair Display',serif;">${formatCurrency(meta.grandRemaining||0)}</div>
        </div>
      </div>
      <table style="border-collapse:collapse; width:100%;">
        <thead>
          <tr>
            <th rowspan="2">Date</th>
            <th rowspan="2">Customer</th>
            <th rowspan="2">Order #</th>
            <th colspan="${displayItems.length}" style="text-align:center;">Items</th>
            <th rowspan="2" style="text-align:right;">Total</th>
            <th rowspan="2" style="text-align:right;">Paid</th>
            <th rowspan="2">Paid Date</th>
            <th rowspan="2" style="text-align:right;">Remaining</th>
            <th rowspan="2">Description</th>
          </tr>
          <tr>
            ${displayItems.map(c => `<th>${c.item_name}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${bodyRowsHTML}
          <tr style="page-break-inside:avoid; font-weight:700;">
            <td colspan="3" style="text-align:right;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Totals</td>
            ${qtyFooterCells}
            <td style="text-align:right;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(meta.grandTotal||0)}</td>
            <td style="text-align:right;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#16a34a;">${formatCurrency(meta.grandPaid||0)}</td>
            <td style="border-top:2.5px solid #1a4d8f;"></td>
            <td style="text-align:right;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#e11d48;">${formatCurrency(meta.grandRemaining||0)}</td>
            <td style="border-top:2.5px solid #1a4d8f;"></td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:18px;text-align:center;font-size:0.82em;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
        ${settings.company_name} &mdash; Customer Summary Report &mdash; ${formatDate(meta.from)} to ${formatDate(meta.to)}
      </div>
    </div>
    <script>document.fonts.ready.then(()=>window.print());<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    hideProcessingOverlay();
    return toast('Please allow pop-ups to print', 'warning');
  }
  w.document.write(printHTML);
  w.document.close();
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// MONTHLY BILLS REPORT
// ─────────────────────────────────────────────
function showMonthlyBillsModal() {
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7); // YYYY-MM

  createModal('monthly-bills-modal', 'Monthly Bills Report', `
    <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:flex-end;margin-bottom:18px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Select Month</label>
        <input type="month" class="form-input" id="mb-month" value="${curMonth}"/>
      </div>
      <button class="btn btn-primary" onclick="generateMonthlyBillsReport()" style="height:40px;">
        <i class="fas fa-chart-bar"></i> Generate
      </button>
    </div>
    <div id="mb-report-body" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">
      Select a month and click Generate.
    </div>
    <div id="mb-report-export" style="display:none;margin-top:14px;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary btn-sm" onclick="exportMonthlyBills('csv')"><i class="fas fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportMonthlyBills('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="printMonthlyBills()"><i class="fas fa-print"></i> Print</button>
    </div>`, 'modal-xl');
  showModal('monthly-bills-modal');
}

async function generateMonthlyBillsReport() {
  const monthVal = document.getElementById('mb-month')?.value;
  if (!monthVal) return toast('Please select a month', 'error');

  showProcessingOverlay('Generating Monthly Bills', 'Fetching monthly order data...');

  try {
    const [orders, customers] = await Promise.all([DB.getOrders(), DB.getCustomers()]);
    const cMap = Object.fromEntries(customers.map(c => [c.id, c]));

    const _orderDate = o => (o.pickup_date || o.created_at || '').slice(0, 10);

    // Filter orders belonging to the selected month
    const filtered = orders.filter(o => {
      const d = _orderDate(o);
      return d && d.startsWith(monthVal);
    }).sort((a, b) => {
      const da = _orderDate(a), db = _orderDate(b);
      return new Date(da) - new Date(db);
    });

    if (!filtered.length) {
      hideProcessingOverlay();
      toast('No orders found for this month', 'warning');
      return;
    }

    let grandTotal = 0;
    const reportRows = filtered.map((o, idx) => {
      const orderPrice = o.total_amount || 0;
      grandTotal += orderPrice;
      return {
        no: idx + 1,
        date: _orderDate(o),
        order_id: o.batch_id || '—',
        customer: getOrderCustomerName(o, cMap),
        order_price: orderPrice
      };
    });

    window._monthlyBillsData = reportRows;
    window._monthlyBillsMeta = { month: monthVal, grandTotal, count: filtered.length };
  } catch (err) {
    hideProcessingOverlay();
    toast('Error generating report: ' + (err.message || err), 'error');
    return;
  }

  await printMonthlyBills();
  hideModal('monthly-bills-modal');
}

function exportMonthlyBills(type) {
  const rows = (window._monthlyBillsData || []).map(r => ({
    '#': r.no,
    'Date': r.date,
    'Order ID': r.order_id,
    'Customer Name': r.customer,
    'Order Price (LKR)': r.order_price
  }));
  const meta = window._monthlyBillsMeta || {};
  exportData(rows, `monthly_bills_${meta.month || ''}`, type);
}

async function printMonthlyBills() {
  const rows = window._monthlyBillsData || [];
  const meta = window._monthlyBillsMeta || {};
  if (!rows.length) return toast('Generate the report first', 'error');

  showProcessingOverlay('Printing Monthly Bills', 'Preparing print layout...');

  try {
    const settings = {
      company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
      address:      await DB.getSetting('address') || '',
      phone:        await DB.getSetting('phone') || '',
      email:        await DB.getSetting('email') || ''
    };
    const logoData = await DB.getSetting('logo_data');
    const logoHTML = logoData
      ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
      : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

    // Parse month label
    const [yr, mn] = (meta.month || '').split('-');
    const monthLabel = (yr && mn) ? new Date(Number(yr), Number(mn) - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : meta.month;

    let shade = false;
    const bodyRows = rows.map(r => {
      shade = !shade;
      const bg = shade ? '#f6f9fc' : '#ffffff';
      return `<tr style="background:${bg};">
        <td style="padding:7px 9px;text-align:center;">${r.no}</td>
        <td style="padding:7px 9px;white-space:nowrap;">${formatDate(r.date)}</td>
        <td style="padding:7px 9px;font-family:monospace;font-weight:700;white-space:nowrap;">${r.order_id}</td>
        <td style="padding:7px 9px;">${r.customer}</td>
        <td style="padding:7px 9px;text-align:right;font-weight:600;">${formatCurrency(r.order_price)}</td>
      </tr>`;
    }).join('');

    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Monthly Bills — ${monthLabel}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:11px;}
        @page{size:A4 portrait;margin:14mm 12mm;}
        table{width:100%;border-collapse:collapse;}
        thead{display:table-header-group;}
        tr{page-break-inside:avoid;}
        th{background:#1a4d8f;color:#fff;padding:8px 9px;text-align:left;font-size:0.82em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;}
        td{border-bottom:1px solid #eef2f7;}
      </style></head><body>
      <div style="padding:4px 6px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoHTML}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
              ${settings.address ? `<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>` : ''}
              <div style="font-size:0.9em;color:#64748b;">${[settings.phone, settings.email].filter(Boolean).join('  |  ')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:800;color:#1a4d8f;">Monthly Bills</div>
            <div style="font-size:0.95em;color:#374151;margin-top:4px;"><strong>${monthLabel}</strong></div>
            <div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">Generated: ${formatDateTime(new Date().toISOString())}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;">
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
            <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Total Orders</div>
            <div style="font-size:1.5em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${meta.count || 0}</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
            <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Grand Total</div>
            <div style="font-size:1.25em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${formatCurrency(meta.grandTotal || 0)}</div>
          </div>
        </div>
        <table>
          <thead><tr>
            <th style="text-align:center;width:40px;">#</th>
            <th>Date</th>
            <th>Order ID</th>
            <th>Customer Name</th>
            <th style="text-align:right;">Order Price</th>
          </tr></thead>
          <tbody>${bodyRows}
            <tr style="page-break-inside:avoid;">
              <td colspan="4" style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Total</td>
              <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(meta.grandTotal || 0)}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:18px;text-align:center;font-size:0.82em;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
          ${settings.company_name} &mdash; Monthly Bills &mdash; ${monthLabel}
        </div>
      </div>
      <script>document.fonts.ready.then(()=>window.print());<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      hideProcessingOverlay();
      return toast('Please allow pop-ups to print', 'warning');
    }
    w.document.write(printHTML);
    w.document.close();
  } catch (err) {
    toast('Error printing monthly bills: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// EXPENSES REPORT — customizable (date range, category, item)
// ─────────────────────────────────────────────
async function showExpensesReportModal() {
  const from = '2000-01-01';
  const to   = today();

  const [categories, types] = await Promise.all([DB.getExpenseCategories(), DB.getExpenseTypes()]);

  const categoryCheckboxes = categories.map(c => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.88em; cursor:pointer; user-select:none; font-weight:600; color:var(--text);">
      <input type="checkbox" class="exr-cat-chk" value="${escapeHtml(c.category_id)}" checked style="cursor:pointer;" />
      ${c.name}
    </label>
  `).join('');

  const typeCheckboxes = types.map(t => {
    const cat = categories.find(c => c.category_id === t.category_id);
    return `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.88em; cursor:pointer; user-select:none; font-weight:600; color:var(--text);">
      <input type="checkbox" class="exr-type-chk" value="${escapeHtml(t.expense_type_id)}" checked style="cursor:pointer;" />
      ${t.name}${cat ? ` <span style="color:var(--text-muted);font-weight:400;font-size:0.85em;">(${cat.name})</span>` : ''}
    </label>`;
  }).join('');

  createModal('expenses-report-modal', 'Expenses Report', `
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:18px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">From Date</label>
        <input type="date" class="form-input" id="exr-from" value="${from}"/>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">To Date</label>
        <input type="date" class="form-input" id="exr-to" value="${to}"/>
      </div>
      <button class="btn btn-primary" onclick="generateExpensesReport()" style="height:40px;">
        <i class="fas fa-chart-bar"></i> Generate
      </button>
      <div class="form-group" style="grid-column: span 3; margin-top:10px; margin-bottom:0;">
        <label class="form-label" style="font-weight:700;">Categories:</label>
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAllExrChecks('.exr-cat-chk', true)">Select All</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllExrChecks('.exr-cat-chk', false)">Clear All</button>
        </div>
        <div id="exr-cat-checkboxes" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px; max-height:90px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--bg);">
          ${categoryCheckboxes || '<span style="color:var(--text-muted);">No categories found</span>'}
        </div>
      </div>
      <div class="form-group" style="grid-column: span 3; margin-top:10px; margin-bottom:0;">
        <label class="form-label" style="font-weight:700;">Expense Items:</label>
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAllExrChecks('.exr-type-chk', true)">Select All</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllExrChecks('.exr-type-chk', false)">Clear All</button>
        </div>
        <div id="exr-type-checkboxes" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px; max-height:110px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--bg);">
          ${typeCheckboxes || '<span style="color:var(--text-muted);">No expense items found</span>'}
        </div>
      </div>
    </div>
    <div id="exr-report-body" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">
      Select parameters and click Generate.
    </div>
    <div id="exr-report-export" style="display:none;margin-top:14px;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary btn-sm" onclick="exportExpensesReport('csv')"><i class="fas fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportExpensesReport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="printExpensesReport()"><i class="fas fa-print"></i> Print</button>
    </div>`, 'modal-xl');

  window.toggleAllExrChecks = function(selector, checked) {
    document.querySelectorAll(selector).forEach(chk => chk.checked = checked);
  };

  showModal('expenses-report-modal');
}

async function generateExpensesReport() {
  const from = document.getElementById('exr-from')?.value;
  const to   = document.getElementById('exr-to')?.value;
  if(!from||!to) return toast('Select both dates','error');
  if(from>to)    return toast('From date must be before To date','error');

  const selectedCatIds  = [...document.querySelectorAll('.exr-cat-chk:checked')].map(chk => chk.value);
  const selectedTypeIds = [...document.querySelectorAll('.exr-type-chk:checked')].map(chk => chk.value);
  if (!selectedCatIds.length || !selectedTypeIds.length) {
    return toast('Please select at least one category and expense item', 'warning');
  }

  showProcessingOverlay('Generating Expenses Report', 'Fetching expense data...');

  try {
    const [categories, types, entries, amounts] = await Promise.all([
      DB.getExpenseCategories(), DB.getExpenseTypes(), DB.getExpenseEntries(), DB.getExpenseAmounts()
    ]);

    const flat = Financials.flattenExpenseData(amounts, entries, types, categories);
    const scoped = flat.filter(r => selectedCatIds.includes(String(r.category_id)) && selectedTypeIds.includes(String(r.expense_type_id)));

    const start = new Date(from), end = new Date(to);
    const inRange = scoped.filter(r => {
      const d = new Date(r.entry_date);
      return !isNaN(d) && d >= start && d <= end;
    }).sort((a,b) => (a.entry_date||'').localeCompare(b.entry_date||''));

    const totals = Financials.computeExpenseTotals(scoped, from, to);

    window._expensesReportData = inRange;
    window._expensesReportMeta = { from, to, total: totals.total, byCategory: totals.byCategory, mostExpensiveCategory: totals.mostExpensiveCategory };

    if (!inRange.length) {
      hideProcessingOverlay();
      toast('No expenses found matching parameters', 'warning');
      return;
    }
  } catch(err) {
    hideProcessingOverlay();
    toast('Error generating report: ' + (err.message||err), 'error');
    return;
  }

  await printExpensesReport();
  hideModal('expenses-report-modal');
}

function exportExpensesReport(type) {
  const rows = (window._expensesReportData||[]).map(r => ({
    'Date': r.entry_date,
    'Category': r.category_name,
    'Expense Item': r.expense_name,
    'Description': r.description||'',
    'Amount (LKR)': r.amount
  }));
  const meta = window._expensesReportMeta||{};
  exportData(rows, `expenses_report_${meta.from||''}__${meta.to||''}`, type);
}

async function printExpensesReport() {
  const rows = window._expensesReportData || [];
  const meta = window._expensesReportMeta || {};
  if (!rows.length) return toast('Generate the report first', 'error');

  showProcessingOverlay('Printing Expenses Report', 'Preparing print layout...');
  try {
    const settings = {
      company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
      address:      await DB.getSetting('address') || '',
      phone:        await DB.getSetting('phone') || '',
      email:        await DB.getSetting('email') || ''
    };
    const logoData = await DB.getSetting('logo_data');
    const logoHTML = logoData
      ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
      : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

    let shade = false;
    const bodyRows = rows.map(r => {
      shade = !shade;
      const bg = shade ? '#f6f9fc' : '#ffffff';
      return `<tr style="background:${bg};">
        <td style="padding:7px 9px;white-space:nowrap;">${formatDate(r.entry_date)}</td>
        <td style="padding:7px 9px;">${r.category_name}</td>
        <td style="padding:7px 9px;">${r.expense_name}</td>
        <td style="padding:7px 9px;">${r.description||'—'}</td>
        <td style="padding:7px 9px;text-align:right;font-weight:600;">${formatCurrency(r.amount)}</td>
      </tr>`;
    }).join('');

    const categoryCards = Object.values(meta.byCategory||{}).sort((a,b)=>b.total-a.total).map(c => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc;">
        <div style="font-size:0.75em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">${c.name}</div>
        <div style="font-size:1.05em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${formatCurrency(c.total)}</div>
      </div>`).join('');

    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Expenses Report ${meta.from||''} to ${meta.to||''}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:11px;}
        @page{size:A4 portrait;margin:14mm 12mm;}
        table{width:100%;border-collapse:collapse;}
        thead{display:table-header-group;}
        tr{page-break-inside:avoid;}
        th{background:#1a4d8f;color:#fff;padding:8px 9px;text-align:left;font-size:0.78em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;}
        td{border-bottom:1px solid #eef2f7;}
      </style></head><body>
      <div style="padding:4px 6px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoHTML}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
              ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>`:''}
              <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join('  |  ')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:800;color:#1a4d8f;">Expenses Report</div>
            <div style="font-size:0.95em;color:#374151;margin-top:4px;"><strong>${formatDate(meta.from)} &rarr; ${formatDate(meta.to)}</strong></div>
            <div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">Generated: ${formatDateTime(new Date().toISOString())}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
          ${categoryCards}
        </div>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Expense Item</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>${bodyRows}
            <tr style="page-break-inside:avoid;">
              <td colspan="4" style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Total</td>
              <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(meta.total||0)}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:18px;text-align:center;font-size:0.82em;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
          ${settings.company_name} &mdash; Expenses Report &mdash; ${formatDate(meta.from)} to ${formatDate(meta.to)}
        </div>
      </div>
      <script>document.fonts.ready.then(()=>window.print());<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { hideProcessingOverlay(); return toast('Please allow pop-ups to print', 'warning'); }
    w.document.write(printHTML);
    w.document.close();
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// VEHICLE REPORT — customizable (date range, type, vehicle)
// ─────────────────────────────────────────────
async function showVehicleReportModal() {
  const firstDay = new Date(); firstDay.setDate(1);
  const from = toLocalISODate(firstDay);
  const to   = today();

  const vehicles = await DB.getVehicles();
  const categories = [...new Set(vehicles.map(v => v.category).filter(Boolean))];

  const typeCheckboxes = categories.map(cat => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.88em; cursor:pointer; user-select:none; font-weight:600; color:var(--text);">
      <input type="checkbox" class="vr-type-chk" value="${escapeHtml(cat)}" checked style="cursor:pointer;" />
      ${cat}
    </label>
  `).join('');

  const vehicleCheckboxes = vehicles.map(v => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.88em; cursor:pointer; user-select:none; font-weight:600; color:var(--text);">
      <input type="checkbox" class="vr-vehicle-chk" value="${v.id}" checked style="cursor:pointer;" />
      ${v.vehicle_no}${v.category?` <span style="color:var(--text-muted);font-weight:400;font-size:0.85em;">(${v.category})</span>`:''}
    </label>
  `).join('');

  createModal('vehicle-report-modal', 'Vehicle Report', `
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:18px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">From Date</label>
        <input type="date" class="form-input" id="vr-from" value="${from}"/>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">To Date</label>
        <input type="date" class="form-input" id="vr-to" value="${to}"/>
      </div>
      <button class="btn btn-primary" onclick="generateVehicleReport()" style="height:40px;">
        <i class="fas fa-chart-bar"></i> Generate
      </button>
      <div class="form-group" style="grid-column: span 3; margin-top:10px; margin-bottom:0;">
        <label class="form-label" style="font-weight:700;">Vehicle Types:</label>
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAllVrChecks('.vr-type-chk', true)">Select All</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllVrChecks('.vr-type-chk', false)">Clear All</button>
        </div>
        <div id="vr-type-checkboxes" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; max-height:70px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--bg);">
          ${typeCheckboxes || '<span style="color:var(--text-muted);">No vehicle types found</span>'}
        </div>
      </div>
      <div class="form-group" style="grid-column: span 3; margin-top:10px; margin-bottom:0;">
        <label class="form-label" style="font-weight:700;">Select Vehicles:</label>
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAllVrChecks('.vr-vehicle-chk', true)">Select All</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllVrChecks('.vr-vehicle-chk', false)">Clear All</button>
        </div>
        <div id="vr-vehicle-checkboxes" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px; max-height:110px; overflow-y:auto; border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--bg);">
          ${vehicleCheckboxes || '<span style="color:var(--text-muted);">No vehicles found</span>'}
        </div>
      </div>
    </div>
    <div id="vr-report-body" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">
      Select parameters and click Generate.
    </div>
    <div id="vr-report-export" style="display:none;margin-top:14px;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary btn-sm" onclick="exportVehicleReport('csv')"><i class="fas fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportVehicleReport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="printVehicleReport()"><i class="fas fa-print"></i> Print</button>
    </div>`, 'modal-xl');

  window.toggleAllVrChecks = function(selector, checked) {
    document.querySelectorAll(selector).forEach(chk => chk.checked = checked);
  };

  showModal('vehicle-report-modal');
}

async function generateVehicleReport() {
  const from = document.getElementById('vr-from')?.value;
  const to   = document.getElementById('vr-to')?.value;
  if(!from||!to) return toast('Select both dates','error');
  if(from>to)    return toast('From date must be before To date','error');

  const selectedTypes      = [...document.querySelectorAll('.vr-type-chk:checked')].map(chk => chk.value);
  const selectedVehicleIds = [...document.querySelectorAll('.vr-vehicle-chk:checked')].map(chk => chk.value);
  if (!selectedVehicleIds.length) return toast('Please select at least one vehicle', 'warning');

  showProcessingOverlay('Generating Vehicle Report', 'Fetching trip data...');

  try {
    const [vehicles, trips, fuelCfg] = await Promise.all([DB.getVehicles(), DB.getTrips(), DB.getFuelPriceSettings()]);

    const scopedVehicles = vehicles.filter(v => selectedVehicleIds.includes(String(v.id)) && selectedTypes.includes(v.category));
    const vIdSet = new Set(scopedVehicles.map(v => String(v.id)));

    const tripDate = t => t.start_date || (t.created_at ? String(t.created_at).slice(0,10) : null);
    const scopedTrips = trips.filter(t => {
      if (!vIdSet.has(String(t.vehicle_id))) return false;
      const d = tripDate(t);
      return d && d >= from && d <= to;
    });

    const vehStats = {};
    scopedVehicles.forEach(v => { vehStats[v.id] = { vehicle_no: v.vehicle_no, category: v.category||'—', trips: 0, distance: 0, statusCounts: {} }; });
    scopedTrips.forEach(t => {
      const st = vehStats[t.vehicle_id];
      if (!st) return;
      st.trips++;
      if (t.status === 'Completed') st.distance += parseFloat(t.distance_km) || 0;
      const s = t.status || 'Unknown';
      st.statusCounts[s] = (st.statusCounts[s]||0) + 1;
    });

    const summaryList = Object.values(vehStats).map(v => {
      const fuel = Financials.computeTripFuelCost(v.distance, fuelCfg.current_price, fuelCfg.km_per_litre);
      return { ...v, fuelCost: fuel.estimatedCost };
    }).sort((a,b) => b.distance - a.distance);

    window._vehicleReportData = summaryList;
    window._vehicleReportMeta = { from, to };

    if (!summaryList.length) {
      hideProcessingOverlay();
      toast('No vehicles selected', 'warning');
      return;
    }
  } catch(err) {
    hideProcessingOverlay();
    toast('Error generating report: ' + (err.message||err), 'error');
    return;
  }

  await printVehicleReport();
  hideModal('vehicle-report-modal');
}

function exportVehicleReport(type) {
  const rows = (window._vehicleReportData||[]).map(v => ({
    'Vehicle No': v.vehicle_no,
    'Type': v.category,
    'Trips': v.trips,
    'Distance (km)': v.distance.toFixed(1),
    'Est. Fuel Cost (LKR)': v.fuelCost,
    'Status Breakdown': Object.entries(v.statusCounts).map(([s,c]) => `${s}: ${c}`).join(', ')
  }));
  const meta = window._vehicleReportMeta||{};
  exportData(rows, `vehicle_report_${meta.from||''}__${meta.to||''}`, type);
}

async function printVehicleReport() {
  const rows = window._vehicleReportData || [];
  const meta = window._vehicleReportMeta || {};
  if (!rows.length) return toast('Generate the report first', 'error');

  showProcessingOverlay('Printing Vehicle Report', 'Preparing print layout...');
  try {
    const settings = {
      company_name: await DB.getSetting('company_name') || 'Sagacious Washing Center',
      address:      await DB.getSetting('address') || '',
      phone:        await DB.getSetting('phone') || '',
      email:        await DB.getSetting('email') || ''
    };
    const logoData = await DB.getSetting('logo_data');
    const logoHTML = logoData
      ? `<img src="${logoData}" style="height:56px;width:56px;object-fit:cover;border-radius:10px;"/>`
      : `<div style="height:56px;width:56px;border-radius:10px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.4em;">SW</div>`;

    const totalTrips = rows.reduce((s,v)=>s+v.trips,0);
    const totalDistance = rows.reduce((s,v)=>s+v.distance,0);
    const totalFuelCost = rows.reduce((s,v)=>s+v.fuelCost,0);

    let shade = false;
    const bodyRows = rows.map(v => {
      shade = !shade;
      const bg = shade ? '#f6f9fc' : '#ffffff';
      const statusStr = Object.entries(v.statusCounts).map(([s,c]) => `${s}: ${c}`).join(', ') || '—';
      return `<tr style="background:${bg};">
        <td style="padding:7px 9px;font-family:monospace;font-weight:700;">${v.vehicle_no}</td>
        <td style="padding:7px 9px;">${v.category}</td>
        <td style="padding:7px 9px;text-align:center;">${v.trips}</td>
        <td style="padding:7px 9px;text-align:right;">${v.distance.toFixed(1)} km</td>
        <td style="padding:7px 9px;text-align:right;font-weight:600;">${formatCurrency(v.fuelCost)}</td>
        <td style="padding:7px 9px;">${statusStr}</td>
      </tr>`;
    }).join('');

    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Vehicle Report ${meta.from||''} to ${meta.to||''}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:11px;}
        @page{size:A4 landscape;margin:11mm 9mm;}
        table{width:100%;border-collapse:collapse;}
        thead{display:table-header-group;}
        tr{page-break-inside:avoid;}
        th{background:#1a4d8f;color:#fff;padding:8px 9px;text-align:left;font-size:0.78em;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;}
        td{border-bottom:1px solid #eef2f7;}
      </style></head><body>
      <div style="padding:4px 6px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoHTML}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:#1a4d8f;">${settings.company_name}</div>
              ${settings.address?`<div style="font-size:0.9em;color:#64748b;margin-top:2px;">${settings.address}</div>`:''}
              <div style="font-size:0.9em;color:#64748b;">${[settings.phone,settings.email].filter(Boolean).join('  |  ')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:800;color:#1a4d8f;">Vehicle Report</div>
            <div style="font-size:0.95em;color:#374151;margin-top:4px;"><strong>${formatDate(meta.from)} &rarr; ${formatDate(meta.to)}</strong></div>
            <div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">Generated: ${formatDateTime(new Date().toISOString())}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
            <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Total Trips</div>
            <div style="font-size:1.5em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${totalTrips}</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc;">
            <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;">Total Distance</div>
            <div style="font-size:1.25em;font-weight:800;color:#1a4d8f;font-family:'Playfair Display',serif;">${totalDistance.toFixed(1)} km</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fef2f2;">
            <div style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.5px;color:#b91c1c;font-weight:700;">Est. Fuel Cost</div>
            <div style="font-size:1.25em;font-weight:800;color:#e11d48;font-family:'Playfair Display',serif;">${formatCurrency(totalFuelCost)}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Vehicle No</th><th>Type</th><th style="text-align:center;">Trips</th><th style="text-align:right;">Distance</th><th style="text-align:right;">Est. Fuel Cost</th><th>Status Breakdown</th></tr></thead>
          <tbody>${bodyRows}
            <tr style="page-break-inside:avoid;">
              <td colspan="2" style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Totals</td>
              <td style="text-align:center;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${totalTrips}</td>
              <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${totalDistance.toFixed(1)} km</td>
              <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(totalFuelCost)}</td>
              <td style="border-top:2.5px solid #1a4d8f;"></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:18px;text-align:center;font-size:0.82em;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
          ${settings.company_name} &mdash; Vehicle Report &mdash; ${formatDate(meta.from)} to ${formatDate(meta.to)}
        </div>
      </div>
      <script>document.fonts.ready.then(()=>window.print());<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { hideProcessingOverlay(); return toast('Please allow pop-ups to print', 'warning'); }
    w.document.write(printHTML);
    w.document.close();
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// EXPORT HELPERS
// ─────────────────────────────────────────────
function exportData(data, filename, type) {
  if(!data.length) return toast('No data to export','error');
  if(type==='csv') {
    const headers=Object.keys(data[0]);
    const csv=[headers.join(','),...data.map(row=>headers.map(h=>`"${row[h]??''}"`).join(','))].join('\n');
    downloadFile(csv, `${filename}.csv`, 'text/csv');
    toast('CSV exported!');
  } else if(type==='excel') {
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Report');
    XLSX.writeFile(wb,`${filename}.xlsx`);
    toast('Excel exported!');
  }
}
