export type SnapshotItem = { id: string; name: string; amount: number; quantity: number };
export type CheckoutSnapshot = { ids: string[]; items: SnapshotItem[]; subtotal: number };

/** A saved checkout is display data only; payment is verified with the server. */
export function readCheckoutSnapshot(): CheckoutSnapshot | null {
  try {
    const value = JSON.parse(window.localStorage.getItem('house-of-briar:checkout-pending') ?? 'null');
    if (!value || !Array.isArray(value.ids) || !Array.isArray(value.items) ||
        value.ids.length === 0 || value.ids.length > 200 || value.ids.length !== value.items.length ||
        !Number.isFinite(value.subtotal) || value.subtotal < 0) return null;
    const ids: unknown[] = value.ids;
    if (!ids.every(id => typeof id === 'string' && id.trim().length > 0) || new Set(ids).size !== ids.length) return null;
    const valid = value.items.every((item: unknown, index: number) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return row.id === ids[index] && typeof row.name === 'string' && row.name.trim().length > 0 &&
        typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount >= 0 && row.quantity === 1;
    });
    return valid ? value as CheckoutSnapshot : null;
  } catch {
    return null;
  }
}
