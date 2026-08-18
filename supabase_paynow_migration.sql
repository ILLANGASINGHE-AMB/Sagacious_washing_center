-- ============================================================
-- SUPABASE SQL MIGRATION: PAY NOW TAB (hide/unhide + partial status)
-- System: SAGA Washing Center
-- ============================================================

-- 1. Add a "hidden" flag to orders so they can be hidden/unhidden from the
--    Pay Now list without deleting them.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_hidden ON public.orders(hidden);

-- 2. Invoices already have the columns needed for a consolidated "Single
--    Invoice" batch payment (batch_order_ids, batch_invoice_details) — this
--    just makes sure they exist for installs that predate that feature.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS batch_order_ids TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS batch_invoice_details TEXT;

-- Note: order.status / invoice.paid_status now also store 'Partially Paid'
-- alongside the existing 'Paid' / 'Unpaid' values — both columns are plain
-- TEXT already, so no schema change is required for that.
