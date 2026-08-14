// settings.js - Settings Module

async function renderSettings() {
  document.getElementById('page-title').textContent = 'Settings';
  const [companyName, address, phone, email, invPrefix, footer, darkMode, textSize, minDiscountAmt, deliveryCharge, showUndo, geminiApiKey, aiProvider, showAIFab] = await Promise.all([
    DB.getSetting('company_name'), DB.getSetting('address'), DB.getSetting('phone'),
    DB.getSetting('email'), DB.getSetting('invoice_prefix'),
    DB.getSetting('footer_message'), DB.getSetting('dark_mode'), DB.getSetting('text_size'),
    DB.getSetting('min_discount_amount'), DB.getSetting('delivery_charge'),
    DB.getSetting('show_undo_button'), DB.getSetting('gemini_api_key'),
    DB.getSetting('ai_provider'), DB.getSetting('show_saga_ai_button')
  ]);
  const logoData = await DB.getSetting('logo_data');
  const isUndoVisible = showUndo !== 'false';
  const isAIFabVisible = showAIFab !== 'false';

  // Staff & Driver see only Appearance (Text size, Dark/Light mode)
  // Admin sees everything
  if (!isAdmin()) {
    document.getElementById('content').innerHTML = `
      <div class="section-header"><span class="section-title">Settings</span></div>
      <div style="max-width:600px;">

        <!-- Appearance -->
        <div class="card">
          <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
            <i class="fas fa-palette" style="color:var(--primary);margin-right:8px;"></i>Appearance
          </div>
          <div class="form-group">
            <label class="form-label">Text Size</label>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px;">
              ${['sm','md','lg','xl'].map(s => `<button class="btn ${textSize===s?'btn-primary':'btn-secondary'}" onclick="setTextSize('${s}')" id="ts-${s}">${{sm:'Small',md:'Medium',lg:'Large',xl:'XL'}[s]}</button>`).join('')}
            </div>
          </div>
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">Dark Mode</label>
            <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
              <label class="toggle">
                <input type="checkbox" id="dark-toggle" ${darkMode==='true'?'checked':''} onchange="toggleDarkFromSettings(this.checked)"/>
                <span class="toggle-slider"></span>
              </label>
              <span id="dark-mode-label" style="font-size:0.9em;">${darkMode==='true'?'Dark Mode':'Light Mode'}</span>
            </div>
          </div>
        </div>

      </div>`;
    return;
  }

  // Admin — full settings
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <span class="section-title">Settings</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">

      <!-- Company Info -->
      <div class="card" style="grid-column:1/-1;">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-building" style="color:var(--primary);margin-right:8px;"></i>Company Information
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group"><label class="form-label">Company Name</label>
            <input class="form-input" id="s-company" value="${companyName||''}"/></div>
          <div class="form-group"><label class="form-label">Phone</label>
            <input class="form-input" id="s-phone" value="${phone||''}"/></div>
          <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Address</label>
            <input class="form-input" id="s-address" value="${address||''}"/></div>
          <div class="form-group"><label class="form-label">Email</label>
            <input class="form-input" id="s-email" value="${email||''}"/></div>
          <div class="form-group"><label class="form-label">Invoice Prefix</label>
            <input class="form-input" id="s-prefix" value="${invPrefix||'INV'}"/></div>
          <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Invoice Footer Message</label>
            <input class="form-input" id="s-footer" value="${footer||''}"/></div>
        </div>
        <button class="btn btn-primary" onclick="saveCompanySettings()"><i class="fas fa-save"></i> Save Company Info</button>
      </div>

      <!-- Billing Settings -->
      <div class="card" style="grid-column:1/-1;">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-sliders-h" style="color:var(--primary);margin-right:8px;"></i>Billing Settings
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group">
            <label class="form-label">Minimum Order Amount for Discount (LKR)</label>
            <input type="number" class="form-input" id="s-min-discount" value="${minDiscountAmt||'30000'}" min="0" step="100"/>
            <span style="font-size:0.78em;color:var(--text-muted);">Discount option only appears on bills ≥ this amount</span>
          </div>
          <div class="form-group">
            <label class="form-label">Default Delivery Charge (LKR)</label>
            <input type="number" class="form-input" id="s-delivery-charge" value="${deliveryCharge||'0'}" min="0" step="0.01"/>
            <span style="font-size:0.78em;color:var(--text-muted);">Pre-filled in invoice generator (editable per bill)</span>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveBillingSettings()"><i class="fas fa-save"></i> Save Billing Settings
      </div>

      <!-- Appearance -->
      <div class="card">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-palette" style="color:var(--primary);margin-right:8px;"></i>Appearance
        </div>
        <div class="form-group">
          <label class="form-label">Text Size</label>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px;">
            ${['sm','md','lg','xl'].map(s => `<button class="btn ${textSize===s?'btn-primary':'btn-secondary'}" onclick="setTextSize('${s}')" id="ts-${s}">${{sm:'Small',md:'Medium',lg:'Large',xl:'XL'}[s]}</button>`).join('')}
          </div>
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Dark Mode</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <label class="toggle">
              <input type="checkbox" id="dark-toggle" ${darkMode==='true'?'checked':''} onchange="toggleDarkFromSettings(this.checked)"/>
              <span class="toggle-slider"></span>
            </label>
            <span id="dark-mode-label" style="font-size:0.9em;">${darkMode==='true'?'Dark Mode':'Light Mode'}</span>
          </div>
        </div>
        <div class="form-group" style="margin-top:16px; border-top:1.5px dashed var(--border); padding-top:12px;">
          <label class="form-label">Show Undo Payment Button</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <label class="toggle">
              <input type="checkbox" id="undo-toggle" ${isUndoVisible?'checked':''} onchange="toggleUndoFromSettings(this.checked)"/>
              <span class="toggle-slider"></span>
            </label>
            <span id="undo-toggle-label" style="font-size:0.9em;">${isUndoVisible?'Visible':'Hidden'}</span>
          </div>
        <div class="form-group" style="margin-top:16px; border-top:1.5px dashed var(--border); padding-top:12px;">
          <label class="form-label">Show SAGA AI Floating Button</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <label class="toggle">
              <input type="checkbox" class="ai-fab-toggle" ${isAIFabVisible?'checked':''} onchange="toggleAIFabFromSettings(this.checked)"/>
              <span class="toggle-slider"></span>
            </label>
            <span class="ai-fab-toggle-label" style="font-size:0.9em;">${isAIFabVisible?'Visible':'Hidden'}</span>
          </div>
        </div>
      </div>

      <!-- Logo -->
      <div class="card">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-image" style="color:var(--primary);margin-right:8px;"></i>App Logo
        </div>
        <div style="margin-bottom:14px;">
          ${logoData
            ? `<img src="${logoData}" style="width:80px;height:80px;border-radius:14px;object-fit:cover;border:2px solid var(--border);"/>`
            : `<div style="width:80px;height:80px;border-radius:14px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2em;"><i class="fas fa-soap"></i></div>`}
        </div>
        <div class="form-group">
          <label class="form-label">Upload Logo</label>
          <input type="file" class="form-input" id="logo-upload" accept="image/*" onchange="handleLogoUpload(event)" style="padding:6px;"/>
        </div>
        ${logoData ? `<button class="btn btn-danger btn-sm" onclick="removeLogo()"><i class="fas fa-trash"></i> Remove Logo</button>` : ''}
      </div>

      <!-- Users (admin only) -->
      <div class="card" style="grid-column:1/-1;">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-users" style="color:var(--primary);margin-right:8px;"></i>User Management
        </div>
        <div id="users-section"></div>
        <button class="btn btn-primary btn-sm" onclick="showAddUserModal()" style="margin-top:14px;">
          <i class="fas fa-plus"></i> Add User
        </button>
      </div>

      <!-- Database -->
      <div class="card" style="grid-column:1/-1;">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-database" style="color:var(--primary);margin-right:8px;"></i>Database Management
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div class="card" style="border:1.5px solid var(--border);padding:16px;">
            <div style="font-weight:700;margin-bottom:6px;"><i class="fas fa-download" style="color:var(--success);"></i> Export Database</div>
            <div style="font-size:0.83em;color:var(--text-muted);margin-bottom:12px;">Download full backup as JSON</div>
            <button class="btn btn-success btn-sm" style="width:100%;justify-content:center;" onclick="exportDatabase()">Export</button>
          </div>
          <div class="card" style="border:1.5px solid var(--border);padding:16px;">
            <div style="font-weight:700;margin-bottom:6px;"><i class="fas fa-upload" style="color:var(--info);"></i> Import Database</div>
            <div style="font-size:0.83em;color:var(--text-muted);margin-bottom:12px;">Restore from JSON backup</div>
            <input type="file" id="db-import-file" accept=".json" style="display:none;" onchange="importDatabase(event)"/>
            <button class="btn btn-accent btn-sm" style="width:100%;justify-content:center;" onclick="document.getElementById('db-import-file').click()">Import</button>
          </div>
          <div class="card" style="border:1.5px solid var(--border);padding:16px;">
            <div style="font-weight:700;margin-bottom:6px;"><i class="fas fa-cloud-upload-alt" style="color:var(--primary);"></i> Upload to Cloud</div>
            <div style="font-size:0.83em;color:var(--text-muted);margin-bottom:12px;">Push database to server endpoint</div>
            <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;" onclick="uploadToCloud()">Upload</button>
          </div>
          <div class="card" style="border:1.5px solid var(--border);padding:16px;">
            <div style="font-weight:700;margin-bottom:6px;"><i class="fas fa-cloud-download-alt" style="color:var(--accent);"></i> Import from Cloud</div>
            <div style="font-size:0.83em;color:var(--text-muted);margin-bottom:12px;">Fetch and restore from server</div>
            <button class="btn btn-accent btn-sm" style="width:100%;justify-content:center;" onclick="importFromCloud()">Import</button>
          </div>
          <div class="card" style="border:1.5px dashed var(--danger);padding:16px;background:rgba(239,68,68,0.03);">
            <div style="font-weight:700;margin-bottom:6px;color:var(--danger);">
              <i class="fas fa-exclamation-triangle"></i> Reset Database
            </div>
            <div style="font-size:0.83em;color:var(--text-muted);margin-bottom:12px;">Clear all data (irreversible)</div>
            <button class="btn btn-danger btn-sm" style="width:100%;justify-content:center;" onclick="resetDatabase()">Reset All Data</button>
          </div>
        </div>
      </div>

      <!-- Gemini AI Configuration -->
      <div class="card" style="grid-column:1/-1;">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:16px;font-size:1.05em;">
          <i class="fas fa-brain" style="color:#8b5cf6;margin-right:8px;"></i>Gemini AI Integration
        </div>
        <div class="form-group" style="margin-bottom:14px;max-width:480px;">
          <label class="form-label">Gemini API Key</label>
          <input type="password" class="form-input" id="s-gemini-key" value="${geminiApiKey||''}" placeholder="Paste Gemini API Key here..."/>
        </div>
        <div style="font-size:0.82em;color:var(--text-muted);margin-bottom:16px;">
          Uses Google Gemini AI for business forecasting and operations assistance. Get your API key for free from <a href="https://aistudio.google.com/" target="_blank" style="color:var(--accent);text-decoration:underline;">Google AI Studio</a>.
        </div>
        <div class="form-group" style="margin-top:16px; border-top:1.5px dashed var(--border); padding-top:12px; max-width:480px;">
          <label class="form-label">Show SAGA AI Floating Button</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <label class="toggle">
              <input type="checkbox" class="ai-fab-toggle" ${isAIFabVisible?'checked':''} onchange="toggleAIFabFromSettings(this.checked)"/>
              <span class="toggle-slider"></span>
            </label>
            <span class="ai-fab-toggle-label" style="font-size:0.9em;">${isAIFabVisible?'Visible':'Hidden'}</span>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveGeminiSettings()" style="margin-top:12px;"><i class="fas fa-save"></i> Save AI Settings</button>
      </div>

      <!-- About -->
      <div class="card" style="grid-column:1/-1;">
        <div style="font-family:'Playfair Display',serif;font-weight:700;margin-bottom:14px;font-size:1.05em;">
          <i class="fas fa-info-circle" style="color:var(--primary);margin-right:8px;"></i>About
        </div>
        <div style="display:flex;align-items:center;gap:20px;">
          <div style="width:60px;height:60px;border-radius:14px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.8em;flex-shrink:0;"><i class="fas fa-soap"></i></div>
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.3em;font-weight:700;">Sagacious Washing Center</div>
            <div style="color:var(--text-muted);font-size:0.88em;">Laundry POS & Management System v2.0</div>
            <div style="color:var(--text-muted);font-size:0.82em;margin-top:4px;">Powered by Supabase · TailwindCSS · Chart.js · SheetJS</div>
          </div>
        </div>
      </div>
    </div>`;

  loadUsersTable();
}

// ─────────────────────────────────────────────
// USERS TABLE
// ─────────────────────────────────────────────
async function loadUsersTable() {
  const users = await DB.getUsers();
  const el = document.getElementById('users-section');
  if (!el) return;
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `<tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.display_name || '—'}</td>
            <td>
              <span class="badge ${u.role==='admin'?'badge-yellow':'badge-blue'}" style="text-transform:capitalize;">
                ${u.role==='admin'?'<i class="fas fa-crown" style="font-size:0.85em;margin-right:3px;"></i>':''} ${u.role}
              </span>
            </td>
            <td><div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="showEditUserModal(${u.id})"><i class="fas fa-edit"></i></button>
              ${u.username !== currentUser?.username
                ? `<button class="btn btn-danger btn-sm" onclick="deleteUserConfirm(${u.id},'${u.username}')"><i class="fas fa-trash"></i></button>`
                : `<button class="btn btn-secondary btn-sm" disabled title="Cannot delete current user"><i class="fas fa-lock"></i></button>`}
            </div></td>
          </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No users</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function showAddUserModal() {
  createModal('add-user-modal', 'Add User', `
    <div class="form-group"><label class="form-label">Username *</label>
      <input class="form-input" id="u-username" placeholder="e.g. john"/></div>
    <div class="form-group"><label class="form-label">Display Name</label>
      <input class="form-input" id="u-display" placeholder="e.g. John Silva"/></div>
    <div class="form-group"><label class="form-label">Password *</label>
      <input type="password" class="form-input" id="u-pass" placeholder="Set password"/></div>
    <div class="form-group"><label class="form-label">Role</label>
      <select class="form-input form-select" id="u-role">
        <option value="user">User — Standard access</option>
        <option value="admin">Admin — Full access</option>
      </select></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
      <button class="btn btn-secondary" onclick="hideModal('add-user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewUser()"><i class="fas fa-save"></i> Save User</button>
    </div>`);
  showModal('add-user-modal');
}

