import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const InputSchema = z.object({
  slug: z.string().min(1).max(120),
  messages: z.array(MessageSchema).min(1).max(20),
});

/**
 * Public AI assistant for ONE business booking page.
 * Context is built server-side from that business's public data only,
 * looked up by its public slug — no cross-business data is ever included.
 */
export const askBusinessAssistant = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, error: "unavailable", reply: null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: businessRows } = await supabaseAdmin.rpc("get_public_business", {
      _slug: data.slug,
    });
    const business = businessRows?.[0];
    if (!business) return { ok: false as const, error: "not_found", reply: null };

    const { data: services } = await supabaseAdmin.rpc("get_public_services", {
      _business_id: business.id,
    });

    // Minimum public information only.
    const context = {
      business: {
        name: business.name,
        type: business.business_type,
        description: business.description ?? null,
        phone: business.phone ?? null,
        whatsapp: business.whatsapp ?? null,
      },
      services: (services ?? []).map((s) => ({
        name: s.name,
        description: s.description ?? null,
        price: s.price != null ? `${s.price} MAD` : null,
        duration_minutes: s.duration_minutes ?? null,
        type: s.service_type === "group_class" ? "group class" : "one-on-one",
        capacity: s.capacity ?? null,
        payment_required: !!s.requires_payment,
      })),
    };

    const system = [
      "You are the friendly booking assistant for ONE fitness business on its public booking page.",
      "Answer ONLY from the JSON business data provided below. It is the single source of truth.",
      "NEVER invent services, prices, durations, staff, locations, opening hours, availability, promotions or policies.",
      "If information is not in the data, say clearly that it is not specified and suggest contacting the business.",
      "Prices are exactly as stored; never estimate, calculate or change them.",
      "You may recommend and compare only the listed services, based on price, duration, description and type.",
      "If a question is vague, ask one short follow-up question.",
      "For booking, guide the client to select the service below and pick an available date and time — never take a booking yourself.",
      "For unrelated topics, politely redirect to the business's services, prices and booking.",
      "Never give medical diagnosis or health advice; suggest a qualified professional when relevant.",
      "Be concise (max ~80 words), warm and professional. Reply in the client's language (English, French, Arabic or Darija).",
      "",
      `BUSINESS DATA:\n${JSON.stringify(context)}`,
    ].join("\n");

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.8-flash",
          messages: [{ role: "system", content: system }, ...data.messages],
        }),
      });

      if (!res.ok) {
        if (res.status === 429) return { ok: false as const, error: "busy", reply: null };
        if (res.status === 402) return { ok: false as const, error: "credits", reply: null };
        return { ok: false as const, error: "unavailable", reply: null };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = json.choices?.[0]?.message?.content?.trim();
      if (!reply) return { ok: false as const, error: "unavailable", reply: null };
      return { ok: true as const, error: null, reply };
    } catch {
      return { ok: false as const, error: "unavailable", reply: null };
    }
  });
