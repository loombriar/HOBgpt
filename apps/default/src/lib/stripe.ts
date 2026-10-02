export type CheckoutItem = {
  id: string;
  name: string;
  amount: number;
  quantity?: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || 'Checkout could not be completed.');
  return payload as T;
}

export async function createCheckoutSession(items: CheckoutItem[], couponCode = '') {
  if (couponCode.trim()) throw new Error('Promo codes are temporarily unavailable while checkout is being upgraded.');
  const result = await api<{ url: string }>('/api/checkout/session', {
    method: 'POST',
    body: JSON.stringify({ items: items.map(item => ({ id: item.id, quantity: item.quantity ?? 1 })) }),
  });
  if (!result.url) throw new Error('Stripe did not return a checkout link.');
  return result.url;
}

export async function cancelCheckoutOrder(orderId: string, cancelToken: string) {
  if (!orderId || !cancelToken) return;
  await api<{ status: string }>(`/api/checkout/cancel/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'X-Checkout-Cancel-Token': cancelToken } });
}

export async function verifyCheckoutSession(sessionId: string) {
  if (!sessionId.startsWith('cs_')) throw new Error('The checkout receipt reference is not valid.');
  return api<{ paid: boolean; orderId: string; status: string }>(`/api/checkout/session/${encodeURIComponent(sessionId)}`);
}

export async function createDonationSession(_amount: number) {
  throw new Error('Donations are temporarily unavailable while checkout is being upgraded.');
}

export async function createRefund(_chargeOrPaymentIntent: string) {
  throw new Error('Refunds must be handled from the House of Briar administration flow.');
}
