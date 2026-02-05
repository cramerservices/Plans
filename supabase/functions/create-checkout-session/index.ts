import Stripe from 'https://esm.sh/stripe@18.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const miniSplitHeadPricing: Record<number, { amount: number; stripePriceId: string }> = {
  4: { amount: 340, stripePriceId: 'price_1Sx7Hb4IltCwxOnNaFhEgNOR' },
  5: { amount: 400, stripePriceId: 'price_1Sx7Hq4IltCwxOnNY8mtIhbM' },
  6: { amount: 450, stripePriceId: 'price_1SxZIY4IltCwxOnNCryF0YRo' },
  7: { amount: 475, stripePriceId: 'price_1SxZIn4IltCwxOnNwDOM6KJM' },
  8: { amount: 500, stripePriceId: 'price_1SxZJ14IltCwxOnNvXSBPiXr' },
  9: { amount: 525, stripePriceId: 'price_1SxZJD4IltCwxOnNL1ViF8YA' },
};

const isMiniSplitPlan = (planName?: string | null) =>
  (planName ?? '').toLowerCase().includes('mini split');

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('Missing Authorization header.');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('You must be logged in to checkout.');
    }

    const {
      planId,
      miniSplitHeads,
      fullName,
      email,
      phone,
      serviceAddress,
      city,
      state,
      zipCode,
      agreementSignedAt,
    } = await req.json();

    if (!planId || !email) {
      throw new Error('Missing required checkout fields.');
    }

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: plan, error: planError } = await serviceRoleClient
      .from('maintenance_plans')
      .select('id, name, stripe_price_id, is_active')
      .eq('id', planId)
      .eq('is_active', true)
      .maybeSingle();

    if (planError) {
      throw planError;
    }

    if (!plan) {
      throw new Error('Plan not found.');
    }

    const useMiniSplitTier = isMiniSplitPlan(plan.name);
    const selectedMiniSplitTier = useMiniSplitTier ? miniSplitHeadPricing[Number(miniSplitHeads)] : null;

    if (useMiniSplitTier && !selectedMiniSplitTier) {
      throw new Error('For mini split plans, head count must be between 4 and 9.');
    }

    const stripePriceId = useMiniSplitTier ? selectedMiniSplitTier!.stripePriceId : plan.stripe_price_id;

    if (!stripePriceId) {
      throw new Error('This plan is not connected to Stripe yet. Add stripe_price_id in maintenance_plans.');
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured in Supabase Edge Function secrets.');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
    });

    const { data: customerRecord, error: customerError } = await serviceRoleClient
      .from('customers')
      .upsert(
        {
          id: user.id,
          email,
          full_name: fullName,
          phone,
          service_address: serviceAddress,
          city,
          state,
          zip_code: zipCode,
        },
        { onConflict: 'id' },
      )
      .select('id, stripe_customer_id')
      .single();

    if (customerError) {
      throw customerError;
    }

    let stripeCustomerId = customerRecord.stripe_customer_id;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email,
        name: fullName,
        phone,
        metadata: {
          supabase_user_id: user.id,
        },
        address: {
          line1: serviceAddress,
          city,
          state,
          postal_code: zipCode,
          country: 'US',
        },
      });

      stripeCustomerId = stripeCustomer.id;

      const { error: updateCustomerError } = await serviceRoleClient
        .from('customers')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);

      if (updateCustomerError) {
        throw updateCustomerError;
      }
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/dashboard?checkout=success`,
      cancel_url: `${siteUrl}/checkout/${planId}?checkout=cancelled`,
      metadata: {
        plan_id: planId,
        plan_name: plan.name,
        customer_id: user.id,
        mini_split_heads: useMiniSplitTier ? String(miniSplitHeads) : '',
        mini_split_amount: useMiniSplitTier ? String(selectedMiniSplitTier?.amount) : '',
        agreement_signed_at: agreementSignedAt ?? new Date().toISOString(),
      },
      subscription_data: {
        metadata: {
          plan_id: planId,
          customer_id: user.id,
          mini_split_heads: useMiniSplitTier ? String(miniSplitHeads) : '',
        },
      },
    });

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unable to create checkout session.',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
