-- ============================================================
-- STANDALONE MIGRATION: Vehicle Last-Trip-KM RPC
-- System: SAGA Washing Center ERP
-- ============================================================
-- Requirement: when a driver starts a new trip in the mobile Driver App,
-- Starting KM must always be locked to the selected vehicle's actual last
-- trip's final_km (or its registered vehicles.initial_km if it has never
-- been driven) — the driver must never be able to type in their own value.
--
-- Problem this solves: supabase_driver_app_migration.sql scoped `trips`
-- RLS so a driver-role session can only SELECT its own trips ("trips read
-- own or staff"). That's correct and intentional for trip details (notes,
-- customer visits, etc. — see driverApp.md: "cannot access ... other
-- driver profiles or their data"). But it also means a driver picking up a
-- vehicle that a DIFFERENT driver drove last has no way to see that
-- vehicle's real last final_km — the Driver App would have to fall back to
-- 0/initial_km even though the vehicle has since accumulated real mileage.
--
-- Fix: a single-purpose, SECURITY DEFINER function that returns ONLY the
-- one numeric final_km value for a vehicle's most recently completed trip
-- (across every driver) — no driver identity, notes, or customer data is
-- exposed, so this does not reopen the privacy boundary the migration
-- above established. Vehicles are shared equipment; their odometer
-- reading is operational data, not a specific driver's private data.
--
-- trips.vehicle_id is stored as TEXT (see FullDatabase.sql comment — not a
-- real FK to vehicles.id), so this takes p_vehicle_id as text to match.
--
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_vehicle_last_km(p_vehicle_id text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT final_km
  FROM public.trips
  WHERE vehicle_id = p_vehicle_id
    AND final_km IS NOT NULL
  ORDER BY COALESCE(end_date::timestamptz, created_at) DESC NULLS LAST, id DESC
  LIMIT 1;
$$;
