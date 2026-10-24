// Server-only payment provider layer.
import type { PaymentMode, PaymentProviderId } from "./types";
import Stripe from "stripe";

export type CmiCredentials = {
  merchantId: string;
  storeKey: string;
};

export type StripeCredentials = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string | null;
};

export type ProviderConfig = {
  provider: PaymentProviderId;
  mode: PaymentMode;
  configured: boolean;
  credentials: {
    cmi?: CmiCredentials;
    stripe?: StripeCredentials;
  };
};

export type CheckoutIntent = {
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
};

export type CheckoutSession = {
  kind: "mock" | "redirect";
  providerPaymentId: string;
  redirectUrl?: string | undefined; // زدنا undefined باش نحلو مشكل TypeScript
};

export interface PaymentProvider {
  id: PaymentProviderId;
  createCheckout(intent: CheckoutIntent, config: ProviderConfig): Promise<CheckoutSession>;
}

export function mockCmiCheckout(intent: CheckoutIntent, config: ProviderConfig): CheckoutSession {
  if (config.mode !== "test") {
    throw new Error("Simulated payments are only available in test mode.");
  }
  return { kind: "mock", providerPaymentId: `mock_cmi_${intent.paymentId}` };
}

const cmiProvider: PaymentProvider = {
  id: "cmi",
  async createCheckout(intent, config) {
    if (!config.configured || !config.credentials.cmi) {
      throw new Error("CMI is not configured for this business.");
    }
    if (config.mode === "live") {
      throw new Error("Live CMI payments are not available yet.");
    }
    return mockCmiCheckout(intent, config);
  },
};

const stripeProvider: PaymentProvider = {
  id: "stripe",
  async createCheckout(intent, config) {
    if (!config.configured || !config.credentials.stripe) {
      throw new Error("Stripe is not configured for this business.");
    }

    const stripe = new Stripe(config.credentials.stripe.secretKey);

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: intent.currency.toLowerCase(),
            product_data: {
              name: intent.description,
            },
            unit_amount: Math.round(intent.amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        paymentId: intent.paymentId,
      },
      // استعملنا ['VITE_APP_URL'] باش نحلو مشكل process.env
      success_url: `${process.env['VITE_APP_URL'] || 'http://localhost:5173'}/my-bookings?payment_success=true`,
      cancel_url: `${process.env['VITE_APP_URL'] || 'http://localhost:5173'}/my-bookings?payment_cancelled=true`,
    });

    return {
      kind: "redirect",
      providerPaymentId: session.id,
      redirectUrl: session.url || undefined,
    };
  },
};

const mockProvider: PaymentProvider = {
  id: "mock",
  async createCheckout(intent, config) {
    if (config.mode !== "test") {
      throw new Error("Mock provider only works in test mode.");
    }
    return {
      kind: "mock",
      providerPaymentId: `mock_${intent.paymentId}`,
    };
  },
};

const providers: Record<PaymentProviderId, PaymentProvider> = {
  cmi: cmiProvider,
  stripe: stripeProvider,
  mock: mockProvider,
};

export function getPaymentProvider(id: string): PaymentProvider {
  const provider = providers[id as PaymentProviderId];
  if (!provider) throw new Error(`Unknown payment provider: ${id}`);
  return provider;
}
