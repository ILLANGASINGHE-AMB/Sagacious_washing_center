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
-- 4. Public QR delivery-confirmation flow (confirm.html).
--    This page is intentionally used by customers with no login —
--    they reach it via a one-time, cryptographically random link
--    (qr_token, already hardened to gen_random_uuid() by the prior
--    security migration). Because orders/customers/invoices/payments
--    are now locked to `authenticated` above, that anonymous flow
--    needs its own narrow doors. Each function below is SECURITY
--    DEFINER (runs with elevated privilege) but independently
--    re-validates the token against the specific row it touches —
--    so knowing a valid token only ever grants access to that one
--    order, never to the tables at large.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.qr_get_order(p_token uuid)
RETURNS SETOF public.orders
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.orders WHERE qr_token = p_token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.qr_get_customer_name(p_token uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.hotel_name FROM public.customers c
  JOIN public.orders o ON o.customer_id = c.id
  WHERE o.qr_token = p_token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.qr_get_order_items(p_token uuid)
RETURNS SETOF public.order_items
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.* FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.qr_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.qr_get_invoice(p_token uuid)
RETURNS SETOF public.invoices
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.* FROM public.invoices i
  JOIN public.orders o ON o.id = i.order_id
  WHERE o.qr_token = p_token LIMIT 1;
$$;

-- Marks the order's existing invoice as fully paid. Re-checks the invoice
-- actually belongs to the order matching the token before touching it.
CREATE OR REPLACE FUNCTION public.qr_mark_invoice_paid(p_token uuid, p_invoice_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.invoices SET balance = 0, paid_status = 'Paid', payment_date = now()
  WHERE id = p_invoice_id
    AND order_id = (SELECT id FROM public.orders WHERE qr_token = p_token LIMIT 1);
END;
$$;

-- Inserts a payment row against an invoice, only if that invoice belongs
-- to the order matching the supplied token.
CREATE OR REPLACE FUNCTION public.qr_insert_payment(p_token uuid, p_invoice_id bigint, p_amount numeric, p_method text, p_notes text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id bigint;
BEGIN
  SELECT id INTO v_order_id FROM public.orders WHERE qr_token = p_token LIMIT 1;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired QR token.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id AND order_id = v_order_id) THEN
    RAISE EXCEPTION 'Invoice does not belong to this order.';
  END IF;
  INSERT INTO public.payments (invoice_id, amount, method, notes, date)
  VALUES (p_invoice_id, p_amount, p_method, p_notes, now());
END;
$$;

-- Creates a brand-new invoice for the order matching the token. order_id
-- is always derived server-side from the token, never trusted from the
-- client payload, so a forged order_id in p_invoice can never attach the
-- new invoice to someone else's order.
CREATE OR REPLACE FUNCTION public.qr_insert_invoice(p_token uuid, p_invoice jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id bigint;
  v_new_id bigint;
  v_invoice_number text;
BEGIN
  SELECT id INTO v_order_id FROM public.orders WHERE qr_token = p_token LIMIT 1;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired QR token.';
  END IF;

  v_invoice_number := public.next_invoice_number(COALESCE(p_invoice->>'invoice_number_prefix', 'INV-'));

  INSERT INTO public.invoices (
    order_id, invoice_number, issue_date, delivery_date, invoice_type,
    total_amount, advance_payment, extra_payment, balance, paid_status,
    payment_date, discount_rate, discount_amount, delivery_charge,
    subtotal_before_discount
  ) VALUES (
    v_order_id,
    v_invoice_number,
    now(),
    (p_invoice->>'delivery_date')::timestamptz,
    'Standard',
    COALESCE((p_invoice->>'total_amount')::numeric, 0),
    COALESCE((p_invoice->>'advance_payment')::numeric, 0),
    COALESCE((p_invoice->>'extra_payment')::numeric, 0),
    0,
    'Paid',
    now(),
    COALESCE((p_invoice->>'discount_rate')::numeric, 0),
    COALESCE((p_invoice->>'discount_amount')::numeric, 0),
    COALESCE((p_invoice->>'delivery_charge')::numeric, 0),
    COALESCE((p_invoice->>'subtotal_before_discount')::numeric, 0)
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Marks the order itself as Paid. Only reachable for the exact order the
-- token belongs to.
CREATE OR REPLACE FUNCTION public.qr_mark_order_paid(p_token uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.orders SET status = 'Paid', payment_date = now() WHERE qr_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired QR token.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qr_get_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_get_customer_name(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_get_order_items(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_get_invoice(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_mark_invoice_paid(uuid, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_insert_payment(uuid, bigint, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_insert_invoice(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_mark_order_paid(uuid) TO anon, authenticated;

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
-- 4. Test the confirm.html QR flow against a real order after
--    deploying — it now depends on the qr_* functions above instead
--    of direct table access.
-- ============================================================
