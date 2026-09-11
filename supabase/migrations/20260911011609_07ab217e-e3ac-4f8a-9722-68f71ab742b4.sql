ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS whatsapp text;

DROP FUNCTION IF EXISTS public.get_public_business(text);

CREATE FUNCTION public.get_public_business(_slug text)
 RETURNS TABLE(id uuid, name text, business_type text, slug text, logo_url text, brand_color text, accent_color text, cover_image_url text, description text, phone text, whatsapp text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.id, b.name, b.business_type, b.slug, b.logo_url, b.brand_color,
         b.accent_color, b.cover_image_url, b.description, b.phone, b.whatsapp
  FROM public.businesses b WHERE b.slug = _slug;
$function$;