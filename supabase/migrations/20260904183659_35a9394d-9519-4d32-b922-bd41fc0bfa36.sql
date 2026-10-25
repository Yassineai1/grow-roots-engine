-- 1. Service flag
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS requires_payment boolean NOT NULL DEFAULT false;

-- 2. Booking hold expiry (temporary reservation while payment completes)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

-- 3. Private per-business provider configuration (never readable by the browser)
CREATE TABLE IF NOT EXISTS app_private.business_payment_config (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'cmi',
  cmi_merchant_id text,
  cmi_store_key text,
  cmi_mode text NOT NULL DEFAULT 'test' CHECK (cmi_mode IN ('test','live')),
  payment_configured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.business_payment_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.business_payment_config FROM anon, authenticated;
GRANT ALL ON app_private.business_payment_config TO service_role;

-- 4. Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'MAD',
  provider text NOT NULL DEFAULT 'cmi',
  provider_payment_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed','cancelled','refunded','partially_refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    app_private.owns_business(business_id)
    OR app_private.is_own_client(client_id)
    OR app_private.is_platform_admin()
  );

CREATE INDEX IF NOT EXISTS payments_booking_id_idx ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS payments_business_id_idx ON public.payments(business_id);
CREATE INDEX IF NOT EXISTS payments_client_id_idx ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_provider_payment_id_idx ON public.payments(provider_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_unique
  ON public.payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated;

DROP TRIGGER IF EXISTS payments_touch_updated_at ON public.payments;
CREATE TRIGGER payments_touch_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Safe status readers (never expose the store key)
CREATE OR REPLACE FUNCTION public.get_payment_settings(_business_id uuid)
RETURNS TABLE(provider text, mode text, payment_configured boolean, merchant_id_masked text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(c.provider,'cmi'),
         COALESCE(c.cmi_mode,'test'),
         COALESCE(c.payment_configured,false),
         CASE WHEN c.cmi_merchant_id IS NULL OR c.cmi_merchant_id = '' THEN NULL
              ELSE repeat('*', greatest(length(c.cmi_merchant_id) - 4, 0)) || right(c.cmi_merchant_id, 4) END
  FROM (SELECT _business_id AS bid) x
  LEFT JOIN app_private.business_payment_config c ON c.business_id = x.bid
  WHERE app_private.owns_business(_business_id) OR app_private.is_platform_admin();
$$;
REVOKE ALL ON FUNCTION public.get_payment_settings(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_payment_settings(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_payment_availability(_business_id uuid)
RETURNS TABLE(payment_configured boolean, provider text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(c.payment_configured,false), COALESCE(c.provider,'cmi')
  FROM (SELECT _business_id AS bid) x
  LEFT JOIN app_private.business_payment_config c ON c.business_id = x.bid;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_payment_availability(uuid) TO anon, authenticated;

-- 6. Public services now expose requires_payment
DROP FUNCTION IF EXISTS public.get_public_services(uuid);
CREATE FUNCTION public.get_public_services(_business_id uuid)
RETURNS TABLE(id uuid, name text, description text, service_type text, duration_minutes integer, price numeric, capacity integer, requires_payment boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.description, s.service_type, s.duration_minutes, s.price, s.capacity, s.requires_payment
  FROM public.services s WHERE s.business_id = _business_id AND s.is_active
  ORDER BY s.name;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_services(uuid) TO anon, authenticated;

-- 7. Expired unpaid holds must not consume capacity
CREATE OR REPLACE FUNCTION public.validate_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  svc public.services%ROWTYPE;
  stf public.staff%ROWTYPE;
  cli public.clients%ROWTYPE;
  active_overlap integer;
  group_count integer;
  is_owner boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending'   AND NEW.status IN ('confirmed','cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('cancelled','completed','no_show'))
    ) THEN
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    is_owner := app_private.owns_business(NEW.business_id) OR app_private.is_platform_admin();
    IF NOT is_owner THEN
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Clients may only cancel their bookings';
      END IF;
      IF (NEW.business_id, NEW.client_id, NEW.service_id, NEW.staff_id, NEW.booking_date, NEW.start_time, NEW.end_time)
         IS DISTINCT FROM
         (OLD.business_id, OLD.client_id, OLD.service_id, OLD.staff_id, OLD.booking_date, OLD.start_time, OLD.end_time) THEN
        RAISE EXCEPTION 'Clients may not modify booking details';
      END IF;
    END IF;
  END IF;

  IF NEW.status NOT IN ('pending','confirmed') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.staff_id::text || NEW.booking_date::text, 0));

  SELECT * INTO svc FROM public.services WHERE id = NEW.service_id;
  SELECT * INTO stf FROM public.staff WHERE id = NEW.staff_id;
  SELECT * INTO cli FROM public.clients WHERE id = NEW.client_id;

  IF svc.business_id <> NEW.business_id THEN RAISE EXCEPTION 'Service belongs to another business'; END IF;
  IF stf.business_id <> NEW.business_id THEN RAISE EXCEPTION 'Staff belongs to another business'; END IF;
  IF cli.business_id <> NEW.business_id THEN RAISE EXCEPTION 'Client belongs to another business'; END IF;
  IF NOT svc.is_active THEN RAISE EXCEPTION 'Service is not active'; END IF;
  IF NOT stf.is_active THEN RAISE EXCEPTION 'Staff member is not active'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff_services ss WHERE ss.staff_id = NEW.staff_id AND ss.service_id = NEW.service_id) THEN
    RAISE EXCEPTION 'Staff member is not assigned to this service';
  END IF;

  IF (NEW.end_time - NEW.start_time) <> make_interval(mins => svc.duration_minutes) THEN
    RAISE EXCEPTION 'Booking duration must match the service duration (% minutes)', svc.duration_minutes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.availability a
    WHERE a.staff_id = NEW.staff_id
      AND a.day_of_week = EXTRACT(DOW FROM NEW.booking_date)::int
      AND a.start_time <= NEW.start_time
      AND a.end_time >= NEW.end_time
  ) THEN
    RAISE EXCEPTION 'Booking is outside the staff member''s availability';
  END IF;

  SELECT count(*) INTO active_overlap
  FROM public.bookings b
  WHERE b.staff_id = NEW.staff_id
    AND b.booking_date = NEW.booking_date
    AND b.id <> NEW.id
    AND b.status IN ('pending','confirmed')
    AND NOT (b.status = 'pending' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at < now())
    AND b.start_time < NEW.end_time
    AND b.end_time > NEW.start_time
    AND NOT (
      svc.service_type = 'group_class'
      AND b.service_id = NEW.service_id
      AND b.start_time = NEW.start_time
      AND b.end_time = NEW.end_time
    );
  IF active_overlap > 0 THEN
    RAISE EXCEPTION 'This time slot is no longer available';
  END IF;

  IF svc.service_type = 'group_class' THEN
    SELECT count(*) INTO group_count
    FROM public.bookings b
    WHERE b.service_id = NEW.service_id
      AND b.staff_id = NEW.staff_id
      AND b.booking_date = NEW.booking_date
      AND b.start_time = NEW.start_time
      AND b.id <> NEW.id
      AND b.status IN ('pending','confirmed')
      AND NOT (b.status = 'pending' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at < now());
    IF group_count >= svc.capacity THEN
      RAISE EXCEPTION 'This class is full';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_slots(_service_id uuid, _date date)
 RETURNS TABLE(staff_id uuid, staff_name text, start_time time without time zone, end_time time without time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT * FROM public.services WHERE id = _service_id AND is_active
  ), st AS (
    SELECT stf.id, COALESCE(u.full_name, 'Staff') AS full_name
    FROM public.staff stf
    JOIN s ON stf.business_id = s.business_id
    JOIN public.staff_services ss ON ss.staff_id = stf.id AND ss.service_id = s.id
    LEFT JOIN public.users u ON u.id = stf.user_id
    WHERE stf.is_active
  ), slots AS (
    SELECT st.id AS staff_id, st.full_name,
           gs::time AS start_time,
           (gs + make_interval(mins => s.duration_minutes))::time AS end_time
    FROM s
    CROSS JOIN st
    JOIN public.availability a ON a.staff_id = st.id AND a.day_of_week = EXTRACT(DOW FROM _date)::int
    CROSS JOIN LATERAL generate_series(
      _date + a.start_time,
      _date + a.end_time - make_interval(mins => s.duration_minutes),
      make_interval(mins => s.duration_minutes)
    ) AS gs
  )
  SELECT sl.staff_id, sl.full_name, sl.start_time, sl.end_time
  FROM slots sl, s
  WHERE NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.staff_id = sl.staff_id
        AND b.booking_date = _date
        AND b.status IN ('pending','confirmed')
        AND NOT (b.status = 'pending' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at < now())
        AND b.start_time < sl.end_time
        AND b.end_time > sl.start_time
        AND NOT (s.service_type = 'group_class' AND b.service_id = s.id
                 AND b.start_time = sl.start_time AND b.end_time = sl.end_time)
    )
    AND (
      s.service_type <> 'group_class'
      OR (SELECT count(*) FROM public.bookings b2
          WHERE b2.service_id = s.id AND b2.staff_id = sl.staff_id
            AND b2.booking_date = _date AND b2.start_time = sl.start_time
            AND b2.status IN ('pending','confirmed')
            AND NOT (b2.status = 'pending' AND b2.hold_expires_at IS NOT NULL AND b2.hold_expires_at < now())
          ) < s.capacity
    )
    AND (_date > CURRENT_DATE OR (_date = CURRENT_DATE AND sl.start_time > CURRENT_TIME))
  ORDER BY sl.start_time, sl.full_name;
