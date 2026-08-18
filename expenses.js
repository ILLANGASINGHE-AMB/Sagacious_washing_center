// expenses.js - SAGA Washing Center Expenses Module (Cash Book + Category View)
//
// Cash Book is a spreadsheet-style ledger: rows are Date+Description journal
// lines, columns are Categories (each with its own nested Expense
// sub-columns). Category View is the same underlying data flattened into a
// filterable list with a trend graph. See Financials.flattenExpenseData /
// computeExpenseTotals / computeExpenseDailySeries for the shared math.

const ExpensesModule = {
  activeSubTab: 'cashbook', // 'cashbook' | 'category'

  _categories: [],
  _types: [],
  _entries: [],
  _amounts: [],

  _pendingFocusTarget: null,
  _editCancelled: false,

  _catViewCategory: '',
  _catViewType: '',
  _catViewFrom: '',
  _catViewTo: '',
  _categoryChart: null,

  async init() {
    this.renderLayout();
    await this.switchSubTab(this.activeSubTab);
  },

  renderLayout() {
    const container = document.getElementById('page-expenses');
    if (!container) return;

    container.innerHTML = `
      <div class="p-4 sm:p-6 space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-book-bookmark text-indigo-600 dark:text-indigo-400"></i>
              Expenses
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Cash Book ledger of dated expenses across your own categories, plus a filterable Category View.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="expenses-stat-cards"></div>

        <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto">
          <button id="exp-subtab-cashbook" onclick="ExpensesModule.switchSubTab('cashbook')" class="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 border">
            <i class="fa-solid fa-table-cells"></i> Cash Book
          </button>
          <button id="exp-subtab-category" onclick="ExpensesModule.switchSubTab('category')" class="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 border">
            <i class="fa-solid fa-chart-pie"></i> Category View
          </button>
        </div>

        <div id="expenses-subtab-content" class="min-h-[400px]"></div>
      </div>
    `;
  },

  async _loadAll() {
    [this._categories, this._types, this._entries, this._amounts] = await Promise.all([
      DB.getExpenseCategories(), DB.getExpenseTypes(), DB.getExpenseEntries(), DB.getExpenseAmounts()
    ]);
  },

  async switchSubTab(tab) {
    if (this._categoryChart) { try { this._categoryChart.destroy(); } catch(e){} this._categoryChart = null; }

    this.activeSubTab = tab;
    ['cashbook', 'category'].forEach(t => {
      const btn = document.getElementById(`exp-subtab-${t}`);
      if (!btn) return;
      btn.className = t === tab
        ? 'px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 bg-indigo-600 text-white border-indigo-600 shadow-sm'
        : 'px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700';
    });

    const content = document.getElementById('expenses-subtab-content');
    if (!content) return;

    await this._loadAll();
    this.refreshStatCards();

    if (tab === 'cashbook') this.renderCashBook(content);
    else this.renderCategoryView(content);
  },

  // ──────────────────────────────────────────
  // STAT CARDS
  // ──────────────────────────────────────────
  refreshStatCards() {
    const el = document.getElementById('expenses-stat-cards');
    if (!el) return;

    const flat = Financials.flattenExpenseData(this._amounts, this._entries, this._types, this._categories);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const calc = Financials.computeExpenseTotals(flat, monthStart, monthEnd);
    const top = calc.mostExpensiveCategory;

    el.innerHTML = [
      this._statCard('Total Expenses (Month)', formatCurrency(calc.total), 'fa-wallet', 'indigo'),
      this._statCard('Most Expensive Category (Month)', top ? escapeHtml(top.name) : '—', 'fa-crown', 'amber', top ? formatCurrency(top.total) : 'No expenses logged this month'),
      this._statCard('Total No. of Expenses', String(this._types.length), 'fa-list', 'emerald'),
      this._statCard('Total No. of Expense Categories', String(this._categories.length), 'fa-layer-group', 'purple')
    ].join('');
  },

  _statCard(label, value, icon, color, sub = '') {
    const colors = {
      indigo: ['bg-indigo-50 dark:bg-indigo-950/40', 'text-indigo-600 dark:text-indigo-400'],
      amber: ['bg-amber-50 dark:bg-amber-950/40', 'text-amber-600 dark:text-amber-400'],
      emerald: ['bg-emerald-50 dark:bg-emerald-950/40', 'text-emerald-600 dark:text-emerald-400'],
      purple: ['bg-purple-50 dark:bg-purple-950/40', 'text-purple-600 dark:text-purple-400']
    };
    const [bg, fg] = colors[color] || colors.indigo;
    return `
      <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">${label}</div>
          <div class="text-lg font-extrabold text-slate-800 dark:text-white mt-1 truncate" title="${value}">${value}</div>
          ${sub ? `<div class="text-[11px] text-slate-400 mt-0.5 truncate">${sub}</div>` : ''}
        </div>
        <div class="w-10 h-10 rounded-xl ${bg} ${fg} flex items-center justify-center text-lg shrink-0">
          <i class="fa-solid ${icon}"></i>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────
  // 1. CASH BOOK
  // ──────────────────────────────────────────
  renderCashBook(container) {
    const cats = [...this._categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const typesByCat = {};
    this._types.forEach(t => { (typesByCat[t.category_id] ||= []).push(t); });
    Object.values(typesByCat).forEach(arr => arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    const entries = [...this._entries].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date) || (a.id - b.id));

    const amountIdx = {};
    this._amounts.forEach(a => { amountIdx[`${a.entry_id}|${a.expense_type_id}`] = parseFloat(a.amount) || 0; });

    const rowTotal = entryId => this._amounts.filter(a => String(a.entry_id) === String(entryId)).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    const colTotal = typeId => this._amounts.filter(a => a.expense_type_id === typeId).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    const grandTotal = this._amounts.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

    let catHeaderHTML = '';
    cats.forEach((cat, ci) => {
      const types = typesByCat[cat.category_id] || [];
      const colspan = Math.max(1, types.length);
      catHeaderHTML += `
        <th colspan="${colspan}" class="sticky top-0 z-30 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider border-b border-l border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-750 text-indigo-700 dark:text-indigo-300">
          <div class="flex items-center justify-center gap-1">
            <button onclick="ExpensesModule.moveCategory('${cat.category_id}','left')" ${ci === 0 ? 'disabled' : ''} class="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed" title="Move category left"><i class="fa-solid fa-caret-left"></i></button>
            <span class="truncate max-w-[140px]" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
            <button onclick="ExpensesModule.moveCategory('${cat.category_id}','right')" ${ci === cats.length - 1 ? 'disabled' : ''} class="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed" title="Move category right"><i class="fa-solid fa-caret-right"></i></button>
          </div>
          <div class="text-[10px] font-mono text-slate-400 font-normal">${cat.category_id}</div>
        </th>
      `;
    });

    let typeHeaderHTML = '';
    cats.forEach(cat => {
      const types = typesByCat[cat.category_id] || [];
      if (types.length === 0) {
        typeHeaderHTML += `<th class="sticky top-[42px] z-30 w-[120px] min-w-[120px] px-2 py-1.5 text-center text-[10px] text-slate-400 italic border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">No expenses yet</th>`;
      } else {
        types.forEach((t, ti) => {
          typeHeaderHTML += `
            <th class="sticky top-[42px] z-30 w-[120px] min-w-[120px] px-2 py-1.5 text-center text-[10px] font-bold border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <div class="flex items-center justify-center gap-1">
                <button onclick="ExpensesModule.moveExpenseType('${t.expense_type_id}','left')" ${ti === 0 ? 'disabled' : ''} class="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"><i class="fa-solid fa-caret-left text-[9px]"></i></button>
                <span class="truncate max-w-[70px]" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
                <button onclick="ExpensesModule.moveExpenseType('${t.expense_type_id}','right')" ${ti === types.length - 1 ? 'disabled' : ''} class="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"><i class="fa-solid fa-caret-right text-[9px]"></i></button>
              </div>
              <div class="text-[9px] font-mono text-slate-400 font-normal">${t.expense_type_id}</div>
            </th>
          `;
        });
      }
    });

    const renderAmountCells = entryId => {
      let html = '';
      cats.forEach(cat => {
        const types = typesByCat[cat.category_id] || [];
        if (types.length === 0) {
          html += `<td class="w-[120px] min-w-[120px] px-2 py-2 text-center text-xs text-slate-300 dark:text-slate-600 border-l border-slate-200 dark:border-slate-700">—</td>`;
        } else {
          types.forEach(t => {
            const amt = amountIdx[`${entryId}|${t.expense_type_id}`];
            const display = amt ? amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
            html += `<td tabindex="0" data-cell="amount" data-entry-id="${entryId}" data-expense-type-id="${t.expense_type_id}" class="w-[120px] min-w-[120px] px-2 py-2 text-right text-xs border-l border-slate-200 dark:border-slate-700 cursor-cell outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20">${display}</td>`;
          });
        }
      });
      return html;
    };

    const renderBlankAmountCells = () => {
      let html = '';
      cats.forEach(cat => {
        const types = typesByCat[cat.category_id] || [];
        const count = Math.max(1, types.length);
        for (let i = 0; i < count; i++) {
          html += `<td class="w-[120px] min-w-[120px] px-2 py-2 border-l border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20"></td>`;
        }
      });
      return html;
    };

    let bodyHTML = '';
    entries.forEach(entry => {
      bodyHTML += `
        <tr>
          <td tabindex="0" data-cell="date" data-entry-id="${entry.id}" class="sticky left-0 z-20 w-[110px] min-w-[110px] px-3 py-2 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 cursor-cell outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500">${entry.entry_date}</td>
          <td tabindex="0" data-cell="description" data-entry-id="${entry.id}" class="sticky left-[110px] z-20 w-[220px] min-w-[220px] px-3 py-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 cursor-cell outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 truncate">${escapeHtml(entry.description || '')}</td>
          ${renderAmountCells(entry.id)}
          <td class="sticky right-0 z-20 w-[130px] min-w-[130px] px-3 py-2 text-right text-xs font-bold text-slate-800 dark:text-white bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">${formatCurrency(rowTotal(entry.id))}</td>
        </tr>
      `;
    });

    bodyHTML += `
      <tr>
        <td tabindex="0" data-cell="date" data-entry-id="new" class="sticky left-0 z-20 w-[110px] min-w-[110px] px-3 py-2 text-xs font-mono text-slate-400 bg-white dark:bg-slate-800 cursor-cell outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 italic">${today()}</td>
        <td class="sticky left-[110px] z-20 w-[220px] min-w-[220px] px-3 py-2 text-xs text-slate-300 dark:text-slate-600 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 italic">Click date to start a new row</td>
        ${renderBlankAmountCells()}
        <td class="sticky right-0 z-20 w-[130px] min-w-[130px] px-3 py-2 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700"></td>
      </tr>
    `;

    let footerCatCells = '';
    cats.forEach(cat => {
      const types = typesByCat[cat.category_id] || [];
      if (types.length === 0) {
        footerCatCells += `<td class="sticky bottom-0 z-30 w-[120px] min-w-[120px] px-2 py-2 border-l border-slate-300 dark:border-slate-600 bg-indigo-50 dark:bg-indigo-950/40"></td>`;
      } else {
        types.forEach(t => {
          footerCatCells += `<td class="sticky bottom-0 z-30 w-[120px] min-w-[120px] px-2 py-2 text-right text-xs font-bold border-l border-slate-300 dark:border-slate-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">${colTotal(t.expense_type_id).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        });
      }
    });

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-book-bookmark text-indigo-500"></i> Cash Book
            </h2>
            <p class="text-xs text-slate-500">Click a cell, use arrow keys to move, Enter/F2 to edit, Enter to save and move down. Amounts in LKR.</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="ExpensesModule.openAddCategoryModal()" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i> Add Category
            </button>
            <button onclick="ExpensesModule.openAddExpenseModal()" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i> Add Expense
            </button>
          </div>
        </div>

        ${cats.length === 0 ? `
          <div class="p-8 text-center text-slate-500">
            <i class="fa-solid fa-layer-group text-4xl text-slate-300 mb-3"></i>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-200">No Categories Yet</h3>
            <p class="text-xs text-slate-500 mt-1 mb-4">Click "Add Category" to create your first Cash Book column (e.g. "Vehicle Expenses").</p>
          </div>
        ` : `
          <div id="cashbook-scroll-wrapper" class="overflow-auto max-h-[70vh]">
            <table class="border-separate border-spacing-0 text-left" style="min-width:100%;">
              <thead>
                <tr>
                  <th rowspan="2" class="sticky top-0 left-0 z-40 w-[110px] min-w-[110px] px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">Date</th>
                  <th rowspan="2" class="sticky top-0 left-[110px] z-40 w-[220px] min-w-[220px] px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-700">Description</th>
                  ${catHeaderHTML}
                  <th rowspan="2" class="sticky top-0 right-0 z-40 w-[130px] min-w-[130px] px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 border-b border-l border-slate-200 dark:border-slate-700">Total</th>
                </tr>
                <tr>
                  ${typeHeaderHTML}
                </tr>
              </thead>
              <tbody>
                ${bodyHTML}
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                  <td colspan="2" class="sticky bottom-0 left-0 z-40 px-3 py-3 text-xs text-slate-700 dark:text-slate-300 uppercase font-bold bg-indigo-50 dark:bg-indigo-950/40">Total</td>
                  ${footerCatCells}
                  <td class="sticky bottom-0 right-0 z-40 px-3 py-3 text-right text-xs font-extrabold bg-indigo-600 text-white">${formatCurrency(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        `}
      </div>
    `;

    if (cats.length > 0) this._bindCashBookEvents();
  },

  _bindCashBookEvents() {
    const wrapper = document.getElementById('cashbook-scroll-wrapper');
    if (!wrapper) return;
    wrapper.addEventListener('keydown', e => this._onGridKeydown(e));
    wrapper.addEventListener('focusout', e => this._onGridFocusOut(e));
    wrapper.addEventListener('mousedown', e => this._onGridMouseDown(e));
    wrapper.addEventListener('dblclick', e => this._onGridDblClick(e));
  },

  _describeCell(td) {
    return { cellType: td.dataset.cell, entryId: td.dataset.entryId, expenseTypeId: td.dataset.expenseTypeId };
  },

  _onGridMouseDown(e) {
    const td = e.target.closest('td[data-cell]');
    if (td && !e.target.closest('input')) {
      this._pendingFocusTarget = this._describeCell(td);
    }
  },

  _onGridDblClick(e) {
    const td = e.target.closest('td[data-cell]');
    if (td && !td.querySelector('input')) this.startCellEdit(td);
  },

  _onGridKeydown(e) {
    const target = e.target;

    if (target.tagName === 'INPUT') {
      const td = target.closest('td');
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const nextTd = this._findAdjacentCell(td, 'down');
        this._pendingFocusTarget = nextTd ? this._describeCell(nextTd) : this._describeCell(td);
        target.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this._editCancelled = true;
        this._pendingFocusTarget = this._describeCell(td);
        target.blur();
      }
      return;
    }

    // Not editing — target is a focused <td data-cell>. Every branch below
    // stops propagation so a bare ArrowLeft/ArrowRight never reaches
    // keyboard.js's document-level handler, which otherwise treats it as a
    // pagination-button click.
    const td = target.closest('td[data-cell]');
    if (!td) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      const next = this._findAdjacentCell(td, dir);
      if (next) next.focus();
      return;
    }

    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      this.startCellEdit(td);
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && td.dataset.cell !== 'date') {
      if (td.dataset.cell === 'amount' && !/[0-9.\-]/.test(e.key)) return;
      e.preventDefault();
      this.startCellEdit(td, e.key);
    }
  },

  _findAdjacentCell(td, dir) {
    const row = td.closest('tr');
    if (!row) return null;

    if (dir === 'left' || dir === 'right') {
      let sib = dir === 'left' ? td.previousElementSibling : td.nextElementSibling;
      while (sib) {
        if (sib.tagName === 'TD' && sib.hasAttribute('data-cell')) return sib;
        sib = dir === 'left' ? sib.previousElementSibling : sib.nextElementSibling;
      }
      return null;
    }

    const tbody = row.parentElement;
    if (!tbody || tbody.tagName !== 'TBODY') return null;
    const rows = Array.from(tbody.children);
    const rowIdx = rows.indexOf(row);
    const targetRowIdx = dir === 'up' ? rowIdx - 1 : rowIdx + 1;
    if (targetRowIdx < 0 || targetRowIdx >= rows.length) return null;
    const cellIdx = Array.from(row.children).indexOf(td);
    const targetCell = rows[targetRowIdx].children[cellIdx];
    return (targetCell && targetCell.tagName === 'TD' && targetCell.hasAttribute('data-cell')) ? targetCell : null;
  },

  startCellEdit(td, initialChar) {
    if (td.querySelector('input')) return;
    this._editCancelled = false;
    if (!this._pendingFocusTarget) this._pendingFocusTarget = this._describeCell(td);

    const cellType = td.dataset.cell;
    const entryId = td.dataset.entryId;
    td.dataset.originalHtml = td.innerHTML;

    let inputType = 'text', existingVal = '';
    if (cellType === 'date') {
      inputType = 'date';
      existingVal = entryId === 'new' ? today() : (this._entries.find(e => String(e.id) === entryId)?.entry_date || '');
    } else if (cellType === 'description') {
      existingVal = this._entries.find(e => String(e.id) === entryId)?.description || '';
    } else if (cellType === 'amount') {
      inputType = 'number';
      const found = this._amounts.find(a => String(a.entry_id) === entryId && a.expense_type_id === td.dataset.expenseTypeId);
      existingVal = found ? found.amount : '';
    }

    const alignClass = cellType === 'amount' ? 'text-right' : '';
    td.innerHTML = `<input type="${inputType}" ${inputType === 'number' ? 'step="0.01"' : ''} value="${escapeHtml(String(existingVal))}" class="w-full bg-transparent text-xs ${alignClass} outline-none border border-indigo-400 rounded px-1 py-0.5" />`;

    const input = td.querySelector('input');
    input.focus();
    if (initialChar) input.value = initialChar;
    else input.select();
  },

  _onGridFocusOut(e) {
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    const td = input.closest('td');
    if (!td) return;
    this._commitCellEdit(td, input);
  },

  async _commitCellEdit(td, input) {
    const cancelled = this._editCancelled;
    const focusTarget = this._pendingFocusTarget || this._describeCell(td);
    this._pendingFocusTarget = null;
    this._editCancelled = false;

    if (cancelled) {
      await this._refreshCashBook(focusTarget);
      return;
    }

    const cellType = td.dataset.cell;
    const entryId = td.dataset.entryId;
    let nextFocus = focusTarget;

    try {
      if (cellType === 'date') {
        const val = input.value;
        if (!val) { await this._refreshCashBook(focusTarget); return; }
        if (entryId === 'new') {
          const created = await DB.addExpenseEntry(val, '');
          await DB.logAction('Add Cash Book Entry', `Added expense entry dated ${val}`, created, 'Expense');
          nextFocus = { cellType: 'description', entryId: String(created.id) };
        } else {
          await DB.updateExpenseEntry(entryId, { entry_date: val });
          await DB.logAction('Edit Cash Book Cell', `Changed entry date to ${val}`, { id: entryId }, 'Expense');
        }
      } else if (cellType === 'description') {
        await DB.updateExpenseEntry(entryId, { description: input.value });
      } else if (cellType === 'amount') {
        await DB.setExpenseAmount(entryId, td.dataset.expenseTypeId, input.value);
      }
    } catch (err) {
      console.error('commitCellEdit error:', err);
      showToast('Failed to save: ' + (err.message || err), 'error');
    }

    await this._refreshCashBook(nextFocus);
  },

  async _refreshCashBook(focusTarget = null) {
    const wrapper = document.getElementById('cashbook-scroll-wrapper');
    const scrollTop = wrapper ? wrapper.scrollTop : 0;
    const scrollLeft = wrapper ? wrapper.scrollLeft : 0;

    await this._loadAll();
    this.refreshStatCards();
    const content = document.getElementById('expenses-subtab-content');
    if (content) this.renderCashBook(content);

    const newWrapper = document.getElementById('cashbook-scroll-wrapper');
    if (newWrapper) { newWrapper.scrollTop = scrollTop; newWrapper.scrollLeft = scrollLeft; }

    if (focusTarget) {
      const sel = focusTarget.expenseTypeId
        ? `td[data-cell="amount"][data-entry-id="${focusTarget.entryId}"][data-expense-type-id="${focusTarget.expenseTypeId}"]`
        : `td[data-cell="${focusTarget.cellType}"][data-entry-id="${focusTarget.entryId}"]`;
      const el = document.querySelector(sel);
      if (el) el.focus();
    }
  },

  async moveCategory(categoryId, direction) {
    try {
      await DB.reorderExpenseCategory(categoryId, direction);
      await DB.logAction('Reorder Expense Category', `Moved category ${categoryId} ${direction}`, { categoryId, direction }, 'Expense');
      await this._refreshCashBook();
    } catch (err) {
      console.error('moveCategory error:', err);
      showToast('Failed to reorder category: ' + (err.message || err), 'error');
    }
  },

  async moveExpenseType(expenseTypeId, direction) {
    try {
      await DB.reorderExpenseType(expenseTypeId, direction);
      await DB.logAction('Reorder Expense Type', `Moved expense ${expenseTypeId} ${direction}`, { expenseTypeId, direction }, 'Expense');
      await this._refreshCashBook();
    } catch (err) {
      console.error('moveExpenseType error:', err);
      showToast('Failed to reorder expense: ' + (err.message || err), 'error');
    }
  },

  // ──────────────────────────────────────────
  // MODALS: Add Category / Add Expense
  // ──────────────────────────────────────────
  async openAddCategoryModal() {
    const html = `
      <div id="add-category-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-layer-group text-indigo-600"></i> Add Category
            </h3>
            <button onclick="document.getElementById('add-category-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="ExpensesModule.saveCategory(event)" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category ID</label>
              <input type="text" value="(auto-generated on save)" readonly class="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category Name *</label>
              <input type="text" id="new-cat-name" required placeholder="e.g. Vehicle Expenses" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('add-category-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm">Save Category</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveCategory(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const name = document.getElementById('new-cat-name').value.trim();
      if (!name) return;

      const record = await DB.addExpenseCategory(name);
      await DB.logAction('Add Expense Category', `Created category "${name}" (${record.category_id})`, record, 'Expense');

      document.getElementById('add-category-modal')?.remove();
      showToast(`Category "${name}" added as ${record.category_id}.`);
      await this._refreshCashBook();
    } catch (err) {
      console.error('saveCategory error:', err);
      showToast('Failed to save category: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async openAddExpenseModal() {
    if (this._categories.length === 0) {
      showToast('Add a Category first before adding an Expense.', 'warning');
      return;
    }

    const catOptions = [...this._categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(c => `<option value="${c.category_id}">${escapeHtml(c.name)} (${c.category_id})</option>`).join('');

    const html = `
      <div id="add-expense-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-plus-circle text-emerald-600"></i> Add Expense
            </h3>
            <button onclick="document.getElementById('add-expense-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="ExpensesModule.saveExpenseType(event)" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense ID</label>
              <input type="text" value="(auto-generated on save)" readonly class="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense Name *</label>
              <input type="text" id="new-exp-name" required placeholder="e.g. Fuel, Tyres, Labour Charges" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense Category *</label>
              <select id="new-exp-category" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 font-bold">
                ${catOptions}
              </select>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('add-expense-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm">Save Expense</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveExpenseType(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const name = document.getElementById('new-exp-name').value.trim();
      const categoryId = document.getElementById('new-exp-category').value;
      if (!name || !categoryId) return;

      const record = await DB.addExpenseType(name, categoryId);
      await DB.logAction('Add Expense Type', `Created expense "${name}" (${record.expense_type_id}) under category ${categoryId}`, record, 'Expense');

      document.getElementById('add-expense-modal')?.remove();
      showToast(`Expense "${name}" added as ${record.expense_type_id}.`);
      await this._refreshCashBook();
    } catch (err) {
      console.error('saveExpenseType error:', err);
      showToast('Failed to save expense: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ──────────────────────────────────────────
  // 2. CATEGORY VIEW
  // ──────────────────────────────────────────
  renderCategoryView(container) {
    const today = new Date();
    if (!this._catViewFrom) this._catViewFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    if (!this._catViewTo) this._catViewTo = today.toISOString().split('T')[0];

    const catOptions = [...this._categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(c => `<option value="${c.category_id}" ${this._catViewCategory === c.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');

    const typesForFilter = this._catViewCategory ? this._types.filter(t => t.category_id === this._catViewCategory) : this._types;
    const typeOptions = [...typesForFilter].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(t => `<option value="${t.expense_type_id}" ${this._catViewType === t.expense_type_id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Category</label>
              <select id="cv-filter-category" onchange="ExpensesModule.onCategoryFilterChange()" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600">
                <option value="">All Categories</option>
                ${catOptions}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Expense Name</label>
              <select id="cv-filter-type" onchange="ExpensesModule.onCategoryFilterChange()" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600">
                <option value="">All Expenses</option>
                ${typeOptions}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">From</label>
              <input type="date" id="cv-filter-from" value="${this._catViewFrom}" onchange="ExpensesModule.onCategoryFilterChange()" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600" />
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">To</label>
              <input type="date" id="cv-filter-to" value="${this._catViewTo}" onchange="ExpensesModule.onCategoryFilterChange()" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600" />
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div class="overflow-auto max-h-[50vh]" id="cv-table-wrapper">
            <table class="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900">
                  <th class="sticky top-0 z-10 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Expense Name ID</th>
                  <th class="sticky top-0 z-10 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Category</th>
                  <th class="sticky top-0 z-10 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Expense Name</th>
                  <th class="sticky top-0 z-10 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Date</th>
                  <th class="sticky top-0 z-10 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Description</th>
                  <th class="sticky top-0 z-10 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 text-right">Amount</th>
                </tr>
              </thead>
              <tbody id="cv-table-body"></tbody>
              <tfoot>
                <tr class="border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                  <td colspan="5" class="sticky bottom-0 px-4 py-3 text-xs text-slate-700 dark:text-slate-300 uppercase bg-indigo-50 dark:bg-indigo-950/40">Total Amount</td>
                  <td id="cv-total-amount" class="sticky bottom-0 px-4 py-3 text-right text-xs font-extrabold bg-indigo-600 text-white"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2"><i class="fa-solid fa-chart-line text-indigo-500"></i> Expense Trend</h3>
          <div style="height:280px;"><canvas id="cv-chart"></canvas></div>
        </div>
      </div>
    `;

    this._renderCategoryViewData();
  },

  onCategoryFilterChange() {
    this._catViewCategory = document.getElementById('cv-filter-category')?.value || '';
    this._catViewType = document.getElementById('cv-filter-type')?.value || '';
    this._catViewFrom = document.getElementById('cv-filter-from')?.value || '';
    this._catViewTo = document.getElementById('cv-filter-to')?.value || '';

    // Rebuild the Expense Name dropdown scoped to the selected category, in
    // place, so switching categories doesn't need a full page re-render.
    const typeSelect = document.getElementById('cv-filter-type');
    if (typeSelect) {
      const typesForFilter = this._catViewCategory ? this._types.filter(t => t.category_id === this._catViewCategory) : this._types;
      const sorted = [...typesForFilter].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (!sorted.some(t => t.expense_type_id === this._catViewType)) this._catViewType = '';
      typeSelect.innerHTML = `<option value="">All Expenses</option>` + sorted.map(t => `<option value="${t.expense_type_id}" ${this._catViewType === t.expense_type_id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
    }

    this._renderCategoryViewData();
  },

  _renderCategoryViewData() {
    const flat = Financials.flattenExpenseData(this._amounts, this._entries, this._types, this._categories);
    const from = this._catViewFrom;
    const to = this._catViewTo;
    const fromD = from ? new Date(from + 'T00:00:00') : new Date('2000-01-01');
    const toD = to ? new Date(to + 'T23:59:59') : new Date('2099-12-31');

    const filtered = flat.filter(r => {
      const d = new Date(r.entry_date);
      if (isNaN(d) || d < fromD || d > toD) return false;
      if (this._catViewCategory && r.category_id !== this._catViewCategory) return false;
      if (this._catViewType && r.expense_type_id !== this._catViewType) return false;
      return true;
    }).sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

    const tbody = document.getElementById('cv-table-body');
    if (tbody) {
      tbody.innerHTML = filtered.length === 0
        ? `<tr><td colspan="6" class="px-4 py-8 text-center text-xs text-slate-400">No expenses match these filters.</td></tr>`
        : filtered.map(r => `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-750/50 border-b border-slate-200 dark:border-slate-700">
            <td class="px-4 py-2.5 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">${r.expense_type_id}</td>
            <td class="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">${escapeHtml(r.category_name)}</td>
            <td class="px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-white">${escapeHtml(r.expense_name)}</td>
            <td class="px-4 py-2.5 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">${r.entry_date}</td>
            <td class="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">${escapeHtml(r.description || '')}</td>
            <td class="px-4 py-2.5 text-xs text-right font-bold text-slate-800 dark:text-white whitespace-nowrap">${formatCurrency(r.amount)}</td>
          </tr>
        `).join('');
    }

    const totalEl = document.getElementById('cv-total-amount');
    if (totalEl) totalEl.textContent = formatCurrency(filtered.reduce((s, r) => s + r.amount, 0));

    this.renderCategoryChart(filtered, from, to);
  },

  renderCategoryChart(filteredRows, startStr, endStr) {
    const ctx = document.getElementById('cv-chart')?.getContext('2d');
    if (!ctx) return;
    if (this._categoryChart) { try { this._categoryChart.destroy(); } catch(e){} this._categoryChart = null; }

    const series = Financials.computeExpenseDailySeries(filteredRows, startStr || '2000-01-01', endStr || '2099-12-31');

    this._categoryChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.map(p => p.date),
        datasets: [{
          label: 'Amount (LKR)',
          data: series.map(p => p.amount),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Days' } },
          y: { title: { display: true, text: 'Amount (LKR)' }, beginAtZero: true }
        }
      }
    });
  }
};
