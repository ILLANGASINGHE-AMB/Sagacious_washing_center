-- ============================================================
-- STANDALONE MIGRATION: Guard against duplicate batch/invoice IDs
-- System: SAGA Washing Center ERP
-- ============================================================
-- Fixes a gap left by supabase_id_generation_fix.sql: next_batch_id() /
-- next_invoice_number() are atomic, but nothing at the DATABASE level
-- actually stops two rows from sharing a batch_id or invoice_number if
-- one is ever written outside that RPC path (a manual edit, a bug, a
-- restored backup that pre-dates the RPC). The id_counters table is also
-- never touched by db.js's exportAll()/importAll() (the app's own
-- Settings > Backup & Restore), so restoring a backup can leave the
-- counter behind the highest batch/invoice number that just came back in,
-- and the very next order/invoice created afterwards collides with one
-- that was just restored.
--
-- This migration:
--   1. Non-destructively de-duplicates any existing duplicate batch_id /
--      invoice_number values: the first (lowest-id, i.e. oldest) row in
--      each duplicate group is left exactly as-is; every later duplicate
--      gets a `-DUP2`, `-DUP3`, ... suffix appended to its batch_id /
--      invoice_number so it becomes unique. No row, order, item, or
--      invoice is deleted or otherwise modified — this only touches the
--      one text value, and only on rows that are already duplicates of
--      something else.
--   2. Adds UNIQUE constraints on orders.batch_id and invoices.invoice_number
--      (Postgres UNIQUE allows any number of NULLs, so existing rows with
--      no batch/invoice number yet are unaffected) so this class of
--      collision can't happen again going forward.
--   3. Adds a SECURITY DEFINER RPC, sync_id_counters(), that resyncs
--      id_counters from the current MAX per prefix across
--      orders.batch_id, invoices.invoice_number, and trips.trip_id (same
--      GREATEST()-guarded backfill as SECTION 5 of FullDatabase.sql,
--      wrapped so the app can call it after a restore instead of that
--      section only ever being run by hand in the SQL editor). The
--      `-DUPn`-suffixed values from step 1 no longer match this
--      function's `-####` pattern, so they're correctly ignored — they
--      won't skew the counter it resyncs to.
--
-- Run this in the Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

BEGIN;

-- 1. De-duplicate existing rows, oldest wins, nothing deleted.
WITH dupes AS (
  SELECT id, batch_id,
         ROW_NUMBER() OVER (PARTITION BY batch_id ORDER BY id) AS rn
  FROM public.orders
  WHERE batch_id IS NOT NULL
)
UPDATE public.orders o
SET batch_id = o.batch_id || '-DUP' || d.rn
FROM dupes d
WHERE o.id = d.id AND d.rn > 1;

WITH dupes AS (
  SELECT id, invoice_number,
         ROW_NUMBER() OVER (PARTITION BY invoice_number ORDER BY id) AS rn
  FROM public.invoices
  WHERE invoice_number IS NOT NULL
)
UPDATE public.invoices i
SET invoice_number = i.invoice_number || '-DUP' || d.rn
FROM dupes d
WHERE i.id = d.id AND d.rn > 1;

-- 2. Uniqueness at the database level, not just "an atomic generator that
--    nothing else is allowed to bypass."
ALTER TABLE public.orders
  ADD CONSTRAINT orders_batch_id_unique UNIQUE (batch_id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);

-- 3. Callable resync so a restore (db.js importAll) can bring id_counters
--    back in line with whatever batch/invoice/trip numbers just landed,
--    instead of relying on someone remembering to re-run SECTION 5 of
--    FullDatabase.sql by hand.
CREATE OR REPLACE FUNCTION public.sync_id_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.id_counters (counter_key, current_value)
  SELECT
    substring(batch_id from '^(.*-)[0-9]{4}$')             AS counter_key,
    MAX(substring(batch_id from '([0-9]{4})$')::integer)   AS current_value
  FROM public.orders
  WHERE batch_id ~ '^.+-[0-9]{4}$'
  GROUP BY substring(batch_id from '^(.*-)[0-9]{4}$')
  ON CONFLICT (counter_key) DO UPDATE
    SET current_value = GREATEST(public.id_counters.current_value, EXCLUDED.current_value);

  INSERT INTO public.id_counters (counter_key, current_value)
  SELECT
    substring(invoice_number from '^(.*-)[0-9]{4}$')           AS counter_key,
    MAX(substring(invoice_number from '([0-9]{4})$')::integer) AS current_value
  FROM public.invoices
  WHERE invoice_number ~ '^.+-[0-9]{4}$'
  GROUP BY substring(invoice_number from '^(.*-)[0-9]{4}$')
  ON CONFLICT (counter_key) DO UPDATE
    SET current_value = GREATEST(public.id_counters.current_value, EXCLUDED.current_value);

  INSERT INTO public.id_counters (counter_key, current_value)
  SELECT
    'ST-'                                                  AS counter_key,
    MAX(substring(trip_id from '([0-9]+)$')::integer)      AS current_value
  FROM public.trips
  WHERE trip_id ~ '^ST-[0-9]+$'
  ON CONFLICT (counter_key) DO UPDATE
    SET current_value = GREATEST(public.id_counters.current_value, EXCLUDED.current_value);
END;
$$;

COMMIT;
