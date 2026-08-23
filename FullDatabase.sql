-- ============================================================================
-- FullDatabase.sql
-- SAGA Washing Center ERP — Desktop App Database
-- Rebuilds the FINAL schema of the TESTING Supabase project
-- (mzxpdirmsegsgkrunerk) so it can be created fresh inside your real
-- WORKING Supabase project.
--
-- Built from two sources:
--   1. Every SQL migration file in this repo (auth, security fixes,
--      transport, vehicles, drivers, paynow, expenses, expenses v2, ID
--      generation, driver mobile auth) — traced to their FINAL combined
--      effect, not just concatenated (later migrations override earlier
--      ones, e.g. expenses_v2 DROPs the old chemicals/general_expenses
--      tables; supabase_auth_migration.sql replaces the permissive
--      policies supabase_security_fixes.sql first created).
--   2. The exact live schema you exported from
--      supabase.com/dashboard/project/mzxpdirmsegsgkrunerk/database/schemas
--      (a table/column/RLS-policy summary), which revealed things no
--      migration file in this repo shows: the order_item_flags and trash
--      tables, vehicles.initial_km, and a newer, more granular RLS policy
--      set on drivers/trips.
--   3. pg_get_functiondef() output for every function in the public
--      schema — CONFIRMED every function verbatim, including six
--      (create_order_with_items, update_order_with_items, next_trip_id,
--      flag_order_items, clear_order_item_flags,
--      create_order_with_items_and_clear_flags) that exist live but are
--      in NO migration file in this repo.
--   4. A full pg_dump-equivalent CREATE TABLE export (every DEFAULT,
--      CHECK, and FOREIGN KEY, with ON DELETE behavior) — this is the
--      final ground truth for SECTION 3 below and resolved every
--      remaining unknown, including two real corrections to what this
--      file previously guessed:
--        - order_items.catalog_item_id has NO foreign key at all (an
--          earlier draft of this file wrongly linked it to items(id)).
--        - drivers.auth_user_id and trips.driver_id have plain FKs with
--          NO "ON DELETE" action (an earlier draft wrongly added
--          ON DELETE SET NULL to both).
--        - expense_types.category_id and expense_amounts.entry_id /
--          expense_type_id have plain FKs with NO "ON DELETE CASCADE"
--          (the original migration file specified CASCADE, but the live
--          table doesn't have it), and expense_amounts has NO
--          UNIQUE(entry_id, expense_type_id) constraint either (the
--          migration file specified one, live table doesn't have it —
--          nothing currently stops two amount rows for the same
--          entry+expense-type from coexisting; worth knowing about even
--          though this file matches the live table as-is).
--
-- Every table's column list (types, DEFAULTs, CHECKs, FKs), every RLS
-- policy, and every function body below is now CONFIRMED verbatim
-- against your live database — nothing in this file is inferred.
-- ============================================================================
--
-- READ THIS BEFORE RUNNING
-- -------------------------
-- HOW TO ACTUALLY MOVE THE DATA (this file is schema-only — it creates
-- empty tables with correct structure, it does not copy rows)
-- ---------------------------------------------------------------------
--   Option A — pg_dump/psql (recommended, moves everything incl. rows):
--     Get both connection strings from each project's Supabase Dashboard
--     → Project Settings → Database → Connection string → URI (use the
--     direct connection, port 5432, not the 6543 transaction pooler).
--       pg_dump --data-only --schema=public --no-owner --no-privileges \
--         "postgresql://postgres:<TESTING_PASSWORD>@db.mzxpdirmsegsgkrunerk.supabase.co:5432/postgres" \
--         -f TestingProjectData.sql
--     Then, AFTER running this FullDatabase.sql against the working
--     project to create the empty schema:
--       psql "postgresql://postgres:<WORKING_PASSWORD>@db.<WORKING_PROJECT_REF>.supabase.co:5432/postgres" \
--         -f TestingProjectData.sql
--     Then resync every IDENTITY sequence (so the next insert doesn't
--     collide with a copied-over id) — SECTION 7 at the bottom has the
--     exact commands.
--
--   Option B — Table Editor CSV export/import (no terminal needed):
--     Supabase Dashboard → Table Editor → each table → Export as CSV,
--     then on the working project → same table → Import data from CSV.
--     Must be done in FK-safe order (parents before children): customers,
--     drivers, vehicles, items → orders → order_items, invoices →
--     payments, deductions, order_item_flags → settings, users, trips,
--     expense_categories → expense_types → expense_entries →
--     expense_amounts → trash → id_counters. Run this FullDatabase.sql
--     FIRST so the tables/constraints exist for the import to land in.
--
-- WHAT STILL NEEDS MANUAL HANDLING EITHER WAY
-- ---------------------------------------------
--   - Supabase Auth users (auth.users) are not part of the public schema
--     and are NOT migrated by either option above — password hashes are
--     tied to each project's own GoTrue instance. Recreate staff/driver
--     logins in the working project (Dashboard → Authentication → Users,
--     or netlify/functions/admin-users.js pointed at the working
--     project), matching user_metadata.role to what each person had.
--   - drivers.auth_user_id (and any driver-linked trips via
--     current_driver_id()) will reference the OLD project's auth user
--     UUIDs after a data copy — these won't match anything in the working
--     project. After recreating each driver's login, re-link it:
--       UPDATE public.drivers SET auth_user_id = '<new-auth-user-uuid>' WHERE id = <driver-row-id>;
--   - No Supabase Storage buckets are used anywhere in this codebase
--     (verified — no supabase.storage calls exist), so nothing to move there.
--   - Once confirmed working, point fixed_SWC_v6.2_auth/config.js at the
--     working project (SUPABASE_URL / SUPABASE_ANON_KEY from Project
--     Settings → API). Only then repoint saga-driver-app/.env and
--     driver_SWC/.env the same way, per your plan.
--
-- Pasting this whole script into the Supabase SQL Editor and clicking Run
-- executes it as ONE transaction — if any statement errors, everything
-- from that run rolls back. If you hit an error partway through, assume
-- nothing took effect and re-run the corrected script in full.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- SECTION 2 — id_counters table. The functions that depend on it (and on
-- the other tables below) are created in SECTION 3.5, AFTER every table
-- exists — Supabase's default check_function_bodies=on setting compiles
-- plpgsql functions at CREATE FUNCTION time, and clear_order_item_flags()
-- below declares a public.order_item_flags%ROWTYPE variable, which would
-- fail to resolve if that table didn't exist yet.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.id_counters (
  counter_key   text PRIMARY KEY,
  current_value integer NOT NULL DEFAULT 0
);
ALTER TABLE public.id_counters ENABLE ROW LEVEL SECURITY;
-- No policies, by design — only reachable through the SECURITY DEFINER
-- functions in SECTION 3.5, which bypass RLS as their owner.


