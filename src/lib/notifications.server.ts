import { Resend } from "resend";

// Initialize Resend with the API key from .env
const resendApiKey = process.env["RESEND_API_KEY"];
const resend = resendApiKey && resendApiKey !== "not-configured" ? new Resend(resendApiKey) : null;

const APP_URL = process.env["VITE_APP_URL"] || "http://localhost:8080";
const FROM_EMAIL = "notifications@getfitlyapp.com"; // Ensure this domain is verified in Resend

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    console.warn("Resend API key not configured. Email not sent to:", to);
    return { success: false, error: "Resend not configured" };
  }

  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email via Resend:", error);
    return { success: false, error };
  }
}

// Function to dispatch pending emails from the outbox table
export async function dispatchPendingBookingEmails() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // Fetch pending emails (limit to 10 at a time to avoid timeouts)
  const { data: pending, error } = await supabaseAdmin
    .from("notification_outbox")
    .select("*")
    .eq("status", "pending")
    .limit(10);

  if (error || !pending) {
    console.error("Failed to fetch pending emails:", error);
    return;
  }

  for (const item of pending) {
    const payload = item.payload as any;
    
    // Simple HTML template (you can customize this)
    const html = `
      <h2>Booking Notification</h2>
      <p><strong>Event:</strong> ${item.event_type}</p>
      <p><strong>Service:</strong> ${payload.service_name}</p>
      <p><strong>Date:</strong> ${payload.booking_date}</p>
      <p><strong>Time:</strong> ${payload.start_time} - ${payload.end_time}</p>
      <br/>
      <p><a href="${APP_URL}">View Dashboard</a></p>
    `;

    const result = await sendEmail({
      to: item.recipient_email,
      subject: item.subject,
      html,
    });

    if (result.success) {
      await supabaseAdmin
        .from("notification_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", item.id);
    } else {
      await supabaseAdmin
        .from("notification_outbox")
        .update({ 
          status: "failed", 
          attempts: (item.attempts || 0) + 1,
          last_error: String(result.error)
        })
        .eq("id", item.id);
    }
  }
}

// Function for 24h booking reminders
export async function runBookingReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // This is a simplified version. In a real app, you'd query bookings happening in ~24 hours
  // and queue an email for them.
  console.log("Running booking reminders check...");
  
  // Example: queue a reminder for confirmed bookings tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("*, clients(*, users(*)), businesses(*)")
    .eq("booking_date", tomorrowStr)
    .eq("status", "confirmed")
    .eq("reminder_sent", false);

  if (bookings) {
    for (const booking of bookings) {
      // Logic to send reminder
      // (Needs client email and business name from the joined tables)
      
      // Mark as sent
      await supabaseAdmin
        .from("bookings")
        .update({ reminder_sent: true })
        .eq("id", booking.id);
    }
  }
}
