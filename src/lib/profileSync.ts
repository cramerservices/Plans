import { supabase } from './supabase';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type TableName = 'customers' | 'portal_customers';

type EmailMatchRow = {
  id: string;
  email: string | null;
};

async function findByNormalizedEmail(table: TableName, email: string) {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabase
    .from(table)
    .select('id, email')
    .ilike('email', normalizedEmail)
    .limit(10);

  if (error) {
    console.error(`[profile sync] ${table} lookup error:`, error);
    return null;
  }

  const matchedRow = (data as EmailMatchRow[] | null)?.find((row) =>
    normalizeEmail(row.email || '') === normalizedEmail
  ) ?? null;

  return matchedRow;
}

interface SyncProfileParams {
  email: string;
  authUserId: string;
  portalCustomerId?: string | null;
}

async function fallbackSyncProfileClientSide({
  email,
  authUserId,
  customerId,
  portalCustomerId,
}: {
  email: string;
  authUserId: string;
  customerId?: string | null;
  portalCustomerId?: string | null;
}) {
  const normalizedEmail = normalizeEmail(email);

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user || authData.user.id !== authUserId) {
    return null;
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('id, auth_user_id, email, role, customer_id, portal_customer_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (existingProfileError) {
    console.error('[profile sync] fallback profile lookup error:', existingProfileError);
    return null;
  }

  if (existingProfile) {
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({
        email: normalizedEmail || null,
        customer_id: customerId ?? existingProfile.customer_id ?? null,
        portal_customer_id: portalCustomerId ?? existingProfile.portal_customer_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', authUserId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('[profile sync] fallback profile update error:', updateError);
      return null;
    }

    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      email: normalizedEmail || null,
      role: 'customer',
      customer_id: customerId ?? null,
      portal_customer_id: portalCustomerId ?? null,
    })
    .select('*')
    .maybeSingle();

  if (insertError) {
    console.error('[profile sync] fallback profile insert error:', insertError);
    return null;
  }

  return inserted;
}

export async function syncProfileByEmail({
  email,
  authUserId,
  portalCustomerId,
}: SyncProfileParams) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !authUserId) {
    return null;
  }

  const matchedCustomer = await findByNormalizedEmail('customers', normalizedEmail);
  console.log('[profile sync] matched customers result:', matchedCustomer);

  const matchedPortalCustomer =
    portalCustomerId
      ? { id: portalCustomerId, email: normalizedEmail }
      : await findByNormalizedEmail('portal_customers', normalizedEmail);
  console.log('[profile sync] matched portal_customers result:', matchedPortalCustomer);

  const { data, error } = await supabase.rpc('sync_profile_by_email', {
    p_email: normalizedEmail,
    p_auth_user_id: authUserId,
    p_customer_id: matchedCustomer?.id ?? null,
    p_portal_customer_id: matchedPortalCustomer?.id ?? null,
  });

  if (error) {
    console.error('[profile sync] sync_profile_by_email error:', error);

    const canFallbackToClientSync =
      error.code === '42501' ||
      error.code === 'PGRST301' ||
      /permission|policy|row-level security/i.test(error.message || '');

    if (!canFallbackToClientSync) {
      return null;
    }

    const fallbackData = await fallbackSyncProfileClientSide({
      email: normalizedEmail,
      authUserId,
      customerId: matchedCustomer?.id ?? null,
      portalCustomerId: matchedPortalCustomer?.id ?? null,
    });

    if (fallbackData) {
      console.log('[profile sync] fallback client-side sync success:', fallbackData);
    }

    return fallbackData;
  }

  console.log('[profile sync] sync_profile_by_email success result:', data);
  return data;
}

export async function syncProfileWithPortalCustomerId(
  email: string,
  authUserId: string,
  newPortalCustomerId: string
) {
  return syncProfileByEmail({
    email,
    authUserId,
    portalCustomerId: newPortalCustomerId,
  });
}

export { normalizeEmail };
