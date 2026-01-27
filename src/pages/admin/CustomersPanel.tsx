import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Customer, CustomerMembership } from '../../types';
import styles from './AdminPanel.module.css';

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<(Customer & { memberships?: CustomerMembership[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          memberships:customer_memberships(
            *,
            plan:maintenance_plans(name)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    customer.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className={styles.loading}>Loading customers...</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Customer Management</h2>
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Active Memberships</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => {
              const activeMemberships = customer.memberships?.filter((m) => m.status === 'active') || [];

              return (
                <tr key={customer.id}>
                  <td className={styles.name}>{customer.full_name}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone || 'N/A'}</td>
                  <td>
                    {customer.service_address}, {customer.city}, {customer.state}
                  </td>
                  <td>
                    {activeMemberships.length > 0 ? (
                      <span className={styles.badge}>
                        {activeMemberships.length} active
                      </span>
                    ) : (
                      <span className={styles.badgeInactive}>None</span>
                    )}
                  </td>
                  <td>{new Date(customer.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredCustomers.length === 0 && (
          <div className={styles.empty}>No customers found</div>
        )}
      </div>
    </div>
  );
}
