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
    -- Privileged actors: the business owner, a platform admin, or a trusted
    -- server-side service_role call (used only by the app's secure server
    -- payment functions, which never expose the key to clients).
    is_owner := app_private.owns_business(NEW.business_id)
                OR app_private.is_platform_admin()
                OR COALESCE(current_setting('role', true), '') = 'service_role'
                OR COALESCE(auth.role(), '') = 'service_role';
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
$function$