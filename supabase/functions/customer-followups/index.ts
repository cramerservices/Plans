import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-followup-secret',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Cramer Services <service@cramerservicesllc.com>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) throw new Error(`Resend error: ${await response.text()}`);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const suppliedSecret = request.headers.get('x-followup-secret') || '';
    const { data: authorized, error: authorizationError } = await supabase.rpc(
      'validate_followup_webhook_secret',
      { supplied_secret: suppliedSecret },
    );

    if (authorizationError || authorized !== true) {
      return json(401, { success: false, error: 'Unauthorized' });
    }

    const body = await request.json().catch(() => ({}));

    if (body.action === 'review_request') {
      const { data: appointment, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', body.appointmentId)
        .single();

      if (error) throw error;
      if (!appointment.customer_id || !appointment.customer_email) {
        return json(200, { success: true, skipped: 'Customer ID or email is missing' });
      }

      const { data: prior } = await supabase
        .from('customer_followup_log')
        .select('id')
        .eq('appointment_id', appointment.id)
        .eq('followup_type', 'review_request')
        .maybeSingle();

      if (prior) return json(200, { success: true, skipped: 'Already sent' });

      const reviewUrl = Deno.env.get('GOOGLE_REVIEW_URL') ||
        'https://www.google.com/search?q=Cramer+Services+LLC+St.+Louis+Missouri';

      await sendEmail(
        appointment.customer_email,
        'How did we do?',
        `<p>Hi ${appointment.customer_name || 'there'},</p>
         <p>Thank you for choosing Cramer Services for your ${appointment.service_type || 'HVAC service'}.</p>
         <p>If you were happy with your service, would you take a moment to leave us a Google review?</p>
         <p><a href="${reviewUrl}" style="display:inline-block;background:#1769ff;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Leave a Google Review</a></p>
         <p>Thank you,<br>Cramer Services<br>(314) 267-8594</p>`,
      );

      await supabase.from('customer_followup_log').insert([{
        customer_id: appointment.customer_id,
        appointment_id: appointment.id,
        followup_type: 'review_request',
        details: { service_date: appointment.appointment_date },
      }]);

      return json(200, { success: true, sent: 1 });
    }

    if (body.action === 'maintenance_scan') {
      const today = new Date();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 30);
      const start = today.toISOString().slice(0, 10);
      const end = cutoff.toISOString().slice(0, 10);

      const { data: dueEquipment, error } = await supabase
        .from('customer_equipment')
        .select('*, customers(id, name, email)')
        .gte('next_service_due', start)
        .lte('next_service_due', end);

      if (error) throw error;

      let sent = 0;
      for (const equipment of dueEquipment || []) {
        const customer = equipment.customers;
        if (!customer?.email) continue;

        const { data: prior } = await supabase
          .from('customer_followup_log')
          .select('id')
          .eq('equipment_id', equipment.id)
          .eq('followup_type', 'maintenance_reminder')
          .contains('details', { due_date: equipment.next_service_due })
          .maybeSingle();

        if (prior) continue;

        await sendEmail(
          customer.email,
          'Your HVAC maintenance is coming due',
          `<p>Hi ${customer.name || 'there'},</p>
           <p>Your ${equipment.equipment_type} is due for annual maintenance around <strong>${equipment.next_service_due}</strong>.</p>
           <p>Scheduling regular maintenance helps keep the system efficient and catches problems before they become expensive repairs.</p>
           <p><a href="https://cramerservices.github.io/Plans/#/schedule" style="display:inline-block;background:#1769ff;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Schedule My Tune-Up</a></p>
           <p>You can also call us at (314) 267-8594.</p>
           <p>Cramer Services</p>`,
        );

        await supabase.from('customer_followup_log').insert([{
          customer_id: customer.id,
          equipment_id: equipment.id,
          followup_type: 'maintenance_reminder',
          details: { due_date: equipment.next_service_due },
        }]);
        sent += 1;
      }

      return json(200, { success: true, sent });
    }

    return json(400, { success: false, error: 'Unknown action' });
  } catch (error) {
    console.error(error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
