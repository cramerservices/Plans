import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  CustomerMembership,
  ServiceCompleted,
  Customer,
  Profile,
} from '../types';
import styles from './CustomerDashboard.module.css'; 

type ServiceDoc = {
  id: string;
  inspection_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  technician_name?: string | null;
  report_url: string;
  created_at: string;
  customer_id?: string | null;
  service_date?: string | null;
  service_type?: string | null;
  storage_path?: string | null;
};

type PortalCustomer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function titleCaseServiceType(raw: string | null | undefined) {
  if (!raw) return 'Service';
  return raw
    .toString()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

function normalizePhone(phone?: string | null) {
  return (phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
}

function freeServiceAllowance(features?: string[] | null) {
  for (const feature of features || []) {
    const match = feature.match(/(\d+)\s+free service/i);
    if (match) return Number(match[1]);
  }
  return 0;
}

function formatAddress(addressObj: {
  service_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}) {
  const parts = [
    addressObj.service_address,
    addressObj.city,
    addressObj.state,
    addressObj.zip_code,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Not provided';
}

async function findCustomerByEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .ilike('email', normalizedEmail)
    .limit(10);

  if (error) throw error;

  const rows = (data as Customer[] | null) ?? [];
  return rows.find((row) => normalizeEmail(row.email) === normalizedEmail) ?? null;
}

async function findCustomerByPhone(phone?: string | null) {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return null;

  const candidates = [
    digits,
    `1${digits}`,
    `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
    `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
  ];

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .in('phone', candidates)
    .limit(10);

  if (error) throw error;
  const rows = (data as Customer[] | null) ?? [];
  return rows.find((row) => normalizePhone(row.phone) === digits) ?? null;
}

async function loadCrmHistory(customerId: string, existingRows: any[]) {
  const [invoiceResult, estimateResult] = await Promise.all([
    supabase
      .from('crm_invoices')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'partial', 'paid', 'overdue'])
      .order('invoice_date', { ascending: false }),
    supabase
      .from('estimates')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'approved', 'job_complete'])
      .order('estimate_date', { ascending: false }),
  ]);

  if (invoiceResult.error) throw invoiceResult.error;
  if (estimateResult.error) throw estimateResult.error;

  const invoices = invoiceResult.data || [];
  const invoiceIds = invoices.map((invoice: any) => invoice.id);
  let invoiceItems: any[] = [];

  if (invoiceIds.length) {
    const { data, error } = await supabase
      .from('crm_invoice_line_items')
      .select('invoice_id, description')
      .in('invoice_id', invoiceIds);
    if (error) throw error;
    invoiceItems = data || [];
  }

  const mirrorByInvoice = new Map<string, any>();
  const mirrorByEstimate = new Map<string, any>();
  const nonCrmRows: any[] = [];

  for (const row of existingRows) {
    const payload = row.payload || {};
    const kind = String(payload.kind || row.service_type || '').toLowerCase();
    const invoiceId = row.invoice_id || payload.invoice_id;
    const estimateId = row.estimate_id || payload.estimate_id;
    if (kind === 'invoice' && invoiceId) mirrorByInvoice.set(invoiceId, row);
    else if (kind === 'estimate' && estimateId) mirrorByEstimate.set(estimateId, row);
    else nonCrmRows.push(row);
  }

  const invoiceRows = invoices.map((invoice: any) => {
    const mirror = mirrorByInvoice.get(invoice.id);
    const isFreeService = invoiceItems.some(
      (item: any) =>
        item.invoice_id === invoice.id &&
        /^free service\b/i.test(String(item.description || '').trim())
    );
    return {
      ...mirror,
      id: mirror?.id || `crm-invoice-${invoice.id}`,
      customer_id: customerId,
      invoice_id: invoice.id,
      service_type: 'invoice',
      service_date: invoice.invoice_date,
      technician_name: invoice.tech_name,
      summary: `Invoice ${invoice.invoice_number} ${invoice.status}. Balance due: $${Number(invoice.amount_due || 0).toFixed(2)}`,
      created_at: invoice.created_at,
      completed_at: invoice.updated_at,
      payload: {
        ...(mirror?.payload || {}),
        kind: 'invoice',
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        estimate_id: invoice.estimate_id || null,
        status: invoice.status,
        total_amount: Number(invoice.total_amount || 0),
        amount_paid: Number(invoice.amount_paid || 0),
        amount_due: Number(invoice.amount_due || 0),
        free_service_applied: isFreeService,
      },
    };
  });

  const estimateRows = (estimateResult.data || []).map((estimate: any) => {
    const mirror = mirrorByEstimate.get(estimate.id);
    return {
      ...mirror,
      id: mirror?.id || `crm-estimate-${estimate.id}`,
      customer_id: customerId,
      estimate_id: estimate.id,
      service_type: 'estimate',
      service_date: estimate.estimate_date,
      technician_name: estimate.tech_name,
      summary: `Estimate ${estimate.estimate_number} ${String(estimate.status).replace(/_/g, ' ')} for $${Number(estimate.total_amount || 0).toFixed(2)}`,
      created_at: estimate.created_at,
      completed_at: estimate.updated_at,
      payload: {
        ...(mirror?.payload || {}),
        kind: 'estimate',
        estimate_id: estimate.id,
        estimate_number: estimate.estimate_number,
        status: estimate.status,
        total_amount: Number(estimate.total_amount || 0),
      },
    };
  });

  return [...nonCrmRows, ...invoiceRows, ...estimateRows].sort((a, b) => {
    const aDate = new Date(a.service_date || a.completed_at || a.created_at || 0).getTime();
    const bDate = new Date(b.service_date || b.completed_at || b.created_at || 0).getTime();
    return bDate - aDate;
  });
}

