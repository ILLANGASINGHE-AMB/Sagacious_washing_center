

// ui.js - UI Utilities

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

// ─── Processing Overlay ───────────────────────────────────────────
// Circular progress overlay for long-running operations
let _processingInterval = null;
let _processingProgress = 0;

function showProcessingOverlay(label, sublabel) {
  const overlay = document.getElementById('processing-overlay');
  if (!overlay) return;
  
  // Reset state
  _processingProgress = 0;
  _updateRing(0);
  
  // Set labels
  const lblEl = document.getElementById('processing-label');
  const subEl = document.getElementById('processing-sublabel');
  if (lblEl) lblEl.innerHTML = (label || 'Request is Processing') + '<span class="processing-dots"></span>';
  if (subEl) subEl.textContent = sublabel || 'Please wait...';
  
  // Show overlay
  overlay.classList.add('active');
  
  // Start simulated progress (moves quickly to ~85%, then slows)
  _processingInterval = setInterval(() => {
    if (_processingProgress < 85) {
      _processingProgress += Math.random() * 6 + 2; // 2-8% per tick
    } else if (_processingProgress < 95) {
      _processingProgress += Math.random() * 1.5 + 0.3; // slow down near end
    }
    _processingProgress = Math.min(_processingProgress, 95);
    _updateRing(_processingProgress);
  }, 300);
}

function updateProcessingProgress(percent) {
  _processingProgress = Math.min(percent, 100);
  _updateRing(_processingProgress);
}

function hideProcessingOverlay() {
  // Complete the ring to 100%
  if (_processingInterval) {
    clearInterval(_processingInterval);
    _processingInterval = null;
  }
  
  _processingProgress = 100;
  _updateRing(100);
  
  // Wait a brief moment at 100% before hiding
  setTimeout(() => {
    const overlay = document.getElementById('processing-overlay');
    if (overlay) overlay.classList.remove('active');
    _processingProgress = 0;
  }, 400);
}

function _updateRing(percent) {
  const circle = document.getElementById('processing-ring-circle');
  const percentText = document.getElementById('processing-percent-text');
  if (!circle || !percentText) return;
  
  const circumference = 2 * Math.PI * 54; // r=54
  const offset = circumference - (percent / 100) * circumference;
  circle.setAttribute('stroke-dashoffset', offset.toString());
  percentText.textContent = Math.round(percent);
}

// Wraps an async function with the processing overlay
// Usage: await withProcessingOverlay(asyncFn, 'Generating Bill', 'Processing items...')
async function withProcessingOverlay(asyncFn, label, sublabel) {
  showProcessingOverlay(label, sublabel);
  try {
    const result = await asyncFn();
    return result;
  } catch (err) {
    throw err;
  } finally {
    hideProcessingOverlay();
  }
}
// ──────────────────────────────────────────────────────────────────


let currentUser = null;
function isAdmin() { return currentUser?.role === 'admin'; }
function requireAdmin() {
  if (!isAdmin()) { toast('Access denied — Admin only', 'error'); return false; }
  return true;
}

function toast(message, type = 'success', duration = 3000) {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type]||icons.info}" style="color:${colors[type]};font-size:1.1em;"></i><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(40px)'; el.style.transition='0.3s'; setTimeout(()=>el.remove(),400); }, duration);
}
const showToast = toast;

