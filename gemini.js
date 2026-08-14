// gemini.js - Gemini AI Module

// ── Gemini API Call ─────────────────────────────────
async function callGemini(promptText) {
  // First attempt to call the secure Netlify serverless proxy
  try {
    const proxyRes = await fetch('/.netlify/functions/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText })
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.text) return data.text;
    } else if (proxyRes.status !== 404 && proxyRes.status !== 500) {
      const errData = await proxyRes.json().catch(() => ({}));
      throw new Error(errData.error || `Server proxy HTTP ${proxyRes.status}`);
    }
  } catch (proxyError) {
    console.warn('Netlify serverless proxy call failed, checking fallback:', proxyError.message);
  }

  // Fallback if running outside Netlify or using local setting key
  const apiKey = await DB.getSetting('gemini_api_key');
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please configure GEMINI_API_KEY environment variable on Netlify or in Settings.');
  }

  const models = ["gemini-1.5-flash", "gemini-1.5-pro"];
  const errors = [];

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from model.');
      return text;
    } catch (error) {
      console.warn(`Model ${model} failed:`, error.message);
      errors.push(`${model}: "${error.message}"`);
    }
  }

  throw new Error(`All Gemini models failed. Details:\n${errors.join('\n')}`);
}

// ── Database Data Aggregations for Prompt Context ──
async function getBusinessContextSummary() {
  const [orders, invoices, payments, customers, items, drivers] = await Promise.all([
    DB.getOrders(), DB.getInvoices(), DB.getPayments(), DB.getCustomers(), DB.getItems(), DB.getDrivers()
  ]);

  // Fetch all order items with pagination to bypass Supabase's 1000 row default limit
  let orderItems = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    try {
      const chunk = await _q(
        _sb.from('order_items')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );
      if (chunk && chunk.length > 0) {
        orderItems = orderItems.concat(chunk);
        if (chunk.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error("Error paginating order items:", e);
      hasMore = false;
    }
  }

  // Aggregate general stats
  const totalBilled = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => {
    const adv = i.advance_payment || 0;
    return s + adv;
  }, 0) + payments.reduce((s, p) => s + (p.amount || 0), 0);
  
  const statusCount = {};
  orders.forEach(o => { statusCount[o.status] = (statusCount[o.status] || 0) + 1; });

  // Full Customer List Context
  const customersCtx = customers.map(c => `- ${c.hotel_name} (ID: ${c.id}, Address: ${c.address || 'N/A'}, Phone: ${c.phone || 'N/A'}, Email: ${c.email || 'N/A'})`).join('\n');

  // Full Driver List Context
  const driversCtx = drivers.map(d => `- ${d.name} (ID: ${d.id}, Phone: ${d.phone || 'N/A'})`).join('\n');

  // Full Catalog Items Context
  const itemsCtx = items.map(i => `- ${i.name} (Code: ${i.item_id}, Category: ${i.category}, Price: LKR ${i.price})`).join('\n');

  // Group order items by customer, month, item name, and service type
  const orderMap = {};
  orders.forEach(o => {
    const month = (o.created_at || o.pickup_date || '').slice(0, 7); // YYYY-MM
    orderMap[o.id] = {
      customerId: o.customer_id,
      month: month || 'Unknown'
    };
  });

  const groupedItems = {};
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c.hotel_name]));

  (orderItems || []).forEach(oi => {
    const oDetails = orderMap[oi.order_id];
    if (!oDetails) return;
    
    const customerName = customerMap[oDetails.customerId] || 'Unknown Customer';
    const month = oDetails.month;
    const itemName = oi.item_name || 'Unknown Item';
    const serviceType = oi.service_type || 'Wash';
    const qty = parseInt(oi.quantity) || 0;

    if (!groupedItems[customerName]) groupedItems[customerName] = {};
    if (!groupedItems[customerName][month]) groupedItems[customerName][month] = {};
    if (!groupedItems[customerName][month][itemName]) groupedItems[customerName][month][itemName] = {};
    
    groupedItems[customerName][month][itemName][serviceType] = (groupedItems[customerName][month][itemName][serviceType] || 0) + qty;
  });

  let itemAnalysisCtx = '';
  Object.entries(groupedItems).forEach(([customer, months]) => {
    itemAnalysisCtx += `\n#### Customer: ${customer}\n`;
    Object.entries(months).forEach(([month, items]) => {
      itemAnalysisCtx += `- Month: ${month}\n`;
      Object.entries(items).forEach(([item, services]) => {
        const servicesStr = Object.entries(services).map(([svc, qty]) => `${qty} ${svc}`).join(', ');
        itemAnalysisCtx += `  - ${item}: ${servicesStr}\n`;
      });
    });
  });

  // Aggregated Orders & Invoices list (recent 50 orders for direct referencing)
  const cMap = Object.fromEntries(customers.map(c => [c.id, c.hotel_name]));
  const dMap = Object.fromEntries(drivers.map(d => [d.id, d.name]));
  
  const recentOrdersCtx = orders.slice(0, 50).map(o => {
    return `| ${o.batch_id || o.id} | ${cMap[o.customer_id] || 'Unknown'} | LKR ${(o.total_amount || 0).toFixed(2)} | ${o.status} | ${dMap[o.driver_id] || 'None'} | Pick: ${o.pickup_date || 'N/A'} |`;
  }).join('\n');

  // Historical Monthly data
  const monthlyStats = {};
  orders.forEach(o => {
    const month = (o.created_at || '').slice(0, 7);
    if (!month) return;
    if (!monthlyStats[month]) monthlyStats[month] = { count: 0, billing: 0 };
    monthlyStats[month].count++;
    monthlyStats[month].billing += (o.total_amount || 0);
  });

  let summary = `Below is the system-wide context from the POS database. Use this context to answer questions, analyze business, and make forecasts.
All currency values are in Sri Lankan Rupees (LKR).

### SYSTEM OVERVIEW STATS
- Total Orders Count: ${orders.length}
- Total Billing Amount: LKR ${totalBilled.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
- Total Payments Received: LKR ${totalPaid.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
- Unpaid Balance: LKR ${(totalBilled - totalPaid).toLocaleString('en-LK', { minimumFractionDigits: 2 })}

### SYSTEM ORDER STATES
${Object.entries(statusCount).map(([status, count]) => `- ${status}: ${count}`).join('\n')}

### ALL REGISTERED CUSTOMERS (TOTAL: ${customers.length})
${customersCtx || "No customers registered."}

### ALL REGISTERED DRIVERS (TOTAL: ${drivers.length})
${driversCtx || "No drivers registered."}

### SERVICE CATALOG ITEMS (TOTAL: ${items.length})
${itemsCtx || "No items in catalog."}

### HISTORICAL PERFORMANCE BY MONTH (Last 12 Months)
| Month | Orders Count | Total Billing (LKR) |
|---|---|---|
${Object.entries(monthlyStats).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 12).map(([m, data]) => `| ${m} | ${data.count} | ${data.billing.toFixed(2)} |`).join('\n')}

### DETAILED ITEMS WASHED & DRY CLEANED BY CUSTOMER & MONTH
${itemAnalysisCtx || "No service details recorded yet."}

### RECENT 50 ORDERS
| Order Batch ID | Customer | Total (LKR) | Status | Assigned Driver | Pickup Date |
|---|---|---|---|---|---|
${recentOrdersCtx || "No recent orders."}
`;
  return summary;
}

