-- ============================================================
-- STANDALONE MIGRATION: Atomic Order + Order Items RPCs
-- System: SAGA Washing Center ERP
-- ============================================================
-- Fixes a data-integrity bug reported via the Reports tab ("Full Report
-- Generation ... Some orders lacks order items in the report").
--
-- Root cause: order creation/edit was always two (or three) separate,
-- non-atomic client calls — insert the order row, THEN separately insert
-- its order_items. If the items insert failed for any reason (network
-- blip, FK violation on a deleted catalog item, RLS, etc.), the order
-- row it had already committed was never rolled back — it just silently
-- ends up with zero order_items rows forever. The edit-order path was
-- worse: update order, delete old items, re-insert new items as THREE
-- separate calls.
--
-- Fix: wrap "order row + its items" in one Postgres function per
-- create/update. A plpgsql function body already executes as a single
-- implicit transaction, so any failure mid-way rolls back everything —
-- no explicit BEGIN/COMMIT needed or wanted inside plpgsql.
--
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION).
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_order_with_items(p_order jsonb, p_items jsonb)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id bigint;
BEGIN
  INSERT INTO public.orders
  SELECT * FROM jsonb_populate_record(NULL::public.orders, p_order)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items
  SELECT (jsonb_populate_record(
      NULL::public.order_items,
      elem || jsonb_build_object('order_id', v_order_id)
    )).*
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS elem;

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
BEGIN
  SELECT string_agg(format('%I = %L', key, value), ', ')
    INTO v_set_clause
  FROM jsonb_each_text(p_order);

  IF v_set_clause IS NOT NULL THEN
    EXECUTE format('UPDATE public.orders SET %s WHERE id = %L', v_set_clause, p_order_id);
  END IF;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  INSERT INTO public.order_items
  SELECT (jsonb_populate_record(
      NULL::public.order_items,
      elem || jsonb_build_object('order_id', p_order_id)
    )).*
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS elem;
END;
$$;
