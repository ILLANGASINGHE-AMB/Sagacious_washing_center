# Sagacious Washing Center — Financial Calculation Logic

Documents every formula the system uses to compute order totals, invoices, expenses, profit, and transport costs, and flags where the math is inconsistent or fragile.

---

## 1. Order total (`orders.js` → `saveNewOrder`)

```
itemsSubtotal = Σ (quantity × price)  for each order line
discountAmount = itemsSubtotal × (discountRate / 100)
grandTotal = max(0, itemsSubtotal − discountAmount + deliveryCharge + extraPayment)
orderStatus = advance >= grandTotal ? "Paid" : "Unpaid"
```
- Discount is applied **only to item cost**, not delivery/extra charges — delivery and extra are added back after discount.
- `advance_payment` is compared directly to `grandTotal`, so paying the exact grand total marks the order "Paid" at creation time.

## 2. Invoice generation (`invoice.js` → `saveGeneratedInvoice` / standard invoice path)

```
itemsSubtotal = Σ order_item.subtotal
balance = max(0, order.total_amount − order.advance_payment)
paid_status = advance_payment >= total_amount ? "Paid" : "Unpaid"
```
Invoice is a near-copy of the order's totals at the point of creation (`discount_rate`/`discount_amount` carried over, `subtotal_before_discount` stored as a snapshot).

## 3. Invoice balance — ⚠️ calculated two different ways depending on which screen renders it

**`viewInvoice()` (invoice detail/print view), line ~618–621:**
```
totalPaid = Σ payments.amount + invoice.advance_payment
balance = max(0, invoice.total_amount − totalPaid)
```
Uses the stored `total_amount` as-is. Does **not** re-add `extra_payment` or subtract `deduction_amount`.

**Credit-bill / alternate invoice template, line ~856–869:**
```
itemsSubtotal   = subtotal_before_discount (or recomputed from line items)
discountedItems = itemsSubtotal − discount_amount
grandTotal      = discountedItems + deliveryCharge + extraPayment
finalTotal      = grandTotal − deduction_amount
balance         = max(0, finalTotal − totalPaid)
```
This version fully recomputes from line items and includes `extra_payment` and `deduction_amount`.

**Also inconsistent in the invoice list table** (`invoice.js` line ~226):
```
balance = max(0, invoice.total_amount − invoice.deduction_amount − amountPaid)
```
This is a *third* variant — subtracts `deduction_amount` but never adds `extra_payment`.

**Impact:** if an invoice has a non-zero `extra_payment` or `deduction_amount`, the balance shown on the invoice list, the invoice detail view, and the credit-bill print can all disagree for the same invoice.

**Fix:** pick one canonical formula and compute it in a single shared function (e.g. `computeInvoiceBalance(invoice, items, payments)` in `db.js` or `ui.js`), then call it from all three places instead of re-deriving it inline in each render function.

## 4. Expense averaging (`db.js` → `addGeneralExpense`)

For expenses that cover multiple months (e.g. an annual insurance payment), the system spreads the cost evenly:
```
monthly_averaged_amount = amount / months_covered   (months_covered defaults to 1)
```
This averaged figure — not the raw `amount` — is what analytics and reports use everywhere (`monthly_averaged_amount || amount` fallback pattern), so a one-time LKR 120,000 expense entered with `months_covered = 12` contributes LKR 10,000/month to expense totals, not the full amount in the month it was paid.

## 5. Transport fuel cost (`transport.js`)

```
costPerKm = current_price (per litre) / km_per_litre
tripCost  = trip.distance_km × costPerKm
```
- Fuel price can be set per calendar month (`fuelConfig.monthly_prices[YYYY-MM]`), so historical trips use the rate that was in effect that month; if no month-specific rate exists it falls back to the global config, then to a hardcoded default of **37 LKR/km**.
- This monthly fuel cost feeds directly into the expense totals used for profit calculation (see §6).

## 6. Gross revenue, total expenses, net profit (`analytics.js`, lines ~365–410)

```
grossRevenue = Σ order.total_amount   (for orders in the selected date range)

totalGeneralExpenses  = Σ general_expense.monthly_averaged_amount   (date-filtered)
totalChemicalExpenses = Σ chemical_ledger.total_amount  where type = 'IN'  (date-filtered)
totalTransportExpenses = Σ (trip.distance_km × monthly fuel rate)  where trip.status = 'Completed'  (date-filtered)

totalExpenses = totalGeneralExpenses + totalChemicalExpenses + totalTransportExpenses

netProfit    = grossRevenue − totalExpenses
profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) × 100 : 0
costRatio    = grossRevenue > 0 ? (totalExpenses / grossRevenue) × 100 : 0
avgOrderValue = orderCount > 0 ? grossRevenue / orderCount : 0
```

**Things worth knowing about this formula:**
- **"Gross Revenue" is booked orders, not cash collected.** It sums `total_amount` for every order placed in the period regardless of payment status, so an order that's Delivered-but-Unpaid still counts as revenue that month. This is **accrual-style revenue**, not cash-basis — worth confirming this matches how you want to read the numbers (e.g. an end-of-month spike in unpaid orders will inflate "profit" for that month even though no cash came in).
- **Chemical expenses are counted at purchase (`type = 'IN'` ledger entries), not at usage.** Buying a large chemical stock in one month depresses that month's profit even if it's consumed over the next six.
- **Cost of goods/labor isn't in this formula at all.** There's no line for staff wages, machine wear, water, or facility rent unless someone manually logs them as a `general_expense`. "Net Profit" here really means *Revenue − (chemicals + fuel + whatever's logged as a general expense)* — it will overstate true profit if wages/rent/utilities aren't consistently entered as general expenses.
- **Deductions and refunds aren't subtracted from revenue.** `deduction_amount` on invoices reduces what a customer effectively owes, but it isn't subtracted anywhere in the `grossRevenue` calculation — so recorded revenue can be higher than what was actually ever collectible.

## 7. Day-of-week / monthly / customer / item breakdowns

All derived breakdowns reuse the same building blocks, just bucketed differently:
```
dayOfWeekStats[day].revenue      += order.total_amount
customerStats[customer].revenue  += order.total_amount
itemStats[item].revenue          += order_item.subtotal
timeBuckets[period].revenue      += order.total_amount
timeBuckets[period].expenses     += (general + chemical + transport, same as §6)
```
Same accrual-basis caveat applies to every one of these — they all key off `order.total_amount`, not off actual payments received.

---

## Summary of issues found

| # | Issue | Fix |
|---|---|---|
| 1 | Invoice balance computed 3 different ways in 3 places (`viewInvoice`, credit-bill template, invoice list) | Extract one shared `computeInvoiceBalance()` function; use everywhere |
| 2 | "Gross Revenue" / "Net Profit" are accrual-based (booked orders), not cash-based (payments received) — not clearly labeled as such in the UI | Add a "(booked, not collected)" note next to Gross Revenue, or add a separate cash-collected metric using the `payments` table |
| 3 | Net Profit excludes labor, rent, and utilities unless manually entered as general expenses | Either add dedicated fields for recurring fixed costs, or add a UI warning if no general expenses are logged for a given month before showing profit margin |
| 4 | Chemical cost is booked at purchase, not at usage, distorting month-to-month profit if stock is bought in bulk | Consider tracking chemical *consumption* from `chemical_ledger` (`type = 'OUT'`) against orders instead of/alongside purchases, if inventory-accurate margins matter |
| 5 | Invoice `deduction_amount` reduces customer balance but isn't reflected in reported revenue | Decide whether deductions should reduce booked revenue, and apply consistently |
