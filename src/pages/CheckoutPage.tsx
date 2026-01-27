import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MaintenancePlan, MembershipAgreement } from '../types';
import styles from './CheckoutPage.module.css';

export default function CheckoutPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [plan, setPlan] = useState<MaintenancePlan | null>(null);
  const [agreement, setAgreement] = useState<MembershipAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    serviceAddress: '',
    city: '',
    state: '',
    zipCode: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });

  useEffect(() => {
    fetchPlanAndAgreement();
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

    setProcessing(true);

    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);

      const customerData = {
        id: user.id,
        email: formData.email,
        full_name: formData.fullName,
        phone: formData.phone,
        service_address: formData.serviceAddress,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zipCode,
      };

      const { error: customerError } = await supabase
        .from('customers')
        .upsert(customerData);

      if (customerError) throw customerError;

      const membershipData = {
        customer_id: user.id,
        plan_id: planId,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'active',
        tune_ups_remaining: plan?.tune_ups_per_year || 2,
        agreement_signed_at: new Date().toISOString(),
      };

      const { error: membershipError } = await supabase
        .from('customer_memberships')
        .insert(membershipData);

      if (membershipError) throw membershipError;

      alert('Membership purchased successfully!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error processing checkout:', error);
      alert('There was an error processing your purchase. Please try again.');
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
        <div className={styles.content}>
          <div className={styles.planSummary}>
            <h2>Order Summary</h2>
            <div className={styles.summaryCard}>
              <h3>{plan.name}</h3>
              <p className={styles.planDesc}>{plan.description}</p>

              <div className={styles.summaryDetails}>
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
                <strong>${plan.price}/year</strong>
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

              <div className={styles.section}>
                <h3>Payment Information</h3>
                <div className={styles.paymentNote}>
                  Payment processing via Stripe will be integrated here
                </div>

                <div className={styles.formGroup}>
                  <label>Card Number</label>
                  <input
                    type="text"
                    name="cardNumber"
                    value={formData.cardNumber}
                    onChange={handleChange}
                    placeholder="4242 4242 4242 4242"
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Expiry</label>
                    <input
                      type="text"
                      name="expiry"
                      value={formData.expiry}
                      onChange={handleChange}
                      placeholder="MM/YY"
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>CVV</label>
                    <input
                      type="text"
                      name="cvv"
                      value={formData.cvv}
                      onChange={handleChange}
                      placeholder="123"
                      maxLength={4}
                      required
                    />
                  </div>
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

              <button
                type="submit"
                className={styles.submitButton}
                disabled={processing}
              >
                {processing ? 'Processing...' : `Purchase Plan - $${plan.price}`}
              </button>
            </form>
          </div>
        </div>
      </div>

      {showAgreement && agreement && (
        <div className={styles.modal} onClick={() => setShowAgreement(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Membership Agreement</h2>
            <div className={styles.agreementText}>
              {agreement.content}
            </div>
            <button
              className={styles.closeButton}
              onClick={() => setShowAgreement(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
