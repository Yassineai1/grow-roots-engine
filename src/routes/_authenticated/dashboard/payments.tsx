import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { useMyBusiness } from "@/lib/useMyBusiness";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  formatMoney,
  type PaymentStatus,
} from "@/lib/payments/types";

export const Route = createFileRoute("/_authenticated/dashboard/payments")({
  head: () => ({
    meta: [
      { title: "Payments | Fitly Business Platform" },
      { name: "description", content: "Review the payments clients made for your bookings." },
      { property: "og:title", content: "Payments | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Review the payments clients made for your bookings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: business } = useMyBusiness();

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, booking_id, amount, currency, status, created_at")
        .eq("business_id", business!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings } = useQuery({
    queryKey: ["business-bookings", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_business_bookings", {
        _business_id: business!.id,
      });
      if (error) throw error;
      return data;
    },
  });

  const byBooking = new Map((bookings ?? []).map((b) => [b.id, b]));

  const now = new Date();
  const inThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const monthly = (payments ?? []).filter((p) => inThisMonth(p.created_at));
  const revenue = monthly
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const refunded = monthly
    .filter((p) => p.status === "refunded" || p.status === "partially_refunded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const currency = payments?.[0]?.currency ?? "MAD";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <DashboardNav />
      <h1 className="mt-6 text-2xl font-semibold text-foreground">Payments</h1>

      <section className="ui-card mt-4 flex flex-wrap gap-8 p-5">
        <div>
          <p className="text-xs text-muted-foreground">Revenue this month (paid only)</p>
          <p className="text-2xl font-semibold text-primary">{formatMoney(revenue, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Refunded this month</p>
          <p className="text-2xl font-semibold text-muted-foreground">
            {formatMoney(refunded, currency)}
          </p>
        </div>
      </section>

      <div className="mt-4 space-y-2">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading...
          </p>
        )}
        {payments?.length === 0 && (
          <p className="ui-card block p-6 text-center text-sm text-muted-foreground">
            No payments yet. Payments appear here once a client pays for a service that requires
            payment.
          </p>
        )}
        {payments?.map((p) => {
          const b = p.booking_id ? byBooking.get(p.booking_id) : undefined;
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 ui-card p-4"
            >
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {b?.client_name ?? "Client"} · {b?.service_name ?? "Booking"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString()}
                  {b ? ` · booked ${b.booking_date} ${String(b.start_time).slice(0, 5)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-foreground">
                  {formatMoney(Number(p.amount), p.currency)}
                </span>
                <span className={`ui-badge ${PAYMENT_STATUS_STYLE[p.status as PaymentStatus]}`}>
                  {PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