-- ============================================================================
-- SECTION 3 — Tables, in FK-safe creation order (parents before children).
-- Every table below is CONFIRMED verbatim against a full `pg_dump`-equivalent
-- export of the live testing database (exact CREATE TABLE statements with
-- every DEFAULT, CHECK, and FOREIGN KEY constraint) — nothing in this
-- section is inferred.
-- ============================================================================

-- 3a. customers
CREATE TABLE IF NOT EXISTS public.customers (
    id             BIGSERIAL PRIMARY KEY,
    hotel_name     TEXT,
    address        TEXT,
    contact_person TEXT,
    phone          TEXT,
    email          TEXT,
    created_date   TIMESTAMPTZ DEFAULT NOW(),
    custom_prices  JSONB DEFAULT '{}'::jsonb
);

-- 3b. drivers
CREATE TABLE IF NOT EXISTS public.drivers (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT,
    phone         TEXT,
    vehicle       TEXT,
    status        TEXT DEFAULT 'available',
    address       TEXT DEFAULT '',
    nickname      TEXT DEFAULT '',
    phone2        TEXT DEFAULT '',
    nic           TEXT,
    email         TEXT DEFAULT '',
    created_date  TIMESTAMPTZ DEFAULT NOW(),
    auth_user_id  UUID UNIQUE REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_drivers_auth_user_id ON public.drivers(auth_user_id);

-- 3c. vehicles
CREATE TABLE IF NOT EXISTS public.vehicles (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_no  TEXT UNIQUE NOT NULL,
    category    TEXT NOT NULL,
    model       TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'available',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    initial_km  NUMERIC NOT NULL DEFAULT 0
);

-- 3d. items (catalog)
CREATE TABLE IF NOT EXISTS public.items (
    id               BIGSERIAL PRIMARY KEY,
    item_id          TEXT UNIQUE,
    item_name        TEXT,
    description      TEXT,
    custom_data      JSONB,
    dry_clean_price  NUMERIC NOT NULL DEFAULT 0,
    wash_press_price NUMERIC NOT NULL DEFAULT 0,
    wash_dry_price   NUMERIC NOT NULL DEFAULT 0
);

-- 3e. orders
CREATE TABLE IF NOT EXISTS public.orders (
    id                  BIGSERIAL PRIMARY KEY,
    customer_id         BIGINT REFERENCES public.customers(id),
    driver_id           BIGINT REFERENCES public.drivers(id),
    batch_id            TEXT,
    status              TEXT DEFAULT 'Unpaid',
    pickup_date         DATE,
    delivery_date       DATE,
    total_amount        NUMERIC DEFAULT 0,
    advance_payment     NUMERIC DEFAULT 0,
    signature           TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    is_pickup_only      BOOLEAN DEFAULT false,
    payment_date        TEXT,
    extra_payment       NUMERIC NOT NULL DEFAULT 0.00,
    delivery_charge     NUMERIC NOT NULL DEFAULT 0.00,
    discount_rate       NUMERIC NOT NULL DEFAULT 0.00,
    discount_amount     NUMERIC NOT NULL DEFAULT 0.00,
    qr_token            TEXT UNIQUE DEFAULT gen_random_uuid(),
    hidden              BOOLEAN NOT NULL DEFAULT false,
    delivery_status     TEXT CHECK (delivery_status IS NULL OR (delivery_status = ANY (ARRAY['out_for_delivery','delivered']))),
    driver_assigned_at  TIMESTAMPTZ,
    debug_edited_by     TEXT,
    debug_edited_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id   ON public.orders(driver_id);

-- 3f. order_items
CREATE TABLE IF NOT EXISTS public.order_items (
    id               BIGSERIAL PRIMARY KEY,
    order_id         BIGINT REFERENCES public.orders(id),
    catalog_item_id  BIGINT,  -- no FK on the live table (verified) — not linked to items(id)
    item_name        TEXT,
    quantity         NUMERIC,
    service_type     TEXT CHECK (service_type = ANY (ARRAY['Dry Clean','Wash & Press','Wash & Dry'])),
    price            NUMERIC,
    subtotal         NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 3g. order_item_flags
CREATE TABLE IF NOT EXISTS public.order_item_flags (
    id                    BIGSERIAL PRIMARY KEY,
    order_id              BIGINT NOT NULL REFERENCES public.orders(id),
    order_item_id         BIGINT REFERENCES public.order_items(id),
    customer_id           BIGINT NOT NULL REFERENCES public.customers(id),
    item_name             TEXT NOT NULL,
    quantity              NUMERIC NOT NULL CHECK (quantity > 0::numeric),
    flag_type             TEXT NOT NULL CHECK (flag_type = ANY (ARRAY['pending','returned'])),
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','returned','cleared'])),
    cleared_in_order_id   BIGINT REFERENCES public.orders(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_item_flags_order_id ON public.order_item_flags(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_flags_customer_id ON public.order_item_flags(customer_id);

-- 3h. invoices
CREATE TABLE IF NOT EXISTS public.invoices (
    id                         BIGSERIAL PRIMARY KEY,
    order_id                   BIGINT REFERENCES public.orders(id),
    invoice_number             TEXT,
    issue_date                 TIMESTAMPTZ,
    delivery_date              DATE,
    total_amount               NUMERIC,
    advance_payment            NUMERIC,
    balance                    NUMERIC,
    paid_status                TEXT DEFAULT 'Unpaid',
    invoice_type               TEXT DEFAULT 'Standard',
    credit_due_date            DATE,
    discount_rate              NUMERIC DEFAULT 0,
    discount_amount            NUMERIC DEFAULT 0,
    delivery_charge            NUMERIC DEFAULT 0,
    subtotal_before_discount   NUMERIC DEFAULT 0,
    deduction_amount           NUMERIC DEFAULT 0.00,
    batch_order_ids            TEXT,
    batch_invoice_details      TEXT,
    payment_date               TEXT,
    extra_payment              NUMERIC NOT NULL DEFAULT 0.00
);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);

-- 3i. payments
CREATE TABLE IF NOT EXISTS public.payments (
    id          BIGSERIAL PRIMARY KEY,
    invoice_id  BIGINT REFERENCES public.invoices(id),
    amount      NUMERIC,
    method      TEXT,
    notes       TEXT,
    date        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);

-- 3j. deductions
CREATE TABLE IF NOT EXISTS public.deductions (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id        BIGINT NOT NULL REFERENCES public.invoices(id),
    invoice_number    TEXT NOT NULL,
    original_amount   NUMERIC NOT NULL,
    deduction_amount  NUMERIC NOT NULL,
    final_amount      NUMERIC NOT NULL,
    reason            TEXT,
    created_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_deductions_invoice_id ON public.deductions(invoice_id);

-- 3k. settings
CREATE TABLE IF NOT EXISTS public.settings (
    id     BIGSERIAL PRIMARY KEY,
    key    TEXT UNIQUE,
    value  TEXT
);

-- 3l. users — legacy plaintext-password table, retired by Supabase Auth.
-- Kept (not dropped) so old records can still be inspected via the
-- service_role key before you decide to delete it yourself.
CREATE TABLE IF NOT EXISTS public.users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT UNIQUE,
    password      TEXT,
    role          TEXT DEFAULT 'user',
    display_name  TEXT
);

-- 3m. trash — soft-delete / audit bin (present in live schema, no
-- migration file defines it; DDL copied verbatim from the export)
CREATE TABLE IF NOT EXISTS public.trash (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_type   TEXT NOT NULL,
    entity_label  TEXT NOT NULL,
    payload       JSONB NOT NULL,
    deleted_by    TEXT,
    deleted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3n. trips (source: supabase_transport_migration.sql +
-- supabase_vehicles_migration.sql + supabase_transport_driver_vehicle_link_migration.sql)
CREATE TABLE IF NOT EXISTS public.trips (
    id                   TEXT PRIMARY KEY,
    trip_id              TEXT UNIQUE NOT NULL,
    driver_name          TEXT NOT NULL,
    start_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time           TEXT NOT NULL,
    starting_km          NUMERIC NOT NULL DEFAULT 0.00,
    selected_customers   JSONB DEFAULT '[]'::jsonb,
    notes                TEXT DEFAULT '',
    end_date             DATE,
    end_time             TEXT,
    final_km             NUMERIC,
    distance_km          NUMERIC,
    status               TEXT NOT NULL DEFAULT 'In Progress',
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    vehicle_no           TEXT,
    vehicle_id           TEXT,  -- stores vehicles.id as text (string-comparison lookups) — not a real FK
    driver_id            BIGINT REFERENCES public.drivers(id)
);
CREATE INDEX IF NOT EXISTS idx_trips_start_date  ON public.trips(start_date);
CREATE INDEX IF NOT EXISTS idx_trips_status      ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_no  ON public.trips(vehicle_no);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id   ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id  ON public.trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_no ON public.vehicles(vehicle_no);
CREATE INDEX IF NOT EXISTS idx_vehicles_category   ON public.vehicles(category);
CREATE INDEX IF NOT EXISTS idx_vehicles_status     ON public.vehicles(status);

-- 3o. Expenses v2 — Cash Book / Category View (source: supabase_expenses_v2_migration.sql).
-- This is the CURRENT, live expenses schema. It replaced chemicals /
-- chemical_ledger / general_expenses (from the older
-- supabase_expenses_migration.sql), which were DROPPED and are correctly
-- absent from your live schema export — intentionally not recreated here.
-- NOTE: the original migration file specified `ON DELETE CASCADE` on the
-- FKs below and a `UNIQUE(entry_id, expense_type_id)` constraint on
-- expense_amounts — the live table has NEITHER. Matched to the live
-- table exactly (no CASCADE, no UNIQUE) since that's what's really
-- there; flagging it because it means nothing currently stops two
-- amount rows for the same entry+expense-type from coexisting.
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id  TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expense_types (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_type_id  TEXT UNIQUE NOT NULL,
    name             TEXT NOT NULL,
    category_id      TEXT NOT NULL REFERENCES public.expense_categories(category_id),
    sort_order       INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expense_entries (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entry_date   DATE NOT NULL,
    description  TEXT DEFAULT '',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expense_amounts (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entry_id         BIGINT NOT NULL REFERENCES public.expense_entries(id),
    expense_type_id  TEXT NOT NULL REFERENCES public.expense_types(expense_type_id),
    amount           NUMERIC NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_types_category      ON public.expense_types(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_entries_date         ON public.expense_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_expense_amounts_entry        ON public.expense_amounts(entry_id);
CREATE INDEX IF NOT EXISTS idx_expense_amounts_expense_type ON public.expense_amounts(expense_type_id);


-- ============================================================================
-- SECTION 3.5 — Functions. Placed after every table so plpgsql compilation
-- (e.g. the %ROWTYPE reference below) can resolve cleanly. Every function
-- here except current_user_role() and current_driver_id() was CONFIRMED
-- verbatim via `pg_get_functiondef()` against the live testing project;
-- those two were also confirmed the same way after an initial reconstruction.
-- ============================================================================

-- Role helper — reads the caller's role from their Supabase Auth JWT
-- (user_metadata.role, set at account-creation time — see
-- netlify/functions/admin-users.js). No session → 'anon'.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    'anon'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS bigint
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Atomic per-trip ID generator (ST-####).
CREATE OR REPLACE FUNCTION public.next_trip_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Order + order_items RPC layer. Builds the INSERT/UPDATE column list
-- dynamically from whatever keys the caller's JSON payload contains
-- (format('%I', key) / format('%L', value) quote identifiers/literals
-- safely — no injection risk).
CREATE OR REPLACE FUNCTION public.create_order_with_items(p_order jsonb, p_items jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id bigint;
  v_item     jsonb;
  v_cols     text;
  v_vals     text;
BEGIN
  SELECT string_agg(format('%I', key), ', '),
         string_agg(format('%L', value), ', ')
    INTO v_cols, v_vals
  FROM jsonb_each_text(p_order - 'id');

  EXECUTE format('INSERT INTO public.orders (%s) VALUES (%s) RETURNING id', v_cols, v_vals)
    INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    SELECT string_agg(format('%I', key), ', '),
           string_agg(format('%L', value), ', ')
      INTO v_cols, v_vals
    FROM jsonb_each_text((v_item - 'id') || jsonb_build_object('order_id', v_order_id));

    EXECUTE format('INSERT INTO public.order_items (%s) VALUES (%s)', v_cols, v_vals);
  END LOOP;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_with_items(p_order_id bigint, p_order jsonb, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_set_clause text;
  v_item       jsonb;
  v_cols       text;
  v_vals       text;
BEGIN
  SELECT string_agg(format('%I = %L', key, value), ', ')
    INTO v_set_clause
  FROM jsonb_each_text(p_order);

  IF v_set_clause IS NOT NULL THEN
    EXECUTE format('UPDATE public.orders SET %s WHERE id = %L', v_set_clause, p_order_id);
  END IF;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    SELECT string_agg(format('%I', key), ', '),
           string_agg(format('%L', value), ', ')
      INTO v_cols, v_vals
    FROM jsonb_each_text((v_item - 'id') || jsonb_build_object('order_id', p_order_id));

    EXECUTE format('INSERT INTO public.order_items (%s) VALUES (%s)', v_cols, v_vals);
  END LOOP;
END;
$$;

-- order_item_flags RPC layer (flag items on an order — e.g. damaged/
-- missing — and clear those flags against a later order, supporting
-- partial-quantity clears by splitting off a cleared copy of the flag row).
CREATE OR REPLACE FUNCTION public.flag_order_items(p_order_id bigint, p_customer_id bigint, p_flags jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_flag jsonb;
BEGIN
  FOR v_flag IN SELECT * FROM jsonb_array_elements(COALESCE(p_flags, '[]'::jsonb))
  LOOP
    INSERT INTO public.order_item_flags
      (order_id, order_item_id, customer_id, item_name, quantity, flag_type, status)
    VALUES (
      p_order_id,
      NULLIF(v_flag->>'order_item_id', '')::bigint,
      p_customer_id,
      v_flag->>'item_name',
      (v_flag->>'quantity')::numeric,
      v_flag->>'flag_type',
      v_flag->>'flag_type'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_order_item_flags(p_new_order_id bigint, p_clears jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clear     jsonb;
  v_flag      public.order_item_flags%ROWTYPE;
  v_clear_qty numeric;
BEGIN
  FOR v_clear IN SELECT * FROM jsonb_array_elements(COALESCE(p_clears, '[]'::jsonb))
  LOOP
    SELECT * INTO v_flag FROM public.order_item_flags
      WHERE id = (v_clear->>'flag_id')::bigint
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'order_item_flags row % not found', v_clear->>'flag_id';
    END IF;
    IF v_flag.status = 'cleared' THEN
      RAISE EXCEPTION 'flag % is already cleared', v_flag.id;
    END IF;

    v_clear_qty := (v_clear->>'quantity')::numeric;
    IF v_clear_qty IS NULL OR v_clear_qty <= 0 OR v_clear_qty > v_flag.quantity THEN
      RAISE EXCEPTION 'invalid clear quantity % for flag % (outstanding %)', v_clear_qty, v_flag.id, v_flag.quantity;
    END IF;

    IF v_clear_qty = v_flag.quantity THEN
      -- Full clear: flip the flag itself.
      UPDATE public.order_item_flags
        SET status = 'cleared', cleared_in_order_id = p_new_order_id, cleared_at = now()
        WHERE id = v_flag.id;
    ELSE
      -- Partial clear: split off a cleared copy for the resolved amount,
      -- leave the remainder open on the original row.
      INSERT INTO public.order_item_flags
        (order_id, order_item_id, customer_id, item_name, quantity, flag_type, status, cleared_in_order_id, cleared_at)
      VALUES (
        v_flag.order_id, v_flag.order_item_id, v_flag.customer_id, v_flag.item_name,
        v_clear_qty, v_flag.flag_type, 'cleared', p_new_order_id, now()
      );
      UPDATE public.order_item_flags
        SET quantity = quantity - v_clear_qty
        WHERE id = v_flag.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_with_items_and_clear_flags(p_order jsonb, p_items jsonb, p_clears jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id bigint;
BEGIN
  v_order_id := public.create_order_with_items(p_order, p_items);
  PERFORM public.clear_order_item_flags(v_order_id, p_clears);
  RETURN v_order_id;
END;
$$;

-- Atomic per-month batch/invoice ID generator (LND-MMYY-#### / INV-MMYY-####).
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

-- 5-digit, non-month-scoped counters for expense categories/types.
CREATE OR REPLACE FUNCTION public.next_category_id(prefix text)
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

  RETURN prefix || lpad(v_seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_expense_type_id(prefix text)
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

  RETURN prefix || lpad(v_seq::text, 5, '0');
END;
$$;

-- Legacy global sequences from the superseded v1 ID-generation fix.
-- Unused by any function above; kept only because the original
-- migrations kept them.
CREATE SEQUENCE IF NOT EXISTS batch_id_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS invoice_num_seq START WITH 1;


-- ============================================================================
-- SECTION 4 — orders.qr_token backfill (existing NULLs get a real token —
-- harmless no-op on a freshly created, empty table; matters once data has
-- been copied in). Source: supabase_security_fixes.sql
-- ============================================================================
UPDATE public.orders SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;


-- ============================================================================
-- SECTION 5 — id_counters backfill from existing batch_id/invoice_number
-- values, so the atomic per-month counter can't collide with an ID
-- already on the books. Harmless no-op until orders/invoices have data;
-- re-run this section again after copying data in via pg_dump/CSV.
-- Source: supabase_security_fixes.sql / supabase_id_generation_fix.sql
-- ============================================================================
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


-- ============================================================================
-- SECTION 6 — Row Level Security: exact final policy set, copied directly
-- from your live schema export's "RLS Policies" section.
-- ============================================================================

-- Clean slate for every table this section manages, so it's safe to re-run.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'orders','order_items','order_item_flags','customers','drivers',
        'invoices','payments','deductions','items','settings','trips',
        'vehicles','expense_categories','expense_types','expense_entries',
        'expense_amounts','trash'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
  END LOOP;
END $$;

ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_flags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deductions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_amounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;

-- orders
CREATE POLICY "authenticated read orders"   ON public.orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write orders"  ON public.orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update orders" ON public.orders FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete orders"         ON public.orders FOR DELETE USING (public.current_user_role() = 'admin');

-- order_items
CREATE POLICY "authenticated read order_items"   ON public.order_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write order_items"  ON public.order_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update order_items" ON public.order_items FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete order_items"         ON public.order_items FOR DELETE USING (public.current_user_role() = 'admin');

-- order_item_flags — fully open (matches your live export exactly)
CREATE POLICY "Allow read order_item_flags"   ON public.order_item_flags FOR SELECT USING (true);
CREATE POLICY "Allow write order_item_flags"  ON public.order_item_flags FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update order_item_flags" ON public.order_item_flags FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete order_item_flags" ON public.order_item_flags FOR DELETE USING (true);

-- customers
CREATE POLICY "authenticated read customers"   ON public.customers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write customers"  ON public.customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update customers" ON public.customers FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete customers"         ON public.customers FOR DELETE USING (public.current_user_role() = 'admin');

-- drivers — a driver can read/update their own row (via auth_user_id);
-- staff (admin/user) can read/update any row; only admin/user can insert;
-- only admin can delete.
CREATE POLICY "drivers read own or staff" ON public.drivers
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (public.current_user_role() = ANY (ARRAY['admin','user']) OR auth_user_id = auth.uid())
  );
CREATE POLICY "drivers insert staff only" ON public.drivers
  FOR INSERT WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','user']));
CREATE POLICY "drivers update own or staff" ON public.drivers
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND (public.current_user_role() = ANY (ARRAY['admin','user']) OR auth_user_id = auth.uid())
  ) WITH CHECK (
    auth.role() = 'authenticated'
    AND (public.current_user_role() = ANY (ARRAY['admin','user']) OR auth_user_id = auth.uid())
  );
CREATE POLICY "admin delete drivers" ON public.drivers FOR DELETE USING (public.current_user_role() = 'admin');

-- invoices
CREATE POLICY "authenticated read invoices"   ON public.invoices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write invoices"  ON public.invoices FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update invoices" ON public.invoices FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete invoices"         ON public.invoices FOR DELETE USING (public.current_user_role() = 'admin');

-- payments
CREATE POLICY "authenticated read payments"   ON public.payments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write payments"  ON public.payments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update payments" ON public.payments FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete payments"         ON public.payments FOR DELETE USING (public.current_user_role() = 'admin');

-- deductions
CREATE POLICY "authenticated read deductions"   ON public.deductions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write deductions"  ON public.deductions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update deductions" ON public.deductions FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete deductions"         ON public.deductions FOR DELETE USING (public.current_user_role() = 'admin');

-- items
CREATE POLICY "authenticated read items"   ON public.items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write items"  ON public.items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update items" ON public.items FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete items"         ON public.items FOR DELETE USING (public.current_user_role() = 'admin');

-- settings
CREATE POLICY "authenticated read settings"   ON public.settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write settings"  ON public.settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated update settings" ON public.settings FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "admin delete settings"         ON public.settings FOR DELETE USING (public.current_user_role() = 'admin');

-- trips — a driver can read/write/update their own trips (via
-- current_driver_id()); staff (admin/user) can access all; only admin
-- can delete.
CREATE POLICY "trips read own or staff" ON public.trips
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (public.current_user_role() = ANY (ARRAY['admin','user']) OR driver_id = public.current_driver_id())
  );
CREATE POLICY "trips write own or staff" ON public.trips
  FOR INSERT WITH CHECK (
    public.current_user_role() = ANY (ARRAY['admin','user']) OR driver_id = public.current_driver_id()
  );
CREATE POLICY "trips update own or staff" ON public.trips
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND (public.current_user_role() = ANY (ARRAY['admin','user']) OR driver_id = public.current_driver_id())
  ) WITH CHECK (
    auth.role() = 'authenticated'
    AND (public.current_user_role() = ANY (ARRAY['admin','user']) OR driver_id = public.current_driver_id())
  );
CREATE POLICY "admin delete trips" ON public.trips FOR DELETE USING (public.current_user_role() = 'admin');

-- vehicles, expense_* — fully open (matches your live export exactly)
CREATE POLICY "Allow anon vehicles"           ON public.vehicles           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon expense_categories" ON public.expense_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon expense_types"      ON public.expense_types      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon expense_entries"    ON public.expense_entries    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon expense_amounts"    ON public.expense_amounts    FOR ALL USING (true) WITH CHECK (true);

-- trash — authenticated read, admin-only insert/delete, no update policy
-- at all (UPDATE is implicitly denied for everyone — matches your export).
CREATE POLICY "authenticated read trash" ON public.trash FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin write trash"        ON public.trash FOR INSERT WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "admin delete trash"       ON public.trash FOR DELETE USING (public.current_user_role() = 'admin');

-- users (legacy) — RLS enabled with ZERO policies, so every request
-- (including authenticated ones) is denied; only the service_role key
-- can still read/write it.
REVOKE ALL ON public.users FROM anon, authenticated;


-- ============================================================================
-- SECTION 7 — Run AFTER copying data in (via pg_dump --data-only or CSV
-- import). Resyncs every IDENTITY sequence so the next INSERT doesn't
-- collide with a copied-over explicit id. Harmless to run on empty
-- tables too (setval on an empty table's sequence is a no-op-equivalent).
-- ============================================================================
SELECT setval(pg_get_serial_sequence('public.customers', 'id'), COALESCE((SELECT MAX(id) FROM public.customers), 1));
SELECT setval(pg_get_serial_sequence('public.drivers', 'id'), COALESCE((SELECT MAX(id) FROM public.drivers), 1));
SELECT setval(pg_get_serial_sequence('public.vehicles', 'id'), COALESCE((SELECT MAX(id) FROM public.vehicles), 1));
SELECT setval(pg_get_serial_sequence('public.items', 'id'), COALESCE((SELECT MAX(id) FROM public.items), 1));
SELECT setval(pg_get_serial_sequence('public.orders', 'id'), COALESCE((SELECT MAX(id) FROM public.orders), 1));
SELECT setval(pg_get_serial_sequence('public.order_items', 'id'), COALESCE((SELECT MAX(id) FROM public.order_items), 1));
SELECT setval(pg_get_serial_sequence('public.order_item_flags', 'id'), COALESCE((SELECT MAX(id) FROM public.order_item_flags), 1));
SELECT setval(pg_get_serial_sequence('public.invoices', 'id'), COALESCE((SELECT MAX(id) FROM public.invoices), 1));
SELECT setval(pg_get_serial_sequence('public.payments', 'id'), COALESCE((SELECT MAX(id) FROM public.payments), 1));
SELECT setval(pg_get_serial_sequence('public.deductions', 'id'), COALESCE((SELECT MAX(id) FROM public.deductions), 1));
SELECT setval(pg_get_serial_sequence('public.settings', 'id'), COALESCE((SELECT MAX(id) FROM public.settings), 1));
SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE((SELECT MAX(id) FROM public.users), 1));
SELECT setval(pg_get_serial_sequence('public.trash', 'id'), COALESCE((SELECT MAX(id) FROM public.trash), 1));
SELECT setval(pg_get_serial_sequence('public.expense_categories', 'id'), COALESCE((SELECT MAX(id) FROM public.expense_categories), 1));
SELECT setval(pg_get_serial_sequence('public.expense_types', 'id'), COALESCE((SELECT MAX(id) FROM public.expense_types), 1));
SELECT setval(pg_get_serial_sequence('public.expense_entries', 'id'), COALESCE((SELECT MAX(id) FROM public.expense_entries), 1));
SELECT setval(pg_get_serial_sequence('public.expense_amounts', 'id'), COALESCE((SELECT MAX(id) FROM public.expense_amounts), 1));


-- ============================================================================
-- SECTION 8 — Post-migration verification checklist (run manually, read
-- the results, don't just execute blind)
-- ============================================================================
-- 1. Row counts match the testing project for every table:
--      SELECT 'customers' t, count(*) FROM public.customers
--      UNION ALL SELECT 'drivers', count(*) FROM public.drivers
--      UNION ALL SELECT 'vehicles', count(*) FROM public.vehicles
--      UNION ALL SELECT 'items', count(*) FROM public.items
--      UNION ALL SELECT 'orders', count(*) FROM public.orders
--      UNION ALL SELECT 'order_items', count(*) FROM public.order_items
--      UNION ALL SELECT 'order_item_flags', count(*) FROM public.order_item_flags
--      UNION ALL SELECT 'invoices', count(*) FROM public.invoices
--      UNION ALL SELECT 'payments', count(*) FROM public.payments
--      UNION ALL SELECT 'deductions', count(*) FROM public.deductions
--      UNION ALL SELECT 'settings', count(*) FROM public.settings
--      UNION ALL SELECT 'users', count(*) FROM public.users
--      UNION ALL SELECT 'trash', count(*) FROM public.trash
--      UNION ALL SELECT 'trips', count(*) FROM public.trips
--      UNION ALL SELECT 'expense_categories', count(*) FROM public.expense_categories
--      UNION ALL SELECT 'expense_types', count(*) FROM public.expense_types
--      UNION ALL SELECT 'expense_entries', count(*) FROM public.expense_entries
--      UNION ALL SELECT 'expense_amounts', count(*) FROM public.expense_amounts
--      UNION ALL SELECT 'id_counters', count(*) FROM public.id_counters;
--
-- 2. RPC functions work (use a scratch prefix, not a real one — it
--    permanently consumes that counter value):
--      SELECT public.next_batch_id('TEST-');
--      SELECT public.current_user_role();  -- run while logged in as each role
--
-- 3. RLS is enforced everywhere:
--      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
--
-- 4. Log into the desktop app pointed at the working project and confirm
--    end-to-end: create an order, generate an invoice, record a payment,
--    start/end a trip, and (once a driver login is relinked) sign into
--    the mobile driver app.
-- ============================================================================
