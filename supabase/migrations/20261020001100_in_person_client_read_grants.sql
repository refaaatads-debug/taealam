-- Grant only the direct table operations used by the in-person pilot UI.
-- Row-level policies continue to restrict address ownership and city administration.
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT INSERT ON public.cities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_addresses TO authenticated;
