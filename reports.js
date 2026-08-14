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
      ${reportCard('Monthly Bills',     'Per-month order bills summary',     'fa-receipt',       'badge-orange', 'showMonthlyBillsModal()')}
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
  const total = todayOrders.reduce((s,o)=>s+(o.total_amount||0),0);

  document.getElementById('report-output').innerHTML = reportWrapper(`Daily Orders — ${todayDisplay()}`,
    `<div class="table-wrap"><table>
      <thead><tr><th>Batch ID</th><th>Customer</th><th>Status</th><th>Total</th><th>Advance</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="font-weight:700;padding:12px 16px;text-align:right;">Total Revenue</td>
        <td colspan="2" style="font-weight:700;padding:12px 16px;">${formatCurrency(total)}</td></tr></tfoot>
    </table></div>`, 'exportDailyOrders');
}
function exportDailyOrders(type) {
  exportData((window._reportData||[]).map(o=>({'Batch ID':o.batch_id,'Status':o.status,'Total':o.total_amount,'Advance':o.advance_payment})),'daily_orders',type);
}

// ─────────────────────────────────────────────
// MONTHLY REVENUE
// ─────────────────────────────────────────────
async function generateMonthlyRevenueReport() {
  const payments = await DB.getPayments();
  const monthMap = {};
  payments.forEach(p=>{
    const month=(p.date||'').slice(0,7); if(!month)return;
    monthMap[month]=(monthMap[month]||0)+p.amount;
  });
  const sorted = Object.entries(monthMap).sort((a,b)=>a[0].localeCompare(b[0]));
  window._reportData = sorted.map(([m,a])=>({Month:m,Revenue:a}));

  const rows = sorted.map(([m,a])=>`<tr><td>${m}</td><td><strong>${formatCurrency(a)}</strong></td></tr>`).join('')
    || `<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No data</td></tr>`;
  const grandTotal = sorted.reduce((s,[,a])=>s+a,0);

  document.getElementById('report-output').innerHTML = reportWrapper('Monthly Revenue Report',
    `<div class="table-wrap"><table>
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
  payments.forEach(p=>{ payMap[p.invoice_id]=(payMap[p.invoice_id]||0)+p.amount; });

  const custSummary = {};
  customers.forEach(c=>{ custSummary[c.id]={name:c.hotel_name,total:0,paid:0,balance:0,orders:0}; });
  orders.forEach(o=>{
    if(!custSummary[o.customer_id])return;
    custSummary[o.customer_id].orders++;
    custSummary[o.customer_id].total+=o.total_amount||0;
    const inv=invMap[o.id];
    if(inv){ const paid=(payMap[inv.id]||0)+(inv.advance_payment||0); custSummary[o.customer_id].paid+=paid; }
  });
  Object.values(custSummary).forEach(s=>{s.balance=s.total-s.paid;});

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
// DRIVER PERFORMANCE
// ─────────────────────────────────────────────
async function generateDriverReport() {
  const [orders,drivers] = await Promise.all([DB.getOrders(),DB.getDrivers()]);
  const drvSummary = {};
  drivers.forEach(d=>{ drvSummary[d.id]={name:d.name,trips:0,delivered:0,total:0}; });
  orders.forEach(o=>{
    if(!o.driver_id||!drvSummary[o.driver_id])return;
    drvSummary[o.driver_id].trips++;
    drvSummary[o.driver_id].total+=o.total_amount||0;
    if(['Delivered','Paid'].includes(o.status)) drvSummary[o.driver_id].delivered++;
  });

  const rows = Object.values(drvSummary).map(d=>`<tr>
    <td>${d.name}</td><td>${d.trips}</td><td>${d.delivered}</td>
    <td>${d.trips>0?Math.round(d.delivered/d.trips*100):0}%</td>
    <td>${formatCurrency(d.total)}</td>
  </tr>`).join('')||`<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No data</td></tr>`;

  window._reportData = Object.values(drvSummary).map(d=>({Driver:d.name,Trips:d.trips,Delivered:d.delivered,'Total Value':d.total}));
  document.getElementById('report-output').innerHTML = reportWrapper('Driver Performance Report',
    `<div class="table-wrap"><table>
      <thead><tr><th>Driver</th><th>Total Trips</th><th>Delivered</th><th>Success Rate</th><th>Total Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`, 'exportDriverReport');
}
function exportDriverReport(type) { exportData(window._reportData||[],'driver_performance',type); }

// ─────────────────────────────────────────────
// FULL REPORT MODAL — date range picker
// ─────────────────────────────────────────────
function showFullReportModal() {
  const firstDay = new Date(); firstDay.setDate(1);
  const from = firstDay.toISOString().split('T')[0];
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
  document.getElementById('full-report-body').innerHTML = `<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i><div style="margin-top:8px;color:var(--text-muted);">Loading...</div></div>`;
  try {

  const [orders,customers,drivers,invoices,payments,orderItemsAll] = await Promise.all([
    DB.getOrders(), DB.getCustomers(), DB.getDrivers(),
    DB.getInvoices(), DB.getPayments(),
    (async()=>{ const all=await DB.getOrders(); const items=[]; for(const o of all){ const its=await DB.getOrderItems(o.id); items.push(...its.map(i=>({...i,order_id:o.id}))); } return items; })()
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
    document.getElementById('full-report-body').innerHTML=`<div style="text-align:center;padding:30px;color:var(--text-muted);">No orders in this date range.</div>`;
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
    const remaining=Math.max(0,(o.total_amount||0)-fullPaid);
    const items=itemsByOrder[o.id]||[];

    if(items.length===0){
      reportRows.push({
        date: _orderDate(o) || 'No date',
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

  const tableRows = reportRows.map(r=>`<tr>
    <td style="white-space:nowrap;">${r.date==='No date'?'<span style="color:var(--danger);font-style:italic;">No date</span>':(r.date?formatDate(r.date):'')}</td>
    <td style="font-family:monospace;font-size:0.85em;font-weight:700;">${r.batch_id||''}</td>
    <td>${r.customer||''}</td>
    <td>${r.driver||''}</td>
    <td>${r.item}</td>
    <td style="text-align:center;">${r.qty!==undefined&&r.qty!=='—'?r.qty:'—'}</td>
    <td style="text-align:right;">${r.unit_price!==undefined&&r.unit_price!=='—'?formatCurrency(r.unit_price):'—'}</td>
    <td style="text-align:center;">${r.service_type&&r.service_type!=='—'?`<span class="badge ${({'Dry Clean':'badge-purple','Wash & Press':'badge-cyan','Wash & Dry':'badge-green'})[r.service_type]||'badge-gray'}">${r.service_type}</span>`:'—'}</td>
    <td style="text-align:right;color:var(--success);">${r.advance!==''?formatCurrency(r.advance):''}</td>
    <td style="text-align:right;color:var(--success);">${r.full_payments!==''?formatCurrency(r.full_payments):''}</td>
    <td style="text-align:right;color:var(--danger);">${r.remaining!==''?formatCurrency(r.remaining):''}</td>
    <td style="text-align:right;font-weight:700;">${r.total!==''?formatCurrency(r.total):''}</td>
  </tr>`).join('');

  document.getElementById('full-report-body').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
      <div class="stat-card"><div class="label">Orders</div><div class="value">${filtered.length}</div></div>
      <div class="stat-card"><div class="label">Grand Total</div><div class="value" style="font-size:1.1em;">${formatCurrency(grandTotal)}</div></div>
      <div class="stat-card"><div class="label">Total Paid</div><div class="value" style="font-size:1.1em;color:var(--success);">${formatCurrency(grandAdvance+grandPaid)}</div></div>
      <div class="stat-card"><div class="label">Remaining</div><div class="value" style="font-size:1.1em;color:var(--danger);">${formatCurrency(grandRemaining)}</div></div>
    </div>
    <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
      <table>
        <thead style="position:sticky;top:0;z-index:2;"><tr>
          <th>Date</th><th>Batch ID</th><th>Customer</th><th>Driver</th>
          <th>Item</th><th>Qty</th><th>Unit Price</th><th>Service</th>
          <th>Advance</th><th>Paid</th><th>Remaining</th><th>Total</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr>
          <td colspan="8" style="font-weight:700;padding:12px 16px;text-align:right;border-top:2px solid var(--border);">Totals</td>
          <td style="font-weight:700;padding:12px 16px;border-top:2px solid var(--border);color:var(--success);">${formatCurrency(grandAdvance)}</td>
          <td style="font-weight:700;padding:12px 16px;border-top:2px solid var(--border);color:var(--success);">${formatCurrency(grandPaid)}</td>
          <td style="font-weight:700;padding:12px 16px;border-top:2px solid var(--border);color:var(--danger);">${formatCurrency(grandRemaining)}</td>
          <td style="font-weight:700;padding:12px 16px;border-top:2px solid var(--border);">${formatCurrency(grandTotal)}</td>
        </tr></tfoot>
      </table>
    </div>`;

  document.getElementById('full-report-export').style.display='flex';
  } finally {
    hideProcessingOverlay();
  }
}

