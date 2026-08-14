# Sagacious Washing Center — Refactor Plan: File Reorganization

Question answered: *can the system be split into a single calculations file, a single PDF/print file, a single DB config/control file, and separate files per feature batch?*

**Short answer: Yes — and it's low-risk here.**

---

## Why this works easily in this codebase

The app has no build step and no module bundler — every file is loaded as a plain `<script>` tag in `index.html`, all sharing one global scope:

```html
<script src="config.js"></script>
<script src="db.js"></script>
<script src="ui.js"></script>
<script src="orders.js"></script>
<!-- ...etc -->
```

That means reorganizing is purely mechanical: create the new file, move functions into it, add one `<script src="...">` tag **before** any file that calls those functions. No imports to rewrite, no compiler.

---

## How your proposed structure maps onto the current code

### 1. `calculations.js` — all equations in one place
Right now money math is scattered, written inline, across **9 different files**: `orders.js`, `analytics.js`, `expenses.js`, `invoice.js`, `transport.js`, `db.js`, `app.js`, `reports.js`. This is exactly what caused the invoice-balance bug found earlier (3 different formulas for the same number in 3 different files).

Consolidate into:
```js
const Calc = {
  orderTotal(items, discountRate, deliveryCharge, extraPayment) { ... },
  invoiceBalance(invoice, items, payments) { ... },      // fixes the earlier bug as a side effect
  monthlyAveragedExpense(amount, monthsCovered) { ... },
  tripFuelCost(distanceKm, fuelConfig, month) { ... },
  profitSummary(orders, generalExpenses, chemicalLedger, trips) { ... }
};
```
Every other file then calls `Calc.invoiceBalance(...)` etc. instead of recomputing the formula inline.

### 2. `print.js` — PDF/print generation in one place
Worth noting: there's no real PDF library (no jsPDF) — "PDF export" is actually `window.print()` on a styled HTML popup window, currently duplicated separately in `invoice.js`, `items.js`, and `reports.js`, each with near-identical print-window boilerplate.

Consolidate into a shared helper:
```js
function openPrintWindow(htmlContent, title) { ... }
```
Called from `invoice.js` (invoices, credit bills), `items.js` (quotations, item catalog), and `reports.js` (monthly bills, customer summaries) instead of each file building its own popup window logic.

### 3. `db.js` — database config/controls
Already exists and is already the single access layer for Supabase — no structural change needed. If it keeps growing past its current ~1000 lines, it can optionally be split further later (e.g. `db-core.js` for the query wrapper, `db-orders.js`, `db-users.js`), but that's not urgent now.

### 4. Feature-batch files
This is already how the app is organized: `orders.js`, `invoice.js`, `items.js`, `transport.js`, `expenses.js`, `settings.js` are each scoped to one feature area. Keep this pattern — it's working well.

---

## Two things to watch during the refactor

### A. Global name collisions
Since every file shares one scope, if two files each declare a function with the same name, the second silently overwrites the first — no error, no warning. Only `transport.js` currently protects against this with a namespace object:
```js
const TransportModule = { ... };
```
Adopt the same pattern for the new `calculations.js` and `print.js` so every call site is unambiguous:
```js
Calc.invoiceBalance(inv, items, payments)
Print.openWindow(html, title)
```

### B. Script load order matters
`calculations.js` and `print.js` must be loaded **before** any file that calls them — right after `db.js`/`ui.js`, and before `orders.js`, `invoice.js`, `items.js`, `reports.js`, `transport.js`. Otherwise you'll get "function is not defined" errors at runtime.

Example updated load order in `index.html`:
```html
<script src="config.js"></script>
<script src="db.js"></script>
<script src="ui.js"></script>
<script src="calculations.js"></script>
<script src="print.js"></script>
<script src="orders.js"></script>
<script src="invoice.js"></script>
<script src="items.js"></script>
<script src="reports.js"></script>
<script src="expenses.js"></script>
<script src="transport.js"></script>
<script src="settings.js"></script>
<script src="analytics.js"></script>
<script src="gemini.js"></script>
<script src="app.js"></script>
<script src="keyboard.js"></script>
```

---

## Suggested rollout order

1. Create `calculations.js`, move the invoice-balance / order-total / profit formulas into it, update call sites — this also fixes the earlier invoice-balance inconsistency as a bonus.
2. Create `print.js`, consolidate the duplicated print-window code from `invoice.js`, `items.js`, `reports.js`.
3. Leave `db.js` as-is for now; revisit splitting it only if it grows significantly.
4. Keep the existing feature-file structure unchanged.
