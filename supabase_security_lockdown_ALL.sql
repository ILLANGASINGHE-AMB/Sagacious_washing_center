-- ============================================================================
--  SAGACIOUS WASHING CENTER — SECURITY LOCKDOWN
--  Closes critical findings C-03 (blanket public RLS) and C-04 (SECURITY
--  DEFINER order RPCs granted to anon).
--
--  HOW TO RUN
--    Supabase Dashboard > SQL Editor > New query > paste this whole file > Run.
--    It is ONE transaction: it either fully applies or fully rolls back.
--    Re-running it is safe — every statement is idempotent.
--
--  WHAT IT TOUCHES
--    POLICY objects, GRANTs, and three FUNCTION bodies. It does not SELECT,
--    INSERT, UPDATE or DELETE a single row of business data. No customer,
--    order, invoice, payment, trip or expense record is read or modified.
--
--  WHAT IT REPLACES
--    This supersedes supabase_restore_rls_policies.sql — that script's
--    contents are included below (part 1), so do NOT run it separately.
--
--  AFTER RUNNING
--    Work through the VERIFY block at the bottom, then smoke-test the app as
--    admin, staff and driver. A ROLLBACK block is at the very bottom.
-- ============================================================================

BEGIN;

-- ############################################################################
-- PART 1 — restore the granular role-based policies on the 13 tables that
-- lost them in the Supabase project migration. Verbatim from the old
-- project's schema dump, with a DROP ... IF EXISTS added before each CREATE
-- so this file can be re-run safely.
-- ############################################################################

-- customers
DROP POLICY IF EXISTS "Allow public access" ON public.customers;
DROP POLICY IF EXISTS "admin delete customers" ON public.customers;
CREATE POLICY "admin delete customers" ON public.customers FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read customers" ON public.customers;
CREATE POLICY "authenticated read customers" ON public.customers FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update customers" ON public.customers;
CREATE POLICY "authenticated update customers" ON public.customers FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write customers" ON public.customers;
CREATE POLICY "authenticated write customers" ON public.customers FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- deductions
DROP POLICY IF EXISTS "Allow public access" ON public.deductions;
DROP POLICY IF EXISTS "admin delete deductions" ON public.deductions;
CREATE POLICY "admin delete deductions" ON public.deductions FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read deductions" ON public.deductions;
CREATE POLICY "authenticated read deductions" ON public.deductions FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update deductions" ON public.deductions;
CREATE POLICY "authenticated update deductions" ON public.deductions FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write deductions" ON public.deductions;
CREATE POLICY "authenticated write deductions" ON public.deductions FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- drivers
DROP POLICY IF EXISTS "Allow public access" ON public.drivers;
DROP POLICY IF EXISTS "admin delete drivers" ON public.drivers;
CREATE POLICY "admin delete drivers" ON public.drivers FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "drivers insert staff only" ON public.drivers;
CREATE POLICY "drivers insert staff only" ON public.drivers FOR INSERT WITH CHECK ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])));
DROP POLICY IF EXISTS "drivers read own or staff" ON public.drivers;
CREATE POLICY "drivers read own or staff" ON public.drivers FOR SELECT USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (auth_user_id = auth.uid()))));
DROP POLICY IF EXISTS "drivers update own or staff" ON public.drivers;
CREATE POLICY "drivers update own or staff" ON public.drivers FOR UPDATE USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (auth_user_id = auth.uid())))) WITH CHECK (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (auth_user_id = auth.uid()))));

