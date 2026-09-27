/**
 * Server-only transactional email delivery for booking events.
 *
 * Events are queued by a database trigger into `public.notification_outbox`
 * (one row per booking + event type, so refreshes or repeated frontend
 * requests can never produce a duplicate). This module drains that queue.
 *
 * Delivery goes through Resend (via the connector gateway). Credentials are
 * read from `process.env` inside this server-only module and never reach the
 * client. The verified sender domain is getfitlyapp.com (Resend), with the
 * central FROM_EMAIL constant below used by every booking email.
 */

export type BookingEmailType =
  | "booking_confirmed_client"
  | "booking_created_owner"
  | "booking_cancelled_owner"
  | "booking_reminder_client";

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
    case "booking_reminder_client":
      return [
        `Hi ${p.client_name ?? "there"},`,
        ``,
        `This is a reminder that your booking at ${p.business_name ?? "the business"} is tomorrow.`,
        ``,
        `Business: ${p.business_name ?? ""}`,
        `Service: ${p.service_name ?? ""}`,
        `Date: ${p.booking_date ?? ""}`,
        `Time: ${hhmm(p.start_time)}–${hhmm(p.end_time)}`.concat(staff),
        ``,
        `Need to change plans? You can view or cancel this booking from Fitly (cancellations are allowed up to 2 hours before the start time): ${APP_URL}/my-bookings`,
      ].join("\n");
  }
}

const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend/emails";
// Resend test sender until getfitlyapp.com is verified in the Resend account.
const FROM_EMAIL = "Fitly <notifications@getfitlyapp.com>";

/**
 * Sends one booking email through Resend (via the connector gateway).
 * Throws on failure so the outbox row is retried instead of marked sent.
 */
export async function sendBookingEmail(
  type: BookingEmailType,
  email: { to: string; subject: string; payload: BookingEmailPayload },
): Promise<{ delivered: boolean }> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const resendApiKey = process.env["RESEND_API_KEY"];
  if (!lovableApiKey || !resendApiKey) {
    throw new Error("Email credentials are not configured (LOVABLE_API_KEY / RESEND_API_KEY).");
  }

  const body = renderBookingEmail(type, email.payload);
  const response = await fetch(RESEND_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendApiKey,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email.to],
      subject: email.subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[booking-email] Resend send failed [${response.status}]: ${errorBody}`);
    throw new Error(`Resend send failed [${response.status}]: ${errorBody}`);
  }

  console.log(`[booking-email] sent ${type} to ${email.to}`);
  return { delivered: true };
}


/** Drains pending outbox rows. Safe to call repeatedly: each row is claimed once. */
export async function dispatchPendingBookingEmails(limit = 20) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows } = await supabaseAdmin
    .from("notification_outbox")
    .select("id, event_type, booking_id, recipient_email, subject, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const row of rows ?? []) {
    // Claim the row first so a concurrent dispatch cannot send it twice.
    // The attempts check is an optimistic lock: only one racing update wins.
    const { data: claimed } = await supabaseAdmin
      .from("notification_outbox")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("attempts", row.attempts ?? 0)
      .select("id");
    if (!claimed || claimed.length === 0) continue;


    // Reminders: re-check the booking right before sending so a booking that was
    // cancelled or already reminded never gets an email.
    if (row.event_type === "booking_reminder_client") {
      const { data: b } = await supabaseAdmin
        .from("bookings")
        .select("status, reminder_sent")
        .eq("id", row.booking_id)
        .maybeSingle();
      if (!b || b.status !== "confirmed" || b.reminder_sent) {
        await supabaseAdmin
          .from("notification_outbox")
          .update({ status: "failed", last_error: "Skipped — booking no longer eligible for a reminder." })
          .eq("id", row.id);
        continue;
      }
    }

    try {
      const result = await sendBookingEmail(row.event_type as BookingEmailType, {
        to: row.recipient_email,
        subject: row.subject,
        payload: (row.payload ?? {}) as BookingEmailPayload,
      });
      // Only claim delivery when a provider actually accepted the message.
      await supabaseAdmin
        .from("notification_outbox")
        .update(
          result.delivered
            ? { status: "sent", sent_at: new Date().toISOString(), last_error: null }
            : { status: "failed", last_error: "No email provider configured — logged only." },
        )
        .eq("id", row.id);
      if (result.delivered && row.event_type === "booking_reminder_client") {
        await supabaseAdmin.from("bookings").update({ reminder_sent: true }).eq("id", row.booking_id);
      }
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

/** Queues reminders for confirmed bookings starting in ~24h, then sends pending emails. */
export async function runBookingReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: queued, error } = await supabaseAdmin.rpc("queue_booking_reminders");
  if (error) throw new Error(error.message);
  const { processed } = await dispatchPendingBookingEmails(50);
  console.log(`[booking-reminders] queued ${queued ?? 0}, processed ${processed}`);
  return { queued: queued ?? 0, processed };
}
