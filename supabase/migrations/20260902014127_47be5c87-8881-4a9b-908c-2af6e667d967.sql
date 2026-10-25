REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_business(uuid) FROM PUBLIC, anon, authenticated;