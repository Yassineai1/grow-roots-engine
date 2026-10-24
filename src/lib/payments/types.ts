// Generic, provider-agnostic payment concepts used by the whole app.
// No provider-specific detail belongs in this file.

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type PaymentProviderId = "cmi" | "stripe" | "mock";

export type PaymentMode = "test" | "live";

/** Conceptual configuration state of a business's payment provider. */
export type PaymentConfigStatus = "not_configured" | "test" | "live";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

export const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: "text-warning",
  processing: "text-warning",
  paid: "text-success",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
  refunded: "text-muted-foreground",
  partially_refunded: "text-muted-foreground",
};

export function formatMoney(amount: number | string | null, currency: string | null) {
  if (amount === null) return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  return `${value.toFixed(2)} ${currency ?? "MAD"}`;
}
