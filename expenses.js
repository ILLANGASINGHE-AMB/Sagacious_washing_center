// expenses.js - SAGA Washing Center Expenses & Chemical Management Module

const ExpensesModule = {
  activeSubTab: 'register', // 'register' | 'general' | 'master' | 'summary'

  async init() {
    this.renderLayout();
    await this.switchSubTab(this.activeSubTab);
  },

  renderLayout() {
    const container = document.getElementById('page-expenses');
    if (!container) return;

    container.innerHTML = `
      <div class="p-4 sm:p-6 space-y-6">
        <!-- Header & Title -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid font-bold fa-receipt text-indigo-600 dark:text-indigo-400"></i>
              Expenses & Chemical Stock Register
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Track chemical stock (IN / OUT / BAL), general operational expenses, and monthly expense averaging.
            </p>
          </div>
          
          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-2 overflow-x-auto shrink-0">
            <button onclick="ExpensesModule.openAddGeneralExpenseModal()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap">
              <i class="fa-solid fa-plus text-xs"></i> General Expense
            </button>
            <button onclick="ExpensesModule.openAddChemLogModal('IN')" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap">
              <i class="fa-solid fa-cart-plus text-xs"></i> Purchase Stock (IN)
            </button>
            <button onclick="ExpensesModule.openAddChemLogModal('OUT')" class="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap">
              <i class="fa-solid fa-flask-vial text-xs"></i> Log Usage (OUT)
            </button>
          </div>
        </div>

        <!-- Navigation Sub-Tabs -->
        <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto">
          <button id="exp-subtab-register" onclick="ExpensesModule.switchSubTab('register')" class="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 border">
            <i class="fa-solid fa-table-cells"></i> Chemical Stock Register
          </button>
          <button id="exp-subtab-general" onclick="ExpensesModule.switchSubTab('general')" class="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 border">
            <i class="fa-solid fa-file-invoice-dollar"></i> General Expenses
          </button>
          <button id="exp-subtab-master" onclick="ExpensesModule.switchSubTab('master')" class="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 border">
            <i class="fa-solid fa-boxes-stacked"></i> Chemical Master Catalog
          </button>
          <button id="exp-subtab-summary" onclick="ExpensesModule.switchSubTab('summary')" class="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 border">
            <i class="fa-solid fa-chart-pie"></i> Expense Summary & Averaging
          </button>
        </div>

        <!-- Dynamic Sub-Tab Content -->
        <div id="expenses-subtab-content" class="min-h-[400px]"></div>
      </div>
    `;
  },

  async switchSubTab(subTab) {
    this.activeSubTab = subTab;
    const tabs = ['register', 'general', 'master', 'summary'];
    
    tabs.forEach(t => {
      const btn = document.getElementById(`exp-subtab-${t}`);
      if (btn) {
        if (t === subTab) {
          btn.className = 'px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 bg-indigo-600 text-white border-indigo-600 shadow-sm';
        } else {
          btn.className = 'px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700';
        }
      }
    });

    const contentDiv = document.getElementById('expenses-subtab-content');
    if (!contentDiv) return;

    if (subTab === 'register') {
      await this.renderChemicalRegister(contentDiv);
    } else if (subTab === 'general') {
      await this.renderGeneralExpenses(contentDiv);
    } else if (subTab === 'master') {
      await this.renderChemicalMaster(contentDiv);
    } else if (subTab === 'summary') {
      await this.renderExpenseSummary(contentDiv);
    }
  },

  // ──────────────────────────────────────────
  // 1. CHEMICAL STOCK REGISTER (IN | OUT | BAL Matrix)
  // ──────────────────────────────────────────
  async renderChemicalRegister(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p>Loading Chemical Register...</p></div>`;

    const [chemicals, logs] = await Promise.all([
      DB.getChemicals(),
      DB.getChemicalLedger()
    ]);

    const activeChems = chemicals.filter(c => c.status !== 'Inactive');

    if (activeChems.length === 0) {
      container.innerHTML = `
        <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
          <i class="fa-solid fa-flask text-4xl text-slate-300 mb-3"></i>
          <h3 class="text-base font-bold text-slate-700 dark:text-slate-200">No Chemicals Found</h3>
          <p class="text-xs text-slate-500 mt-1 mb-4">Add chemicals to the catalog to start tracking stock IN / OUT / BAL.</p>
          <button onclick="ExpensesModule.switchSubTab('master')" class="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl">Go to Chemical Master</button>
        </div>
      `;
      return;
    }

    // Group logs chronologically
    const dateMap = {}; // { 'YYYY-MM-DD': { 'CHM-0001': { in: 0, out: 0, expense_id: '' }, ... } }

    logs.forEach(log => {
      const d = log.date;
      const cid = log.chemical_id;
      if (!dateMap[d]) dateMap[d] = {};
      if (!dateMap[d][cid]) dateMap[d][cid] = { in: 0, out: 0, expense_id: log.expense_id || '', notes: log.notes || '' };

      if (log.type === 'IN') {
        dateMap[d][cid].in += parseFloat(log.qty_in || 0);
        if (log.expense_id) dateMap[d][cid].expense_id = log.expense_id;
      } else {
        dateMap[d][cid].out += parseFloat(log.qty_out || 0);
      }
    });

    const dates = Object.keys(dateMap).sort((a,b) => new Date(a) - new Date(b));

    // Render matrix table header
    let thChemicalsHTML = '';
    activeChems.forEach(c => {
      thChemicalsHTML += `
        <th colspan="3" class="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider border-b border-l border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-750 text-indigo-700 dark:text-indigo-300">
          <div>${c.name}</div>
          <div class="text-[10px] font-mono text-slate-400 font-normal">(${c.chemical_id} - ${c.unit})</div>
        </th>
      `;
    });

    let thSubHTML = '';
    activeChems.forEach(() => {
      thSubHTML += `
        <th class="px-2 py-1.5 text-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border-l border-slate-200 dark:border-slate-700 bg-emerald-50/50 dark:bg-emerald-950/20">IN</th>
        <th class="px-2 py-1.5 text-center text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">OUT</th>
        <th class="px-2 py-1.5 text-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20">BAL</th>
      `;
    });

    // Compute running balance rows
    let tableRowsHTML = '';
    const runningBal = {};
    activeChems.forEach(c => { runningBal[c.chemical_id] = 0; });

    if (dates.length === 0) {
      tableRowsHTML = `
        <tr>
          <td colspan="${1 + activeChems.length * 3}" class="px-4 py-8 text-center text-xs text-slate-400">
            No stock movements recorded yet. Click <strong>"Purchase Chemical (IN)"</strong> or <strong>"Log Usage (OUT)"</strong> above to record transactions.
          </td>
        </tr>
      `;
    } else {
      dates.forEach(d => {
        tableRowsHTML += `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors border-b border-slate-200 dark:border-slate-700">
            <td class="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono whitespace-nowrap bg-white dark:bg-slate-800">
              ${d}
            </td>
        `;

        activeChems.forEach(c => {
          const cid = c.chemical_id;
          const entry = dateMap[d][cid] || { in: 0, out: 0, expense_id: '' };
          
          runningBal[cid] = runningBal[cid] + entry.in - entry.out;

          const inText = entry.in > 0 ? `<span class="text-emerald-600 font-semibold">+${entry.in}</span>` : `<span class="text-slate-300 dark:text-slate-600">-</span>`;
          const outText = entry.out > 0 ? `<span class="text-amber-600 font-semibold">-${entry.out}</span>` : `<span class="text-slate-300 dark:text-slate-600">-</span>`;
          const balText = `<span class="font-bold ${runningBal[cid] <= 0 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}">${runningBal[cid].toFixed(2)}</span>`;

          const expTag = entry.expense_id ? `<div class="text-[9px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1 rounded inline-block mt-0.5" title="${entry.expense_id}">${entry.expense_id}</div>` : '';

          tableRowsHTML += `
            <td class="px-2 py-2 text-center text-xs border-l border-slate-200 dark:border-slate-700">
              ${inText}
              ${expTag}
            </td>
            <td class="px-2 py-2 text-center text-xs">
              ${outText}
            </td>
            <td class="px-2 py-2 text-center text-xs bg-slate-50/50 dark:bg-slate-900/30">
              ${balText}
            </td>
          `;
        });

        tableRowsHTML += `</tr>`;
      });
    }

    // Current Total Stock Row
    let summaryColsHTML = '';
    activeChems.forEach(c => {
      const bal = runningBal[c.chemical_id] || 0;
      summaryColsHTML += `
        <td colspan="3" class="px-2 py-3 text-center border-l border-slate-300 dark:border-slate-600 bg-indigo-50 dark:bg-indigo-950/40">
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">${c.name} Stock</div>
          <div class="text-sm font-extrabold ${bal <= 0 ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-400'}">${bal.toFixed(2)} ${c.unit}</div>
        </td>
      `;
    });

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-book-bookmark text-indigo-500"></i> Chemical Register Log (IN / OUT / BAL)
            </h2>
            <p class="text-xs text-slate-500">Structured register matching factory chemical record keeping.</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="ExpensesModule.openAddChemLogModal('IN')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i> Purchase IN
            </button>
            <button onclick="ExpensesModule.openAddChemLogModal('OUT')" class="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 flex items-center gap-1.5">
              <i class="fa-solid fa-minus"></i> Use OUT
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <th class="px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-28">Date</th>
                ${thChemicalsHTML}
              </tr>
              <tr class="bg-slate-100/70 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th class="px-3 py-1 text-[10px] text-slate-400 font-normal">YYYY-MM-DD</th>
                ${thSubHTML}
              </tr>
            </thead>
            <tbody>
              ${tableRowsHTML}
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                <td class="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 uppercase font-bold bg-indigo-50 dark:bg-indigo-950/40">Current Stock</td>
                ${summaryColsHTML}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────
  // 2. GENERAL EXPENSES SUB-TAB
  // ──────────────────────────────────────────
  async renderGeneralExpenses(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p>Loading General Expenses...</p></div>`;

    const expenses = await DB.getGeneralExpenses();

    let rowsHTML = '';
    let totalCash = 0;
    let totalAveraged = 0;

    if (expenses.length === 0) {
      rowsHTML = `
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-xs text-slate-400">
            No general expenses recorded yet. Click <strong>"Add General Expense"</strong> above to log bills like Stationery, Diesel, Electricity, Water, etc.
          </td>
        </tr>
      `;
    } else {
      expenses.forEach(exp => {
        totalCash += (exp.amount || 0);
        totalAveraged += (exp.monthly_averaged_amount || exp.amount || 0);

        const isMultiMonth = (exp.months_covered || 1) > 1;

        rowsHTML += `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors border-b border-slate-200 dark:border-slate-700">
            <td class="px-4 py-3 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
              ${exp.expense_id}
            </td>
            <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">
              ${exp.expense_date}
            </td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-white">
              ${exp.expense_name}
              ${exp.notes ? `<div class="text-[10px] text-slate-400 font-normal mt-0.5">${exp.notes}</div>` : ''}
            </td>
            <td class="px-4 py-3 text-xs text-right font-bold text-slate-800 dark:text-white whitespace-nowrap">
              LKR ${parseFloat(exp.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </td>
            <td class="px-4 py-3 text-xs text-center font-medium text-slate-600 dark:text-slate-400">
              ${isMultiMonth ? `<span class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full font-bold text-[11px]">${exp.months_covered} mos</span>` : '<span class="text-slate-400">1 mo</span>'}
            </td>
            <td class="px-4 py-3 text-xs text-right font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
              LKR ${parseFloat(exp.monthly_averaged_amount || exp.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} /mo
            </td>
            <td class="px-4 py-3 text-xs text-center">
              <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[11px]">${exp.payment_method || 'Cash'}</span>
            </td>
            <td class="px-4 py-3 text-xs text-center">
              ${canDelete() ? `
                <button onclick="ExpensesModule.deleteGeneralExpense('${exp.id}')" class="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors" title="Delete Expense">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              ` : ''}
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div class="space-y-4">
        <!-- Summary Banner Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Outflow (Cash View)</div>
              <div class="text-xl font-extrabold text-slate-800 dark:text-white mt-1">
                LKR ${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
              <i class="fa-solid fa-wallet"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Monthly Averaged Outlay</div>
              <div class="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                LKR ${totalAveraged.toLocaleString('en-US', { minimumFractionDigits: 2 })} / mo
              </div>
            </div>
            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
              <i class="fa-solid fa-calculator"></i>
            </div>
          </div>
        </div>

        <!-- Table Container -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-receipt text-indigo-500"></i> General & Operational Expenses Records
              </h2>
              <p class="text-xs text-slate-500">Stationery, Diesel, Electricity, Water, Repairs, Maintenance, Salaries, etc.</p>
            </div>
            <button onclick="ExpensesModule.openAddGeneralExpenseModal()" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs shadow-sm flex items-center gap-2">
              <i class="fa-solid fa-plus"></i> Add New Expense
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <th class="px-4 py-3">Expense ID</th>
                  <th class="px-4 py-3">Date</th>
                  <th class="px-4 py-3">Description / Name</th>
                  <th class="px-4 py-3 text-right">Total Amount</th>
                  <th class="px-4 py-3 text-center">Period</th>
                  <th class="px-4 py-3 text-right">Monthly Avg</th>
                  <th class="px-4 py-3 text-center">Method</th>
                  <th class="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────
  // 3. CHEMICAL MASTER SUB-TAB
  // ──────────────────────────────────────────
  async renderChemicalMaster(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p>Loading Chemical Catalog...</p></div>`;

    const [chemicals, logs] = await Promise.all([
      DB.getChemicals(),
      DB.getChemicalLedger()
    ]);

    // Calculate purchased (IN), used (OUT), remaining, and latest activity date per chemical
    const purchasedMap = {};
    const usedMap = {};
    const latestDateMap = {};

    logs.forEach(log => {
      const cid = log.chemical_id;
      if (!purchasedMap[cid]) purchasedMap[cid] = 0;
      if (!usedMap[cid]) usedMap[cid] = 0;

      if (log.type === 'IN') {
        purchasedMap[cid] += parseFloat(log.qty_in || 0);
      } else if (log.type === 'OUT') {
        usedMap[cid] += parseFloat(log.qty_out || 0);
      }

      if (log.date) {
        if (!latestDateMap[cid] || new Date(log.date) > new Date(latestDateMap[cid])) {
          latestDateMap[cid] = log.date;
        }
      }
    });

    let rowsHTML = '';
    chemicals.forEach(c => {
      const cid = c.chemical_id;
      const purchased = purchasedMap[cid] || 0;
      const used = usedMap[cid] || 0;
      const remaining = purchased - used;

      let rawDate = latestDateMap[cid] || c.updated_at || c.created_at;
      let dateStr = '-';
      if (rawDate) {
        dateStr = String(rawDate).split('T')[0];
      }

      let pkgStr = 'N/A';
      if (c.package_size) {
        const pkgLower = String(c.package_size).toLowerCase();
        const unitLower = String(c.unit || '').toLowerCase();
        if (unitLower && pkgLower.includes(unitLower)) {
          pkgStr = c.package_size;
        } else {
          pkgStr = `${c.package_size} ${c.unit || ''}`.trim();
        }
      } else if (c.unit) {
        pkgStr = c.unit;
      }

      const purchasedBadge = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">+${purchased.toFixed(2)} ${c.unit}</span>`;
      
      const isLowOrZero = remaining <= 0;
      const remainingBadge = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${isLowOrZero ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'}">${remaining.toFixed(2)} ${c.unit}</span>`;

      rowsHTML += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors border-b border-slate-200 dark:border-slate-700">
          <td class="px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
            ${dateStr}
          </td>
          <td class="px-4 py-3 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
            ${c.chemical_id}
          </td>
          <td class="px-4 py-3 text-xs font-bold text-slate-800 dark:text-white">
            ${c.name}
          </td>
          <td class="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
            ${pkgStr}
          </td>
          <td class="px-4 py-3 text-xs text-center font-bold">
            ${purchasedBadge}
          </td>
          <td class="px-4 py-3 text-xs text-center font-bold">
            ${remainingBadge}
          </td>
          <td class="px-4 py-3 text-xs text-center">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${c.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-slate-100 text-slate-600'}">
              ${c.status || 'Active'}
            </span>
          </td>
          <td class="px-4 py-3 text-xs text-center">
            ${canDelete() ? `
              <button onclick="ExpensesModule.deleteChemical('${c.id}')" class="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors" title="Delete Chemical">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-flask-vial text-indigo-500"></i> Chemical Master Catalog
            </h2>
            <p class="text-xs text-slate-500">Permanent chemical product definitions pre-structured for stock tracking.</p>
          </div>
          <button onclick="ExpensesModule.openAddChemicalMasterModal()" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs shadow-sm flex items-center gap-2">
            <i class="fa-solid fa-plus"></i> Add New Chemical
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <th class="px-4 py-3">Updated Date</th>
                <th class="px-4 py-3">Chemical ID</th>
                <th class="px-4 py-3">Chemical Name</th>
                <th class="px-4 py-3">Standard Package Size</th>
                <th class="px-4 py-3 text-center">Purchased</th>
                <th class="px-4 py-3 text-center">Remaining</th>
                <th class="px-4 py-3 text-center">Status</th>
                <th class="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────
  // 4. EXPENSE SUMMARY & AVERAGING
  // ──────────────────────────────────────────
  async renderExpenseSummary(container) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p>Generating Financial Summary...</p></div>`;

    const [orders, genExpenses, chemLogs, trips, fuelConfig] = await Promise.all([
      DB.getOrders(),
      DB.getGeneralExpenses(),
      DB.getChemicalLedger(),
      DB.getTrips(),
      DB.getFuelPriceSettings()
    ]);

    // Calculate Dashboard Aligned Totals
    const curMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const monthlyIncome = orders.filter(o => (o.created_at || '').startsWith(curMonth)).reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const totalIncome = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

    let totalChemPurchases = 0;
    chemLogs.forEach(l => {
      if (l.type === 'IN') {
        totalChemPurchases += parseFloat(l.total_amount || 0);
      }
    });

    let totalGeneralExpenses = 0;
    let totalAveragedGeneral = 0;
    let manualTransportExpenses = 0;

    genExpenses.forEach(g => {
      const amt = parseFloat(g.amount || 0);
      totalGeneralExpenses += amt;
      totalAveragedGeneral += parseFloat(g.monthly_averaged_amount || g.amount || 0);

      const isTransportCat = (g.expense_category === 'Transport Cost') || 
                             (g.expense_name || '').toLowerCase().includes('transport') ||
                             (g.expense_name || '').toLowerCase().includes('tyre') ||
                             (g.expense_name || '').toLowerCase().includes('vehicle');
      if (isTransportCat) {
        manualTransportExpenses += amt;
      }
    });

    // Calculate Transport Fuel Costs from completed trips
    const monthlyDistanceMap = {};
    trips.forEach(t => {
      if (t.status === 'Completed' && t.distance_km) {
        const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
        if (dateStr && dateStr.length >= 7) {
          const mKey = dateStr.slice(0, 7);
          if (!monthlyDistanceMap[mKey]) monthlyDistanceMap[mKey] = 0;
          monthlyDistanceMap[mKey] += parseFloat(t.distance_km || 0);
        }
      }
    });

    // Monthly Fuel Cost (Current Month)
    const curMonthDist = monthlyDistanceMap[curMonth] || 0;
    const curMonthFuelConfig = (fuelConfig.monthly_prices && fuelConfig.monthly_prices[curMonth]) 
      ? fuelConfig.monthly_prices[curMonth] 
      : fuelConfig;
    const curRatePerKm = parseFloat(curMonthFuelConfig.cost_per_km || (curMonthFuelConfig.current_price / (curMonthFuelConfig.km_per_litre || 1)) || 37);
    const curMonthlyFuelCost = curMonthDist * curRatePerKm;

    // Full Cost = Sum of monthly fuel cost in LKR across all recorded months
    let fullFuelCostLKR = 0;
    Object.keys(monthlyDistanceMap).forEach(mKey => {
      const mDist = monthlyDistanceMap[mKey];
      const mPriceConfig = (fuelConfig.monthly_prices && fuelConfig.monthly_prices[mKey]) 
        ? fuelConfig.monthly_prices[mKey] 
        : fuelConfig;
      const ratePerKm = parseFloat(mPriceConfig.cost_per_km || (mPriceConfig.current_price / (mPriceConfig.km_per_litre || 1)) || 37);
      fullFuelCostLKR += (mDist * ratePerKm);
    });

    const totalTransportCost = fullFuelCostLKR + manualTransportExpenses;

    const totalCashOutlay = totalChemPurchases + totalGeneralExpenses + fullFuelCostLKR;
    const totalAveragedExpenses = totalChemPurchases + totalAveragedGeneral + curMonthlyFuelCost;

    const monthlyNetProfit = monthlyIncome - totalAveragedExpenses;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Overview Banner -->
        <div class="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md">
          <h2 class="text-xl font-extrabold flex items-center gap-2">
            <i class="fa-solid fa-chart-line text-indigo-400"></i> Financial Balance & Operating Margin Summary
          </h2>
          <p class="text-xs text-indigo-200 mt-1">Comparing Monthly Income against Chemical, Operational & Transport Expenses.</p>

          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
            <div class="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
              <div class="text-xs font-semibold text-indigo-200 uppercase">Monthly Income</div>
              <div class="text-xl font-black text-emerald-400 mt-1">
                LKR ${monthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div class="text-[10px] text-indigo-300 mt-0.5">Matches Dashboard</div>
            </div>

            <div class="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
              <div class="text-xs font-semibold text-indigo-200 uppercase">Total Income (All-Time)</div>
              <div class="text-xl font-black text-cyan-400 mt-1">
                LKR ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div class="text-[10px] text-indigo-300 mt-0.5">Matches Dashboard</div>
            </div>

            <div class="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
              <div class="text-xs font-semibold text-indigo-200 uppercase">Total Cash Expenses</div>
              <div class="text-xl font-black ${totalCashOutlay > 0 ? 'text-rose-400' : 'text-slate-300'} mt-1">
                LKR ${totalCashOutlay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div class="text-[10px] text-indigo-300 mt-0.5">Incl. Chemical, Operational & Full Fuel</div>
            </div>

            <div class="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
              <div class="text-xs font-semibold text-indigo-200 uppercase">Monthly Net Profit</div>
              <div class="text-xl font-black ${monthlyNetProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'} mt-1">
                LKR ${monthlyNetProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div class="text-[10px] text-indigo-300 mt-0.5">Income - (Avg Ops + Chem + Monthly Fuel)</div>
            </div>
          </div>
        </div>

        <!-- Detailed Breakdown Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Chemical Expense Summary Card -->
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-flask text-indigo-500"></i> Chemical Inventory Expenses
            </h3>
            <div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700 text-xs">
              <span class="text-slate-500">Total Chemical Purchases (IN)</span>
              <span class="font-bold text-slate-800 dark:text-white">LKR ${totalChemPurchases.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="flex justify-between items-center py-2 text-xs">
              <span class="text-slate-500">Stock Movements Count</span>
              <span class="font-bold text-indigo-600 dark:text-indigo-400">${chemLogs.length} logs recorded</span>
            </div>
          </div>

          <!-- General Expense Summary Card -->
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-file-invoice text-indigo-500"></i> Operational Expenses & Averaging
            </h3>
            <div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700 text-xs">
              <span class="text-slate-500">Actual Outflow (Cash View)</span>
              <span class="font-bold text-slate-800 dark:text-white">LKR ${totalGeneralExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="flex justify-between items-center py-2 text-xs">
              <span class="text-slate-500">Monthly Averaged Outlay</span>
              <span class="font-bold text-indigo-600 dark:text-indigo-400">LKR ${totalAveragedGeneral.toLocaleString('en-US', { minimumFractionDigits: 2 })} / mo</span>
            </div>
          </div>

          <!-- Transport & Fleet Cost Summary Card -->
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3 md:col-span-2">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-truck-fast text-purple-600"></i> Transport & Fleet Operating Costs
              </h3>
              <span class="text-xs font-semibold px-2.5 py-0.5 bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 rounded-full font-mono">Expense Category: Transport Cost</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
              <div class="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/40">
                <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Current Month Fuel Cost</div>
                <div class="text-lg font-extrabold text-purple-700 dark:text-purple-300 mt-1 font-mono">
                  LKR ${curMonthlyFuelCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">${curMonthDist.toFixed(1)} KM @ LKR ${curRatePerKm.toFixed(2)}/KM</div>
              </div>

              <div class="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/40">
                <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Full Cost (Sum of Monthly Fuel)</div>
                <div class="text-lg font-extrabold text-purple-800 dark:text-purple-200 mt-1 font-mono">
                  LKR ${fullFuelCostLKR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">Sum of all monthly fuel outlays</div>
              </div>

              <div class="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/40">
                <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Vehicle Repairs & Tyres</div>
                <div class="text-lg font-extrabold text-slate-800 dark:text-white mt-1 font-mono">
                  LKR ${manualTransportExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">Category: Transport Cost</div>
              </div>

              <div class="p-3 bg-purple-600 text-white rounded-xl shadow-sm">
                <div class="text-[11px] font-semibold text-purple-200 uppercase">Total Transport Outlay</div>
                <div class="text-lg font-black mt-1 font-mono">
                  LKR ${totalTransportCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div class="text-[10px] text-purple-200 mt-0.5">Fuel + Vehicle Maintenance</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────
  // MODALS & INPUT HANDLERS
  // ──────────────────────────────────────────
  async openAddGeneralExpenseModal() {
    const defaultDate = new Date().toISOString().split('T')[0];
    const expId = await DB.generateExpenseId();

    const html = `
      <div id="general-expense-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-plus-circle text-indigo-600"></i> Add General Expense
            </h3>
            <button onclick="document.getElementById('general-expense-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="ExpensesModule.saveGeneralExpense(event)" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense ID</label>
              <input type="text" value="${expId}" readonly class="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense Category *</label>
              <select id="gen-exp-category" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 font-bold">
                <option value="General Operational">General Operational</option>
                <option value="Transport Cost">Transport Cost (Tyres, Fuel, Repairs, Vehicle)</option>
                <option value="Utilities">Utilities (Electricity, Water)</option>
                <option value="Stationery">Stationery & Office Supplies</option>
                <option value="Salaries">Salaries & Wages</option>
                <option value="Maintenance">Factory Repairs & Maintenance</option>
                <option value="Other">Other Expenses</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense Description / Name *</label>
              <input type="text" id="gen-exp-name" required placeholder="e.g. Tyre replacement for delivery van, Diesel, Electricity" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                <input type="date" id="gen-exp-date" value="${defaultDate}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Total Amount (LKR) *</label>
                <input type="number" step="0.01" id="gen-exp-amount" required placeholder="0.00" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold text-indigo-600" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Coverage (Months)</label>
                <input type="number" id="gen-exp-months" value="1" min="1" max="24" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
                <p class="text-[10px] text-slate-400 mt-0.5">Spreads bill for monthly averaging</p>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
                <select id="gen-exp-method" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600">
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Notes / Invoice No. (Optional)</label>
              <textarea id="gen-exp-notes" rows="2" placeholder="Optional reference notes..." class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600"></textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('general-expense-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm">Save Expense</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveGeneralExpense(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
      const name = document.getElementById('gen-exp-name').value;
      const category = document.getElementById('gen-exp-category')?.value || 'General Operational';
      const date = document.getElementById('gen-exp-date').value;
      const amount = document.getElementById('gen-exp-amount').value;
      const months = document.getElementById('gen-exp-months').value;
      const method = document.getElementById('gen-exp-method').value;
      const notes = document.getElementById('gen-exp-notes').value;

      const record = await DB.addGeneralExpense({
        expense_name: name,
        expense_category: category,
        expense_date: date,
        amount: amount,
        months_covered: months,
        payment_method: method,
        notes: notes
      });

      await DB.logAction('Add General Expense', `Added expense "${name}" for LKR ${parseFloat(amount).toLocaleString()}`, record, 'Expense');

      document.getElementById('general-expense-modal')?.remove();
      showToast('General Expense saved successfully!');
      await this.switchSubTab(this.activeSubTab);
    } catch (err) {
      console.error('saveGeneralExpense error:', err);
      showToast('Failed to save expense: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async deleteGeneralExpense(id) {
    try {
      const expenses = await DB.getGeneralExpenses().catch(() => []);
      const exp = expenses.find(e => e.id === id || e.expense_id === id);
      const nameStr = exp ? `"${exp.expense_name}" (LKR ${parseFloat(exp.amount||0).toLocaleString()})` : 'this expense record';

      confirmDialog(`Are you sure you want to delete expense ${nameStr}?`, async () => {
        try {
          await DB.deleteGeneralExpense(id);
          await DB.logAction('Delete Expense', `Deleted expense ${nameStr}`, { id, expense: exp }, 'Expense');
          showToast('Expense record deleted.');
          await this.switchSubTab(this.activeSubTab);
        } catch (err) {
          console.error('deleteGeneralExpense error:', err);
          showToast('Failed to delete expense: ' + (err.message || err), 'error');
        }
      }, 'Delete Expense');
    } catch (err) {
      console.error('deleteGeneralExpense fetch error:', err);
    }
  },

  async openAddChemLogModal(type) { // 'IN' or 'OUT'
    const chemicals = await DB.getChemicals();
    const activeChems = chemicals.filter(c => c.status !== 'Inactive');

    if (activeChems.length === 0) {
      toast('Please add chemicals in Chemical Master catalog first.', 'warning');
      return;
    }

    const defaultDate = new Date().toISOString().split('T')[0];
    const chemOptionsHTML = activeChems.map(c => `<option value="${c.chemical_id}" data-name="${c.name}" data-unit="${c.unit}">${c.name} (${c.chemical_id}) - [${c.unit}]</option>`).join('');

    const title = type === 'IN' ? 'Purchase Chemical (Stock IN)' : 'Log Chemical Usage (Stock OUT)';
    const icon = type === 'IN' ? 'fa-cart-plus text-emerald-600' : 'fa-flask-vial text-amber-600';

    const html = `
      <div id="chem-log-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid ${icon}"></i> ${title}
            </h3>
            <button onclick="document.getElementById('chem-log-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="ExpensesModule.saveChemLog(event, '${type}')" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Select Chemical *</label>
              <select id="chem-log-cid" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500">
                ${chemOptionsHTML}
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                <input type="date" id="chem-log-date" value="${defaultDate}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Quantity (${type === 'IN' ? 'Purchased' : 'Used'}) *</label>
                <input type="number" step="0.01" id="chem-log-qty" required placeholder="e.g. 5" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold" />
              </div>
            </div>

            ${type === 'IN' ? `
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Unit Price (LKR per Unit)</label>
                <input type="number" step="0.01" id="chem-log-price" placeholder="e.g. 2160.00" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
            ` : ''}

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Notes / Remarks</label>
              <input type="text" id="chem-log-notes" placeholder="${type === 'IN' ? 'Supplier name or receipt no.' : 'Batch usage notes'}" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('chem-log-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold ${type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white rounded-xl shadow-sm">
                Save ${type === 'IN' ? 'Purchase (IN)' : 'Usage (OUT)'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveChemLog(e, type) {
    e.preventDefault();
    const select = document.getElementById('chem-log-cid');
    const cid = select.value;
    const selectedOpt = select.options[select.selectedIndex];
    const name = selectedOpt.getAttribute('data-name');
    const unit = selectedOpt.getAttribute('data-unit');

    const date = document.getElementById('chem-log-date').value;
    const qty = parseFloat(document.getElementById('chem-log-qty').value) || 0;
    const notes = document.getElementById('chem-log-notes').value;

    let unitPrice = 0;
    let totalAmount = 0;
    let expenseId = null;

    if (type === 'IN') {
      const priceElem = document.getElementById('chem-log-price');
      unitPrice = priceElem ? parseFloat(priceElem.value) || 0 : 0;
      totalAmount = qty * unitPrice;
      expenseId = await DB.generateExpenseId();
    }

    const record = await DB.addChemicalLedgerEntry({
      chemical_id: cid,
      chemical_name: name,
      date: date,
      type: type,
      qty_in: type === 'IN' ? qty : 0,
      qty_out: type === 'OUT' ? qty : 0,
      unit: unit,
      unit_price: unitPrice,
      total_amount: totalAmount,
      expense_id: expenseId,
      notes: notes
    });

    await DB.logAction(`Chemical Stock ${type}`, `${type === 'IN' ? 'Purchased' : 'Used'} ${qty} ${unit} of ${name}`, record, 'Chemical');

    document.getElementById('chem-log-modal').remove();
    showToast(`Chemical stock ${type === 'IN' ? 'purchase' : 'usage'} logged!`);
    await this.switchSubTab(this.activeSubTab);
  },

  async openAddChemicalMasterModal() {
    const html = `
      <div id="chem-master-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-flask text-indigo-600"></i> Add New Chemical
            </h3>
            <button onclick="document.getElementById('chem-master-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="ExpensesModule.saveChemicalMaster(event)" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Chemical Name *</label>
              <input type="text" id="master-chem-name" required placeholder="e.g. Detergent Powder" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Measurement Unit *</label>
                <select id="master-chem-unit" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600">
                  <option value="kg">kg (Kilograms)</option>
                  <option value="ml">ml (Milliliters)</option>
                  <option value="L">L (Liters)</option>
                  <option value="bags">bags</option>
                  <option value="cans">cans</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Package Size</label>
                <input type="text" id="master-chem-package" placeholder="e.g. 5 kg, 10 L" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('chem-master-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm">Save Chemical</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveChemicalMaster(e) {
    e.preventDefault();
    const name = document.getElementById('master-chem-name').value;
    const unit = document.getElementById('master-chem-unit').value;
    const pkg = document.getElementById('master-chem-package').value;

    const record = await DB.addChemical({
      name: name,
      unit: unit,
      package_size: pkg,
      status: 'Active'
    });

    await DB.logAction('Add Chemical', `Created chemical "${name}" (${record.chemical_id})`, record, 'Chemical');

    document.getElementById('chem-master-modal').remove();
    showToast('New chemical added to master catalog!');
    await this.switchSubTab(this.activeSubTab);
  },

  async deleteChemical(id) {
    try {
      const chemicals = await DB.getChemicals().catch(() => []);
      const chem = chemicals.find(c => c.id === id || c.chemical_id === id);
      const nameStr = chem ? `"${chem.name}" (${chem.chemical_id})` : 'this chemical master record';

      confirmDialog(`Are you sure you want to delete chemical master record ${nameStr}?`, async () => {
        try {
          await DB.deleteChemical(id);
          await DB.logAction('Delete Chemical Master', `Deleted chemical catalog entry ${nameStr}`, { id, chemical: chem }, 'Chemical');
          showToast('Chemical deleted.');
          await this.switchSubTab(this.activeSubTab);
        } catch (err) {
          console.error('deleteChemical error:', err);
          showToast('Failed to delete chemical: ' + (err.message || err), 'error');
        }
      }, 'Delete Chemical');
    } catch (err) {
      console.error('deleteChemical fetch error:', err);
    }
  }
};
