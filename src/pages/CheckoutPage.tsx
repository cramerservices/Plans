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
  const [showAgreement, setShowAgreement] = useState(false);

  const [formData, setFormData] = useState({
    customerName: user?.user_metadata?.full_name || '',
    email: user?.email || '',
    phone: '',
    serviceStreet: '',
    serviceCity: '',
    serviceState: '',
    serviceZip: '',
  });

  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // Mini split support (heads 1–9)
  const isMiniSplit = plan ? isMiniSplitPlan(plan.name) : false;
  const [miniSplitHeads, setMiniSplitHeads] = useState<number>(() => {
    const headsFromUrl = Number(searchParams.get('heads'));
    return Number.isFinite(headsFromUrl) && headsFromUrl >= 1 && headsFromUrl <= 9 ? headsFromUrl : 1;
  });

  const selectedMiniSplitTier = isMiniSplit ? getMiniSplitTier(miniSplitHeads) : null;

  // Some versions of miniSplitPricing use a different field name than `price`.
  // This helper keeps CheckoutPage compatible without changing your lib types.
  const getTierPrice = (tier: any): number | null => {
    const v =
      tier?.price ??
      tier?.amount ??
      tier?.annualPrice ??
      tier?.yearlyPrice ??
      tier?.yearly ??
      tier?.value ??
      null;
    return typeof v === 'number' ? v : null;
  };

  useEffect(() => {
    const load = async () => {
      if (!planId) {
        setLoading(false);
        return;
      }

      try {
        const { data: planData, error: planErr } = await supabase
          .from('maintenance_plans')
          .select('*')
          .eq('id', planId)
          .eq('is_active', true)
          .single();

        if (planErr) throw planErr;
        setPlan(planData);

        const { data: agreementData, error: agreementErr } = await supabase
          .from('membership_agreements')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (agreementErr) throw agreementErr;
        setAgreement(agreementData ?? null);
      } catch (err) {
        console.error('Error loading checkout data:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [planId]);

  useEffect(() => {
    // Keep the form in sync if auth user loads later
    setFormData((prev) => ({
      ...prev,
      customerName: user?.user_metadata?.full_name || prev.customerName,
      email: user?.email || prev.email,
    }));
  }, [user]);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const startStripeCheckout = async () => {
    if (!planId) return;

    if (!agreementAccepted) {
      alert('Please accept the membership agreement to continue.');
      return;
    }

    if (isMiniSplit && !selectedMiniSplitTier) {
      alert('Please select a valid mini split head count.');
      return;
    }

    setProcessing(true);

    try {
      // ✅ Use explicit Supabase Edge Function URL (fixes GitHub Pages 404 / preflight issues)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      if (!supabaseUrl || !anonKey) {
        throw new Error(
          'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to your GitHub Pages build env.',
        );
      }

      const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-checkout-session`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          planId,
          miniSplitHeads: isMiniSplit ? miniSplitHeads : undefined,
          ...formData,
          agreementSignedAt: new Date().toISOString(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || data?.details || `Request failed with status ${res.status}`;
        throw new Error(msg);
      }

      if (!data?.url) {
        throw new Error('Stripe checkout URL was not returned.');
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Error creating checkout session:', err);
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
        <div className={styles.summaryCard}>
          <h2>Order Summary</h2>

          <div className={styles.planName}>{plan.name}</div>

          {isMiniSplit && (
            <div className={styles.miniSplitSection}>
              <label className={styles.label}>Mini split heads</label>
              <select
                className={styles.select}
                value={miniSplitHeads}
                onChange={(e) => setMiniSplitHeads(Number(e.target.value))}
                disabled={processing}
              >
                {MINI_SPLIT_HEAD_TIERS.map((t) => (
                  <option key={t.heads} value={t.heads}>
                    {t.heads} heads – ${getTierPrice(t as any) ?? ''}/year
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.summaryRow}>
            <span>Total:</span>
            <span className={styles.total}>
              {isMiniSplit && selectedMiniSplitTier
                ? `$${getTierPrice(selectedMiniSplitTier as any) ?? ''}/year`
                : `$${plan.price}/year`}
            </span>
          </div>
        </div>

        <div className={styles.formCard}>
          <h2>Customer Info</h2>

          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              value={formData.customerName}
              onChange={(e) => handleChange('customerName', e.target.value)}
              disabled={processing}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={processing}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Phone</label>
            <input
              className={styles.input}
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              disabled={processing}
            />
          </div>

          <h2>Service Address</h2>

          <div className={styles.field}>
            <label className={styles.label}>Street Address</label>
            <input
              className={styles.input}
              value={formData.serviceStreet}
              onChange={(e) => handleChange('serviceStreet', e.target.value)}
              disabled={processing}
            />
          </div>

          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>City</label>
              <input
                className={styles.input}
                value={formData.serviceCity}
                onChange={(e) => handleChange('serviceCity', e.target.value)}
                disabled={processing}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>State</label>
              <input
                className={styles.input}
                value={formData.serviceState}
                onChange={(e) => handleChange('serviceState', e.target.value)}
                disabled={processing}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>ZIP Code</label>
              <input
                className={styles.input}
                value={formData.serviceZip}
                onChange={(e) => handleChange('serviceZip', e.target.value)}
                disabled={processing}
              />
            </div>
          </div>

          <h2>Payment Information</h2>
          <div className={styles.note}>
            You will be redirected to secure Stripe checkout to enter your card and start your recurring annual plan.
          </div>

          <div className={styles.agreementRow}>
            <input
              type="checkbox"
              checked={agreementAccepted}
              onChange={(e) => setAgreementAccepted(e.target.checked)}
              disabled={processing}
            />
            <span>
              I agree to the{' '}
              <button type="button" className={styles.linkButton} onClick={() => setShowAgreement(true)}>
                Membership Agreement
              </button>
            </span>
          </div>

          <button className={styles.primaryButton} onClick={startStripeCheckout} disabled={processing}>
            {processing ? 'Redirecting to Stripe...' : 'Continue to Stripe'}
          </button>

          <button className={styles.secondaryButton} onClick={() => navigate('/dashboard')} disabled={processing}>
            Cancel
          </button>
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


