export function clearHouseCartOnSignOut(): void {
  window.localStorage.removeItem('house-of-briar:cart');
  window.dispatchEvent(new Event('house-of-briar-cart'));
}