function showLoading(containerId = 'content', message = 'Loading...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted);">
    <i class="fas fa-spinner fa-spin" style="font-size:2em;color:var(--primary);margin-bottom:12px;"></i>
    <div style="font-size:0.9em;font-weight:500;">${message}</div>
  </div>`;
}

function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function hideModal(id) { const el=document.getElementById(id); if(el) el.style.display='none'; }

function createModal(id, title, bodyHTML, size='') {
  let m = document.getElementById(id); if(m) m.remove();
  const overlay = document.createElement('div');
  overlay.className='modal-overlay'; overlay.id=id; overlay.style.display='none';
  overlay.innerHTML=`<div class="modal ${size}" onclick="event.stopPropagation()"><div class="modal-header"><span class="modal-title">${title}</span><button class="modal-close" onclick="hideModal('${id}')"><i class="fas fa-times"></i></button></div><div id="${id}-body">${bodyHTML}</div></div>`;
  overlay.addEventListener('click',()=>hideModal(id));
  document.body.appendChild(overlay); return overlay;
}

function formatCurrency(amount) { return 'LKR '+Number(amount||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDate(d) { if(!d)return'—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function formatDateTime(d) { if(!d)return'—'; return new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function today() { return new Date().toISOString().split('T')[0]; }
function todayDisplay() { return new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }

function getOrderCustomerName(order, cMap = {}, deletedMap = window._deletedCustOrders || {}) {
  if (!order) return '—';
  if (order.customer_id && cMap[order.customer_id]?.hotel_name) {
    return cMap[order.customer_id].hotel_name;
  }
  if (deletedMap['order_' + order.id]) {
    return deletedMap['order_' + order.id];
  }
  if (order.customer_id && deletedMap['cust_' + order.customer_id]) {
    return deletedMap['cust_' + order.customer_id];
  }
  return '—';
}

// 6 statuses only
const STATUS_COLORS = {
  'Pickup Requested':'badge-yellow',
  'Received':        'badge-purple',
  'Completed':       'badge-green',
  'Out for Delivery':'badge-blue',
  'Delivered':       'badge-cyan',
  'Paid':            'badge-green',
  'Credits':         'badge-credits'
};
function statusBadge(status) { return `<span class="badge ${STATUS_COLORS[status]||'badge-gray'}">${status||'—'}</span>`; }

function paginateData(data,page,perPage) {
  const total=data.length, totalPages=Math.max(1,Math.ceil(total/perPage)), start=(page-1)*perPage;
  return {items:data.slice(start,start+perPage),totalPages,total};
}
function renderPagination(currentPage,totalPages,onPageChange) {
  if(totalPages<=1)return'';
  let btns=`<button class="page-btn" onclick="${onPageChange}(${currentPage-1})" ${currentPage===1?'disabled':''}><i class="fas fa-chevron-left"></i></button>`;
  for(let i=1;i<=totalPages;i++){
    if(totalPages>7&&Math.abs(i-currentPage)>2&&i!==1&&i!==totalPages){if(i===currentPage-3||i===currentPage+3)btns+=`<button class="page-btn" disabled>…</button>`;continue;}
    btns+=`<button class="page-btn ${i===currentPage?'active':''}" onclick="${onPageChange}(${i})">${i}</button>`;
  }
  btns+=`<button class="page-btn" onclick="${onPageChange}(${currentPage+1})" ${currentPage===totalPages?'disabled':''}><i class="fas fa-chevron-right"></i></button>`;
  return `<div class="pagination">${btns}</div>`;
}

function confirmDialog(message,onConfirm,confirmLabel='Confirm',danger=true) {
  let m=document.getElementById('confirm-modal'); if(m)m.remove();
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.id='confirm-modal';
  overlay.style.cssText='z-index:9000;display:flex;';
  overlay.innerHTML=`<div class="modal" style="max-width:400px;" onclick="event.stopPropagation()">
    <div style="text-align:center;padding:10px 0 20px;">
      <div style="font-size:2.5em;color:#f59e0b;margin-bottom:14px;"><i class="fas fa-exclamation-triangle"></i></div>
      <div style="font-size:1em;font-weight:600;margin-bottom:24px;line-height:1.5;">${message}</div>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button class="btn btn-secondary" style="min-width:90px;" onclick="document.getElementById('confirm-modal').remove()">Cancel</button>
        <button class="btn ${danger?'btn-danger':'btn-primary'}" style="min-width:90px;" id="confirm-ok-btn">${confirmLabel}</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('confirm-ok-btn').onclick=()=>{overlay.remove();onConfirm();};
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

function filterData(data,query,fields) {
  if(!query)return data;
  const q=query.toLowerCase();
  return data.filter(item=>fields.some(f=>String(item[f]||'').toLowerCase().includes(q)));
}

function downloadJSON(data,filename) { const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); }
function downloadFile(content,filename,type) { const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); }

