import { Link } from "@tanstack/react-router";

const links = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/staff", label: "Staff" },
  { to: "/dashboard/bookings", label: "Bookings" },
] as const;

export function DashboardNav() {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          activeOptions={{ exact: l.to === "/dashboard" }}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent [&.active]:bg-accent [&.active]:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
