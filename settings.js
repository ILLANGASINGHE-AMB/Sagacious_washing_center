// settings.js - Settings Module

async function renderSettings() {
  document.getElementById('page-title').textContent = 'Settings';
  const [companyName, address, phone, email, invPrefix, footer, darkMode, textSize, minDiscountAmt, deliveryCharge, showUndo, showAIFab] = await Promise.all([
    DB.getSetting('company_name'), DB.getSetting('address'), DB.getSetting('phone'),
    DB.getSetting('email'), DB.getSetting('invoice_prefix'),
    DB.getSetting('footer_message'), DB.getSetting('dark_mode'), DB.getSetting('text_size'),
    DB.getSetting('min_discount_amount'), DB.getSetting('delivery_charge'),
    DB.getSetting('show_undo_button'), DB.getSetting('show_saga_ai_button')
  ]);
  const logoData = await DB.getSetting('logo_data');
  const isUndoVisible = showUndo !== 'false';
  const isAIFabVisible = showAIFab !== 'false';

  // Staff & Driver see only Appearance (Text size, Dark/Light mode)
  if (!isAdmin()) {
    document.getElementById('content').innerHTML = `
      <div class="section-header">
        <div>
          <span class="section-title">Settings</span>
          <div style="font-size:0.85em;color:var(--text-muted);margin-top:2px;">Personalize your display and interface preferences</div>
        </div>
      </div>
      <div style="max-width:620px;margin-top:16px;">
        <div class="card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(26,77,143,0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.1em;">
              <i class="fas fa-palette"></i>
            </div>
            <div>
              <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1em;color:var(--text);">Appearance & Display</div>
              <div style="font-size:0.8em;color:var(--text-muted);">Adjust font size and color scheme</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Font Size</label>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;">
              ${['sm','md','lg','xl'].map(s => `<button class="btn ${textSize===s?'btn-primary':'btn-secondary'}" onclick="setTextSize('${s}')" id="ts-${s}">${{sm:'Small',md:'Medium',lg:'Large',xl:'XL'}[s]}</button>`).join('')}
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;margin-top:10px;border-top:1px solid var(--border);">
            <div>
              <div style="font-weight:600;font-size:0.9em;color:var(--text);">Dark Mode</div>
              <div style="font-size:0.8em;color:var(--text-muted);">Toggle between dark and light theme</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <label class="toggle">
                <input type="checkbox" id="dark-toggle" ${darkMode==='true'?'checked':''} onchange="toggleDarkFromSettings(this.checked)"/>
                <span class="toggle-slider"></span>
              </label>
              <span id="dark-mode-label" style="font-size:0.85em;font-weight:600;color:var(--text-muted);min-width:70px;">${darkMode==='true'?'Dark Mode':'Light Mode'}</span>
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  // Admin — Full settings with clear modern layout
  document.getElementById('content').innerHTML = `
    <div class="section-header">
      <div>
        <span class="section-title">System Settings</span>
        <div style="font-size:0.85em;color:var(--text-muted);margin-top:2px;">Configure company details, branding, billing rules, preferences, and data backups</div>
      </div>
    </div>

    <!-- Main 2-Column Responsive Layout -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px;margin-top:8px;">

      <!-- Column 1: Company Profile & Billing Rules -->
      <div style="display:flex;flex-direction:column;gap:20px;">

        <!-- Company Information -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(26,77,143,0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.1em;">
                <i class="fas fa-building"></i>
              </div>
              <div>
                <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1em;color:var(--text);">Company Profile</div>
                <div style="font-size:0.8em;color:var(--text-muted);">Business identity and invoice header information</div>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">Company Name *</label>
              <input class="form-input" id="s-company" value="${escapeHtml(companyName||'')}" placeholder="e.g. Sagacious Washing Center"/>
            </div>
            <div class="form-group">
              <label class="form-label">Contact Phone</label>
              <input class="form-input" id="s-phone" value="${escapeHtml(phone||'')}" placeholder="e.g. 077 123 4567"/>
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input class="form-input" id="s-email" value="${escapeHtml(email||'')}" placeholder="e.g. contact@sagacious.com"/>
            </div>
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">Business Address</label>
              <input class="form-input" id="s-address" value="${escapeHtml(address||'')}" placeholder="e.g. 123 Main Street, Colombo"/>
            </div>
            <div class="form-group">
              <label class="form-label">Invoice Prefix</label>
              <input class="form-input" id="s-prefix" value="${escapeHtml(invPrefix||'INV')}" placeholder="e.g. INV"/>
            </div>
            <div class="form-group">
              <label class="form-label">Invoice Footer Message</label>
              <input class="form-input" id="s-footer" value="${escapeHtml(footer||'')}" placeholder="e.g. Thank you for your business!"/>
            </div>
          </div>

          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">
            <button class="btn btn-primary" onclick="saveCompanySettings()"><i class="fas fa-save"></i> Save Company Info</button>
          </div>
        </div>

        <!-- Billing & Pricing Defaults -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,0.1);color:#10b981;display:flex;align-items:center;justify-content:center;font-size:1.1em;">
                <i class="fas fa-file-invoice-dollar"></i>
              </div>
              <div>
                <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1em;color:var(--text);">Billing & Pricing Defaults</div>
                <div style="font-size:0.8em;color:var(--text-muted);">Rules for discount qualification and delivery fees</div>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Discount Threshold (LKR)</label>
              <input type="number" class="form-input" id="s-min-discount" value="${minDiscountAmt||'30000'}" min="0" step="100"/>
              <span style="font-size:0.78em;color:var(--text-muted);margin-top:2px;">Discounts apply on bills ≥ this value</span>
            </div>
            <div class="form-group">
              <label class="form-label">Default Delivery Fee (LKR)</label>
              <input type="number" class="form-input" id="s-delivery-charge" value="${deliveryCharge||'0'}" min="0" step="0.01"/>
              <span style="font-size:0.78em;color:var(--text-muted);margin-top:2px;">Pre-filled on new bills (editable)</span>
            </div>
          </div>

          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">
            <button class="btn btn-primary" onclick="saveBillingSettings()"><i class="fas fa-save"></i> Save Billing Settings</button>
          </div>
        </div>

      </div>

      <!-- Column 2: Branding, Appearance & AI Integration -->
      <div style="display:flex;flex-direction:column;gap:20px;">

        <!-- App Logo & Branding -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(0,180,216,0.1);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:1.1em;">
                <i class="fas fa-image"></i>
              </div>
              <div>
                <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1em;color:var(--text);">Brand & Logo</div>
                <div style="font-size:0.8em;color:var(--text-muted);">Application and invoice print emblem</div>
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:18px;margin-bottom:16px;background:var(--bg);padding:14px;border-radius:12px;border:1px solid var(--border);">
            <div>
              ${logoData
                ? `<img src="${logoData}" style="width:72px;height:72px;border-radius:14px;object-fit:cover;border:2px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,0.08);"/>`
                : `<div style="width:72px;height:72px;border-radius:14px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.8em;box-shadow:0 2px 8px rgba(0,0,0,0.1);"><i class="fas fa-soap"></i></div>`}
            </div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:0.95em;color:var(--text);">${companyName || 'Sagacious Washing Center'}</div>
              <div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;">PNG, JPG, SVG or WEBP formats accepted. Max 2MB recommended.</div>
              ${logoData ? `<button class="btn btn-danger btn-sm" onclick="removeLogo()" style="margin-top:8px;padding:4px 10px;font-size:0.78em;"><i class="fas fa-trash"></i> Remove Custom Logo</button>` : ''}
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Upload New Logo</label>
            <input type="file" class="form-input" id="logo-upload" accept="image/*" onchange="handleLogoUpload(event)" style="padding:8px;cursor:pointer;"/>
          </div>
        </div>

        <!-- Appearance & Preferences -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(147,51,234,0.1);color:#9333ea;display:flex;align-items:center;justify-content:center;font-size:1.1em;">
                <i class="fas fa-sliders-h"></i>
              </div>
              <div>
                <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1em;color:var(--text);">Interface Preferences</div>
                <div style="font-size:0.8em;color:var(--text-muted);">Text sizing, themes, and interactive controls</div>
              </div>
            </div>
          </div>

          <!-- Text Size -->
          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Font Scale</label>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px;">
              ${['sm','md','lg','xl'].map(s => `<button class="btn ${textSize===s?'btn-primary':'btn-secondary'}" onclick="setTextSize('${s}')" id="ts-${s}">${{sm:'Small',md:'Medium',lg:'Large',xl:'XL'}[s]}</button>`).join('')}
            </div>
          </div>

          <!-- Toggles List -->
          <div style="display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--border);padding-top:12px;">

            <!-- Dark Mode Toggle -->
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-weight:600;font-size:0.9em;color:var(--text);">Dark Mode</div>
                <div style="font-size:0.78em;color:var(--text-muted);">Toggle dark/light visual theme</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <label class="toggle">
                  <input type="checkbox" id="dark-toggle" ${darkMode==='true'?'checked':''} onchange="toggleDarkFromSettings(this.checked)"/>
                  <span class="toggle-slider"></span>
                </label>
                <span id="dark-mode-label" style="font-size:0.85em;font-weight:600;color:var(--text-muted);min-width:65px;">${darkMode==='true'?'Dark Mode':'Light Mode'}</span>
              </div>
            </div>

            <!-- Undo Payment Button Toggle -->
            <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:12px;">
              <div>
                <div style="font-weight:600;font-size:0.9em;color:var(--text);">Show Undo Payment Button</div>
                <div style="font-size:0.78em;color:var(--text-muted);">Display reversal action on paid bills</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <label class="toggle">
                  <input type="checkbox" id="undo-toggle" ${isUndoVisible?'checked':''} onchange="toggleUndoFromSettings(this.checked)"/>
                  <span class="toggle-slider"></span>
                </label>
                <span id="undo-toggle-label" style="font-size:0.85em;font-weight:600;color:var(--text-muted);min-width:65px;">${isUndoVisible?'Visible':'Hidden'}</span>
              </div>
            </div>

            <!-- SAGA AI FAB Toggle -->
            <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:12px;">
              <div>
                <div style="font-weight:600;font-size:0.9em;color:var(--text);">SAGA AI Floating Assistant</div>
                <div style="font-size:0.78em;color:var(--text-muted);">Floating quick-access chat trigger</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <label class="toggle">
                  <input type="checkbox" class="ai-fab-toggle" ${isAIFabVisible?'checked':''} onchange="toggleAIFabFromSettings(this.checked)"/>
                  <span class="toggle-slider"></span>
                </label>
                <span class="ai-fab-toggle-label" style="font-size:0.85em;font-weight:600;color:var(--text-muted);min-width:65px;">${isAIFabVisible?'Visible':'Hidden'}</span>
              </div>
            </div>

          </div>
        </div>

        <!-- Google Gemini AI Configuration -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(139,92,246,0.1);color:#8b5cf6;display:flex;align-items:center;justify-content:center;font-size:1.1em;">
                <i class="fas fa-brain"></i>
              </div>
              <div>
                <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1em;color:var(--text);">Gemini AI Integration</div>
                <div style="font-size:0.8em;color:var(--text-muted);">Configure business intelligence and conversational AI</div>
              </div>
            </div>
          </div>

          <div style="font-size:0.85em;color:var(--text-muted);line-height:1.6;">
            <i class="fas fa-shield-halved" style="color:#8b5cf6;"></i>
            For security, the Gemini API key is no longer stored or editable here — it's read only from the
            <code style="background:var(--bg);padding:1px 6px;border-radius:4px;">GEMINI_API_KEY</code>
            environment variable on the Netlify server, so it's never sent to or stored in the browser/database.
            Free API keys are available from <a href="https://aistudio.google.com/" target="_blank" style="color:var(--accent);text-decoration:underline;font-weight:600;"><i class="fas fa-external-link-alt" style="font-size:0.85em;"></i> Google AI Studio</a> —
            set it under Site configuration &gt; Environment variables in the Netlify dashboard.
          </div>
        </div>

      </div>

    </div>

    <!-- User Management Section (Full Width) -->
    <div class="card" style="margin-top:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(26,77,143,0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.1em;">
            <i class="fas fa-users-cog"></i>
          </div>
          <div>
            <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.15em;color:var(--text);">User Management</div>
            <div style="font-size:0.8em;color:var(--text-muted);">Manage system logins, credentials, and role-based permissions</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="showAddUserModal()">
          <i class="fas fa-plus"></i> Add New User
        </button>
      </div>

      <div id="users-section">
        <div style="text-align:center;padding:24px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading users...</div>
      </div>
    </div>

    <!-- Data Management & Backups (Full Width) -->
    <div class="card" style="margin-top:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <div style="width:36px;height:36px;border-radius:10px;background:rgba(240,165,0,0.1);color:var(--accent2);display:flex;align-items:center;justify-content:center;font-size:1.1em;">
          <i class="fas fa-database"></i>
        </div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.15em;color:var(--text);">Database & Backup Center</div>
          <div style="font-size:0.8em;color:var(--text-muted);">Export backups, restore data from JSON, cloud sync, or reset system</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">

        <!-- Export -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text);margin-bottom:4px;font-size:0.95em;">
              <i class="fas fa-file-export" style="color:var(--success);"></i> Export Data
            </div>
            <div style="font-size:0.8em;color:var(--text-muted);">Download a complete JSON backup of system records</div>
          </div>
          <button class="btn btn-success btn-sm" style="width:100%;justify-content:center;" onclick="exportDatabase()"><i class="fas fa-download"></i> Backup JSON</button>
        </div>

        <!-- Import -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text);margin-bottom:4px;font-size:0.95em;">
              <i class="fas fa-file-import" style="color:var(--accent);"></i> Import Data
            </div>
            <div style="font-size:0.8em;color:var(--text-muted);">Restore system state from a JSON backup file</div>
          </div>
          <input type="file" id="db-import-file" accept=".json" style="display:none;" onchange="importDatabase(event)"/>
          <button class="btn btn-accent btn-sm" style="width:100%;justify-content:center;" onclick="document.getElementById('db-import-file').click()"><i class="fas fa-upload"></i> Restore JSON</button>
        </div>

        <!-- Upload to Cloud -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text);margin-bottom:4px;font-size:0.95em;">
              <i class="fas fa-cloud-upload-alt" style="color:var(--primary);"></i> Push to Cloud
            </div>
            <div style="font-size:0.8em;color:var(--text-muted);">Push database backup payload to HTTPS endpoint</div>
          </div>
          <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;" onclick="uploadToCloud()"><i class="fas fa-cloud-upload-alt"></i> Upload</button>
        </div>

        <!-- Import from Cloud -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text);margin-bottom:4px;font-size:0.95em;">
              <i class="fas fa-cloud-download-alt" style="color:#0ea5e9;"></i> Pull from Cloud
            </div>
            <div style="font-size:0.8em;color:var(--text-muted);">Fetch and restore database from HTTPS URL</div>
          </div>
          <button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;" onclick="importFromCloud()"><i class="fas fa-cloud-download-alt"></i> Fetch & Sync</button>
        </div>

        <!-- Danger Zone: Reset -->
        <div style="background:rgba(239,68,68,0.04);border:1.5px dashed var(--danger);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--danger);margin-bottom:4px;font-size:0.95em;">
              <i class="fas fa-exclamation-triangle"></i> Reset Database
            </div>
            <div style="font-size:0.8em;color:var(--text-muted);">Irreversibly clear operational data and seed demo records</div>
          </div>
          <button class="btn btn-danger btn-sm" style="width:100%;justify-content:center;" onclick="resetDatabase()"><i class="fas fa-trash-alt"></i> Reset All Data</button>
        </div>

      </div>
    </div>

    <!-- About & System Info (Full Width) -->
    <div class="card" style="margin-top:24px;border-left:4px solid var(--primary);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:54px;height:54px;border-radius:14px;background:linear-gradient(135deg,#00b4d8,#1a4d8f);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.6em;flex-shrink:0;box-shadow:0 4px 14px rgba(0,180,216,0.25);">
            <i class="fas fa-soap"></i>
          </div>
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:1.25em;font-weight:700;color:var(--text);">Sagacious Washing Center</div>
            <div style="color:var(--text-muted);font-size:0.85em;">Commercial Laundry POS & Fleet Management Suite · Version 6.2 (Auth Enhanced)</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span class="badge badge-blue">Supabase Cloud</span>
          <span class="badge badge-green">Chart.js</span>
          <span class="badge badge-purple">Gemini AI</span>
          <span class="badge badge-cyan">SheetJS</span>
        </div>
      </div>
    </div>
  `;

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
        <thead>
          <tr>
            <th style="width:220px;">User</th>
            <th>Email</th>
            <th>Display Name</th>
            <th style="width:140px;">Role</th>
            <th style="width:120px;text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => {
            const initial = (u.display_name || u.username || 'U').charAt(0).toUpperCase();
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85em;flex-shrink:0;">
                    ${escapeHtml(initial)}
                  </div>
                  <div>
                    <strong style="color:var(--text);font-size:0.95em;">${escapeHtml(u.username)}</strong>
                  </div>
                </div>
              </td>
              <td style="color:var(--text-muted);">${escapeHtml(u.email || '—')}</td>
              <td>${escapeHtml(u.display_name || '—')}</td>
              <td>
                <span class="badge ${u.role==='admin'?'badge-yellow':u.role==='driver'?'badge-purple':'badge-blue'}" style="text-transform:capitalize;font-weight:600;font-size:0.8em;padding:4px 10px;">
                  ${u.role==='admin'?'<i class="fas fa-crown" style="font-size:0.85em;margin-right:4px;"></i>':u.role==='driver'?'<i class="fas fa-car" style="font-size:0.85em;margin-right:4px;"></i>':''}${escapeHtml(u.role)}
                </span>
              </td>
              <td style="text-align:right;">
                <div style="display:inline-flex;gap:6px;align-items:center;">
                  <button class="btn btn-primary btn-sm" onclick="showEditUserModal('${u.id}')" title="Edit User"><i class="fas fa-edit"></i> Edit</button>
                  ${u.id !== currentUser?.id
                    ? `<button class="btn btn-danger btn-sm" onclick="deleteUserConfirm('${u.id}','${escapeHtml(u.username)}')" title="Delete User"><i class="fas fa-trash"></i></button>`
                    : `<button class="btn btn-secondary btn-sm" disabled title="Cannot delete currently logged-in account" style="opacity:0.5;cursor:not-allowed;"><i class="fas fa-lock"></i></button>`}
                </div>
              </td>
            </tr>`;
          }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:28px;">No users registered</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function showAddUserModal() {
  createModal('add-user-modal', 'Add New User', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Email Address * <span style="color:var(--text-muted);font-weight:400;font-size:0.82em;">(Used to sign in)</span></label>
        <input type="email" class="form-input" id="u-email" placeholder="e.g. user@sagacious.com"/>
      </div>
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input class="form-input" id="u-username" placeholder="e.g. john_silva"/>
      </div>
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input class="form-input" id="u-display" placeholder="e.g. John Silva"/>
      </div>
      <div class="form-group">
        <label class="form-label">Password * <span style="color:var(--text-muted);font-weight:400;font-size:0.82em;">(min 6 characters)</span></label>
        <input type="password" class="form-input" id="u-pass" placeholder="Set secure password"/>
      </div>
      <div class="form-group">
        <label class="form-label">System Role</label>
        <select class="form-input form-select" id="u-role">
          <option value="user">User — Standard staff access</option>
          <option value="admin">Admin — Full system access</option>
          <option value="driver">Driver — Transport trip access</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('add-user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewUser()"><i class="fas fa-save"></i> Save User</button>
    </div>`, 'modal-md');
  showModal('add-user-modal');
  setTimeout(() => document.getElementById('u-email')?.focus(), 100);
}

async function saveNewUser() {
  const email        = document.getElementById('u-email').value.trim().toLowerCase();
  const username      = document.getElementById('u-username').value.trim().toLowerCase();
  const display_name = document.getElementById('u-display').value.trim();
  const password      = document.getElementById('u-pass').value;
  const role          = document.getElementById('u-role').value;
  if (!email) return toast('Email required', 'error');
  if (!username) return toast('Username required', 'error');
  if (!password || password.length < 6) return toast('Password must be at least 6 characters', 'error');
  try {
    await DB.addUser({ email, username, display_name: display_name || username, password, role });
    await DB.logAction('User Added', `Added system user "${username}" (Role: ${role})`, { username, role, display_name }, 'User');
    hideModal('add-user-modal');
    toast('User added!');
    loadUsersTable();
  } catch (err) {
    toast('Failed to add user: ' + (err.message || err), 'error');
  }
}

async function showEditUserModal(id) {
  const u = await DB.getUser(id); if (!u) return;
  createModal('edit-user-modal', `Edit User: ${escapeHtml(u.username)}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Email Address * <span style="color:var(--text-muted);font-weight:400;font-size:0.82em;">(Used to sign in)</span></label>
        <input type="email" class="form-input" id="eu-email" value="${escapeHtml(u.email||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input class="form-input" id="eu-username" value="${escapeHtml(u.username||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input class="form-input" id="eu-display" value="${escapeHtml(u.display_name||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">New Password <span style="color:var(--text-muted);font-weight:400;font-size:0.82em;">(Leave blank to keep current)</span></label>
        <input type="password" class="form-input" id="eu-pass" placeholder="Enter new password or leave blank"/>
      </div>
      <div class="form-group">
        <label class="form-label">System Role</label>
        <select class="form-input form-select" id="eu-role">
          <option value="user"   ${u.role==='user'  ?'selected':''}>User — Standard staff access</option>
          <option value="admin"  ${u.role==='admin' ?'selected':''}>Admin — Full system access</option>
          <option value="driver" ${u.role==='driver'?'selected':''}>Driver — Transport trip access</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary" onclick="hideModal('edit-user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditUser('${id}')"><i class="fas fa-save"></i> Save Changes</button>
    </div>`, 'modal-md');
  showModal('edit-user-modal');
}

async function saveEditUser(id) {
  const email        = document.getElementById('eu-email').value.trim().toLowerCase();
  const username      = document.getElementById('eu-username').value.trim().toLowerCase();
  const display_name = document.getElementById('eu-display').value.trim();
  const password      = document.getElementById('eu-pass').value;
  const role          = document.getElementById('eu-role').value;
  if (!email) return toast('Email required', 'error');
  if (!username) return toast('Username required', 'error');

  const updateData = { email, username, display_name: display_name || username, role };
  if (password) {
    if (password.length < 6) return toast('Password must be at least 6 characters', 'error');
    updateData.password = password;
  }
  try {
    await DB.updateUser(id, updateData);
    await DB.logAction('User Updated', `Updated system user "${username}"`, { username, role }, 'User');

    // Refresh current user if self
    if (currentUser && String(currentUser.id) === String(id)) {
      currentUser.display_name = updateData.display_name;
      currentUser.role = updateData.role;
      updateRoleChip();
    }
    hideModal('edit-user-modal');
    toast('User updated!');
    loadUsersTable();
  } catch (err) {
    toast('Failed to update user: ' + (err.message || err), 'error');
  }
}

async function deleteUserConfirm(id, username) {
  confirmDialog(`Delete user "${username}"?`, async () => {
    try {
      await DB.deleteUser(id);
      await DB.logAction('User Deleted', `Deleted system user "${username}"`, { username }, 'User');
      toast('User deleted');
      loadUsersTable();
    } catch (err) {
      toast('Failed to delete user: ' + (err.message || err), 'error');
    }
  });
}

// ─────────────────────────────────────────────
// COMPANY / APPEARANCE / LOGO / AI
// ─────────────────────────────────────────────
async function saveBillingSettings() {
  const minDisc = document.getElementById('s-min-discount')?.value;
  const delivery = document.getElementById('s-delivery-charge')?.value;
  if (minDisc !== undefined) await DB.setSetting('min_discount_amount', minDisc);
  if (delivery !== undefined) await DB.setSetting('delivery_charge', delivery);
  await DB.logAction('Settings Updated', 'Updated billing and pricing defaults', { min_discount: minDisc, delivery_charge: delivery }, 'System');
  toast('Billing settings saved!');
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
  toast('Font size updated');
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
// DATABASE & BACKUP ACTIONS
// ─────────────────────────────────────────────
async function exportDatabase() {
  if (!requireAdmin()) return;
  const data = await DB.exportAll();
  downloadJSON(data, 'sagacious_washing_backup.json');
  toast('Database backup downloaded!');
}

async function importDatabase(event) {
  if (!requireAdmin()) return;
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      confirmDialog('This will replace ALL existing data. Continue?', async () => {
        await DB.importAll(data);
        toast('Database restored successfully!');
        navigate('dashboard');
      });
    } catch { toast('Invalid backup JSON file', 'error'); }
  };
  reader.readAsText(file);
}

async function uploadToCloud() {
  if (!requireAdmin()) return;
  const endpoint = prompt('Enter cloud endpoint URL:', 'https://your-server.com/upload-database');
  if (!endpoint) return;
  if (!endpoint.toLowerCase().startsWith('https://')) {
    return toast('Cloud endpoint must use secure HTTPS protocol', 'error');
  }
  const data = await DB.exportAll();
  try {
    const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (res.ok) toast('Database uploaded to cloud!'); else toast('Upload failed: '+res.statusText,'error');
  } catch(err) { toast('Upload failed: '+err.message,'error'); }
}

async function importFromCloud() {
  if (!requireAdmin()) return;
  const endpoint = prompt('Enter cloud database URL:', 'https://your-server.com/database.json');
  if (!endpoint) return;
  if (!endpoint.toLowerCase().startsWith('https://')) {
    return toast('Cloud database URL must use secure HTTPS protocol', 'error');
  }
  try {
    const res = await fetch(endpoint); if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    confirmDialog('This will replace ALL existing data with cloud version. Continue?', async () => {
      await DB.importAll(data); toast('Database imported from cloud!'); navigate('dashboard');
    });
  } catch(err) { toast('Import failed: '+err.message,'error'); }
}

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
  if (fab) fab.style.display = checked ? 'inline-flex' : 'none';
  if (!checked) {
    const drawer = document.getElementById('gemini-drawer');
    if (drawer && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
    }
  }
  toast(`SAGA AI button ${checked ? 'shown' : 'hidden'}`);
}

