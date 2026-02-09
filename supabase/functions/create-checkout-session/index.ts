/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function buildCorsHeaders(origin: string | null) {
  const allowedOrigins = new Set<string>([
    "https://cramerservices.github.io",
    "http://localhost:5173",
    "http://localhost:4173",
  ]);

  const allowOrigin =
    origin && allowedOrigins.has(origin) ? origin : "https://cramerservices.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Mini split price mapping (keep your mapping as-is if you already have one)
function getMiniSplitPriceId(heads: number): string | null {
  const map: Record<number, string> = {
    // EXAMPLE — replace these with YOUR real Stripe price IDs
    1: "price_XXXXXXXXXXXX1",
    2: "price_XXXXXXXXXXXX2",
    3: "price_XXXXXXXXXXXX3",
    4: "price_XXXXXXXXXXXX4",
    5: "price_XXXXXXXXXXXX5",
    6: "price_XXXXXXXXXXXX6",
    7: "price_XXXXXXXXXXXX7",
    8: "price_XXXXXXXXXXXX8",
    9: "price_XXXXXXXXXXXX9",
  };
  return map[heads] ?? null;
}

type RequestBody = {
  planId: string;
  miniSplitHeads?: number;
  customer?: { name?: string; email?: string; phone?: string };
  serviceAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  successUrl?: string;
  cancelUrl?: string;
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing required env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;

    if (!body?.planId) {
      return new Response(JSON.stringify({ error: "planId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: plan, error: planErr } = await supabase
      .from("maintenance_plans")
      .select("id, name, stripe_price_id, is_active")
      .eq("id", body.planId)
      .maybeSingle();

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found", details: planErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (plan.is_active === false) {
      return new Response(JSON.stringify({ error: "Plan is not active." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planName = String(plan.name || "").toLowerCase();
    const isMiniSplit = planName.includes("mini split");

    let stripePriceId: string | null = plan.stripe_price_id ?? null;

    if (isMiniSplit) {
      const heads = body.miniSplitHeads;
      if (!heads || !Number.isInteger(heads) || heads < 1 || heads > 9) {
        return new Response(JSON.stringify({ error: "miniSplitHeads is required for Mini Split plans (1–9)." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      stripePriceId = getMiniSplitPriceId(heads);
      if (!stripePriceId) {
        return new Response(JSON.stringify({ error: "Mini split price not configured for that head count." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!stripePriceId) {
      return new Response(JSON.stringify({ error: "Missing Stripe price ID for plan." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const defaultBase = "https://cramerservices.github.io/Plans/#";
    const successUrl = body.successUrl ?? `${defaultBase}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancelUrl ?? `${defaultBase}/checkout/${plan.id}`;

    // Stripe requires form-encoded body
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);

    if (body.customer?.email) params.set("customer_email", body.customer.email);

    params.set("line_items[0][price]", stripePriceId);
    params.set("line_items[0][quantity]", "1");

    // metadata
    params.set("metadata[plan_id]", String(plan.id));
    params.set("metadata[plan_name]", String(plan.name));
    params.set("metadata[mini_split_heads]", isMiniSplit ? String(body.miniSplitHeads ?? "") : "");
    params.set("metadata[customer_name]", body.customer?.name ?? "");
    params.set("metadata[customer_phone]", body.customer?.phone ?? "");
    params.set("metadata[service_line1]", body.serviceAddress?.line1 ?? "");
    params.set("metadata[service_city]", body.serviceAddress?.city ?? "");
    params.set("metadata[service_state]", body.serviceAddress?.state ?? "");
    params.set("metadata[service_zip]", body.serviceAddress?.postal_code ?? "");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const stripeJson = await stripeRes.json();

    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: "Stripe error", details: stripeJson }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: stripeJson.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

