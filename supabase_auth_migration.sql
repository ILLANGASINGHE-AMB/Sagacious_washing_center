-- ============================================================
-- SUPABASE SQL MIGRATION: REAL AUTHENTICATION & RLS ENFORCEMENT
-- System: SAGA Washing Center ERP
-- Fixes Issue #1: RLS policies previously allowed USING(true)/CHECK(true)
--   on nearly every table, and the role-check function always fell back
--   to 'anon' because the app never authenticated through Supabase Auth.
--   This migration assumes the app has been switched to real
--   Supabase Auth login (see db.js / app.js changes shipped alongside
--   this file) and locks every table down to real authenticated
--   sessions, with deletes restricted to the 'admin' role.
--
-- READ THE DEPLOY NOTES AT THE BOTTOM BEFORE RUNNING THIS ON PRODUCTION.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helper: read the caller's role from their real Supabase Auth JWT
--    (set via user_metadata at account-creation time — see
--    netlify/functions/admin-users.js). No longer defaults to a lie:
--    if there is no valid session, auth.role() will be 'anon' and every
--    policy below denies access outright rather than falling through.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    'anon'
  );
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- 1. Drop every existing policy so we start from a clean, known state
-- ------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Real, authenticated-only policies for every business table.
--    Pattern: SELECT/INSERT/UPDATE require a logged-in session;
--    DELETE additionally requires role = 'admin'.
--    Anonymous (unauthenticated) requests are denied by default —
--    there is no `true` fallback anywhere below.
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Orders
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE POLICY "authenticated read orders"   ON public.orders FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write orders"  ON public.orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update orders" ON public.orders FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete orders"         ON public.orders FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Order Items
  IF to_regclass('public.order_items') IS NOT NULL THEN
    CREATE POLICY "authenticated read order_items"   ON public.order_items FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write order_items"  ON public.order_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update order_items" ON public.order_items FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete order_items"         ON public.order_items FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Customers
  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE POLICY "authenticated read customers"   ON public.customers FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write customers"  ON public.customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update customers" ON public.customers FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete customers"         ON public.customers FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Drivers
  IF to_regclass('public.drivers') IS NOT NULL THEN
    CREATE POLICY "authenticated read drivers"   ON public.drivers FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write drivers"  ON public.drivers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update drivers" ON public.drivers FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete drivers"         ON public.drivers FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Invoices
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE POLICY "authenticated read invoices"   ON public.invoices FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write invoices"  ON public.invoices FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update invoices" ON public.invoices FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete invoices"         ON public.invoices FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Payments
  IF to_regclass('public.payments') IS NOT NULL THEN
    CREATE POLICY "authenticated read payments"   ON public.payments FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write payments"  ON public.payments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update payments" ON public.payments FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete payments"         ON public.payments FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Deductions
  IF to_regclass('public.deductions') IS NOT NULL THEN
    CREATE POLICY "authenticated read deductions"  ON public.deductions FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write deductions" ON public.deductions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update deductions" ON public.deductions FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete deductions"        ON public.deductions FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Items (catalog)
  IF to_regclass('public.items') IS NOT NULL THEN
    CREATE POLICY "authenticated read items"   ON public.items FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write items"  ON public.items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update items" ON public.items FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete items"         ON public.items FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Settings
  IF to_regclass('public.settings') IS NOT NULL THEN
    CREATE POLICY "authenticated read settings"  ON public.settings FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write settings" ON public.settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update settings" ON public.settings FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete settings"        ON public.settings FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Chemicals
  IF to_regclass('public.chemicals') IS NOT NULL THEN
    CREATE POLICY "authenticated read chemicals"  ON public.chemicals FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write chemicals" ON public.chemicals FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update chemicals" ON public.chemicals FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete chemicals"        ON public.chemicals FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Chemical Ledger
  IF to_regclass('public.chemical_ledger') IS NOT NULL THEN
    CREATE POLICY "authenticated read chemical_ledger"  ON public.chemical_ledger FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write chemical_ledger" ON public.chemical_ledger FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update chemical_ledger" ON public.chemical_ledger FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete chemical_ledger"        ON public.chemical_ledger FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- General Expenses
  IF to_regclass('public.general_expenses') IS NOT NULL THEN
    CREATE POLICY "authenticated read general_expenses"  ON public.general_expenses FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write general_expenses" ON public.general_expenses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update general_expenses" ON public.general_expenses FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete general_expenses"        ON public.general_expenses FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Trips
  IF to_regclass('public.trips') IS NOT NULL THEN
    CREATE POLICY "authenticated read trips"  ON public.trips FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write trips" ON public.trips FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "authenticated update trips" ON public.trips FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "admin delete trips"        ON public.trips FOR DELETE USING (public.current_user_role() = 'admin');
  END IF;

  -- Action Logs (audit trail — no deletes at all, even for admins, via RLS;
  -- use a server-side maintenance task if pruning is ever required)
  IF to_regclass('public.action_logs') IS NOT NULL THEN
    CREATE POLICY "authenticated read action_logs"  ON public.action_logs FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "authenticated write action_logs" ON public.action_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Retire the legacy plaintext-password `users` table.
--    Login no longer reads this table (see db.js). Lock it down
--    completely instead of dropping it outright, so you can still
--    inspect the old records once before deleting them yourself.
--    RLS is already ON for this table from the previous migration;
--    leaving zero policies here means EVERY request — including
--    authenticated ones — is denied. Only the service_role key
--    (server-side only, e.g. inside a Netlify Function) can still
--    read/write it.
-- ------------------------------------------------------------
REVOKE ALL ON public.users FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4. QR delivery-confirmation feature — removed by request.
--    (confirm.html and its DB.getOrderByToken/markOrderReceivedByQR
--    helpers have been deleted from the app; nothing else in the
--    codebase referenced them. orders/customers/order_items/invoices/
--    payments stay locked to `authenticated` only above, with no
--    anonymous-access exceptions.)
-- ------------------------------------------------------------

-- ============================================================
-- DEPLOY NOTES — read before running
-- ============================================================
-- 1. This migration assumes `next_invoice_number(prefix)` and
--    `next_batch_id(prefix)` already exist (from
--    supabase_security_fixes.sql). Run that migration first if you
--    haven't already.
--
-- 2. This migration does NOT create any Supabase Auth users. You must
--    create the first admin account yourself — see
--    AUTH_MIGRATION_GUIDE.md in this bundle for exact steps (it walks
--    through the Supabase Dashboard route, no SQL needed).
--
-- 3. Once you've confirmed login works end-to-end with the new
--    Supabase Auth flow and checked the old `users` table is no
--    longer needed, you can drop it entirely:
--      DROP TABLE IF EXISTS public.users;
--    Not included here automatically — keep your old records until
--    you've verified the new login flow works for every staff member.
--
-- 4. If you paste this whole script into the Supabase SQL Editor and
--    click Run, Postgres treats it as ONE implicit transaction — if
--    any statement errors, everything from the same run rolls back,
--    including statements that looked like they succeeded first. If
--    you ever see an error partway through, assume none of it took
--    effect and re-run the corrected script in full.
-- ============================================================