// ── Interactive Chat Logic ─────────────────────────
let geminiChatHistory = [];

async function renderGemini() {
  const providerName = 'Gemini';
  
  document.getElementById('page-title').textContent = `${providerName} AI Insights`;
  
  const apiKey = await DB.getSetting('gemini_api_key');
  if (!apiKey) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="max-width: 600px; margin: 40px auto; text-align: center; padding: 40px 30px;">
        <div style="font-size: 3.5em; color: #8b5cf6; margin-bottom: 20px;"><i class="fas fa-brain"></i></div>
        <h2 style="font-family:'Playfair Display',serif; font-size: 1.6em; font-weight: 700; margin-bottom: 12px;">AI Assistant Integration</h2>
        <p style="color: var(--text-muted); font-size: 0.95em; line-height: 1.6; margin-bottom: 24px;">
          Power up your POS system with AI! Get automated financial forecasting, business efficiency analyses, demand summaries, and a smart interactive assistant.
        </p>
        <div style="background: rgba(139, 92, 246, 0.05); border: 1px dashed rgba(139, 92, 246, 0.2); border-radius: 10px; padding: 16px; text-align: left; margin-bottom: 24px; font-size: 0.88em;">
          <h4 style="font-weight: 700; margin-bottom: 6px; color: var(--primary);"><i class="fas fa-key"></i> Setup Required</h4>
          To get started, please navigate to <strong>Settings</strong>, get your API Key, and save it under the <strong>AI Assistant Integration</strong> section.
        </div>
        <button class="btn btn-primary" style="margin:0 auto;" onclick="navigate('settings')"><i class="fas fa-cog"></i> Go to Settings</button>
      </div>`;
    return;
  }

  // Render full dashboard
  document.getElementById('content').innerHTML = `
    <div style="margin-bottom: 22px;">
      <div style="font-size: 0.85em; color: var(--text-muted);">Sagacious Business Partner (${providerName} AI)</div>
      <div style="font-family:'Playfair Display',serif; font-size: 1.6em; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-brain" style="color: #8b5cf6;"></i> ${providerName} AI Insights Hub
      </div>
    </div>

    <!-- Quick Analysis Options -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 24px;">
      <div class="card" style="cursor: pointer; hover: box-shadow: 0 4px 20px rgba(0,0,0,0.1); transition: all 0.2s;" onclick="runAIForecast()">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px;">
          <div class="icon badge badge-purple" style="width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3em; background: rgba(139, 92, 246, 0.12); color: #8b5cf6;">
            <i class="fas fa-chart-line"></i>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 1em;">Demand & Revenue Forecast</div>
            <div style="font-size: 0.82em; color: var(--text-muted);">Predict next month's demand and revenue trends</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; background: linear-gradient(135deg, #8b5cf6, #3b82f6); border: none;">
          <i class="fas fa-wand-magic-sparkles"></i> Generate AI Forecast
        </button>
      </div>

      <div class="card" style="cursor: pointer; transition: all 0.2s;" onclick="runAIEfficiency()">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px;">
          <div class="icon badge badge-green" style="width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3em; background: rgba(34, 197, 94, 0.12); color: #22c55e;">
            <i class="fas fa-bolt"></i>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 1em;">Business Efficiency Analyzes</div>
            <div style="font-size: 0.82em; color: var(--text-muted);">Find logistics bottlenecks and driver success rates</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; background: linear-gradient(135deg, #22c55e, #10b981); border: none;">
          <i class="fas fa-wand-magic-sparkles"></i> Run Efficiency Analysis
        </button>
      </div>
    </div>

    <!-- Output Analysis / Interactive Chat workspace -->
    <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 20px;">
      
      <!-- AI Output display panel -->
      <div class="card" style="display: flex; flex-direction: column; min-height: 400px; max-height: 600px;">
        <div style="font-family:'Playfair Display',serif; font-weight: 700; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span><i class="fas fa-file-invoice" style="color:var(--primary); margin-right: 8px;"></i>AI Analysis Report</span>
          <button class="btn btn-secondary btn-sm" onclick="clearAIReport()" id="clear-report-btn" style="display:none;"><i class="fas fa-trash"></i> Clear</button>
        </div>
        <div id="gemini-report-body" style="flex: 1; overflow-y: auto; color: var(--text); line-height: 1.6; font-size: 0.92em; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.01); border-radius: 8px; padding: 20px;">
          <div style="text-align: center; color: var(--text-muted);">
            <i class="fas fa-wand-magic-sparkles" style="font-size: 2.2em; color:#8b5cf6; margin-bottom: 14px; display: block;"></i>
            Click an action card above to generate a forecasting report or efficiency analysis.
          </div>
        </div>
      </div>

      <!-- Chat with Assistant -->
      <div class="card" style="display: flex; flex-direction: column; min-height: 400px; max-height: 600px;">
        <div style="font-family:'Playfair Display',serif; font-weight: 700; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <i class="fas fa-comments" style="color:#8b5cf6; margin-right: 8px;"></i>Chat with Gemini AI
        </div>
        <div id="gemini-chat-history" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px; background: var(--bg); border-radius: 8px; margin-bottom: 12px; font-size: 0.88em;">
          <div class="gemini-msg system">
            I am your Gemini business assistant. You can ask me questions about customer accounts, unpaid balances, best drivers, or monthly sales growth!
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="gemini-chat-input" class="form-input" placeholder="Ask about orders, invoices, or metrics..." style="margin: 0; flex: 1;" onkeydown="handleGeminiChatKey(event)" />
          <button class="btn btn-primary" onclick="sendGeminiChatMessage()" style="padding: 10px 14px;"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>

    </div>`;

  // Pre-load chat history if any exists
  renderChatBubbles('gemini-chat-history');
}

// ── Format Markdown into Beautiful HTML ────────────────
function formatMarkdown(text) {
  if (!text) return '';
  
  // Escape HTML tags to prevent injections but keep spacing
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Format Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableHTML = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHTML = '<div class="table-wrap"><table style="width:100%; border-collapse: collapse; margin: 12px 0;">';
      }
      
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      
      // Divider rows (e.g. |---|)
      if (cells.every(c => c.match(/^:-*-?:*$/) || c.match(/^-+$/))) {
        continue;
      }
      
      const isHeader = !tableHTML.includes('<tbody>') && !tableHTML.includes('<thead>');
      if (isHeader) {
        tableHTML += '<thead style="background:var(--bg);"><tr>' + cells.map(c => `<th style="padding: 8px 12px; border: 1px solid var(--border); font-weight:700; text-align:left;">${c}</th>`).join('') + '</tr></thead><tbody>';
      } else {
        tableHTML += '<tr>' + cells.map(c => `<td style="padding: 8px 12px; border: 1px solid var(--border);">${c}</td>`).join('') + '</tr>';
      }
    } else {
      if (inTable) {
        inTable = false;
        tableHTML += '</tbody></table></div>';
        lines[i] = tableHTML + '\n' + lines[i];
        tableHTML = '';
      }
    }
  }
  if (inTable) {
    tableHTML += '</tbody></table></div>';
    html = lines.join('\n') + '\n' + tableHTML;
  } else {
    html = lines.join('\n');
  }

  // Format Headers
  html = html.replace(/^### (.*?)$/gm, '<h4 style="font-weight:700; margin:14px 0 6px; font-size:1.05em; color:var(--primary);">$1</h4>');
  html = html.replace(/^## (.*?)$/gm, '<h3 style="font-family:\'Playfair Display\',serif; font-weight:700; margin:18px 0 8px; font-size:1.2em; color:var(--primary);">$1</h3>');
  html = html.replace(/^# (.*?)$/gm, '<h2 style="font-family:\'Playfair Display\',serif; font-weight:700; margin:22px 0 10px; font-size:1.4em; color:var(--primary);">$1</h2>');

  // Format Bullet Points
  html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li style="margin-left: 20px; list-style-type: disc; margin-bottom: 4px;">$1</li>');
  html = html.replace(/(<li.*?>.*?<\/li>\n?)+/gs, (match) => `<ul style="margin: 8px 0;">${match}</ul>`);

  // Format Code Blocks
  html = html.replace(/```(.*?)\n([\s\S]*?)```/g, '<pre style="background:var(--bg); padding:10px; border-radius:8px; overflow-x:auto; margin:10px 0; border:1px solid var(--border);"><code style="font-family:monospace; font-size:0.9em; white-space:pre-wrap;">$2</code></pre>');

  // Format Inline Code
  html = html.replace(/`(.*?)`/g, '<code style="font-family:monospace; background:rgba(0,0,0,0.05); padding:2px 4px; border-radius:4px;">$1</code>');

  // Format Bold Text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Format Linebreaks
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/(<br>\s*){2,}/g, '<br><br>');
  
  return html;
}

// ── Run AI Action Functions ──────────────────────────
async function runAIForecast() {
  const container = document.getElementById('gemini-report-body');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;">
      <div class="gemini-typing" style="justify-content:center; margin-bottom:12px;"><span></span><span></span><span></span></div>
      <div style="font-size:0.85em; color:var(--text-muted);">Fetching database metrics and generating predictive forecast...</div>
    </div>`;

  try {
    const summary = await getBusinessContextSummary();
    const prompt = `${summary}
You are an expert financial and business operations analyst. 
Based on the historical monthly performance, top customers, and order volumes above:
1. Provide a detailed demand forecasting for next month (estimated order count).
2. Predict estimated revenue next month and outline the growth rate.
3. Outline key operational recommendations (staffing, drivers scheduling, inventory restocking).
Keep your analysis detailed, professional, structured in clear markdown headers, and include a summary table.`;

    const report = await callGemini(prompt);
    container.style.display = 'block';
    container.style.background = 'transparent';
    container.style.padding = '0px';
    container.innerHTML = `<div style="padding:15px; overflow-y:auto; max-height: 520px;">${formatMarkdown(report)}</div>`;
    document.getElementById('clear-report-btn').style.display = 'block';
  } catch (error) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--danger);">
        <i class="fas fa-exclamation-triangle" style="font-size:2em; margin-bottom:10px;"></i>
        <div>Failed to generate forecast: ${error.message}</div>
      </div>`;
  }
}

async function runAIEfficiency() {
  const container = document.getElementById('gemini-report-body');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;">
      <div class="gemini-typing" style="justify-content:center; margin-bottom:12px;"><span></span><span></span><span></span></div>
      <div style="font-size:0.85em; color:var(--text-muted);">Aggregating driver schedules, customer volumes and analyzing logistics efficiency...</div>
    </div>`;

  try {
    const summary = await getBusinessContextSummary();
    const prompt = `${summary}
You are a logistics operations and customer relationship efficiency expert.
Based on the driver performance metrics and top customer counts above:
1. Analyze driver turnaround efficiency and outline which drivers are highest performers.
2. Outline potential logistics bottleneck areas (e.g. pending requests, low success rates).
3. Evaluate customer concentration risks (are we relying too heavily on few hotels?) and provide retention strategies.
4. Give 3 actionable efficiency recommendations to decrease turnaround times.
Structure your report professionally with clear markdown headers and format tables/bullets.`;

    const report = await callGemini(prompt);
    container.style.display = 'block';
    container.style.background = 'transparent';
    container.style.padding = '0px';
    container.innerHTML = `<div style="padding:15px; overflow-y:auto; max-height: 520px;">${formatMarkdown(report)}</div>`;
    document.getElementById('clear-report-btn').style.display = 'block';
  } catch (error) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--danger);">
        <i class="fas fa-exclamation-triangle" style="font-size:2em; margin-bottom:10px;"></i>
        <div>Failed to analyze efficiency: ${error.message}</div>
      </div>`;
  }
}

function clearAIReport() {
  const container = document.getElementById('gemini-report-body');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align: center; color: var(--text-muted);">
      <i class="fas fa-wand-magic-sparkles" style="font-size: 2.2em; color:#8b5cf6; margin-bottom: 14px; display: block;"></i>
      Click an action card above to generate a forecasting report or efficiency analysis.
    </div>`;
  container.style.display = 'flex';
  container.style.background = 'rgba(0,0,0,0.01)';
  container.style.padding = '20px';
  document.getElementById('clear-report-btn').style.display = 'none';
}