const SERVICE_TYPES  = ['Wash','Dry'];
const ORDER_STATUSES = ['Paid', 'Unpaid'];
const PAYMENT_METHODS = ['Cash','Bank Transfer','Credit','Monthly Billing'];

// ─── Generic searchable picker (Customer/Driver dropdowns) ───
window._pickers = {};
function initSearchPicker(id, items, labelFn, valueFn, currentVal) {
  window._pickers[id] = { items, labelFn, valueFn };
  const input  = document.getElementById(id+'-input');
  const hidden = document.getElementById(id+'-value');
  if(currentVal) {
    const found = items.find(i => String(valueFn(i)) === String(currentVal));
    if(found && input) { input.value = labelFn(found); }
    if(hidden) hidden.value = currentVal;
  }
}
function showSearchPicker(id) {
  const p = window._pickers[id]; if(!p) return;
  _renderPickerList(id, p.items);
  const dd = document.getElementById(id+'-dropdown'); if(dd) dd.style.display='block';
}
function hideSearchPicker(id) {
  // Don't hide if the user is in the middle of clicking a dropdown item
  if(window._pickerClicking) return;
  const dd=document.getElementById(id+'-dropdown'); if(dd) dd.style.display='none';
}
function filterSearchPicker(id) {
  const p = window._pickers[id]; if(!p) return;
  const q = (document.getElementById(id+'-input')?.value||'').toLowerCase();
  const filtered = q ? p.items.filter(i=>p.labelFn(i).toLowerCase().includes(q)) : p.items;
  _renderPickerList(id, filtered);
  const dd=document.getElementById(id+'-dropdown'); if(dd) dd.style.display='block';
}
function _renderPickerList(id, items) {
  const p = window._pickers[id]; if(!p) return;
  const dd = document.getElementById(id+'-dropdown'); if(!dd) return;
  dd.innerHTML = items.length
    ? items.map(item=>`<div style="padding:10px 14px;cursor:pointer;font-size:0.9em;border-bottom:1px solid var(--border);"
        onmousedown="window._pickerClicking=true"
        onmouseup="window._pickerClicking=false;selectSearchPicker('${id}','${String(p.valueFn(item)).replace(/'/g,"\\'")}','${p.labelFn(item).replace(/'/g,"\\'")}')">
        ${p.labelFn(item)}</div>`).join('')
    : `<div style="padding:12px 14px;color:var(--text-muted);font-size:0.88em;">No results</div>`;
}
function selectSearchPicker(id, value, label) {
  window._pickerClicking = false;
  const input=document.getElementById(id+'-input'); const hidden=document.getElementById(id+'-value');
  if(input) input.value=label; if(hidden) hidden.value=value;
  hideSearchPicker(id);
  
  if (id === 'ao-cust' || id === 'eo-cust' || id === 'cb-cust') {
    if (typeof window.onCustomerPickerChange === 'function') {
      window.onCustomerPickerChange(id, value);
    }
  }
}
function getPickerValue(id) { return document.getElementById(id+'-value')?.value||''; }

function pickerHTML(id, placeholder) {
  return `<div style="position:relative;">
    <input class="form-input" id="${id}-input" placeholder="${placeholder}" autocomplete="off"
      oninput="filterSearchPicker('${id}')" onfocus="showSearchPicker('${id}')" onblur="setTimeout(()=>hideSearchPicker('${id}'),200)" style="width:100%;"/>
    <input type="hidden" id="${id}-value"/>
    <div id="${id}-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);max-height:220px;overflow-y:auto;margin-top:2px;"></div>
  </div>`;
}
