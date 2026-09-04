import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentConfigStatus, PaymentMode } from "@/lib/payments/types";

const HOLD_MINUTES = 15;

type SecretRow = {
  merchant_id: string | null;
  store_key: string | null;
  mode: PaymentMode;
  payment_configured: boolean;
  provider: string;
};

/** Server-only: reads the private provider config. The store key never leaves this module. */
async function loadConfig(businessId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("get_business_payment_secrets", {
    _business_id: businessId,
  });
  const row = (data as SecretRow[] | null)?.[0];
  return {
    provider: (row?.provider ?? "cmi") as "cmi",
    merchantId: row?.merchant_id ?? null,
    storeKey: row?.store_key ?? null,
    mode: (row?.mode ?? "test") as PaymentMode,
    configured: row?.payment_configured ?? false,
  };
}

async function assertOwner(supabase: any, businessId: string) {
  const { data } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!data) throw new Error("Business not found.");
}

/** Owner-facing status. Never returns the store key. */
export const getPaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { businessId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.businessId);
    const cfg = await loadConfig(data.businessId);
    const status: PaymentConfigStatus = !cfg.configured ? "not_configured" : cfg.mode;
    return {
      provider: cfg.provider,
      status,
      mode: cfg.mode,
      merchantIdMasked: cfg.merchantId
        ? `${"*".repeat(Math.max(cfg.merchantId.length - 4, 0))}${cfg.merchantId.slice(-4)}`
        : null,
      storeKeySet: !!cfg.storeKey,
    };
  });

/** Owner saves credentials. The store key is write-only: it is never read back. */
export const savePaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { businessId: string; merchantId: string; storeKey: string; mode: PaymentMode }) => d)
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.businessId);
    if (data.mode !== "test" && data.mode !== "live") throw new Error("Invalid mode.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_business_payment_config", {
      _business_id: data.businessId,
      _merchant_id: data.merchantId.trim(),
      _store_key: data.storeKey.trim(),
      _mode: data.mode,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearPaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { businessId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("clear_business_payment_config", {
      _business_id: data.businessId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type CheckoutInput = {
  businessId: string;
  serviceId: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
};

/**
 * Creates a held (pending) booking plus a pending payment for a paid service,
 * then opens a provider checkout session. All validation — slot, capacity,
 * assignment, availability — is enforced server-side by the database triggers.
 */
export const startBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CheckoutInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPaymentProvider } = await import("@/lib/payments/provider.server");

    const { data: service } = await supabaseAdmin
      .from("services")
      .select("id, business_id, price, requires_payment, is_active")
      .eq("id", data.serviceId)
      .maybeSingle();
    if (!service || service.business_id !== data.businessId || !service.is_active) {
      throw new Error("Service not found.");
    }
    if (!service.requires_payment) throw new Error("This service does not require payment.");

    const cfg = await loadConfig(data.businessId);
    if (!cfg.configured) {
      return { status: "unavailable" as const };
    }

    // Ensure a profile + client record exists for the signed-in user.
    const { data: authUser } = await supabase.auth.getUser();
    await supabase.from("users").upsert(
      {
        id: userId,
        email: authUser.user?.email ?? "",
        full_name: (authUser.user?.user_metadata?.["full_name"] as string) ?? "",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("user_id", userId)
      .maybeSingle();
    let clientId = existingClient?.id;
    if (!clientId) {
      const { data: created, error: clientError } = await supabase
        .from("clients")
        .insert({ business_id: data.businessId, user_id: userId })
        .select("id")
        .single();
      if (clientError) throw new Error(clientError.message);
      clientId = created.id;
    }

    const holdExpires = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        business_id: data.businessId,
        client_id: clientId,
        service_id: data.serviceId,
        staff_id: data.staffId,
        booking_date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        hold_expires_at: holdExpires,
      })
      .select("id")
      .single();
    if (bookingError) throw new Error(bookingError.message);

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        booking_id: booking.id,
        business_id: data.businessId,
        client_id: clientId,
        amount: service.price,
        currency: "MAD",
        provider: cfg.provider,
        status: "pending",
      })
      .select("id, amount, currency")
      .single();
    if (paymentError) throw new Error(paymentError.message);

    const session = await getPaymentProvider(cfg.provider).createCheckout(
      {
        paymentId: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        description: "Booking",
      },
      cfg,
    );
    await supabaseAdmin
      .from("payments")
      .update({ provider_payment_id: session.providerPaymentId })
      .eq("id", payment.id);

    return {
      status: "checkout" as const,
      checkoutKind: session.kind,
      redirectUrl: session.redirectUrl ?? null,
      paymentId: payment.id,
      bookingId: booking.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      mode: cfg.mode,
      holdExpiresAt: holdExpires,
    };
  });

