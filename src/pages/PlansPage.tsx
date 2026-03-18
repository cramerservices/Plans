import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { MaintenancePlan } from '../types';
import { MINI_SPLIT_HEAD_TIERS, isMiniSplitPlan } from '../lib/miniSplitPricing';
import styles from './PlansPage.module.css';

export default function PlansPage() {
  const navigate = useNavigate();

  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeMembership, setActiveMembership] = useState<any | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    loadActiveMembership();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) {
        console.error('Supabase error fetching plans:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: (error as any).code,
        });
        throw error;
      }

      setPlans((data as MaintenancePlan[]) || []);
    } catch (error: any) {
      console.error('Error fetching plans (raw):', error);
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      console.error('Error details:', error?.details);
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

  const handleSelectPlan = (plan: MaintenancePlan) => {
    if (membershipLoading) return;

    if (!activeMembership) {
      navigate(`/checkout/${plan.id}`);
      return;
    }

    const currentPlanId = activeMembership.plan_id;
    const currentPlanName = activeMembership.plan?.name || 'current plan';

    if (currentPlanId === plan.id) {
      alert(`You already have the ${plan.name} plan active on your account.`);
      return;
    }

    const confirmed = window.confirm(
      `You currently have the ${currentPlanName} plan.\n\nIf you continue, your old plan will be removed from your account immediately and replaced with ${plan.name}.\n\nDo you want to continue?`
    );

    if (!confirmed) return;

    navigate(`/checkout/${plan.id}?replacePlan=1`);
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.loading}>Loading plans...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <section className={styles.hero}>
        <div className={styles.container}>
          <h1 className={styles.title}>Choose Your Maintenance Plan</h1>
          <p className={styles.subtitle}>
            Protect your investment and enjoy peace of mind with our comprehensive HVAC maintenance plans
          </p>
        </div>
      </section>

      <section className={styles.plans}>
        <div className={styles.container}>
          <div className={styles.plansGrid}>
            {plans.length === 0 ? (
              <div className={styles.loading}>
                No plans found. (If you just set up Supabase, make sure the table exists and has rows.)
              </div>
            ) : (
              plans.map((plan) => {
                const features = Array.isArray((plan as any).features) ? (plan as any).features : [];
                const billingFrequency = (plan as any).billing_frequency || 'annual';
                const tuneUpsPerYear = (plan as any).tune_ups_per_year ?? 2;
                const isMiniSplit = isMiniSplitPlan(plan.name);

                return (
                  <div key={plan.id} className={styles.planCard}>
                    {(plan as any).priority_service && <div className={styles.badge}>Most Popular</div>}

                    <h2 className={styles.planName}>{plan.name}</h2>

                    {(plan as any).description ? (
                      <p className={styles.planDescription}>{(plan as any).description}</p>
                    ) : null}

                    <div className={styles.pricing}>
                      <span className={styles.price}>
                        ${isMiniSplit ? MINI_SPLIT_HEAD_TIERS[0].amount : plan.price}
                      </span>
                      <span className={styles.frequency}>
                        /{billingFrequency === 'annual' ? 'year' : 'semi-annual'}
                      </span>
                    </div>

                    {isMiniSplit && (
                      <div className={styles.detailItem}>
                        <strong>Mini split:</strong> 4–9 heads ($340 to $525/year)
                      </div>
                    )}

                    <div className={styles.planDetails}>
                      <div className={styles.detailItem}>
                        <strong>{tuneUpsPerYear}</strong> tune-ups per year
                      </div>
                      <div className={styles.detailItem}>
                        <strong>{(plan as any).discount_percentage ?? 0}%</strong> discount on repairs
                      </div>
                      {(plan as any).priority_service && (
                        <div className={styles.detailItem}>
                          <strong>Priority</strong> emergency service
                        </div>
                      )}
                    </div>

                    <div className={styles.features}>
                      <h3>Plan Features:</h3>
                      <ul className={styles.featuresList}>
                        {features.length ? (
                          features.map((feature: string, index: number) => (
                            <li key={index}>{feature}</li>
                          ))
                        ) : (
                          <li>Details coming soon.</li>
                        )}
                      </ul>
                    </div>

                    <button
                      type="button"
                      className={styles.selectButton}
                      onClick={() => handleSelectPlan(plan)}
                      disabled={membershipLoading}
                    >
                      {membershipLoading ? 'Checking...' : 'Select Plan'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className={styles.checklist}>
        <div className={styles.container}>
          <h2 className={styles.checklistTitle}>Our Comprehensive Tune-Up Checklist</h2>
          <p className={styles.checklistSubtitle}>
            Here's what we check, clean, and optimize during every tune-up visit:
          </p>

          <div className={styles.checklistGrid}>
            <div className={styles.checklistCategory}>
              <h3>Safety Checks</h3>
              <ul>
                <li>Carbon monoxide testing</li>
                <li>Gas leak inspection</li>
                <li>Electrical safety verification</li>
                <li>Fire hazard assessment</li>
              </ul>
            </div>

            <div className={styles.checklistCategory}>
              <h3>Performance Optimization</h3>
              <ul>
                <li>Refrigerant level check</li>
                <li>Airflow measurement</li>
                <li>Thermostat calibration</li>
                <li>System efficiency test</li>
              </ul>
            </div>

            <div className={styles.checklistCategory}>
              <h3>Cleaning & Maintenance</h3>
              <ul>
                <li>Coil cleaning (evaporator & condenser)</li>
                <li>Condensate drain clearing</li>
                <li>Filter replacement</li>
                <li>Motor lubrication</li>
              </ul>
            </div>

            <div className={styles.checklistCategory}>
              <h3>Electrical Components</h3>
              <ul>
                <li>Voltage and amperage testing</li>
                <li>Capacitor inspection</li>
                <li>Contactor examination</li>
                <li>Wiring connections tightening</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
