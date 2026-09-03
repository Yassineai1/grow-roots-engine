import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fitly | Business platform for gyms and coaches" },
      {
        name: "description",
        content:
          "Manage your gym, fitness studio, or coaching business from one simple platform.",
      },
      { property: "og:title", content: "Fitly | Business platform for gyms and coaches" },
      {
        property: "og:description",
        content:
          "Manage your gym, fitness studio, or coaching business from one simple platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    const role = profile?.role ?? "business_owner";
    if (role !== "client") throw redirect({ to: "/dashboard" });
    return { role };
  },
  component: ClientHome,
});

function ClientHome() {
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Welcome to Fitly</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You're signed in as a client. Open a business booking link to browse services and book a
        session.
      </p>
      <button
        onClick={handleSignOut}
        className="mt-6 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        Log out
      </button>
    </main>
  );
}
