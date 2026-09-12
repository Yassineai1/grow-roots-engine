import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";

export const Route = createFileRoute("/_authenticated/dashboard/business")({
  head: () => ({
    meta: [
      { title: "Business settings & branding | Fitly" },
      {
        name: "description",
        content:
          "Update your business name, description, logo, cover image, brand colors and contact numbers.",
      },
      { property: "og:title", content: "Business settings & branding | Fitly" },
      {
        property: "og:description",
        content:
          "Update your business name, description, logo, cover image, brand colors and contact numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BusinessSettingsPage,
});

const BUCKET = "business-branding";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_BYTES = 5 * 1024 * 1024;

type Form = {
  name: string;
  description: string;
  brand_color: string;
  accent_color: string;
  phone: string;
  whatsapp: string;
  logo_url: string | null;
  cover_image_url: string | null;
};

const EMPTY: Form = {
  name: "",
  description: "",
  brand_color: "#A3E635",
  accent_color: "#38BDF8",
  phone: "",
  whatsapp: "",
  logo_url: null,
  cover_image_url: null,
};

function BusinessSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previews, setPreviews] = useState<{ logo: string | null; cover: string | null }>({
    logo: null,
    cover: null,
  });

  // Only the signed-in owner's own business is readable (row-level rules).
  const { data: business, isLoading } = useQuery({
    queryKey: ["my-business-full"],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("businesses")
        .select(
          "id, name, description, brand_color, accent_color, phone, whatsapp, logo_url, cover_image_url",
        )
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (e) throw e;
      return data;
    },
  });

  useEffect(() => {
    if (!business) return;
    setForm({
      name: business.name ?? "",
      description: business.description ?? "",
      brand_color: business.brand_color ?? EMPTY.brand_color,
      accent_color: business.accent_color ?? EMPTY.accent_color,
      phone: business.phone ?? "",
      whatsapp: business.whatsapp ?? "",
      logo_url: business.logo_url,
      cover_image_url: business.cover_image_url,
    });
  }, [business]);

  // Show what is already stored.
  useEffect(() => {
    let active = true;
    async function sign(path: string | null) {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    }
    (async () => {
      const [logo, cover] = await Promise.all([
        sign(form.logo_url),
        sign(form.cover_image_url),
      ]);
      if (active) setPreviews({ logo, cover });
    })();
    return () => {
      active = false;
    };
  }, [form.logo_url, form.cover_image_url]);

  async function upload(kind: "logo" | "cover", file: File) {
    setError(null);
    setMessage(null);
    if (!business) return;
    if (!ALLOWED.includes(file.type)) {
      setError("Please choose a JPG, PNG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Images must be 5 MB or smaller.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    // Always scoped to this business's own folder.
    const path = `${business.id}/${kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setForm((f) =>
      kind === "logo" ? { ...f, logo_url: path } : { ...f, cover_image_url: path },
    );
    setMessage("Image uploaded. Remember to save your changes.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business) return;
    setError(null);
    setMessage(null);

    if (!form.name.trim()) {
      setError("Business name cannot be empty.");
      return;
    }
    if (form.name.trim().length > 120) {
      setError("Business name must be under 120 characters.");
      return;
    }
    if (form.description.length > 1000) {
      setError("Description must be under 1000 characters.");
      return;
    }

    setSaving(true);
    const { error: upErr } = await supabase
      .from("businesses")
      .update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        brand_color: form.brand_color || null,
        accent_color: form.accent_color || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        logo_url: form.logo_url,
        cover_image_url: form.cover_image_url,
      })
      .eq("id", business.id);
    setSaving(false);

    if (upErr) {
      setError(upErr.message);
      return;
    }
    setMessage("Settings saved.");
    await qc.invalidateQueries({ queryKey: ["my-business-full"] });
    await qc.invalidateQueries({ queryKey: ["my-business"] });
  }

  return (
    <DashboardNav>
      <div className="mt-6 space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Business settings</h1>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !business ? (
          <p className="text-sm text-muted-foreground">No business found.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            <section className="ui-card space-y-4 p-4">
              <h2 className="text-sm font-medium text-foreground">Business information</h2>
              <div>
                <label className="block text-sm text-muted-foreground" htmlFor="biz-name">
                  Business name
                </label>
                <input
                  id="biz-name"
                  className="ui-input"
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground" htmlFor="biz-desc">
                  Description
                </label>
                <textarea
                  id="biz-desc"
                  className="ui-input min-h-24"
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Tell clients what you offer."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm text-muted-foreground" htmlFor="biz-phone">
                    Phone number
                  </label>
                  <input
                    id="biz-phone"
                    className="ui-input"
                    maxLength={30}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+212 6 00 00 00 00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground" htmlFor="biz-wa">
                    WhatsApp number
                  </label>
                  <input
                    id="biz-wa"
                    className="ui-input"
                    maxLength={30}
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    placeholder="+212 6 00 00 00 00"
                  />
                </div>
              </div>
            </section>

            <section className="ui-card space-y-4 p-4">
              <h2 className="text-sm font-medium text-foreground">Brand colors</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm text-muted-foreground" htmlFor="biz-primary">
                    Primary color
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="biz-primary"
                      type="color"
                      className="h-10 w-14 rounded-md border border-border bg-transparent"
                      value={form.brand_color || "#A3E635"}
                      onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                    />
                    <input
                      className="ui-input"
                      value={form.brand_color}
                      onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground" htmlFor="biz-accent">
                    Secondary / accent color
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="biz-accent"
                      type="color"
                      className="h-10 w-14 rounded-md border border-border bg-transparent"
                      value={form.accent_color || "#38BDF8"}
                      onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    />
                    <input
                      className="ui-input"
                      value={form.accent_color}
                      onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="ui-card space-y-4 p-4">
              <h2 className="text-sm font-medium text-foreground">Images</h2>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP or SVG · up to 5 MB.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm text-muted-foreground" htmlFor="biz-logo">
                    Logo
                  </label>
                  {previews.logo && (
                    <img
                      src={previews.logo}
                      alt="Current business logo"
                      className="mt-2 h-20 w-20 rounded-lg border border-border object-contain"
                    />
                  )}
                  <input
                    id="biz-logo"
                    type="file"
                    accept={ALLOWED.join(",")}
                    className="mt-2 block w-full text-sm text-muted-foreground"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload("logo", f);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground" htmlFor="biz-cover">
                    Cover image
                  </label>
                  {previews.cover && (
                    <img
                      src={previews.cover}
                      alt="Current cover image"
                      className="mt-2 h-20 w-full rounded-lg border border-border object-cover"
                    />
                  )}
                  <input
                    id="biz-cover"
                    type="file"
                    accept={ALLOWED.join(",")}
                    className="mt-2 block w-full text-sm text-muted-foreground"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload("cover", f);
                    }}
                  />
                </div>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving} className="ui-btn">
                {saving ? "Saving..." : "Save settings"}
              </button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && !error && (
                <p className="text-sm text-success">{message}</p>
              )}
            </div>
          </form>
        )}
      </div>
    </DashboardNav>
  );
}