// ── Get Active Screen Context ───────────────────────
function getScreenContext() {
  const currentTitle = document.getElementById('page-title')?.textContent || 'Dashboard';
  const contentEl = document.getElementById('content');
  let screenText = '';
  
  if (contentEl) {
    screenText = contentEl.innerText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .substring(0, 15000); // Safe limit to prevent massive token usage
  }

  // Detect open modals
  const activeModals = Array.from(document.querySelectorAll('.modal-overlay'))
    .filter(el => el.style.display === 'flex' || el.style.display === 'block');
  
  let modalText = '';
  if (activeModals.length > 0) {
    modalText = activeModals.map(m => {
      const title = m.querySelector('.modal-title')?.textContent || 'Modal Window';
      const body = m.querySelector('.modal-body, div[id$="-body"]')?.innerText || m.innerText;
      return `[Open Modal - ${title}]:\n${body}`;
    }).join('\n');
  }

  return `
### CURRENT VISUAL SCREEN CONTEXT
User is currently viewing the page: "${currentTitle}"
Visual Text Content on Screen:
"""
${screenText}
"""
${modalText ? `\nActive Open Modal Text:\n"""\n${modalText}\n"""` : ''}
`;
}

// ── In-page Chat Interaction ────────────────────────
function handleGeminiChatKey(event) {
  if (event.key === 'Enter') {
    sendGeminiChatMessage();
  }
}

