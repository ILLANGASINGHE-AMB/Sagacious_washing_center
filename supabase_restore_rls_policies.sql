-- Restore original role-based RLS policies lost during the Supabase project migration.
--
-- What happened: the new project ended up with one blanket policy per table
-- ("Allow public access" USING (true) WITH CHECK (true)), replacing the old
-- project's 52 granular, role-based policies. This script restores the
-- original policies verbatim from the old project's schema dump.
--
-- Safe to run: this only changes POLICY objects (access rules). It does not
-- read, write, insert, update, or delete any row in any table.
--
-- How to run: Supabase Dashboard > SQL Editor (on the NEW project) > paste > Run.

BEGIN;

-- customers
DROP POLICY IF EXISTS "Allow public access" ON public.customers;
CREATE POLICY "admin delete customers" ON public.customers FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read customers" ON public.customers FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update customers" ON public.customers FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write customers" ON public.customers FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- deductions
DROP POLICY IF EXISTS "Allow public access" ON public.deductions;
CREATE POLICY "admin delete deductions" ON public.deductions FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read deductions" ON public.deductions FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update deductions" ON public.deductions FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write deductions" ON public.deductions FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- drivers
DROP POLICY IF EXISTS "Allow public access" ON public.drivers;
CREATE POLICY "admin delete drivers" ON public.drivers FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "drivers insert staff only" ON public.drivers FOR INSERT WITH CHECK ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])));
CREATE POLICY "drivers read own or staff" ON public.drivers FOR SELECT USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (auth_user_id = auth.uid()))));
CREATE POLICY "drivers update own or staff" ON public.drivers FOR UPDATE USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (auth_user_id = auth.uid())))) WITH CHECK (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (auth_user_id = auth.uid()))));

-- invoices
DROP POLICY IF EXISTS "Allow public access" ON public.invoices;
CREATE POLICY "admin delete invoices" ON public.invoices FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read invoices" ON public.invoices FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update invoices" ON public.invoices FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write invoices" ON public.invoices FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- items
DROP POLICY IF EXISTS "Allow public access" ON public.items;
CREATE POLICY "admin delete items" ON public.items FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read items" ON public.items FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update items" ON public.items FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write items" ON public.items FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- order_items
DROP POLICY IF EXISTS "Allow public access" ON public.order_items;
CREATE POLICY "admin delete order_items" ON public.order_items FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read order_items" ON public.order_items FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update order_items" ON public.order_items FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write order_items" ON public.order_items FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- orders
DROP POLICY IF EXISTS "Allow public access" ON public.orders;
CREATE POLICY "admin delete orders" ON public.orders FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read orders" ON public.orders FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update orders" ON public.orders FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write orders" ON public.orders FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- payments
DROP POLICY IF EXISTS "Allow public access" ON public.payments;
CREATE POLICY "admin delete payments" ON public.payments FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read payments" ON public.payments FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update payments" ON public.payments FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write payments" ON public.payments FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- settings
DROP POLICY IF EXISTS "Allow public access" ON public.settings;
CREATE POLICY "admin delete settings" ON public.settings FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read settings" ON public.settings FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated update settings" ON public.settings FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "authenticated write settings" ON public.settings FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

-- trash
DROP POLICY IF EXISTS "Allow public access" ON public.trash;
CREATE POLICY "admin delete trash" ON public.trash FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "admin write trash" ON public.trash FOR INSERT WITH CHECK ((public.current_user_role() = 'admin'::text));
CREATE POLICY "authenticated read trash" ON public.trash FOR SELECT USING ((auth.role() = 'authenticated'::text));

-- trips
DROP POLICY IF EXISTS "Allow public access" ON public.trips;
CREATE POLICY "admin delete trips" ON public.trips FOR DELETE USING ((public.current_user_role() = 'admin'::text));
CREATE POLICY "trips read own or staff" ON public.trips FOR SELECT USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id()))));
CREATE POLICY "trips update own or staff" ON public.trips FOR UPDATE USING (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id())))) WITH CHECK (((auth.role() = 'authenticated'::text) AND ((public.current_user_role() = ANY (ARRAY['admin'::text, 'user'::text])) OR (driver_id = public.current_driver_id()))));
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

-- Not touched (unchanged from old project, was already fully open there too):
-- expense_amounts, expense_categories, expense_entries, expense_types,
-- vehicles, order_item_flags — all had USING (true) policies in the old
-- project as well, so the new project's blanket policy is not a regression
-- for these six tables.

COMMIT;
