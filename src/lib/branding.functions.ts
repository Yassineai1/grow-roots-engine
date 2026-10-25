import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKET = "business-branding";

/**
 * Public: turns the stored branding image paths of ONE business (looked up by
 * its public slug) into short-lived signed URLs. No private business data is
 * returned — only the image links needed to render the public booking page.
 */
export const getBrandingImageUrls = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("logo_url, cover_image_url")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!business) return { logoUrl: null, coverUrl: null };

    async function resolve(value: string | null) {
      if (!value) return null;
      if (/^https?:\/\//i.test(value)) return value;
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(value, 60 * 60);
      return signed?.signedUrl ?? null;
    }

    return {
      logoUrl: await resolve(business.logo_url),
      coverUrl: await resolve(business.cover_image_url),
    };
  });
