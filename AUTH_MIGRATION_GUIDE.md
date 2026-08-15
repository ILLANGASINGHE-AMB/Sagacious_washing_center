# Migrating to real Supabase Auth — deploy steps

This bundle replaces the old custom `users`-table login (plaintext passwords,
client-side role checks, RLS policies that granted everyone full access
because no one was ever really "authenticated") with real Supabase Auth
login. Follow these steps **in order**. Do this on a staging Supabase
project first if you have one — steps 3 onward touch live data access.

## What changed, in one paragraph

Login now goes through `supabase.auth.signInWithPassword()` instead of a
plaintext password comparison against a `users` table. Each account's role
(`admin` / `user` / `driver`) lives in that account's Supabase Auth
`user_metadata`, which is included in every session's JWT. RLS policies on
every table now check `auth.role() = 'authenticated'` for read/write and
`role = 'admin'` for deletes — and because the JWT is real now, this
actually works, instead of silently defaulting to `'anon'` for everyone the
way the previous policy set did. The only place that can create, edit, or
delete a login account is a new server-side function
(`netlify/functions/admin-users.js`) using the Supabase **service_role**
key — that key never reaches the browser.

## 1. Get your service_role key

Supabase Dashboard → your project → **Project Settings → API**. Copy the
`service_role` **secret** key (not the `anon` `public` key you already
have in `config.js`). Treat this like a root password — it bypasses RLS
entirely.

## 2. Add it as a Netlify environment variable

Netlify → your site → **Site configuration → Environment variables** → Add:

- `SUPABASE_SERVICE_ROLE_KEY` = the key from step 1

(`SUPABASE_URL` and `SUPABASE_ANON_KEY` should already be set from the
original deployment — leave those as they are.)

## 3. Run the SQL migrations, in this order

In Supabase Dashboard → **SQL Editor**:

1. `supabase_security_fixes.sql` — only if you haven't already run this
   from the previous round of fixes (it creates the `next_batch_id` /
   `next_invoice_number` sequences this migration depends on).
2. `supabase_auth_migration.sql` — the new migration in this bundle. This
   drops every existing RLS policy and replaces it with the
   authenticated/admin-scoped versions, and adds the `qr_*` functions the
   public delivery-confirmation page now uses.

Do **not** skip straight to step 2 without step 1 — `qr_insert_invoice`
calls `next_invoice_number()`, which won't exist yet otherwise.

## 4. Redeploy the site

Push this bundle (or trigger a new Netlify deploy) so `package.json`
installs `@supabase/supabase-js` for the new function, and the updated
`db.js` / `app.js` / `index.html` / `settings.js` / `confirm.html` ship.

## 5. Create your first admin account

There's a chicken-and-egg problem: the admin-user-management function only
accepts requests from an already-logged-in admin — except for one
exception, exactly once: if Supabase Auth currently has **zero** users at
all, the function allows a single unauthenticated `create` call through,
and forces that account's role to `admin` no matter what's requested. This
is the intended way to create your very first account.

The simplest way to trigger it is directly from the browser console on
your deployed site (before anyone has logged in):

```js
fetch('/.netlify/functions/admin-users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'create',
    payload: {
      email: 'you@yourcompany.com',
      password: 'choose-a-strong-password',
      username: 'admin',
      display_name: 'Your Name',
      role: 'admin' // ignored on the bootstrap call — always forced to admin
    }
  })
}).then(r => r.json()).then(console.log);
```

Alternatively, Supabase Dashboard → **Authentication → Users → Add user**
also works, but you'll need to separately set `user_metadata` (`role`,
`username`, `display_name`) via **SQL Editor**:

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data ||
  '{"role":"admin","username":"admin","display_name":"Your Name"}'::jsonb
WHERE email = 'you@yourcompany.com';
```

Once one account exists, the bootstrap exception disables itself
automatically — every future `create`/`update`/`delete` call requires a
valid admin session.

## 6. Log in and create accounts for the rest of your staff

Sign in with the account from step 5, go to **Settings → User
Management**, and add an account per staff member (Email + Username +
Display Name + Password + Role). Existing driver/staff logins from the old
`users` table are **not** migrated automatically — there's no way to
recover their plaintext passwords into a hashed system safely, and they
didn't have email addresses. Set new passwords for everyone.

## 7. Verify, then retire the old `users` table

- Log in as each role (admin / user / driver) and confirm the sidebar and
  permissions look right.
- Open `confirm.html?token=<a real qr_token from an order>` and confirm the
  delivery-confirmation flow still works end-to-end for an unpaid order.
- Once you're confident nothing still depends on the old table, drop it:
  ```sql
  DROP TABLE IF EXISTS public.users;
  ```
  It's already locked out via `REVOKE ALL ... FROM anon, authenticated;` in
  the migration, so leaving it in place a while longer for reference is
  safe — nothing in the app reads or writes it anymore.

## Known limitations of this pass

- Username uniqueness is no longer enforced by a database constraint (it
  lives in `user_metadata`, which has no unique index). Supabase *does*
  still enforce unique emails, which is what login actually uses, so this
  is a cosmetic-only gap — worth a follow-up if it matters to you.
- This migration does not address the other issues flagged in the earlier
  review (the `escapeHtml()` XSS helper still isn't wired into renders,
  and a couple of balance calculations still bypass `financials.js`). Ask
  if you'd like those tackled next.
