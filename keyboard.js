// keyboard.js — Full keyboard navigation & universal global search

// ─────────────────────────────────────────────
// UNIVERSAL GLOBAL SEARCH BAR
// ─────────────────────────────────────────────
function initGlobalSearch() {
  const bar = document.getElementById('global-search-bar');
  if(!bar) return;

  bar.innerHTML = `
    <div style="position:relative;display:flex;align-items:center;background:var(--card-bg);border:1.5px solid var(--border);border-radius:12px;padding:0 12px;box-shadow:0 2px 10px rgba(0,0,0,0.06);width:100%;transition:all 0.2s;" id="gs-wrapper">
      <i class="fas fa-search" style="color:var(--text-muted);font-size:0.9em;margin-right:8px;flex-shrink:0;"></i>
      <input id="gs-input" class="form-input" style="border:none;padding:8px 0;font-size:0.88em;background:transparent;outline:none;width:100%;color:var(--text);"
        placeholder="Search anything (Order ID, Customer, Driver, Invoice, Item)..." autocomplete="off" spellcheck="false"
        oninput="onGsInput()" onkeydown="onGsKey(event)" onfocus="document.getElementById('gs-wrapper').style.borderColor='var(--primary)'" onblur="document.getElementById('gs-wrapper').style.borderColor='var(--border)'"/>
      <kbd style="font-size:0.7em;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 6px;margin-left:6px;color:var(--text-muted);flex-shrink:0;font-weight:600;">Ctrl+K</kbd>
    </div>
    <div id="gs-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:9999;background:var(--card-bg);border:1.5px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.18);max-height:420px;overflow-y:auto;padding:4px 0;"></div>`;
}

let _gsDebounce = null;
function onGsInput() {
  clearTimeout(_gsDebounce);
  _gsDebounce = setTimeout(runGlobalSearch, 150);
}

