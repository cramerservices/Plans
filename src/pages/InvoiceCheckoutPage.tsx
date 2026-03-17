import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import styles from './CheckoutPage.module.css';

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string;
  estimate_id?: string | null;
  invoice_date: string;
  due_date?: string | null;
  work_completed_date?: string | null;
  status: string;
  tech_name?: string | null;
  notes?: string | null;
  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
};

export default function InvoiceCheckoutPage() {
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get('invoiceId');

  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);

        if (!invoiceId) {
          setInvoice(null);
          return;
        }

        const { data, error } = await supabase
          .from('crm_invoices')
          .select('*')
          .eq('id', invoiceId)
          .maybeSingle();

        if (error) throw error;
        setInvoice((data as InvoiceRow | null) ?? null);
      } catch (error) {
        console.error('Error fetching invoice:', error);
        setInvoice(null);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId]);

  const amountDue = useMemo(() => Number(invoice?.amount_due ?? 0), [invoice]);
  const amountPaid = useMemo(() => Number(invoice?.amount_paid ?? 0), [invoice]);
  const totalAmount = useMemo(() => Number(invoice?.total_amount ?? 0), [invoice]);

  const selectedAmount = useMemo(() => {
    if (paymentMode === 'full') return amountDue;
    return Number(partialAmount || 0);
  }, [paymentMode, amountDue, partialAmount]);

  const isValidPartialAmount =
    paymentMode === 'full'
      ? true
      : selectedAmount > 0 && selectedAmount <= amountDue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoiceId) {
      alert('Missing invoiceId.');
      return;
    }

    if (!invoice) {
      alert('Invoice not found.');
      return;
    }

    if (amountDue <= 0) {
      alert('This invoice has no balance due.');
      return;
    }

    if (!isValidPartialAmount) {
      alert('Enter a valid payment amount not greater than the balance due.');
      return;
    }

    setProcessing(true);

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-invoice-checkout-session`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        alert('Please sign in before paying.');
        return;
      }

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          invoiceId,
          paymentAmount: Number(selectedAmount.toFixed(2)),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error('Invoice checkout error:', json);
        throw new Error(json?.error || json?.message || 'Failed to start Stripe checkout');
      }

      if (!json?.url) {
        throw new Error('Stripe checkout URL was not returned.');
      }

      window.location.href = json.url;
    } catch (error) {
      console.error('Error creating invoice checkout session:', error);
      alert('There was an error starting invoice checkout.');
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

  if (!invoiceId) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.error}>Missing invoiceId</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.error}>Invoice not found</div>
      </div>
    );
  }

  if (amountDue <= 0) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.planSummary}>
              <h2>Invoice Summary</h2>
              <div className={styles.summaryCard}>
                <h3>Invoice {invoice.invoice_number}</h3>
                <div className={styles.summaryDetails}>
                  <div className={styles.summaryItem}>
                    <span>Status:</span>
                    <strong>{invoice.status}</strong>
                  </div>
                  <div className={styles.summaryItem}>
                    <span>Total:</span>
                    <strong>${totalAmount.toFixed(2)}</strong>
                  </div>
                  <div className={styles.summaryItem}>
                    <span>Paid:</span>
                    <strong>${amountPaid.toFixed(2)}</strong>
                  </div>
                  <div className={styles.summaryItem}>
                    <span>Balance Due:</span>
                    <strong>${amountDue.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.checkoutForm}>
              <h2>This invoice is already paid</h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.planSummary}>
            <h2>Invoice Summary</h2>
            <div className={styles.summaryCard}>
              <h3>Invoice {invoice.invoice_number}</h3>

              <div className={styles.summaryDetails}>
                <div className={styles.summaryItem}>
                  <span>Status:</span>
                  <strong>{invoice.status}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Invoice Date:</span>
                  <strong>{new Date(invoice.invoice_date).toLocaleDateString()}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Due Date:</span>
                  <strong>
                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                  </strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Total:</span>
                  <strong>${totalAmount.toFixed(2)}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Paid:</span>
                  <strong>${amountPaid.toFixed(2)}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Balance Due:</span>
                  <strong>${amountDue.toFixed(2)}</strong>
                </div>
              </div>

              {invoice.notes && (
                <div style={{ marginTop: 16 }}>
                  <strong>Notes:</strong>
                  <p>{invoice.notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className={styles.checkoutForm}>
            <h2>Pay Invoice</h2>

            <form onSubmit={handleSubmit}>
              <div className={styles.section}>
                <h3>Select Payment Amount</h3>

                <div className={styles.formGroup}>
                  <label>
                    <input
                      type="radio"
                      name="paymentMode"
                      checked={paymentMode === 'full'}
                      onChange={() => setPaymentMode('full')}
                    />{' '}
                    Pay full balance: ${amountDue.toFixed(2)}
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label>
                    <input
                      type="radio"
                      name="paymentMode"
                      checked={paymentMode === 'partial'}
                      onChange={() => setPaymentMode('partial')}
                    />{' '}
                    Make a partial payment
                  </label>
                </div>

                {paymentMode === 'partial' && (
                  <div className={styles.formGroup}>
                    <label>Partial Payment Amount</label>
                    <input
                      type="number"
                      min="0.01"
                      max={amountDue}
                      step="0.01"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder={`Enter amount up to ${amountDue.toFixed(2)}`}
                      required
                    />
                  </div>
                )}

                <div className={styles.paymentNote}>
                  You will be redirected to secure Stripe checkout to complete your payment.
                </div>
              </div>

              <button type="submit" className={styles.submitButton} disabled={processing}>
                {processing
                  ? 'Redirecting to Stripe...'
                  : `Continue to Stripe - $${selectedAmount.toFixed(2)}`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
