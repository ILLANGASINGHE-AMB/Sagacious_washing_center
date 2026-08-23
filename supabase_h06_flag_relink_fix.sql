-- ============================================================
-- STANDALONE MIGRATION: Re-link order_item_flags after Edit Order
-- System: SAGA Washing Center ERP
-- Fixes HighIssues.md H-06
-- ============================================================
-- update_order_with_items (supabase_atomic_order_rpc_migration.sql) edits an
-- order's items by DELETE FROM order_items WHERE order_id = ... followed by
-- a fresh INSERT of every row — so every line item gets a brand-new id on
-- every save, even for items that were logically unchanged.
--
-- order_item_flags.order_item_id references order_items(id) ON DELETE SET
-- NULL, so that DELETE silently detaches every pending/returned flag raised
-- against this order from its line item. The Edit Order modal draws the
-- yellow "P" badge by matching String(f.order_item_id) === String(item.id)
-- (orders.js), so after ONE edit every pending badge on that order vanishes
-- — even though the flag rows themselves (and the money/ledger they
-- represent) are still there.
--
-- Fix: after the items are reinserted, re-link any flag that just lost its
-- link back to a same-named item in the freshly-inserted set, for this
-- order only. This is the best available signal — order_item_flags.item_name
-- is captured at flag-creation time specifically so it survives an
-- order_item_id going NULL (see supabase_order_item_flags_migration.sql) —
-- and it's exactly what H-06 asks for ("re-link flags by item_name after
-- the rewrite"). Only 'pending'/'returned' flags are touched; 'cleared'
-- flags are historical and don't need a live item link. When an order has
-- two rows with the same item_name, one representative row (lowest id) is
-- used — order_item_flags carries its own quantity independent of the line
-- item's, so this is a display-link fix, not a quantity recompute.
--
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION).
-- ============================================================

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
BEGIN
  SELECT string_agg(format('%I = %L', key, value), ', ')
    INTO v_set_clause
  FROM jsonb_each_text(p_order);

  IF v_set_clause IS NOT NULL THEN
    EXECUTE format('UPDATE public.orders SET %s WHERE id = %L', v_set_clause, p_order_id);
  END IF;

  -- This DELETE fires order_item_flags_order_item_id_fkey's ON DELETE SET
  -- NULL for every flag pointing at one of these rows, synchronously,
  -- within this same transaction.
  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    SELECT string_agg(format('%I', key), ', '),
           string_agg(format('%L', value), ', ')
      INTO v_cols, v_vals
    FROM jsonb_each_text((v_item - 'id') || jsonb_build_object('order_id', p_order_id));

    EXECUTE format('INSERT INTO public.order_items (%s) VALUES (%s)', v_cols, v_vals);
  END LOOP;

  -- Re-link flags this DELETE just detached, by item_name, to the newly
  -- inserted line items for this same order.
  UPDATE public.order_item_flags f
  SET order_item_id = oi.id
  FROM (
    SELECT DISTINCT ON (item_name) id, item_name
    FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY item_name, id
  ) oi
  WHERE f.order_id = p_order_id
    AND f.order_item_id IS NULL
    AND f.status IN ('pending', 'returned')
    AND f.item_name = oi.item_name;
END;
$$;
