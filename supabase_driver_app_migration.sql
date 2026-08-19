-- ============================================================
-- SUPABASE SQL MIGRATION: DRIVER APP — AUTH LINKAGE, PER-DRIVER
-- RLS, AND ATOMIC TRIP ID GENERATION
-- System: SAGA Washing Center
-- ============================================================
-- Prerequisites for the new standalone driver mobile app (DriverApp/,
-- see DriverApp/driverApp.md). Run this AFTER supabase_auth_migration.sql
-- and supabase_transport_driver_vehicle_link_migration.sql.
--
-- This migration does three things:
--
-- 1. Adds drivers.auth_user_id, linking a Supabase Auth account to the
--    specific `drivers` row it belongs to. Nothing in this codebase had
--    that link before — driver login/role checks worked, but there was
--    no way to resolve "which driver is this login" from the database
--    side. See netlify/functions/admin-users.js for how an admin sets
--    this when creating/managing a driver's login.
--
-- 2. Tightens RLS on `drivers` and `trips` so a driver-role session can
--    only see/edit their OWN driver row and their OWN trips. Every
--    policy on every table today (see supabase_auth_migration.sql) is
--    just `auth.role() = 'authenticated'` — any logged-in user, driver
--    included, can currently read/write any row in any table directly
--    via the Supabase API, regardless of what the app's UI hides. This
--    migration closes that gap specifically for `drivers`/`trips`.
--    `customers`, `vehicles`, `items`, `orders`, `order_items`, and
--    `invoices` are intentionally left as shared/authenticated-only —
--    drivers need to see the shared customer/catalog data to do their
--    job, and Transport is inherently a shared dispatch log for
--    admin/staff even though a driver's own view is now scoped.
--
--    IMPORTANT — this changes behavior in the EXISTING desktop app too,
--    not just the new DriverApp: a driver logged into the current SPA
--    will, after this runs, see only their own trips in the Transport
--    tab (previously saw everyone's), and DB.getDrivers() will return
--    only their own row in a driver session.
--
-- 3. Adds an atomic next_trip_id() RPC and points db.js's
--    generateTripId() at it (see accompanying db.js change). The old
--    generateTripId() scanned every trip visible to the current session
--    for the highest "ST-####" and added one — harmless while every
--    session could see every trip, but after step 2 above a driver's
--    scan only covers their own trips, so two drivers starting trips
--    independently could mint the same trip_id. This uses the same
--    atomic id_counters/INSERT...ON CONFLICT pattern already
--    established for batch/invoice numbers in
--    supabase_id_generation_fix.sql.
--
-- Safe to run multiple times: guarded with IF NOT EXISTS / CREATE OR
-- REPLACE / named DROP POLICY IF EXISTS (not a dynamic drop-all loop,
-- so re-running this file doesn't remove its own policies).
-- ============================================================


-- ── 1. Auth ↔ driver linkage ──────────────────────────────────
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

-- Resolves the drivers.id row belonging to the currently-authenticated
-- session, or NULL if none is linked (or the caller isn't a driver).
-- SECURITY DEFINER + fixed search_path: this function must be callable
-- from inside the drivers/trips RLS policies below, including when
-- evaluating rows the caller's own restricted policy wouldn't otherwise
-- let them read — a plain SQL lookup here (not SECURITY DEFINER) would
-- itself be filtered by the very policy that calls it.
CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


-- ── 2. Per-driver RLS on drivers & trips ──────────────────────

-- drivers: drop every previously-issued policy on this table, from
-- whichever combination of earlier migrations happened to run, then
-- recreate with ownership-aware SELECT/UPDATE.
DROP POLICY IF EXISTS "Allow read drivers"           ON public.drivers;
DROP POLICY IF EXISTS "Allow write drivers"          ON public.drivers;
DROP POLICY IF EXISTS "Allow update drivers"         ON public.drivers;
DROP POLICY IF EXISTS "Allow delete drivers"         ON public.drivers;
DROP POLICY IF EXISTS "authenticated read drivers"   ON public.drivers;
DROP POLICY IF EXISTS "authenticated write drivers"  ON public.drivers;
DROP POLICY IF EXISTS "authenticated update drivers" ON public.drivers;
DROP POLICY IF EXISTS "admin delete drivers"         ON public.drivers;
DROP POLICY IF EXISTS "drivers read own or staff"    ON public.drivers;
DROP POLICY IF EXISTS "drivers update own or staff"  ON public.drivers;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers read own or staff" ON public.drivers
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      public.current_user_role() IN ('admin', 'user')
      OR auth_user_id = auth.uid()
    )
  );

-- Only admin/staff create driver rows — a driver never inserts one for
-- themselves (their login gets *linked* to an existing row instead, by
-- an admin, via netlify/functions/admin-users.js).
CREATE POLICY "drivers insert staff only" ON public.drivers
  FOR INSERT WITH CHECK (public.current_user_role() IN ('admin', 'user'));

CREATE POLICY "drivers update own or staff" ON public.drivers
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND (
      public.current_user_role() IN ('admin', 'user')
      OR auth_user_id = auth.uid()
    )
  ) WITH CHECK (
    auth.role() = 'authenticated' AND (
      public.current_user_role() IN ('admin', 'user')
      OR auth_user_id = auth.uid()
    )
  );

