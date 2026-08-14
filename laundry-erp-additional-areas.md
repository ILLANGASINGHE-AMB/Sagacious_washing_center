# Sagacious Washing Center — Additional Areas to Review

Covers what hasn't been addressed yet in the earlier security, calculations, and UI/UX reviews: performance/scalability, backup & restore safety, dependency management, and a few smaller gaps.

---

## 🔴 Critical — found while checking backup/restore

### 1. "Upload to Cloud" / "Import from Cloud" send your full database — including plaintext passwords — to any URL typed into a browser `prompt()`
`settings.js` → `uploadToCloud()` / `importFromCloud()`:
```js
const endpoint = prompt('Enter cloud endpoint URL:', 'https://your-server.com/upload-database');
...
fetch(endpoint, { method:'POST', body: JSON.stringify(data) })
```
`data` here is the output of `DB.exportAll()` — every table, including the `users` table with plaintext passwords, every customer, every invoice. There's no validation on the endpoint, no HTTPS enforcement, no confirmation showing what's about to be sent. A typo'd URL, or anyone with access to the Settings page, can exfiltrate the entire business database to any server.

**Fix:**
- Remove this feature, or restrict it to a small allowlist of trusted, pre-configured backup destinations (not a free-text prompt).
- At minimum, strip `password` and any other sensitive fields from the payload before upload, and require typing a confirmation phrase before sending.

### 2. Restore/reset has no rollback if it fails partway through
`DB.importAll()` deletes every table's rows first (`orders`, `invoices`, `payments`, `customers`, `users`, etc.), then re-inserts from the backup file, sequentially, with no database transaction. If the browser loses connection or the tab closes between the delete step and the insert step, **all data is gone with no way back**.

**Fix:**
- Wrap the restore in a Postgres function/transaction (`BEGIN...COMMIT`) via an RPC call, so either everything restores or nothing is deleted.
- At minimum, force an automatic `exportAll()` safety backup download immediately before any restore/reset runs.

---

## 🟠 High — performance & scalability

### 3. No pagination at the database layer
`getOrders()`, `getInvoices()`, `getCustomers()`, `getAllOrderItems()` all fetch the **entire table** with no `.limit()`/`.range()`:
```js
async getOrders() { ... _sb.from('orders').select('*') ... }
async getInvoices() { return _q(_sb.from('invoices').select('*').order('id', {ascending:false})); }
```
Supabase's default REST limit is 1000 rows per query — once orders/invoices pass that, **older or newer records silently disappear** from lists and reports depending on sort order, with no error shown.

**Fix:** Add server-side pagination (`.range(from, to)`) to these queries, or explicitly raise/set a limit and paginate through results for reports that need the full dataset (e.g. annual analytics).

### 4. Every page load fetches full tables, all client-side
Filtering/sorting/searching (orders, invoices, items) happens by fetching everything and filtering in JavaScript, not via Supabase `.eq()`/`.ilike()`/`.gte()` filters in the query itself. This works fine at small scale but will get slower every month as data grows, and it's unnecessary data transfer.

**Fix:** Push filters into the Supabase query (e.g. `.ilike('hotel_name', '%'+search+'%')`, `.gte('pickup_date', from)`) instead of fetching all rows and filtering with `.filter()`/`.forEach()` in JS.

### 5. Sequential inserts instead of batch inserts
Order-item creation does one `await DB.addOrderItem(...)` per line item in a loop:
```js
for (const item of orderItems) await DB.addOrderItem({...item, order_id: orderId});
```
This appears 3 times (`orders.js`). For an order with 10 line items, that's 10 separate round-trips instead of 1.

**Fix:** Batch into a single insert:
```js
await _q(_sb.from('order_items').insert(orderItems.map(i => ({...i, order_id: orderId}))));
```

---

## 🟡 Medium — dependencies & environment

### 6. CDN dependencies are inconsistently version-pinned
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>       <!-- not pinned -->
<script src="...Chart.js/4.4.1/chart.umd.min.js"></script>                          <!-- pinned -->
<script src="...xlsx/0.18.5/xlsx.full.min.js"></script>                             <!-- pinned -->
```
Supabase JS is pinned only to major version `@2`, so a minor/patch update on jsDelivr's side can silently change client behavior with no warning and no way to reproduce a bug tied to a specific version.

**Fix:** Pin an exact version, e.g. `@supabase/supabase-js@2.45.4`, and update deliberately/test before bumping.

### 7. Gemini model list should be periodically re-verified
`gemini.js` hardcodes a fallback list of model names (`gemini-3.5-flash`, `gemini-3.1-flash-lite`, etc.). Google periodically deprecates model versions — worth a recurring check that the configured model names are still valid, so the AI assistant doesn't silently stop working after a Google-side deprecation.

---

## 🟢 Smaller items worth a look

### 8. Timezone handling isn't explicit anywhere
All date logic uses the browser's local `new Date()`/`toISOString()` with no explicit timezone handling. Fine if only used from Sri Lanka, but worth confirming: does "today's orders" mean midnight in the browser's timezone, or a fixed business timezone? This matters if any staff ever access the system from a different timezone (e.g. a manager checking reports while traveling) — date-range reports could shift by hours.

### 9. Logo upload has no size/type limit beyond `accept="image/*"`
`handleLogoUpload()` reads any image file via `FileReader` and stores it as a base64 string directly in the `settings` table with no size cap. A large uncompressed photo (multiple MB) chosen as a logo will bloat that settings row and slow down every page that loads settings (which is most pages, since company info/logo renders on invoices).

**Fix:** Add a client-side size check (e.g. reject/resize anything over ~500KB) and consider compressing/resizing to a fixed max width before storing.

### 10. No changelog or version tracking beyond the `?v=5.6` query string
The script tags use `?v=5.6` for cache-busting, but there's no `CHANGELOG.md` or version history documenting what changed between versions — makes it harder to know what shipped when, especially useful once multiple people work on this.

**Fix:** A simple `CHANGELOG.md`, bumped alongside the `?v=` query string, would help future debugging ("this bug started after v5.4").

---

## Summary table

| # | Area | Severity | Fix effort |
|---|---|---|---|
| 1 | Cloud upload/import sends plaintext passwords to any URL | 🔴 Critical | Small — remove or lock down |
| 2 | Restore/reset has no rollback on failure | 🔴 Critical | Medium — needs a DB transaction/RPC |
| 3 | No pagination — tables silently truncate past 1000 rows | 🟠 High | Medium |
| 4 | Filtering done client-side after fetching everything | 🟠 High | Medium |
| 5 | Sequential inserts instead of batched inserts | 🟠 High | Small |
| 6 | Supabase JS not pinned to an exact version | 🟡 Medium | Trivial |
| 7 | Gemini model names need periodic re-verification | 🟡 Medium | Ongoing/low effort |
| 8 | No explicit timezone handling | 🟢 Low | Depends on usage pattern |
| 9 | Logo upload has no size limit | 🟢 Low | Small |
| 10 | No changelog | 🟢 Low | Small, ongoing habit |
