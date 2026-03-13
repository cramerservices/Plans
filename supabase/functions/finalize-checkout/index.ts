/// <reference lib="deno.ns" />

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

function normalizeEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

function isoDateFromUnix(unixSeconds: number | null | undefined, fallback?: string) {
  if (!unixSeconds || Number.isNaN(unixSeconds)) {
    return fallback ?? new Date().toISOString().slice(0, 10);
  }
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function pickMeta(md: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = md[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

type StripeSession = {
  status?: string;
  payment_status?: string;
  client_reference_id?: string | null;
  customer?: string | null;
  customer_email?: string | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
  subscription?:
    | string
    | {
      id?: string | null;
      current_period_start?: number | null;
      current_period_end?: number | null;
      status?: string | null;
    }
    | null;
  error?: { message?: string };
};

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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId || body?.session_id;

    if (!sessionId) {
      return json(corsHeaders, 400, { error: "sessionId required" });
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=subscription`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      },
    );

    const session = (await stripeRes.json()) as StripeSession;

    if (!stripeRes.ok) {
      return json(corsHeaders, 400, {
        error: session?.error?.message ?? "Stripe error",
        stripe_status: stripeRes.status,
      });
    }

    if (session.status !== "complete" || session.payment_status !== "paid") {
      return json(corsHeaders, 400, {
        error: `Not paid/complete (${session.status}/${session.payment_status})`,
      });
    }

    const md = session.metadata ?? {};
    const userId = md.user_id || session.client_reference_id || null;
    const planId = md.plan_id || null;

    if (!userId) {
      return json(corsHeaders, 400, {
        error: "Missing user_id (metadata.user_id or client_reference_id)",
      });
    }

    if (!planId) {
      return json(corsHeaders, 400, {
        error: "Missing plan_id (metadata.plan_id)",
      });
    }

    const email = normalizeEmail(
      session.customer_details?.email ||
        session.customer_email ||
        md.customer_email ||
        "",
    );

    if (!email) {
      return json(corsHeaders, 400, {
        error: "Missing customer email from Stripe session",
      });
    }

    const fullName = pickMeta(md, "customer_name") || (session.customer_details?.name ?? "").trim();
    const phone = pickMeta(md, "customer_phone") || (session.customer_details?.phone ?? "").trim();

    // Support both legacy and current metadata keys.
    const serviceAddress = pickMeta(md, "service_address", "address");
    const serviceCity = pickMeta(md, "service_city", "city");
    const serviceState = pickMeta(md, "service_state", "state");
    const serviceZip = pickMeta(md, "service_zip", "zip", "zip_code");

    const stripeCustomerId = session.customer ?? null;
    const subscriptionObj =
      typeof session.subscription === "object" && session.subscription !== null
        ? session.subscription
        : null;

    const stripeSubscriptionId =
      subscriptionObj?.id ??
      (typeof session.subscription === "string" ? session.subscription : null) ??
      null;

    const today = new Date().toISOString().slice(0, 10);
    const startDate = isoDateFromUnix(subscriptionObj?.current_period_start, today);
    const endDate = isoDateFromUnix(
      subscriptionObj?.current_period_end,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    );

    // 1) PROFILE
    let profile: Record<string, any> | null = null;

    {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("auth_user_id", userId)
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "profiles lookup by auth_user_id failed",
          details: error.message,
        });
      }

      profile = data?.[0] ?? null;
    }

    if (!profile) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("email", email)
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "profiles lookup by email failed",
          details: error.message,
        });
      }

      profile = data?.[0] ?? null;
    }

    if (profile) {
      const profileUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (!profile.auth_user_id) profileUpdate.auth_user_id = userId;
      if (!profile.email) profileUpdate.email = email;
      if (!profile.role) profileUpdate.role = "customer";
      if ((!profile.full_name || profile.full_name === "EMPTY") && fullName) profileUpdate.full_name = fullName;
      if ((!profile.phone || profile.phone === "EMPTY") && phone) profileUpdate.phone = phone;
      if ((!profile.service_address || profile.service_address === "EMPTY") && serviceAddress) {
        profileUpdate.service_address = serviceAddress;
      }
      if ((!profile.city || profile.city === "EMPTY") && serviceCity) profileUpdate.city = serviceCity;
      if ((!profile.state || profile.state === "EMPTY") && serviceState) profileUpdate.state = serviceState;
      if ((!profile.zip_code || profile.zip_code === "EMPTY") && serviceZip) profileUpdate.zip_code = serviceZip;

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", profile.id)
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "profile update failed",
          details: error.message,
        });
      }

      profile = data;
    } else {
      const insertPayload: Record<string, any> = {
        email,
        auth_user_id: userId,
        role: "customer",
        updated_at: new Date().toISOString(),
      };

      if (fullName) insertPayload.full_name = fullName;
      if (phone) insertPayload.phone = phone;
      if (serviceAddress) insertPayload.service_address = serviceAddress;
      if (serviceCity) insertPayload.city = serviceCity;
      if (serviceState) insertPayload.state = serviceState;
      if (serviceZip) insertPayload.zip_code = serviceZip;

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "profile insert failed",
          details: error.message,
        });
      }

      profile = data;
    }

    // 2) PORTAL CUSTOMER
    let portalCustomer: Record<string, any> | null = null;

    if (profile?.portal_customer_id) {
      const { data, error } = await supabaseAdmin
        .from("portal_customers")
        .select("*")
        .eq("id", profile.portal_customer_id)
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "portal_customers lookup by profile link failed",
          details: error.message,
        });
      }

      portalCustomer = data?.[0] ?? null;
    }

    if (!portalCustomer) {
      const { data, error } = await supabaseAdmin
        .from("portal_customers")
        .select("*")
        .eq("email", email)
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "portal_customers lookup by email failed",
          details: error.message,
        });
      }

      portalCustomer = data?.[0] ?? null;
    }

    if (portalCustomer) {
      const portalUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if ((!portalCustomer.full_name || portalCustomer.full_name === "EMPTY") && fullName) portalUpdate.full_name = fullName;
      if ((!portalCustomer.phone || portalCustomer.phone === "EMPTY") && phone) portalUpdate.phone = phone;
      if ((!portalCustomer.service_address || portalCustomer.service_address === "EMPTY") && serviceAddress) {
        portalUpdate.service_address = serviceAddress;
      }
      if ((!portalCustomer.city || portalCustomer.city === "EMPTY") && serviceCity) portalUpdate.city = serviceCity;
      if ((!portalCustomer.state || portalCustomer.state === "EMPTY") && serviceState) portalUpdate.state = serviceState;
      if ((!portalCustomer.zip_code || portalCustomer.zip_code === "EMPTY") && serviceZip) portalUpdate.zip_code = serviceZip;

      const { data, error } = await supabaseAdmin
        .from("portal_customers")
        .update(portalUpdate)
        .eq("id", portalCustomer.id)
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "portal_customers update failed",
          details: error.message,
        });
      }

      portalCustomer = data;
    } else {
      const portalInsertPayload: Record<string, any> = {
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (fullName) portalInsertPayload.full_name = fullName;
      if (phone) portalInsertPayload.phone = phone;
      if (serviceAddress) portalInsertPayload.service_address = serviceAddress;
      if (serviceCity) portalInsertPayload.city = serviceCity;
      if (serviceState) portalInsertPayload.state = serviceState;
      if (serviceZip) portalInsertPayload.zip_code = serviceZip;

      const { data, error } = await supabaseAdmin
        .from("portal_customers")
        .insert(portalInsertPayload)
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "portal_customers insert failed",
          details: error.message,
        });
      }

      portalCustomer = data;
    }

    // 3) CRM CUSTOMER
    // Keep this payload aligned with current DB schema used by the frontend types.
    let crmCustomer: Record<string, any> | null = null;

    {
      const { data, error } = await supabaseAdmin
        .from("customers")
        .select("*")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "CRM customer lookup failed",
          details: error.message,
        });
      }

      crmCustomer = data?.[0] ?? null;
    }

    if (!crmCustomer) {
      const crmInsertPayload: Record<string, any> = {
        email,
        full_name: fullName || email,
        phone: phone || null,
        service_address: serviceAddress || null,
        city: serviceCity || null,
        state: serviceState || null,
        zip_code: serviceZip || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from("customers")
        .insert(crmInsertPayload)
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "CRM customer auto-create failed",
          details: error.message,
        });
      }

      crmCustomer = data;
    }

    if (!crmCustomer?.id) {
      return json(corsHeaders, 500, {
        error: "CRM customer resolution failed",
      });
    }



    // 4) MEMBERSHIP
    let membership: Record<string, any> | null = null;

    if (stripeSubscriptionId) {
      const { data, error } = await supabaseAdmin
        .from("customer_memberships")
        .select("*")
        .eq("stripe_subscription_id", stripeSubscriptionId)
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "membership lookup by stripe_subscription_id failed",
          details: error.message,
        });
      }

      membership = data?.[0] ?? null;
    }

    if (!membership && crmCustomer.id) {
      const { data, error } = await supabaseAdmin
        .from("customer_memberships")
        .select("*")
        .eq("customer_id", crmCustomer.id)
        .limit(1);

      if (error) {
        return json(corsHeaders, 500, {
          error: "membership lookup by customer_id failed",
          details: error.message,
        });
      }

      membership = data?.[0] ?? null;
    }

    const membershipPayload: Record<string, any> = {
      customer_id: crmCustomer.id,
      plan_id: planId,
      status: "active",
      start_date: startDate,
      end_date: endDate,
      stripe_subscription_id: stripeSubscriptionId,
      agreement_signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (membership?.id) {
      const { data, error } = await supabaseAdmin
        .from("customer_memberships")
        .update(membershipPayload)
        .eq("id", membership.id)
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "membership update failed",
          details: error.message,
        });
      }

      membership = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("customer_memberships")
        .insert({
          ...membershipPayload,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        return json(corsHeaders, 500, {
          error: "membership insert failed",
          details: error.message,
        });
      }

      membership = data;
    }

    // 5) Final profile update
    const finalProfileUpdate: Record<string, any> = {
      auth_user_id: userId,
      customer_id: crmCustomer.id,
      portal_customer_id: portalCustomer?.id ?? null,
      customer_membership_id: membership?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    if ((!profile?.full_name || profile.full_name === "EMPTY") && fullName) finalProfileUpdate.full_name = fullName;
    if ((!profile?.phone || profile.phone === "EMPTY") && phone) finalProfileUpdate.phone = phone;
    if ((!profile?.service_address || profile.service_address === "EMPTY") && serviceAddress) {
      finalProfileUpdate.service_address = serviceAddress;
    }
    if ((!profile?.city || profile.city === "EMPTY") && serviceCity) finalProfileUpdate.city = serviceCity;
    if ((!profile?.state || profile.state === "EMPTY") && serviceState) finalProfileUpdate.state = serviceState;
    if ((!profile?.zip_code || profile.zip_code === "EMPTY") && serviceZip) finalProfileUpdate.zip_code = serviceZip;

    if (!profile?.id) {
      return json(corsHeaders, 500, {
        error: "Profile resolution failed before final profile update",
      });
    }

    const { data: finalProfile, error: finalProfileErr } = await supabaseAdmin
      .from("profiles")
      .update(finalProfileUpdate)
      .eq("id", profile.id)
      .select("*")
      .single();

    if (finalProfileErr) {
      return json(corsHeaders, 500, {
        error: "final profile update failed",
        details: finalProfileErr.message,
      });
    }

    return json(corsHeaders, 200, {
      ok: true,
      profile_id: finalProfile.id,
      auth_user_id: userId,
      portal_customer_id: portalCustomer?.id ?? null,
      crm_customer_id: crmCustomer.id,
      membership_id: membership?.id ?? null,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      email,
      message: "Checkout finalized and membership attached.",
    });
  } catch (e: any) {
    return json(corsHeaders, 500, {
      error: "Unhandled finalize-checkout error",
      details: String(e?.message ?? e),
    });
  }
});
