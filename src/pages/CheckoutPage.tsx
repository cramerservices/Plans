import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { MaintenancePlan, MembershipAgreement } from '../types';
import {
  MINI_SPLIT_HEAD_TIERS,
  getMiniSplitTier,
  isMiniSplitPlan,
} from '../lib/miniSplitPricing';
import styles from './CheckoutPage.module.css';

export default function CheckoutPage() {
  const { planId } = useParams<{ planId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<MaintenancePlan | null>(null);
  const [agreement, setAgreement] = useState<MembershipAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [miniSplitHeads, setMiniSplitHeads] = useState<number>(4);

  const [activeMembership, setActiveMembership] = useState<any | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    serviceAddress: '',
    city: '',
    state: '',
    zipCode: '',
  });

  useEffect(() => {
    fetchPlanAndAgreement();
    loadActiveMembership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const fetchPlanAndAgreement = async () => {
    try {
      const [planResult, agreementResult] = await Promise.all([
        supabase
          .from('maintenance_plans')
          .select('*')
          .eq('id', planId)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('membership_agreements')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (planResult.error) throw planResult.error;
      if (agreementResult.error) throw agreementResult.error;

      setPlan(planResult.data);
      setAgreement(agreementResult.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveMembership = async () => {
    setMembershipLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user?.id) {
        setActiveMembership(null);
        return;
      }

      const { data: membership, error } = await supabase
        .from('customer_memberships')
        .select('*, plan:maintenance_plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setActiveMembership(membership || null);
    } catch (error) {
      console.error('Error loading active membership:', error);
      setActiveMembership(null);
    } finally {
      setMembershipLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const isMiniSplit = isMiniSplitPlan(plan?.name);
  const selectedMiniSplitTier = getMiniSplitTier(miniSplitHeads);
  const displayedPrice = isMiniSplit
    ? selectedMiniSplitTier?.amount ?? plan?.price ?? 0
    : plan?.price ?? 0;

  const currentPlanId = activeMembership?.plan_id || null;
  const currentPlanName = activeMembership?.plan?.name || 'current plan';
  const samePlanSelected = !!plan?.id && !!currentPlanId && currentPlanId === plan.id;
  const replacingDifferentPlan =
    !!plan?.id && !!currentPlanId && currentPlanId !== plan.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreedToTerms) {
      alert('Please agree to the membership terms to continue.');
      return;
    }

    if (isMiniSplit && !selectedMiniSplitTier) {
      alert('Please select a valid mini split head count.');
      return;
    }

    if (!planId) {
      alert('Missing planId.');
      return;
    }

    if (membershipLoading) {
      alert('Still checking your current plan. Please wait a second and try again.');
      return;
    }

    if (samePlanSelected) {
      alert(`You already have the ${plan?.name} plan active on your account.`);
      return;
    }

    if (replacingDifferentPlan && searchParams.get('replacePlan') !== '1') {
      const confirmed = window.confirm(
        `You currently have the ${currentPlanName} plan.\n\nIf you continue, your old plan will be removed from your account immediately and replaced with ${plan?.name}.\n\nDo you want to continue?`
      );

      if (!confirmed) {
        return;
      }
    }

    setProcessing(true);

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        alert('Please sign in before checking out.');
        return;
      }

      const payload = {
        planId,
        ...formData,
        agreementSignedAt: new Date().toISOString(),
        replacePlan: replacingDifferentPlan,
        currentPlanId: currentPlanId || null,
        ...(isMiniSplit ? { miniSplitHeads } : {}),
      };

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error('Edge function error:', json);
        throw new Error(json?.error || json?.message || 'Edge function request failed');
      }

      if (!json?.url) {
        throw new Error('Stripe checkout URL was not returned.');
      }

      window.location.href = json.url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert(
        'There was an error starting Stripe checkout. Make sure Stripe is configured and try again.'
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.error}>Plan not found</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.container}>
        {searchParams.get('checkout') === 'cancelled' && (
          <div className={styles.bannerWarning}>
            Checkout was canceled. You can try again whenever you're ready.
          </div>
        )}

        {searchParams.get('replacePlan') === '1' && replacingDifferentPlan && (
          <div className={styles.bannerWarning}>
            Purchasing this plan will immediately remove your current plan from your
            account and replace it with this one.
          </div>
        )}

        {samePlanSelected && (
          <div className={styles.bannerWarning}>
            You already have this plan active on your account. Please go back and select
            a different plan if you want to make a change.
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.planSummary}>
            <h2>Order Summary</h2>
            <div className={styles.summaryCard}>
              <h3>{plan.name}</h3>
              <p className={styles.planDesc}>{plan.description}</p>

              {isMiniSplit && (
                <div className={styles.miniSplitCallout}>
                  Mini split pricing is based on head count (4–9 heads).
                </div>
              )}

              {replacingDifferentPlan && (
                <div className={styles.bannerWarning} style={{ marginBottom: '16px' }}>
                  Current plan: <strong>{currentPlanName}</strong>
                  <br />
                  New plan: <strong>{plan.name}</strong>
                  <br />
                  Your current plan will be cancelled immediately after successful checkout.
                </div>
              )}

              <div className={styles.summaryDetails}>
                {isMiniSplit && (
                  <div className={styles.summaryItem}>
                    <span>Head count:</span>
                    <strong>{miniSplitHeads}</strong>
                  </div>
                )}
                <div className={styles.summaryItem}>
                  <span>Tune-ups per year:</span>
                  <strong>{plan.tune_ups_per_year}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Discount on repairs:</span>
                  <strong>{plan.discount_percentage}%</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Billing:</span>
                  <strong>
                    {plan.billing_frequency === 'annual' ? 'Annually' : 'Semi-annually'}
                  </strong>
                </div>
              </div>

              <div className={styles.total}>
                <span>Total:</span>
                <strong>${displayedPrice}/year</strong>
              </div>
            </div>
          </div>

          <div className={styles.checkoutForm}>
            <h2>Complete Your Purchase</h2>

            <form onSubmit={handleSubmit}>
              <div className={styles.section}>
                <h3>Contact Information</h3>

                <div className={styles.formGroup}>
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className={styles.section}>
                <h3>Service Address</h3>

                <div className={styles.formGroup}>
                  <label>Street Address</label>
                  <input
                    type="text"
                    name="serviceAddress"
                    value={formData.serviceAddress}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      maxLength={2}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>ZIP Code</label>
                    <input
                      type="text"
                      name="zipCode"
                      value={formData.zipCode}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>

              {isMiniSplit && (
                <div className={styles.section}>
                  <h3>Mini Split Setup</h3>
                  <div className={styles.formGroup}>
                    <label>How many heads does your mini split system have?</label>
                    <select
                      value={miniSplitHeads}
                      onChange={(e) => setMiniSplitHeads(Number(e.target.value))}
                      className={styles.selectInput}
                    >
                      {MINI_SPLIT_HEAD_TIERS.map((tier) => (
                        <option key={tier.heads} value={tier.heads}>
                          {tier.heads} heads — ${tier.amount}/year
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className={styles.section}>
                <h3>Payment Information</h3>
                <div className={styles.paymentNote}>
                  You will be redirected to secure Stripe checkout to enter your card and
                  start your recurring annual plan.
                </div>
              </div>

              <div className={styles.agreement}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    required
                    disabled={samePlanSelected}
                  />
                  <span>
                    I agree to the{' '}
                    <button
                      type="button"
                      className={styles.agreementLink}
                      onClick={() => setShowAgreement(true)}
                    >
                      Membership Agreement
                    </button>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className={styles.submitButton}
                disabled={processing || membershipLoading || samePlanSelected}
              >
                {membershipLoading
                  ? 'Checking current plan...'
                  : processing
                  ? 'Redirecting to Stripe...'
                  : samePlanSelected
                  ? 'You Already Have This Plan'
                  : `Continue to Stripe - $${displayedPrice}/year`}
              </button>

              {samePlanSelected && (
                <button
                  type="button"
                  className={styles.submitButton}
                  style={{ marginTop: '12px', opacity: 0.85 }}
                  onClick={() => navigate('/plans')}
                >
                  Back to Plans
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {showAgreement && agreement && (
        <div className={styles.modal} onClick={() => setShowAgreement(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Membership Agreement</h2>
            <div className={styles.agreementText}>{agreement.content}</div>
            <button className={styles.closeButton} onClick={() => setShowAgreement(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