async function loadFreeServiceUsage(customerId: string) {
  const { data: invoices, error: invoicesError } = await supabase
    .from('crm_invoices')
    .select('id')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled');
  if (invoicesError) throw invoicesError;

  const ids = (invoices || []).map((invoice: any) => invoice.id);
  if (!ids.length) return 0;

  const { data: items, error: itemsError } = await supabase
    .from('crm_invoice_line_items')
    .select('invoice_id, description')
    .in('invoice_id', ids)
    .ilike('description', 'Free Service%');
  if (itemsError) throw itemsError;
  return new Set((items || []).map((item: any) => item.invoice_id)).size;
}

async function findPortalCustomerByEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from('portal_customers')
    .select('*')
    .ilike('email', normalizedEmail)
    .limit(10);

  if (error) throw error;

  const rows = (data as PortalCustomer[] | null) ?? [];
  return rows.find((row) => normalizeEmail(row.email) === normalizedEmail) ?? null;
}

export default function CustomerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

 const [profile, setProfile] = useState<Profile | null>(null);
const [customer, setCustomer] = useState<Customer | null>(null);
const [portalCustomer, setPortalCustomer] = useState<PortalCustomer | null>(null);
const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
const [services, setServices] = useState<ServiceCompleted[]>([]);
const [serviceDocs, setServiceDocs] = useState<ServiceDoc[]>([]);
const [freeServicesUsed, setFreeServicesUsed] = useState(0);
const [loading, setLoading] = useState(true);

const [isEditingContact, setIsEditingContact] = useState(false);
const [contactForm, setContactForm] = useState({
  email: '',
  phone: '',
  service_address: '',
  city: '',
  state: '',
  zip_code: '',
});
const [contactSaving, setContactSaving] = useState(false);
const [contactError, setContactError] = useState<string | null>(null);
const [contactSuccess, setContactSuccess] = useState<string | null>(null);

