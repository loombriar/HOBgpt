(() => {
  const header = document.querySelector('.site-header.sewing-header');
  const cart = document.getElementById('cart-btn');
  const quickCart = document.getElementById('house-compact-cart');
  quickCart?.addEventListener('click', () => cart?.click());
  const update = () => {
    document.body.classList.toggle('house-header-scrolled', window.scrollY > 100);
  };
  window.addEventListener('scroll', update, {passive:true});
  update();
  if (new URLSearchParams(location.search).get('openCart') === '1' && cart) {
    window.addEventListener('load', () => {
      cart.click();
      history.replaceState(null, '', location.pathname + location.hash);
    }, {once:true});
  }
  document.querySelectorAll('.house-compact-menu a').forEach(link => link.addEventListener('click', () => {
    const menu = link.closest('details');
    if (menu) menu.open = false;
  }));
})();