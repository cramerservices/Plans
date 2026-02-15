import { useState, useEffect } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CustomerMembership, ServiceCompleted, Customer } from '../types';
import styles from './CustomerDashboard.module.css';
import { Link } from "react-router-dom";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
  const [services, setServices] = useState<ServiceCompleted[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Contact edit state ----
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ email: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  useEffect(() => {
    // When customer loads/changes, sync form fields
    if (customer) {
      setContactForm({
        email: customer.email ?? '',
        phone: customer.phone ?? '',
      });
    }
  }, [customer]);

  const fetchDashboardData = async () => {
    try {
      const [customerResult, membershipsResult, servicesResult] = await Promise.all([
        supabase
          .from('portal_customers')
          .select('*')
          .eq('id', user?.id)
          .maybeSingle(),
        supabase
          .from('customer_memberships')
          .select(`
            *,
            plan:maintenance_plans(*)
          `)
          .eq('customer_id', user?.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('services_completed')
          .select('*')
          .eq('customer_id', user?.id)
          .order('service_date', { ascending: false })
          .limit(10),
      ]);

      if (customerResult.error) throw customerResult.error;
      if (membershipsResult.error) throw membershipsResult.error;
      if (servicesResult.error) throw servicesResult.error;

      setCustomer(customerResult.data);
      setMemberships(membershipsResult.data || []);
      setServices(servicesResult.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const activeMembership = memberships.find((m) => m.status === 'active');

  const isValidEmail = (email: string) => {
    // simple + practical email check
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleSaveContact = async () => {
    if (!user?.id) return;

    setContactError(null);
    setContactSuccess(null);

    const nextEmail = contactForm.email.trim().toLowerCase();
    const nextPhone = (contactForm.phone ?? '').trim();

    if (!nextEmail || !isValidEmail(nextEmail)) {
      setContactError('Please enter a valid email address.');
      return;
    }

    setContactSaving(true);
    try {
      // 1) Update portal profile fields
      const { data: updatedCustomer, error: updErr } = await supabase
        .from('portal_customers')
        .update({
          email: nextEmail,
          phone: nextPhone,
        })
        .eq('id', user.id)
        .select('*')
        .single();

      if (updErr) throw updErr;

      setCustomer(updatedCustomer);

      // 2) If email changed, also update Supabase Auth email (login email)
      // This usually triggers an email confirmation depending on your auth settings.
      const currentAuthEmail = (user.email ?? '').trim().toLowerCase();
      if (currentAuthEmail && currentAuthEmail !== nextEmail) {
        const { error: authErr } = await supabase.auth.updateUser({ email: nextEmail });
        if (authErr) {
          // Profile saved, but auth email update failed
          setContactSuccess('Saved. (Note: login email update failed — check Supabase auth settings.)');
          setIsEditingContact(false);
          return;
        }

        setContactSuccess('Saved. Check your email to confirm the address change (if prompted).');
      } else {
        setContactSuccess('Saved.');
      }

      setIsEditingContact(false);
    } catch (e: any) {
      console.error('Contact update error:', e);
      setContactError(e?.message ?? 'Failed to update contact info.');
    } finally {
      setContactSaving(false);
    }
  };

  const handleCancelContact = () => {
    setContactError(null);
    setContactSuccess(null);
    setIsEditingContact(false);
    // reset to latest customer values
    if (customer) {
      setContactForm({
        email: customer.email ?? '',
        phone: customer.phone ?? '',
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.loading}>Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Welcome back, {customer?.full_name || 'Customer'}!</h1>
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
                  <div className={styles.planName}>{activeMembership.plan?.name}</div>
                  <div className={styles.planStatus}>
                    <span className={styles.statusBadge}>{activeMembership.status}</span>
                  </div>

                  <div className={styles.membershipDetails}>
                    <div className={styles.detailRow}>
                      <span>Plan Type:</span>
                      <strong>{activeMembership.plan?.name}</strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Start Date:</span>
                      <strong>{new Date(activeMembership.start_date).toLocaleDateString()}</strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>End Date:</span>
                      <strong>{new Date(activeMembership.end_date).toLocaleDateString()}</strong>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Discount on Repairs:</span>
                      <strong>{activeMembership.plan?.discount_percentage}%</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Benefits Remaining</h2>
                <div className={styles.benefits}>
                  <div className={styles.benefitItem}>
                    <div className={styles.benefitNumber}>{activeMembership.tune_ups_remaining}</div>
                    <div className={styles.benefitLabel}>
                      Tune-Up{activeMembership.tune_ups_remaining !== 1 ? 's' : ''} Remaining
                    </div>
                  </div>

                  {activeMembership.plan?.priority_service && (
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
                {activeMembership.plan?.features.map((feature, index) => (
                  <div key={index} className={styles.featureItem}>
                    <span className={styles.checkIcon}>✓</span>
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Service History</h2>

              {services.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No services completed yet.</p>
                  <p className={styles.emptyStateNote}>
                    Your service history will appear here after your first tune-up.
                  </p>
                </div>
              ) : (
                <div className={styles.servicesList}>
                  {services.map((service) => (
                    <div key={service.id} className={styles.serviceCard}>
                      <div className={styles.serviceHeader}>
                        <div>
                          <h3 className={styles.serviceType}>{service.service_type}</h3>
                          <p className={styles.serviceDate}>
                            {new Date(service.service_date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                        {service.technician_name && (
                          <div className={styles.technician}>
                            Technician: {service.technician_name}
                          </div>
                        )}
                      </div>

                      {service.summary && (
                        <div className={styles.serviceSummary}>
                          <strong>Summary:</strong>
                          <p>{service.summary}</p>
                        </div>
                      )}

                      {service.work_completed && service.work_completed.length > 0 && (
                        <div className={styles.workCompleted}>
                          <strong>Work Completed:</strong>
                          <ul>
                            {service.work_completed.map((item, index) => (
                              <li key={index}>
                                {item.task}
                                {item.notes && <span className={styles.notes}> - {item.notes}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {service.recommendations && service.recommendations.length > 0 && (
                        <div className={styles.recommendations}>
                          <strong>Recommendations:</strong>
                          <ul>
                            {service.recommendations.map((rec, index) => (
                              <li key={index} className={styles[`priority-${rec.priority}`]}>
                                <span className={styles.recTitle}>{rec.title}</span>
                                <span className={styles.recDesc}>{rec.description}</span>
                                {rec.estimated_cost && (
                                  <span className={styles.recCost}>
                                    Est. ${rec.estimated_cost}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {customer && (
          <div className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>Contact Information</h2>

              {!isEditingContact ? (
                <button
                  className={styles.plansButton}
                  onClick={() => {
                    setContactError(null);
                    setContactSuccess(null);
                    setIsEditingContact(true);
                  }}
                  type="button"
                >
                  Edit
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={styles.plansButton}
                    onClick={handleSaveContact}
                    disabled={contactSaving}
                    type="button"
                  >
                    {contactSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className={styles.plansButton}
                    onClick={handleCancelContact}
                    disabled={contactSaving}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {contactError && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ color: 'crimson' }}>{contactError}</strong>
              </div>
            )}
            {contactSuccess && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ color: 'green' }}>{contactSuccess}</strong>
              </div>
            )}

            <div className={styles.contactInfo}>
              {/* EMAIL (editable) */}
              <div className={styles.contactItem}>
                <span>Email:</span>
                {!isEditingContact ? (
                  <strong>{customer.email}</strong>
                ) : (
                  <input
                    value={contactForm.email}
                    onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                    type="email"
                    style={{ width: 320, maxWidth: '100%' }}
                  />
                )}
              </div>

              {/* PHONE (editable) */}
              <div className={styles.contactItem}>
                <span>Phone:</span>
                {!isEditingContact ? (
                  <strong>{customer.phone || 'Not provided'}</strong>
                ) : (
                  <input
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                    type="tel"
                    placeholder="(555) 123-4567"
                    style={{ width: 220, maxWidth: '100%' }}
                  />
                )}
              </div>

              {/* SERVICE ADDRESS (read-only always) */}
              <div className={styles.contactItem}>
                <span>Service Address:</span>
                <strong>
                  {customer.service_address}, {customer.city}, {customer.state} {customer.zip_code}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
