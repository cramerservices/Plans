/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RequestBody = {
  planId: string;
  miniSplitHeads?: number; // only needed if your plan is "mini split"

  // optional customer/service info
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  agreementSignedAt?: string;

  // optional override URLs
  successUrl?: string;
  cancelUrl?: string;
};

function corsHeaders(origin: string | null) {
  // Add any domains you use for testing here
  const allowed = new Set([
    "https://cramerservices.github.io",
    "http://localhost:5173",
    "http://localhost:4173",
  ]);

  const allowOrigin = origin && allowed.has(origin)
    ? origin
    : "https://cramerservices.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/**
 * Mini split price mapping:
 * Recommended: set a Function Secret named MINI_SPLIT_PRICE_MAP_JSON like:
 * {"1":"price_xxx","2":"price_yyy","3":"price_zzz",...}
 */
function getMiniSplitPriceId(heads: number): string | null {
  const raw = Deno.env.get("MINI_SPLIT_PRICE_MAP_JSON");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[String(heads)] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, headers);
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return jsonResponse(
        {
          error:
            "Missing env vars. Need STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.",
        },
        500,
        headers,
      );
    }

    // ✅ NEW: get the logged-in user from the Bearer token
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization Bearer token" }, 401, headers);
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    const user = userData?.user;

    if (userErr || !user) {
      return jsonResponse({ error: "Invalid user session" }, 401, headers);
    }

    const userId = user.id;

    const body = (await req.json()) as RequestBody;

    if (!body?.planId) {
      return jsonResponse({ error: "planId is required" }, 400, headers);
    }

    // Service role client for DB reads (plan lookup)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Adjust selected columns if your table differs
    const { data: plan, error: planErr } = await supabase
      .from("maintenance_plans")
      .select("id, name, stripe_price_id, is_active")
      .eq("id", body.planId)
      .maybeSingle();

    if (planErr || !plan) {
      return jsonResponse(
        { error: "Plan not found", details: planErr?.message ?? null },
        404,
        headers,
      );
    }

    if (plan.is_active === false) {
      return jsonResponse({ error: "Plan is not active" }, 400, headers);
    }

    const planName = String(plan.name ?? "");
    const isMiniSplit = planName.toLowerCase().includes("mini split");

    let priceId: string | null = plan.stripe_price_id ?? null;

    // If your mini split is a single planId and you choose heads on checkout,
    // then use MINI_SPLIT_PRICE_MAP_JSON to map heads -> Stripe Price ID.
    if (isMiniSplit) {
      const heads = body.miniSplitHeads;
      if (!heads || !Number.isInteger(heads) || heads < 1 || heads > 9) {
        return jsonResponse(
          { error: "miniSplitHeads is required for Mini Split plans (1–9)." },
          400,
          headers,
        );
      }

      const mapped = getMiniSplitPriceId(heads);
      if (!mapped) {
        return jsonResponse(
          {
            error: "Mini split pricing not configured.",
            hint: 'Set MINI_SPLIT_PRICE_MAP_JSON secret, e.g. {"1":"price_...","2":"price_..."}',
          },
          500,
          headers,
        );
      }
      priceId = mapped;
    }

    if (!priceId) {
      return jsonResponse({ error: "Missing stripe_price_id for this plan." }, 400, headers);
    }

    const base = "https://cramerservices.github.io/Plans/#";
    const successUrl = body.successUrl ?? `${base}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancelUrl ?? `${base}/checkout/${plan.id}`;

    // Stripe Checkout Sessions API (form-urlencoded)
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);

    // line item
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");

    // ✅ NEW: user id in metadata (this is the fix)
    params.set("metadata[user_id]", userId);

    // helpful metadata (shows in Stripe dashboard)
    params.set("metadata[plan_id]", String(plan.id));
    params.set("metadata[plan_name]", planName);

    if (isMiniSplit) params.set("metadata[mini_split_heads]", String(body.miniSplitHeads ?? ""));
    if (body.customerName) params.set("metadata[customer_name]", body.customerName);
    if (body.customerPhone) params.set("metadata[customer_phone]", body.customerPhone);
    if (body.streetAddress) params.set("metadata[address]", body.streetAddress);
    if (body.city) params.set("metadata[city]", body.city);
    if (body.state) params.set("metadata[state]", body.state);
    if (body.zipCode) params.set("metadata[zip]", body.zipCode);
    if (body.agreementSignedAt) params.set("metadata[agreement_signed_at]", body.agreementSignedAt);

    // optional email:
    // prefer the email passed in; otherwise fall back to the logged-in Supabase user email
    const email = body.customerEmail ?? user.email ?? null;
    if (email) params.set("customer_email", email);

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
      return jsonResponse({ error: "Stripe error", details: stripeJson }, 500, headers);
    }

    return jsonResponse({ url: stripeJson.url }, 200, headers);
  } catch (err) {
    return jsonResponse(
      { error: "Server error", details: String((err as Error)?.message ?? err) },
      500,
      headers,
    );
  }
});