CREATE POLICY "admin delete drivers" ON public.drivers
  FOR DELETE USING (public.current_user_role() = 'admin');


-- trips: same pattern, scoped by driver_id instead of id.
DROP POLICY IF EXISTS "Allow anon trips"           ON public.trips;
DROP POLICY IF EXISTS "authenticated read trips"   ON public.trips;
DROP POLICY IF EXISTS "authenticated write trips"  ON public.trips;
DROP POLICY IF EXISTS "authenticated update trips" ON public.trips;
DROP POLICY IF EXISTS "admin delete trips"         ON public.trips;
DROP POLICY IF EXISTS "trips read own or staff"    ON public.trips;
DROP POLICY IF EXISTS "trips write own or staff"   ON public.trips;
DROP POLICY IF EXISTS "trips update own or staff"  ON public.trips;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips read own or staff" ON public.trips
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      public.current_user_role() IN ('admin', 'user')
      OR driver_id = public.current_driver_id()
    )
  );

CREATE POLICY "trips write own or staff" ON public.trips
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('admin', 'user')
    OR driver_id = public.current_driver_id()
  );

CREATE POLICY "trips update own or staff" ON public.trips
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND (
      public.current_user_role() IN ('admin', 'user')
      OR driver_id = public.current_driver_id()
    )
  ) WITH CHECK (
    auth.role() = 'authenticated' AND (
      public.current_user_role() IN ('admin', 'user')
      OR driver_id = public.current_driver_id()
    )
  );

CREATE POLICY "admin delete trips" ON public.trips
  FOR DELETE USING (public.current_user_role() = 'admin');


-- ── 3. Atomic trip ID generation ──────────────────────────────
-- Same id_counters table used by next_batch_id()/next_invoice_number()
-- (supabase_id_generation_fix.sql) — created here too via IF NOT EXISTS
-- in case this migration is ever applied to a project that hasn't run
-- that one yet.
CREATE TABLE IF NOT EXISTS public.id_counters (
  counter_key   text PRIMARY KEY,
  current_value integer NOT NULL DEFAULT 0
);

ALTER TABLE public.id_counters ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — only touched by SECURITY DEFINER
-- functions, which bypass RLS as their owner.

-- Backfill: seed the 'ST-' counter with the highest trip sequence
-- number already issued, so switching to the atomic RPC can't hand out
-- an id that collides with one already on the books. GREATEST() means
-- re-running this can only raise the counter, never lower it.
INSERT INTO public.id_counters (counter_key, current_value)
SELECT 'ST-', COALESCE(MAX(substring(trip_id from '([0-9]+)$')::integer), 0)
FROM public.trips
WHERE trip_id ~ '^ST-[0-9]+$'
ON CONFLICT (counter_key) DO UPDATE
  SET current_value = GREATEST(public.id_counters.current_value, EXCLUDED.current_value);

CREATE OR REPLACE FUNCTION public.next_trip_id()
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
  VALUES ('ST-', 1)
  ON CONFLICT (counter_key)
  DO UPDATE SET current_value = public.id_counters.current_value + 1
  RETURNING current_value INTO v_seq;

  RETURN 'ST-' || lpad(v_seq::text, 4, '0');
END;
$$;
