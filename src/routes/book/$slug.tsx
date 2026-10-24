import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  startBookingCheckout,
  resolveMockPayment,
  retryBookingPayment,
  cancelBookingCheckout,
} from "@/lib/payments.functions";
import { dispatchBookingNotifications } from "@/lib/notifications.functions";
import { getBrandingImageUrls } from "@/lib/branding.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/payments/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book/$slug")({
  component: PublicBookingPage,
});

const STORAGE_KEY = "pending_booking";

function formatLocalTime(timeStr: string, timezone: string): string {
  try {
    const [hours = '00', minutes = '00'] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(date);
  } catch {
    return timeStr.slice(0, 5);
  }
}

function PublicBookingPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    service: string;
    staff: string;
    date: string;
    time: string;
    status: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
    serviceId: string;
    staffId: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [payFailed, setPayFailed] = useState(false);
  
  const bookingRef = useRef<HTMLDivElement | null>(null);
  const servicesRef = useRef<HTMLDivElement | null>(null);
  const contactRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLElement | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<{
    staffId: string;
    staffName: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const startCheckout = useServerFn(startBookingCheckout);
  const resolvePayment = useServerFn(resolveMockPayment);
  const retryPayment = useServerFn(retryBookingPayment);
  const cancelCheckout = useServerFn(cancelBookingCheckout);
  const dispatchEmails = useServerFn(dispatchBookingNotifications);

  const { data: business } = useQuery({
    queryKey: ["public-business", slug],
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_public_business", { _slug: slug });
      if (e) throw e;
      return data?.[0] ?? null;
    },
  });

  const brandingImages = useServerFn(getBrandingImageUrls);
  const { data: images } = useQuery({
    queryKey: ["public-branding-images", slug],
    queryFn: () => brandingImages({ data: { slug } }),
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

  // Removed unused variables to fix TS errors
  const scrollTo = (ref: React.RefObject<HTMLDivElement | HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {business && (
        <section className="relative overflow-hidden border-b border-border/60 bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="flex flex-col items-start gap-6">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{business.name}</h1>
              <p className="max-w-xl text-base text-muted-foreground">{business.description || "Book your next session with us."}</p>
              <button className="ui-btn mt-7" onClick={() => scrollTo(bookingRef)}>
                Book a session
              </button>
            </div>
          </div>
        </section>
      )}

      <div ref={bookingRef} />
      <section ref={servicesRef} className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        {checkout ? (
          <div className="ui-card mx-auto mt-6 max-w-2xl p-6">
            <h2 className="text-xl font-semibold text-foreground">Payment required</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
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
                <p className="mt-4 text-xs text-warning">Test mode — no real money is taken.</p>
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
                      }
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  You will be redirected to Stripe to complete your payment securely.
                </p>
                <button
                  disabled={busy}
                  className="ui-btn"
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const res = await startCheckout({
                        data: {
                          businessId: business!.id,
                          serviceId: checkout.serviceId,
                          staffId: checkout.staffId,
                          date: checkout.date,
                          startTime: checkout.startTime,
                          endTime: checkout.endTime,
                        },
                      });
                      if (res.status === "checkout" && res.redirectUrl) {
                        window.location.href = res.redirectUrl;
                      } else {
                        setError("Failed to create Stripe checkout session.");
                      }
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Pay with Stripe
                </button>
                <button
                  disabled={busy}
                  className="ui-btn-secondary mt-2"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await cancelCheckout({ data: { paymentId: checkout.paymentId } });
                    } finally {
                      setCheckout(null);
                      setPayFailed(false);
                      setBusy(false);
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : confirmation ? (
          <div className="ui-card mx-auto mt-6 max-w-2xl p-6">
            <h2 className="text-xl font-semibold text-foreground">Booking requested</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>Business: {business?.name}</li>
              <li>Service: {confirmation.service}</li>
              <li>Staff: {confirmation.staff}</li>
              <li>Date: {confirmation.date}</li>
              <li>Time: {confirmation.time}</li>
              <li>Status: {confirmation.status}</li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => setConfirmation(null)} className="ui-btn-secondary">
                Book another
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-10">
            <h2 className="text-2xl font-semibold tracking-tight">Services</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services?.map((s) => (
                <div key={s.id} className="ui-card p-5">
                  <h3 className="font-medium">{s.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  <p className="mt-2 text-sm font-medium">{formatMoney(s.price, "MAD")}</p>
                  <p className="text-xs text-muted-foreground">{s.duration_minutes} min</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
