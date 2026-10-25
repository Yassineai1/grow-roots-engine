import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Copy, CreditCard, ExternalLink, Link2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { EmptyState, LoadingState, MetricCard, PageHeader } from "@/components/DashboardUI";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/payments/types";
import { useMyBusiness } from "@/lib/useMyBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({ meta: [
    { title: "Owner Dashboard | Fitly" },
    { name: "description", content: "Manage your business, bookings, services, staff, and payments in Fitly." },
    { property: "og:title", content: "Owner Dashboard | Fitly" },
    { property: "og:description", content: "Manage your business, bookings, services, staff, and payments in Fitly." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: business, isLoading: businessLoading } = useMyBusiness();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!businessLoading && !business) navigate({ to: "/onboarding" });
  }, [businessLoading, business, navigate]);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["dashboard-overview", business?.id],
    enabled: !!business,
    queryFn: async () => {
      if (!business) return null;
      const [bookingsResult, servicesResult, staffResult, paymentsResult] = await Promise.all([
        supabase.rpc("get_business_bookings", { _business_id: business.id }),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("is_active", true),
        supabase.rpc("get_business_staff", { _business_id: business.id }),
        supabase.from("payments").select("amount, currency, status, created_at").eq("business_id", business.id),
      ]);
      if (bookingsResult.error) throw bookingsResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (staffResult.error) throw staffResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      return {
        bookings: bookingsResult.data ?? [],
        activeServices: servicesResult.count ?? 0,
        staff: (staffResult.data ?? []).filter((member) => member.is_active).length,
        payments: paymentsResult.data ?? [],
      };
    },
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const allUpcoming = useMemo(() => (overview?.bookings ?? [])
    .filter((b) => `${b.booking_date}T${String(b.end_time)}` >= now.toISOString().slice(0, 19) && !["cancelled", "completed", "no_show"].includes(b.status))
    .sort((a, b) => `${a.booking_date}${a.start_time}`.localeCompare(`${b.booking_date}${b.start_time}`)), [overview?.bookings]);
  const upcoming = allUpcoming.slice(0, 5);
  const todayCount = overview?.bookings.filter((b) => b.booking_date === today && b.status !== "cancelled").length ?? 0;
  const paidThisMonth = overview?.payments.filter((p) => p.status === "paid" && new Date(p.created_at) >= monthStart) ?? [];
  const revenue = paidThisMonth.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const currency = paidThisMonth[0]?.currency ?? overview?.payments[0]?.currency ?? "MAD";
  const bookingPath = business?.slug ? `/book/${business.slug}` : "";
  const bookingUrl = typeof window !== "undefined" && bookingPath ? `${window.location.origin}${bookingPath}` : bookingPath;

  async function copyBookingLink() {
    if (!bookingUrl) return;
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <DashboardNav>
      <PageHeader
        eyebrow="Owner workspace"
        title={businessLoading ? "Your dashboard" : `Good to see you, ${business?.name ?? ""}`}
        description="A live view of your schedule, team, services, and payments."
        action={business?.slug ? <Button asChild><a href={bookingPath} target="_blank" rel="noreferrer"><ExternalLink />View booking page</a></Button> : undefined}
      />

      {isLoading || businessLoading ? <LoadingState label="Loading your business" /> : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Bookings today" value={todayCount} icon={CalendarDays} hint="Excluding cancellations" />
            <MetricCard label="Upcoming" value={allUpcoming.length} icon={ClipboardList} hint="Next scheduled bookings" />
            <MetricCard label="Active services" value={overview?.activeServices ?? 0} icon={Link2} hint="Available to clients" />
            <MetricCard label="Revenue this month" value={formatMoney(revenue, currency)} icon={CreditCard} hint="Paid transactions only" />
          </section>

          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
            <section className="min-w-0">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><h2 className="text-lg font-semibold text-foreground">Upcoming bookings</h2><p className="text-sm text-muted-foreground">Your next confirmed or pending visits.</p></div>
                <Link to="/dashboard/bookings" className="shrink-0 text-sm font-medium text-primary hover:underline">View all</Link>
              </div>
              {upcoming.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No upcoming bookings" description="Share your booking page so clients can reserve a time." />
              ) : (
                <div className="divide-y divide-border border-y border-border">
                  {upcoming.map((booking) => (
                    <div key={booking.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{booking.client_name}</p>
                        <p className="truncate text-sm text-muted-foreground">{booking.service_name} with {booking.staff_name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium text-foreground">{booking.booking_date === today ? "Today" : booking.booking_date}</p>
                        <p className="text-xs text-muted-foreground">{String(booking.start_time).slice(0, 5)} · <span className="capitalize">{booking.status.replace("_", " ")}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-foreground">Quick actions</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button asChild variant="outline"><Link to="/dashboard/services">Services</Link></Button>
                  <Button asChild variant="outline"><Link to="/dashboard/staff"><Users />Staff</Link></Button>
                  <Button asChild variant="outline"><Link to="/dashboard/bookings">Bookings</Link></Button>
                  <Button asChild variant="outline"><Link to="/dashboard/settings">Booking link</Link></Button>
                </div>
              </section>
              {bookingUrl && <section className="ui-card p-5">
                <div className="flex items-center gap-2 text-primary"><Link2 className="size-4" /><p className="text-xs font-semibold uppercase">Public booking link</p></div>
                <p className="mt-3 truncate text-sm text-muted-foreground">{bookingUrl}</p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={copyBookingLink} className="flex-1"><Copy />{copied ? "Copied" : "Copy link"}</Button>
                  <Button asChild variant="outline" size="icon"><a href={bookingPath} target="_blank" rel="noreferrer" aria-label="Open booking page"><ExternalLink /></a></Button>
                </div>
              </section>}
            </aside>
          </div>
        </>
      )}
    </DashboardNav>
  );
}