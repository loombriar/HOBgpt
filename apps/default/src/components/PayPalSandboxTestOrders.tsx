import { useCallback, useEffect, useState } from 'react';

type TestOrder = {
  id: string;
  status: 'pending' | 'created' | 'completed' | 'failed';
  amountCents: number;
  currency: string;
  paypalOrderId: string | null;
  captureId: string | null;
};

const endpoint = '/api/admin/paypal-sandbox/test-orders';
const shortId = (value: string) => `${value.slice(0, 8)}…`;

export default function PayPalSandboxTestOrders() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [orders, setOrders] = useState<TestOrder[]>([]);
  const [approvalUrl, setApprovalUrl] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        setEnabled(false);
        return;
      }
      const payload = await response.json();
      setEnabled(payload?.enabled === true);
      setOrders(Array.isArray(payload?.items) ? payload.items : []);
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading || !enabled) return null;

  const createTestOrder = async () => {
    setBusy('create');
    setError('');
    setMessage('');
    setApprovalUrl('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Sandbox test order could not be created.');
      setApprovalUrl(payload.approvalUrl || '');
      setMessage('A fixed USD $1.00 PayPal sandbox order was created. Approve it with a PayPal sandbox buyer account; then return here and capture it explicitly.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sandbox test order could not be created.');
    } finally {
      setBusy('');
    }
  };

  const captureTestOrder = async (id: string) => {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/capture`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Sandbox capture could not be verified.');
      setMessage(payload.status === 'completed' ? 'Sandbox capture completed and recorded. No merchandise order or fulfillment was created.' : 'Sandbox test status updated.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sandbox capture could not be verified.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="mt-6 rounded-3xl border border-amber-500/40 bg-card p-6" aria-labelledby="paypal-sandbox-test-heading">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-700">Staging / sandbox only</p>
      <h2 id="paypal-sandbox-test-heading" className="mt-2 font-serif text-2xl">PayPal sandbox test</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Owner/operator smoke test only. Creates a fixed USD $1.00 sandbox order in an isolated test table—not a customer cart or merchandise order. It does not change inventory, seller balances, Stripe, refunds, shipping, or fulfillment. Use only PayPal sandbox buyer accounts; never enter real payment details.
      </p>
      <button type="button" disabled={Boolean(busy)} onClick={() => void createTestOrder()} className="mt-4 min-h-11 rounded-full border border-amber-600 px-5 text-sm font-semibold disabled:opacity-50">
        {busy === 'create' ? 'Creating sandbox order…' : 'Create $1 sandbox test order'}
      </button>
      {approvalUrl && <p className="mt-4"><a href={approvalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Open PayPal sandbox approval in a new tab</a></p>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Your recent sandbox test orders</h3>
          <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()} className="min-h-9 rounded-full border border-border px-4 text-xs">Refresh status</button>
        </div>
        {orders.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No sandbox test orders yet.</p> : (
          <ul className="mt-3 space-y-2">
            {orders.map(order => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                <div>
                  <strong>{shortId(order.id)}</strong>
                  <span className="ml-2">USD ${(order.amountCents / 100).toFixed(2)} · {order.status}</span>
                  {order.captureId && <p className="mt-1 text-xs text-muted-foreground">Capture recorded: {shortId(order.captureId)}</p>}
                </div>
                {order.status === 'created' && <button type="button" disabled={Boolean(busy)} onClick={() => void captureTestOrder(order.id)} className="min-h-10 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy === order.id ? 'Verifying sandbox capture…' : 'Capture approved $1 test'}</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
