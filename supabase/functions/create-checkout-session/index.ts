/// <reference lib="deno.ns" />

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------- CORS ----------
function buildCorsHeaders(origin: string | null) {
  // Allow your GitHub Pages site + local dev + (optionally) preview domains
  const allowedOrigins = new Set<string>([
    "https://cramerservices.github.io",
    "http://localhost:5173",
    "http://localhost:4173",
  ]);

  const allowOrigin =
    origin && allowedOrigins.has(origin) ? origin : "https://cramerservices.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ---------- Mini split head-count Price mapping ----------
// Based on your screenshots
const MINI_SPLIT_PRICE_BY_HEADS: Record<number, string> = {
  1: "price_1SxZDh4IltCwxOnNPOewX5Bt
  2: "price_1SxZEX4lItCwxOnNRnG0JWpx",
  3: "price_1SxZHL4lItCwxOnNbr7jq9BL",
  4: "price_1SxZHb4lItCwxOnNaFhEgNOR",
  5: "price_1SxZHq4lItCwxOnNY8mtIhbM",
  6: "price_1SxZIY4lItCwxOnNCryF0YRo",
  7: "price_1SxZIn4lItCwxOnNwDOM6KJM",
  8: "price_1SxZJ14lItCwxOnNvXSBPiXr",
  9: "price_1SxZJD4lItCwxOnNL1ViF8YA",
};

// NOTE: You didn’t fully show mini1 ID in the screenshot text you sent earlier.
// Replace the mini1 value above with your exact mini1 price id.
// Your screenshot showed it starts with: price_1SxZD...

// ---------- Types ----------
type RequestBody = {
  planId: string; // UUID from maintenance_plans
  miniSplitHeads?: number; // required if plan is mini split, 1-9
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  serviceAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string; // default "US"
  };
  successUrl?: string;
  cancelUrl?: string;
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  // ✅ Handle preflight
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
    // ---------- Env ----------
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY secret.");
    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret.");
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ---------- Parse body ----------
    const body = (await req.json()) as RequestBody;

    if (!body?.planId) {
      return new Response(JSON.stringify({ error: "planId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Fetch plan ----------
    const { data: plan, error: planErr } = await supabase
      .from("maintenance_plans")
      .select("id, name, stripe_price_id, price, is_active")
      .eq("id", body.planId)
      .single();

    if (planErr || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found", details: planErr?.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (plan.is_active === false) {
      return new Response(JSON.stringify({ error: "Plan is not active." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Decide Stripe price ----------
    const planName = String(plan.name || "").toLowerCase();
    const isMiniSplit = planName.includes("mini split");

    let stripePriceId: string | null = plan.stripe_price_id ?? null;

    if (isMiniSplit) {
      const heads = body.miniSplitHeads;
      if (!heads || !Number.isInteger(heads) || heads < 1 || heads > 9) {
        return new Response(
          JSON.stringify({
            error: "miniSplitHeads is required for Mini Split plans (1–9).",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const mapped = MINI_SPLIT_PRICE_BY_HEADS[heads];
      if (!mapped || !mapped.startsWith("price_")) {
        return new Response(
          JSON.stringify({
            error: `No Stripe price configured for miniSplitHeads=${heads}.`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      stripePriceId = mapped;
    } else {
      if (!stripePriceId || !stripePriceId.startsWith("price_")) {
        return new Response(
          JSON.stringify({
            error:
              "This plan is missing stripe_price_id in Supabase. Set it in maintenance_plans.stripe_price_id.",
            plan: { id: plan.id, name: plan.name, stripe_price_id: plan.stripe_price_id },
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ---------- URLs ----------
    // Provide safe defaults if you don’t pass them in
    const defaultBase = "https://cramerservices.github.io/Plans/#";
    const successUrl = body.successUrl ?? `${defaultBase}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancelUrl ?? `${defaultBase}/checkout/${plan.id}`;

    // ---------- Customer info ----------
    const customerEmail = body.customer?.email || undefined;

    // ---------- Create Stripe Checkout Session ----------
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,

      // Helps autofill Stripe checkout
      customer_email: customerEmail,

      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],

      // Put your own useful data here
      metadata: {
        plan_id: String(plan.id),
        plan_name: String(plan.name),
        mini_split_heads: isMiniSplit ? String(body.miniSplitHeads) : "",
        customer_name: body.customer?.name ?? "",
        customer_phone: body.customer?.phone ?? "",
        service_line1: body.serviceAddress?.line1 ?? "",
        service_city: body.serviceAddress?.city ?? "",
        service_state: body.serviceAddress?.state ?? "",
        service_zip: body.serviceAddress?.postal_code ?? "",
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to create Stripe Checkout session",
        details: String(err?.message ?? err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
