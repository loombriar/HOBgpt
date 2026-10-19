(() => {
  const map = {profile:['profile-form','event-profile-form'],event:['event-form'],casting:['post-form'],request:['project-request-form'],inquiry:['creative-inquiry-form']};
  const forms = [...new Set(Object.values(map).flat())].map(id => document.getElementById(id)).filter(Boolean);
  const sections = forms.map(form => form.closest('section')).filter(section => section && section.id !== 'private-inquiries');
  const profileIntro = document.getElementById('profile-start');
  const buttons = [...document.querySelectorAll('[data-creative-workflow]')];
  const status = document.getElementById('creative-workflow-help');
  let profileFormId = 'profile-form';
  const reveal = (kind, shouldScroll = false) => {
    map.profile = [profileFormId];
    forms.forEach(form => { form.hidden = !(map[kind] || []).includes(form.id); });
    sections.forEach(section => { section.hidden = !forms.some(form => section.contains(form) && !form.hidden); });
    if (profileIntro) profileIntro.hidden = kind !== 'profile';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.creativeWorkflow === kind)));
    if (status) status.textContent = kind === 'browse' ? 'Browse opportunities and events below, or choose an activity to open its form.' : 'Showing the relevant form. Existing account and publication requirements still apply.';
    if (shouldScroll && kind !== 'browse') {
      const form = document.getElementById((map[kind] || [])[0]);
      form?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'});
    }
  };
  buttons.forEach(button => button.addEventListener('click', () => { reveal(button.dataset.creativeWorkflow, true); document.dispatchEvent?.(new CustomEvent('creative-workflow-selected', { detail: { kind: button.dataset.creativeWorkflow } })); }));
  const bySection = {'#your-profile':'profile','#event-profile-editor':'profile','#post-event':'event','#post':'casting','#casting-commissioning':'request','#private-inquiries':'inquiry'};
  const syncHash = () => {
    if (location.hash === '#event-profile-editor') profileFormId = 'event-profile-form';
    if (location.hash === '#your-profile') profileFormId = 'profile-form';
    reveal(bySection[location.hash] || 'browse');
  };
  window.addEventListener('creative-profile-role', event => {
    profileFormId = ['dj','venue'].includes(event.detail.role) ? 'event-profile-form' : 'profile-form';
    reveal('profile');
  });
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => { const kind = bySection[a.getAttribute('href')]; if (kind) { profileFormId = a.getAttribute('href') === '#event-profile-editor' ? 'event-profile-form' : 'profile-form'; reveal(kind); } }));
  reveal('browse');
  syncHash();
  window.addEventListener('hashchange', syncHash);
})();
// Keep one purpose visible at a time without changing form or access rules.
(() => {
  const groups = {
    talent: ['event-creatives','creative-directory'],
    join: ['join-house','profile-start','event-profile-editor','your-profile','portfolio-controls','portfolio-preview','project-start','post-event','post','casting-commissioning','private-inquiries'],
    opportunities: ['fashion-events','opportunities','collaboration-requests','designer-commissions']
  };
  const menus = {'creative-talent-menu':'talent','creative-profile-menu':'join','creative-project-menu':'opportunities'};
  const sections = Object.values(groups).flat().map(id=>document.getElementById(id)).filter(Boolean);
  function show(view) {
    sections.forEach(section=>section.toggleAttribute('data-creative-view-hidden', !(groups[view]||[]).includes(section.id)));
  }
  function fromHash() {
    const id=location.hash.slice(1);
    const view=menus[id]||Object.keys(groups).find(key=>groups[key].includes(id));
    if(view) show(view);
    if(['portfolios','casting-coming-soon','creative-subscriptions'].includes(id)) document.getElementById('creative-subscriptions').open=true;
  }
  Object.entries(menus).forEach(([id,view])=>document.getElementById(id)?.addEventListener('toggle',event=>{if(event.target.open)show(view);}));
  document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
    const id=link.getAttribute('href').slice(1);
    const view=menus[id]||Object.keys(groups).find(key=>groups[key].includes(id));
    if(view)show(view);
    const kind=link.dataset.projectKind;
    if(kind) {const select=document.querySelector('#project-request-form select[name=kind]');if(select)select.value=kind;}
  }));
  document.addEventListener('creative-workflow-selected', event => show(event.detail?.kind === 'browse' ? 'opportunities' : 'join'));
  show('welcome');
  fromHash();
  window.addEventListener('hashchange',fromHash);
})();
// Category links choose the matching directory branch before following its anchor.
(() => {
  const menus = [...document.querySelectorAll('.creative-category-menu')];
  const openLinkedMenu = () => {
    const menu = menus.find(item => '#' + item.id === location.hash);
    if (menu) menu.open = true;
  };
  document.querySelectorAll('.briar-creative-actions a').forEach(link => link.addEventListener('click', () => {
    const menu = menus.find(item => '#' + item.id === link.getAttribute('href'));
    if (menu) menu.open = true;
  }));
  openLinkedMenu();
  menus.forEach(menu => menu.addEventListener('toggle', () => {
    if (menu.open) menus.forEach(other => { if (other !== menu) other.open = false; });
  }));
  document.querySelectorAll('[data-talent-role]').forEach(link => link.addEventListener('click', () => {
    const role = link.dataset.talentRole;
    const prefix = ['dj','venue'].includes(role) ? 'event-directory' : 'directory';
    const select = document.getElementById(prefix + '-role');
    if (select) { select.value = role; select.dispatchEvent(new Event('change')); }
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const menu = menus.find(item => item.open);
      if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
    }
  });
})();
