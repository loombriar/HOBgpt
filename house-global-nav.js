(() => {
  const header = document.querySelector('header.site-header, body > header');
  if (document.getElementById('hob-global-nav')) {
    if (location.pathname === '/' && new URLSearchParams(location.search).get('openCart') === '1') {
      window.addEventListener('load', () => { document.getElementById('cart-btn')?.click(); history.replaceState(null, '', location.pathname + location.hash); }, { once: true });
    }
    return;
  }
  const onHome = location.pathname === '/' || location.pathname === '/index.html';
  const nav = document.createElement('div');
  nav.id = 'hob-global-nav';
  nav.className = 'hob-global-nav';
  nav.innerHTML = '<a class="hob-global-wordmark" href="/" aria-label="House of Briar home">HOUSE <i>of</i> BRIAR</a><nav aria-label="House of Briar main menu"><a href="/#shop">Shop</a><a href="/designers/room">Designers</a><a href="/creative-house.html">The Creative House</a><span class="hob-global-cart-slot"></span></nav>';
  const slot = nav.querySelector('.hob-global-cart-slot');
  const cart = document.getElementById('cart-btn');
  if (cart) {
    cart.classList.add('hob-global-cart-button');
    cart.removeAttribute('aria-describedby');
    slot.replaceWith(cart);
  } else {
    const link = document.createElement('a');
    link.className = 'hob-global-cart-link';
    link.href = '/?openCart=1';
    link.setAttribute('aria-label', 'Open shopping cart');
    link.innerHTML = '<img class="suitcase-nav-icon" src="/suitcase-cart-v1.svg" alt="" aria-hidden="true"><span>Cart</span>';
    slot.replaceWith(link);
  }
  if (header) header.classList.add('hob-original-header');
  // Attach the bar directly to body so page-shell overflow and sticky headers cannot clip it.
  document.body.insertBefore(nav, document.body.firstChild);

  // A fixed bar must reserve its own vertical space; measure wrapped mobile rows too.
  const setOffset = () => {
    const height = Math.ceil(nav.getBoundingClientRect().height);
    document.body.style.paddingTop = height + 'px';
    document.documentElement.style.scrollPaddingTop = height + 12 + 'px';
  };
  setOffset();
  window.addEventListener('resize', setOffset);
  if (window.ResizeObserver) new ResizeObserver(setOffset).observe(nav);
  if (onHome && new URLSearchParams(location.search).get('openCart') === '1') {
    window.addEventListener('load', () => {
      const button = document.getElementById('cart-btn');
      if (button) button.click();
      history.replaceState(null, '', location.pathname + location.hash);
    }, {once:true});
  }
})();