function onGsKey(e) {
  const dd = document.getElementById('gs-dropdown');
  const items = dd?.querySelectorAll('.gs-result-item');
  const active = dd?.querySelector('.gs-result-item.gs-active');

  if(e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if(!items || !items.length) return;
    let idx = -1;
    items.forEach((it, i) => { if(it === active) idx = i; });
    idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
    items.forEach(it => it.classList.remove('gs-active'));
    items[idx]?.classList.add('gs-active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if(e.key === 'Enter') {
    if(active) { active.click(); return; }
    runGlobalSearch(true);
  } else if(e.key === 'Escape') {
    closeGsDropdown();
    document.getElementById('gs-input')?.blur();
  }
}

async function runGlobalSearch(immediate = false) {
  const query = (document.getElementById('gs-input')?.value || '').trim().toLowerCase();
  const dd = document.getElementById('gs-dropdown');
  if (!dd) return;

  if (query.length < 2) { 
    closeGsDropdown(); 
    return; 
  }

  // Allowed pages check based on user role
  const allowedPages = typeof getRoleAllowedPages === 'function' 
    ? getRoleAllowedPages() 
    : ['dashboard', 'orders', 'customers', 'drivers', 'transport', 'paynow', 'invoices', 'items', 'expenses'];

  const [orders, invoices, customers, drivers, items, trips] = await Promise.all([
    allowedPages.includes('orders') ? DB.getOrders() : Promise.resolve([]),
    allowedPages.includes('invoices') ? DB.getInvoices() : Promise.resolve([]),
    allowedPages.includes('customers') ? DB.getCustomers() : Promise.resolve([]),
    allowedPages.includes('drivers') ? DB.getDrivers() : Promise.resolve([]),
    allowedPages.includes('items') ? DB.getItems() : Promise.resolve([]),
    allowedPages.includes('transport') ? DB.getTrips() : Promise.resolve([])
  ]);

  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));
  let results = [];

  // 1. Search Customers
  if (allowedPages.includes('customers')) {
    customers.forEach(c => {
      const match = (c.hotel_name || '').toLowerCase().includes(query) ||
                    (c.contact_person || '').toLowerCase().includes(query) ||
                    (c.phone || '').toLowerCase().includes(query) ||
                    (c.email || '').toLowerCase().includes(query);
      if (match) {
        results.push({
          type: 'Customer',
          icon: 'fa-hotel',
          color: '#8b5cf6',
          title: c.hotel_name,
          subtitle: `Contact: ${c.contact_person || 'N/A'} • ${c.phone || 'No Phone'}`,
          badge: 'Customer',
          action: () => { closeGsDropdown(); navigate('customers'); setTimeout(() => showCustomerProfileModal(c.id), 200); }
        });
      }
    });
  }

  // 2. Search Orders
  if (allowedPages.includes('orders')) {
    orders.forEach(o => {
      const custName = cMap[o.customer_id]?.hotel_name || '';
      const match = (o.batch_id || '').toLowerCase().includes(query) ||
                    custName.toLowerCase().includes(query) ||
                    (o.status || '').toLowerCase().includes(query);
      if (match) {
        results.push({
          type: 'Order',
          icon: 'fa-boxes-stacked',
          color: '#3b82f6',
          title: o.batch_id,
          subtitle: `${custName || 'Unknown Customer'} • Total: LKR ${(o.total_amount || 0).toLocaleString()}`,
          badge: o.status,
          action: () => { closeGsDropdown(); navigate('orders'); setTimeout(() => viewOrderDetails(o.id), 200); }
        });
      }
    });
  }

  // 3. Search Drivers
  if (allowedPages.includes('drivers')) {
    drivers.forEach(d => {
      const match = (d.name || '').toLowerCase().includes(query) ||
                    (d.phone || '').toLowerCase().includes(query) ||
                    (d.vehicle || '').toLowerCase().includes(query);
      if (match) {
        results.push({
          type: 'Driver',
          icon: 'fa-truck',
          color: '#f59e0b',
          title: d.name,
          subtitle: `Vehicle: ${d.vehicle || 'N/A'} • Phone: ${d.phone || 'N/A'}`,
          badge: d.status || 'Active',
          action: () => { closeGsDropdown(); navigate('drivers'); }
        });
      }
    });
  }

  // 4. Search Invoices
  if (allowedPages.includes('invoices')) {
    invoices.forEach(inv => {
      const order = orders.find(x => x.id === inv.order_id);
      const custName = order ? (cMap[order.customer_id]?.hotel_name || '') : '';
      const match = (inv.invoice_number || '').toLowerCase().includes(query) ||
                    custName.toLowerCase().includes(query);
      if (match) {
        results.push({
          type: 'Invoice',
          icon: 'fa-file-invoice',
          color: '#10b981',
          title: inv.invoice_number,
          subtitle: `${custName || 'Customer'} • Amount: LKR ${(inv.total_amount || 0).toLocaleString()}`,
          badge: inv.paid_status || 'Unpaid',
          action: () => { closeGsDropdown(); navigate('invoices'); setTimeout(() => viewInvoice(inv.id), 200); }
        });
      }
    });
  }

  // 5. Search Items Catalog
  if (allowedPages.includes('items')) {
    items.forEach(it => {
      const match = (it.item_id || '').toLowerCase().includes(query) ||
                    (it.item_name || '').toLowerCase().includes(query) ||
                    (it.description || '').toLowerCase().includes(query);
      if (match) {
        results.push({
          type: 'Item',
          icon: 'fa-list-check',
          color: '#ec4899',
          title: `${it.item_name} (${it.item_id})`,
          subtitle: `Dry Clean: LKR ${(it.dry_clean_price || 0).toLocaleString()} • Wash/Press: LKR ${(it.wash_press_price || 0).toLocaleString()}`,
          badge: 'Item Catalog',
          action: () => { closeGsDropdown(); navigate('items'); if (typeof showEditItemModal === 'function' && isAdmin()) setTimeout(() => showEditItemModal(it.id), 200); }
        });
      }
    });
  }

  // 6. Search Transport Trips
  if (allowedPages.includes('transport')) {
    trips.forEach(t => {
      const custNames = (t.selected_customers || []).map(c => c.hotel_name).join(', ');
      const match = (t.trip_id || '').toLowerCase().includes(query) ||
                    (t.driver_name || '').toLowerCase().includes(query) ||
                    custNames.toLowerCase().includes(query) ||
                    (t.notes || '').toLowerCase().includes(query);
      if (match) {
        results.push({
          type: 'Transport',
          icon: 'fa-truck-fast',
          color: '#6366f1',
          title: t.trip_id,
          subtitle: `Driver: ${t.driver_name || 'Driver'} • Customers: ${custNames || 'None'}`,
          badge: t.status,
          action: () => { closeGsDropdown(); navigate('transport'); if (typeof TransportModule !== 'undefined') setTimeout(() => TransportModule.viewTripDetails(t.id), 200); }
        });
      }
    });
  }

  if (!results.length) {
    dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.88em;"><i class="fas fa-search" style="font-size:1.5em;margin-bottom:6px;display:block;opacity:0.5;"></i>No results found for "${query}"</div>`;
    dd.style.display = 'block';
    return;
  }

  dd.innerHTML = results.slice(0, 10).map((r, i) => `
    <div class="gs-result-item ${i === 0 ? 'gs-active' : ''}" onclick="gsResultClick(${i})"
      style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);transition:background 0.1s;"
      onmouseover="document.querySelectorAll('.gs-result-item').forEach(x=>x.classList.remove('gs-active'));this.classList.add('gs-active');">
      <div style="display:flex;align-items:center;gap:12px;overflow:hidden;">
        <div style="width:32px;height:32px;border-radius:8px;background:${r.color}15;color:${r.color};display:flex;align-items:center;justify-content:center;font-size:0.9em;flex-shrink:0;">
          <i class="fas ${r.icon}"></i>
        </div>
        <div style="overflow:hidden;">
          <div style="font-weight:700;font-size:0.9em;color:var(--text);" class="truncate">${r.title}</div>
          <div style="font-size:0.78em;color:var(--text-muted);" class="truncate">${r.subtitle}</div>
        </div>
      </div>
      <span class="badge" style="font-size:0.72em;padding:2px 8px;border-radius:99px;font-weight:700;background:var(--bg);border:1px solid var(--border);color:var(--text-muted);margin-left:8px;flex-shrink:0;">${r.badge}</span>
    </div>`).join('');
  
  dd.style.display = 'block';
  window._gsResults = results;
}

