import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Drains queued booking emails. Signed-in callers only; it takes no input and
 * exposes nothing, so repeated frontend calls are harmless — each queued
 * notification is claimed and processed exactly once server-side.
 */
export const dispatchBookingNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { dispatchPendingBookingEmails } = await import("@/lib/notifications.server");
    return dispatchPendingBookingEmails();
  });
