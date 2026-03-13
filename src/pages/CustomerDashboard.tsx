import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CustomerMembership, ServiceCompleted, Customer, Profile } from '../types';
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

export default function CustomerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
  const [services, setServices] = useState<ServiceCompleted[]>([]);
  const [serviceDocs, setServiceDocs] = useState<ServiceDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ email: '', phone: '' });
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
          setMemberships([]);
          setServices([]);
          setServiceDocs([]);
          return;
        }

        // 1) Load central profile by auth user id
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, auth_user_id, email, role, customer_id, portal_customer_id, customer_membership_id, created_at, updated_at')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (profileError) {
          console.warn('[Plans linkage] profiles lookup blocked, using email fallback:', profileError.message);
        }

        const profileRow = profileError ? null : (profileData as Profile | null) ?? null;
        console.log('[Plans linkage] loaded profile:', profileRow);

        setProfile(profileRow);

        // 2) Load linked customer via profiles.customer_id -> customers.id
        let loadedCustomer: Customer | null = null;
        if (profileRow?.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', profileRow.customer_id)
            .maybeSingle();

          if (customerError) throw customerError;

          loadedCustomer = (customerData as Customer | null) ?? null;
          console.log('[Plans linkage] loaded customer:', loadedCustomer);
        } else {
          loadedCustomer = await findCustomerByEmail(profileRow?.email || user.email);
          console.log('[Plans linkage] loaded customer from email fallback:', loadedCustomer);
        }

        setCustomer(loadedCustomer);
        setContactForm({
          email: normalizeEmail(profileRow?.email) || loadedCustomer?.email || '',
          phone: loadedCustomer?.phone || '',
        });

        // 3) Load linked membership via profiles.customer_membership_id -> customer_memberships.id
        let loadedMemberships: CustomerMembership[] = [];
        if (profileRow?.customer_membership_id) {
          const { data: membershipData, error: membershipError } = await supabase
            .from('customer_memberships')
            .select('*, plan:maintenance_plans(*)')
            .eq('id', profileRow.customer_membership_id)
            .limit(1);

          if (membershipError) throw membershipError;

          loadedMemberships = (membershipData as CustomerMembership[]) || [];
          console.log('[Plans linkage] loaded membership:', loadedMemberships[0] ?? null);
        } else {
          if (loadedCustomer?.id) {
            const { data: membershipData, error: membershipError } = await supabase
              .from('customer_memberships')
              .select('*, plan:maintenance_plans(*)')
              .eq('customer_id', loadedCustomer.id)
              .order('created_at', { ascending: false });

            if (membershipError) throw membershipError;

            loadedMemberships = (membershipData as CustomerMembership[]) || [];
            console.log('[Plans linkage] loaded memberships from customer fallback:', loadedMemberships);
          } else {
            console.log('[Plans linkage] missing linkage values: no customer found for user');
          }
        }

        setMemberships(loadedMemberships);

        const customerIdList = loadedCustomer?.id ? [loadedCustomer.id] : [];

        // 4) Service history
        let servicesData: any[] = [];
        if (customerIdList.length > 0) {
          const { data, error } = await supabase
            .from('services_completed')
            .select('*')
            .in('customer_id', customerIdList)
            .order('service_date', { ascending: false });

          if (error) throw error;
          servicesData = data || [];
        } else {
          console.log('[Plans linkage] missing linkage values: cannot load services without profiles.customer_id');
        }

        setServices(servicesData as any);

        // 5) Service docs
        let docsData: any[] = [];
        if (customerIdList.length > 0) {
          const { data, error } = await supabase
            .from('service_docs')
            .select('*')
            .in('customer_id', customerIdList)
            .order('created_at', { ascending: false });

          if (error) throw error;
          docsData = data || [];
        }

        setServiceDocs(docsData as any);
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id, authLoading]);

  const activeMembership = useMemo(() => {
    return memberships.find((m: any) => m.status === 'active') || null;
  }, [memberships]);

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

      if (customer?.id) {
        const { error } = await supabase
          .from('customers')
          .update({
            email: normalizedEmail || null,
            phone: contactForm.phone || null,
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

      setCustomer((prev) =>
        prev
          ? ({
              ...prev,
              email: normalizedEmail || prev.email,
              phone: contactForm.phone || prev.phone,
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

  const updateServiceApproval = async (serviceId: string, approved: boolean) => {
    setActionError(null);
    setActionBusyId(serviceId);

    try {
      const current = services.find((s) => (s as any).id === serviceId) as any;
      const payload = (current?.payload ?? {}) as any;
      const nextPayload = { ...payload, approved };

      const { error } = await supabase
        .from('services_completed')
        .update({ payload: nextPayload })
        .eq('id', serviceId);

      if (error) throw error;

      setServices((prev) =>
        prev.map((s: any) => (s.id === serviceId ? { ...s, payload: nextPayload } : s))
      );
    } catch (e: any) {
      setActionError(e?.message || 'Failed to update');
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePayInvoice = (invoiceId: string | undefined | null) => {
    if (!invoiceId) return;
    navigate(`/checkout?invoiceId=${encodeURIComponent(invoiceId)}`);
  };

  const handleOpenServiceDocPdf = (doc: ServiceDoc) => {
    if (doc.report_url) window.open(doc.report_url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenHistoryPdf = (url?: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
            <h1 className={styles.title}>Welcome back, {'Customer'}!</h1>
            <p className={styles.subtitle}>Manage your HVAC maintenance membership</p>
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
                      <strong>{new Date((activeMembership as any).start_date).toLocaleDateString()}</strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>End Date:</span>
                      <strong>{new Date((activeMembership as any).end_date).toLocaleDateString()}</strong>
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
                    <div className={styles.benefitNumber}>{(activeMembership as any).tune_ups_remaining}</div>
                    <div className={styles.benefitLabel}>
                      Tune-Up{(activeMembership as any).tune_ups_remaining !== 1 ? 's' : ''} Remaining
                    </div>
                  </div>

                  {(activeMembership as any).plan?.priority_service && (
                    <div className={styles.benefitBadge}>
                      <span>✓</span> Priority Service Active
                    </div>
                  )}

                  <div className={styles.benefitNote}>
                    Ready to schedule your next tune-up? Call us at (555) 123-4567
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Plan Features</h2>
              <div className={styles.featuresList}>
                {(activeMembership as any).plan?.features?.map((feature: string, index: number) => (
                  <div key={index} className={styles.featureItem}>
                    <span className={styles.checkIcon}>✓</span>
                    {feature}
                  </div>
                ))}
              </div>
            </div>

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
                          <h3 className={styles.serviceType}>{titleCaseServiceType(doc.service_type)}</h3>
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
                            <span className={styles.techBadge}>Technician: {doc.technician_name}</span>
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

              {services.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No service history yet.</p>
                  <p className={styles.emptyStateNote}>
                    Invoices, estimates, and other services will appear here.
                  </p>
                </div>
              ) : (
                <div className={styles.servicesList}>
                  {services.map((s: any) => {
                    const payload = (s.payload ?? {}) as any;
                    const kind = (payload.kind || s.service_type || '').toString();
                    const pdfUrl = s.pdf_path || payload.pdf_url || null;

                    const dateStr = new Date(s.service_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });

                    if (kind === 'invoice') {
                      const invoiceNumber = payload.invoice_number || '';
                      const totalAmount = Number(payload.total_amount ?? 0);
                      const amountPaid = Number(payload.amount_paid ?? 0);
                      const amountDue = Number(payload.amount_due ?? 0);
                      const status = (payload.status || 'open').toString();
                      const approved = payload.approved as boolean | null | undefined;

                      return (
                        <div key={s.id} className={styles.serviceCard}>
                          <div className={styles.serviceHeader}>
                            <div>
                              <h3 className={styles.serviceType}>Invoice {invoiceNumber || ''}</h3>
                              <p className={styles.serviceDate}>{dateStr}</p>
                              <p className={styles.serviceTech}>Status: {status}</p>
                              <p className={styles.serviceTech}>Total: ${totalAmount.toFixed(2)}</p>
                              <p className={styles.serviceTech}>Paid: ${amountPaid.toFixed(2)}</p>
                              <p className={styles.serviceTech}>Balance Due: ${amountDue.toFixed(2)}</p>
                              {s.summary && <p className={styles.serviceTech}>{s.summary}</p>}
                            </div>

                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              {approved == null ? (
                                <>
                                  {pdfUrl && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                    >
                                      View PDF
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    disabled={actionBusyId === s.id}
                                    onClick={() => updateServiceApproval(s.id, false)}
                                  >
                                    Decline
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.pdfButton}
                                    disabled={actionBusyId === s.id}
                                    onClick={() => updateServiceApproval(s.id, true)}
                                  >
                                    Approve
                                  </button>
                                </>
                              ) : approved === false ? (
                                <>
                                  <span className={styles.badge}>Declined</span>
                                  {pdfUrl && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                    >
                                      View PDF
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className={styles.badge}>Approved</span>

                                  {pdfUrl && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                    >
                                      View PDF
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className={styles.pdfButton}
                                    onClick={() => handlePayInvoice(payload.invoice_id)}
                                    disabled={!payload.invoice_id || amountDue <= 0}
                                    title={!payload.invoice_id ? 'Missing invoice id' : undefined}
                                  >
                                    {amountDue <= 0 ? 'Paid' : 'Pay Now'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (kind === 'estimate') {
                      const estimateNumber = payload.estimate_number || '';
                      const totalAmount = Number(payload.total_amount ?? 0);
                      const status = (payload.status || 'draft').toString();
                      const approved = payload.approved as boolean | null | undefined;

                      return (
                        <div key={s.id} className={styles.serviceCard}>
                          <div className={styles.serviceHeader}>
                            <div>
                              <h3 className={styles.serviceType}>Estimate {estimateNumber || ''}</h3>
                              <p className={styles.serviceDate}>{dateStr}</p>
                              <p className={styles.serviceTech}>Status: {status}</p>
                              <p className={styles.serviceTech}>Total: ${totalAmount.toFixed(2)}</p>
                              {s.summary && <p className={styles.serviceTech}>{s.summary}</p>}
                            </div>

                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              {approved == null ? (
                                <>
                                  {pdfUrl && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                    >
                                      View PDF
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    disabled={actionBusyId === s.id}
                                    onClick={() => updateServiceApproval(s.id, false)}
                                  >
                                    Decline
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.pdfButton}
                                    disabled={actionBusyId === s.id}
                                    onClick={() => updateServiceApproval(s.id, true)}
                                  >
                                    Approve
                                  </button>
                                </>
                              ) : approved === false ? (
                                <>
                                  <span className={styles.badge}>Declined</span>
                                  {pdfUrl && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                    >
                                      View PDF
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className={styles.badge}>Approved</span>
                                  {pdfUrl && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => handleOpenHistoryPdf(pdfUrl)}
                                    >
                                      View PDF
                                    </button>
                                  )}
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
                            <h3 className={styles.serviceType}>{titleCaseServiceType(s.service_type)}</h3>
                            <p className={styles.serviceDate}>{dateStr}</p>
                            {s.summary && <p className={styles.serviceTech}>{s.summary}</p>}
                          </div>

                          {pdfUrl && (
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
                  <button type="button" className={styles.secondaryButton} onClick={() => setIsEditingContact(true)}>
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
                        setContactForm({ email: profile?.email || customer?.email || '', phone: customer?.phone || '' });
                      }}
                      disabled={contactSaving}
                    >
                      Cancel
                    </button>
                    <button type="button" className={styles.pdfButton} onClick={saveContact} disabled={contactSaving}>
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
                    <strong className={styles.contactValue}>{profile?.email || customer?.email || 'Not provided'}</strong>
                  ) : (
                    <input
                      value={contactForm.email}
                      onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                      type="email"
                      className={styles.contactInput}
                    />
                  )}
                </div>

                <div className={styles.contactItem}>
                  <span className={styles.contactLabel}>Phone:</span>
                  {!isEditingContact ? (
                    <strong className={styles.contactValue}>{customer?.phone || 'Not provided'}</strong>
                  ) : (
                    <input
                      value={contactForm.phone}
                      onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                      type="tel"
                      placeholder="(555) 123-4567"
                      className={styles.contactInput}
                    />
                  )}
                </div>

                <div className={styles.contactItem}>
                  <span className={styles.contactLabel}>Service Address:</span>
                  <strong className={styles.contactValue}>
                    {customer?.service_address ? `${customer.service_address}, ${customer.city}, ${customer.state} ${customer.zip_code}` : 'Not provided'}
                  </strong>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
