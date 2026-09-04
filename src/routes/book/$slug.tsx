import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelBookingCheckout,
  resolveMockPayment,
  retryBookingPayment,
  startBookingCheckout,
} from "@/lib/payments.functions";
import { formatMoney } from "@/lib/payments/types";

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
  "ui-input";

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
  const [checkout, setCheckout] = useState<{
    paymentId: string;
    bookingId: string;
    amount: number;
    currency: string;
    mode: string;
    service: string;
    staff: string;
    date: string;
    time: string;
  } | null>(null);
  const [payFailed, setPayFailed] = useState(false);

  const startCheckout = useServerFn(startBookingCheckout);
  const resolvePayment = useServerFn(resolveMockPayment);
  const retryPayment = useServerFn(retryBookingPayment);
  const cancelCheckout = useServerFn(cancelBookingCheckout);

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

  const { data: paymentAvailability } = useQuery({
    queryKey: ["payment-availability", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_public_payment_availability", {
        _business_id: business!.id,
      });
      if (e) throw e;
      return data?.[0] ?? { payment_configured: false, provider: "cmi" };
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

      const chosen = services?.find((s) => s.id === pending.serviceId);
      if (chosen?.requires_payment) {
        if (!paymentAvailability?.payment_configured) {
          setError(
            "Online payment is not yet available for this business. Please contact the business directly.",
          );
          return;
        }
        const res = await startCheckout({
          data: {
            businessId: business!.id,
            serviceId: pending.serviceId,
            staffId: pending.staffId,
            date: pending.date,
            startTime: pending.startTime,
            endTime: pending.endTime,
          },
        });
        if (res.status === "unavailable") {
          setError(
            "Online payment is not yet available for this business. Please contact the business directly.",
          );
          return;
        }
        const staffLabel =
          slots?.find((s) => s.staff_id === pending.staffId)?.staff_name ?? "Staff";
        setPayFailed(false);
        setCheckout({
          paymentId: res.paymentId,
          bookingId: res.bookingId,
          amount: res.amount,
          currency: res.currency,
          mode: res.mode,
          service: chosen.name,
          staff: staffLabel,
          date: pending.date,
          time: `${pending.startTime.slice(0, 5)}–${pending.endTime.slice(0, 5)}`,
        });
        refetchSlots();
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

      {checkout ? (
        <div className="ui-card mt-6 p-5">
          <h2 className="text-lg font-medium text-foreground">Payment required</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Service: {checkout.service}</li>
            <li>Staff: {checkout.staff}</li>
            <li>
              Date: {checkout.date} · {checkout.time}
            </li>
            <li>Amount: {formatMoney(checkout.amount, checkout.currency)}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Your slot is held for 15 minutes while you complete payment.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {checkout.mode === "test" ? (
            <>
              <p className="mt-4 text-xs text-warning">
                Test mode — no real money is taken.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  className="ui-btn"
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const res = await resolvePayment({
                        data: { paymentId: checkout.paymentId, outcome: "success" },
                      });
                      if (res.status === "paid") {
                        setCheckout(null);
                        setConfirmation({
                          service: checkout.service,
                          staff: checkout.staff,
                          date: checkout.date,
                          time: checkout.time,
                          status: "confirmed · paid",
                        });
                      }
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                      refetchSlots();
                    }
                  }}
                >
                  Simulate successful payment
                </button>
                <button
                  disabled={busy}
                  className="ui-btn-secondary"
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await resolvePayment({
                        data: { paymentId: checkout.paymentId, outcome: "failure" },
                      });
                      setPayFailed(true);
                      setError("Payment failed. Your booking is not confirmed.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Simulate failed payment
                </button>
                {payFailed && (
                  <button
                    disabled={busy}
                    className="ui-btn"
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        const res = await retryPayment({
                          data: { bookingId: checkout.bookingId },
                        });
                        if (res.status === "checkout") {
                          setCheckout({ ...checkout, paymentId: res.paymentId });
                          setPayFailed(false);
                        }
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Retry payment
                  </button>
                )}
                <button
                  disabled={busy}
                  className="ui-btn-secondary"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await cancelCheckout({ data: { paymentId: checkout.paymentId } });
                    } finally {
                      setCheckout(null);
                      setPayFailed(false);
                      setBusy(false);
                      refetchSlots();
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Online payment is not yet available for this business. Please contact the business
              directly.
            </p>
          )}
        </div>
      ) : confirmation ? (
        <div className="ui-card mt-6 p-5">
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
            className="ui-btn-secondary mt-4"
          >
            Book another
          </button>
        </div>
      ) : (
        <>
          <h2 className="mt-6 text-lg font-medium text-foreground">Services</h2>
          <div className="mt-2 space-y-2">
            {services?.length === 0 && (
              <p className="ui-card w-full p-6 text-center text-sm text-muted-foreground">No services available yet.</p>
            )}
            {services?.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={`ui-card block w-full p-4 text-left text-sm transition-colors ${
                  serviceId === s.id
                    ? "border-primary ring-1 ring-primary/40"
                    : "hover:bg-accent"
                }`}
              >
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.service_type === "group_class" ? "Group class" : "One-on-one"} ·{" "}
                  {s.duration_minutes} min · {s.price}
                </span>
                {s.requires_payment && (
                  <span className="ui-badge mt-1 text-primary">
                    Payment required · {formatMoney(Number(s.price), "MAD")}
                  </span>
                )}
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
              {services?.find((s) => s.id === serviceId)?.requires_payment &&
                !paymentAvailability?.payment_configured && (
                  <p className="mt-2 text-sm text-warning">
                    Online payment is not yet available for this business. Please contact the
                    business directly.
                  </p>
                )}
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {slots?.length === 0 && (
                  <p className="ui-card w-full p-6 text-center text-sm text-muted-foreground">No available slots on this day.</p>
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
                    className="ui-btn-secondary"
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