-- invoices
DROP POLICY IF EXISTS "Allow public access" ON public.invoices;
DROP POLICY IF EXISTS "admin delete invoices" ON public.invoices;
CREATE POLICY "admin delete invoices" ON public.invoices FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read invoices" ON public.invoices;
CREATE POLICY "authenticated read invoices" ON public.invoices FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update invoices" ON public.invoices;
CREATE POLICY "authenticated update invoices" ON public.invoices FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write invoices" ON public.invoices;
CREATE POLICY "authenticated write invoices" ON public.invoices FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- items
DROP POLICY IF EXISTS "Allow public access" ON public.items;
DROP POLICY IF EXISTS "admin delete items" ON public.items;
CREATE POLICY "admin delete items" ON public.items FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read items" ON public.items;
CREATE POLICY "authenticated read items" ON public.items FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update items" ON public.items;
CREATE POLICY "authenticated update items" ON public.items FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write items" ON public.items;
CREATE POLICY "authenticated write items" ON public.items FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- order_items
DROP POLICY IF EXISTS "Allow public access" ON public.order_items;
DROP POLICY IF EXISTS "admin delete order_items" ON public.order_items;
CREATE POLICY "admin delete order_items" ON public.order_items FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read order_items" ON public.order_items;
CREATE POLICY "authenticated read order_items" ON public.order_items FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update order_items" ON public.order_items;
CREATE POLICY "authenticated update order_items" ON public.order_items FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write order_items" ON public.order_items;
CREATE POLICY "authenticated write order_items" ON public.order_items FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- orders
DROP POLICY IF EXISTS "Allow public access" ON public.orders;
DROP POLICY IF EXISTS "admin delete orders" ON public.orders;
CREATE POLICY "admin delete orders" ON public.orders FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read orders" ON public.orders;
CREATE POLICY "authenticated read orders" ON public.orders FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update orders" ON public.orders;
CREATE POLICY "authenticated update orders" ON public.orders FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write orders" ON public.orders;
CREATE POLICY "authenticated write orders" ON public.orders FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- payments
DROP POLICY IF EXISTS "Allow public access" ON public.payments;
DROP POLICY IF EXISTS "admin delete payments" ON public.payments;
CREATE POLICY "admin delete payments" ON public.payments FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read payments" ON public.payments;
CREATE POLICY "authenticated read payments" ON public.payments FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update payments" ON public.payments;
CREATE POLICY "authenticated update payments" ON public.payments FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write payments" ON public.payments;
CREATE POLICY "authenticated write payments" ON public.payments FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- settings
DROP POLICY IF EXISTS "Allow public access" ON public.settings;
DROP POLICY IF EXISTS "admin delete settings" ON public.settings;
CREATE POLICY "admin delete settings" ON public.settings FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read settings" ON public.settings;
CREATE POLICY "authenticated read settings" ON public.settings FOR SELECT USING ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated update settings" ON public.settings;
CREATE POLICY "authenticated update settings" ON public.settings FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
DROP POLICY IF EXISTS "authenticated write settings" ON public.settings;
CREATE POLICY "authenticated write settings" ON public.settings FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- trash
DROP POLICY IF EXISTS "Allow public access" ON public.trash;
DROP POLICY IF EXISTS "admin delete trash" ON public.trash;
CREATE POLICY "admin delete trash" ON public.trash FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "admin write trash" ON public.trash;
CREATE POLICY "admin write trash" ON public.trash FOR INSERT WITH CHECK ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "authenticated read trash" ON public.trash;
CREATE POLICY "authenticated read trash" ON public.trash FOR SELECT USING ((auth.role() = 'authenticated'::text));

-- trips
DROP POLICY IF EXISTS "Allow public access" ON public.trips;
DROP POLICY IF EXISTS "admin delete trips" ON public.trips;
CREATE POLICY "admin delete trips" ON public.trips FOR DELETE USING ((public.current_user_role() = 'admin'::text));
DROP POLICY IF EXISTS "trips read own or staff" ON public.trips;
CREATE POLICY "trips read own or staff" ON public.trips FOR SELECT USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id()))));
DROP POLICY IF EXISTS "trips update own or staff" ON public.trips;
CREATE POLICY "trips update own or staff" ON public.trips FOR UPDATE USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id())))) WITH CHECK (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id()))));
DROP POLICY IF EXISTS "trips write own or staff" ON public.trips;
CREATE POLICY "trips write own or staff" ON public.trips FOR INSERT WITH CHECK (((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id())));

-- users: lock back down. The old project had RLS enabled here with ZERO
-- client-facing policies — anon/authenticated could not touch this table at
-- all. It was only ever managed server-side via the service_role key (see
-- fixed_SWC_v6.2_auth/netlify/functions/admin-users.js), and
-- current_user_role() reads the role from the JWT, not this table. The new
-- project's blanket policy currently lets any anon/authenticated client
-- read/write/delete every user account — dropping it restores the original,
-- correct lockdown.
DROP POLICY IF EXISTS "Allow public access" ON public.users;

-- id_counters: lock back down for the same reason. All access happens
-- through the SECURITY DEFINER functions (next_trip_id, next_invoice_number,
-- next_batch_id, next_category_id, next_expense_type_id), which bypass RLS
-- entirely — so no client-facing policy is needed here, same as the old project.
DROP POLICY IF EXISTS "Allow public access" ON public.id_counters;

-- The original restore script stopped here, deliberately leaving six tables
-- open (expense_amounts, expense_categories, expense_entries, expense_types,
-- vehicles, order_item_flags) on the grounds that they were equally open in
-- the old project. Part 2 below closes them.

