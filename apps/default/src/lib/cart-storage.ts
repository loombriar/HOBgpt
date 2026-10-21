export const CART_KEY = 'house-of-briar:cart';

/** Treat browser-saved cart data as untrusted and keep one entry per piece. */
export function readCartIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) ?? '[]');
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : [];
  } catch {
    return [];
  }
}
