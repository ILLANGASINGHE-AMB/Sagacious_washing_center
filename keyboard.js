// keyboard.js — Full keyboard navigation & universal global search

// ─────────────────────────────────────────────
// UNIVERSAL GLOBAL SEARCH BAR
// ─────────────────────────────────────────────

// ── Smart data cache: refreshed at most every 30 seconds ──
let _gsCache = null;
let _gsCacheAt = 0;
const GS_CACHE_TTL = 30_000; // ms

async function _gsGetData() {
  const now = Date.now();
  if (_gsCache && now - _gsCacheAt < GS_CACHE_TTL) return _gsCache;

  const allowedPages = typeof getRoleAllowedPages === 'function'
    ? getRoleAllowedPages()
    : ['dashboard','orders','customers','drivers','vehicles','transport','paynow','invoices','items','expenses','deductions'];

  const [orders, invoices, payments, customers, drivers, vehicles, items, trips, expenseCats, expenseEntries] = await Promise.all([
    allowedPages.includes('orders')     ? DB.getOrders().catch(()=>[])          : [],
    allowedPages.includes('invoices')   ? DB.getInvoices().catch(()=>[])        : [],
    allowedPages.includes('paynow')     ? DB.getPayments().catch(()=>[])        : [],
    allowedPages.includes('customers')  ? DB.getCustomers().catch(()=>[])       : [],
    allowedPages.includes('drivers')    ? DB.getDrivers().catch(()=>[])         : [],
    allowedPages.includes('vehicles')   ? DB.getVehicles().catch(()=>[])        : [],
    allowedPages.includes('items')      ? DB.getItems().catch(()=>[])           : [],
    allowedPages.includes('transport')  ? DB.getTrips().catch(()=>[])           : [],
    allowedPages.includes('expenses')   ? DB.getExpenseCategories().catch(()=>[]) : [],
    allowedPages.includes('expenses')   ? DB.getExpenseEntries().catch(()=>[])  : [],
  ]);

  _gsCache = { orders, invoices, payments, customers, drivers, vehicles, items, trips, expenseCats, expenseEntries, allowedPages };
  _gsCacheAt = now;
  return _gsCache;
}

// Invalidate cache when data changes (call this after any write)
function gsInvalidateCache() { _gsCache = null; _gsCacheAt = 0; }

// ── Highlight query matches inside text ──
function gsHighlight(text, query) {
  if (!text || !query) return escHtml(text || '');
  const escaped = escHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark style="background:rgba(99,102,241,0.2);color:var(--primary);border-radius:3px;padding:0 2px;">$1</mark>');
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Word-level match: every word in query must appear somewhere in the text ──
function gsMatch(text, words) {
  const t = (text || '').toLowerCase();
  return words.every(w => t.includes(w));
}

function initGlobalSearch() {
  const bar = document.getElementById('global-search-bar');
  if (!bar) return;

  bar.innerHTML = `
    <div style="position:relative;display:flex;align-items:center;background:var(--card-bg);border:1.5px solid var(--border);border-radius:12px;padding:0 12px;box-shadow:0 2px 10px rgba(0,0,0,0.06);width:100%;transition:border-color 0.2s;" id="gs-wrapper">
      <i class="fas fa-search" id="gs-icon" style="color:var(--text-muted);font-size:0.9em;margin-right:8px;flex-shrink:0;transition:color 0.2s;"></i>
      <input id="gs-input" class="form-input"
        style="border:none;padding:8px 0;font-size:0.88em;background:transparent;outline:none;width:100%;color:var(--text);"
        placeholder="Search orders, customers, drivers, expenses, invoices…" autocomplete="off" spellcheck="false"
        oninput="onGsInput()" onkeydown="onGsKey(event)"
        onfocus="document.getElementById('gs-wrapper').style.borderColor='var(--primary)';document.getElementById('gs-icon').style.color='var(--primary)'"
        onblur="document.getElementById('gs-wrapper').style.borderColor='var(--border)';document.getElementById('gs-icon').style.color='var(--text-muted)'"/>
      <span id="gs-spinner" style="display:none;margin-left:6px;flex-shrink:0;"><i class="fas fa-circle-notch fa-spin" style="color:var(--primary);font-size:0.85em;"></i></span>
      <kbd style="font-size:0.7em;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 6px;margin-left:6px;color:var(--text-muted);flex-shrink:0;font-weight:600;">Ctrl+K</kbd>
    </div>
    <div id="gs-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:9999;background:var(--card-bg);border:1.5px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.18);max-height:480px;overflow-y:auto;padding:4px 0;"></div>`;
}

let _gsDebounce = null;
function onGsInput() {
  clearTimeout(_gsDebounce);
  const query = (document.getElementById('gs-input')?.value || '').trim();
  if (query.length < 2) { closeGsDropdown(); return; }
  // Show spinner after short pause to avoid flicker on fast cache hits
  _gsDebounce = setTimeout(runGlobalSearch, 200);
}

function onGsKey(e) {
  const dd = document.getElementById('gs-dropdown');
  const items = dd?.querySelectorAll('.gs-result-item');
  const active = dd?.querySelector('.gs-result-item.gs-active');

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items || !items.length) return;
    let idx = -1;
    items.forEach((it, i) => { if (it === active) idx = i; });
    idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
    items.forEach(it => it.classList.remove('gs-active'));
    items[idx]?.classList.add('gs-active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    if (active) { active.click(); return; }
    runGlobalSearch(true);
  } else if (e.key === 'Escape') {
    closeGsDropdown();
    document.getElementById('gs-input')?.blur();
  }
}