async function sendGeminiChatMessage() {
  const inputEl = document.getElementById('gemini-chat-input');
  if (!inputEl) return;
  const userText = inputEl.value.trim();
  if (!userText) return;

  // Add User message
  geminiChatHistory.push({ role: 'user', content: userText });
  inputEl.value = '';
  renderChatBubbles('gemini-chat-history');

  // Add typing indicator
  const historyContainer = document.getElementById('gemini-chat-history');
  const typingBubble = document.createElement('div');
  typingBubble.id = 'chat-typing-indicator';
  typingBubble.className = 'gemini-typing';
  typingBubble.style.alignSelf = 'flex-start';
  typingBubble.innerHTML = '<span></span><span></span><span></span>';
  historyContainer.appendChild(typingBubble);
  historyContainer.scrollTop = historyContainer.scrollHeight;

  try {
    const summary = await getBusinessContextSummary();
    const screenCtx = getScreenContext();
    const messagesContext = geminiChatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    const prompt = `${summary}
${screenCtx}

Here is the chat history:
${messagesContext}

You are SAGA AI, the smart assistant for Sagacious Washing Center POS. Answer the user's message directly, naturally, and concisely. 
CRITICAL: ONLY provide metric reports, lists of orders/customers, or financial stats if the user specifically requests them or if they are directly relevant to answering the user's query. If the user greets you (e.g. "How are you?"), respond naturally without printing any database summaries, tables, or metric snapshots.`;

    const aiResponse = await callGemini(prompt);
    
    // Remove typing bubble
    document.getElementById('chat-typing-indicator')?.remove();

    geminiChatHistory.push({ role: 'ai', content: aiResponse });
    renderChatBubbles('gemini-chat-history');
  } catch (error) {
    document.getElementById('chat-typing-indicator')?.remove();
    geminiChatHistory.push({ role: 'system', content: `Error: ${error.message}` });
    renderChatBubbles('gemini-chat-history');
  }
}

