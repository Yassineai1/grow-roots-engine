-- ============ SERVICES ============
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  service_type text NOT NULL CHECK (service_type IN ('one_on_one','group_class')),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (service_type <> 'one_on_one' OR capacity = 1)
);
CREATE INDEX services_business_idx ON public.services(business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- ============ STAFF <-> SERVICES ============
CREATE TABLE public.staff_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, service_id)
);
CREATE INDEX staff_services_service_idx ON public.staff_services(service_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_services TO authenticated;
GRANT ALL ON public.staff_services TO service_role;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;

-- ============ AVAILABILITY ============
CREATE TABLE public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX availability_staff_idx ON public.availability(staff_id, day_of_week);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX bookings_staff_date_idx ON public.bookings(staff_id, booking_date);
CREATE INDEX bookings_business_idx ON public.bookings(business_id);
CREATE INDEX bookings_client_idx ON public.bookings(client_id);
CREATE UNIQUE INDEX bookings_no_client_duplicate_idx
  ON public.bookings(client_id, service_id, booking_date, start_time)
  WHERE status IN ('pending','confirmed');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ============ RLS HELPERS ============
CREATE OR REPLACE FUNCTION app_private.staff_business(_staff_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.staff WHERE id = _staff_id;
$$;

CREATE OR REPLACE FUNCTION app_private.owns_staff(_staff_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s JOIN public.businesses b ON b.id = s.business_id
    WHERE s.id = _staff_id AND b.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_self_staff(_staff_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = _staff_id AND s.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION app_private.is_business_staff(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.business_id = _business_id AND s.user_id = auth.uid() AND s.is_active
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_own_client(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION app_private.service_business(_service_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.services WHERE id = _service_id;
$$;

REVOKE ALL ON FUNCTION app_private.staff_business(uuid), app_private.owns_staff(uuid),
  app_private.is_self_staff(uuid), app_private.is_business_staff(uuid),
  app_private.is_own_client(uuid), app_private.service_business(uuid) FROM public;
GRANT EXECUTE ON FUNCTION app_private.staff_business(uuid), app_private.owns_staff(uuid),
  app_private.is_self_staff(uuid), app_private.is_business_staff(uuid),
  app_private.is_own_client(uuid), app_private.service_business(uuid) TO authenticated, service_role;

-- ============ POLICIES: services ============
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated
  USING (app_private.owns_business(business_id) OR app_private.is_business_staff(business_id) OR app_private.is_platform_admin());
CREATE POLICY services_insert ON public.services FOR INSERT TO authenticated
  WITH CHECK (app_private.owns_business(business_id));
CREATE POLICY services_update ON public.services FOR UPDATE TO authenticated
  USING (app_private.owns_business(business_id)) WITH CHECK (app_private.owns_business(business_id));
CREATE POLICY services_delete ON public.services FOR DELETE TO authenticated
  USING (app_private.owns_business(business_id));

-- ============ POLICIES: staff_services ============
CREATE POLICY staff_services_select ON public.staff_services FOR SELECT TO authenticated
  USING (app_private.owns_staff(staff_id) OR app_private.is_self_staff(staff_id) OR app_private.is_platform_admin());
CREATE POLICY staff_services_insert ON public.staff_services FOR INSERT TO authenticated
  WITH CHECK (app_private.owns_staff(staff_id));
CREATE POLICY staff_services_update ON public.staff_services FOR UPDATE TO authenticated
  USING (app_private.owns_staff(staff_id)) WITH CHECK (app_private.owns_staff(staff_id));
CREATE POLICY staff_services_delete ON public.staff_services FOR DELETE TO authenticated
  USING (app_private.owns_staff(staff_id));

-- ============ POLICIES: availability ============
CREATE POLICY availability_select ON public.availability FOR SELECT TO authenticated
  USING (app_private.owns_staff(staff_id) OR app_private.is_self_staff(staff_id) OR app_private.is_platform_admin());
CREATE POLICY availability_insert ON public.availability FOR INSERT TO authenticated
  WITH CHECK (app_private.owns_staff(staff_id) OR app_private.is_self_staff(staff_id));
CREATE POLICY availability_update ON public.availability FOR UPDATE TO authenticated
  USING (app_private.owns_staff(staff_id) OR app_private.is_self_staff(staff_id))
  WITH CHECK (app_private.owns_staff(staff_id) OR app_private.is_self_staff(staff_id));
CREATE POLICY availability_delete ON public.availability FOR DELETE TO authenticated
  USING (app_private.owns_staff(staff_id) OR app_private.is_self_staff(staff_id));

-- ============ POLICIES: bookings ============
CREATE POLICY bookings_select ON public.bookings FOR SELECT TO authenticated
  USING (
    app_private.owns_business(business_id)
    OR app_private.is_business_staff(business_id)
    OR app_private.is_own_client(client_id)
    OR app_private.is_platform_admin()
  );
CREATE POLICY bookings_insert ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (app_private.owns_business(business_id) OR app_private.is_own_client(client_id));
CREATE POLICY bookings_update ON public.bookings FOR UPDATE TO authenticated
  USING (app_private.owns_business(business_id) OR app_private.is_own_client(client_id))
  WITH CHECK (app_private.owns_business(business_id) OR app_private.is_own_client(client_id));
CREATE POLICY bookings_delete ON public.bookings FOR DELETE TO authenticated
  USING (app_private.owns_business(business_id));

-- clients: allow an authenticated user to create their own client record for a business
CREATE POLICY clients_insert_self ON public.clients FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY clients_select_self ON public.clients FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ BOOKING VALIDATION ============
CREATE OR REPLACE FUNCTION public.validate_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      AND b.status IN ('pending','confirmed');
    IF group_count >= svc.capacity THEN
      RAISE EXCEPTION 'This class is full';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_validate
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_booking();

-- staff_services must connect same-business rows
CREATE OR REPLACE FUNCTION public.validate_staff_service()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT business_id FROM public.staff WHERE id = NEW.staff_id)
     IS DISTINCT FROM (SELECT business_id FROM public.services WHERE id = NEW.service_id) THEN
    RAISE EXCEPTION 'Staff and service must belong to the same business';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_services_validate
BEFORE INSERT OR UPDATE ON public.staff_services
FOR EACH ROW EXECUTE FUNCTION public.validate_staff_service();

-- ============ PUBLIC READ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.get_public_business(_slug text)
RETURNS TABLE (id uuid, name text, business_type text, slug text, logo_url text, brand_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.business_type, b.slug, b.logo_url, b.brand_color
  FROM public.businesses b WHERE b.slug = _slug;
$$;

CREATE OR REPLACE FUNCTION public.get_public_services(_business_id uuid)
RETURNS TABLE (id uuid, name text, description text, service_type text, duration_minutes integer, price numeric, capacity integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.description, s.service_type, s.duration_minutes, s.price, s.capacity
  FROM public.services s WHERE s.business_id = _business_id AND s.is_active
  ORDER BY s.name;
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots(_service_id uuid, _date date)
RETURNS TABLE (staff_id uuid, staff_name text, start_time time, end_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
            AND b2.status IN ('pending','confirmed')) < s.capacity
    )
    AND (_date > CURRENT_DATE OR (_date = CURRENT_DATE AND sl.start_time > CURRENT_TIME))
  ORDER BY sl.start_time, sl.full_name;
$$;

REVOKE ALL ON FUNCTION public.get_public_business(text), public.get_public_services(uuid), public.get_available_slots(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_business(text), public.get_public_services(uuid), public.get_available_slots(uuid, date) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_booking(), public.validate_staff_service() FROM public;