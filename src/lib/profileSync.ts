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
    return null;
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
