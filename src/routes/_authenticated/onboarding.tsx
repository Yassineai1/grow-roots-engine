import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Create your business | Fitly Business Platform" },
      { name: "description", content: "Set up your gym, studio, or coaching business profile." },
      { property: "og:title", content: "Create your business | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Set up your gym, studio, or coaching business profile.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "business"
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("Gym");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Make sure the signed-in user always has a profile row.
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          full_name: (user.user_metadata?.["full_name"] as string) ?? "",
          role: "business_owner",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setLoading(false);
      navigate({ to: "/login" });
      return;
    }

    const { error: insertError } = await supabase.from("businesses").insert({
      owner_id: user.id,
      name,
      business_type: businessType,
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Create your business</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            required
            placeholder="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ui-input"
          />
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="ui-input"
          >
            <option value="Gym">Gym</option>
            <option value="Studio">Studio</option>
            <option value="Coaching">Coaching</option>
          </select>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="ui-btn w-full"
          >
            {loading ? "Creating..." : "Create business"}
          </button>
        </form>
      </div>
    </main>
  );
}
