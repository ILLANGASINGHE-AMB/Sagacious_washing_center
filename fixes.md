Sagacious Washing Center — Fix Verification Audit (v6.2)

Here's the updated audit status for every issue across all review documents, checked against the actual code (not just against what an earlier pass of this document claimed).

⚠️ CORRECTION TO v6.1: This document previously marked #1, #4, and the "unsanitized innerHTML" item as ✅ Fixed. On re-verification against the code, they were not. #1 and #4 are addressed in v6.2 (see below, plus AUTH_MIGRATION_GUIDE.md for required deploy steps — the code change alone does nothing until you run the new SQL migration and set the new environment variable). The innerHTML/XSS item is still open.

🔴 Critical Issues
Issue	Status	Notes
#1 DB access control & RLS policies	✅ Fixed (v6.2, deploy steps required)	supabase_security_fixes.sql's policies were still `USING(true)`/`CHECK(true)` for SELECT/INSERT/UPDATE, and current_user_role() always fell back to 'anon' because the app never authenticated through Supabase Auth — so DELETE policies that allowed role IN ('admin','anon') let literally anyone delete too. Fixed properly in v6.2: login now goes through real Supabase Auth (db.js signIn/getSession, app.js), roles live in each account's user_metadata, and supabase_auth_migration.sql replaces every policy with auth.role()='authenticated' (read/write) and current_user_role()='admin' (delete). See AUTH_MIGRATION_GUIDE.md — this requires running new SQL and setting SUPABASE_SERVICE_ROLE_KEY on Netlify before it takes effect.
#2 Plaintext passwords in users table	✅ Fixed (v6.2)	The legacy `users` table (plaintext passwords) is no longer used for authentication at all. Supabase Auth stores and hashes credentials; the old table is RLS-locked (REVOKE ALL) pending manual DROP once you've verified the new login flow.
#3 Hardcoded fallback login credentials	✅ Fixed	validateLogin fails closed with no hardcoded fallback logins; ensureDefaultUsers() arrays removed from db.js; login hints removed from index.html. (Superseded in v6.2 — validateLogin itself is gone, replaced by DB.signIn() via Supabase Auth.)
#4 Gemini API key exposed to browser	⚠️ Partially fixed	netlify/functions/gemini.js (the server-side proxy) is implemented correctly. But gemini.js on the client still has a fallback path that reads a key from Settings and calls Google's API directly from the browser with the key in the URL — visible in the Network tab. Not addressed in this pass; flagged for follow-up.
#5 Client-side-only role checks	⚠️ Partially fixed (v6.2)	Client-side deletion guards (canDelete() / requireAdmin()) are cosmetic on their own — the actual enforcement now happens at the database layer via the v6.2 RLS policies (see #1), which is what makes this real instead of decorative.
Additional #1 Cloud upload sends plaintext passwords to any URL	✅ Fixed (v6.2)	Login credentials are no longer part of exportAll() at all (they live in Supabase Auth, not an exportable table), so there's nothing to strip. uploadToCloud() and importFromCloud() still enforce HTTPS protocol URLs.
Additional #2 Restore has no rollback on failure	✅ Fixed	importAll() performs pre-restore snapshot export to ensure safe rollback if insertion fails.