const [actionError, setActionError] = useState<string | null>(null);
const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        if (authLoading) return;

        if (!user?.id) {
          setProfile(null);
          setCustomer(null);
          setPortalCustomer(null);
          setMemberships([]);
          setServices([]);
          setServiceDocs([]);
          setFreeServicesUsed(0);
          return;
        }

        let profileRow: Profile | null = null;

        const { data: profileByAuth, error: profileByAuthError } = await supabase
          .from('profiles')
          .select(
            'id, auth_user_id, email, role, customer_id, portal_customer_id, customer_membership_id, created_at, updated_at'
          )
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (profileByAuthError) {
          console.warn(
            '[Plans linkage] profiles lookup by auth_user_id blocked:',
            profileByAuthError.message
          );
        } else {
          profileRow = (profileByAuth as Profile | null) ?? null;
        }

        if (!profileRow && user.email) {
          const { data: profileByEmail, error: profileByEmailError } = await supabase
            .from('profiles')
            .select(
              'id, auth_user_id, email, role, customer_id, portal_customer_id, customer_membership_id, created_at, updated_at'
            )
            .ilike('email', normalizeEmail(user.email))
            .limit(10);

          if (profileByEmailError) {
            console.warn(
              '[Plans linkage] profiles lookup by email blocked:',
              profileByEmailError.message
            );
          } else {
            const rows = (profileByEmail as Profile[] | null) ?? [];
            profileRow =
              rows.find(
                (row) => normalizeEmail((row as any).email) === normalizeEmail(user.email)
              ) ?? null;
          }
        }

        console.log('[Plans linkage] user.id:', user.id);
        console.log('[Plans linkage] user.email:', user.email);
        console.log('[Plans linkage] loaded profile:', profileRow);

        setProfile(profileRow);

        let loadedCustomer: Customer | null = null;

        if (profileRow?.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', profileRow.customer_id)
            .maybeSingle();

          if (customerError) throw customerError;
          loadedCustomer = (customerData as Customer | null) ?? null;
          console.log(
            '[Plans linkage] loaded customer from profile.customer_id:',
            loadedCustomer
          );
        }

        if (!loadedCustomer) {
          loadedCustomer = await findCustomerByEmail(profileRow?.email || user.email);
          console.log(
            '[Plans linkage] loaded customer from email fallback:',
            loadedCustomer
          );
        }

        if (!loadedCustomer) {
          loadedCustomer = await findCustomerByPhone(user.user_metadata?.phone || null);
          console.log(
            '[Plans linkage] loaded customer from phone fallback:',
            loadedCustomer
          );
        }

        setCustomer(loadedCustomer);

        let loadedPortalCustomer: PortalCustomer | null = null;

        if (profileRow?.portal_customer_id) {
          const { data: portalData, error: portalError } = await supabase
            .from('portal_customers')
            .select('*')
            .eq('id', profileRow.portal_customer_id)
            .maybeSingle();

          if (portalError) throw portalError;
          loadedPortalCustomer = (portalData as PortalCustomer | null) ?? null;
          console.log(
            '[Plans linkage] loaded portal customer from profile.portal_customer_id:',
            loadedPortalCustomer
          );
        }

        if (!loadedPortalCustomer) {
          loadedPortalCustomer = await findPortalCustomerByEmail(
            profileRow?.email || user.email
          );
          console.log(
            '[Plans linkage] loaded portal customer from email fallback:',
            loadedPortalCustomer
          );
        }

        setPortalCustomer(loadedPortalCustomer);

      setContactForm({
  email:
    normalizeEmail(profileRow?.email) ||
    normalizeEmail(loadedPortalCustomer?.email) ||
    normalizeEmail(loadedCustomer?.email) ||
    '',
  phone: loadedPortalCustomer?.phone || loadedCustomer?.phone || '',
  service_address:
    loadedCustomer?.service_address ||
    loadedPortalCustomer?.service_address ||
    '',
  city: loadedCustomer?.city || loadedPortalCustomer?.city || '',
  state: loadedCustomer?.state || loadedPortalCustomer?.state || '',
  zip_code: loadedCustomer?.zip_code || loadedPortalCustomer?.zip_code || '',
});

        let loadedMemberships: CustomerMembership[] = [];

        if (profileRow?.customer_membership_id) {
          const { data: membershipData, error: membershipError } = await supabase
            .from('customer_memberships')
            .select('*, plan:maintenance_plans(*)')
            .eq('id', profileRow.customer_membership_id)
            .limit(1);

          if (membershipError) throw membershipError;
          loadedMemberships = (membershipData as CustomerMembership[]) || [];
          console.log(
            '[Plans linkage] loaded membership from profile.customer_membership_id:',
            loadedMemberships[0] ?? null
          );
        }

        if (loadedMemberships.length === 0 && profileRow?.portal_customer_id) {
          const { data: membershipData, error: membershipError } = await supabase
            .from('customer_memberships')
            .select('*, plan:maintenance_plans(*)')
            .eq('customer_id', profileRow.portal_customer_id)
            .order('created_at', { ascending: false });

          if (membershipError) throw membershipError;
          loadedMemberships = (membershipData as CustomerMembership[]) || [];
          console.log(
            '[Plans linkage] loaded memberships from profile.portal_customer_id:',
            loadedMemberships
          );
        }

        if (loadedMemberships.length === 0 && loadedPortalCustomer?.id) {
          const { data: membershipData, error: membershipError } = await supabase
            .from('customer_memberships')
            .select('*, plan:maintenance_plans(*)')
            .eq('customer_id', loadedPortalCustomer.id)
            .order('created_at', { ascending: false });

          if (membershipError) throw membershipError;
          loadedMemberships = (membershipData as CustomerMembership[]) || [];
          console.log(
            '[Plans linkage] loaded memberships from portal customer fallback:',
            loadedMemberships
          );
        }

        if (loadedMemberships.length === 0 && user.id) {
          const { data: membershipData, error: membershipError } = await supabase
            .from('customer_memberships')
            .select('*, plan:maintenance_plans(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (membershipError) throw membershipError;
          loadedMemberships = (membershipData as CustomerMembership[]) || [];
          console.log(
            '[Plans linkage] loaded memberships from user_id fallback:',
            loadedMemberships
          );
        }

        setMemberships(loadedMemberships);

        const customerIdList = loadedCustomer?.id ? [loadedCustomer.id] : [];
        console.log('[Plans linkage] customerIdList:', customerIdList);

        let servicesData: any[] = [];

        if (customerIdList.length > 0) {
          const { data, error } = await supabase
            .from('services_completed')
            .select('*')
            .in('customer_id', customerIdList)
            .order('completed_at', { ascending: false, nullsFirst: false })
            .order('service_date', { ascending: false, nullsFirst: false });

          console.log('[Plans linkage] services query error:', error);
          console.log('[Plans linkage] services query data:', data);

          if (error) throw error;
          servicesData = data || [];
        } else {
          console.log('[Plans linkage] missing CRM customer id: cannot load services');
        }

        if (
          servicesData.length === 0 &&
          (loadedCustomer?.email || profileRow?.email || user.email)
        ) {
          const fallbackEmail = normalizeEmail(
            loadedCustomer?.email || profileRow?.email || user.email
          );

          console.log(
            '[Plans linkage] trying service history email fallback:',
            fallbackEmail
          );

          const matchedCustomer = await findCustomerByEmail(fallbackEmail);

          if (
            matchedCustomer?.id &&
            (!loadedCustomer || matchedCustomer.id !== loadedCustomer.id)
          ) {
            console.log(
              '[Plans linkage] email fallback matched CRM customer:',
              matchedCustomer
            );
            setCustomer(matchedCustomer);
            loadedCustomer = matchedCustomer;

            const { data, error } = await supabase
              .from('services_completed')
              .select('*')
              .eq('customer_id', matchedCustomer.id)
              .order('completed_at', { ascending: false, nullsFirst: false })
              .order('service_date', { ascending: false, nullsFirst: false });

            console.log('[Plans linkage] services fallback query error:', error);
            console.log('[Plans linkage] services fallback query data:', data);

            if (error) throw error;
            servicesData = data || [];
          }
        }

        if (loadedCustomer?.id) {
          servicesData = await loadCrmHistory(loadedCustomer.id, servicesData);
          setFreeServicesUsed(await loadFreeServiceUsage(loadedCustomer.id));
        } else {
          setFreeServicesUsed(0);
        }

        console.log('[Plans linkage] final servicesData:', servicesData);
        setServices(servicesData as any);

        let docsData: any[] = [];
        const finalCustomerId = loadedCustomer?.id;

        if (finalCustomerId) {
          const { data, error } = await supabase
            .from('service_docs')
            .select('*')
            .eq('customer_id', finalCustomerId)
            .order('created_at', { ascending: false });

          console.log('[Plans linkage] service_docs query error:', error);
          console.log('[Plans linkage] service_docs query data:', data);

          if (error) throw error;
          docsData = data || [];
        } else {
          console.log('[Plans linkage] missing CRM customer id: cannot load service docs');
        }

        setServiceDocs(docsData as any);
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id, user?.email, authLoading]);

  const activeMembership = useMemo(() => {
    return memberships.find((m: any) => m.status === 'active') || null;
  }, [memberships]);

  const freeServicesRemaining = useMemo(() => {
    if (!activeMembership) return 0;
    const allowance = freeServiceAllowance((activeMembership as any).plan?.features);
    return Math.max(allowance - freeServicesUsed, 0);
  }, [activeMembership, freeServicesUsed]);

  const saveContact = async () => {
    if (!user?.id) return;

    setContactSaving(true);
    setContactError(null);
    setContactSuccess(null);

    try {
      const normalizedEmail = normalizeEmail(contactForm.email);

      if (profile?.auth_user_id) {
        const { error } = await supabase
          .from('profiles')
          .update({
            email: normalizedEmail || null,
            updated_at: new Date().toISOString(),
          })
          .eq('auth_user_id', user.id);

        if (error) throw error;
      }
if (portalCustomer?.id) {
  const { error } = await supabase
    .from('portal_customers')
    .update({
      email: normalizedEmail || null,
      phone: contactForm.phone || null,
      service_address: contactForm.service_address || null,
      city: contactForm.city || null,
      state: contactForm.state || null,
      zip_code: contactForm.zip_code || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', portalCustomer.id);

  if (error) throw error;
}
if (customer?.id) {
  const { error } = await supabase
    .from('customers')
    .update({
      email: normalizedEmail || null,
      phone: contactForm.phone || null,
      service_address: contactForm.service_address || null,
      city: contactForm.city || null,
      state: contactForm.state || null,
      zip_code: contactForm.zip_code || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id);

  if (error) throw error;
}
      setProfile((prev) =>
        prev
          ? ({
              ...prev,
              email: normalizedEmail || null,
            } as Profile)
          : prev
      );

    setPortalCustomer((prev) =>
  prev
    ? ({
        ...prev,
        email: normalizedEmail || prev.email,
        phone: contactForm.phone || prev.phone,
        service_address: contactForm.service_address || prev.service_address,
        city: contactForm.city || prev.city,
        state: contactForm.state || prev.state,
        zip_code: contactForm.zip_code || prev.zip_code,
      } as PortalCustomer)
    : prev
);

setCustomer((prev) =>
  prev
    ? ({
        ...prev,
        email: normalizedEmail || prev.email,
        phone: contactForm.phone || prev.phone,
        service_address: contactForm.service_address || prev.service_address,
        city: contactForm.city || prev.city,
        state: contactForm.state || prev.state,
        zip_code: contactForm.zip_code || prev.zip_code,
      } as Customer)
    : prev
);

      setContactSuccess('Saved.');
      setIsEditingContact(false);
    } catch (error: any) {
      setContactError(error?.message || 'Failed to save.');
    } finally {
      setContactSaving(false);
    }
  };




const syncEstimateToServicesCompleted = async (
  estimateId: string,
  pdfUrl: string | null = null
) => {
  const { data: estimateRow, error: estimateError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single();

  if (estimateError) throw estimateError;

  const estimate = estimateRow as any;

  const { data: existingRow, error: existingError } = await supabase
    .from('services_completed')
    .select('id, payload, pdf_path')
    .eq('estimate_id', estimate.id)
    .maybeSingle();

  if (existingError) throw existingError;

  const existingPayload = (existingRow?.payload ?? {}) as any;

  const finalPdfUrl =
    pdfUrl ||
    existingPayload?.pdf_url ||
    existingRow?.pdf_path ||
    null;

  const payload = {
    kind: 'estimate',
    estimate_id: estimate.id,
    estimate_number: estimate.estimate_number,
    status: estimate.status,
    total_amount: Number(estimate.total_amount || 0),
    approved: estimate.status === 'approved',
    pdf_url: finalPdfUrl,
  };

  const summary = `Estimate ${estimate.estimate_number} ${estimate.status} for $${Number(
    estimate.total_amount || 0
  ).toFixed(2)}`;

  const mirrorRow = {
    customer_id: estimate.customer_id,
    estimate_id: estimate.id,
    invoice_id: null,
    service_type: 'estimate',
    service_date: estimate.estimate_date,
    technician_name: estimate.tech_name,
    summary,
    pdf_path: finalPdfUrl,
    payload,
    completed_at: new Date().toISOString(),
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from('services_completed')
    .update(mirrorRow)
    .eq('estimate_id', estimate.id)
    .select('id');

  if (updateError) throw updateError;

  if (updatedRows && updatedRows.length > 0) return;

  const { error: insertError } = await supabase
    .from('services_completed')
    .insert(mirrorRow);

  if (insertError) {
    if (insertError.code === '23505') {
      const { error: retryUpdateError } = await supabase
        .from('services_completed')
        .update(mirrorRow)
        .eq('estimate_id', estimate.id);

      if (retryUpdateError) throw retryUpdateError;
      return;
    }

    throw insertError;
  }
};
  
const handleEstimateDecision = async (
  serviceId: string,
  estimateId: string | null | undefined,
  newStatus: 'approved' | 'rejected'
) => {
  if (!estimateId) return;

  setActionError(null);
  setActionBusyId(serviceId);

  try {
    const { error: estimateUpdateError } = await supabase
      .from('estimates')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', estimateId);

    if (estimateUpdateError) throw estimateUpdateError;

    await syncEstimateToServicesCompleted(estimateId, null);

    const { data: refreshedServices, error: refreshedServicesError } = await supabase
      .from('services_completed')
      .select('*')
      .eq('customer_id', customer?.id)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('service_date', { ascending: false, nullsFirst: false });

    if (refreshedServicesError) throw refreshedServicesError;

    setServices((refreshedServices || []) as any[]);
  } catch (e: any) {
    setActionError(e?.message || 'Failed to update estimate');
  } finally {
    setActionBusyId(null);
  }
};const handlePayInvoice = (invoiceId: string | undefined | null) => {
  if (!invoiceId) return;
  navigate(`/invoice-checkout?invoiceId=${encodeURIComponent(invoiceId)}`);
};

  const handleOpenServiceDocPdf = (doc: ServiceDoc) => {
    if (doc.report_url) {
      window.open(doc.report_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenHistoryPdf = (url?: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const visibleServices = useMemo(() => {
    return services.filter((s: any) => {
      const payload = (s.payload ?? {}) as any;
      const kind = (payload.kind || s.service_type || '').toString().toLowerCase();
      const status = (payload.status || '').toString().toLowerCase();

      if (kind === 'estimate') {
        return status === 'sent' || status === 'approved' || status === 'job_complete';
      }

      if (kind === 'invoice') {
        return ['sent', 'partial', 'overdue', 'paid'].includes(status);
      }

      return true;
    });
  }, [services]);

  if (loading || authLoading) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Header />

      <div className={styles.content}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Welcome back, Customer!</h1>
            <p className={styles.subtitle}>Manage your membership, estimates, invoices, and service history</p>
          </div>
        </div>

        {!activeMembership ? (
          <div className={styles.noMembership}>
            <h2>No Active Membership</h2>
            <p>You don't have an active membership yet. View our plans to get started!</p>
            <Link to="/plans" className={styles.plansButton}>
              View Plans
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Current Membership</h2>
                <div className={styles.membershipInfo}>
                  <div className={styles.planName}>{(activeMembership as any).plan?.name}</div>
                  <div className={styles.planStatus}>
                    <span className={styles.statusBadge}>{(activeMembership as any).status}</span>
                  </div>

                  <div className={styles.membershipDetails}>
                    <div className={styles.detailRow}>
                      <span>Plan Type:</span>
                      <strong>{(activeMembership as any).plan?.name}</strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Start Date:</span>
                      <strong>
                        {new Date((activeMembership as any).start_date).toLocaleDateString()}
                      </strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>End Date:</span>
                      <strong>
                        {new Date((activeMembership as any).end_date).toLocaleDateString()}
                      </strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Discount on Repairs:</span>
                      <strong>{(activeMembership as any).plan?.discount_percentage}%</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Benefits Remaining</h2>
                <div className={styles.benefits}>
                  <div className={styles.benefitItem}>
                    <div className={styles.benefitNumber}>
                      {(activeMembership as any).tune_ups_remaining}
                    </div>
                    <div className={styles.benefitLabel}>
                      Tune-Up{(activeMembership as any).tune_ups_remaining !== 1 ? 's' : ''}{' '}
                      Remaining
                    </div>
                  </div>

                  {freeServiceAllowance((activeMembership as any).plan?.features) > 0 && (
                    <div className={styles.benefitItem}>
                      <div className={styles.benefitNumber}>{freeServicesRemaining}</div>
                      <div className={styles.benefitLabel}>
                        Free Service{freeServicesRemaining !== 1 ? 's' : ''} Remaining
                      </div>
                    </div>
                  )}

                  {(activeMembership as any).plan?.priority_service && (
                    <div className={styles.benefitBadge}>
                      <span>✓</span> Priority Service Active
                    </div>
                  )}

                  <div className={styles.benefitNote}>
                    Ready to schedule your next tune-up? Call us at (314) 267-8594
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Plan Features</h2>
              <div className={styles.featuresList}>
                {(activeMembership as any).plan?.features?.map(
                  (feature: string, index: number) => (
                    <div key={index} className={styles.featureItem}>
                      <span className={styles.checkIcon}>✓</span>
                      {feature}
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Tune-Up Reports</h2>
              {serviceDocs.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No tune-up reports yet.</p>
                  <p className={styles.emptyStateNote}>
                    Your tune-up reports will appear here after your first tune-up.
                  </p>
                </div>
              ) : (
                <div className={styles.servicesList}>
                  {serviceDocs.map((doc) => (
                    <div key={doc.id} className={styles.serviceCard}>
                      <div className={styles.serviceHeader}>
                        <div>
                          <h3 className={styles.serviceType}>
                            {titleCaseServiceType(doc.service_type)}
                          </h3>
                          <p className={styles.serviceDate}>
                            {doc.service_date
                              ? new Date(doc.service_date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })
                              : new Date(doc.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          {doc.technician_name && (
                            <span className={styles.techBadge}>
                              Technician: {doc.technician_name}
                            </span>
                          )}
                          <button
                            type="button"
                            className={styles.pdfButton}
                            onClick={() => handleOpenServiceDocPdf(doc)}
                          >
                            View Report PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Service History</h2>

              {actionError && <div className={styles.error}>{actionError}</div>}

              {visibleServices.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No service history yet.</p>
                  <p className={styles.emptyStateNote}>
                    Invoices, estimates, and other services will appear here.
                  </p>
                </div>
              ) : (
                <div className={styles.servicesList}>
                  {visibleServices.map((s: any) => {
                    const payload = (s.payload ?? {}) as any;
                    const kind = (payload.kind || s.service_type || '').toString().toLowerCase();
                    const pdfUrl = s.pdf_path || payload.pdf_url || null;
                    const dateStr = new Date(
                      s.service_date || s.completed_at || s.created_at || Date.now()
                    ).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });

                    if (kind === 'invoice') {
                      const invoiceNumber = payload.invoice_number || '';
                      const totalAmount = Number(payload.total_amount ?? 0);
                      const amountPaid = Number(payload.amount_paid ?? 0);
                      const amountDue = Number(payload.amount_due ?? 0);
                      const status = (payload.status || 'draft').toString().toLowerCase();
                      const canPay =
                        ['sent', 'partial', 'overdue'].includes(status) && amountDue > 0;

                      return (
                        <div key={s.id} className={styles.serviceCard}>
                          <div className={styles.serviceHeader}>
                            <div>
                              <h3 className={styles.serviceType}>
                                Invoice {invoiceNumber || ''}
                              </h3>
                              <p className={styles.serviceDate}>{dateStr}</p>
                              <p className={styles.serviceTech}>Status: {status}</p>
                              <p className={styles.serviceTech}>
                                Total: ${totalAmount.toFixed(2)}
                              </p>
                              <p className={styles.serviceTech}>
                                Paid: ${amountPaid.toFixed(2)}
                              </p>
                              <p className={styles.serviceTech}>
                                Balance Due: ${amountDue.toFixed(2)}
                              </p>
                              {s.summary && <p className={styles.serviceTech}>{s.summary}</p>}
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                              }}
                            >
                              {pdfUrl && (
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                >
                                  View PDF
                                </button>
                              )}

                              {canPay && (
                                <button
                                  type="button"
                                  className={styles.pdfButton}
                                  onClick={() =>
                                    handlePayInvoice(payload.invoice_id || s.invoice_id)
                                  }
                                  disabled={!(payload.invoice_id || s.invoice_id)}
                                >
                                  Pay
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (kind === 'estimate') {
                      const estimateNumber = payload.estimate_number || '';
                      const totalAmount = Number(payload.total_amount ?? 0);
                      const status = (payload.status || 'draft').toString().toLowerCase();
                      const estimateId = payload.estimate_id || s.estimate_id || null;

                      return (
                        <div key={s.id} className={styles.serviceCard}>
                          <div className={styles.serviceHeader}>
                            <div>
                              <h3 className={styles.serviceType}>
                                Estimate {estimateNumber || ''}
                              </h3>
                              <p className={styles.serviceDate}>{dateStr}</p>
                              <p className={styles.serviceTech}>Status: {status}</p>
                              <p className={styles.serviceTech}>
                                Total: ${totalAmount.toFixed(2)}
                              </p>
                              {s.summary && <p className={styles.serviceTech}>{s.summary}</p>}
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                              }}
                            >
                              {pdfUrl && (
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                >
                                  View PDF
                                </button>
                              )}

                              {status === 'sent' && (
                                <>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    disabled={actionBusyId === s.id}
                                    onClick={() =>
                                      handleEstimateDecision(s.id, estimateId, 'rejected')
                                    }
                                  >
                                    Reject
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.pdfButton}
                                    disabled={actionBusyId === s.id}
                                    onClick={() =>
                                      handleEstimateDecision(s.id, estimateId, 'approved')
                                    }
                                  >
                                    Approve
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={s.id} className={styles.serviceCard}>
                        <div className={styles.serviceHeader}>
                          <div>
                            <h3 className={styles.serviceType}>
                              {titleCaseServiceType(s.service_type)}
                            </h3>
                            <p className={styles.serviceDate}>{dateStr}</p>
                            {s.summary && <p className={styles.serviceTech}>{s.summary}</p>}
                          </div>

                          {pdfUrl && (
                            <div
                              style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                              }}
                            >
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => handleOpenHistoryPdf(pdfUrl)}
                              >
                                View PDF
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Contact Information</h2>

                {!isEditingContact ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setIsEditingContact(true)}
                  >
                    Edit
                  </button>
                ) : (
                  <div className={styles.contactActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setIsEditingContact(false);
                        setContactError(null);
                        setContactSuccess(null);
                     setContactForm({
  email:
    profile?.email || portalCustomer?.email || customer?.email || '',
  phone: portalCustomer?.phone || customer?.phone || '',
  service_address:
    customer?.service_address || portalCustomer?.service_address || '',
  city: customer?.city || portalCustomer?.city || '',
  state: customer?.state || portalCustomer?.state || '',
  zip_code: customer?.zip_code || portalCustomer?.zip_code || '',
});
                      }}
                      disabled={contactSaving}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className={styles.pdfButton}
                      onClick={saveContact}
                      disabled={contactSaving}
                    >
                      {contactSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {contactError && <div className={styles.error}>{contactError}</div>}
              {contactSuccess && <div className={styles.success}>{contactSuccess}</div>}

              <div className={styles.contactInfo}>
                <div className={styles.contactItem}>
                  <span className={styles.contactLabel}>Email:</span>
                  {!isEditingContact ? (
                    <strong className={styles.contactValue}>
                      {profile?.email ||
                        portalCustomer?.email ||
                        customer?.email ||
                        'Not provided'}
                    </strong>
                  ) : (
                    <input
                      value={contactForm.email}
                      onChange={(e) =>
                        setContactForm((p) => ({ ...p, email: e.target.value }))
                      }
                      type="email"
                      className={styles.contactInput}
                    />
                  )}
                </div>

                <div className={styles.contactItem}>
                  <span className={styles.contactLabel}>Phone:</span>
                  {!isEditingContact ? (
                    <strong className={styles.contactValue}>
                      {portalCustomer?.phone || customer?.phone || 'Not provided'}
                    </strong>
                  ) : (
                    <input
                      value={contactForm.phone}
                      onChange={(e) =>
                        setContactForm((p) => ({ ...p, phone: e.target.value }))
                      }
                      type="tel"
                      placeholder="(555) 123-4567"
                      className={styles.contactInput}
                    />
                  )}
                </div>

               <div className={styles.contactItem}>
  <span className={styles.contactLabel}>Service Address:</span>
  {!isEditingContact ? (
    <strong className={styles.contactValue}>
      {contactForm.service_address || contactForm.city || contactForm.state || contactForm.zip_code
        ? formatAddress({
            service_address: contactForm.service_address,
            city: contactForm.city,
            state: contactForm.state,
            zip_code: contactForm.zip_code,
          })
        : 'Not provided'}
    </strong>
  ) : (
    <div style={{ display: 'grid', gap: 10, width: '100%' }}>
      <input
        value={contactForm.service_address}
        onChange={(e) =>
          setContactForm((p) => ({ ...p, service_address: e.target.value }))
        }
        type="text"
        placeholder="Street address"
        className={styles.contactInput}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <input
          value={contactForm.city}
          onChange={(e) =>
            setContactForm((p) => ({ ...p, city: e.target.value }))
          }
          type="text"
          placeholder="City"
          className={styles.contactInput}
        />
        <input
          value={contactForm.state}
          onChange={(e) =>
            setContactForm((p) => ({ ...p, state: e.target.value }))
          }
          type="text"
          placeholder="State"
          className={styles.contactInput}
        />
        <input
          value={contactForm.zip_code}
          onChange={(e) =>
            setContactForm((p) => ({ ...p, zip_code: e.target.value }))
          }
          type="text"
          placeholder="ZIP"
          className={styles.contactInput}
        />
      </div>
    </div>
  )}
</div>
              </div>
            </div>
      </div>
    </div>
  );
}
