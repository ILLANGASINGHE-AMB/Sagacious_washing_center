-- ============================================================
-- STANDALONE MIGRATION: Per-Month Atomic Batch/Invoice ID Generation
-- System: SAGA Washing Center ERP
-- ============================================================
-- Run this if you have ALREADY applied supabase_security_fixes.sql and
-- just need this specific fix, without re-running the whole file.
-- (supabase_security_fixes.sql has also been updated in place with the
-- same content, for anyone doing a fresh install from scratch.)
--
-- Fixes two problems with next_batch_id()/next_invoice_number():
--
-- 1. The old version used ONE global Postgres sequence shared across
--    every month forever (nextval('batch_id_seq')). That's atomic, but
--    the 4-digit suffix never resets to 0001 at the start of a new
--    month, even though the ID format (LND-MMYY-####) implies it
--    should — batch numbers just keep climbing indefinitely.
--
-- 2. This alone does NOT fix the client-side fallback in db.js, which
--    still uses a non-atomic "scan existing rows, take max, add 1"
--    approach if this RPC call fails for any reason. That fallback is
--    inherently unsafe under concurrent requests and can't be fixed
--    from the client. The accompanying db.js change stops silently
--    falling back to it — see fixes.md for details.
--
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION, and a GREATEST()-guarded backfill that can only
-- raise a counter, never lower it below what's already been issued).
-- ============================================================

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
