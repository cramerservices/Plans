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
    try {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
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
            {plans.map((plan) => (
              <div key={plan.id} className={styles.planCard}>
                {plan.priority_service && (
                  <div className={styles.badge}>Most Popular</div>
                )}

                <h2 className={styles.planName}>{plan.name}</h2>
                <p className={styles.planDescription}>{plan.description}</p>

                <div className={styles.pricing}>
                  <span className={styles.price}>${plan.price}</span>
                  <span className={styles.frequency}>
                    /{plan.billing_frequency === 'annual' ? 'year' : 'semi-annual'}
                  </span>
                </div>

                <div className={styles.planDetails}>
                  <div className={styles.detailItem}>
                    <strong>{plan.tune_ups_per_year}</strong> tune-ups per year
                  </div>
                  <div className={styles.detailItem}>
                    <strong>{plan.discount_percentage}%</strong> discount on repairs
                  </div>
                  {plan.priority_service && (
                    <div className={styles.detailItem}>
                      <strong>Priority</strong> emergency service
                    </div>
                  )}
                </div>

                <div className={styles.features}>
                  <h3>Plan Features:</h3>
                  <ul className={styles.featuresList}>
                    {plan.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>

                <Link to={`/checkout/${plan.id}`} className={styles.selectButton}>
                  Select Plan
                </Link>
              </div>
            ))}
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
