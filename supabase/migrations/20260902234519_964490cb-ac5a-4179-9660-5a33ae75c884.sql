CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.full_name, u.email FROM public.users u WHERE lower(u.email) = lower(_email) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_business_staff(_business_id uuid)
RETURNS TABLE (id uuid, user_id uuid, full_name text, email text, bio text, specialties text[], is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.user_id, COALESCE(u.full_name, ''), COALESCE(u.email, ''), s.bio, s.specialties, s.is_active
  FROM public.staff s LEFT JOIN public.users u ON u.id = s.user_id
  WHERE s.business_id = _business_id
    AND (app_private.owns_business(_business_id) OR app_private.is_platform_admin())
  ORDER BY u.full_name;
$$;

CREATE OR REPLACE FUNCTION public.get_business_bookings(_business_id uuid)
RETURNS TABLE (id uuid, client_name text, client_email text, service_name text, staff_name text,
               booking_date date, start_time time, end_time time, status text, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, COALESCE(cu.full_name, 'Client'), COALESCE(cu.email, ''), sv.name,
         COALESCE(su.full_name, 'Staff'), b.booking_date, b.start_time, b.end_time, b.status, b.notes
  FROM public.bookings b
  JOIN public.services sv ON sv.id = b.service_id
  JOIN public.staff st ON st.id = b.staff_id
  LEFT JOIN public.clients c ON c.id = b.client_id
  LEFT JOIN public.users cu ON cu.id = c.user_id
  LEFT JOIN public.users su ON su.id = st.user_id
  WHERE b.business_id = _business_id
    AND (app_private.owns_business(_business_id) OR app_private.is_platform_admin())
  ORDER BY b.booking_date DESC, b.start_time DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.find_user_by_email(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_business_staff(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_business_bookings(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_business_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_business_bookings(uuid) TO authenticated, service_role;