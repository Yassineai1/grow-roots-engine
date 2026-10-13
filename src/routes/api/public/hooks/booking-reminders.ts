import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runBookingReminders } from "@/lib/notifications.server";

export const Route = createFileRoute("/api/public/hooks/booking-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);

        if (authError) {
          return authError;
        }

        try {
          const result = await runBookingReminders();
          return Response.json({ ok: true, ...result });
        } catch {
          return Response.json(
            { ok: false, error: "Failed to process booking reminders" },
            { status: 500 },
          );
        }
      },
    },
  },
});
