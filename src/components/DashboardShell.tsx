import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarDays,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/useMyBusiness";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/services", label: "Services", icon: BriefcaseBusiness },
  { to: "/dashboard/staff", label: "Staff", icon: Users },
  { to: "/dashboard/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { to: "/dashboard/settings", label: "Booking link", icon: Link2 },
  { to: "/dashboard/business", label: "Settings", icon: Settings },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: business } = useMyBusiness();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function resolveLogo() {
      if (!business?.logo_url) return setLogoUrl(null);
      if (/^https?:\/\//i.test(business.logo_url)) return setLogoUrl(business.logo_url);
      const { data } = await supabase.storage
        .from("business-branding")
        .createSignedUrl(business.logo_url, 3600);
      if (active) setLogoUrl(data?.signedUrl ?? null);
    }
    void resolveLogo();
    return () => {
      active = false;
    };
  }, [business?.logo_url]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-secondary text-sm font-semibold text-primary">
        {logoUrl ? (
          <img src={logoUrl} alt={`${business?.name ?? "Business"} logo`} className="h-full w-full object-cover" />
        ) : (
          (business?.name?.trim().charAt(0) || "F").toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{business?.name ?? "Fitly"}</p>
        <p className="truncate text-xs capitalize text-muted-foreground">
          {business?.business_type?.replaceAll("_", " ") ?? "Owner workspace"}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Menu />
        </Button>
        {identity}
        {business?.slug ? (
          <Button asChild variant="outline" size="icon">
            <a href={`/book/${business.slug}`} target="_blank" rel="noreferrer" aria-label="Open booking page">
              <ExternalLink />
            </a>
          </Button>
        ) : <span />}
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <aside className="relative flex h-full w-[min(88vw,20rem)] flex-col border-r border-border bg-sidebar p-4 shadow-2xl">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-sidebar-border pb-4">
              {identity}
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></Button>
            </div>
            <DashboardLinks onNavigate={() => setMobileOpen(false)} />
            <Button variant="ghost" className="mt-auto justify-start text-muted-foreground" onClick={handleSignOut}><LogOut />Log out</Button>
          </aside>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <Link to="/dashboard" className="mb-7 flex items-center gap-2 px-2 text-lg font-bold text-foreground">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-sm text-primary-foreground">F</span>
          Fitly
        </Link>
        <div className="border-b border-sidebar-border px-2 pb-5">{identity}</div>
        <DashboardLinks />
        {business?.slug && (
          <Button asChild variant="outline" className="mb-2 justify-start">
            <a href={`/book/${business.slug}`} target="_blank" rel="noreferrer"><ExternalLink />Open booking page</a>
          </Button>
        )}
        <Button variant="ghost" className="justify-start text-muted-foreground" onClick={handleSignOut}><LogOut />Log out</Button>
      </aside>

      <main className="min-w-0 lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

function DashboardLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 py-5" aria-label="Dashboard navigation">
      {links.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === "/dashboard" }}
          onClick={onNavigate}
          className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:text-primary"
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}