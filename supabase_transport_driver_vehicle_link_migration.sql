-- ============================================================
-- SUPABASE SQL MIGRATION: LINK TRIPS TO DRIVERS & VEHICLES
-- System: SAGA Washing Center - Transport Tab Integration
-- ============================================================
-- Run this AFTER supabase_transport_migration.sql and
-- supabase_vehicles_migration.sql have already been applied.

-- 1. Add driver_id FK column to trips (driver_name is kept for display/legacy rows)
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS driver_id BIGINT REFERENCES public.drivers(id) ON DELETE SET NULL;

-- 2. vehicle_id / vehicle_no columns already exist (added by supabase_vehicles_migration.sql).
--    vehicle_id is TEXT and stores the vehicles.id value as text, matching the
--    string-comparison lookups already used across the app (Driver/Vehicle profile pages).

-- 3. Indexes for fast driver/vehicle trip lookups (availability checks, profile history)
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id ON public.trips(vehicle_id);
