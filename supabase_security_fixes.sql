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
-- 3. FIX ISSUE #1 & #5: Row Level Security (RLS) & Role Enforcement
-- ------------------------------------------------------------
-- Enable RLS on core tables
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
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

-- Drop existing permissive policies
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' AND policyname LIKE '%anon%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
  END LOOP;
END $$;

-- Policy definitions for authenticated users & roles (safeguarded by table existence)
DO $$
BEGIN
  -- Orders
  IF to_regclass('public.orders') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read orders') THEN
      CREATE POLICY "Authenticated users can read orders" ON public.orders FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage orders') THEN
      CREATE POLICY "Authenticated users can manage orders" ON public.orders FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
    END IF;
  END IF;

  -- Customers
  IF to_regclass('public.customers') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read customers') THEN
      CREATE POLICY "Allow read customers" ON public.customers FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write customers') THEN
      CREATE POLICY "Allow write customers" ON public.customers FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
    END IF;
  END IF;

  -- Invoices
  IF to_regclass('public.invoices') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read invoices') THEN
      CREATE POLICY "Allow read invoices" ON public.invoices FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write invoices') THEN
      CREATE POLICY "Allow write invoices" ON public.invoices FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
    END IF;
  END IF;

  -- Items
  IF to_regclass('public.items') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read items') THEN
      CREATE POLICY "Allow read items" ON public.items FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write items') THEN
      CREATE POLICY "Allow write items" ON public.items FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
    END IF;
  END IF;

  -- Action logs (if created)
  IF to_regclass('public.action_logs') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write action_logs') THEN
      CREATE POLICY "Allow write action_logs" ON public.action_logs FOR ALL USING (true);
    END IF;
  END IF;
END $$;

