import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { dispatchBookingNotifications } from "@/lib/notifications.functions";
import { DashboardNav } from "@/components/DashboardNav";
import { useMyBusiness } from "@/lib/useMyBusiness";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  formatMoney,
  type PaymentStatus,
} from "@/lib/payments/types";

export const Route = createFileRoute("/_authenticated/dashboard/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings | Fitly Business Platform" },
      { name: "description", content: "Review and update the bookings for your business." },
      { property: "og:title", content: "Bookings | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Review and update the bookings for your business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingsPage,
});

const TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
  cancelled: [],
  completed: [],
  no_show: [],
};

const STATUS_STYLE: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-success",
  completed: "text-primary",
  cancelled: "text-destructive",
  no_show: "text-muted-foreground",
};

function BookingsPage() {
  const qc = useQueryClient();
  const { data: business } = useMyBusiness();
  const [error, setError] = useState<string | null>(null);
  const dispatchEmails = useServerFn(dispatchBookingNotifications);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["business-bookings", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_business_bookings", {
        _business_id: business!.id,
      });
      if (e) throw e;
      return data;
    },
  });

  // Drains anything still queued (e.g. a notification whose dispatch call was
  // interrupted by a page refresh). Each row is claimed once server-side.
  const drained = useRef(false);
  useEffect(() => {
    if (drained.current) return;
    drained.current = true;
    dispatchEmails({ data: undefined }).catch((e) =>
      console.error("[booking-email] dispatch failed", e),
    );
  }, [dispatchEmails]);


  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error: e } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (e) throw e;
    },
    onSuccess: async () => {
      setError(null);
      // Sends the client confirmation email once, when the booking becomes confirmed.
      try {
        await dispatchEmails({ data: undefined });
      } catch (notifyError) {
        console.error("[booking-email] dispatch failed", notifyError);
      }
      qc.invalidateQueries({ queryKey: ["business-bookings"] });
    },
    onError: (e: Error) => setError(e.message),
  });


  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <DashboardNav />
      <h1 className="mt-6 text-2xl font-semibold text-foreground">Bookings</h1>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading...</p>}
        {bookings?.length === 0 && <p className="ui-card block p-6 text-center text-sm text-muted-foreground">No bookings yet. Share your booking link to get started.</p>}
        {bookings?.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-3 ui-card p-4"
          >
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {b.client_name} · {b.service_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.staff_name} · {b.booking_date} · {String(b.start_time).slice(0, 5)}–
                {String(b.end_time).slice(0, 5)}
              </p>
              <span
                className={`ui-badge mt-2 ${STATUS_STYLE[b.status] ?? "text-muted-foreground"}`}
              >
                {b.status.replace("_", " ")}
              </span>
              {b.requires_payment && (
                <span
                  className={`ui-badge mt-2 ml-2 ${
                    PAYMENT_STATUS_STYLE[(b.payment_status ?? "pending") as PaymentStatus]
                  }`}
                >
                  {PAYMENT_STATUS_LABEL[(b.payment_status ?? "pending") as PaymentStatus]} ·{" "}
                  {formatMoney(b.payment_amount === null ? null : Number(b.payment_amount), b.payment_currency)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(TRANSITIONS[b.status] ?? []).map((next) => (
                <button
                  key={next}
                  onClick={() => setStatus.mutate({ id: b.id, status: next })}
                  className="ui-btn-secondary text-xs"
                >
                  {next.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