🟠 High Issues
Issue	Status	Notes
#6 Batch ID / invoice number race condition	✅ Fixed (v6.4, corrected)	Originally "fixed" by an atomic RPC (next_batch_id/next_invoice_number) backed by a global Postgres sequence — but that had two remaining problems, caught on review: (1) db.js still fell back to the old non-atomic client-side "scan max, add 1" method whenever the RPC call failed, reintroducing the exact race it was meant to fix; (2) the sequence was global, not per-month, so the 4-digit suffix never reset to 0001 each month despite the LND-MMYY-#### format implying it should. v6.4 replaces the global sequence with a per-month atomic counter table (id_counters, keyed by prefix, via INSERT ... ON CONFLICT DO UPDATE — see supabase_id_generation_fix.sql, includes a backfill so existing IDs can't collide) and removes the unsafe fallback entirely: db.js now retries the RPC once, then throws a clear error instead of silently minting an ID the unsafe way. A rare loud failure beats a rare silent duplicate.
#7 No double-submit protection	✅ Fixed	Action buttons check disabled state and show visual loading spinners during async calls.
#8 No error handling in expenses.js / transport.js	✅ Fixed	Both files feature try/catch blocks; native confirm()/alert() replaced with confirmDialog() and toast().
Additional #3 Range-based server pagination	✅ Fixed	getOrdersPaged(), getInvoicesPaged(), getCustomersPaged() added to db.js using Supabase .range().
Additional #4 Client-side filtering	✅ Fixed	Range-based paged helpers available for scalable queries.
Additional #5 Sequential inserts for order items	✅ Fixed	saveNewOrder(), saveEditOrder(), saveCreditBill() use DB.addOrderItemsBatch() single-query insert.

🟡 Medium Issues
Issue	Status	Notes
#9 Unsanitized innerHTML (XSS)	❌ Not fixed	escapeHtml() is defined in ui.js and exported on window, but is not called anywhere else in the codebase — ~120 innerHTML interpolations of user-entered data (customer names, notes, etc.) across app.js/orders.js/items.js/invoice.js remain unescaped. Flagged for follow-up; settings.js's new user-management table (v6.2) does use it correctly as an example of the pattern to extend elsewhere.
#10 QR token strength	✅ Fixed	supabase_security_fixes.sql sets DEFAULT gen_random_uuid() on qr_token and backfills nulls.
#11 Secrets in inject-env.js	✅ Fixed	inject-env.js uses process.env.SUPABASE_URL || '' with no fallback credentials.
Financial calc: Invoice balance computed 3 ways	✅ Fixed (v6.3)	undoPaymentForInvoice() in invoice.js and the "Pay Now" flow in app.js now call Financials.computeInvoiceFinancials() instead of recomputing balance manually (both previously ignored deduction_amount). orders.js's five inline grand-total/discount duplicates (two live-preview calculators, saveCreditBill, saveNewOrder, saveEditOrder — including its invoice-balance recompute, which also previously dropped existing deductions on every order edit) all now call Financials.computeOrderFinancials()/computeInvoiceFinancials() instead of re-implementing the formula.
Additional #6 Supabase JS not version-pinned	✅ Fixed	Pinned to @supabase/supabase-js@2.39.7 UMD release in index.html.

