/**
 * Server-only transactional email delivery for booking events.
 *
 * Events are queued by a database trigger into `public.notification_outbox`
 * (one row per booking + event type, so refreshes or repeated frontend
 * requests can never produce a duplicate). This module drains that queue.
 *
 * NOTE: no transactional email provider is connected to this project yet.
 * `sendBookingEmail` therefore renders the real message and logs it instead of
 * delivering it. See the marked TODO below for the single place where the
 * provider API call must be wired in. Provider credentials must be read from
 * `process.env` inside this server-only module and never reach the client.
 */

export type BookingEmailType =
  | "booking_confirmed_client"
  | "booking_created_owner"
  | "booking_cancelled_owner";

export type BookingEmailPayload = {
  business_name?: string | null;
  client_name?: string | null;
  service_name?: string | null;
  staff_name?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
};

const APP_URL = "https://grow-roots-engine.lovable.app";

function hhmm(t?: string | null) {
  return t ? String(t).slice(0, 5) : "";
}

function whenLine(p: BookingEmailPayload) {
  return `${p.booking_date ?? ""} · ${hhmm(p.start_time)}–${hhmm(p.end_time)}`;
}

export function renderBookingEmail(type: BookingEmailType, p: BookingEmailPayload): string {
  const staff = p.staff_name ? `\nStaff: ${p.staff_name}` : "";
  switch (type) {
    case "booking_confirmed_client":
      return [
        `Hi ${p.client_name ?? "there"},`,
        ``,
        `Your booking at ${p.business_name ?? "the business"} is confirmed.`,
        ``,
        `Business: ${p.business_name ?? ""}`,
        `Service: ${p.service_name ?? ""}`,
        `Date: ${p.booking_date ?? ""}`,
        `Start: ${hhmm(p.start_time)}`,
        `End: ${hhmm(p.end_time)}`.concat(staff),
        ``,
        `You can view or cancel this booking any time from Fitly: ${APP_URL}/my-bookings`,
      ].join("\n");
    case "booking_created_owner":
      return [
        `You have a new booking.`,
        ``,
        `Client: ${p.client_name ?? ""}`,
        `Service: ${p.service_name ?? ""}`,
        `When: ${whenLine(p)}`.concat(staff),
        ``,
        `Manage it here: ${APP_URL}/dashboard/bookings`,
      ].join("\n");
    case "booking_cancelled_owner":
      return [
        `A client cancelled a booking.`,
        ``,
        `Client: ${p.client_name ?? ""}`,
        `Service: ${p.service_name ?? ""}`,
        `When: ${whenLine(p)}`.concat(staff),
      ].join("\n");
  }
}

/**
 * Sends one booking email.
 *
 * TODO(email-provider): connect the real transactional email provider here.
 * Replace the log below with the provider API call, e.g.
 *   await fetch(providerEndpoint, { headers: { Authorization: `Bearer ${process.env['EMAIL_API_KEY']}` }, ... })
 * Throw on failure so the outbox row is retried instead of marked sent.
 */
export async function sendBookingEmail(
  type: BookingEmailType,
  email: { to: string; subject: string; payload: BookingEmailPayload },
): Promise<{ delivered: boolean }> {
  const body = renderBookingEmail(type, email.payload);
  console.log(
    `[booking-email] event=${type} to=${email.to} subject="${email.subject}"\n${body}\n[booking-email] NOT DELIVERED — no email provider configured.`,
  );
  return { delivered: false };
}

/** Drains pending outbox rows. Safe to call repeatedly: each row is claimed once. */
export async function dispatchPendingBookingEmails(limit = 20) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows } = await supabaseAdmin
    .from("notification_outbox")
    .select("id, event_type, recipient_email, subject, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const row of rows ?? []) {
    // Claim the row first so a concurrent dispatch cannot send it twice.
    const { data: claimed } = await supabaseAdmin
      .from("notification_outbox")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      await sendBookingEmail(row.event_type as BookingEmailType, {
        to: row.recipient_email,
        subject: row.subject,
        payload: (row.payload ?? {}) as BookingEmailPayload,
      });
      await supabaseAdmin
        .from("notification_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      processed += 1;
    } catch (e) {
      await supabaseAdmin
        .from("notification_outbox")
        .update({ status: "pending", last_error: (e as Error).message })
        .eq("id", row.id);
    }
  }
  return { processed };
}
