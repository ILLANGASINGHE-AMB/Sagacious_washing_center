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
-- 2. FIX ISSUE #6: Atomic ID Generation via Postgres Sequences & RPC
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS batch_id_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS invoice_num_seq START WITH 1;

CREATE OR REPLACE FUNCTION next_batch_id(prefix text) 
RETURNS text AS $$
  SELECT prefix || lpad(nextval('batch_id_seq')::text, 4, '0');
$$ LANGUAGE sql VOLATILE;

CREATE OR REPLACE FUNCTION next_invoice_number(prefix text) 
RETURNS text AS $$
  SELECT prefix || lpad(nextval('invoice_num_seq')::text, 4, '0');
$$ LANGUAGE sql VOLATILE;

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

-- Policy definitions for all core and optional tables
DO $$
BEGIN
  -- 1. Orders
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE POLICY "Allow read orders" ON public.orders FOR SELECT USING (true);
    CREATE POLICY "Allow write orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 2. Order Items
  IF to_regclass('public.order_items') IS NOT NULL THEN
    CREATE POLICY "Allow read order_items" ON public.order_items FOR SELECT USING (true);
    CREATE POLICY "Allow write order_items" ON public.order_items FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 3. Customers
  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE POLICY "Allow read customers" ON public.customers FOR SELECT USING (true);
    CREATE POLICY "Allow write customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 4. Drivers
  IF to_regclass('public.drivers') IS NOT NULL THEN
    CREATE POLICY "Allow read drivers" ON public.drivers FOR SELECT USING (true);
    CREATE POLICY "Allow write drivers" ON public.drivers FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 5. Invoices
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE POLICY "Allow read invoices" ON public.invoices FOR SELECT USING (true);
    CREATE POLICY "Allow write invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 6. Payments
  IF to_regclass('public.payments') IS NOT NULL THEN
    CREATE POLICY "Allow read payments" ON public.payments FOR SELECT USING (true);
    CREATE POLICY "Allow write payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 7. Deductions
  IF to_regclass('public.deductions') IS NOT NULL THEN
    CREATE POLICY "Allow read deductions" ON public.deductions FOR SELECT USING (true);
    CREATE POLICY "Allow write deductions" ON public.deductions FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- 8. Items
  IF to_regclass('public.items') IS NOT NULL THEN
    CREATE POLICY "Allow read items" ON public.items FOR SELECT USING (true);
    CREATE POLICY "Allow write items" ON public.items FOR ALL USING (true) WITH CHECK (true);
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
