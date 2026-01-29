import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { MaintenancePlan } from '../types';
import styles from './PlansPage.module.css';

export default function PlansPage() {
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
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
      // Helpful extra in case the object shape is different
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      console.error('Error details:', error?.details);
    } finally {
      setLoading(false);
    }
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

                return (
                  <div key={plan.id} className={styles.planCard}>
                    {(plan as any).priority_service && <div className={styles.badge}>Most Popular</div>}

                    <h2 className={styles.planName}>{plan.name}</h2>

                    {/* description might not exist yet in your DB */}
                    {(plan as any).description ? (
                      <p className={styles.planDescription}>{(plan as any).description}</p>
                    ) : null}

                    <div className={styles.pricing}>
                      <span className={styles.price}>${plan.price}</span>
                      <span className={styles.frequency}>
                        /{billingFrequency === 'annual' ? 'year' : 'semi-annual'}
                      </span>
                    </div>

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
                          features.map((feature: string, index: number) => <li key={index}>{feature}</li>)
                        ) : (
                          <li>Details coming soon.</li>
                        )}
                      </ul>
                    </div>

                    <Link to={`/checkout/${plan.id}`} className={styles.selectButton}>
                      Select Plan
                    </Link>
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
