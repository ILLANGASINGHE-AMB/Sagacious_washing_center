-- ============================================================
-- SUPABASE SQL MIGRATION: VEHICLE INITIAL ODOMETER READING
-- System: SAGA Washing Center
-- newchanges2.md: vehicles don't all start at 0km — admin needs to record
-- each vehicle's odometer reading at the time it's added to the system, so
-- the first trip on that vehicle auto-calibrates from that value instead of 0.
-- ============================================================

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS initial_km NUMERIC(12,2) NOT NULL DEFAULT 0;