function exportFullReport(type) {
  const rows = (window._fullReportData||[]).map(r=>({
    'Date':           r.date,
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
          <th>Date</th><th>Batch ID</th><th>Customer</th><th>Driver</th>
          <th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th>
          <th style="text-align:center;">Service</th>
          <th style="text-align:right;">Advance</th><th style="text-align:right;">Paid</th>
          <th style="text-align:right;">Remaining</th><th style="text-align:right;">Total</th>
        </tr></thead>
        <tbody>${bodyRows}
          <tr style="page-break-inside:avoid;">
            <td colspan="8" style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">Totals</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#16a34a;">${formatCurrency(meta.grandAdvance||0)}</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#16a34a;">${formatCurrency(meta.grandPaid||0)}</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;color:#e11d48;">${formatCurrency(meta.grandRemaining||0)}</td>
            <td style="text-align:right;font-weight:700;border-top:2.5px solid #1a4d8f;padding:11px 9px;">${formatCurrency(meta.grandTotal||0)}</td>
          </tr>
        </tbody>
      </table>
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
async function showCustomerSummaryModal() {
  const firstDay = new Date(); firstDay.setDate(1);
  const from = firstDay.toISOString().split('T')[0];
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
  document.getElementById('cs-report-body').innerHTML = `<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i><div style="margin-top:8px;color:var(--text-muted);">Loading...</div></div>`;

  try {
    const [orders, customers, invoices, payments, deductions, catalogItems, orderItemsAll] = await Promise.all([
      DB.getOrders(), DB.getCustomers(), DB.getInvoices(), DB.getPayments(), DB.getDeductions(), DB.getItems(),
      (async()=>{ 
        const all=await DB.getOrders(); 
        const items=[]; 
        for(const o of all){ 
          const its=await DB.getOrderItems(o.id); 
          items.push(...its.map(i=>({...i,order_id:o.id}))); 
        } 
        return items; 
      })()
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
      document.getElementById('cs-report-body').innerHTML=`<div style="text-align:center;padding:30px;color:var(--text-muted);">No orders found matching parameters.</div>`;
      document.getElementById('cs-report-export').style.display='none';
      return;
    }

    let grandTotal=0, grandPaid=0, grandRemaining=0;
    const displayItemTotals = {};
    displayItems.forEach(dItem => { displayItemTotals[dItem.id] = 0; });

    const tableRowsHTML = filtered.map(o => {
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
        const dItem = displayItems.find(c => c.id === ot.catalog_item_id || c.item_name === ot.item_name);
        if (dItem) {
          qtyMap[dItem.id] += parseFloat(ot.quantity) || 0;
          displayItemTotals[dItem.id] += parseFloat(ot.quantity) || 0;
        }
      });

      grandTotal += o.total_amount || 0;
      grandPaid += fullPaid;
      grandRemaining += remaining;

      const qtyCells = displayItems.map(dItem => {
        const q = qtyMap[dItem.id] || 0;
        return `<td style="text-align:center;">${q > 0 ? q : '0'}</td>`;
      }).join('');

      return `
        <tr>
          <td style="white-space:nowrap;">${_orderDate(o) ? formatDate(_orderDate(o)) : '<span style="color:var(--danger);font-style:italic;">No date</span>'}</td>
          <td>${custName}</td>
          <td style="font-family:monospace;font-weight:700;">${o.batch_id}</td>
          ${qtyCells}
          <td style="text-align:right;font-weight:600;">${formatCurrency(o.total_amount)}</td>
          <td style="text-align:right;font-weight:600;color:var(--success);">${formatCurrency(fullPaid)}</td>
          <td>${paidDate}</td>
          <td style="text-align:right;font-weight:600;color:${remaining > 0 ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(remaining)}</td>
          <td>${orderDescription}</td>
        </tr>`;
    }).join('');

    const qtyFooterCells = displayItems.map(dItem => {
      return `<td style="text-align:center;font-weight:700;">${displayItemTotals[dItem.id]}</td>`;
    }).join('');

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

    document.getElementById('cs-report-body').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
        <div class="stat-card"><div class="label">Orders</div><div class="value">${filtered.length}</div></div>
        <div class="stat-card"><div class="label">Grand Total</div><div class="value" style="font-size:1.1em;">${formatCurrency(grandTotal)}</div></div>
        <div class="stat-card"><div class="label">Total Paid</div><div class="value" style="font-size:1.1em;color:var(--success);">${formatCurrency(grandPaid)}</div></div>
        <div class="stat-card"><div class="label">Remaining</div><div class="value" style="font-size:1.1em;color:var(--danger);">${formatCurrency(grandRemaining)}</div></div>
      </div>
      <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
        <table style="border-collapse:collapse; width:100%;">
          <thead style="position:sticky;top:0;z-index:2;background:var(--card-bg);">
            <tr>
              <th rowspan="2" style="border:1px solid var(--border);">Order Date</th>
              <th rowspan="2" style="border:1px solid var(--border);">Customer</th>
              <th rowspan="2" style="border:1px solid var(--border);">Order Number</th>
              <th colspan="${displayItems.length}" style="text-align:center;border:1px solid var(--border);">Items</th>
              <th rowspan="2" style="text-align:right;border:1px solid var(--border);">Total Amount</th>
              <th rowspan="2" style="text-align:right;border:1px solid var(--border);">Paid Amount</th>
              <th rowspan="2" style="border:1px solid var(--border);">Paid Date</th>
              <th rowspan="2" style="text-align:right;border:1px solid var(--border);">Remaining Amount</th>
              <th rowspan="2" style="border:1px solid var(--border);">Order Description</th>
            </tr>
            <tr>
              ${displayItems.map(c => `<th style="border:1px solid var(--border); font-size:0.85em; font-weight:600;">${c.item_name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${tableRowsHTML}
          </tbody>
          <tfoot>
            <tr style="background:var(--bg);">
              <td colspan="3" style="font-weight:700;text-align:right;border-top:2px solid var(--border);">TOTAL</td>
              ${qtyFooterCells}
              <td style="font-weight:700;text-align:right;border-top:2px solid var(--border);">${formatCurrency(grandTotal)}</td>
              <td style="font-weight:700;text-align:right;border-top:2px solid var(--border);color:var(--success);">${formatCurrency(grandPaid)}</td>
              <td style="border-top:2px solid var(--border);"></td>
              <td style="font-weight:700;text-align:right;border-top:2px solid var(--border);color:var(--danger);">${formatCurrency(grandRemaining)}</td>
              <td style="border-top:2px solid var(--border);"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;

    document.getElementById('cs-report-export').style.display='flex';
  } catch (err) {
    toast('Error generating report: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }
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
      const dItem = displayItems.find(c => c.id === ot.catalog_item_id || c.item_name === ot.item_name);
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
      const dItem = displayItems.find(c => c.id === ot.catalog_item_id || c.item_name === ot.item_name);
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
  document.getElementById('mb-report-body').innerHTML = `<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i><div style="margin-top:8px;color:var(--text-muted);">Loading...</div></div>`;

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
      document.getElementById('mb-report-body').innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);">No orders found for this month.</div>`;
      document.getElementById('mb-report-export').style.display = 'none';
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

    // Parse month label
    const [yr, mn] = monthVal.split('-');
    const monthLabel = new Date(Number(yr), Number(mn) - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const tableRows = reportRows.map(r => `<tr>
      <td style="text-align:center;">${r.no}</td>
      <td style="white-space:nowrap;">${formatDate(r.date)}</td>
      <td style="font-family:monospace;font-size:0.88em;font-weight:700;">${r.order_id}</td>
      <td>${r.customer}</td>
      <td style="text-align:right;font-weight:600;">${formatCurrency(r.order_price)}</td>
    </tr>`).join('');

    document.getElementById('mb-report-body').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;">
        <div class="stat-card"><div class="label">Month</div><div class="value" style="font-size:1em;">${monthLabel}</div></div>
        <div class="stat-card"><div class="label">Total Orders</div><div class="value">${filtered.length}</div></div>
      </div>
      <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
        <table>
          <thead style="position:sticky;top:0;z-index:2;"><tr>
            <th style="text-align:center;width:50px;">#</th>
            <th>Date</th>
            <th>Order ID</th>
            <th>Customer Name</th>
            <th style="text-align:right;">Order Price</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
          <tfoot><tr>
            <td colspan="4" style="font-weight:700;padding:12px 16px;text-align:right;border-top:2px solid var(--border);">Total</td>
            <td style="font-weight:700;padding:12px 16px;text-align:right;border-top:2px solid var(--border);">${formatCurrency(grandTotal)}</td>
          </tr></tfoot>
        </table>
      </div>`;

    document.getElementById('mb-report-export').style.display = 'flex';
  } catch (err) {
    toast('Error generating report: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }
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
