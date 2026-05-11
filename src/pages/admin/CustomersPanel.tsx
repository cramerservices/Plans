import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import styles from './AdminPanel.module.css';

interface MaintenancePlan {
  id: string;
  name: string;
  price: number;
  billing_frequency?: string;
  tune_ups_per_year?: number;
}

interface CustomerMembership {
  id: string;
  customer_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  end_date: string;
  tune_ups_remaining: number;
  agreement_signed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  mini_split_heads?: number | null;
  plan?: MaintenancePlan | null;
}

interface PortalCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  service_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  memberships?: CustomerMembership[];
}

const emptyCustomerForm = {
  full_name: '',
  email: '',
  phone: '',
  service_address: '',
  city: '',
  state: 'MO',
  zip_code: '',
};

const emptyMembershipForm = {
  plan_id: '',
  status: 'active',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
    .toISOString()
    .slice(0, 10),
  tune_ups_remaining: 2,
  mini_split_heads: '',
};

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<PortalCustomer | null>(null);
  const [selectedCustomerForMembership, setSelectedCustomerForMembership] =
    useState<PortalCustomer | null>(null);

  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [membershipForm, setMembershipForm] = useState(emptyMembershipForm);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    try {
      const [customersResult, plansResult] = await Promise.all([
        supabase
          .from('portal_customers')
          .select(`
            *,
            memberships:customer_memberships(
              *,
              plan:maintenance_plans(
                id,
                name,
                price
              )
            )
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('maintenance_plans')
          .select('id, name, price')
          .eq('is_active', true)
          .order('price', { ascending: true }),
      ]);

      if (customersResult.error) throw customersResult.error;
      if (plansResult.error) throw plansResult.error;

      setCustomers(customersResult.data || []);
      setPlans(plansResult.data || []);
    } catch (error) {
      console.error('Error fetching admin customer data:', error);
      alert('Failed to load customers. Check the console for details.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateCustomer() {
    setCustomerForm(emptyCustomerForm);
    setEditingCustomer(null);
    setShowCreateForm(true);
  }

  function openEditCustomer(customer: PortalCustomer) {
    setCustomerForm({
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      service_address: customer.service_address || '',
      city: customer.city || '',
      state: customer.state || 'MO',
      zip_code: customer.zip_code || '',
    });

    setEditingCustomer(customer);
    setShowCreateForm(true);
  }

  function openMembershipForm(customer: PortalCustomer) {
    setSelectedCustomerForMembership(customer);
    setMembershipForm(emptyMembershipForm);
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const cleanEmail = customerForm.email.trim().toLowerCase();

    try {
      let customerId = editingCustomer?.id;

      if (editingCustomer) {
        const { error } = await supabase
          .from('portal_customers')
          .update({
            full_name: customerForm.full_name.trim(),
            email: cleanEmail,
            phone: customerForm.phone.trim(),
            service_address: customerForm.service_address.trim(),
            city: customerForm.city.trim(),
            state: customerForm.state.trim(),
            zip_code: customerForm.zip_code.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('portal_customers')
          .insert({
            full_name: customerForm.full_name.trim(),
            email: cleanEmail,
            phone: customerForm.phone.trim(),
            service_address: customerForm.service_address.trim(),
            city: customerForm.city.trim(),
            state: customerForm.state.trim(),
            zip_code: customerForm.zip_code.trim(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;
        customerId = data.id;
      }

      if (cleanEmail && customerId) {
        await syncProfileForCustomer(customerId, cleanEmail);
      }

      alert(editingCustomer ? 'Customer updated successfully.' : 'Customer created successfully.');
      setShowCreateForm(false);
      setEditingCustomer(null);
      setCustomerForm(emptyCustomerForm);
      fetchData();
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Failed to save customer. Check the console for details.');
    } finally {
      setSaving(false);
    }
  }

  async function syncProfileForCustomer(customerId: string, email: string) {
    const { data: existingProfile, error: profileFindError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileFindError) {
      console.error('Profile lookup failed:', profileFindError);
      return;
    }

    if (existingProfile?.id) {
      const { error } = await supabase
        .from('profiles')
        .update({
          portal_customer_id: customerId,
          full_name: customerForm.full_name.trim(),
          phone: customerForm.phone.trim(),
          service_address: customerForm.service_address.trim(),
          city: customerForm.city.trim(),
          state: customerForm.state.trim(),
          zip_code: customerForm.zip_code.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id);

      if (error) {
        console.error('Profile update failed:', error);
      }

      return;
    }

    const { error } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(),
      email,
      role: 'customer',
      portal_customer_id: customerId,
      full_name: customerForm.full_name.trim(),
      phone: customerForm.phone.trim(),
      service_address: customerForm.service_address.trim(),
      city: customerForm.city.trim(),
      state: customerForm.state.trim(),
      zip_code: customerForm.zip_code.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Profile insert failed:', error);
    }
  }

  async function createMembership(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedCustomerForMembership) return;

    if (!membershipForm.plan_id) {
      alert('Select a plan first.');
      return;
    }

    setSaving(true);

    try {
      const selectedPlan = plans.find((plan) => plan.id === membershipForm.plan_id);

      const { data, error } = await supabase
        .from('customer_memberships')
        .insert({
          customer_id: selectedCustomerForMembership.id,
          plan_id: membershipForm.plan_id,
          status: membershipForm.status,
          start_date: membershipForm.start_date,
          end_date: membershipForm.end_date,
          tune_ups_remaining: Number(membershipForm.tune_ups_remaining),
          mini_split_heads: membershipForm.mini_split_heads
            ? Number(membershipForm.mini_split_heads)
            : null,
          agreement_signed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      if (selectedCustomerForMembership.email) {
        await supabase
          .from('profiles')
          .update({
            customer_membership_id: data.id,
            updated_at: new Date().toISOString(),
          })
          .eq('email', selectedCustomerForMembership.email.toLowerCase());
      }

      alert(`${selectedPlan?.name || 'Membership'} created successfully.`);
      setSelectedCustomerForMembership(null);
      setMembershipForm(emptyMembershipForm);
      fetchData();
    } catch (error) {
      console.error('Error creating membership:', error);
      alert('Failed to create membership. Check the console for details.');
    } finally {
      setSaving(false);
    }
  }

  async function updateMembershipStatus(membershipId: string, status: string) {
    try {
      const { error } = await supabase
        .from('customer_memberships')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', membershipId);

      if (error) throw error;

      fetchData();
    } catch (error) {
      console.error('Error updating membership:', error);
      alert('Failed to update membership.');
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.toLowerCase();

    return (
      customer.full_name?.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.toLowerCase().includes(search) ||
      customer.service_address?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return <div className={styles.loading}>Loading customers...</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Customer Management</h2>
          <p className={styles.helpText}>
            Create customers manually, edit contact info, and manage memberships.
          </p>
        </div>

        <button onClick={openCreateCustomer} className={styles.buttonPrimary}>
          Add Manual Customer
        </button>
      </div>

      {showCreateForm && (
        <div className={styles.form}>
          <h3>{editingCustomer ? 'Edit Customer' : 'Create Manual Customer'}</h3>

          <form onSubmit={saveCustomer}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Full Name</label>
                <input
                  type="text"
                  value={customerForm.full_name}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, full_name: e.target.value })
                  }
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Email</label>
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, email: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Phone</label>
                <input
                  type="text"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, phone: e.target.value })
                  }
                />
              </div>

              <div className={styles.formGroup}>
                <label>Service Address</label>
                <input
                  type="text"
                  value={customerForm.service_address}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      service_address: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>City</label>
                <input
                  type="text"
                  value={customerForm.city}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, city: e.target.value })
                  }
                />
              </div>

              <div className={styles.formGroup}>
                <label>State</label>
                <input
                  type="text"
                  value={customerForm.state}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, state: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>ZIP Code</label>
              <input
                type="text"
                value={customerForm.zip_code}
                onChange={(e) =>
                  setCustomerForm({ ...customerForm, zip_code: e.target.value })
                }
              />
            </div>

            <div className={styles.modalActions}>
              <button type="submit" className={styles.buttonPrimary} disabled={saving}>
                {saving ? 'Saving...' : 'Save Customer'}
              </button>

              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingCustomer(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedCustomerForMembership && (
        <div className={styles.form}>
          <h3>Create Membership for {selectedCustomerForMembership.full_name}</h3>

          <form onSubmit={createMembership}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Plan</label>
                <select
                  value={membershipForm.plan_id}
                  onChange={(e) =>
                    setMembershipForm({
                      ...membershipForm,
                      plan_id: e.target.value,
                    })
                  }
                  required
                >
                  <option value="">Select plan...</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - ${Number(plan.price).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Status</label>
                <select
                  value={membershipForm.status}
                  onChange={(e) =>
                    setMembershipForm({
                      ...membershipForm,
                      status: e.target.value,
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Start Date</label>
                <input
                  type="date"
                  value={membershipForm.start_date}
                  onChange={(e) =>
                    setMembershipForm({
                      ...membershipForm,
                      start_date: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>End Date</label>
                <input
                  type="date"
                  value={membershipForm.end_date}
                  onChange={(e) =>
                    setMembershipForm({
                      ...membershipForm,
                      end_date: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Tune-Ups Remaining</label>
                <input
                  type="number"
                  min="0"
                  value={membershipForm.tune_ups_remaining}
                  onChange={(e) =>
                    setMembershipForm({
                      ...membershipForm,
                      tune_ups_remaining: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Mini Split Heads</label>
                <input
                  type="number"
                  min="0"
                  value={membershipForm.mini_split_heads}
                  onChange={(e) =>
                    setMembershipForm({
                      ...membershipForm,
                      mini_split_heads: e.target.value,
                    })
                  }
                  placeholder="Leave blank if not mini split"
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button type="submit" className={styles.buttonPrimary} disabled={saving}>
                {saving ? 'Saving...' : 'Create Membership'}
              </button>

              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setSelectedCustomerForMembership(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <input
        type="text"
        placeholder="Search customers by name, email, phone, or address..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
        style={{ marginBottom: '1rem', width: '100%' }}
      />

      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email / Phone</th>
              <th>Address</th>
              <th>Memberships</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredCustomers.map((customer) => {
              const activeMemberships =
                customer.memberships?.filter((membership) => membership.status === 'active') || [];

              return (
                <tr key={customer.id}>
                  <td className={styles.name}>{customer.full_name || 'No name'}</td>

                  <td>
                    <div>{customer.email || 'No email'}</div>
                    <div>{customer.phone || 'No phone'}</div>
                  </td>

                  <td>
                    {customer.service_address || 'No address'}
                    <br />
                    {[customer.city, customer.state, customer.zip_code]
                      .filter(Boolean)
                      .join(', ')}
                  </td>

                  <td>
                    {customer.memberships && customer.memberships.length > 0 ? (
                      <div>
                        {customer.memberships.map((membership) => (
                          <div key={membership.id} style={{ marginBottom: '0.5rem' }}>
                            <span
                              className={
                                membership.status === 'active'
                                  ? styles.badge
                                  : styles.badgeInactive
                              }
                            >
                              {membership.plan?.name || 'Plan'} - {membership.status}
                            </span>

                            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                              {membership.start_date} to {membership.end_date}
                              <br />
                              Tune-ups left: {membership.tune_ups_remaining}
                            </div>

                            <div style={{ marginTop: '0.25rem' }}>
                              <button
                                type="button"
                                className={styles.buttonSuccess}
                                onClick={() =>
                                  updateMembershipStatus(membership.id, 'active')
                                }
                              >
                                Active
                              </button>{' '}
                              <button
                                type="button"
                                className={styles.buttonWarning}
                                onClick={() =>
                                  updateMembershipStatus(membership.id, 'cancelled')
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.badgeInactive}>None</span>
                    )}

                    {activeMemberships.length > 0 && (
                      <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {activeMemberships.length} active
                      </div>
                    )}
                  </td>

                  <td>
                    {customer.created_at
                      ? new Date(customer.created_at).toLocaleDateString()
                      : 'N/A'}
                  </td>

                  <td>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => openEditCustomer(customer)}
                    >
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className={styles.buttonPrimary}
                      onClick={() => openMembershipForm(customer)}
                    >
                      Add Membership
                    </button>
                  </td>
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
