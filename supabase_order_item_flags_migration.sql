-- ============================================================
-- STANDALONE MIGRATION: Pending / Returned Item Ledger
-- System: SAGA Washing Center ERP
-- ============================================================
-- Implements NewChange.md: some items on an order can't be delivered on
-- time ("pending") or get handed back by the customer later ("returned").
-- Both need to be remembered independently of the order they originated
-- on, so a *later* order/bill can say "by the way, still owes 5 bed
-- sheets from order #0004" and, once delivered, mark that debt cleared.
--
-- Design: a ledger table (order_item_flags), not new columns on
-- order_items — order_items must stay an unmutated record of what was
-- originally billed. See Solution.md §3 for the full reasoning.
--
-- Partial clearing: a flag can be resolved across MULTIPLE later orders
-- (e.g. 5 pending bed sheets, only 2 delivered on the next bill). Rather
-- than mutating history, clearing a partial amount SPLITS the flag: the
-- original row's quantity shrinks by the cleared amount and stays
-- pending/returned, while a new row is inserted for the cleared portion
-- (status='cleared', cleared_in_order_id=<the order that resolved it>).
-- This keeps every row an honest, permanent record of one delivery event.
--
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_item_flags (
  id                  bigserial PRIMARY KEY,
  -- Order the item was originally billed on. Cascades on delete — a flag
  -- referring to a deleted order no longer means anything.
  order_id            bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- The specific line item. Nullable + SET NULL: editing an order via
  -- update_order_with_items deletes and re-inserts ALL its order_items,
  -- so a flagged line item's id can legitimately disappear out from under
  -- an existing flag. The flag keeps its item_name/quantity snapshot and
  -- just loses the ability to highlight that exact row with the "P" badge.
  order_item_id       bigint REFERENCES public.order_items(id) ON DELETE SET NULL,
  -- Denormalized for fast "everything outstanding for this customer"
  -- lookups (Pendings & Returns tab, customer profile panel) without a
  -- join through orders. Cascades with the customer for the same reason
  -- DB.deleteCustomer already sweeps that customer's other records.
  customer_id         bigint NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  item_name            text NOT NULL,
  quantity             numeric NOT NULL CHECK (quantity > 0),
  flag_type            text NOT NULL CHECK (flag_type IN ('pending', 'returned')),
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'returned', 'cleared')),
  -- The later order that delivered/collected this flag. Nullable — set
  -- either by clear_order_item_flags (via a new order) or by the manual
  -- "Mark Cleared" action in the Pendings tab (which sets status only).
  cleared_in_order_id  bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  cleared_at           timestamptz
);

CREATE INDEX IF NOT EXISTS order_item_flags_customer_status_idx ON public.order_item_flags (customer_id, status);
CREATE INDEX IF NOT EXISTS order_item_flags_cleared_in_order_idx ON public.order_item_flags (cleared_in_order_id);
CREATE INDEX IF NOT EXISTS order_item_flags_order_idx ON public.order_item_flags (order_id);

ALTER TABLE public.order_item_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_item_flags' AND policyname = 'Allow read order_item_flags') THEN
    CREATE POLICY "Allow read order_item_flags" ON public.order_item_flags FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_item_flags' AND policyname = 'Allow write order_item_flags') THEN
    CREATE POLICY "Allow write order_item_flags" ON public.order_item_flags FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_item_flags' AND policyname = 'Allow update order_item_flags') THEN
    CREATE POLICY "Allow update order_item_flags" ON public.order_item_flags FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_item_flags' AND policyname = 'Allow delete order_item_flags') THEN
    CREATE POLICY "Allow delete order_item_flags" ON public.order_item_flags FOR DELETE USING (true);
  END IF;
END $$;

-- ── Create pending/returned flags (admin "Keep as Pending" action, driver
--    "Mark Returned" action) ─────────────────────────────────────────────
-- p_flags: jsonb array of {order_item_id, item_name, quantity, flag_type}
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

-- ── Resolve open flags against a new order (partial-clear aware) ───────
-- p_clears: jsonb array of {flag_id, quantity} — quantity being resolved
-- by p_new_order_id right now (may be less than the flag's full quantity).
CREATE OR REPLACE FUNCTION public.clear_order_item_flags(p_new_order_id bigint, p_clears jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clear    jsonb;
  v_flag     public.order_item_flags%ROWTYPE;
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

-- ── Create a new order AND clear flags it resolves, atomically ─────────
-- Same order+items insert as create_order_with_items (see
-- supabase_atomic_order_rpc_migration.sql), plus clearing in the same
-- transaction so "order created but its flag-clearing never happened"
-- can't occur as a partial-failure state.
CREATE OR REPLACE FUNCTION public.create_order_with_items_and_clear_flags(p_order jsonb, p_items jsonb, p_clears jsonb)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id bigint;
BEGIN
  v_order_id := public.create_order_with_items(p_order, p_items);
  PERFORM public.clear_order_item_flags(v_order_id, p_clears);
  RETURN v_order_id;
END;
$$;
