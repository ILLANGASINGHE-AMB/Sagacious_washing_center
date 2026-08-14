-- ============================================================
-- SUPABASE SQL MIGRATION: TRANSPORT & TRIP MANAGEMENT
-- System: SAGA Washing Center
-- ============================================================

-- 1. Create Trips Table
CREATE TABLE IF NOT EXISTS public.trips (
    id TEXT PRIMARY KEY,
    trip_id TEXT UNIQUE NOT NULL,       -- e.g. ST-0001
    driver_name TEXT NOT NULL,          -- e.g. Driver User
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TEXT NOT NULL,           -- e.g. 08:30 AM
    starting_km NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    selected_customers JSONB DEFAULT '[]'::jsonb, -- Array of { customer_id, hotel_name, visit_order }
    notes TEXT DEFAULT '',
    end_date DATE,
    end_time TEXT,
    final_km NUMERIC(12,2),
    distance_km NUMERIC(12,2),
    status TEXT NOT NULL DEFAULT 'In Progress', -- In Progress / Completed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Driver User into Users Table (if not exists)
INSERT INTO public.users (username, password, role, display_name)
VALUES ('driver', 'd8590', 'driver', 'Driver User')
ON CONFLICT DO NOTHING;

-- 3. Enable Row Level Security (RLS) & Add Access Policy
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon trips') THEN
        CREATE POLICY "Allow anon trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Indexes for Fast Performance
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON public.trips(start_date);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
