# Sagacious Washing Center — UI/UX Review

Scope: `index.html`, `confirm.html`, `ui.js`, `keyboard.js`, `app.js`, and the rendering code in `orders.js`, `items.js`, `invoice.js`, `expenses.js`, `transport.js`.

---

## ✅ What's already working well

- **Consistent toast system** (`toast()` in `ui.js`) with success/error/info/warning variants used almost everywhere for feedback.
- **Custom `confirmDialog()` modal** used for most destructive actions (delete order, delete invoice, delete customer, delete user) — nicer and more consistent than the browser's native confirm box.
- **Good empty states** — "No orders found", "No invoices found. Create an invoice or adjust filters to get started." — friendlier than a blank table.
- **Dark mode** is implemented with a real toggle and consistent CSS overrides (`html.dark ...`) rather than just a class with no styling.
- **Tables wrap in `.table-wrap { overflow-x: auto }`**, so wide data tables scroll horizontally on small screens instead of breaking layout.
- **Print stylesheet** hides the sidebar/topbar and adjusts margins for clean invoice/report printing.
- **Global search (Ctrl+K)** with debounced input, arrow-key navigation, and Enter-to-select — a genuinely useful power-user feature that a lot of small-business ERPs skip.
- **Sidebar collapses to icon-only** at ≤768px rather than disappearing entirely, so navigation stays reachable on tablets.

---

## 🟠 Issues to fix

### 1. Inconsistent delete-confirmation pattern
Most of the app uses the custom `confirmDialog()` modal (styled, on-brand), but `expenses.js` and `transport.js` fall back to the browser's native `confirm()`/`alert()` for deleting expense records, deleting chemical master records, deleting trips, and validation errors (e.g. "Final KM cannot be less than Starting KM").

**Why it matters:** native dialogs look jarring next to the styled app, can't be branded, and behave differently across browsers (blocking, no dark mode, etc.).

**Fix:** Replace every `confirm(...)`/`alert(...)` call in `expenses.js` and `transport.js` with the existing `confirmDialog()` / `toast()` helpers already used elsewhere.

### 2. No loading states while data fetches
Across `orders.js`, `items.js`, `invoice.js`, and others, only one screen (`deductions` list) shows a spinner while waiting on Supabase. Everywhere else, the table/page is either blank or shows stale content until the async call resolves.

**Why it matters:** on a slow connection, users see nothing happen after clicking a nav item and may click again (compounding issue #7 below) or assume the app is broken.

**Fix:** Add a lightweight shared skeleton/spinner state, e.g.:
```js
function showLoading(containerId) {
  document.getElementById(containerId).innerHTML =
    `<div style="text-align:center;padding:40px;color:var(--text-muted);">
       <i class="fas fa-spinner fa-spin"></i> Loading...
     </div>`;
}
```
Call it at the top of each `renderX()` function before the `await DB.getX()` call.

### 3. No client-side form validation feedback
There are zero HTML `required` attributes anywhere in `index.html` — every validation (e.g. "select a customer", "add at least one item") is a manual JS check that fires only after clicking Save, then shows a toast. There's no inline "this field is required" indicator, no red border on the invalid field, and nothing stops the browser from letting you tab past empty required fields.

**Why it matters:** on a long form (e.g. new order with multiple item rows), a single toast at the bottom doesn't tell the user *which* field is the problem — they have to hunt for it.

**Fix:**
- Add `required` to obviously-required inputs so the browser's native validation UI helps (free, no code).
- For JS-driven checks, add a visible marker on the specific invalid field (e.g. `el.classList.add('input-error')` with a red outline style) instead of only a generic toast.

### 4. No accessibility support
Zero `aria-*` attributes and zero `tabindex` anywhere in the codebase. Icon-only buttons (delete, edit, filter) have no `aria-label`, so a screen reader announces them as unlabeled buttons. Modal dialogs don't trap focus or restore focus to the trigger element on close.

**Why it matters:** the app is unusable with assistive tech, and keyboard-only users (no mouse) can't reliably navigate custom dropdowns/modals since focus order isn't managed.

**Fix (incremental, doesn't need a big rewrite):**
- Add `aria-label` to icon-only buttons: `<button aria-label="Delete order" ...><i class="fas fa-trash"></i></button>`
- Add `role="dialog" aria-modal="true"` to the modal container and move focus into it on open, back to the trigger on close.
- This can be done gradually, prioritizing the most-used screens (orders, invoices) first.

### 5. No unsaved-changes warning
Long forms (new order with several item rows, settings page) don't warn before navigating away or closing the tab with unsaved input — a stray sidebar click loses everything typed.

**Fix:** A simple `window.addEventListener('beforeunload', ...)` guard when a form is dirty, or at minimum a confirm-before-navigate check on sidebar link clicks while a "new order"/"new invoice" form is open.

### 6. Inconsistent iconography/wording for the same action across modules
Delete buttons are labeled and behave slightly differently depending on the page — e.g. `deleteOrderConfirm` shows a full descriptive message ("Delete this order and all its items?") while the native-`confirm()` versions in expenses/transport just show a generic "Are you sure you want to delete this expense record?" This is a smaller version of issue #1 but affects copy quality too, not just the dialog styling.

**Fix:** Standardize confirmation copy as part of the `confirmDialog()` migration in #1 — always name the specific record being deleted (e.g. "Delete expense 'Diesel for Delivery Truck' (LKR 12,000)?").

### 7. No double-submit protection (already noted in the security review, repeated here as a UX issue)
Beyond the data-integrity risk, from a pure UX standpoint a user who double-clicks Save with no visual "saving..." state gets no feedback that anything happened — they don't know if the click registered, so they click again.

**Fix:** same as previously suggested — disable the button and show a "Saving..." label during the async call:
```js
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
```

### 8. Gemini chat FAB has no unread/error affordance
The floating Gemini assistant button (`gemini-fab`) is always the same icon regardless of state — no badge for "AI is thinking", no distinct error look if the last call failed. A user has to open the panel to find out whether their last message got a response or errored out.

**Fix:** Minor — add a small pulsing dot or spinner overlay on the FAB while a request is in flight.

---

## Suggested order of work

1. **Quick, high-impact:** #1 (swap native confirm/alert for the existing modal), #7 (disable-button-while-saving), #6 (copy consistency) — all reuse code that already exists elsewhere in the app.
2. **Medium effort:** #2 (loading states), #3 (form validation feedback) — mechanical but touches many files.
3. **Longer term:** #4 (accessibility pass), #5 (unsaved-changes guard), #8 (Gemini FAB state) — nice-to-have polish, not urgent.
