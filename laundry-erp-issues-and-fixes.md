# Sagacious Washing Center — ERP Review: Issues & Fixes

Review date: August 14, 2026
Scope: full codebase (`app.js`, `db.js`, `orders.js`, `invoice.js`, `items.js`, `reports.js`, `settings.js`, `gemini.js`, `transport.js`, `expenses.js`, `keyboard.js`, `ui.js`, `confirm.html`, `index.html`, Supabase SQL migrations, Netlify config).

---

## 🔴 Critical — fix before storing real customer/business data

### 1. Database has no real access control
Supabase RLS policies on every table are `FOR ALL USING (true) WITH CHECK (true)`. Combined with the public anon key already sitting in `config.js`, **anyone with browser dev tools can read or write any table directly**, bypassing the login screen and role checks entirely.

**Fix:**
- Migrate login to **Supabase Auth** (email/password or magic link) so RLS can check a real session.
- Replace every open policy with role-scoped checks, e.g.:
```sql
CREATE POLICY "authenticated read" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin write" ON public.orders
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```
- Repeat per table (`customers`, `invoices`, `payments`, `users`, `items`, `chemicals`, `general_expenses`, `trips`, etc.), scoping writes to `admin`/`user`/`driver` as appropriate.

### 2. Plaintext passwords in the `users` table
`db.js` stores and compares passwords in plaintext (`.eq('password', password)`), and this table is fully readable by anyone (see #1).

**Fix:**
- Once on Supabase Auth, delete the plaintext `password` column — Supabase Auth handles hashing for you.
- If Supabase Auth migration is delayed, at minimum hash with bcrypt inside a Netlify Function and never compare plaintext from the client.

### 3. Hardcoded fallback login credentials
`db.js` (`validateLogin`) contains hardcoded fallbacks — `admin/admin`, `user/user`, `driver/d8590` — that work even if the DB call fails.

**Fix:**
- Delete the hardcoded fallback block entirely.
- Make login **fail closed** (deny access) if the DB is unreachable, not fail open.

### 4. Gemini API key exposed to the browser
`gemini.js` fetches the key from Settings client-side and sends it as a URL query param (`?key=...`) directly to Google's API — visible in the Network tab to anyone.

**Fix:**
- Create a Netlify Function, e.g. `/netlify/functions/gemini.js`, that stores the key as a server-side environment variable and proxies the request.
- Update `gemini.js` to call `/.netlify/functions/gemini` instead of `generativelanguage.googleapis.com` directly.
- Remove (or admin-lock and never redisplay) the "paste your Gemini key" field in Settings.

### 5. Role-based access control is client-side only
`isAdmin()` / `applyRoleSidebarRestrictions()` only hide UI elements. Anyone can set `currentUser.role = 'admin'` in the console and still call any `DB.*` function — the real enforcement has to happen at the database layer (see #1).

**Fix:** Same as #1 — RLS policies scoped by authenticated role are the actual security boundary; client-side hiding is cosmetic only.

---

## 🟠 High — data integrity risks

### 6. Batch ID / invoice number race condition
`generateBatchId()` and `generateInvoiceNumber()` scan existing rows client-side, find the max suffix, and add 1 — not atomic. Two near-simultaneous saves (or a retry after a slow network) can generate duplicate IDs.

**Fix:** Use a Postgres sequence via an RPC function instead of a client-side max-scan:
```sql
CREATE SEQUENCE IF NOT EXISTS batch_seq;

CREATE OR REPLACE FUNCTION next_batch_id(prefix text) RETURNS text AS $$
  SELECT prefix || lpad(nextval('batch_seq')::text, 4, '0');
$$ LANGUAGE sql;
```
Call with `supabase.rpc('next_batch_id', { prefix })`. Repeat the pattern for invoice numbers with a second sequence.

### 7. No double-submit protection on order/invoice creation
`saveNewOrder()` (and similar save functions) has no button-disable or in-flight guard — a fast double-click or slow connection can create duplicate orders/invoices.

**Fix:**
```js
async function saveNewOrder(){
  const btn = document.getElementById('ao-save-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    // existing logic
  } finally {
    btn.disabled = false;
  }
}
```

### 8. Missing error handling in `expenses.js` and `transport.js`
Both modules track money and have **zero** `try/catch` blocks. A failed Supabase call throws an unhandled rejection and silently breaks the UI with no user feedback.

**Fix:** Wrap async handlers in try/catch and surface failures via the existing `toast(err.message, 'error')` pattern already used in `orders.js` / `invoice.js`.

---

## 🟡 Medium — hardening

### 9. Unsanitized `innerHTML` (100+ occurrences)
Customer names, item names, or notes containing `<script>` or `<img onerror=...>` would execute if rendered through these calls. Currently lower risk since input is typed by trusted staff, but risk increases with any customer-facing input surface.

**Fix:** Add a small escape helper and use it on any user-entered string before interpolating into `innerHTML`, or switch to `textContent` where no formatting is required:
```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### 10. QR delivery-confirmation token strength unconfirmed
`confirm.html` is public and unauthenticated by design (customers self-confirm delivery), but the token generation for `qr_token` isn't in the reviewed files. Anyone holding a token can mark an order Paid.

**Fix:** Confirm the column default is a cryptographically random UUID, e.g.:
```sql
ALTER TABLE public.orders
  ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();
```
Avoid sequential or short/guessable tokens.

### 11. Secrets committed as hardcoded fallback defaults
`inject-env.js` hardcodes the real Supabase URL/anon key as JS defaults (not just referenced via env vars), meaning they persist in git history even after Netlify env vars are set.

**Fix:**
- Replace the hardcoded defaults with empty strings, or throw a build error if `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars are missing.
- **Rotate the Supabase anon key** once RLS is fixed (item #1) — the current key is already exposed in the repo/build output.

---

## Suggested order of work

1. **Quick wins (same day):** #3 (delete hardcoded logins), #6 (atomic ID generation), #7 (double-submit guard).
2. **Core project (1–2 days):** #1 (Supabase Auth + real RLS), #2 (remove plaintext passwords), #4 (move Gemini key server-side).
3. **Cleanup:** #5 (depends on #1), #8, #9, #10, #11.
