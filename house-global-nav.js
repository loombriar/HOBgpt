(() => {
  const header = document.querySelector('header.site-header, body > header');
  if (!header || document.getElementById('hob-global-nav')) return;
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
    link.textContent = 'Cart';
    slot.replaceWith(link);
  }
  header.classList.add('hob-original-header');
  header.insertAdjacentElement('beforebegin', nav);
  if (onHome && new URLSearchParams(location.search).get('openCart') === '1') {
    window.addEventListener('load', () => {
      const button = document.getElementById('cart-btn');
      if (button) button.click();
      history.replaceState(null, '', location.pathname + location.hash);
    }, {once:true});
  }
})();