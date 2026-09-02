import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Fitly Business Platform" },
      { name: "description", content: "Your business dashboard for gyms, studios, and coaches." },
      { property: "og:title", content: "Dashboard | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Your business dashboard for gyms, studios, and coaches.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: business, isLoading } = useQuery({
    queryKey: ["my-business"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!isLoading && !business) navigate({ to: "/onboarding" });
  }, [isLoading, business, navigate]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          {isLoading ? "Loading..." : `Welcome, ${business?.name ?? ""}`}
        </h1>
        <button
          onClick={handleSignOut}
          className="mt-6 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