-- ============================================================================
-- PART 2 — C-03: the six tables the part 1 script leaves wide open
-- ============================================================================
--
-- These six kept "Allow public access" USING (true) WITH CHECK (true). The
-- part 1 policies skip them on the grounds that they were equally open in the
-- OLD project, so their state is not a *regression*. That is true, and it is
-- also not a reason to leave them reachable: no role is named on that policy,
-- so it grants PUBLIC, which includes `anon` — and the anon key ships in
-- config.js by design. Today anyone who views source can read and rewrite
-- every expense figure, every vehicle and the whole pending/returned ledger
-- without logging in.
--
-- The policies below follow exactly the pattern part 1 uses for
-- comparable operational tables: authenticated users read/write/update,
-- admin-only delete.

-- ── expense_categories ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public access" ON public.expense_categories;
DROP POLICY IF EXISTS "admin delete expense_categories" ON public.expense_categories;
DROP POLICY IF EXISTS "authenticated read expense_categories" ON public.expense_categories;
DROP POLICY IF EXISTS "authenticated update expense_categories" ON public.expense_categories;
DROP POLICY IF EXISTS "authenticated write expense_categories" ON public.expense_categories;
CREATE POLICY "admin delete expense_categories" ON public.expense_categories FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read expense_categories" ON public.expense_categories FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update expense_categories" ON public.expense_categories FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write expense_categories" ON public.expense_categories FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- ── expense_types ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public access" ON public.expense_types;
DROP POLICY IF EXISTS "admin delete expense_types" ON public.expense_types;
DROP POLICY IF EXISTS "authenticated read expense_types" ON public.expense_types;
DROP POLICY IF EXISTS "authenticated update expense_types" ON public.expense_types;
DROP POLICY IF EXISTS "authenticated write expense_types" ON public.expense_types;
CREATE POLICY "admin delete expense_types" ON public.expense_types FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read expense_types" ON public.expense_types FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update expense_types" ON public.expense_types FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write expense_types" ON public.expense_types FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- ── expense_entries ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public access" ON public.expense_entries;
DROP POLICY IF EXISTS "admin delete expense_entries" ON public.expense_entries;
DROP POLICY IF EXISTS "authenticated read expense_entries" ON public.expense_entries;
DROP POLICY IF EXISTS "authenticated update expense_entries" ON public.expense_entries;
DROP POLICY IF EXISTS "authenticated write expense_entries" ON public.expense_entries;
CREATE POLICY "admin delete expense_entries" ON public.expense_entries FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read expense_entries" ON public.expense_entries FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update expense_entries" ON public.expense_entries FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write expense_entries" ON public.expense_entries FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- ── expense_amounts ─────────────────────────────────────────────────────────
-- Note: DB.setExpenseAmount() DELETEs a cell when it is blanked or zeroed
-- (the sparse-matrix convention), and that happens for staff users too — so
-- unlike the tables above, DELETE here must be authenticated, not admin-only.
DROP POLICY IF EXISTS "Allow public access" ON public.expense_amounts;
DROP POLICY IF EXISTS "authenticated delete expense_amounts" ON public.expense_amounts;
DROP POLICY IF EXISTS "authenticated read expense_amounts" ON public.expense_amounts;
DROP POLICY IF EXISTS "authenticated update expense_amounts" ON public.expense_amounts;
DROP POLICY IF EXISTS "authenticated write expense_amounts" ON public.expense_amounts;
CREATE POLICY "authenticated delete expense_amounts" ON public.expense_amounts FOR DELETE USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated read expense_amounts" ON public.expense_amounts FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update expense_amounts" ON public.expense_amounts FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write expense_amounts" ON public.expense_amounts FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- ── vehicles ────────────────────────────────────────────────────────────────
-- Drivers need SELECT (the Vehicles tab and the Start Trip picker are in
-- their allow-list) but not INSERT/UPDATE — canEditVehicles() is admin/staff.
-- The one exception is the trip lifecycle, which flips a vehicle's status
-- between 'available' and 'busy'; that runs as the driver, so UPDATE stays
-- open to any authenticated user rather than breaking Start/End Trip.
DROP POLICY IF EXISTS "Allow public access" ON public.vehicles;
DROP POLICY IF EXISTS "admin delete vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "authenticated read vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "authenticated update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "staff write vehicles" ON public.vehicles;
CREATE POLICY "admin delete vehicles" ON public.vehicles FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read vehicles" ON public.vehicles FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update vehicles" ON public.vehicles FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "staff write vehicles" ON public.vehicles FOR INSERT WITH CHECK ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])));