async function runGlobalSearch() {
  const rawQuery = (document.getElementById('gs-input')?.value || '').trim();
  const dd = document.getElementById('gs-dropdown');
  if (!dd || rawQuery.length < 2) { closeGsDropdown(); return; }

  const query = rawQuery.toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);

  // Show loading state
  const spinner = document.getElementById('gs-spinner');
  if (spinner) spinner.style.display = 'inline';

  let data;
  try {
    data = await _gsGetData();
  } catch(err) {
    if (spinner) spinner.style.display = 'none';
    dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);font-size:0.88em;"><i class="fas fa-exclamation-triangle" style="margin-bottom:6px;display:block;"></i>Search failed. Please try again.</div>`;
    dd.style.display = 'block';
    return;
  }

  if (spinner) spinner.style.display = 'none';

  const { orders, invoices, payments, customers, drivers, vehicles, items, trips, expenseCats, expenseEntries, allowedPages } = data;
  const cMap = Object.fromEntries(customers.map(c => [c.id, c]));

  // Results grouped by type
  const groups = [];

  // ── 1. Customers ──
  if (allowedPages.includes('customers')) {
    const hits = customers.filter(c =>
      gsMatch(`${c.hotel_name} ${c.contact_person} ${c.phone} ${c.email} ${c.address}`, words)
    ).slice(0, 5).map(c => ({
      icon: 'fa-hotel', color: '#8b5cf6',
      title: gsHighlight(c.hotel_name, rawQuery),
      subtitle: `${escHtml(c.contact_person || 'N/A')} • ${escHtml(c.phone || 'No phone')}`,
      badge: 'Customer', badgeColor: '#8b5cf6',
      action: () => { closeGsDropdown(); navigate('customers'); setTimeout(() => showCustomerProfileModal(c.id), 200); }
    }));
    if (hits.length) groups.push({ label: 'Customers', items: hits });
  }

  // ── 2. Orders ──
  if (allowedPages.includes('orders')) {
    const hits = orders.filter(o => {
      const cn = cMap[o.customer_id]?.hotel_name || '';
      return gsMatch(`${o.batch_id} ${cn} ${o.status} ${o.pickup_date} ${o.notes || ''}`, words);
    }).slice(0, 6).map(o => {
      const cn = cMap[o.customer_id]?.hotel_name || 'Unknown';
      return {
        icon: 'fa-boxes-stacked', color: '#3b82f6',
        title: gsHighlight(o.batch_id, rawQuery),
        subtitle: `${escHtml(cn)} • LKR ${(o.total_amount||0).toLocaleString()} • ${escHtml(o.pickup_date||'')}`,
        badge: o.status, badgeColor: o.status === 'Paid' ? '#10b981' : '#ef4444',
        action: () => { closeGsDropdown(); navigate('orders'); setTimeout(() => viewOrderDetails(o.id), 200); }
      };
    });
    if (hits.length) groups.push({ label: 'Orders', items: hits });
  }

  // ── 3. Invoices ──
  if (allowedPages.includes('invoices')) {
    const hits = invoices.filter(inv => {
      const ord = orders.find(x => x.id === inv.order_id);
      const cn = ord ? (cMap[ord.customer_id]?.hotel_name || '') : '';
      return gsMatch(`${inv.invoice_number} ${cn} ${inv.paid_status}`, words);
    }).slice(0, 5).map(inv => {
      const ord = orders.find(x => x.id === inv.order_id);
      const cn = ord ? (cMap[ord.customer_id]?.hotel_name || '') : '';
      return {
        icon: 'fa-file-invoice', color: '#10b981',
        title: gsHighlight(inv.invoice_number, rawQuery),
        subtitle: `${escHtml(cn)} • LKR ${(inv.total_amount||0).toLocaleString()} • Balance: LKR ${(inv.balance||0).toLocaleString()}`,
        badge: inv.paid_status || 'Unpaid', badgeColor: inv.paid_status === 'Paid' ? '#10b981' : '#f59e0b',
        action: () => { closeGsDropdown(); navigate('invoices'); setTimeout(() => viewInvoice(inv.id), 200); }
      };
    });
    if (hits.length) groups.push({ label: 'Invoices', items: hits });
  }

  // ── 4. Drivers ──
  if (allowedPages.includes('drivers')) {
    const hits = drivers.filter(d =>
      gsMatch(`${d.name} ${d.nickname||''} ${d.phone||''} ${d.phone2||''} ${d.nic||''} ${d.vehicle||''}`, words)
    ).slice(0, 4).map(d => ({
      icon: 'fa-id-card', color: '#f59e0b',
      title: gsHighlight(d.name + (d.nickname ? ` (${d.nickname})` : ''), rawQuery),
      subtitle: `NIC: ${escHtml(d.nic||'N/A')} • ${escHtml(d.phone||'No phone')} • ${escHtml(d.status||'available')}`,
      badge: d.status || 'available', badgeColor: '#f59e0b',
      action: () => { closeGsDropdown(); navigate('drivers'); setTimeout(() => openDriverDetail(d.id), 200); }
    }));
    if (hits.length) groups.push({ label: 'Drivers', items: hits });
  }

  // ── 5. Vehicles ──
  if (allowedPages.includes('vehicles')) {
    const hits = (vehicles||[]).filter(v =>
      gsMatch(`${v.vehicle_no} ${v.category||''} ${v.model||''} ${v.status||''}`, words)
    ).slice(0, 4).map(v => ({
      icon: 'fa-car', color: '#06b6d4',
      title: gsHighlight(v.vehicle_no, rawQuery),
      subtitle: `${escHtml(v.category||'N/A')} • ${escHtml(v.model||'N/A')} • ${escHtml(v.status||'available')}`,
      badge: v.status || 'available', badgeColor: '#06b6d4',
      action: () => { closeGsDropdown(); navigate('vehicles'); setTimeout(() => openVehicleDetail(v.id), 200); }
    }));
    if (hits.length) groups.push({ label: 'Vehicles', items: hits });
  }

  // ── 6. Items Catalog ──
  if (allowedPages.includes('items')) {
    const hits = items.filter(it =>
      gsMatch(`${it.item_id} ${it.item_name} ${it.description||''}`, words)
    ).slice(0, 5).map(it => ({
      icon: 'fa-list-check', color: '#ec4899',
      title: gsHighlight(`${it.item_name} (${it.item_id})`, rawQuery),
      subtitle: `Dry Clean: LKR ${(it.dry_clean_price||0).toLocaleString()} • Wash+Press: LKR ${(it.wash_press_price||0).toLocaleString()}`,
      badge: 'Item', badgeColor: '#ec4899',
      action: () => { closeGsDropdown(); navigate('items'); if (typeof showEditItemModal === 'function' && isAdmin()) setTimeout(() => showEditItemModal(it.id), 200); }
    }));
    if (hits.length) groups.push({ label: 'Items', items: hits });
  }

  // ── 7. Expense Categories ──
  if (allowedPages.includes('expenses')) {
    const hits = expenseCats.filter(cat =>
      gsMatch(`${cat.category_id} ${cat.name}`, words)
    ).slice(0, 4).map(cat => ({
      icon: 'fa-layer-group', color: '#6366f1',
      title: gsHighlight(cat.name, rawQuery),
      subtitle: `Category ID: ${escHtml(cat.category_id)}`,
      badge: 'Expense Cat.', badgeColor: '#6366f1',
      action: () => { closeGsDropdown(); navigate('expenses'); }
    }));
    if (hits.length) groups.push({ label: 'Expense Categories', items: hits });
  }

  // ── 8. Expense Entries (journal rows) ──
  if (allowedPages.includes('expenses')) {
    const hits = expenseEntries.filter(e =>
      gsMatch(`${e.entry_date||''} ${e.description||''}`, words)
    ).slice(0, 4).map(e => ({
      icon: 'fa-receipt', color: '#a855f7',
      title: gsHighlight(e.description || `Entry ${e.id}`, rawQuery),
      subtitle: `Date: ${escHtml(e.entry_date||'N/A')}`,
      badge: 'Expense Entry', badgeColor: '#a855f7',
      action: () => { closeGsDropdown(); navigate('expenses'); }
    }));
    if (hits.length) groups.push({ label: 'Expense Entries', items: hits });
  }

  // ── 9. Transport Trips ──
  if (allowedPages.includes('transport')) {
    const hits = trips.filter(t => {
      const custNames = (t.selected_customers||[]).map(c => c.hotel_name).join(' ');
      return gsMatch(`${t.trip_id} ${t.driver_name||''} ${custNames} ${t.notes||''} ${t.status||''}`, words);
    }).slice(0, 4).map(t => {
      const custNames = (t.selected_customers||[]).map(c => c.hotel_name).join(', ');
      return {
        icon: 'fa-truck-fast', color: '#14b8a6',
        title: gsHighlight(t.trip_id, rawQuery),
        subtitle: `Driver: ${escHtml(t.driver_name||'—')} • ${escHtml(custNames||'No customers')}`,
        badge: t.status || 'Trip', badgeColor: '#14b8a6',
        action: () => { closeGsDropdown(); navigate('transport'); if (typeof TransportModule !== 'undefined') setTimeout(() => TransportModule.viewTripDetails(t.id), 200); }
      };
    });
    if (hits.length) groups.push({ label: 'Transport', items: hits });
  }

  // ── 10. Payments ──
  if (allowedPages.includes('paynow')) {
    const hits = payments.filter(p =>
      gsMatch(`${p.reference||''} ${p.note||''} ${p.date||''} ${p.method||''}`, words)
    ).slice(0, 4).map(p => ({
      icon: 'fa-money-bill-wave', color: '#22c55e',
      title: gsHighlight(p.reference || `Payment ${p.id}`, rawQuery),
      subtitle: `LKR ${(p.amount||0).toLocaleString()} • ${escHtml(p.method||'N/A')} • ${escHtml(p.date||'')}`,
      badge: 'Payment', badgeColor: '#22c55e',
      action: () => { closeGsDropdown(); navigate('paynow'); }
    }));
    if (hits.length) groups.push({ label: 'Payments', items: hits });
  }

  // ── Render ──
  if (!groups.length) {
    dd.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.88em;">
        <i class="fas fa-magnifying-glass" style="font-size:1.8rem;margin-bottom:8px;display:block;opacity:0.3;"></i>
        No results for <strong>"${escHtml(rawQuery)}"</strong>
        <div style="font-size:0.8em;margin-top:4px;opacity:0.7;">Try a different keyword or check spelling</div>
      </div>`;
    dd.style.display = 'block';
    return;
  }

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
  let resultIdx = 0;
  const allResults = [];

  const html = `
    <div style="padding:6px 14px 4px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);">
      <span style="font-size:0.75em;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;">RESULTS</span>
      <span style="font-size:0.72em;background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:1px 8px;color:var(--text-muted);font-weight:600;">${totalCount} found</span>
    </div>
    ${groups.map(group => `
      <div style="padding:4px 14px 2px;font-size:0.68em;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-top:6px;">${group.label}</div>
      ${group.items.map(r => {
        const idx = resultIdx++;
        allResults.push(r);
        return `
          <div class="gs-result-item ${idx === 0 ? 'gs-active' : ''}" onclick="gsResultClick(${idx})"
            style="padding:9px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;transition:background 0.12s;"
            onmouseover="document.querySelectorAll('.gs-result-item').forEach(x=>x.classList.remove('gs-active'));this.classList.add('gs-active');">
            <div style="display:flex;align-items:center;gap:10px;overflow:hidden;flex:1;">
              <div style="width:30px;height:30px;border-radius:8px;background:${r.color}18;color:${r.color};display:flex;align-items:center;justify-content:center;font-size:0.85em;flex-shrink:0;">
                <i class="fas ${r.icon}"></i>
              </div>
              <div style="overflow:hidden;flex:1;">
                <div style="font-weight:700;font-size:0.88em;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.title}</div>
                <div style="font-size:0.75em;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.subtitle}</div>
              </div>
            </div>
            <span style="font-size:0.68em;padding:2px 7px;border-radius:99px;font-weight:700;background:${r.badgeColor}18;color:${r.badgeColor};border:1px solid ${r.badgeColor}30;white-space:nowrap;flex-shrink:0;">${r.badge}</span>
          </div>`;
      }).join('')}
    `).join('')}
    <div style="padding:6px 14px;border-top:1px solid var(--border);font-size:0.72em;color:var(--text-muted);display:flex;gap:12px;margin-top:4px;">
      <span><kbd style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 5px;">↑↓</kbd> Navigate</span>
      <span><kbd style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 5px;">Enter</kbd> Open</span>
      <span><kbd style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 5px;">Esc</kbd> Close</span>
    </div>`;

  dd.innerHTML = html;
  dd.style.display = 'block';
  window._gsResults = allResults;
}

function gsResultClick(idx) {
  const r = window._gsResults?.[idx];
  if (r) r.action();
}

function closeGsDropdown() {
  const dd = document.getElementById('gs-dropdown');
  if (dd) dd.style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  const bar = document.getElementById('global-search-bar');
  if (bar && !bar.contains(e.target)) closeGsDropdown();
});

// ─────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const inInput = ['input','textarea','select'].includes(tag);
  const modal = document.querySelector('.modal-overlay[style*="flex"]');

  // Ctrl+K — focus global search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.getElementById('gs-input');
    if (input) { input.focus(); input.select(); }
    return;
  }

  // Escape — close topmost modal or search dropdown
  if (e.key === 'Escape') {
    closeGsDropdown();
    const modals = [...document.querySelectorAll('.modal-overlay')].filter(m => m.style.display !== 'none');
    if (modals.length) { modals[modals.length - 1].style.display = 'none'; return; }
  }

  // Enter in modal — click primary button (if not in textarea)
  if (e.key === 'Enter' && modal && tag !== 'textarea' && !e.shiftKey) {
    const btn = modal.querySelector('.btn-primary:not([disabled])');
    if (btn && document.activeElement !== btn) { e.preventDefault(); btn.click(); return; }
  }

  // Shortcuts only when no modal open and not in input
  if (inInput || modal) return;

  switch (e.key) {
    // Navigation — Alt + letter
    case 'd': if (e.altKey) { e.preventDefault(); navigate('dashboard'); } break;
    case 'a': if (e.altKey) { e.preventDefault(); navigate('analytics'); } break;
    case 'o': if (e.altKey) { e.preventDefault(); navigate('orders'); } break;
    case 'i': if (e.altKey) { e.preventDefault(); navigate('invoices'); } break;
    case 'p': if (e.altKey) { e.preventDefault(); navigate('invoices'); } break;
    case 'c': if (e.altKey) { e.preventDefault(); navigate('customers'); } break;
    case 'r': if (e.altKey) { e.preventDefault(); navigate('drivers'); } break;
    case 'm': if (e.altKey) { e.preventDefault(); navigate('items'); } break;
    case 's': if (e.altKey) { e.preventDefault(); navigate('settings'); } break;

    // Page search focus
    case '/':
      e.preventDefault();
      const searchInput = document.querySelector('#orders-search-input,#inv-search-input,#items-search-input');
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      break;

    // Orders page shortcuts
    case 'n': if (e.altKey && currentPage === 'orders') { e.preventDefault(); showAddOrderModal(); } break;
    case 'P': if (e.altKey && currentPage === 'orders') { e.preventDefault(); showPickupModal(); } break;
    case 'C': if (e.altKey && currentPage === 'orders') { e.preventDefault(); showCreditBillPrompt(); } break;

    // Pagination — left/right arrows
    case 'ArrowLeft':
      if (!inInput) {
        const prevBtn = document.querySelector('.page-btn:first-child:not([disabled])');
        if (prevBtn) prevBtn.click();
      }
      break;
    case 'ArrowRight':
      if (!inInput) {
        const nextBtn = document.querySelector('.page-btn:last-child:not([disabled])');
        if (nextBtn) nextBtn.click();
      }
      break;
  }
});
