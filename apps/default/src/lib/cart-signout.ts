export function clearHouseCartOnSignOut(): void {
  // Browser privacy settings may deny storage access. Session revocation must still run.
  try { window.localStorage.removeItem('house-of-briar:cart'); } catch {}
  window.dispatchEvent(new Event('house-of-briar-cart'));
}
