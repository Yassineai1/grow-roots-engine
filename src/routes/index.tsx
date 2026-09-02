import { createFileRoute, redirect } from "@tanstack/react-router";
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
    throw redirect({ to: data.user ? "/dashboard" : "/login" });
  },
  component: () => null,
});
