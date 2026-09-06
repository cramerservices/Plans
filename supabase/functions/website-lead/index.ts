import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://cramerservicesllc.com',
  'https://www.cramerservicesllc.com',
  'https://cramerservices.github.io',
]);

function cors(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : 'https://cramerservicesllc.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(status: number, value: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function clean(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] || character));
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Cramer Services <service@cramerservicesllc.com>',
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend error: ${await response.text()}`);
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = cors(origin);

  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(405, { success: false, error: 'Method not allowed' }, headers);
  if (origin && !allowedOrigins.has(origin)) return json(403, { success: false, error: 'Origin not allowed' }, headers);

  try {
    const body = await request.json().catch(() => ({}));
    if (clean(body.company, 200)) return json(200, { success: true }, headers);

    const name = clean(body.name || body.fullName, 120);
    const email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 40);
    const service = clean(body.service || body.serviceType, 120) || 'Service Request';
    const address = clean(body.serviceAddress || body.address, 300);
    const details = clean(body.details || body.message, 4000) || 'No additional details provided.';
    const source = clean(body.source || body.page, 100) || 'website_form';
    const subject = clean(body.subject, 180) || `New Website Request - ${service}`;

    if (!name || !email || !phone || !service) {
      return json(400, { success: false, error: 'Please complete all required fields.' }, headers);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { success: false, error: 'Enter a valid email address.' }, headers);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY is not configured');

    const forwardedFor = clean(request.headers.get('x-forwarded-for'), 200).split(',')[0].trim();
    const clientFingerprint = await sha256(forwardedFor || `email:${email}`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: rateError } = await supabase
      .from('website_lead_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('client_fingerprint', clientFingerprint)
      .gte('created_at', oneHourAgo);
    if (rateError) throw rateError;
    if ((recentCount || 0) >= 10) {
      return json(429, { success: false, error: 'Too many requests. Please call or text us instead.' }, headers);
    }
    const { error: rateInsertError } = await supabase
      .from('website_lead_rate_limits')
      .insert([{ client_fingerprint: clientFingerprint }]);
    if (rateInsertError) throw rateInsertError;

    const leadDetails = address ? `${details}\n\nService address: ${address}` : details;
    const { data: lead, error: leadError } = await supabase
      .from('crm_leads')
      .insert([{
        full_name: name,
        phone,
        email,
        service_type: service,
        details: leadDetails,
        status: 'pending',
        source,
        payment_status: body.paymentStatus || 'unpaid',
        checkout_status: body.checkoutStatus || 'not_started',
      }])
      .select('id')
      .single();
    if (leadError) throw leadError;

    const safe = {
      name: escapeHtml(name), email: escapeHtml(email), phone: escapeHtml(phone),
      service: escapeHtml(service), address: escapeHtml(address), details: escapeHtml(details).replace(/\n/g, '<br>'),
    };

    await sendEmail(
      resendKey,
      'cramerservicesllc@gmail.com',
      subject,
      `<h2>New website request</h2><p><strong>Name:</strong> ${safe.name}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Phone:</strong> ${safe.phone}</p><p><strong>Service:</strong> ${safe.service}</p>${safe.address ? `<p><strong>Address:</strong> ${safe.address}</p>` : ''}<p><strong>Details:</strong><br>${safe.details}</p>`,
      email,
    );

    await sendEmail(
      resendKey,
      email,
      'We received your request — Cramer Services',
      `<p>Hi ${safe.name},</p><p>Thank you for contacting Cramer Services. We received your request for <strong>${safe.service}</strong> and will be in touch soon.</p><p>If you need immediate assistance, call or text <a href="tel:+13142678594">(314) 267-8594</a>.</p><p>Cramer Services</p>`,
      'cramerservicesllc@gmail.com',
    );

    return json(200, { success: true, leadId: lead.id }, headers);
  } catch (error) {
    console.error(error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Could not send request.',
    }, headers);
  }
});
