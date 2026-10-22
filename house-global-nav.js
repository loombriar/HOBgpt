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
  nav.classList.add('hob-global-nav');
  const links = nav.querySelector('nav');
  const designerEntry = links.querySelector('a[href="/designers/room"]');
  if (designerEntry) {
    designerEntry.classList.add('hob-global-designer-link');
    designerEntry.textContent = 'Designer sign in';
    designerEntry.addEventListener('click', event => {
      const openRoom = document.getElementById('designer-login-btn');
      if (openRoom) { event.preventDefault(); openRoom.click(); }
    });
  }
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
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem('house-of-briar-theme') || localStorage.getItem('theme') || 'dark'; } catch {}
  document.documentElement.dataset.hobTheme = savedTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark',savedTheme==='dark');
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
    document.documentElement.classList.toggle('dark',theme==='dark');
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
  // The legacy shop and Creative House use this menu, not the React shell.
  const signout = document.createElement('button');
  signout.id = 'hob-global-signout';
  signout.type = 'button';
  signout.className = 'hob-global-signout';
  signout.textContent = 'Sign out';
  signout.hidden = true;
  signout.setAttribute('aria-label', 'Sign out of House of Briar');
  links.appendChild(signout);
  const sessionEndpoints = ['/api/my/designer-profile', '/api/customer/session'];
  let sessionCheckBusy = false;
  async function refreshSignout() {
    if (sessionCheckBusy || document.visibilityState === 'hidden') return;
    sessionCheckBusy = true;
    try {
      const responses = await Promise.all(sessionEndpoints.map(url => fetch(url, {credentials:'same-origin',cache:'no-store'})));
      if (designerEntry) designerEntry.textContent = responses[0].ok ? 'Designer dashboard' : 'Designer sign in';
      if (responses.some(response => response.ok)) signout.hidden = false;
      else if (responses.every(response => [401,403,404].includes(response.status))) signout.hidden = true;
    } catch {} finally { sessionCheckBusy = false; }
  }
  signout.addEventListener('click', async () => {
    signout.disabled = true;
    signout.textContent = 'Signing out…';
    try {
      for (const url of ['/api/session', '/api/customer/session']) {
        const response = await fetch(url, {method:'DELETE',credentials:'same-origin',cache:'no-store'});
        if (!response.ok) throw new Error('Sign out did not complete. Please try again.');
      }
      const checks = await Promise.all(sessionEndpoints.map(url => fetch(url, {credentials:'same-origin',cache:'no-store'})));
      if (!checks.every(response => response.status === 401)) throw new Error('Sign out did not complete. Please try again.');
      for (const storage of [localStorage, sessionStorage]) {
        storage.removeItem('briarDesignerToken');
        storage.removeItem('house-of-briar:cart');
      }
      window.location.replace('/');
    } catch (error) {
      signout.disabled = false;
      signout.textContent = 'Sign out';
      window.alert(error.message || 'Sign out did not complete. Please try again.');
    }
  });
  void refreshSignout();
  setInterval(() => void refreshSignout(), 30000);
  window.addEventListener('focus', () => void refreshSignout());
  document.addEventListener('visibilitychange', () => void refreshSignout());
  if (account) new MutationObserver(() => void refreshSignout()).observe(account, {childList:true,subtree:true,characterData:true});

  // Persistent designer mailbox uses the existing private notification/read-state API.
  const mailboxWrap=document.createElement('div');mailboxWrap.className='hob-mailbox-wrap';mailboxWrap.hidden=true;
  const mailbox=document.createElement('button');mailbox.type='button';mailbox.className='hob-mailbox';
  mailbox.setAttribute('aria-label','Designer mailbox');mailbox.setAttribute('aria-expanded','false');mailbox.setAttribute('aria-controls','hob-mailbox-panel');
  mailbox.innerHTML='<svg class="hob-mailbox-icon" viewBox="0 0 64 56" width="38" height="34" aria-hidden="true"><path d="M12 43V23a17 17 0 0 1 34 0v20H12Z" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="2.5"/><path d="M12 43h42V25c0-10-7-19-17-19M20 43v10m21-10v10M47 22V8h10v9H47" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path class="hob-mailbox-heart" d="M29 24c-7-8-16 3 0 13 16-10 7-21 0-13Z" fill="currentColor"/></svg>';
  const count=document.createElement('span');count.className='hob-mailbox-count';count.hidden=true;mailbox.append(count);
  const panel=document.createElement('div');panel.id='hob-mailbox-panel';panel.className='hob-mailbox-panel';panel.hidden=true;
  mailboxWrap.append(mailbox,panel);actions.prepend(mailboxWrap);
  let mailboxBusy=false;
  async function refreshMailbox(){
    if(mailboxBusy||document.visibilityState==='hidden')return;
    mailboxBusy=true;
    try{
      const response=await fetch('/api/my/designer-notifications',{credentials:'same-origin',cache:'no-store'});
      if([401,403].includes(response.status)){mailboxWrap.hidden=true;panel.hidden=true;mailbox.setAttribute('aria-expanded','false');return;}
      if(!response.ok)return;
      const data=await response.json();if(!Array.isArray(data.items))return;
      const unread=Number(data.unread)||0;mailboxWrap.hidden=false;mailbox.classList.toggle('has-unread',unread>0);
      count.hidden=!unread;count.textContent=unread>99?'99+':String(unread);
      mailbox.setAttribute('aria-label',`Designer mailbox, ${unread} unread sales and updates`);
      panel.replaceChildren();
      const title=document.createElement('strong');title.textContent='Your House mailbox';panel.append(title);
      const status=document.createElement('p');status.textContent=unread?`${unread} unread sales, messages and updates`:'You’re all caught up.';panel.append(status);
      const sales=document.createElement('a');sales.href='/account#orders';sales.textContent='Sales & shipping →';panel.append(sales);
      const messages=document.createElement('a');messages.href='/account#messages';messages.textContent='Messages & full inbox →';panel.append(messages);
      for(const item of data.items.filter(item=>!item.readAt).slice(0,5)){
        const note=document.createElement('div');note.className='hob-mailbox-note';
        const heading=document.createElement('strong');heading.textContent=item.title;
        const body=document.createElement('p');body.textContent=item.body;
        const read=document.createElement('button');read.type='button';read.textContent='Mark read';
        read.addEventListener('click',async()=>{read.disabled=true;try{const r=await fetch(`/api/my/designer-notifications/${encodeURIComponent(item.id)}/read`,{method:'PATCH',credentials:'same-origin'});if(!r.ok)throw Error();await refreshMailbox();}catch{read.textContent='Try marking read again';}finally{read.disabled=false;}});
        note.append(heading,body);
        read.className='hob-mailbox-read';
        panel.append(note,read);
      }
    }catch{}finally{mailboxBusy=false;}
  }
  mailbox.addEventListener('click',()=>{panel.hidden=!panel.hidden;mailbox.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)void refreshMailbox();});
  document.addEventListener('click',event=>{if(!mailboxWrap.contains(event.target)){panel.hidden=true;mailbox.setAttribute('aria-expanded','false');}});
  mailboxWrap.addEventListener('keydown',event=>{if(event.key==='Escape'){panel.hidden=true;mailbox.setAttribute('aria-expanded','false');mailbox.focus();}});
  void refreshMailbox();setInterval(()=>void refreshMailbox(),30000);
  document.addEventListener('visibilitychange',()=>void refreshMailbox());
  const workspace=document.getElementById('designer-workspace');
  if(workspace)new MutationObserver(()=>{void refreshMailbox();void refreshSignout();}).observe(workspace,{attributes:true,attributeFilter:['class']});

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
