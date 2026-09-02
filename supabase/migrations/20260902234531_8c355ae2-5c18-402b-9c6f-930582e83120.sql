DROP FUNCTION public.find_user_by_email(text);
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text)
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.full_name FROM public.users u
  WHERE lower(u.email) = lower(_email)
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = auth.uid())
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.find_user_by_email(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated, service_role;