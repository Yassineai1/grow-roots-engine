ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_event_type_check;
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_event_type_check CHECK (event_type IN (
  'booking_confirmed_client','booking_created_owner','booking_cancelled_owner','booking_reminder_client'));

CREATE OR REPLACE FUNCTION public.queue_booking_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.notification_outbox (event_type, booking_id, business_id, recipient_email, subject, payload)
  SELECT 'booking_reminder_client', b.id, b.business_id, cu.email,
    'Reminder: your booking at ' || bu.name || ' is tomorrow',
    jsonb_build_object(
      'business_name', bu.name,
      'client_name', COALESCE(cu.full_name, 'Client'),
      'service_name', s.name,
      'staff_name', COALESCE(su.full_name, 'Staff'),
      'booking_date', b.booking_date,
      'start_time', b.start_time,
      'end_time', b.end_time,
      'status', b.status)
  FROM public.bookings b
  JOIN public.businesses bu ON bu.id = b.business_id
  JOIN public.clients c ON c.id = b.client_id
  JOIN public.users cu ON cu.id = c.user_id
  JOIN public.services s ON s.id = b.service_id
  LEFT JOIN public.staff st ON st.id = b.staff_id
  LEFT JOIN public.users su ON su.id = st.user_id
  WHERE b.status = 'confirmed'
    AND b.reminder_sent = false
    AND COALESCE(cu.email, '') <> ''
    AND ((b.booking_date + b.start_time) AT TIME ZONE 'Africa/Casablanca')
        BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
  ON CONFLICT (booking_id, event_type) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_booking_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_booking_reminders() FROM anon;
REVOKE ALL ON FUNCTION public.queue_booking_reminders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_booking_reminders() TO service_role;