/// <reference lib="deno.ns" />

import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function buildCors(origin: string | null) {
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(corsHeaders, 405, { error: "Method not allowed" });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(corsHeaders, 500, { error: "Missing required secrets" });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-04-10",
    });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
    const paymentAmount = Number(body.paymentAmount ?? 0);

    if (!invoiceId) {
      return json(corsHeaders, 400, { error: "invoiceId required" });
    }

    if (!paymentAmount || paymentAmount <= 0) {
      return json(corsHeaders, 400, { error: "Valid paymentAmount required" });
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("crm_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return json(corsHeaders, 404, { error: "Invoice not found" });
    }

    const amountDue = Number(invoice.amount_due || 0);

    if (amountDue <= 0) {
      return json(corsHeaders, 400, { error: "Invoice has no balance due" });
    }

    if (paymentAmount > amountDue) {
      return json(corsHeaders, 400, { error: "Payment amount cannot exceed balance due" });
    }

    const { data: customerRow } = await supabaseAdmin
      .from("customers")
      .select("id, name, email")
      .eq("id", invoice.customer_id)
      .maybeSingle();

    const siteUrl = "https://cramerservices.github.io/Plans";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${siteUrl}/#/dashboard?invoiceCheckout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#/invoice-checkout?invoiceId=${encodeURIComponent(invoiceId)}&checkout=cancelled`,
      customer_email: customerRow?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `Payment for invoice ${invoice.invoice_number}`,
            },
            unit_amount: Math.round(paymentAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "invoice_payment",
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        payment_amount: paymentAmount.toFixed(2),
      },
    });

    return json(corsHeaders, 200, {
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (e: any) {
    console.error("create-invoice-checkout-session error", e);
    return json(corsHeaders, 500, {
      error: "Unhandled create-invoice-checkout-session error",
      details: String(e?.message ?? e),
    });
  }
});