-- ── order_item_flags ────────────────────────────────────────────────────────
-- Rows are normally created by flag_order_items() and resolved by
-- clear_order_item_flags(), both SECURITY DEFINER, so they are unaffected by
-- what is set here. These policies cover the direct client paths: the
-- Pendings page reading the ledger, "Mark Cleared" updating a status, and the
-- admin-only permanent delete.
DROP POLICY IF EXISTS "Allow public access" ON public.order_item_flags;
DROP POLICY IF EXISTS "admin delete order_item_flags" ON public.order_item_flags;
DROP POLICY IF EXISTS "authenticated read order_item_flags" ON public.order_item_flags;
DROP POLICY IF EXISTS "authenticated update order_item_flags" ON public.order_item_flags;
DROP POLICY IF EXISTS "authenticated write order_item_flags" ON public.order_item_flags;
CREATE POLICY "admin delete order_item_flags" ON public.order_item_flags FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read order_item_flags" ON public.order_item_flags FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update order_item_flags" ON public.order_item_flags FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write order_item_flags" ON public.order_item_flags FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- ============================================================================
-- PART 3 — C-04: revoke the SECURITY DEFINER RPCs from anon
-- ============================================================================
--
-- A SECURITY DEFINER function runs as its owner (postgres) and therefore
-- ignores RLS completely. Granting one to `anon` hands an unauthenticated
-- caller a hole straight through every policy in Part 1 and in the restore
-- script. update_order_with_items is the worst of them: an arbitrary order id
-- plus an arbitrary column map means rewriting any order's totals, status or
-- payment date and replacing all of its line items.
--
-- Default privileges also grant EXECUTE to PUBLIC on function creation, so
-- both PUBLIC and anon have to be revoked.