async function saveNewUser() {
  const username     = document.getElementById('u-username').value.trim().toLowerCase();
  const display_name = document.getElementById('u-display').value.trim();
  const password     = document.getElementById('u-pass').value;
  const role         = document.getElementById('u-role').value;
  if (!username) return toast('Username required', 'error');
  if (!password) return toast('Password required', 'error');
  const existing = await DB.getUserByUsername(username);
  if (existing) return toast(`Username "${username}" already taken`, 'error');
  await DB.addUser({ username, display_name: display_name || username, password, role });
  await DB.logAction('User Added', `Added system user "${username}" (Role: ${role})`, { username, role, display_name }, 'User');
  hideModal('add-user-modal');
  toast('User added!');
  loadUsersTable();
}

async function showEditUserModal(id) {
  const u = await DB.getUser(id); if (!u) return;
  createModal('edit-user-modal', `Edit User: ${u.username}`, `
    <div class="form-group"><label class="form-label">Username *</label>
      <input class="form-input" id="eu-username" value="${u.username||''}"/></div>
    <div class="form-group"><label class="form-label">Display Name</label>
      <input class="form-input" id="eu-display" value="${u.display_name||''}"/></div>
    <div class="form-group"><label class="form-label">New Password <span style="color:var(--text-muted);font-weight:400;">(leave blank to keep)</span></label>
      <input type="password" class="form-input" id="eu-pass" placeholder="Enter new password or leave blank"/></div>
    <div class="form-group"><label class="form-label">Role</label>
      <select class="form-input form-select" id="eu-role">
        <option value="user"  ${u.role==='user' ?'selected':''}>User — Standard access</option>
        <option value="admin" ${u.role==='admin'?'selected':''}>Admin — Full access</option>
      </select></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
      <button class="btn btn-secondary" onclick="hideModal('edit-user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditUser(${id})"><i class="fas fa-save"></i> Save</button>
    </div>`);
  showModal('edit-user-modal');
}

