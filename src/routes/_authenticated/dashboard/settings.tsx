import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentSettings, savePaymentSettings } from "@/lib/payments.functions";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { useMyBusiness } from "@/lib/useMyBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Booking link & settings | Fitly" },
      {
        name: "description",
        content: "Share your public booking link, copy it, print its QR code, and customize your booking slug.",
      },
      { property: "og:title", content: "Booking link & settings | Fitly" },
      {
        property: "og:description",
        content: "Share your public booking link, copy it, print its QR code, and customize your booking slug.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function SettingsPage() {
  const { data: business, isLoading } = useMyBusiness();
  const queryClient = useQueryClient();

  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (business?.slug) setSlug(business.slug);
  }, [business?.slug]);

  const bookingUrl = business?.slug && origin ? `${origin}/book/${business.slug}` : "";

  useEffect(() => {
    if (!bookingUrl) return;
    let active = true;
    QRCode.toDataURL(bookingUrl, { width: 512, margin: 1 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      active = false;
    };
  }, [bookingUrl]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard. Select and copy the link manually.");
    }
  }

  async function handleSaveSlug(e: React.FormEvent) {
    e.preventDefault();
    if (!business) return;
    setError(null);
    setSaved(false);

    const next = slug.trim().toLowerCase();
    if (!SLUG_RE.test(next)) {
      setError(
        "Use lowercase letters, numbers and hyphens only — no spaces, and no leading or trailing hyphen.",
      );
      return;
    }
    if (next === business.slug) {
      setSaved(true);
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("businesses")
      .update({ slug: next })
      .eq("id", business.id);
    setSaving(false);

    if (updateError) {
      if (updateError.code === "23505" || /duplicate|unique/i.test(updateError.message)) {
        setError("That link is already taken by another business. Try a different one.");
      } else {
        setError(updateError.message);
      }
      return;
    }

    setSaved(true);
    await queryClient.invalidateQueries({ queryKey: ["my-business"] });
  }

  return (
    <DashboardNav>
      <div className="mt-6 space-y-8">
        <h1 className="text-2xl font-semibold text-foreground">Booking link</h1>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading...</p>
        ) : !business ? (
          <p className="text-sm text-muted-foreground">No business found.</p>
        ) : (
          <>
            <section className="ui-card p-4">
              <h2 className="text-sm font-medium text-foreground">Your public booking link</h2>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="flex-1 overflow-x-auto rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {bookingUrl || "..."}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!bookingUrl}
                  className="ui-btn"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
              <a
                href={`/book/${business.slug}`}
                className="mt-3 inline-block text-sm text-muted-foreground underline"
              >
                Open booking page
              </a>
            </section>

            <section className="ui-card p-4">
              <h2 className="text-sm font-medium text-foreground">QR code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Print this and put it at your front desk — scanning it opens your booking page.
              </p>
              {qr ? (
                <img
                  src={qr}
                  alt={`QR code linking to ${bookingUrl}`}
                  className="mt-4 h-48 w-48 rounded-lg border border-border bg-foreground p-2"
                />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Generating QR code...</p>
              )}
            </section>

            <section className="ui-card p-4">
              <h2 className="text-sm font-medium text-foreground">Customize your link</h2>
              <form onSubmit={handleSaveSlug} className="mt-3 space-y-3">
                <label className="block text-sm text-muted-foreground" htmlFor="slug">
                  {origin}/book/
                </label>
                <input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setError(null);
                    setSaved(false);
                  }}
                  className="ui-input"
                  placeholder="my-gym"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="ui-btn"
                >
                  {saving ? "Saving..." : "Save link"}
                </button>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && !error && (
                  <p className="text-sm text-muted-foreground">Booking link updated.</p>
                )}
              </form>
            </section>

            <PaymentSettings businessId={business.id} />
          </>
        )}
      </div>
    </DashboardNav>
  );
}

const STATUS_LABEL: Record<string, string> = {
  not_configured: "Not configured",
  test: "Test mode",
  live: "Live mode",
};

function PaymentSettings({ businessId }: { businessId: string }) {
  const load = useServerFn(getPaymentSettings);
  const save = useServerFn(savePaymentSettings);
  const qc = useQueryClient();

  const [merchantId, setMerchantId] = useState("");
  const [storeKey, setStoreKey] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["payment-settings", businessId],
    queryFn: () => load({ data: { businessId } }),
  });

  useEffect(() => {
    if (settings?.mode) setMode(settings.mode);
  }, [settings?.mode]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { businessId, merchantId, storeKey, mode } }),
    onSuccess: async () => {
      setStoreKey("");
      setMerchantId("");
      setError(null);
      setMessage("Payment settings saved.");
      await qc.invalidateQueries({ queryKey: ["payment-settings", businessId] });
    },
    onError: (e: Error) => {
      setMessage(null);
      setError(e.message);
    },
  });

  const status = settings?.status ?? "not_configured";

  return (
    <section className="ui-card p-4">
      <h2 className="text-sm font-medium text-foreground">Payment settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Payment provider: CMI · Status:{" "}
        <span className={status === "not_configured" ? "text-warning" : "text-success"}>
          {STATUS_LABEL[status]}
        </span>
      </p>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div>
            <label className="block text-sm text-muted-foreground" htmlFor="merchant">
              CMI Merchant ID {settings?.merchantIdMasked && `(saved: ${settings.merchantIdMasked})`}
            </label>
            <input
              id="merchant"
              className="ui-input"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder={settings?.merchantIdMasked ? "Leave blank to keep current" : "Merchant ID"}
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground" htmlFor="storekey">
              CMI Store Key {settings?.storeKeySet && "(saved — hidden for security)"}
            </label>
            <input
              id="storekey"
              type="password"
              autoComplete="new-password"
              className="ui-input"
              value={storeKey}
              onChange={(e) => setStoreKey(e.target.value)}
              placeholder={settings?.storeKeySet ? "Leave blank to keep current" : "Store key"}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The store key is stored securely on the server and is never shown again.
            </p>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground" htmlFor="mode">
              Mode
            </label>
            <select
              id="mode"
              className="ui-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as "test" | "live")}
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </div>
          <button type="submit" disabled={mutation.isPending} className="ui-btn">
            {mutation.isPending ? "Saving..." : "Save payment settings"}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && !error && <p className="text-sm text-muted-foreground">{message}</p>}
        </form>
      )}
    </section>
  );
}
