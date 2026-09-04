// Server-only payment provider layer.
//
// The rest of the application talks to a `PaymentProvider` through generic
// concepts (amount, currency, provider payment id, status). Provider specific
// logic — currently only CMI — is isolated in this file so that other
// providers (Payzone, Stripe, ...) can be added later without touching the
// booking system.

import type { PaymentMode, PaymentProviderId } from "./types";

/** Per-business provider credentials. Never leaves the server. */
export type ProviderConfig = {
  provider: PaymentProviderId;
  merchantId: string | null;
  storeKey: string | null;
  mode: PaymentMode;
  configured: boolean;
};

export type CheckoutIntent = {
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
};

export type CheckoutSession = {
  /** "mock" renders the simulated checkout UI; "redirect" hands off to the provider. */
  kind: "mock" | "redirect";
  providerPaymentId: string;
  redirectUrl?: string;
};

export interface PaymentProvider {
  id: PaymentProviderId;
  createCheckout(intent: CheckoutIntent, config: ProviderConfig): Promise<CheckoutSession>;
}

/**
 * MOCK ONLY — replace this provider implementation with the official CMI signed
 * request/redirect and server-side verification flow when real merchant
 * credentials are available.
 *
 * It performs no network call and invents no CMI endpoint, parameter or
 * signature. It only produces a local reference so the application can walk
 * through the same state transitions the real provider will eventually drive.
 */
export function mockCmiCheckout(intent: CheckoutIntent, config: ProviderConfig): CheckoutSession {
  if (config.mode !== "test") {
    throw new Error("Simulated payments are only available in test mode.");
  }
  return { kind: "mock", providerPaymentId: `mock_cmi_${intent.paymentId}` };
}

const cmiProvider: PaymentProvider = {
  id: "cmi",
  async createCheckout(intent, config) {
    if (!config.configured) {
      throw new Error("Payment provider is not configured for this business.");
    }
    if (config.mode === "live") {
      // Real CMI integration is intentionally not implemented: it requires the
      // official CMI merchant documentation and real credentials.
      throw new Error("Live CMI payments are not available yet.");
    }
    return mockCmiCheckout(intent, config);
  },
};

const providers: Record<PaymentProviderId, PaymentProvider> = { cmi: cmiProvider };

export function getPaymentProvider(id: string): PaymentProvider {
  const provider = providers[id as PaymentProviderId];
  if (!provider) throw new Error(`Unknown payment provider: ${id}`);
  return provider;
}
