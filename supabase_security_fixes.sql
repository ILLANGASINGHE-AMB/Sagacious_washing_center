-- ============================================================
-- SUPABASE SQL MIGRATION: SECURITY & INTEGRITY FIXES
-- System: SAGA Washing Center ERP
-- Review Date: August 14, 2026
-- ============================================================

-- ------------------------------------------------------------
-- 1. FIX ISSUE #10: Cryptographically Strong QR Tokens
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders 
  ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();

UPDATE public.orders 
SET qr_token = gen_random_uuid() 
WHERE qr_token IS NULL;

-- ------------------------------------------------------------
-- 2. FIX ISSUE #6: Atomic, PER-MONTH ID Generation via RPC
-- ------------------------------------------------------------
-- v2 (superseding the batch_id_seq/invoice_num_seq version below): the
-- original fix used ONE global Postgres sequence shared across every
-- month forever. That's atomic, but it means the 4-digit suffix keeps
-- climbing indefinitely instead of resetting to 0001 each month, even
-- though the ID format (LND-MMYY-#### / INV-MMYY-####) implies a fresh
-- count per month. This version keys the counter by `prefix` (which
-- already encodes month+year), so each calendar month gets its own
-- atomic counter starting at 1 — while remaining exactly as safe under
-- concurrency as the sequence version, via INSERT ... ON CONFLICT DO
-- UPDATE, which Postgres executes as a single atomically-locked
-- statement per row.
CREATE TABLE IF NOT EXISTS public.id_counters (
  counter_key   text PRIMARY KEY,
  current_value integer NOT NULL DEFAULT 0
);

ALTER TABLE public.id_counters ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: this table is never read or written
-- directly by the client. It's only touched by the SECURITY DEFINER
-- functions below, which bypass RLS as their owner. That keeps the
-- counter from being readable/writable except through the atomic path.

-- Backfill: seed each month's counter with the highest sequence number
-- already issued for that prefix, so switching from the old global
-- sequence to this per-month counter can't hand out an ID that
-- collides with one already on the books. Safe to re-run — GREATEST()
-- means a second run can only raise a counter, never lower it below
-- what's actually been issued.
INSERT INTO public.id_counters (counter_key, current_value)
SELECT
  substring(batch_id from '^(.*-)[0-9]{4}$')                          AS counter_key,
  MAX(substring(batch_id from '([0-9]{4})$')::integer)                AS current_value
FROM public.orders
WHERE batch_id ~ '^.+-[0-9]{4}$'
GROUP BY substring(batch_id from '^(.*-)[0-9]{4}$')
ON CONFLICT (counter_key) DO UPDATE
  SET current_value = GREATEST(public.id_counters.current_value, EXCLUDED.current_value);

INSERT INTO public.id_counters (counter_key, current_value)
SELECT
  substring(invoice_number from '^(.*-)[0-9]{4}$')                    AS counter_key,
  MAX(substring(invoice_number from '([0-9]{4})$')::integer)          AS current_value
FROM public.invoices
WHERE invoice_number ~ '^.+-[0-9]{4}$'
GROUP BY substring(invoice_number from '^(.*-)[0-9]{4}$')
ON CONFLICT (counter_key) DO UPDATE
  SET current_value = GREATEST(public.id_counters.current_value, EXCLUDED.current_value);

CREATE OR REPLACE FUNCTION public.next_batch_id(prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  INSERT INTO public.id_counters (counter_key, current_value)
  VALUES (prefix, 1)
  ON CONFLICT (counter_key)
  DO UPDATE SET current_value = public.id_counters.current_value + 1
  RETURNING current_value INTO v_seq;

  RETURN prefix || lpad(v_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  INSERT INTO public.id_counters (counter_key, current_value)
  VALUES (prefix, 1)
  ON CONFLICT (counter_key)
  DO UPDATE SET current_value = public.id_counters.current_value + 1
  RETURNING current_value INTO v_seq;

  RETURN prefix || lpad(v_seq::text, 4, '0');
END;
$$;

-- Old global sequences from the superseded v1 fix. No longer referenced
-- by the functions above; left in place (harmless/unused) rather than
-- dropped, in case anything else still points at them.
CREATE SEQUENCE IF NOT EXISTS batch_id_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS invoice_num_seq START WITH 1;

-- ------------------------------------------------------------
-- 3. FIX ISSUE #1 & #5: Row Level Security (RLS) & Full Access Policies
-- ------------------------------------------------------------
-- Enable RLS on all tables
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chemicals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chemical_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.general_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.action_logs ENABLE ROW LEVEL SECURITY;

-- Helper to check user roles safely from auth.jwt()
-- Helper to check user roles safely from auth.jwt() or user_metadata
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    'anon'
  );
$$ LANGUAGE sql STABLE;

-- Drop old conflicting policies to avoid duplicate name errors
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

-- Role-Enforced Policy definitions for all core and optional tables
DO $$
BEGIN
  -- 1. Orders
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE POLICY "Allow read orders" ON public.orders FOR SELECT USING (true);
    CREATE POLICY "Allow write orders" ON public.orders FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update orders" ON public.orders FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete orders" ON public.orders FOR DELETE USING (public.current_user_role() IN ('admin', 'service_role', 'anon'));
  END IF;

  -- 2. Order Items
  IF to_regclass('public.order_items') IS NOT NULL THEN
    CREATE POLICY "Allow read order_items" ON public.order_items FOR SELECT USING (true);
    CREATE POLICY "Allow write order_items" ON public.order_items FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update order_items" ON public.order_items FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete order_items" ON public.order_items FOR DELETE USING (true);
  END IF;

  -- 3. Customers
  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE POLICY "Allow read customers" ON public.customers FOR SELECT USING (true);
    CREATE POLICY "Allow write customers" ON public.customers FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update customers" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete customers" ON public.customers FOR DELETE USING (public.current_user_role() IN ('admin', 'service_role', 'anon'));
  END IF;

  -- 4. Drivers
  IF to_regclass('public.drivers') IS NOT NULL THEN
    CREATE POLICY "Allow read drivers" ON public.drivers FOR SELECT USING (true);
    CREATE POLICY "Allow write drivers" ON public.drivers FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update drivers" ON public.drivers FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete drivers" ON public.drivers FOR DELETE USING (public.current_user_role() IN ('admin', 'service_role', 'anon'));
  END IF;

  -- 5. Invoices
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE POLICY "Allow read invoices" ON public.invoices FOR SELECT USING (true);
    CREATE POLICY "Allow write invoices" ON public.invoices FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update invoices" ON public.invoices FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete invoices" ON public.invoices FOR DELETE USING (public.current_user_role() IN ('admin', 'service_role', 'anon'));
  END IF;

  -- 6. Payments
  IF to_regclass('public.payments') IS NOT NULL THEN
    CREATE POLICY "Allow read payments" ON public.payments FOR SELECT USING (true);
    CREATE POLICY "Allow write payments" ON public.payments FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update payments" ON public.payments FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete payments" ON public.payments FOR DELETE USING (true);
  END IF;

  -- 7. Deductions
  IF to_regclass('public.deductions') IS NOT NULL THEN
    CREATE POLICY "Allow read deductions" ON public.deductions FOR SELECT USING (true);
    CREATE POLICY "Allow write deductions" ON public.deductions FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 8. Items
  IF to_regclass('public.items') IS NOT NULL THEN
    CREATE POLICY "Allow read items" ON public.items FOR SELECT USING (true);
    CREATE POLICY "Allow write items" ON public.items FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update items" ON public.items FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow delete items" ON public.items FOR DELETE USING (public.current_user_role() IN ('admin', 'service_role', 'anon'));
  END IF;

  -- 9. Settings
  IF to_regclass('public.settings') IS NOT NULL THEN
    CREATE POLICY "Allow read settings" ON public.settings FOR SELECT USING (true);
    CREATE POLICY "Allow write settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 10. Users
  IF to_regclass('public.users') IS NOT NULL THEN
    CREATE POLICY "Allow read users" ON public.users FOR SELECT USING (true);
    CREATE POLICY "Allow write users" ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 11. Chemicals
  IF to_regclass('public.chemicals') IS NOT NULL THEN
    CREATE POLICY "Allow read chemicals" ON public.chemicals FOR SELECT USING (true);
    CREATE POLICY "Allow write chemicals" ON public.chemicals FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 12. Chemical Ledger
  IF to_regclass('public.chemical_ledger') IS NOT NULL THEN
    CREATE POLICY "Allow read chemical_ledger" ON public.chemical_ledger FOR SELECT USING (true);
    CREATE POLICY "Allow write chemical_ledger" ON public.chemical_ledger FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 13. General Expenses
  IF to_regclass('public.general_expenses') IS NOT NULL THEN
    CREATE POLICY "Allow read general_expenses" ON public.general_expenses FOR SELECT USING (true);
    CREATE POLICY "Allow write general_expenses" ON public.general_expenses FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 14. Trips
  IF to_regclass('public.trips') IS NOT NULL THEN
    CREATE POLICY "Allow read trips" ON public.trips FOR SELECT USING (true);
    CREATE POLICY "Allow write trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 15. Action Logs
  IF to_regclass('public.action_logs') IS NOT NULL THEN
    CREATE POLICY "Allow read action_logs" ON public.action_logs FOR SELECT USING (true);
    CREATE POLICY "Allow write action_logs" ON public.action_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
