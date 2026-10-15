(() => {
  const header = document.querySelector('header.site-header, body > header');
  let nav = document.getElementById('hob-global-nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'hob-global-nav';
    nav.className = 'hob-global-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'House of Briar main navigation');
    nav.innerHTML = '<a class="hob-global-wordmark" href="/" aria-label="House of Briar home">HOUSE <i>of</i> BRIAR</a><nav aria-label="House of Briar main menu"><a href="/#shop">Shop</a><a href="/designers/room">Designers</a><a href="/creative-house.html">The Creative House</a><a class="hob-global-cart-link" href="/?openCart=1" aria-label="Open shopping cart"><img class="suitcase-nav-icon" src="/suitcase-cart-v1.svg" alt="" aria-hidden="true"><span>Cart</span></a></nav>';
    document.body.prepend(nav);
  }
  const links = nav.querySelector('nav');
  const creativeLink = links.querySelector('a[href="/creative-house.html"]');
  if (creativeLink && location.pathname === '/creative-house.html' && !links.querySelector('.hob-creative-menu')) {
    const menu = document.createElement('details');
    menu.className = 'hob-creative-menu';
    const summary = document.createElement('summary');
    summary.textContent = 'Creative categories';
    menu.appendChild(summary);
    const panel = document.createElement('div');
    panel.className = 'hob-creative-menu-panel';
    for (const [section, label] of [
      ['opportunities', 'Open calls'], ['creative-directory', 'Models & photographers'],
      ['your-profile', 'My creative profile'], ['fashion-events', 'Fashion events'],
      ['event-creatives', 'DJs & venues'], ['event-profile-editor', 'My event profile'],
      ['private-inquiries', 'Private inquiries'], ['casting-commissioning', 'Project requests'],
      ['post', 'Post a call'], ['post-event', 'Post an event'],
    ]) {
      const link = document.createElement('a');
      link.href = (location.pathname === '/creative-house.html' ? '' : '/creative-house.html') + '#' + section;
      link.textContent = label;
      link.addEventListener('click', () => { menu.open = false; });
      panel.appendChild(link);
    }
    menu.appendChild(panel);
    creativeLink.after(menu);
    document.addEventListener('click', event => {
      if (!menu.contains(event.target)) menu.open = false;
    });
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { menu.open = false; summary.focus(); }
    });
  }
  const account = document.getElementById('header-customer-auth-btn');
  if (account) {
    account.classList.remove('nav-hotspot');
    links.appendChild(account);
  } else {
    const signIn = document.createElement('a');
    signIn.href = '/?visitors=signup';
    signIn.className = 'hob-global-account-link';
    signIn.textContent = 'My account';
    links.appendChild(signIn);
  }
  const cart = document.getElementById('cart-btn');
  const placeholder = links.querySelector('.hob-global-cart-link');
  if (cart && placeholder) {
    cart.classList.remove('nav-hotspot', 'suitcase-button');
    cart.classList.add('hob-global-cart-button');
    cart.removeAttribute('aria-describedby');
    placeholder.replaceWith(cart);
  }
  let themeButton = document.getElementById('hob-theme-toggle');
  if (!themeButton) {
    themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.id = 'hob-theme-toggle';
    links.appendChild(themeButton);
  }
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('house-of-briar-theme') || localStorage.getItem('theme') || 'light'; } catch {}
  document.documentElement.dataset.hobTheme = savedTheme === 'dark' ? 'dark' : 'light';
  const syncTheme = () => {
    const dark = document.documentElement.dataset.hobTheme === 'dark';
    const icon = document.getElementById('hob-theme-icon') || themeButton;
    icon.textContent = dark ? '☀' : '☾';
    themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeButton.setAttribute('aria-pressed', String(dark));
  };
  themeButton.addEventListener('click', () => {
    const theme = document.documentElement.dataset.hobTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.hobTheme = theme;
    try { localStorage.setItem('house-of-briar-theme', theme); localStorage.setItem('theme', theme); } catch {}
    syncTheme();
  });
  syncTheme();
  links.querySelectorAll('a').forEach(link => {
    if (link.pathname === location.pathname && link.pathname !== '/') link.setAttribute('aria-current', 'page');
  });
  const actions = document.createElement('div');
  actions.className = 'hob-global-actions';
  actions.setAttribute('aria-label', 'Account, cart and theme');
  for (const control of [themeButton, links.querySelector('.hob-global-cart-button,.hob-global-cart-link'), account || links.querySelector('.hob-global-account-link')]) {
    if (control) actions.appendChild(control);
  }
  nav.appendChild(actions);
  if (header) header.classList.add('hob-original-header');
  const setOffset = () => {
    const height = Math.ceil(nav.getBoundingClientRect().height);
    document.body.style.paddingTop = height + 'px';
    document.documentElement.style.setProperty('--hob-bar-height', height + 'px');
    document.documentElement.style.setProperty('--hob-creative-nav-height', height + 'px');
    document.documentElement.style.scrollPaddingTop = height + 12 + 'px';
  };
  setOffset();
  window.addEventListener('resize', setOffset);
  if (window.ResizeObserver) new ResizeObserver(setOffset).observe(nav);
  const onHome = location.pathname === '/' || location.pathname === '/index.html';
  if (onHome && new URLSearchParams(location.search).get('openCart') === '1') {
    window.addEventListener('load', () => {
      document.getElementById('cart-btn')?.click();
      history.replaceState(null, '', location.pathname + location.hash);
    }, {once:true});
  }
})();