/** Creates a fresh pending payment for an existing held booking (retry after failure). */
export const retryBookingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bookingId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPaymentProvider } = await import("@/lib/payments/provider.server");

    // RLS: the caller must own this booking as a client (or own the business).
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, business_id, client_id, service_id, status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!booking || booking.status !== "pending") throw new Error("Booking is no longer pending.");

    const cfg = await loadConfig(booking.business_id);
    if (!cfg.configured) return { status: "unavailable" as const };

    const { data: service } = await supabaseAdmin
      .from("services")
      .select("price")
      .eq("id", booking.service_id)
      .single();

    const holdExpires = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    await supabaseAdmin
      .from("bookings")
      .update({ hold_expires_at: holdExpires })
      .eq("id", booking.id)
      .eq("status", "pending");

    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .insert({
        booking_id: booking.id,
        business_id: booking.business_id,
        client_id: booking.client_id,
        amount: service?.price ?? 0,
        currency: "MAD",
        provider: cfg.provider,
        status: "pending",
      })
      .select("id, amount, currency")
      .single();
    if (error) throw new Error(error.message);

    const session = await getPaymentProvider(cfg.provider).createCheckout(
      {
        paymentId: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        description: "Booking",
      },
      cfg,
    );
    await supabaseAdmin
      .from("payments")
      .update({ provider_payment_id: session.providerPaymentId })
      .eq("id", payment.id);

    return {
      status: "checkout" as const,
      checkoutKind: session.kind,
      paymentId: payment.id,
      bookingId: booking.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      mode: cfg.mode,
      holdExpiresAt: holdExpires,
    };
  });

/**
 * MOCK ONLY — stands in for the provider's server-to-server result callback.
 * It is refused unless the business is in test mode, and it is idempotent: a
 * repeated result never creates a second payment nor re-confirms a booking.
 */
export const resolveMockPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string; outcome: "success" | "failure" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // RLS restricts this read to the paying client (or the owning business).
    const { data: payment } = await supabase
      .from("payments")
      .select("id, booking_id, business_id, status")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found.");

    const cfg = await loadConfig(payment.business_id);
    if (!cfg.configured || cfg.mode !== "test") {
      throw new Error("Simulated payments are disabled for this business.");
    }

    // Idempotency: a terminal payment is returned as-is.
    if (payment.status !== "pending" && payment.status !== "processing") {
      return { status: payment.status, bookingConfirmed: payment.status === "paid" };
    }

    if (data.outcome === "failure") {
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", payment.id)
        .in("status", ["pending", "processing"]);
      // The booking stays pending on its existing hold, so the client can retry;
      // the hold expires on its own and releases the slot.
      return { status: "failed" as const, bookingConfirmed: false };
    }

    const { data: updated } = await supabaseAdmin
      .from("payments")
      .update({ status: "paid" })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"])
      .select("id");
    if (!updated || updated.length === 0) {
      return { status: "paid" as const, bookingConfirmed: true };
    }

    if (payment.booking_id) {
      // Final server-side confirmation; the booking trigger re-validates the
      // slot, assignment, availability and capacity before confirming.
      const { error } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed", hold_expires_at: null })
        .eq("id", payment.booking_id)
        .eq("status", "pending");
      if (error) {
        await supabaseAdmin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
        throw new Error("The slot was taken while payment completed. The payment was reversed.");
      }
    }
    return { status: "paid" as const, bookingConfirmed: true };
  });

/** Client cancels an in-progress checkout and releases the held slot. */
export const cancelBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabase
      .from("payments")
      .select("id, booking_id, status")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found.");
    if (payment.status === "paid") return { ok: true };

    await supabaseAdmin
      .from("payments")
      .update({ status: "cancelled" })
      .eq("id", payment.id)
      .in("status", ["pending", "processing", "failed"]);
    if (payment.booking_id) {
      await supabaseAdmin
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", payment.booking_id)
        .eq("status", "pending");
    }
    return { ok: true };
  });
