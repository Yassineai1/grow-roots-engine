import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelBookingCheckout,
  resolveMockPayment,
  retryBookingPayment,
  startBookingCheckout,
} from "@/lib/payments.functions";
import { dispatchBookingNotifications } from "@/lib/notifications.functions";
import { getBrandingImageUrls } from "@/lib/branding.functions";
import { formatMoney } from "@/lib/payments/types";
import { normalizeWhatsappNumber } from "@/lib/utils";
import { AssistantChat } from "@/components/AssistantChat";

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
const input = "ui-input";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function initials(name?: string | null) {
  if (!name) return "•";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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

  const { data: slots, refetch: refetchSlotsOnly } = useQuery({
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

  const upcomingDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const { data: dayAvailability, refetch: refetchDays } = useQuery({
    queryKey: ["slot-days", serviceId, upcomingDays[0]],
    enabled: !!serviceId,
    queryFn: async () => {
      const results = await Promise.all(
        upcomingDays.map(async (d) => {
          const { data } = await supabase.rpc("get_available_slots", {
            _service_id: serviceId!,
            _date: d,
          });
          return [d, (data?.length ?? 0) > 0] as const;
        }),
      );
      return Object.fromEntries(results) as Record<string, boolean>;
    },
  });

  function refetchSlots() {
    setSelectedSlot(null);
    void refetchSlotsOnly();
    void refetchDays();
  }

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

      // Owner "new booking" notification; the server de-duplicates it.
      // Awaited (not fire-and-forget) so a failure surfaces in the console
      // instead of silently leaving the queued notification unprocessed.
      try {
        await dispatchEmails({ data: undefined });
      } catch (notifyError) {
        console.error("[booking-email] dispatch failed", notifyError);
      }

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

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    setMenuOpen(false);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (business === null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-muted-foreground">Business not found.</p>
      </main>
    );
  }

  const typeLabel = business?.business_type
    ? business.business_type.replace(/_/g, " ")
    : null;
  const serviceCount = services?.length ?? 0;
  const hasPaidServices = !!services?.some((s) => s.requires_payment);
  const groupClasses = services?.filter((s) => s.service_type === "group_class").length ?? 0;
  const whatsappDigits = normalizeWhatsappNumber(business?.whatsapp);
  const waLink = (text: string) =>
    `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(text)}`;
  const waGeneralMessage = "Bonjour, je souhaite avoir plus d'informations sur vos services.";
  const waServiceMessage = (serviceName: string) =>
    `Bonjour, je suis intéressé(e) par ${serviceName} chez ${business?.name ?? "votre établissement"}. Pouvez-vous me donner plus d'informations ?`;

  return (
    <div
      className="min-h-screen bg-background"
      style={
        {
          ...(business?.brand_color ? { "--primary": business.brand_color } : {}),
          ...(business?.accent_color ? { "--accent": business.accent_color } : {}),
        } as React.CSSProperties
      }
    >
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {images?.logoUrl ? (
              <img
                src={images.logoUrl}
                alt={`${business?.name ?? "Business"} logo`}
                className="h-10 w-10 shrink-0 rounded-xl border border-border object-contain"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                {initials(business?.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                {business?.name ?? "Loading…"}
              </p>
              {typeLabel && (
                <p className="truncate text-xs capitalize text-muted-foreground">{typeLabel}</p>
              )}
            </div>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <button
              onClick={() => scrollTo(servicesRef)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Services
            </button>
            <button
              onClick={() => scrollTo(contactRef)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </button>
            <button className="ui-btn" onClick={() => scrollTo(bookingRef)}>
              Book now
            </button>
          </nav>
          <button
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="ui-btn-secondary md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="text-base leading-none">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-border/60 bg-background px-4 py-3 md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-2">
              <button
                className="ui-btn-secondary w-full"
                onClick={() => scrollTo(servicesRef)}
              >
                Services
              </button>
              <button className="ui-btn-secondary w-full" onClick={() => scrollTo(contactRef)}>
                Contact
              </button>
              <button className="ui-btn w-full" onClick={() => scrollTo(bookingRef)}>
                Book now
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        {images?.coverUrl ? (
          <>
            <img
              src={images.coverUrl}
              alt={`${business?.name ?? "Business"} cover`}
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/85 to-background/50" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_15%_0%,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent_60%)]" />
        )}
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
          <div className="max-w-2xl">
            {typeLabel && (
              <span className="ui-badge text-primary capitalize">{typeLabel}</span>
            )}
            <h1 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {business?.name ?? "Loading…"}
            </h1>
            {business?.description ? (
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {business.description}
              </p>
            ) : (
              serviceCount > 0 && (
                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Choose a session, pick a time that suits you, and book online in seconds.
                </p>
              )
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button className="ui-btn px-6 py-3 text-base" onClick={() => scrollTo(bookingRef)}>
                Book now
              </button>
              {serviceCount > 0 && (
                <button
                  className="ui-btn-secondary px-6 py-3 text-base"
                  onClick={() => scrollTo(servicesRef)}
                >
                  View services
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Highlights — only real data */}
      {serviceCount > 0 && (
        <section className="border-y border-border/60 bg-card/40">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-4 py-8 sm:px-6 md:grid-cols-4">
            <Stat value={String(serviceCount)} label={serviceCount === 1 ? "Service" : "Services"} />
            {groupClasses > 0 && <Stat value={String(groupClasses)} label="Group classes" />}
            {typeLabel && <Stat value={typeLabel} label="Speciality" capitalize />}
            {hasPaidServices && paymentAvailability?.payment_configured && (
              <Stat value="Online" label="Secure payment" />
            )}
          </div>
        </section>
      )}

      {/* About */}
      {business?.description && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            {(images?.coverUrl || images?.logoUrl) && (
              <div className="overflow-hidden rounded-3xl border border-border">
                <img
                  src={(images.coverUrl ?? images.logoUrl)!}
                  alt={`${business.name} `}
                  className="h-64 w-full object-cover sm:h-80"
                />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                About
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {business.name}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                {business.description}
              </p>
              <button className="ui-btn mt-7" onClick={() => scrollTo(bookingRef)}>
                Book a session
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Booking experience (services + slots + payment) — existing flow */}
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
              {whatsappDigits && (
                <a
                  href={waLink(
                    `Bonjour, je viens de réserver ${confirmation.service} chez ${business?.name ?? "votre établissement"} le ${confirmation.date} à ${confirmation.time}.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-btn-secondary"
                >
                  Contacter sur WhatsApp
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="pt-8 sm:pt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Our services
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Choose your session
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {serviceCount === 0 && (
                <p className="ui-card w-full p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                  No services available yet.
                </p>
              )}
              {services?.map((s) => {
                const selected = serviceId === s.id;
                return (
                  <article
                    key={s.id}
                    className={`ui-card flex flex-col p-5 transition-all duration-200 ${
                      selected
                        ? "border-primary ring-1 ring-primary/40"
                        : "hover:-translate-y-0.5 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-lg font-semibold text-foreground">{s.name}</h3>
                      <span className="shrink-0 text-lg font-semibold text-primary">
                        {formatMoney(Number(s.price), "MAD")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {s.service_type === "group_class" ? "Group class" : "One-on-one"} ·{" "}
                      {s.duration_minutes} min
                    </p>
                    {s.description && (
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    {s.requires_payment && (
                      <span className="ui-badge mt-3 self-start text-warning">
                        Payment required
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setServiceId(s.id);
                        setSelectedSlot(null);
                        setError(null);
                        setTimeout(
                          () => pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                          50,
                        );
                      }}
                      className={`${selected ? "ui-btn-secondary" : "ui-btn"} mt-5 w-full`}
                    >
                      {selected ? "Selected" : "Book"}
                    </button>
                    {whatsappDigits && (
                      <a
                        href={waLink(waServiceMessage(s.name))}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.02s.87 2.34.99 2.5c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
                        </svg>
                        Contacter sur WhatsApp
                      </a>
                    )}
                  </article>
                );
              })}
            </div>

            {serviceId && (() => {
              const svc = services?.find((s) => s.id === serviceId);
              const step = selectedSlot ? 4 : date ? 3 : 2;
              const steps = ["Session", "Date", "Time", "Confirm"];
              return (
              <section ref={pickerRef} className="ui-card mt-8 scroll-mt-24 p-5 sm:p-6">
                <ol className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  {steps.map((label, i) => (
                    <li
                      key={label}
                      className={`ui-badge ${i + 1 <= step ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {i + 1}. {label}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-sm text-muted-foreground">
                  Selected session: <span className="font-semibold text-foreground">{svc?.name}</span>
                </p>

                <h3 className="mt-5 text-lg font-semibold text-foreground">Choose a date</h3>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                  {upcomingDays.map((d) => {
                    const has = dayAvailability?.[d];
                    const active = d === date;
                    const dt = new Date(`${d}T00:00:00`);
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={has === false}
                        onClick={() => {
                          setDate(d);
                          setSelectedSlot(null);
                          setError(null);
                        }}
                        className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-foreground hover:border-primary/50"
                        }`}
                      >
                        <span>{dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
                        <span className="text-base font-semibold">{dt.getDate()}</span>
                        <span>{dt.toLocaleDateString(undefined, { month: "short" })}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:max-w-sm">
                  <label className="text-xs text-muted-foreground" htmlFor="booking-date">
                    Or pick another date
                  </label>
                  <input
                    id="booking-date"
                    type="date"
                    min={today()}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSelectedSlot(null);
                    }}
                    className={input}
                  />
                </div>
                {svc?.requires_payment && !paymentAvailability?.payment_configured && (
                  <p className="mt-3 text-sm text-warning">
                    Online payment is not yet available for this business. Please contact the
                    business directly.
                  </p>
                )}

                <h3 className="mt-6 text-lg font-semibold text-foreground">Choose a time</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {slots === undefined && (
                    <p className="text-sm text-muted-foreground">Loading available times…</p>
                  )}
                  {slots?.length === 0 && (
                    <p className="w-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No available times on this day. Please choose another date.
                    </p>
                  )}
                  {slots?.map((slot) => {
                    const active =
                      selectedSlot?.staffId === slot.staff_id &&
                      selectedSlot?.startTime === String(slot.start_time);
                    return (
                      <button
                        key={`${slot.staff_id}-${slot.start_time}`}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          setSelectedSlot({
                            staffId: slot.staff_id,
                            staffName: slot.staff_name,
                            startTime: String(slot.start_time),
                            endTime: String(slot.end_time),
                          });
                        }}
                        className={active ? "ui-btn" : "ui-btn-secondary"}
                      >
                        {String(slot.start_time).slice(0, 5)} · {slot.staff_name}
                      </button>
                    );
                  })}
                </div>

                {selectedSlot && svc && (
                  <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
                    <h3 className="text-lg font-semibold text-foreground">Booking summary</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Session</dt>
                      <dd className="text-foreground">{svc.name}</dd>
                      <dt className="text-muted-foreground">Coach</dt>
                      <dd className="text-foreground">{selectedSlot.staffName}</dd>
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="text-foreground">
                        {svc.service_type === "group_class" ? "Group class" : "One-on-one"}
                      </dd>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="text-foreground">{svc.duration_minutes} min</dd>
                      <dt className="text-muted-foreground">Price</dt>
                      <dd className="text-foreground">{formatMoney(Number(svc.price), "MAD")}</dd>
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="text-foreground">{date}</dd>
                      <dt className="text-muted-foreground">Time</dt>
                      <dd className="text-foreground">
                        {selectedSlot.startTime.slice(0, 5)}–{selectedSlot.endTime.slice(0, 5)}
                      </dd>
                    </dl>
                    <button
                      type="button"
                      disabled={busy || !date || !selectedSlot}
                      onClick={() =>
                        book({
                          slug,
                          serviceId,
                          staffId: selectedSlot.staffId,
                          date,
                          startTime: selectedSlot.startTime,
                          endTime: selectedSlot.endTime,
                        })
                      }
                      className="ui-btn mt-4 w-full"
                    >
                      {busy ? "Booking…" : "Confirm reservation"}
                    </button>
                  </div>
                )}
                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              </section>
              );
            })()}
          </>
        )}
      </section>

      {/* Conversion CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="ui-card overflow-hidden p-8 text-center sm:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ready to book your moment?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
            Pick a service and a time that works for you — confirmation arrives right away.
          </p>
          <button className="ui-btn mx-auto mt-7 px-6 py-3 text-base" onClick={() => scrollTo(bookingRef)}>
            Book now
          </button>
        </div>
      </section>

      {/* Contact */}
      {(business?.phone || business?.whatsapp) && (
        <section ref={contactRef} className="border-t border-border/60 bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Contact
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Get in touch
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {business?.phone && (
                <a
                  className="ui-card flex items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40"
                  href={`tel:${business.phone.replace(/\s/g, "")}`}
                >
                  <span className="text-sm text-muted-foreground">Phone</span>
                  <span className="truncate font-medium text-foreground">{business.phone}</span>
                </a>
              )}
              {business?.whatsapp && (
                <a
                  className="ui-card flex items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40"
                  target="_blank"
                  rel="noreferrer"
                  href={waLink(waGeneralMessage)}
                >
                  <span className="text-sm text-muted-foreground">WhatsApp</span>
                  <span className="truncate font-medium text-foreground">{business.whatsapp}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{business?.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {business?.phone && <span>{business.phone}</span>}
              {business?.whatsapp && <span>WhatsApp {business.whatsapp}</span>}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Powered by Fitly</p>
          </div>
          <button className="ui-btn w-full md:w-auto" onClick={() => scrollTo(bookingRef)}>
            Book now
          </button>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      {whatsappDigits && (
        <a
          href={waLink(waGeneralMessage)}
          target="_blank"
          rel="noreferrer"
          aria-label="Contacter sur WhatsApp"
          className="fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-success text-success-foreground shadow-lg transition-transform hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.02s.87 2.34.99 2.5c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
          </svg>
        </a>
      )}

      <AssistantChat
        businessSlug={slug}
        businessName={business?.name}
        onBookNow={() => scrollTo(servicesRef)}
      />
    </div>
  );
}

function Stat({
  value,
  label,
  capitalize,
}: {
  value: string;
  label: string;
  capitalize?: boolean;
}) {
  return (
    <div className="px-2 py-3 text-center md:px-4">
      <p
        className={`text-xl font-semibold text-foreground sm:text-2xl ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
