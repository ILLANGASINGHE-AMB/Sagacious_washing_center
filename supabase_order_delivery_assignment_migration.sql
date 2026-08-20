-- ============================================================
-- STANDALONE MIGRATION: Order Delivery Assignment (driver_assigned_at,
-- delivery_status)
-- System: SAGA Washing Center ERP
-- ============================================================
-- Implements newchanges2.md: admin/staff can bulk-assign a driver to a set
-- of orders from the Orders tab regardless of who originally collected
-- them, and that driver then sees those orders on their own Dashboard
-- with a status of "Out for Delivery" / "Delivered".
--
-- Deliberately a NEW column, not a reuse of orders.status — that column is
-- already the payment lifecycle (Paid/Unpaid/Partially Paid) and
-- db.js's normalizeOrderStatus() collapses anything else back to
-- 'Unpaid' on every read, so writing a delivery state into it would be
-- silently destroyed the next time the order is fetched.
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS, guarded
-- constraint add).
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_assigned_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('out_for_delivery', 'delivered'));
  END IF;
END $$;
