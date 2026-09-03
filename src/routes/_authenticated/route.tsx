import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    // Only business owners (and platform admins) may reach onboarding/dashboard.
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    const role = profile?.role ?? "business_owner";
    if (role === "client") throw redirect({ to: "/" });

    return { user: data.user, role };
  },
  component: () => <Outlet />,
});
