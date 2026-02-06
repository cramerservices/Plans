import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MaintenancePlan, MembershipAgreement } from '../types';
import { MINI_SPLIT_HEAD_TIERS, getMiniSplitTier, isMiniSplitPlan } from '../lib/miniSplitPricing';
import styles from './CheckoutPage.module.css';

export default function CheckoutPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [plan, setPlan] = useState<MaintenancePlan | null>(null);
  const [agreement, setAgreement] = useState<MembershipAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [miniSplitHeads, setMiniSplitHeads] = useState<number>(4);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const isMiniSplit = isMiniSplitPlan(plan?.name);
  const selectedMiniSplitTier = getMiniSplitTier(miniSplitHeads);
  const displayedPrice = isMiniSplit ? selectedMiniSplitTier?.amount ?? plan?.price ?? 0 : plan?.price ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreedToTerms) {
      alert('Please agree to the membership terms to continue.');
      return;
    }

    if (!user) {
      alert('Please log in or create an account first.');
      navigate('/login');
      return;
    }

    if (isMiniSplit && !selectedMiniSplitTier) {
      alert('Please select a valid mini split head count.');
      return;
    }

  setProcessing(true);

try {
  // get the logged-in user's access token (required if Verify JWT is ON)
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    alert('Your session expired. Please log in again.');
    navigate('/login');
    return;
  }

  // ONLY ONE invoke call
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      planId,
      miniSplitHeads: isMiniSplit ? miniSplitHeads : null,
      ...formData,
      agreementSignedAt: new Date().toISOString(),
    },
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw error;

  if (!data?.url) {
    throw new Error('Stripe checkout URL was not returned.');
  }

  window.location.href = data.url;
} catch (error) {
  console.error('Error creating checkout session:', error);
  alert('There was an error starting Stripe checkout. Make sure Stripe is configured and try again.');
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
                  You will be redirected to secure Stripe checkout to enter your card and start your
                  recurring annual plan.
                </div>
              </div>

              <div className={styles.agreement}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    required
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

          <button type="submit" className={styles.submitButton} disabled={processing}>
  {processing ? 'Redirecting to Stripe...' : `Continue to Stripe - $${displayedPrice}/year`}
</button>


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