v6.4 — Full Income/Expense/Deduction Calculation Audit
Issue	Status	Notes
Chemical COGS mode broken	✅ Fixed	Usage (OUT) chemical ledger entries never had a unit_price/total_amount (only purchases did), so computeChemicalExpenses's "consumed" total always read 0 and silently fell back to the purchase total — meaning the COGS vs Purchases toggle in Analytics did nothing. expenses.js's saveChemLog() now prices every OUT entry with a weighted-average unit cost (Financials.computeWeightedAverageChemicalCost), and computeChemicalExpenses no longer has the silent fallback. A one-time admin-only "Recalculate Historical Costs" button (Expenses tab) backfills correct costs onto existing historical OUT entries — new entries are priced automatically going forward, but you must click this once for old data to become accurate.
Monthly Revenue Report undercounted	✅ Fixed	generateMonthlyRevenueReport() in reports.js only summed the payments table, missing every advance_payment collected directly on an order at creation time (the common case for pay-upfront orders that never generate a separate payments row). Now sums both sources per month.
Full Report "Remaining" ignored deductions	✅ Fixed	reports.js's Full Report (and Customer Summary / Monthly Bills, already correct) now subtract inv.deduction_amount before computing the remaining balance shown per order.
Daily Orders Report mislabeled figure	✅ Fixed	The single "Total Revenue" footer actually summed total_amount (billed, not collected). Split into two clearly labeled rows: "Total Billed Today" and "Cash Collected Today".
Dashboard "Total/Monthly Income" not labeled as accrual	✅ Fixed	Renamed to "Monthly Billed (Accrual)" / "Total Billed (All-Time)" and added a "Monthly Cash Collected" card (advance payments + logged payments), matching the accrual/cash distinction Analytics already used.
Amortized expense proration over-counted partial date ranges	✅ Fixed	Financials.computeAmortizedExpenses() counted a covered month as fully "active" (and charged the FULL monthly share) if the report window overlapped it by even a single day. Now prorates by actual day-overlap, so a custom range only counts the fraction of each covered month that falls inside it. Full-calendar-month windows (the normal monthly-report case) are unaffected — overlap fraction is 1.
Analytics trend chart expenses didn't match the P&L summary	✅ Fixed	groupDataByTimeGrain()'s per-bucket expense totals dumped a multi-month expense's entire per-month share into a single bucket (keyed off its entry date) and excluded expenses whose entry date fell outside the window even when their coverage overlapped it. Now spreads the amortized share across every covered month/day it actually overlaps the window, consistent with computeAmortizedExpenses.
Expenses tab "Financial Balance Summary" mixed accrual/lifetime/monthly figures	✅ Fixed	"Monthly Averaged Outlay" summed every general expense's monthly rate for the life of the system (so an expired 6-month expense from over a year ago kept counting as "this month's" overhead forever); "Monthly Net Profit" subtracted totalChemPurchases — an all-time cumulative chemical purchase total — from a single month's income, making the figure more wrong every month as purchase history grew. Both now use Financials.computeAmortizedExpenses / computeChemicalExpenses scoped strictly to the current calendar month. Income cards relabeled to match the Dashboard's accrual/cash terminology, with a new "Monthly Cash Collected" card added.
General Expenses list "Monthly Averaged Outlay" same lifetime-sum bug	✅ Fixed	Same fix applied to the summary card on the General Expenses sub-tab (renderGeneralExpenses) — now scoped to the current month via Financials.computeAmortizedExpenses instead of summing every expense ever entered.
Partial payment could leave order.status and invoice.paid_status disagreeing	✅ Fixed	processPartialPayment() in app.js decided the order's status from a raw advance >= total_amount check while the invoice's own paid_status was (correctly) computed with deduction_amount factored in — so an invoice closed out by a deduction could show "Paid" while its order stayed "Unpaid". Both are now derived from the same Financials.computeInvoiceFinancials() call.
Batch Pay could overcharge invoices with an existing deduction	✅ Fixed	showBatchPayConfirmModal() computed each order's amount due as total_amount - totalPaid, ignoring any deduction_amount already applied to that invoice — so a batch payment could demand the pre-deduction amount. Now uses Financials.computeInvoiceFinancials().

UI/UX Issues
Issue	Status	Notes
UX #1 Native confirm()/alert() in expenses/transport	✅ Fixed	Zero native confirm() or alert() calls remain.
UX #2 No loading states	✅ Fixed	showLoading() helper integrated across orders, invoices, and catalog renders.
UX #3 Form validation feedback	✅ Fixed	Toast validation combined with .input-error CSS highlighting on missing fields.
UX #4 Accessibility support	✅ Fixed	Modals use role="dialog", aria-modal="true", auto-focusing elements; topbar/drawer buttons include aria-labels.
UX #5 Unsaved-changes warning	✅ Fixed	window.isFormDirty and beforeunload listener added in app.js.
UX #6 Inconsistent confirmation copy	✅ Fixed	All confirmation prompts styled through confirmDialog() with specific record naming.
UX #7 No double-submit protection	✅ Fixed	Same as issue #7 above.
UX #8 Gemini FAB activity state	✅ Fixed	#gemini-fab toggles .thinking pulsing indicator while AI queries process.

Refactor Plan
Item	Status	Notes
calculations.js / financials.js	✅ Done	Implemented as financials.js with Financials & Calc global namespace.
print.js	✅ Done	Implemented as Print.openPrintWindow() — unified HTML print popups.
Script load order	✅ Done	financials.js and print.js load right after ui.js and before feature files.
Version bumped	✅ Done	All scripts updated to ?v=6.0.
Feature-file structure preserved	✅ Done