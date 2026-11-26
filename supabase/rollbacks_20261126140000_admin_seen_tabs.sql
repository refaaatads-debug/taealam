-- Rollback for 20261126140000_admin_seen_tabs.sql (dashboard falls back to browser storage).
DROP TABLE IF EXISTS public.admin_seen_tabs;
