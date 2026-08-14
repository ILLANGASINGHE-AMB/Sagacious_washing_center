// items.js - Items Catalog Module

let itemsPage=1, itemsSearch='', itemsPerPage=15;

const ITEM_SERVICES = [
  { key: 'dry_clean_price',    label: 'Dry Clean',    badge: 'badge-purple' },
  { key: 'wash_press_price',   label: 'Wash & Press', badge: 'badge-cyan'   },
  { key: 'wash_dry_price',     label: 'Wash & Dry',   badge: 'badge-green'  }
];

function clearItemsCache() {}

async function renderItems() {
  document.getElementById('page-title').textContent = 'Items';
  if (document.getElementById('items-table-body')) {
    await _refreshItemsTable();
    await _refreshQuotationsHistoryTable();
    return;
  }

  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Items Catalog</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${canUseQuotation()?'<button class="btn btn-primary" onclick="showGenerateQuotationModal()"><i class="fas fa-file-invoice"></i> Generate Quotation</button>':''}
        ${canUseQuotation()?'<button class="btn btn-secondary" onclick="showDefaultTermsModal()"><i class="fas fa-file-contract"></i> Terms &amp; Conditions</button>':''}
        ${isAdmin()?'<button class="btn btn-secondary" onclick="printItemsCatalog()"><i class="fas fa-print"></i> Print Catalog</button>':''}
        ${isAdmin()?'<button class="btn btn-secondary" onclick="exportItems()"><i class="fas fa-download"></i> Backup</button>':''}
        ${isAdmin()?'<button class="btn btn-secondary" onclick="document.getElementById(\'items-import-file\').click()"><i class="fas fa-upload"></i> Import</button>':''}
        <input type="file" id="items-import-file" accept=".json" style="display:none" onchange="importItems(this)"/>
        ${canEditItems()?'<button class="btn btn-primary" onclick="showAddItemModal()"><i class="fas fa-plus"></i> Add Item</button>':''}
      </div>
    </div>
    <div id="items-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px;"></div>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;gap:12px;align-items:center;">
        <div class="search-wrap" style="flex:1;">
          <i class="fas fa-search"></i>
          <input class="form-input" id="items-search-input" placeholder="Search item ID, name..."
            autocomplete="off" spellcheck="false"
            oninput="itemsSearch=this.value;itemsPage=1;_refreshItemsTable()"/>
        </div>
        <span id="items-count" style="font-size:0.82em;color:var(--text-muted);"></span>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Item ID</th>
            <th>Item Name</th>
            <th>Description</th>
            <th style="text-align:right;">Dry Clean</th>
            <th style="text-align:right;">Wash &amp; Press</th>
            <th style="text-align:right;">Wash &amp; Dry</th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="items-table-body"></tbody>
        </table>
      </div>
      <div id="items-pagination" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);"></div>
    </div>

    <!-- QUOTATIONS GENERATED HISTORY SECTION -->
    <div class="card" style="margin-top:28px;">
      <div class="section-header" style="margin-bottom:14px;">
        <span class="section-title" style="font-size:1.1em;"><i class="fas fa-history"></i> Quotations Generated History</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:60px;">No</th>
              <th>Quotation ID</th>
              <th>Customer Name</th>
              <th>Issued Date</th>
              <th>Valid Until</th>
              <th style="text-align:right;width:220px;">Action</th>
            </tr>
          </thead>
          <tbody id="quotations-history-table-body"></tbody>
        </table>
      </div>
    </div>`;
  await _refreshItemsTable();
  await _refreshQuotationsHistoryTable();
  document.getElementById('items-search-input')?.focus();
}

async function _refreshItemsTable() {
  const tbody = document.getElementById('items-table-body');
  if (!tbody) { await renderItems(); return; }

  const allItems = await DB.getItems();
  let filtered = filterData(allItems, itemsSearch, ['item_id','item_name','description']);
  filtered = filtered.sort((a,b)=>(a.item_id||'').localeCompare(b.item_id||''));
  const {items,totalPages,total} = paginateData(filtered, itemsPage, itemsPerPage);

  const statsEl = document.getElementById('items-stats');
  if(statsEl) {
    statsEl.innerHTML =
      `<div class="stat-card"><div class="label">Total Items</div><div class="value">${allItems.length}</div><div class="sub">In catalog</div></div>`;
  }
  const countEl = document.getElementById('items-count');
  if(countEl) countEl.textContent = total+' item'+(total!==1?'s':'');

  tbody.innerHTML = items.length===0
    ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:2.2em;margin-bottom:8px;">🧺</div>No items found</td></tr>`
    : items.map(item=>`<tr>
        <td><span style="font-family:monospace;font-weight:700;font-size:0.9em;background:var(--bg);padding:4px 10px;border-radius:6px;border:1px solid var(--border);letter-spacing:1px;">${item.item_id}</span></td>
        <td><strong>${item.item_name}</strong></td>
        <td style="color:var(--text-muted);font-size:0.88em;">${item.description||'—'}</td>
        <td style="text-align:right;"><span class="badge badge-purple">${formatCurrency(item.dry_clean_price||0)}</span></td>
        <td style="text-align:right;"><span class="badge badge-cyan">${formatCurrency(item.wash_press_price||0)}</span></td>
        <td style="text-align:right;"><span class="badge badge-green">${formatCurrency(item.wash_dry_price||0)}</span></td>
        <td><div style="display:flex;gap:6px;">
          ${canEditItems()?`<button class="btn btn-primary btn-sm" onclick="showEditItemModal(${item.id})"><i class="fas fa-edit"></i></button>`:''}
          ${canDelete()?`<button class="btn btn-danger btn-sm" onclick="deleteItemConfirm(${item.id})"><i class="fas fa-trash"></i></button>`:''}
        </div></td>
      </tr>`).join('');

  const pg=document.getElementById('items-pagination');
  if(pg) pg.innerHTML=`<span style="font-size:0.82em;color:var(--text-muted);">Page ${itemsPage} of ${totalPages}</span>`+renderPagination(itemsPage,totalPages,'changeItemsPage');
}

