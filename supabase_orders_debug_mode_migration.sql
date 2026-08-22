-- ============================================================
-- STANDALONE MIGRATION: Orders Debug Mode audit columns
-- System: SAGA Washing Center ERP
-- ============================================================
-- DebugMode.md: admin-only "Debug Mode" on the Orders tab lets an admin
-- reconstruct missing/wrong order_items on historically "broken" orders
-- (item breakdown lost, but the paper-bill total is ground truth) without
-- moving that order's sub total / grand total. These two columns are pure
-- audit trail -- who touched an order via Debug Mode and when -- so it's
-- visible later which orders were patched this way. Not read by any
-- calculation path.
--
-- TEXT (not uuid/FK) to match the existing "who did this" audit-column
-- convention already used for trash.deleted_by (supabase_trash_migration.sql)
-- -- stores currentUser.display_name, same as every DB.addTrash call site.
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS debug_edited_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS debug_edited_at timestamptz;