function gsResultClick(idx) {
  const r = window._gsResults?.[idx];
  if(r) r.action();
}

function closeGsDropdown() {
  const dd = document.getElementById('gs-dropdown');
  if(dd) dd.style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  const bar = document.getElementById('global-search-bar');
  if(bar && !bar.contains(e.target)) closeGsDropdown();
});

// ─────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const inInput = ['input','textarea','select'].includes(tag);
  const modal = document.querySelector('.modal-overlay[style*="flex"]');

  // Ctrl+K — focus global search
  if((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.getElementById('gs-input');
    if(input) { input.focus(); input.select(); }
    return;
  }

  // Escape — close topmost modal or search dropdown
  if(e.key === 'Escape') {
    closeGsDropdown();
    const modals = [...document.querySelectorAll('.modal-overlay')].filter(m => m.style.display !== 'none');
    if(modals.length) { modals[modals.length - 1].style.display = 'none'; return; }
  }

  // Enter in modal — click primary button (if not in textarea)
  if(e.key === 'Enter' && modal && tag !== 'textarea' && !e.shiftKey) {
    const btn = modal.querySelector('.btn-primary:not([disabled])');
    if(btn && document.activeElement !== btn) { e.preventDefault(); btn.click(); return; }
  }

  // Shortcuts only when no modal open and not in input
  if(inInput || modal) return;

  switch(e.key) {
    // Navigation — Alt + letter
    case 'd': if(e.altKey){e.preventDefault();navigate('dashboard');} break;
    case 'a': if(e.altKey){e.preventDefault();navigate('analytics');} break;
    case 'o': if(e.altKey){e.preventDefault();navigate('orders');} break;
    case 'i': if(e.altKey){e.preventDefault();navigate('invoices');} break;
    case 'p': if(e.altKey){e.preventDefault();navigate('invoices');} break;
    case 'c': if(e.altKey){e.preventDefault();navigate('customers');} break;
    case 'r': if(e.altKey){e.preventDefault();navigate('drivers');} break;
    case 'm': if(e.altKey){e.preventDefault();navigate('items');} break;
    case 's': if(e.altKey){e.preventDefault();navigate('settings');} break;

    // Page search focus
    case '/':
      e.preventDefault();
      const searchInput = document.querySelector('#orders-search-input,#inv-search-input,#items-search-input');
      if(searchInput){searchInput.focus();searchInput.select();}
      break;

    // Orders page shortcuts
    case 'n': if(e.altKey&&currentPage==='orders'){e.preventDefault();showAddOrderModal();} break;
    case 'P': if(e.altKey&&currentPage==='orders'){e.preventDefault();showPickupModal();} break;
    case 'C': if(e.altKey&&currentPage==='orders'){e.preventDefault();showCreditBillPrompt();} break;

    // Pagination — left/right arrows
    case 'ArrowLeft':
      if(!inInput){
        const prevBtn=document.querySelector('.page-btn:first-child:not([disabled])');
        if(prevBtn)prevBtn.click();
      }
      break;
    case 'ArrowRight':
      if(!inInput){
        const nextBtn=document.querySelector('.page-btn:last-child:not([disabled])');
        if(nextBtn)nextBtn.click();
      }
      break;
  }
});
