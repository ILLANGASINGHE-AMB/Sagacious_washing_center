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
-- v2 fix: jsonb_populate_record(NULL::tbl, json) builds the row starting
-- from an ALL-NULL record and only overlays the keys present in the
-- json. Since `id` (identity/default column on both orders and
-- order_items) is never included in the json payload from the client,
-- the resulting row had id = NULL explicitly — and `INSERT ... SELECT *`
-- inserts that literal NULL instead of letting the column DEFAULT fire,
-- which raised "null value in column \"id\" ... violates not-null
-- constraint" on every order create/edit. Fixed by building the INSERT
-- dynamically from the json's own keys (same %I/%L pattern already used
-- safely below for the orders UPDATE), so `id` is simply never part of
-- the column list and the DEFAULT applies normally.
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