async function saveEditUser(id) {
  const username     = document.getElementById('eu-username').value.trim().toLowerCase();
  const display_name = document.getElementById('eu-display').value.trim();
  const password     = document.getElementById('eu-pass').value;
  const role         = document.getElementById('eu-role').value;
  if (!username) return toast('Username required', 'error');

  const existing = await DB.getUserByUsername(username);
  if (existing && String(existing.id) !== String(id)) return toast(`Username "${username}" already taken`, 'error');

  const updateData = { username, display_name: display_name || username, role };
  if (password) updateData.password = password;
  await DB.updateUser(id, updateData);
  await DB.logAction('User Updated', `Updated system user "${username}"`, { username, role }, 'User');
  
  // Refresh current user if self
  if (currentUser && currentUser.id === id) {
    currentUser.display_name = updateData.display_name;
    currentUser.role = updateData.role;
    updateRoleChip();
  }
  hideModal('edit-user-modal');
  toast('User updated!');
  loadUsersTable();
}

async function deleteUserConfirm(id, username) {
  confirmDialog(`Delete user "${username}"?`, async () => {
    await DB.deleteUser(id);
    await DB.logAction('User Deleted', `Deleted system user "${username}"`, { username }, 'User');
    toast('User deleted');
    loadUsersTable();
  });
}