$function$;

-- 8. Owner bookings list gains payment info
DROP FUNCTION IF EXISTS public.get_business_bookings(uuid);
CREATE FUNCTION public.get_business_bookings(_business_id uuid)
 RETURNS TABLE(id uuid, client_name text, client_email text, service_name text, staff_name text, booking_date date, start_time time without time zone, end_time time without time zone, status text, notes text, requires_payment boolean, payment_status text, payment_amount numeric, payment_currency text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT b.id, COALESCE(cu.full_name, 'Client'), COALESCE(cu.email, ''), sv.name,
         COALESCE(su.full_name, 'Staff'), b.booking_date, b.start_time, b.end_time, b.status, b.notes,
         sv.requires_payment, p.status, p.amount, p.currency
  FROM public.bookings b
  JOIN public.services sv ON sv.id = b.service_id
  JOIN public.staff st ON st.id = b.staff_id
  LEFT JOIN public.clients c ON c.id = b.client_id
  LEFT JOIN public.users cu ON cu.id = c.user_id
  LEFT JOIN public.users su ON su.id = st.user_id
  LEFT JOIN LATERAL (
    SELECT pp.status, pp.amount, pp.currency FROM public.payments pp
    WHERE pp.booking_id = b.id ORDER BY pp.created_at DESC LIMIT 1
  ) p ON true
  WHERE b.business_id = _business_id
    AND (app_private.owns_business(_business_id) OR app_private.is_platform_admin())
  ORDER BY b.booking_date DESC, b.start_time DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_business_bookings(uuid) TO authenticated;