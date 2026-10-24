import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const payload = await request.text();
        const sig = request.headers.get("stripe-signature");

        if (!sig) {
          return new Response("No signature found", { status: 400 });
        }

        let event: Stripe.Event;

        try {
          const parsed = JSON.parse(payload);
          const paymentId = parsed.data?.object?.metadata?.paymentId;

          if (!paymentId) {
            return new Response("No paymentId in metadata", { status: 400 });
          }

          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("business_id")
            .eq("id", paymentId)
            .single();

          if (!payment) {
            return new Response("Payment not found", { status: 400 });
          }

          const { data: config } = await supabaseAdmin.rpc("get_business_payment_secrets", {
            _business_id: payment.business_id,
          });

          const cfg = config as any;
          const webhookSecret = cfg?.[0]?.stripe_webhook_secret;
          const secretKey = cfg?.[0]?.stripe_secret_key;

          if (!webhookSecret || !secretKey) {
            return new Response("Stripe is not fully configured for this business", { status: 400 });
          }

          const stripe = new Stripe(secretKey);
          event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
        } catch (err: any) {
          console.error(`Webhook Error: ${err.message}`);
          return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const paymentId = session.metadata?.['paymentId'];

          if (paymentId) {
            await supabaseAdmin
              .from("payments")
              .update({ status: "paid" })
              .eq("id", paymentId);

            const { data: payRecord } = await supabaseAdmin
              .from("payments")
              .select("booking_id")
              .eq("id", paymentId)
              .single();

            if (payRecord?.booking_id) {
              await supabaseAdmin
                .from("bookings")
                .update({ status: "confirmed", hold_expires_at: null })
                .eq("id", payRecord.booking_id)
                .eq("status", "pending");
            }
          }
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
});