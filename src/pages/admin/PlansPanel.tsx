import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MaintenancePlan } from '../../types';
import styles from './AdminPanel.module.css';

export default function PlansPanel() {
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
        .order('price', { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePlanStatus = async (plan: MaintenancePlan) => {
    try {
      const { error } = await supabase
        .from('maintenance_plans')
        .update({ is_active: !plan.is_active })
        .eq('id', plan.id);

      if (error) throw error;
      fetchPlans();
    } catch (error) {
      console.error('Error updating plan:', error);
      alert('Failed to update plan status');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading plans...</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Plan Management</h2>
      </div>

      <div className={styles.plansGrid}>
        {plans.map((plan) => (
          <div key={plan.id} className={styles.planCard}>
            <div className={styles.planCardHeader}>
              <h3>{plan.name}</h3>
              <div className={styles.planCardActions}>
                <button
                  onClick={() => togglePlanStatus(plan)}
                  className={plan.is_active ? styles.buttonSuccess : styles.buttonWarning}
                >
                  {plan.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>

            <p className={styles.planDescription}>{plan.description}</p>

            <div className={styles.planDetails}>
              <div className={styles.detailRow}>
                <span>Price:</span>
                <strong>${plan.price}/{plan.billing_frequency}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Tune-ups per year:</span>
                <strong>{plan.tune_ups_per_year}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Discount:</span>
                <strong>{plan.discount_percentage}%</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Priority Service:</span>
                <strong>{plan.priority_service ? 'Yes' : 'No'}</strong>
              </div>
            </div>

            <div className={styles.planFeatures}>
              <strong>Features:</strong>
              <ul>
                {plan.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
