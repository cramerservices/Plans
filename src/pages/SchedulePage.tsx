import { FormEvent, useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import styles from './SchedulePage.module.css';

type Appointment = { id: string; appointment_date: string; start_time: string; service_type: string; status: string; service_address?: string | null };
type Slot = { start_time: string; label: string };

export default function SchedulePage() {
  const { user, session } = useAuth();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: user?.user_metadata?.full_name || '', phone: user?.user_metadata?.phone || '', email: user?.email || '',
    serviceAddress: '', serviceType: 'Tune-Up', appointmentDate: '', startTime: '', notes: ''
  });

  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-appointment`;
  const callScheduler = async (body: Record<string, unknown>) => {
    const response = await fetch(functionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'Scheduling request failed');
    return json;
  };

  const loadAppointments = async (id: string | null, email: string) => {
    let query = supabase.from('appointments').select('id, appointment_date, start_time, service_type, status, service_address').gte('appointment_date', new Date().toISOString().slice(0, 10)).neq('status', 'cancelled').order('appointment_date').order('start_time');
    query = id ? query.eq('customer_id', id) : query.ilike('customer_email', email);
    const { data, error } = await query;
    if (!error) setAppointments((data || []) as Appointment[]);
  };

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const { data: profile } = await supabase.from('profiles').select('customer_id').eq('auth_user_id', user.id).maybeSingle();
      let customer: any = null;
      if (profile?.customer_id) customer = (await supabase.from('customers').select('*').eq('id', profile.customer_id).maybeSingle()).data;
      if (!customer) customer = (await supabase.from('customers').select('*').ilike('email', user.email || '').limit(1).maybeSingle()).data;
      const id = customer?.id || null;
      setCustomerId(id);
      setForm((current) => ({ ...current, name: customer?.name || user.user_metadata?.full_name || current.name, phone: customer?.phone || user.user_metadata?.phone || current.phone, email: user.email || current.email, serviceAddress: customer?.address || current.serviceAddress }));
      await loadAppointments(id, user.email || '');
    })();
  }, [user]);

  const loadTimes = async () => {
    if (!form.appointmentDate) { setMessage('Choose a date first.'); return; }
    setLoadingSlots(true); setMessage(''); setSlots([]);
    try { const data = await callScheduler({ action: 'availability', date: form.appointmentDate, serviceType: form.serviceType }); setSlots(data.slots || []); }
    catch (error: any) { setMessage(error.message); }
    finally { setLoadingSlots(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.startTime) { setMessage('Load times and select an appointment time.'); return; }
    setSaving(true); setMessage('');
    try {
      await callScheduler({ action: 'create', ...form, customerId });
      setMessage('Your appointment is scheduled. A confirmation email will be sent shortly.');
      setSlots([]); setForm((current) => ({ ...current, appointmentDate: '', startTime: '', notes: '' }));
      await loadAppointments(customerId, form.email);
    } catch (error: any) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  return <div className={styles.page}><Header /><main className={styles.container}><div className={styles.heading}><h1>Schedule Service</h1><p>Your account information is filled in automatically.</p></div>
    <div className={styles.layout}><form className={styles.card} onSubmit={submit}><h2>New appointment</h2>
      <div className={styles.grid}><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label></div>
      <label>Email<input type="email" value={form.email} readOnly /></label><label>Service address<input value={form.serviceAddress} onChange={(e) => setForm({ ...form, serviceAddress: e.target.value })} required /></label>
      <div className={styles.grid}><label>Service type<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value, startTime: '' })}>{['Tune-Up','Diagnostic','Repair','Estimate','Install','Other'].map((x) => <option key={x}>{x}</option>)}</select></label><label>Date<input type="date" min={new Date().toISOString().slice(0, 10)} value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value, startTime: '' })} required /></label></div>
      <button type="button" className={styles.secondary} onClick={loadTimes} disabled={loadingSlots}>{loadingSlots ? 'Loading…' : 'Load Available Times'}</button><div className={styles.slots}>{slots.map((slot) => <button type="button" key={slot.start_time} className={form.startTime === slot.start_time ? styles.selectedSlot : styles.slot} onClick={() => setForm({ ...form, startTime: slot.start_time })}>{slot.label}</button>)}</div>
      <label>What should we know?<textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} required /></label><button className={styles.primary} disabled={saving}>{saving ? 'Scheduling…' : 'Schedule Appointment'}</button>{message && <p className={styles.message}>{message}</p>}
    </form><section className={styles.card}><h2>Upcoming appointments</h2>{appointments.length ? appointments.map((item) => <article className={styles.appointment} key={item.id}><strong>{item.service_type}</strong><span>{new Date(`${item.appointment_date}T${item.start_time}`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><span>{item.service_address}</span><b>{item.status.replace(/_/g, ' ')}</b></article>) : <p>No upcoming appointments.</p>}</section></div>
  </main></div>;
}
