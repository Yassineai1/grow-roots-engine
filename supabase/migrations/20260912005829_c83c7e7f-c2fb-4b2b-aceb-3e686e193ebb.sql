
CREATE OR REPLACE FUNCTION public.get_business_clients(_business_id uuid, _q text DEFAULT NULL)
RETURNS TABLE(id uuid, user_id uuid, full_name text, email text, phone text, notes text, booking_count bigint, last_booking_date date, next_booking_date date, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id,
         c.user_id,
         COALESCE(u.full_name, ''),
         COALESCE(u.email, ''),
         COALESCE(u.phone, ''),
         c.notes,
         COUNT(b.id) FILTER (WHERE b.status <> 'cancelled'),
         MAX(b.booking_date) FILTER (WHERE b.status <> 'cancelled' AND b.booking_date <= CURRENT_DATE),
         MIN(b.booking_date) FILTER (WHERE b.status IN ('pending','confirmed') AND b.booking_date >= CURRENT_DATE),
         CASE
           WHEN COUNT(b.id) FILTER (WHERE b.status <> 'cancelled') = 0 THEN 'new'
           WHEN MIN(b.booking_date) FILTER (WHERE b.status IN ('pending','confirmed') AND b.booking_date >= CURRENT_DATE) IS NOT NULL THEN 'active'
           WHEN MAX(b.booking_date) FILTER (WHERE b.status <> 'cancelled') >= CURRENT_DATE - 90 THEN 'active'
           ELSE 'inactive'
         END
  FROM public.clients c
  LEFT JOIN public.users u ON u.id = c.user_id
  LEFT JOIN public.bookings b ON b.client_id = c.id AND b.business_id = c.business_id
  WHERE c.business_id = _business_id
    AND (app_private.owns_business(_business_id) OR app_private.is_platform_admin())
    AND (
      _q IS NULL OR btrim(_q) = '' OR
      COALESCE(u.full_name,'') ILIKE '%' || btrim(_q) || '%' OR
      COALESCE(u.email,'') ILIKE '%' || btrim(_q) || '%' OR
      COALESCE(u.phone,'') ILIKE '%' || btrim(_q) || '%'
    )
  GROUP BY c.id, c.user_id, u.full_name, u.email, u.phone, c.notes
  ORDER BY COALESCE(u.full_name, u.email, '');
$$;

CREATE OR REPLACE FUNCTION public.get_business_client(_client_id uuid)
RETURNS TABLE(id uuid, business_id uuid, full_name text, email text, phone text, notes text, booking_count bigint, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id,
         c.business_id,
         COALESCE(u.full_name, ''),
         COALESCE(u.email, ''),
         COALESCE(u.phone, ''),
         c.notes,
         (SELECT COUNT(*) FROM public.bookings b WHERE b.client_id = c.id AND b.business_id = c.business_id AND b.status <> 'cancelled'),
         c.created_at
  FROM public.clients c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE c.id = _client_id
    AND (app_private.owns_business(c.business_id) OR app_private.is_platform_admin());
$$;

CREATE OR REPLACE FUNCTION public.get_business_client_bookings(_client_id uuid)
RETURNS TABLE(id uuid, booking_date date, start_time time, end_time time, status text, service_name text, staff_name text, notes text, payment_status text, payment_amount numeric, payment_currency text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.id, b.booking_date, b.start_time, b.end_time, b.status,
         s.name, COALESCE(su.full_name, ''), b.notes,
         p.status, p.amount, p.currency
  FROM public.bookings b
  JOIN public.clients c ON c.id = b.client_id
  JOIN public.services s ON s.id = b.service_id
  LEFT JOIN public.staff st ON st.id = b.staff_id
  LEFT JOIN public.users su ON su.id = st.user_id
  LEFT JOIN LATERAL (
    SELECT pay.status, pay.amount, pay.currency
    FROM public.payments pay
    WHERE pay.booking_id = b.id AND pay.business_id = b.business_id
    ORDER BY pay.created_at DESC
    LIMIT 1
  ) p ON TRUE
  WHERE b.client_id = _client_id
    AND (app_private.owns_business(b.business_id) OR app_private.is_platform_admin())
  ORDER BY b.booking_date DESC, b.start_time DESC;
$$;

REVOKE ALL ON FUNCTION public.get_business_clients(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_business_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_business_client_bookings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_clients(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_client_bookings(uuid) TO authenticated;
