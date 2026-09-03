import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  const { data: results, isFetching } = useQuery({
    queryKey: ["business-search", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_public_businesses", { _q: query.trim() });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Welcome to Fitly</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask your gym, coach, or studio for their booking link — or if you know the business name,
        search for it below.
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term);
        }}
      >
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by business name"
          aria-label="Search by business name"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="mt-4">
        {query.trim().length >= 2 && isFetching && (
          <p className="text-sm text-muted-foreground">Searching...</p>
        )}
        {query.trim().length >= 2 && !isFetching && (results?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No businesses found. Try a different name, or ask them for their booking link.
          </p>
        )}
        <ul className="space-y-2">
          {results?.map((b) => (
            <li key={b.id}>
              <a
                href={`/book/${b.slug}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="font-medium text-foreground">{b.name}</span>
                <span className="text-muted-foreground">{b.business_type}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={handleSignOut}
        className="mt-8 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        Log out
      </button>
    </main>
  );
}