// ─────────────────────────────────────────────
// COMPANY / APPEARANCE / LOGO
// ─────────────────────────────────────────────
async function saveBillingSettings() {
  const minDisc = document.getElementById('s-min-discount')?.value;
  const delivery = document.getElementById('s-delivery-charge')?.value;
  if(minDisc!==undefined) await DB.setSetting('min_discount_amount', minDisc);
  if(delivery!==undefined) await DB.setSetting('delivery_charge', delivery);
  toast('Billing settings saved!');
}

async function saveGeminiSettings() {
  const geminiKey = document.getElementById('s-gemini-key')?.value.trim();
  if (geminiKey !== undefined) {
    await DB.setSetting('gemini_api_key', geminiKey);
  }
  await DB.setSetting('ai_provider', 'gemini');
  await DB.logAction('Settings Updated', 'Updated Gemini AI settings', {}, 'System');
  toast('Gemini settings saved!');
}

async function saveCompanySettings() {
  const fields = { company_name:'s-company', address:'s-address', phone:'s-phone', email:'s-email', invoice_prefix:'s-prefix', footer_message:'s-footer' };
  for (const [key, id] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) await DB.setSetting(key, el.value);
  }
  const name = document.getElementById('s-company')?.value || 'Sagacious Washing Center';
  const sn = document.getElementById('sidebar-company-name');
  if (sn) sn.innerHTML = name.replace(' ', '<br/>');
  await DB.logAction('Settings Updated', 'Updated company profile settings', { company_name: name }, 'System');
  toast('Company settings saved!');
}

