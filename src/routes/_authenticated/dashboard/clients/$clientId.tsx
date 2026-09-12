import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { EmptyState, LoadingState, PageHeader } from "@/components/DashboardUI";
import { Button } from "@/components/ui/button";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  formatMoney,
  type PaymentStatus,
} from "@/lib/payments/types";

export const Route = createFileRoute("/_authenticated/dashboard/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Client details | Fitly Business Platform" },
      { name: "description", content: "Booking and payment history for one of your clients." },
      { property: "og:title", content: "Client details | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Booking and payment history for one of your clients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientDetailPage,
});

const STATUS_STYLE: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-success",
  completed: "text-primary",
  cancelled: "text-destructive",
  no_show: "text-muted-foreground",
};

function ClientDetailPage() {
  const { clientId } = Route.useParams();

  const { data: client, isLoading } = useQuery({
    queryKey: ["business-client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_business_client", { _client_id: clientId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["business-client-bookings", clientId],
    enabled: !!client,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_business_client_bookings", {
        _client_id: clientId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <DashboardNav>
        <LoadingState label="Loading client" />
      </DashboardNav>
    );
  }

  if (!client) {
    return (
      <DashboardNav>
        <EmptyState
          icon={Users}
          title="Client not found"
          description="This client does not belong to your business."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard/clients">Back to clients</Link>
            </Button>
          }
        />
      </DashboardNav>
    );
  }

  return (
    <DashboardNav>
      <Link
        to="/dashboard/clients"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </Link>

      <PageHeader
        eyebrow="Client"
        title={client.full_name || "Unnamed client"}
        description={`${client.booking_count} booking${Number(client.booking_count) === 1 ? "" : "s"} with your business.`}
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="ui-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Email</p>
          <p className="mt-1 truncate text-sm text-foreground">{client.email || "—"}</p>
        </div>
        <div className="ui-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Phone</p>
          <p className="mt-1 truncate text-sm text-foreground">{client.phone || "—"}</p>
        </div>
        <div className="ui-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Total bookings</p>
          <p className="mt-1 text-sm text-foreground">{client.booking_count}</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Booking history</h2>
        <p className="text-sm text-muted-foreground">Previous and upcoming bookings for this client.</p>

        {bookingsLoading ? (
          <LoadingState label="Loading bookings" />
        ) : !bookings || bookings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={CalendarDays}
              title="No bookings yet"
              description="Bookings made by this client will appear here."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {bookings.map((booking) => (
              <li key={booking.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{booking.service_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {booking.booking_date} · {String(booking.start_time).slice(0, 5)}–
                    {String(booking.end_time).slice(0, 5)}
                    {booking.staff_name ? ` · ${booking.staff_name}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <span
                    className={`text-sm font-medium capitalize ${STATUS_STYLE[booking.status] ?? "text-muted-foreground"}`}
                  >
                    {booking.status.replace("_", " ")}
                  </span>
                  {booking.payment_status && (
                    <span
                      className={`text-sm ${PAYMENT_STATUS_STYLE[booking.payment_status as PaymentStatus] ?? "text-muted-foreground"}`}
                    >
                      {PAYMENT_STATUS_LABEL[booking.payment_status as PaymentStatus] ??
                        booking.payment_status}
                      {booking.payment_amount != null &&
                        ` · ${formatMoney(booking.payment_amount, booking.payment_currency)}`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardNav>
  );
}
