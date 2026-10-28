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
  const signupBanner=document.createElement('div');signupBanner.className='hob-signup-banner';signupBanner.setAttribute('role','region');signupBanner.setAttribute('aria-label','House signup announcement');
  const signupDate=document.createElement('time'),signupMessage=document.createElement('span');signupMessage.textContent='We’re in our signup era.';signupBanner.append(signupDate,signupMessage);nav.prepend(signupBanner);
  const updateSignupDate=()=>{const now=new Date();signupDate.dateTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(now);signupDate.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'}).format(now);};updateSignupDate();setInterval(updateSignupDate,60000);

  // Compact footer bar: copyright, verified social links, and checkout payment brands.
  let footer=document.querySelector('footer');if(!footer){footer=document.createElement('footer');document.body.append(footer);}
  footer.classList.add('house-footer-enhanced');
  let bottom=footer.querySelector('.footer-bottom');
  if(!bottom){bottom=document.createElement('div');bottom.className='footer-bottom';footer.append(bottom);}
  bottom.classList.add('house-footer-bar');
  const utilities=bottom.querySelector('.footer-utilities');if(utilities){utilities.classList.add('house-footer-support-links');bottom.before(utilities);}
  let copyright=bottom.querySelector('.copyright');
  if(!copyright){copyright=document.createElement('p');copyright.className='copyright';bottom.prepend(copyright);}
  copyright.textContent='© '+new Date().getFullYear()+' House of Briar. All Rights Reserved.';
  const socials=document.createElement('nav');socials.className='house-footer-socials';socials.setAttribute('aria-label','House of Briar social media');
  for(const item of [
    {name:'Facebook',url:'https://www.facebook.com/profile.php?id=61595729137315',symbol:'f'},
    {name:'YouTube',url:'https://www.youtube.com/@Houseofbriar.shop.designers',symbol:'▶'},
    {name:'Instagram',url:'https://www.instagram.com/house_of_briar_/',symbol:'◎'}
  ]){const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',item.name);link.title=item.name;const icons={Facebook:'<path d="M15 21v-8h3l.5-3H15V8.5c0-.8.3-1.5 1.5-1.5H19V4h-3c-3 0-5 1.8-5 5v1H8v3h3v8z" fill="currentColor"/>',YouTube:'<path d="M21 7a3 3 0 0 0-2-2c-2-.5-12-.5-14 0a3 3 0 0 0-2 2c-.5 2-.5 8 0 10a3 3 0 0 0 2 2c2 .5 12 .5 14 0a3 3 0 0 0 2-2c.5-2 .5-8 0-10ZM10 16V8l7 4z" fill="currentColor" fill-rule="evenodd"/>',Instagram:'<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>'};link.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">'+icons[item.name]+'</svg>';socials.append(link);}
  bottom.append(socials);
  const payments=document.createElement('div');payments.className='house-footer-payment-logos';payments.setAttribute('role','region');payments.setAttribute('aria-label','Accepted payments');
  for(const method of [{name:'Visa',file:'visa.svg'},{name:'Mastercard',file:'mastercard.svg'},{name:'American Express',file:'amex.svg'},{name:'Apple Pay',file:'applepay.svg'},{name:'Google Pay',file:'googlepay.svg'}]){
    const img=document.createElement('img');img.src='/payment-logos/'+method.file;img.alt=method.name;img.width=40;img.height=25;img.loading='lazy';payments.append(img);
  }
  bottom.append(payments);

  const wordmark=nav.querySelector('.hob-global-wordmark');
  if(wordmark)wordmark.innerHTML='<img src="/house-monogram-v2.webp" width="48" height="48" alt="" aria-hidden="true"> <span>HOUSE <i>of</i> BRIAR</span>';
  const search=document.createElement('form');
  search.className='hob-sticky-search';search.setAttribute('role','search');search.setAttribute('aria-label','Search the shop');search.action='/shop';search.method='get';
  search.innerHTML='<input type="search" name="q" aria-label="Search pieces, designers or materials" placeholder="Search pieces, designers…"><button type="submit">Search</button>';
  search.querySelector('input').value=new URLSearchParams(location.search).get('q')||'';
  search.id='hob-sticky-search';
  nav.append(search);
  const searchToggle=document.createElement('button');searchToggle.type='button';searchToggle.className='hob-search-toggle';searchToggle.textContent='⌕';searchToggle.setAttribute('aria-label','Open shop search');searchToggle.setAttribute('aria-controls',search.id);searchToggle.setAttribute('aria-expanded','false');
  const closeSearch=()=>{nav.classList.remove('hob-search-open');searchToggle.setAttribute('aria-expanded','false');};
  searchToggle.addEventListener('click',()=>{const open=nav.classList.toggle('hob-search-open');searchToggle.setAttribute('aria-expanded',String(open));if(open)search.querySelector('input').focus();});
  search.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSearch();searchToggle.focus();}});


  const links = nav.querySelector('nav');
  const makeMenu=(label,kind,entries,replace)=>{
    const menu=document.createElement('details');menu.className='hob-seamstress-menu hob-'+kind+'-menu';
    const summary=document.createElement('summary');summary.textContent=label;menu.append(summary);
    const panel=document.createElement('div');panel.className='hob-seamstress-menu-panel';
    for(const [href,text] of entries){const link=document.createElement('a');link.href=href;link.textContent=text;link.onclick=()=>{menu.open=false;};panel.append(link);}
    menu.append(panel);if(replace)replace.replaceWith(menu);else links.append(menu);
    menu.addEventListener('toggle',()=>{if(menu.open)for(const other of links.querySelectorAll('details'))if(other!==menu)other.open=false;});
    document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;summary.focus();}});return menu;
  };
  links.querySelectorAll('a:not(.hob-global-cart-link)').forEach(link=>link.remove());
  const shopMenu=makeMenu('Shop the Runway','shop',[
    ['/?visitors=signup','Create your room'],['/?visitors=signup#measurement-profile-name','Save your measurements'],['/design-projects.html#creator-room','Create an outfit'],
  ]);
  const moving=document.createElement('p');moving.textContent='We’re still moving in.';shopMenu.querySelector('.hob-seamstress-menu-panel').prepend(moving);
  const designerMenu=makeMenu('Go Backstage','backstage',[
    ['/creative-house.html','Enter Backstage'],
    ['/designers/room','Sign in as designer'],['/?visitors=signup&creative=model','Sign in as model'],['/?visitors=signup&creative=photographer','Sign in as photographer'],['/?visitors=signup&creative=dj','Sign in as DJ'],
  ]);
  const account=document.getElementById('header-customer-auth-btn');
  // Existing page scripts retain their trigger; one shared entry is visible.
  if(account){account.hidden=true;account.style.setProperty('display','none','important');}
  const join=document.createElement('a');join.href='/join.html';join.className='hob-global-account-link hob-global-join';join.textContent='Sign in / Join';shopMenu.querySelector('.hob-seamstress-menu-panel').append(join);
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
  for (const control of [searchToggle, themeButton, links.querySelector('.hob-global-cart-button,.hob-global-cart-link')]) {
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
  designerMenu.querySelector('.hob-seamstress-menu-panel').appendChild(signout);
  const sessionEndpoints = ['/api/my/designer-profile', '/api/customer/session'];
  let sessionCheckBusy = false;
  async function refreshSignout() {
    if (sessionCheckBusy || document.visibilityState === 'hidden') return;
    sessionCheckBusy = true;
    try {
      const responses = await Promise.all(sessionEndpoints.map(url => fetch(url, {credentials:'same-origin',cache:'no-store'})));
      if (responses.some(response => response.ok)){signout.hidden=false;join.textContent='My dashboard';}
      else if (responses.every(response => [401,403,404].includes(response.status))){signout.hidden=true;join.textContent='Sign in / Join';}
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
  const mailboxWrap=document.createElement('div');mailboxWrap.className='hob-mailbox-wrap';mailboxWrap.hidden=false;
  const mailbox=document.createElement('button');mailbox.type='button';mailbox.className='hob-mailbox';
  mailbox.setAttribute('aria-label','Designer mailbox');mailbox.setAttribute('aria-expanded','false');mailbox.setAttribute('aria-controls','hob-mailbox-panel');
  mailbox.innerHTML='<svg class="hob-mailbox-icon" viewBox="0 0 64 56" width="38" height="34" aria-hidden="true"><path d="M12 43V23a17 17 0 0 1 34 0v20H12Z" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="2.5"/><path d="M12 43h42V25c0-10-7-19-17-19M20 43v10m21-10v10M47 22V8h10v9H47" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path class="hob-mailbox-heart" d="M29 24c-7-8-16 3 0 13 16-10 7-21 0-13Z" fill="currentColor"/></svg>';
  const count=document.createElement('span');count.className='hob-mailbox-count';count.hidden=true;mailbox.append(count);
  const panel=document.createElement('div');panel.id='hob-mailbox-panel';panel.className='hob-mailbox-panel';panel.hidden=true;
  mailboxWrap.append(mailbox,panel);actions.append(mailboxWrap);
  const cartControl=actions.querySelector('.hob-global-cart-button,.hob-global-cart-link');
  nav.append(themeButton,searchToggle,links,mailboxWrap);if(cartControl)nav.append(cartControl);nav.classList.add('hob-ordered-menu');
  const guestInbox=()=>{panel.replaceChildren();const link=document.createElement('a');link.href='/join.html';link.textContent='Sign in to see your mailbox';panel.append(link);};guestInbox();
  let mailboxBusy=false;
  async function refreshMailbox(){
    if(mailboxBusy||document.visibilityState==='hidden')return;
    mailboxBusy=true;
    try{
      const response=await fetch('/api/my/designer-notifications',{credentials:'same-origin',cache:'no-store'});
      if([401,403].includes(response.status)){guestInbox();return;}
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