function setTextSize(size) {
  const map = { sm:'text-sm-ui', md:'text-md-ui', lg:'text-lg-ui', xl:'text-xl-ui' };
  ['sm','md','lg','xl'].forEach(s => {
    document.body.classList.remove(map[s]);
    const btn = document.getElementById(`ts-${s}`);
    if (btn) btn.className = btn.className.replace('btn-primary','btn-secondary');
  });
  document.body.classList.add(map[size]);
  const active = document.getElementById(`ts-${size}`);
  if (active) active.className = active.className.replace('btn-secondary','btn-primary');
  DB.setSetting('text_size', size);
  toast('Text size updated');
}

function toggleDarkFromSettings(checked) {
  if (checked) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  DB.setSetting('dark_mode', checked ? 'true' : 'false');
  const label = document.getElementById('dark-mode-label');
  if (label) label.textContent = checked ? 'Dark Mode' : 'Light Mode';
  const icon = document.getElementById('dark-icon');
  if (icon) icon.className = checked ? 'fas fa-sun' : 'fas fa-moon';
}

async function handleLogoUpload(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    await DB.setSetting('logo_data', e.target.result);
    updateLogo(e.target.result);
    toast('Logo uploaded!'); renderSettings();
  };
  reader.readAsDataURL(file);
}