REVOKE ALL ON FUNCTION public.create_order_with_items(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_order_with_items_and_clear_flags(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_order_with_items(bigint, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_order_items(bigint, bigint, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_order_item_flags(bigint, jsonb) FROM PUBLIC, anon;
-- current_driver_id() is deliberately NOT revoked from anon. The restored
-- policies on `trips` and `drivers` call it inside their USING clauses, and
-- the planner is free to evaluate that call before the
-- auth.role() = 'authenticated' test beside it — so revoking EXECUTE would
-- turn an anon read from "no rows" into a hard permission-denied error. It
-- discloses nothing either way: auth.uid() is null for anon, so it returns
-- NULL. RLS on `trips` and `drivers` is what actually keeps anon out.
REVOKE ALL ON FUNCTION public.next_batch_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_invoice_number(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_category_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_expense_type_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_trip_id() FROM PUBLIC, anon;

-- The signed-in app keeps working exactly as before.
GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items_and_clear_flags(jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_with_items(bigint, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_order_items(bigint, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_order_item_flags(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_batch_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_category_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_expense_type_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_trip_id() TO authenticated;

-- ============================================================================
-- PART 4 — C-04: authorization + column allow-list inside the order RPCs
-- ============================================================================
--
-- Two defences the REVOKE above does not provide on its own.
--
-- (a) An in-body role check. A GRANT is one dashboard misclick away from
--     being handed back to anon, and PostgREST exposes every function in the
--     public schema. Checking the caller inside the function means the rule
--     travels with the function, and it mirrors the role gates the UI already
--     applies (canAddOrders / canEditOrders in app.js).
--
-- (b) A column allow-list. Both functions build their SQL from whatever keys
--     the JSON happens to carry, so a caller could reach columns no screen in
--     the app ever writes — `hidden` (which removes an order from every list)
--     and `qr_token`. Escaping via %L/%I is correct, so this was never an
--     injection risk; it is an authorization one. Unknown keys now raise
--     rather than being silently applied.
--
-- Only the guard and the allow-list are new. The insert/update mechanics
-- below are unchanged from supabase_atomic_order_rpc_migration.sql.

CREATE OR REPLACE FUNCTION public.assert_order_column_allowed(p_key text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_key NOT IN (
    'customer_id', 'driver_id', 'batch_id', 'status',
    'pickup_date', 'delivery_date', 'created_at',
    'total_amount', 'advance_payment', 'extra_payment',
    'delivery_charge', 'discount_rate', 'discount_amount',
    'signature', 'is_pickup_only', 'payment_date',
    'delivery_status', 'driver_assigned_at',
    'debug_edited_by', 'debug_edited_at'
  ) THEN
    RAISE EXCEPTION 'column "%" is not writable through this function', p_key
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_order_column_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_order_column_allowed(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_order_with_items(p_order jsonb, p_items jsonb)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id bigint;
  v_item     jsonb;
  v_cols     text;
  v_vals     text;
  v_key      text;
BEGIN
  -- Any signed-in role may create an order: admin, staff user and driver all
  -- pass canAddOrders() in the app.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'not authorized: sign-in required to create an order'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_key IN SELECT key FROM jsonb_each_text(p_order - 'id')
  LOOP
    PERFORM public.assert_order_column_allowed(v_key);
  END LOOP;

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
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set_clause text;
  v_item       jsonb;
  v_cols       text;
  v_vals       text;
  v_key        text;
BEGIN
  -- Editing an existing order is admin/staff only — this mirrors
  -- canEditOrders() in app.js. Drivers can create orders and record
  -- returns, but never rewrite an order that already exists.
  IF public.current_user_role() NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'not authorized: admin or staff role required to edit an order'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_key IN SELECT key FROM jsonb_each_text(p_order - 'id')
  LOOP
    PERFORM public.assert_order_column_allowed(v_key);
  END LOOP;

  SELECT string_agg(format('%I = %L', key, value), ', ')
    INTO v_set_clause
  FROM jsonb_each_text(p_order - 'id');

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

CREATE OR REPLACE FUNCTION public.flag_order_items(p_order_id bigint, p_customer_id bigint, p_flags jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag jsonb;
BEGIN
  -- Admin, staff and driver all pass canMarkReturned() in the app; the only
  -- thing being excluded here is an unauthenticated caller.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'not authorized: sign-in required to flag order items'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- Re-assert grants: CREATE OR REPLACE preserves them, but being explicit
-- means this file leaves the same end state whether or not the functions
-- already existed.
REVOKE ALL ON FUNCTION public.create_order_with_items(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_order_with_items(bigint, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_order_items(bigint, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_with_items(bigint, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_order_items(bigint, bigint, jsonb) TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFY — run each of these separately after the COMMIT above.
-- ============================================================================
--
-- 1. No table should still carry the blanket policy.
--    EXPECTED: 0 rows.
--
--    SELECT tablename, policyname
--    FROM pg_policies
--    WHERE schemaname = 'public' AND policyname = 'Allow public access';
--
-- 2. No SECURITY DEFINER function should still be executable by anon, with
--    one deliberate exception.
--    EXPECTED: 0 rows. (current_driver_id is excluded on purpose — see the
--    note in part 3. Without that exclusion it would legitimately appear.)
--
--    SELECT p.proname
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prosecdef
--      AND p.proname <> 'current_driver_id'
--      AND has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- 2b. Confirm every table now has RLS on and at least one policy.
--     EXPECTED: 0 rows.
--
--     SELECT c.relname
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname = 'public' AND c.relkind = 'r'
--       AND (NOT c.relrowsecurity
--            OR (c.relname NOT IN ('users','id_counters')
--                AND NOT EXISTS (SELECT 1 FROM pg_policies p
--                                WHERE p.schemaname='public' AND p.tablename=c.relname)));
--
-- 3. Smoke-test the app while signed in as each role: create an order
--    (admin, staff, driver), edit an order (admin, staff — a driver should
--    now get a clear "admin or staff role required" error instead of a
--    silent success), mark an item returned, start and end a trip, and add
--    a Cash Book row.
--
-- ============================================================================
-- ROLLBACK — if any of the above breaks a flow you need, this puts the
-- previous (open) state back for the affected object. Prefer fixing the
-- policy over reopening the table.
-- ============================================================================
--
--   -- reopen a single table (replace <table>):
--   BEGIN;
--   DROP POLICY IF EXISTS "admin delete <table>"        ON public.<table>;
--   DROP POLICY IF EXISTS "authenticated read <table>"  ON public.<table>;
--   DROP POLICY IF EXISTS "authenticated update <table>" ON public.<table>;
--   DROP POLICY IF EXISTS "authenticated write <table>" ON public.<table>;
--   CREATE POLICY "Allow public access" ON public.<table> USING (true) WITH CHECK (true);
--   COMMIT;

--
--   -- hand a function back to anon (not recommended):
--   GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb, jsonb) TO anon;
--
--   -- drop the in-body guards: re-run the CREATE OR REPLACE bodies from
--   -- supabase_atomic_order_rpc_migration.sql, which contain no role check.
