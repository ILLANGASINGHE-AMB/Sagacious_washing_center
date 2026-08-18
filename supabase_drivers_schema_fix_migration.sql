-- ============================================================
-- SUPABASE SQL MIGRATION: FIX DRIVERS TABLE SCHEMA
-- System: SAGA Washing Center
-- ============================================================
-- The app's Add/Edit Driver forms (app.js) have always required an
-- `address` field, but the live `drivers` table was missing that
-- column, so every insert failed with PostgREST error PGRST204
-- ("Could not find the 'address' column of 'drivers' in the schema
-- cache"). This adds it (plus the other columns the app relies on,
-- guarded with IF NOT EXISTS so it's a no-op for any that already exist).

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT '';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS phone2 TEXT DEFAULT '';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS nic TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

-- Force PostgREST to immediately pick up the new column instead of
-- waiting for its next automatic schema cache refresh.
NOTIFY pgrst, 'reload schema';
