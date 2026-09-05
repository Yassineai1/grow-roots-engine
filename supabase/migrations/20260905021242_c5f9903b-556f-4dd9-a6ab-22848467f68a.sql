CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'booking_confirmed_client','booking_created_owner','booking_cancelled_owner')),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_event_uidx
  ON public.notification_outbox(booking_id, event_type);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON public.notification_outbox(status, created_at);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notification_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.queue_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_name text;
  v_owner_email text;
  v_client_email text;
  v_client_name text;
  v_service_name text;
  v_staff_name text;
  v_client_user uuid;
  v_payload jsonb;
BEGIN
  SELECT bu.name, ou.email INTO v_business_name, v_owner_email
  FROM public.businesses bu
  LEFT JOIN public.users ou ON ou.id = bu.owner_id
  WHERE bu.id = NEW.business_id;

  SELECT COALESCE(cu.email, ''), COALESCE(cu.full_name, 'Client'), c.user_id
    INTO v_client_email, v_client_name, v_client_user
  FROM public.clients c
  LEFT JOIN public.users cu ON cu.id = c.user_id
  WHERE c.id = NEW.client_id;

  SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;

  SELECT COALESCE(su.full_name, 'Staff') INTO v_staff_name
  FROM public.staff st LEFT JOIN public.users su ON su.id = st.user_id
  WHERE st.id = NEW.staff_id;

  v_payload := jsonb_build_object(
    'business_name', v_business_name,
    'client_name', v_client_name,
    'client_email', v_client_email,
    'service_name', v_service_name,
    'staff_name', v_staff_name,
    'booking_date', NEW.booking_date,
    'start_time', NEW.start_time,
    'end_time', NEW.end_time,
    'status', NEW.status
  );

  IF TG_OP = 'INSERT' AND NEW.status IN ('pending','confirmed') AND v_owner_email IS NOT NULL THEN
    INSERT INTO public.notification_outbox (event_type, booking_id, business_id, recipient_email, subject, payload)
    VALUES ('booking_created_owner', NEW.id, NEW.business_id, v_owner_email,
      'New booking: ' || COALESCE(v_service_name,'Service') || ' on ' || NEW.booking_date::text, v_payload)
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  END IF;

  IF NEW.status = 'confirmed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed')
     AND v_client_email <> '' THEN
    INSERT INTO public.notification_outbox (event_type, booking_id, business_id, recipient_email, subject, payload)
    VALUES ('booking_confirmed_client', NEW.id, NEW.business_id, v_client_email,
      'Your booking at ' || COALESCE(v_business_name,'the business') || ' is confirmed', v_payload)
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND v_owner_email IS NOT NULL
     AND v_client_user IS NOT NULL
     AND COALESCE(current_setting('app.cancelled_by_client', true), '') = NEW.id::text THEN
    INSERT INTO public.notification_outbox (event_type, booking_id, business_id, recipient_email, subject, payload)
    VALUES ('booking_cancelled_owner', NEW.id, NEW.business_id, v_owner_email,
      'Booking cancelled: ' || COALESCE(v_service_name,'Service') || ' on ' || NEW.booking_date::text
        || ' by ' || v_client_name, v_payload)
    ON CONFLICT (booking_id, event_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_notifications ON public.bookings;
CREATE TRIGGER booking_notifications
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.queue_booking_notifications();

REVOKE ALL ON FUNCTION public.queue_booking_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_booking_notifications() FROM anon;
REVOKE ALL ON FUNCTION public.queue_booking_notifications() FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_my_bookings()
RETURNS TABLE(
  id uuid, business_name text, service_name text, staff_name text,
  booking_date date, start_time time without time zone, end_time time without time zone,
  status text, payment_status text, payment_amount numeric, payment_currency text,
  can_cancel boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT b.id, bu.name, sv.name, COALESCE(su.full_name, 'Staff'),
         b.booking_date, b.start_time, b.end_time, b.status,
         p.status, p.amount, p.currency,
         (b.status IN ('pending','confirmed')
          AND (b.booking_date + b.start_time) > ((now() AT TIME ZONE 'UTC') + interval '2 hours'))
  FROM public.bookings b
  JOIN public.clients c ON c.id = b.client_id
  JOIN public.businesses bu ON bu.id = b.business_id
  JOIN public.services sv ON sv.id = b.service_id
  JOIN public.staff st ON st.id = b.staff_id
  LEFT JOIN public.users su ON su.id = st.user_id
  LEFT JOIN LATERAL (
    SELECT pp.status, pp.amount, pp.currency FROM public.payments pp
    WHERE pp.booking_id = b.id ORDER BY pp.created_at DESC LIMIT 1
  ) p ON true
  WHERE c.user_id = auth.uid()
  ORDER BY b.booking_date DESC, b.start_time DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_bookings() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings() TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_own_booking(_booking_id uuid)
RETURNS TABLE(status text, payment_status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  v_pay text;
BEGIN
  SELECT bk.* INTO b
  FROM public.bookings bk
  JOIN public.clients c ON c.id = bk.client_id
  WHERE bk.id = _booking_id AND c.user_id = auth.uid()
  FOR UPDATE OF bk;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF b.status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled.';
  END IF;

  IF (b.booking_date + b.start_time) <= ((now() AT TIME ZONE 'UTC') + interval '2 hours') THEN
    RAISE EXCEPTION 'Cancellation window has passed — please contact the business directly';
  END IF;

  PERFORM set_config('app.cancelled_by_client', _booking_id::text, true);
  UPDATE public.bookings SET status = 'cancelled' WHERE id = _booking_id;

  SELECT pp.status INTO v_pay FROM public.payments pp
  WHERE pp.booking_id = _booking_id ORDER BY pp.created_at DESC LIMIT 1;

  RETURN QUERY SELECT 'cancelled'::text, v_pay;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid) TO authenticated;