import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <DashboardNav />
      <div className="mt-6 space-y-8">
        <h1 className="text-2xl font-semibold text-foreground">Booking link</h1>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !business ? (
          <p className="text-sm text-muted-foreground">No business found.</p>
        ) : (
          <>
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-medium text-foreground">Your public booking link</h2>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  {bookingUrl || "..."}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!bookingUrl}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
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

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-medium text-foreground">QR code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Print this and put it at your front desk — scanning it opens your booking page.
              </p>
              {qr ? (
                <img
                  src={qr}
                  alt={`QR code linking to ${bookingUrl}`}
                  className="mt-4 h-48 w-48 rounded-md border border-border bg-background"
                />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Generating QR code...</p>
              )}
            </section>

            <section className="rounded-lg border border-border p-4">
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="my-gym"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save link"}
                </button>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && !error && (
                  <p className="text-sm text-muted-foreground">Booking link updated.</p>
                )}
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