function changeItemsPage(p){itemsPage=p;renderItems();}

// ─────────────────────────────────────────────
// ADD ITEM
// ─────────────────────────────────────────────
async function showAddItemModal() {
  if(!canEditItems()) return;
  createModal('add-item-modal','Add New Item',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Item ID *</label>
        <input class="form-input" id="it-id" placeholder="e.g. BS, TW, PC" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()"/>
        <span style="font-size:0.78em;color:var(--text-muted);">Short unique code</span>
      </div>
      <div class="form-group">
        <label class="form-label">Item Name *</label>
        <input class="form-input" id="it-name" placeholder="e.g. Bed Sheet"/>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Description</label>
        <input class="form-input" id="it-desc" placeholder="Optional description"/>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label" style="font-weight:700;margin-bottom:10px;">Service Prices (LKR)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div>
            <label class="form-label"><span class="badge badge-purple" style="font-size:0.75em;">Dry Clean</span></label>
            <input type="number" class="form-input" id="it-dry-clean" placeholder="0.00" min="0" step="0.01"/>
          </div>
          <div>
            <label class="form-label"><span class="badge badge-cyan" style="font-size:0.75em;">Wash &amp; Press</span></label>
            <input type="number" class="form-input" id="it-wash-press" placeholder="0.00" min="0" step="0.01"/>
          </div>
          <div>
            <label class="form-label"><span class="badge badge-green" style="font-size:0.75em;">Wash &amp; Dry</span></label>
            <input type="number" class="form-input" id="it-wash-dry" placeholder="0.00" min="0" step="0.01"/>
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
      <button class="btn btn-secondary" onclick="hideModal('add-item-modal')">Cancel [Esc]</button>
      <button class="btn btn-primary" onclick="saveNewItem()"><i class="fas fa-save"></i> Save Item [Enter]</button>
    </div>`);
  showModal('add-item-modal');
  setTimeout(()=>document.getElementById('it-id')?.focus(),80);
}

async function saveNewItem() {
  if(!requireAdmin()) return;
  const item_id          = document.getElementById('it-id').value.trim().toUpperCase();
  const item_name        = document.getElementById('it-name').value.trim();
  const dry_clean_price  = parseFloat(document.getElementById('it-dry-clean').value)||0;
  const wash_press_price = parseFloat(document.getElementById('it-wash-press').value)||0;
  const wash_dry_price   = parseFloat(document.getElementById('it-wash-dry').value)||0;
  const description      = document.getElementById('it-desc').value.trim();
  if(!item_id)   return toast('Item ID is required','error');
  if(!item_name) return toast('Item name is required','error');
  const existing = await DB.getItemByCode(item_id);
  if(existing) return toast(`Item ID "${item_id}" already exists`,'error');
  await DB.addItem({item_id, item_name, dry_clean_price, wash_press_price, wash_dry_price, description});
  await DB.logAction('Add Item', `Added catalog item "${item_name}" (${item_id})`, { code: item_id, name: item_name, dry_clean_price, wash_press_price, wash_dry_price }, 'Item');
  hideModal('add-item-modal');
  toast(`Item "${item_name}" added!`);
  renderItems();
}

// ─────────────────────────────────────────────
// EDIT ITEM (Admin only)
// ─────────────────────────────────────────────
async function showEditItemModal(id) {
  if(!canEditItems()) return;
  const item = await DB.getItem(id); if(!item) return;
  createModal('edit-item-modal',`Edit Item: ${item.item_id}`,`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Item ID *</label>
        <input class="form-input" id="eit-id" value="${item.item_id||''}" style="text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()"/>
      </div>
      <div class="form-group">
        <label class="form-label">Item Name *</label>
        <input class="form-input" id="eit-name" value="${item.item_name||''}"/>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Description</label>
        <input class="form-input" id="eit-desc" value="${item.description||''}"/>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label" style="font-weight:700;margin-bottom:10px;">Service Prices (LKR)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div>
            <label class="form-label"><span class="badge badge-purple" style="font-size:0.75em;">Dry Clean</span></label>
            <input type="number" class="form-input" id="eit-dry-clean" value="${item.dry_clean_price||0}" min="0" step="0.01"/>
          </div>
          <div>
            <label class="form-label"><span class="badge badge-cyan" style="font-size:0.75em;">Wash &amp; Press</span></label>
            <input type="number" class="form-input" id="eit-wash-press" value="${item.wash_press_price||0}" min="0" step="0.01"/>
          </div>
          <div>
            <label class="form-label"><span class="badge badge-green" style="font-size:0.75em;">Wash &amp; Dry</span></label>
            <input type="number" class="form-input" id="eit-wash-dry" value="${item.wash_dry_price||0}" min="0" step="0.01"/>
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
      <button class="btn btn-secondary" onclick="hideModal('edit-item-modal')">Cancel [Esc]</button>
      <button class="btn btn-primary" onclick="saveEditItem(${id})"><i class="fas fa-save"></i> Save [Enter]</button>
    </div>`);
  showModal('edit-item-modal');
  setTimeout(()=>document.getElementById('eit-id')?.focus(),80);
}

async function saveEditItem(id) {
  if(!requireAdmin()) return;
  const item_id          = document.getElementById('eit-id').value.trim().toUpperCase();
  const item_name        = document.getElementById('eit-name').value.trim();
  const dry_clean_price  = parseFloat(document.getElementById('eit-dry-clean').value)||0;
  const wash_press_price = parseFloat(document.getElementById('eit-wash-press').value)||0;
  const wash_dry_price   = parseFloat(document.getElementById('eit-wash-dry').value)||0;
  const description      = document.getElementById('eit-desc').value.trim();
  if(!item_id)   return toast('Item ID is required','error');
  if(!item_name) return toast('Item name is required','error');
  const existing = await DB.getItemByCode(item_id);
  if(existing && existing.id!==id) return toast(`Item ID "${item_id}" already in use`,'error');
  await DB.updateItem(id,{item_id, item_name, dry_clean_price, wash_press_price, wash_dry_price, description});
  await DB.logAction('Edit Item', `Updated catalog item "${item_name}" (${item_id})`, { code: item_id, name: item_name, dry_clean_price, wash_press_price, wash_dry_price }, 'Item');
  hideModal('edit-item-modal');
  toast('Item updated!');
  renderItems();
}

async function deleteItemConfirm(id) {
  if(!requireAdmin()) return;
  const item=await DB.getItem(id);
  confirmDialog(`Delete item "${item?.item_name}"?`, async()=>{
    await DB.deleteItem(id);
    await DB.logAction('Delete Item', `Deleted catalog item "${item?.item_name}" (${item?.item_id})`, { code: item?.item_id, name: item?.item_name }, 'Item');
    toast('Item deleted'); renderItems();
  });
}

// ─────────────────────────────────────────────
// PRINT CATALOG
// ─────────────────────────────────────────────
async function printItemsCatalog() {
  showProcessingOverlay('Preparing Catalog', 'Fetching item list and formatting...');
  try {
    const [allItems, companyName, logoData, address, phone, email] = await Promise.all([
      DB.getItems(), DB.getSetting('company_name'), DB.getSetting('logo_data'),
      DB.getSetting('address'), DB.getSetting('phone'), DB.getSetting('email')
    ]);
    const sorted    = allItems.sort((a,b)=>(a.item_id||'').localeCompare(b.item_id||''));
    const printDate = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
    const company   = companyName||'Sagacious Washing Center';
    const logoHTML  = logoData
      ? `<img src="${logoData}" style="height:52px;width:auto;object-fit:contain;border-radius:8px;"/>`
      : `<div style="height:52px;width:52px;border-radius:8px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.3em;">SW</div>`;
    const half=Math.ceil(sorted.length/2);
    const fmt=v=>Number(v||0).toLocaleString('en-LK',{minimumFractionDigits:2});
    const buildRows=items=>items.map((item,idx)=>`
      <tr style="background:${idx%2===0?'#fff':'#f8fafc'};">
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:0.82em;font-weight:600;">${item.item_name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:0.82em;color:#7c3aed;">${fmt(item.dry_clean_price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:0.82em;color:#0369a1;">${fmt(item.wash_press_price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:0.82em;color:#16a34a;">${fmt(item.wash_dry_price)}</td>
      </tr>`).join('');
    const thead=`<thead>
      <tr style="background:#1a4d8f;color:#fff;">
        <th style="padding:7px 8px;text-align:left;font-size:0.75em;text-transform:uppercase;" rowspan="2">Item Name</th>
        <th colspan="3" style="padding:7px 8px;text-align:center;font-size:0.75em;text-transform:uppercase;border-left:1px solid rgba(255,255,255,0.2);">Price (LKR)</th>
      </tr>
      <tr style="background:#1e3a6e;color:#fff;">
        <th style="padding:5px 8px;text-align:right;font-size:0.72em;border-left:1px solid rgba(255,255,255,0.2);">Dry Clean</th>
        <th style="padding:5px 8px;text-align:right;font-size:0.72em;">Wash &amp; Press</th>
        <th style="padding:5px 8px;text-align:right;font-size:0.72em;">Wash &amp; Dry</th>
      </tr></thead>`;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Items Catalog</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;padding:24px 28px;}
    @media print{body{padding:0;}@page{margin:12mm 10mm;size:A4;}}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e2e8f0;">
      <div style="display:flex;align-items:center;gap:12px;">${logoHTML}
        <div><div style="font-family:'Playfair Display',serif;font-size:1.3em;font-weight:700;color:#1a4d8f;">${company}</div>
        <div style="font-size:0.78em;color:#64748b;margin-top:3px;">Laundry Management System</div></div>
      </div>
      <div style="text-align:right;font-size:0.8em;color:#64748b;line-height:1.7;">
        ${phone?`<div>${phone}</div>`:''}${address?`<div>${address}</div>`:''}${email?`<div>${email}</div>`:''}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-family:'Playfair Display',serif;font-size:1.15em;font-weight:700;">Items Catalog</div>
      <div style="font-size:0.75em;color:#94a3b8;">Printed: ${printDate} · ${sorted.length} item${sorted.length!==1?'s':''}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">${thead}<tbody>${buildRows(sorted.slice(0,half))}</tbody></table>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">${thead}<tbody>${sorted.slice(half).length?buildRows(sorted.slice(half)):'<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8;">—</td></tr>'}</tbody></table>
    </div>
    <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:0.72em;color:#94a3b8;">
      <span>${company} — Items Catalog</span><span>Generated on ${printDate}</span>
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
    <script>window.onload=()=>window.print();<\/script></body></html>`;
    const w=window.open('','_blank');
    if(!w) {
      hideProcessingOverlay();
      return toast('Allow pop-ups to print','warning');
    }
    w.document.write(html); w.document.close();
  } catch (err) {
    toast('Error printing catalog: ' + (err.message || err), 'error');
  } finally {
    hideProcessingOverlay();
  }
}

// ─────────────────────────────────────────────
// BACKUP & IMPORT
// ─────────────────────────────────────────────
async function exportItems() {
  const allItems=await DB.getItems();
  const data={type:'swc_items_backup',version:2,exported_at:new Date().toISOString(),count:allItems.length,
    items:allItems.map(i=>({item_id:i.item_id,item_name:i.item_name,description:i.description||'',
      dry_clean_price:i.dry_clean_price||0,wash_press_price:i.wash_press_price||0,wash_dry_price:i.wash_dry_price||0}))};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download=`swc_items_${new Date().toISOString().slice(0,10)}.json`; a.click();
  toast(`Exported ${allItems.length} items`,'success');
}

async function importItems(input) {
  if(!requireAdmin()) return;
  const file=input.files[0]; if(!file) return; input.value='';
  try {
    const data=JSON.parse(await file.text());
    if(data.type!=='swc_items_backup') return toast('Invalid backup file','error');
    const records=data.items||[];
    if(!records.length) return toast('No items found in file','warning');
    confirmDialog(`Import ${records.length} items? Existing items (matched by Item ID) will be updated.`, async()=>{
      const existing=await DB.getItems();
      const map=Object.fromEntries(existing.map(i=>[i.item_id,i]));
      let added=0,updated=0,errors=0;
      for(const rec of records){
        try {
          const p={item_name:rec.item_name,description:rec.description||'',
            dry_clean_price:rec.dry_clean_price||0,wash_press_price:rec.wash_press_price||0,wash_dry_price:rec.wash_dry_price||0};
          if(map[rec.item_id]){await DB.updateItem(map[rec.item_id].id,p);updated++;}
          else{await DB.addItem({item_id:rec.item_id,...p});added++;}
        }catch(e){errors++;console.error(e);}
      }
      renderItems();
      toast(`Import done: ${added} added, ${updated} updated`+(errors?`, ${errors} failed`:''),'success');
    });
  }catch(e){toast('Failed to read file: '+(e.message||e),'error');}
}

// ─────────────────────────────────────────────
// DEFAULT TERMS & CONDITIONS MODAL
// ─────────────────────────────────────────────
async function showDefaultTermsModal() {
  const currentTerms = await DB.getSetting('quotation_terms') || 
    "- Free pick-up and delivery for orders exceeding Rs 3,000.00\n- Contact instruction for pricing queries";

  createModal('default-terms-modal', 'Default Terms & Conditions (Quotation Footer Notes)', `
    <div class="form-group">
      <label class="form-label">Default Terms and Conditions *</label>
      <textarea class="form-input" id="dt-terms" rows="6" style="font-family:inherit;line-height:1.5;">${currentTerms}</textarea>
      <span style="font-size:0.8em;color:var(--text-muted);margin-top:6px;display:block;">This text will be used as the default FOOTER NOTES when generating any new service quotation. Users can also edit it per quotation.</span>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
      <button class="btn btn-secondary" onclick="hideModal('default-terms-modal')">Cancel [Esc]</button>
      <button class="btn btn-primary" onclick="saveDefaultTerms()"><i class="fas fa-save"></i> Save Terms [Enter]</button>
    </div>
  `, 'modal-md');
  showModal('default-terms-modal');
}

async function saveDefaultTerms() {
  const text = document.getElementById('dt-terms').value.trim();
  await DB.setSetting('quotation_terms', text);
  hideModal('default-terms-modal');
  toast('Default Terms & Conditions saved!');
}

// ─────────────────────────────────────────────
// QUOTATIONS GENERATED HISTORY
// ─────────────────────────────────────────────
async function _refreshQuotationsHistoryTable() {
  const tbody = document.getElementById('quotations-history-table-body');
  if (!tbody) return;
  const history = await DB.getQuotations();
  if (!history || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);"><div style="font-size:1.8em;margin-bottom:6px;">📄</div>No quotations generated yet</td></tr>`;
    return;
  }
  tbody.innerHTML = history.map((q, idx) => `
    <tr>
      <td><span style="font-weight:600;color:var(--text-muted);">${idx + 1}</span></td>
      <td><span style="font-family:monospace;font-weight:700;color:var(--primary);background:var(--bg);padding:3px 8px;border-radius:4px;border:1px solid var(--border);">${q.quote_id}</span></td>
      <td><strong>${q.customer_name || 'General Client'}</strong></td>
      <td>${q.issued_date || '—'}</td>
      <td>${q.valid_until || '—'}</td>
      <td style="text-align:right;">
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="viewQuotationFromHistory('${q.quote_id}')" title="View"><i class="fas fa-eye"></i> View</button>
          <button class="btn btn-primary btn-sm" onclick="printQuotationFromHistory('${q.quote_id}')" title="Print"><i class="fas fa-print"></i> Print</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuotationFromHistory('${q.quote_id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function viewQuotationFromHistory(quoteId) {
  const q = await DB.getQuotation(quoteId);
  if (!q) return toast('Quotation not found', 'error');
  renderQuotationView(q);
}

async function printQuotationFromHistory(quoteId) {
  const q = await DB.getQuotation(quoteId);
  if (!q) return toast('Quotation not found', 'error');
  await renderQuotationView(q);
  printQuotationView();
}

async function deleteQuotationFromHistory(quoteId) {
  confirmDialog(`Delete quotation "${quoteId}" from history?`, async () => {
    await DB.deleteQuotation(quoteId);
    await DB.logAction('Delete Quotation', `Deleted quotation ${quoteId}`, { quote_id: quoteId }, 'Quotation');
    toast('Quotation deleted from history');
    await _refreshQuotationsHistoryTable();
  });
}

// ─────────────────────────────────────────────
// CUSTOMER QUOTATION GENERATOR
// ─────────────────────────────────────────────

const QUOTATION_ITEM_ORDER = [
  "Bed Sheet (L)",
  "Bed Sheet (S)",
  "Duvet Cover (L)",
  "Duvet Cover (S)",
  "Bed Cover (L)",
  "Bed Cover (S)",
  "Bed Runner",
  "Pillow Case",
  "Blanket",
  "Matress Protector (L)",
  "Matress Protector (S)",
  "Bath Mat",
  "Bath Robe",
  "Bath Towel",
  "Hand Towel",
  "Face Towel",
  "Pool Towel",
  "Mosquito Net (L)",
  "Mosquito Net (S)",
  "Curtain (1kg)",
  "Curtain - Lase (1kg)",
  "Floor Mat",
  "Shower Curtain",
  "Serviette",
  "Table Mat",
  "Table Cloth(L)",
  "Table Cloth(S)",
  "Tray Cloth",
  "Glass Cloth",
  "Chair Cover",
  "Chair Bow",
  "Buffet cloth (Frill)",
  "Saree",
  "Jacket",
  "Jacket - Dry clean",
  "Saree (Kandyan)",
  "Shirt",
  "Sarong",
  "Trouser",
  "Short",
  "Blouse",
  "T Shirt",
  "Tie - Dry clean",
  "Cushion Cover (XL)",
  "Cushion Cover (L)",
  "Cushion Cover (M)",
  "Cushion Cover (S)",
  "Duster",
  "Chef Coat",
  "Cook Coat",
  "Apron",
  "Cap",
  "Overall"
];

let currentQuotationItems = [];

async function showGenerateQuotationModal() {
  const [customers, allCatalogItems, defaultTerms] = await Promise.all([
    DB.getCustomers(),
    DB.getItems(),
    DB.getSetting('quotation_terms')
  ]);
  const sortedCust = customers.sort((a,b)=>(a.hotel_name||'').localeCompare(b.hotel_name||''));
  
  const todayStr = new Date().toISOString().slice(0,10);
  const validUntilStr = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);
  const initialQuoteId = await DB.generateQuotationId(todayStr);

  const custOptions = `<option value="">-- Custom Client / Any Client --</option>` +
    sortedCust.map(c => `<option value="${c.id}">${c.hotel_name}${c.contact_person ? ' (' + c.contact_person + ')' : ''}</option>`).join('');

  // Build items directly from catalog in items table
  const sortedCatalogItems = [...allCatalogItems].sort((a,b)=>(a.item_id||'').localeCompare(b.item_id||''));

  currentQuotationItems = sortedCatalogItems.map((item, idx) => {
    return {
      id: idx + 1,
      catalog_id: item.id,
      item_code: item.item_id,
      name: item.item_name,
      included: true,
      dry_clean: item.dry_clean_price || 0,
      wash_press: item.wash_press_price || 0,
      wash_dry: item.wash_dry_price || 0
    };
  });

  const termsText = defaultTerms || "- Free pick-up and delivery for orders exceeding Rs 3,000.00\n- Contact instruction for pricing queries";

  createModal('gen-quotation-modal', 'Generate Service Quotation', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">Select Saved Customer</label>
        <select class="form-input" id="gq-customer-id" onchange="onQuotationCustomerChange(this.value)">
          ${custOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Client Name * (Editable for Any Client)</label>
        <input class="form-input" id="gq-client-name" value=""/>
      </div>
      <div class="form-group">
        <label class="form-label">Quotation ID (Auto-generated)</label>
        <input class="form-input" id="gq-quote-id" value="${initialQuoteId}" readonly style="background:var(--bg);cursor:not-allowed;font-family:monospace;font-weight:700;"/>
      </div>
      <div class="form-group">
        <label class="form-label">Issued Date *</label>
        <input type="date" class="form-input" id="gq-date" value="${todayStr}" onchange="onQuotationDateChange(this.value)"/>
      </div>
      <div class="form-group">
        <label class="form-label">Valid Until *</label>
        <input type="date" class="form-input" id="gq-valid-until" value="${validUntilStr}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Issued By (Name &amp; Designation)</label>
        <input class="form-input" id="gq-issued-by" value="Manager - Sagacious Washing Center"/>
      </div>
    </div>

    <!-- ITEMS & PRICING TABLE -->
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <label class="form-label" style="font-weight:700;font-size:0.95em;margin:0;">Item Prices &amp; Selection (LKR)</label>
          <span style="font-size:0.78em;color:var(--text-muted);display:block;">Check/uncheck items or edit prices specifically for this quotation.</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="addCustomQuotationItemRow()"><i class="fas fa-plus"></i> Add Item Row</button>
      </div>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85em;">
          <thead style="position:sticky;top:0;background:var(--card-bg);z-index:2;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <tr style="border-bottom:1px solid var(--border);background:var(--bg);">
              <th style="padding:8px;text-align:center;width:40px;">No.</th>
              <th style="padding:8px;text-align:center;width:40px;">Inc.</th>
              <th style="padding:8px;text-align:left;">Item Name</th>
              <th style="padding:8px;text-align:right;width:110px;">Dry Clean</th>
              <th style="padding:8px;text-align:right;width:110px;">Wash &amp; Press</th>
              <th style="padding:8px;text-align:right;width:110px;">Wash &amp; Dry</th>
              <th style="padding:8px;text-align:center;width:45px;"></th>
            </tr>
          </thead>
          <tbody id="gq-items-tbody">
            ${_renderQuotationModalItemRows()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- FOOTER NOTES EDITOR -->
    <div style="margin-top:16px;">
      <label class="form-label">Footer Notes &amp; Terms (Editable per quotation)</label>
      <textarea class="form-input" id="gq-footer-notes" rows="3" style="font-family:inherit;font-size:0.88em;">${termsText}</textarea>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('gen-quotation-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="processGenerateQuotation()"><i class="fas fa-file-invoice"></i> Save &amp; Preview Quotation</button>
    </div>
  `, 'modal-xl');
  showModal('gen-quotation-modal');
}

async function onQuotationCustomerChange(custId) {
  const clientInput = document.getElementById('gq-client-name');
  const allCatalogItems = await DB.getItems();
  const catalogMap = {};
  allCatalogItems.forEach(i => catalogMap[i.id] = i);

  if (!custId) {
    if (clientInput) clientInput.value = '';
    // Reset item prices to catalog defaults
    currentQuotationItems.forEach(item => {
      const catItem = catalogMap[item.catalog_id];
      if (catItem) {
        item.dry_clean = catItem.dry_clean_price || 0;
        item.wash_press = catItem.wash_press_price || 0;
        item.wash_dry = catItem.wash_dry_price || 0;
      }
    });
    const tbody = document.getElementById('gq-items-tbody');
    if (tbody) tbody.innerHTML = _renderQuotationModalItemRows();
    return;
  }

  const customer = await DB.getCustomer(custId);
  if (!customer) return;
  if (clientInput) clientInput.value = customer.hotel_name || '';

  const customPrices = customer.custom_prices || {};

  currentQuotationItems.forEach(item => {
    const catItem = catalogMap[item.catalog_id];
    if (catItem) {
      const custPrice = customPrices[catItem.id];
      if (custPrice) {
        item.dry_clean = (custPrice.dry_clean != null && custPrice.dry_clean !== '') ? parseFloat(custPrice.dry_clean) : (catItem.dry_clean_price || 0);
        item.wash_press = (custPrice.wash_press != null && custPrice.wash_press !== '') ? parseFloat(custPrice.wash_press) : (catItem.wash_press_price || 0);
        item.wash_dry = (custPrice.wash_dry != null && custPrice.wash_dry !== '') ? parseFloat(custPrice.wash_dry) : (catItem.wash_dry_price || 0);
      } else {
        item.dry_clean = catItem.dry_clean_price || 0;
        item.wash_press = catItem.wash_press_price || 0;
        item.wash_dry = catItem.wash_dry_price || 0;
      }
    }
  });

  const tbody = document.getElementById('gq-items-tbody');
  if (tbody) tbody.innerHTML = _renderQuotationModalItemRows();
}

async function onQuotationDateChange(dateStr) {
  const quoteIdInput = document.getElementById('gq-quote-id');
  if (quoteIdInput && dateStr) {
    const newQuoteId = await DB.generateQuotationId(dateStr);
    quoteIdInput.value = newQuoteId;
  }
}

function _renderQuotationModalItemRows() {
  return currentQuotationItems.map((item, idx) => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="text-align:center;padding:6px;font-weight:600;color:var(--text-muted);">${idx + 1}</td>
      <td style="text-align:center;padding:6px;">
        <input type="checkbox" ${item.included ? 'checked' : ''} onchange="currentQuotationItems[${idx}].included=this.checked"/>
      </td>
      <td style="padding:6px;">
        <input class="form-input" value="${item.name.replace(/"/g, '&quot;')}" style="padding:4px 8px;font-size:0.9em;" onchange="currentQuotationItems[${idx}].name=this.value"/>
      </td>
      <td style="padding:6px;text-align:right;">
        <input type="number" step="1" min="0" class="form-input" value="${item.dry_clean || ''}" placeholder="0" style="padding:4px 8px;text-align:right;font-size:0.9em;" onchange="currentQuotationItems[${idx}].dry_clean=parseFloat(this.value)||0"/>
      </td>
      <td style="padding:6px;text-align:right;">
        <input type="number" step="1" min="0" class="form-input" value="${item.wash_press || ''}" placeholder="0" style="padding:4px 8px;text-align:right;font-size:0.9em;" onchange="currentQuotationItems[${idx}].wash_press=parseFloat(this.value)||0"/>
      </td>
      <td style="padding:6px;text-align:right;">
        <input type="number" step="1" min="0" class="form-input" value="${item.wash_dry || ''}" placeholder="0" style="padding:4px 8px;text-align:right;font-size:0.9em;" onchange="currentQuotationItems[${idx}].wash_dry=parseFloat(this.value)||0"/>
      </td>
      <td style="text-align:center;padding:6px;">
        <button class="btn btn-danger btn-sm" onclick="removeQuotationModalItemRow(${idx})" style="padding:3px 7px;"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function removeQuotationModalItemRow(idx) {
  currentQuotationItems.splice(idx, 1);
  const tbody = document.getElementById('gq-items-tbody');
  if (tbody) tbody.innerHTML = _renderQuotationModalItemRows();
}

function addCustomQuotationItemRow() {
  currentQuotationItems.push({
    id: Date.now(),
    name: 'New Custom Item',
    catalog_id: null,
    included: true,
    dry_clean: 0,
    wash_press: 0,
    wash_dry: 0
  });
  const tbody = document.getElementById('gq-items-tbody');
  if (tbody) tbody.innerHTML = _renderQuotationModalItemRows();
}

async function processGenerateQuotation() {
  const custId = document.getElementById('gq-customer-id').value;
  const clientName = document.getElementById('gq-client-name').value.trim() || 'General Client';
  const quoteId = document.getElementById('gq-quote-id').value.trim() || 'QUO-0010826';
  const rawDate = document.getElementById('gq-date').value;
  const rawValidUntil = document.getElementById('gq-valid-until').value;
  const footerNotes = document.getElementById('gq-footer-notes').value.trim();
  const issuedBy = document.getElementById('gq-issued-by').value.trim();

  const quoteDate = formatDate(rawDate);
  const validUntil = formatDate(rawValidUntil);

  // Filter only included items
  const includedItems = currentQuotationItems.filter(i => i.included && i.name.trim() !== '').map(i => ({
    name: i.name.trim(),
    dry_clean: parseFloat(i.dry_clean) || 0,
    wash_press: parseFloat(i.wash_press) || 0,
    wash_dry: parseFloat(i.wash_dry) || 0
  }));

  if (includedItems.length === 0) {
    return toast('Please include at least one item in the quotation', 'error');
  }

  const quoteData = {
    quote_id: quoteId,
    customer_id: custId || null,
    customer_name: clientName,
    issued_date: quoteDate,
    raw_date: rawDate,
    valid_until: validUntil,
    raw_valid_until: rawValidUntil,
    footer_notes: footerNotes,
    issued_by: issuedBy,
    items: includedItems,
    created_at: new Date().toISOString()
  };

  await DB.saveQuotation(quoteData);
  await DB.logAction('Generate Quotation', `Generated quotation ${quoteId} for ${clientName}`, { quote_id: quoteId, client: clientName }, 'Quotation');

  hideModal('gen-quotation-modal');
  toast(`Quotation ${quoteId} generated!`);
  
  await _refreshQuotationsHistoryTable();
  await renderQuotationView(quoteData);
}

async function renderQuotationView(quoteData) {
  const [companyName, logoData, address, phone, email] = await Promise.all([
    DB.getSetting('company_name'),
    DB.getSetting('logo_data'),
    DB.getSetting('address'),
    DB.getSetting('phone'),
    DB.getSetting('email')
  ]);

  const company = companyName || 'Sagacious Washing Center';
  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:56px;width:auto;object-fit:contain;border-radius:8px;"/>`
    : `<div style="height:56px;width:56px;border-radius:8px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.4em;font-weight:700;">SW</div>`;

  const rowsHTML = (quoteData.items || []).map((item, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:0.88em;font-weight:600;text-align:center;color:#64748b;">${idx + 1}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:0.88em;font-weight:600;color:#1e293b;">${item.name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:0.88em;font-weight:600;color:#7c3aed;">${item.dry_clean > 0 ? formatCurrency(item.dry_clean) : '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:0.88em;font-weight:600;color:#0369a1;">${item.wash_press > 0 ? formatCurrency(item.wash_press) : '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:0.88em;font-weight:600;color:#16a34a;">${item.wash_dry > 0 ? formatCurrency(item.wash_dry) : '—'}</td>
    </tr>
  `).join('');

  const notesLines = (quoteData.footer_notes || '').split('\n').filter(l => l.trim() !== '');
  const notesHTML = notesLines.map(line => `<li style="margin-bottom:4px;">${line.replace(/^-\s*/, '')}</li>`).join('');

  const quotationHTML = `
    <div id="quotation-print-area" style="position:relative;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;max-width:780px;margin:0 auto;padding:36px 40px;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      
      <!-- LETTERHEAD -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:2px solid #1a4d8f;">
        <div style="display:flex;align-items:center;gap:14px;">
          ${logoHTML}
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.55em;font-weight:700;color:#1a4d8f;line-height:1.2;">${company}</div>
            ${address ? `<div style="font-size:0.82em;color:#64748b;margin-top:4px;">${address}</div>` : ''}
            <div style="font-size:0.82em;color:#64748b;margin-top:2px;">${[phone, email].filter(Boolean).join(' | ')}</div>
          </div>
        </div>
      </div>

      <!-- DOCUMENT TITLE -->
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:800;color:#1a4d8f;letter-spacing:1px;text-transform:uppercase;margin:0;">Service Quotation</h2>
      </div>

      <!-- HEADER SECTION -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9em;">
        <div>
          <div style="margin-bottom:6px;"><strong style="color:#64748b;display:inline-block;width:130px;">Customer Name :</strong> <span style="font-weight:700;color:#1e293b;">${quoteData.customer_name || 'General Client'}</span></div>
          <div><strong style="color:#64748b;display:inline-block;width:130px;">Issued Date :</strong> <span style="font-weight:600;color:#1e293b;">${quoteData.issued_date}</span></div>
        </div>
        <div>
          <div style="margin-bottom:6px;"><strong style="color:#64748b;display:inline-block;width:110px;">Quote ID :</strong> <span style="font-weight:700;color:#1a4d8f;font-family:monospace;letter-spacing:0.5px;">${quoteData.quote_id}</span></div>
          <div><strong style="color:#64748b;display:inline-block;width:110px;">Valid Until :</strong> <span style="font-weight:600;color:#1e293b;">${quoteData.valid_until}</span></div>
        </div>
      </div>

      <!-- PRICING TABLE -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;border:1px solid #e2e8f0;">
        <thead>
          <tr style="background:#1a4d8f;color:#fff;">
            <th rowspan="2" style="padding:10px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;letter-spacing:0.8px;width:45px;">No</th>
            <th rowspan="2" style="padding:10px 12px;text-align:left;font-size:0.82em;text-transform:uppercase;letter-spacing:0.8px;">Items</th>
            <th colspan="3" style="padding:8px 12px;text-align:center;font-size:0.82em;text-transform:uppercase;letter-spacing:0.8px;border-left:1px solid rgba(255,255,255,0.2);">Price (LKR)</th>
          </tr>
          <tr style="background:#1e3a6e;color:#fff;">
            <th style="padding:6px 10px;text-align:right;font-size:0.75em;text-transform:uppercase;border-left:1px solid rgba(255,255,255,0.2);">Dry Clean</th>
            <th style="padding:6px 10px;text-align:right;font-size:0.75em;text-transform:uppercase;">Wash &amp; Press</th>
            <th style="padding:6px 10px;text-align:right;font-size:0.75em;text-transform:uppercase;">Wash &amp; Dry</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <!-- FOOTER NOTES -->
      <div style="background:#f1f5f9;border-left:4px solid #1a4d8f;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:28px;font-size:0.86em;color:#334155;line-height:1.6;">
        <div style="font-weight:700;margin-bottom:6px;color:#1e293b;text-transform:uppercase;font-size:0.8em;letter-spacing:0.5px;">Notes &amp; Terms:</div>
        <ul style="margin:0;padding-left:22px;list-style-type:disc;">
          ${notesHTML}
        </ul>
      </div>

      <!-- ISSUED BY / SIGNATURE BLOCK -->
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:40px;margin-bottom:20px;padding-top:10px;">
        <div>
          <div style="border-bottom:1.5px dotted #64748b;width:220px;margin-bottom:8px;"></div>
          <div style="font-size:0.88em;font-weight:600;color:#1e293b;">${quoteData.issued_by || 'Manager - Sagacious Washing Center'}</div>
        </div>
      </div>

      <!-- CLOSING LINE -->
      <div style="text-align:center;font-family:'Playfair Display',serif;font-size:1.05em;font-weight:700;color:#1a4d8f;margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;">
        Thank You for choosing ${company}!
      </div>
    </div>
  `;

  createModal('view-quotation-modal', `Service Quotation — ${quoteData.quote_id}`, `
    ${quotationHTML}
    <div class="no-print" style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('view-quotation-modal')">Close [Esc]</button>
      <button class="btn btn-primary" onclick="printQuotationView()"><i class="fas fa-print"></i> Print / Export PDF</button>
    </div>`, 'modal-xl');
  showModal('view-quotation-modal');
}

function printQuotationView() {
  const content = document.getElementById('quotation-print-area');
  if (!content) return;
  showProcessingOverlay('Preparing Quotation', 'Formatting print document...');
  try {
    const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Service Quotation</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;padding:24px;}
      @media print{
        body{padding:0;}
        @page{margin:10mm 10mm;size:A4;}
      }
    </style></head><body>
    ${content.outerHTML}
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      hideProcessingOverlay();
      return toast('Please allow pop-ups to print PDF', 'warning');
    }
    w.document.write(printHTML);
    w.document.close();
  } finally {
    hideProcessingOverlay();
  }
}

