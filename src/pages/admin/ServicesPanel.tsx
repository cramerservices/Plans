import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ServiceCompleted, Customer } from '../../types';
import styles from './AdminPanel.module.css';

interface CustomerOption {
  id: string;
  full_name: string;
  email: string;
}

export default function ServicesPanel() {
  const [services, setServices] = useState<(ServiceCompleted & { customer?: Customer })[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: '',
    service_date: '',
    service_type: 'Tune-Up',
    technician_name: '',
    summary: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [servicesResult, customersResult] = await Promise.all([
        supabase
          .from('services_completed')
          .select(`
            *,
            customer:customers(full_name, email)
          `)
          .order('service_date', { ascending: false })
          .limit(50),
        supabase
          .from('customers')
          .select('id, full_name, email')
          .order('full_name'),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (customersResult.error) throw customersResult.error;

      setServices(servicesResult.data || []);
      setCustomers(customersResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase.from('services_completed').insert([
        {
          customer_id: formData.customer_id,
          service_date: formData.service_date,
          service_type: formData.service_type,
          technician_name: formData.technician_name,
          summary: formData.summary,
          work_completed: [],
          recommendations: [],
        },
      ]);

      if (error) throw error;

      alert('Service added successfully!');
      setShowAddForm(false);
      setFormData({
        customer_id: '',
        service_date: '',
        service_type: 'Tune-Up',
        technician_name: '',
        summary: '',
      });
      fetchData();
    } catch (error) {
      console.error('Error adding service:', error);
      alert('Failed to add service');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading services...</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Service Management</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={styles.buttonPrimary}
        >
          {showAddForm ? 'Cancel' : 'Add Service'}
        </button>
      </div>

      {showAddForm && (
        <div className={styles.form}>
          <h3>Add New Service</h3>
          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Customer</label>
                <select
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  required
                >
                  <option value="">Select customer...</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name} ({customer.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Service Date</label>
                <input
                  type="date"
                  value={formData.service_date}
                  onChange={(e) => setFormData({ ...formData, service_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Service Type</label>
                <select
                  value={formData.service_type}
                  onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
                >
                  <option>Tune-Up</option>
                  <option>Repair</option>
                  <option>Installation</option>
                  <option>Emergency Service</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Technician Name</label>
                <input
                  type="text"
                  value={formData.technician_name}
                  onChange={(e) => setFormData({ ...formData, technician_name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Summary</label>
              <textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                rows={4}
                placeholder="Brief summary of work performed..."
              />
            </div>

            <button type="submit" className={styles.buttonPrimary}>
              Add Service
            </button>
          </form>
        </div>
      )}

      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Service Type</th>
              <th>Technician</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{new Date(service.service_date).toLocaleDateString()}</td>
                <td>{service.customer?.full_name || 'Unknown'}</td>
                <td>
                  <span className={styles.badge}>{service.service_type}</span>
                </td>
                <td>{service.technician_name || 'N/A'}</td>
                <td className={styles.summary}>{service.summary || 'No summary'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {services.length === 0 && (
          <div className={styles.empty}>No services recorded yet</div>
        )}
      </div>
    </div>
  );
}