function updateLogo(dataURL) {
  const el = document.getElementById('sidebar-logo-img');
  if (el) el.innerHTML = `<img src="${dataURL}" style="width:40px;height:40px;border-radius:10px;object-fit:cover;"/>`;
}

async function removeLogo() {
  await DB.setSetting('logo_data', null);
  const el = document.getElementById('sidebar-logo-img');
  if (el) el.innerHTML = '<i class="fas fa-soap"></i>';
  toast('Logo removed'); renderSettings();
}

// ─────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────
async function exportDatabase() {
  const data = await DB.exportAll();
  downloadJSON(data, 'sagacious_washing_backup.json');
  toast('Database exported!');
}

async function importDatabase(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      confirmDialog('This will replace ALL existing data. Continue?', async () => {
        await DB.importAll(data);
        toast('Database restored!');
        navigate('dashboard');
      });
    } catch { toast('Invalid backup file', 'error'); }
  };
  reader.readAsText(file);
}

async function uploadToCloud() {
  const data = await DB.exportAll();
  const endpoint = prompt('Enter cloud endpoint URL:', 'https://your-server.com/upload-database');
  if (!endpoint) return;
  try {
    const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (res.ok) toast('Database uploaded to cloud!'); else toast('Upload failed: '+res.statusText,'error');
  } catch(err) { toast('Upload failed: '+err.message,'error'); }
}

async function importFromCloud() {
  const endpoint = prompt('Enter cloud database URL:', 'https://your-server.com/database.json');
  if (!endpoint) return;
  try {
    const res = await fetch(endpoint); if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    confirmDialog('This will replace ALL existing data. Continue?', async () => {
      await DB.importAll(data); toast('Database imported from cloud!'); navigate('dashboard');
    });
  } catch(err) { toast('Import failed: '+err.message,'error'); }
}

// Admin-only reset
async function resetDatabase() {
  if (!requireAdmin()) return;
  confirmDialog('⚠️ DELETE ALL DATA permanently — are you absolutely sure?', async () => {
    await DB.importAll({});
    await DB.seedDemoData();
    toast('Database reset complete', 'info');
    navigate('dashboard');
  });
}

async function toggleUndoFromSettings(checked) {
  const val = checked ? 'true' : 'false';
  await DB.setSetting('show_undo_button', val);
  showUndoButtonSetting = val;
  const label = document.getElementById('undo-toggle-label');
  if (label) label.textContent = checked ? 'Visible' : 'Hidden';
  toast('Undo button visibility updated');
}

async function toggleAIFabFromSettings(checked) {
  const val = checked ? 'true' : 'false';
  await DB.setSetting('show_saga_ai_button', val);
  document.querySelectorAll('.ai-fab-toggle-label').forEach(el => el.textContent = checked ? 'Visible' : 'Hidden');
  document.querySelectorAll('.ai-fab-toggle').forEach(el => el.checked = checked);
  const fab = document.getElementById('gemini-fab');
  if (fab) fab.style.display = checked ? 'flex' : 'none';
  if (!checked) {
    const drawer = document.getElementById('gemini-drawer');
    if (drawer && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
    }
  }
  toast(`SAGA AI floating button ${checked ? 'shown' : 'hidden'}`);
}
