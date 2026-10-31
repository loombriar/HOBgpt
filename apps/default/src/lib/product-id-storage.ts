/** Browser privacy settings may reject storage access before JSON parsing. */
export function readProductIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
