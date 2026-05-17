import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { MaintenancePlan } from '../types';
import { MINI_SPLIT_HEAD_TIERS, isMiniSplitPlan } from '../lib/miniSplitPricing';
import styles from './PlansPage.module.css';

type PlanTab = 'memberships' | 'oneTime';

export default function PlansPage() {
  const navigate = useNavigate();

  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeMembership, setActiveMembership] = useState<any | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<PlanTab>('memberships');

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

  const isOneTimeTuneUp = (plan: MaintenancePlan) => {
    const planName = String((plan as any).name || '').toLowerCase();
    const billingFrequency = String((plan as any).billing_frequency || '').toLowerCase();

    return (
      billingFrequency === 'one_time' ||
      billingFrequency === 'one-time' ||
      billingFrequency === 'once' ||
      planName.includes('one-time') ||
      planName.includes('one time')
    );
  };

  const membershipPlans = plans.filter((plan) => !isOneTimeTuneUp(plan));
  const oneTimePlans = plans.filter((plan) => isOneTimeTuneUp(plan));

  const visiblePlans = activeTab === 'memberships' ? membershipPlans : oneTimePlans;

  const handleSelectPlan = (plan: MaintenancePlan) => {
    if (membershipLoading) return;

    const oneTimePlan = isOneTimeTuneUp(plan);

    if (oneTimePlan) {
      navigate(`/checkout/${plan.id}?type=one_time`);
      return;
    }

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
          <div className={styles.planTabs}>
            <button
              type="button"
              className={`${styles.planTab} ${activeTab === 'memberships' ? styles.activePlanTab : ''}`}
              onClick={() => setActiveTab('memberships')}
            >
              Maintenance Plans
            </button>

            <button
              type="button"
              className={`${styles.planTab} ${activeTab === 'oneTime' ? styles.activePlanTab : ''}`}
              onClick={() => setActiveTab('oneTime')}
            >
              One-Time Tune-Up
            </button>
          </div>

          {activeTab === 'oneTime' && (
            <div className={styles.tabIntro}>
              Need service without signing up for a yearly plan? Schedule a one-time HVAC tune-up for $200.
            </div>
          )}

          <div className={styles.plansGrid}>
            {visiblePlans.length === 0 ? (
              <div className={styles.loading}>
                {activeTab === 'oneTime'
                  ? 'No one-time tune-up option found. Add the One-Time Tune-Up row in Supabase and make sure it is active.'
                  : 'No plans found. Make sure the maintenance_plans table exists and has active rows.'}
              </div>
            ) : (
              visiblePlans.map((plan) => {
                const features = Array.isArray((plan as any).features) ? (plan as any).features : [];
                const billingFrequency = (plan as any).billing_frequency || 'annual';
                const tuneUpsPerYear = (plan as any).tune_ups_per_year ?? 2;
                const isMiniSplit = isMiniSplitPlan(plan.name);
                const oneTimePlan = isOneTimeTuneUp(plan);

                return (
                  <div key={plan.id} className={styles.planCard}>
                    {(plan as any).priority_service && !oneTimePlan && (
                      <div className={styles.badge}>Most Popular</div>
                    )}

                    {oneTimePlan && <div className={styles.badge}>No Membership Required</div>}

                    <h2 className={styles.planName}>{plan.name}</h2>

                    {(plan as any).description ? (
                      <p className={styles.planDescription}>{(plan as any).description}</p>
                    ) : null}

                    <div className={styles.pricing}>
                      <span className={styles.price}>
                        ${isMiniSplit ? MINI_SPLIT_HEAD_TIERS[0].amount : plan.price}
                      </span>
                      <span className={styles.frequency}>
                        {oneTimePlan
                          ? '/visit'
                          : `/${billingFrequency === 'annual' ? 'year' : 'semi-annual'}`}
                      </span>
                    </div>

                    {isMiniSplit && (
                      <div className={styles.detailItem}>
                        <strong>Mini split:</strong> 4–9 heads ($340 to $525/year)
                      </div>
                    )}

                    <div className={styles.planDetails}>
                      <div className={styles.detailItem}>
                        <strong>{tuneUpsPerYear}</strong>{' '}
                        {oneTimePlan ? 'tune-up visit' : 'tune-ups per year'}
                      </div>

                      {!oneTimePlan && (
                        <div className={styles.detailItem}>
                          <strong>{(plan as any).discount_percentage ?? 0}%</strong> discount on repairs
                        </div>
                      )}

                      {(plan as any).priority_service && !oneTimePlan && (
                        <div className={styles.detailItem}>
                          <strong>Priority</strong> emergency service
                        </div>
                      )}

                      {oneTimePlan && (
                        <div className={styles.detailItem}>
                          <strong>No contract</strong> or annual membership
                        </div>
                      )}
                    </div>

                    <div className={styles.features}>
                      <h3>{oneTimePlan ? 'Included With Tune-Up:' : 'Plan Features:'}</h3>
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
                      {membershipLoading
                        ? 'Checking...'
                        : oneTimePlan
                          ? 'Schedule Tune-Up'
                          : 'Select Plan'}
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
                <li>Coil cleaning, evaporator and condenser</li>
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
