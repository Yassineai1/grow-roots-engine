import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { EmptyState, LoadingState, PageHeader } from "@/components/DashboardUI";
import { useMyBusiness } from "@/lib/useMyBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/clients/")({
  head: () => ({
    meta: [
      { title: "Clients | Fitly Business Platform" },
      { name: "description", content: "View and search the clients of your business." },
      { property: "og:title", content: "Clients | Fitly Business Platform" },
      { property: "og:description", content: "View and search the clients of your business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientsPage,
});

export const CLIENT_STATUS_STYLE: Record<string, string> = {
  active: "text-success",
  new: "text-primary",
  inactive: "text-muted-foreground",
};

function ClientsPage() {
  const { data: business } = useMyBusiness();
  const [search, setSearch] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["business-clients", business?.id, search.trim()],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_business_clients", {
        _business_id: business!.id,
        _q: search.trim(),
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <DashboardNav>
      <PageHeader
        eyebrow="Client management"
        title="Clients"
        description="Everyone who has booked with your business."
      />

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or phone"
          aria-label="Search clients"
          className="ui-input h-10 w-full pl-9"
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading clients" />
      ) : !clients || clients.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title={search.trim() ? "No matching clients" : "No clients yet"}
            description={
              search.trim()
                ? "Try a different name, email or phone number."
                : "Clients will appear here when customers make bookings."
            }
          />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_auto] gap-4 border-b border-border bg-secondary/40 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground lg:grid">
            <span>Name</span>
            <span>Email</span>
            <span>Phone</span>
            <span className="text-right">Bookings</span>
            <span className="text-right">Last booking</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-border">
            {clients.map((client) => (
              <li key={client.id}>
                <Link
                  to="/dashboard/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="grid gap-1 px-4 py-4 transition-colors hover:bg-secondary/40 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_auto] lg:items-center lg:gap-4"
                >
                  <span className="truncate text-sm font-semibold text-foreground">
                    {client.full_name || "Unnamed client"}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{client.email || "—"}</span>
                  <span className="truncate text-sm text-muted-foreground">{client.phone || "—"}</span>
                  <span className="text-sm text-muted-foreground lg:text-right">
                    <span className="lg:hidden">Bookings: </span>
                    {client.booking_count}
                  </span>
                  <span className="text-sm text-muted-foreground lg:text-right">
                    {client.last_booking_date ?? "—"}
                  </span>
                  <span
                    className={`text-sm font-medium capitalize lg:text-right ${CLIENT_STATUS_STYLE[client.status] ?? "text-muted-foreground"}`}
                  >
                    {client.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardNav>
  );
}
