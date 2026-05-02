-- Allow users to write (INSERT/UPDATE) their own sensitive columns
-- SELECT remains restricted - only accessible via security-definer functions

GRANT INSERT (phone), UPDATE (phone) ON public.profiles TO authenticated, anon;

GRANT INSERT (iban, bank_name, account_holder_name), 
      UPDATE (iban, bank_name, account_holder_name) 
ON public.teacher_profiles TO authenticated, anon;

-- Allow owner to read their own sensitive columns directly via RLS
-- (RLS policy already restricts to auth.uid() = user_id, but column-level ACL was blocking)
GRANT SELECT (phone) ON public.profiles TO authenticated;
GRANT SELECT (iban, bank_name, account_holder_name, balance) ON public.teacher_profiles TO authenticated;