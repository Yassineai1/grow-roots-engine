import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/book/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Book a session | Fitly" },
      { name: "description", content: "Browse services and book an available time slot." },
      { property: "og:title", content: "Book a session | Fitly" },
      {
        property: "og:description",
        content: "Browse services and book an available time slot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookPage,
});

type PendingBooking = {
  slug: string;
  serviceId: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
};

const STORAGE_KEY = "pending-booking";
const input =
  "rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function BookPage() {
  const { slug } = useParams({ from: "/book/$slug" });
  const navigate = useNavigate();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    service: string;
    staff: string;
    date: string;
    time: string;
    status: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: business } = useQuery({
    queryKey: ["public-business", slug],
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_public_business", { _slug: slug });
      if (e) throw e;
      return data?.[0] ?? null;
    },
  });

  const { data: services } = useQuery({
    queryKey: ["public-services", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_public_services", {
        _business_id: business!.id,
      });
      if (e) throw e;
      return data ?? [];
    },
  });

  const { data: slots, refetch: refetchSlots } = useQuery({
    queryKey: ["slots", serviceId, date],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_available_slots", {
        _service_id: serviceId!,
        _date: date,
      });
      if (e) throw e;
      return data ?? [];
    },
  });

  async function book(pending: PendingBooking) {
    setError(null);
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
        navigate({ to: "/login", search: { redirect: `/book/${slug}` } });
        return;
      }

      // Make sure the signed-in user has a profile row.
      await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          full_name: (user.user_metadata?.["full_name"] as string) ?? "",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

      // Find or create the client record for this business.
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("business_id", business!.id)
        .eq("user_id", user.id)
        .maybeSingle();

      let clientId = existingClient?.id;
      if (!clientId) {
        const { data: created, error: clientError } = await supabase
          .from("clients")
          .insert({ business_id: business!.id, user_id: user.id })
          .select("id")
          .single();
        if (clientError) throw clientError;
        clientId = created.id;
      }

      const { error: bookingError } = await supabase.from("bookings").insert({
        business_id: business!.id,
        client_id: clientId,
        service_id: pending.serviceId,
        staff_id: pending.staffId,
        booking_date: pending.date,
        start_time: pending.startTime,
        end_time: pending.endTime,
      });
      if (bookingError) throw bookingError;

      const service = services?.find((s) => s.id === pending.serviceId);
      const staffName =
        slots?.find((s) => s.staff_id === pending.staffId)?.staff_name ?? "Staff";
      setConfirmation({
        service: service?.name ?? "Service",
        staff: staffName,
        date: pending.date,
        time: `${pending.startTime.slice(0, 5)}–${pending.endTime.slice(0, 5)}`,
        status: "pending",
      });
      refetchSlots();
    } catch (e) {
      setError((e as Error).message);
      refetchSlots();
    } finally {
      setBusy(false);
    }
  }

  // Resume a booking that was interrupted by sign-in.
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw || !business?.id) return;
    const pending = JSON.parse(raw) as PendingBooking;
    if (pending.slug !== slug) return;
    sessionStorage.removeItem(STORAGE_KEY);
    setServiceId(pending.serviceId);
    setDate(pending.date);
    void book(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  if (business === null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-muted-foreground">Business not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">{business?.name ?? "Loading..."}</h1>
      {business?.business_type && (
        <p className="text-sm text-muted-foreground">{business.business_type}</p>
      )}

      {confirmation ? (
        <div className="mt-6 rounded-md border border-border p-4">
          <h2 className="text-lg font-medium text-foreground">Booking requested</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Business: {business?.name}</li>
            <li>Service: {confirmation.service}</li>
            <li>Staff: {confirmation.staff}</li>
            <li>Date: {confirmation.date}</li>
            <li>Time: {confirmation.time}</li>
            <li>Status: {confirmation.status}</li>
          </ul>
          <button
            onClick={() => setConfirmation(null)}
            className="mt-4 rounded-md border border-input px-3 py-1.5 text-sm"
          >
            Book another
          </button>
        </div>
      ) : (
        <>
          <h2 className="mt-6 text-lg font-medium text-foreground">Services</h2>
          <div className="mt-2 space-y-2">
            {services?.length === 0 && (
              <p className="text-sm text-muted-foreground">No services available yet.</p>
            )}
            {services?.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={`block w-full rounded-md border p-3 text-left text-sm ${
                  serviceId === s.id ? "border-primary" : "border-border"
                }`}
              >
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.service_type === "group_class" ? "Group class" : "One-on-one"} ·{" "}
                  {s.duration_minutes} min · {s.price}
                </span>
                {s.description && (
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                )}
              </button>
            ))}
          </div>

          {serviceId && (
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <label className="text-sm text-foreground" htmlFor="booking-date">
                  Date
                </label>
                <input
                  id="booking-date"
                  type="date"
                  min={today()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={input}
                />
              </div>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {slots?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No available slots on this day.</p>
                )}
                {slots?.map((slot) => (
                  <button
                    key={`${slot.staff_id}-${slot.start_time}`}
                    disabled={busy}
                    onClick={() =>
                      book({
                        slug,
                        serviceId,
                        staffId: slot.staff_id,
                        date,
                        startTime: String(slot.start_time),
                        endTime: String(slot.end_time),
                      })
                    }
                    className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-60"
                  >
                    {String(slot.start_time).slice(0, 5)} · {slot.staff_name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
