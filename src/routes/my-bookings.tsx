import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { dispatchBookingNotifications } from "@/lib/notifications.functions";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  formatMoney,
  type PaymentStatus,
} from "@/lib/payments/types";

export const Route = createFileRoute("/my-bookings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My bookings | Fitly" },
      { name: "description", content: "View and cancel the sessions you have booked." },
      { property: "og:title", content: "My bookings | Fitly" },
      {
        property: "og:description",
        content: "View and cancel the sessions you have booked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login", search: { redirect: "/my-bookings" } });
  },
  component: MyBookingsPage,
});

const STATUS_STYLE: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-success",
  completed: "text-primary",
  cancelled: "text-destructive",
  no_show: "text-muted-foreground",
};

function MyBookingsPage() {
  const qc = useQueryClient();
  const dispatchEmails = useServerFn(dispatchBookingNotifications);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_my_bookings");
      if (e) throw e;
      return data ?? [];
    },
  });

  async function cancel(id: string, paymentStatus: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: e } = await supabase.rpc("cancel_own_booking", { _booking_id: id });
    setBusy(false);
    setConfirmId(null);
    if (e) {
      setError(e.message);
      return;
    }
    setNotice(
      paymentStatus === "paid"
        ? "Your booking is cancelled. Refunds (if applicable) are handled directly by the business."
        : "Your booking is cancelled.",
    );
    await qc.invalidateQueries({ queryKey: ["my-bookings"] });
    // Fire the queued owner cancellation notification; the server de-duplicates it.
    try {
      await dispatchEmails({ data: undefined });
    } catch (notifyError) {
      console.error("[booking-email] dispatch failed", notifyError);
    }

  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">My bookings</h1>
        <Link to="/" className="text-sm text-muted-foreground underline">
          Find a business
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p className="mt-3 text-sm text-success">{notice}</p>}

      <div className="mt-6 space-y-2">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading...
          </p>
        )}
        {bookings?.length === 0 && (
          <p className="ui-card block p-6 text-center text-sm text-muted-foreground">
            You have no bookings yet.
          </p>
        )}
        {bookings?.map((b) => {
          const withinWindow =
            (b.status === "pending" || b.status === "confirmed") && !b.can_cancel;
          return (
            <div key={b.id} className="ui-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium text-foreground">
                    {b.business_name} · {b.service_name}
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
                  {b.payment_status && (
                    <span
                      className={`ui-badge mt-2 ml-2 ${
                        PAYMENT_STATUS_STYLE[b.payment_status as PaymentStatus]
                      }`}
                    >
                      {PAYMENT_STATUS_LABEL[b.payment_status as PaymentStatus]} ·{" "}
                      {formatMoney(
                        b.payment_amount === null ? null : Number(b.payment_amount),
                        b.payment_currency,
                      )}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  {b.can_cancel && confirmId !== b.id && (
                    <button onClick={() => setConfirmId(b.id)} className="ui-btn-secondary text-xs">
                      Cancel booking
                    </button>
                  )}
                  {withinWindow && (
                    <p className="max-w-[16rem] text-xs text-muted-foreground">
                      Cancellation window has passed — please contact the business directly
                    </p>
                  )}
                </div>
              </div>

              {confirmId === b.id && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-sm text-foreground">
                    Cancel this booking? This cannot be undone.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => cancel(b.id, b.payment_status)}
                      className="ui-btn text-xs"
                    >
                      {busy ? "Cancelling..." : "Yes, cancel"}
                    </button>
                    <button onClick={() => setConfirmId(null)} className="ui-btn-secondary text-xs">
                      Keep booking
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