function renderChatBubbles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let html = `<div class="gemini-msg system">I am SAGA AI, your business assistant. You can ask me questions about customer accounts, unpaid balances, best drivers, or monthly sales growth!</div>`;
  
  geminiChatHistory.forEach(m => {
    if (m.role === 'user') {
      html += `<div class="gemini-msg user">${m.content}</div>`;
    } else if (m.role === 'ai') {
      html += `<div class="gemini-msg ai">${formatMarkdown(m.content)}</div>`;
    } else if (m.role === 'system') {
      html += `<div class="gemini-msg system" style="color:var(--danger);">${m.content}</div>`;
    }
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// ── Floating Drawer Assistant ───────────────────────
let geminiDrawerHistory = [];

function toggleGeminiDrawer() {
  const drawer = document.getElementById('gemini-drawer');
  if (!drawer) return;
  
  const isOpen = drawer.classList.toggle('open');
  const fab = document.getElementById('gemini-fab');
  if (fab) {
    fab.classList.toggle('active', isOpen);
    fab.innerHTML = isOpen ? '<i class="fas fa-times"></i>' : '<i class="fas fa-wand-magic-sparkles"></i>';
  }

  if (isOpen) {
    DB.getSetting('gemini_api_key').then((apiKey) => {
      const providerName = 'Gemini';
      const container = document.getElementById('gemini-drawer-chat');
      if (!apiKey) {
        container.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); margin-top: 40px; padding: 20px;">
            <i class="fas fa-exclamation-circle" style="font-size: 2.5em; color: var(--warning); margin-bottom: 12px;"></i>
            <h4 style="font-weight: 700; margin-bottom: 6px; color: var(--primary);">AI API Key Missing</h4>
            <p style="font-size:0.83em; line-height:1.5;">To use the AI Quick Assistant, please go to settings and add your API Key first.</p>
            <button class="btn btn-primary btn-sm" style="margin: 14px auto 0;" onclick="toggleGeminiDrawer(); navigate('settings')"><i class="fas fa-cog"></i> Configure Now</button>
          </div>`;
      } else {
        if (geminiDrawerHistory.length === 0) {
          container.innerHTML = `
            <div class="gemini-msg system">
              Welcome to the AI Quick Assistant (powered by ${providerName})! Ask anything about the POS data, invoicing status, or sales from any page.
            </div>`;
        } else {
          renderDrawerChatBubbles();
        }
      }
    });
  }
}

function handleGeminiDrawerKey(event) {
  if (event.key === 'Enter') {
    sendGeminiDrawerMessage();
  }
}

async function sendGeminiDrawerMessage() {
  const inputEl = document.getElementById('gemini-drawer-input');
  if (!inputEl) return;
  const userText = inputEl.value.trim();
  if (!userText) return;

  // Add User message
  geminiDrawerHistory.push({ role: 'user', content: userText });
  inputEl.value = '';
  renderDrawerChatBubbles();

  // Add typing indicator
  const historyContainer = document.getElementById('gemini-drawer-chat');
  const typingBubble = document.createElement('div');
  typingBubble.id = 'drawer-typing-indicator';
  typingBubble.className = 'gemini-typing';
  typingBubble.style.alignSelf = 'flex-start';
  typingBubble.innerHTML = '<span></span><span></span><span></span>';
  historyContainer.appendChild(typingBubble);
  historyContainer.scrollTop = historyContainer.scrollHeight;

  try {
    const summary = await getBusinessContextSummary();
    const screenCtx = getScreenContext();
    const messagesContext = geminiDrawerHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    const prompt = `${summary}
${screenCtx}

Here is the chat history:
${messagesContext}

You are SAGA AI, the smart assistant for Sagacious Washing Center POS. Answer the user's message directly, naturally, and concisely. 
CRITICAL: ONLY provide metric reports, lists of orders/customers, or financial stats if the user specifically requests them or if they are directly relevant to answering the user's query. If the user greets you (e.g. "How are you?"), respond naturally without printing any database summaries, tables, or metric snapshots.`;

    const aiResponse = await callGemini(prompt);
    
    // Remove typing bubble
    document.getElementById('drawer-typing-indicator')?.remove();

    geminiDrawerHistory.push({ role: 'ai', content: aiResponse });
    renderDrawerChatBubbles();
  } catch (error) {
    document.getElementById('drawer-typing-indicator')?.remove();
    geminiDrawerHistory.push({ role: 'system', content: `Error: ${error.message}` });
    renderDrawerChatBubbles();
  }
}

function renderDrawerChatBubbles() {
  const container = document.getElementById('gemini-drawer-chat');
  if (!container) return;

  let html = `<div class="gemini-msg system">Welcome to SAGA AI! Ask anything about the POS data, invoicing status, or sales from any page.</div>`;
  
  geminiDrawerHistory.forEach(m => {
    if (m.role === 'user') {
      html += `<div class="gemini-msg user">${m.content}</div>`;
    } else if (m.role === 'ai') {
      html += `<div class="gemini-msg ai">${formatMarkdown(m.content)}</div>`;
    } else if (m.role === 'system') {
      html += `<div class="gemini-msg system" style="color:var(--danger);">${m.content}</div>`;
    }
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}
