CREATE OR REPLACE FUNCTION public.search_public_businesses(_q text)
RETURNS TABLE(id uuid, name text, slug text, business_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.slug, b.business_type
  FROM public.businesses b
  WHERE b.subscription_status IN ('active', 'trial')
    AND length(btrim(coalesce(_q, ''))) >= 2
    AND b.name ILIKE '%' || btrim(_q) || '%'
  ORDER BY b.name
  LIMIT 20
$$;

REVOKE ALL ON FUNCTION public.search_public_businesses(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_businesses(text) TO anon, authenticated;