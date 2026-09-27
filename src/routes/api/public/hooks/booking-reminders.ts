import { createFileRoute } from "@tanstack/react-router";
import { runBookingReminders } from "@/lib/notifications.server";

export const Route = createFileRoute("/api/public/hooks/booking-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!key || request.headers.get("apikey") !== key) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runBookingReminders();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
