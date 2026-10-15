(() => {
  const map = {profile:['profile-form','event-profile-form'],event:['event-form'],casting:['post-form'],request:['project-request-form'],inquiry:['creative-inquiry-form']};
  const forms = [...new Set(Object.values(map).flat())].map(id => document.getElementById(id)).filter(Boolean);
  const sections = forms.map(form => form.closest('section')).filter(section => section && section.id !== 'private-inquiries');
  const profileIntro = document.getElementById('profile-start');
  const buttons = [...document.querySelectorAll('[data-creative-workflow]')];
  const status = document.getElementById('creative-workflow-help');
  const reveal = (kind, shouldScroll = false) => {
    forms.forEach(form => { form.hidden = !(map[kind] || []).includes(form.id); });
    sections.forEach(section => { section.hidden = !forms.some(form => section.contains(form) && !form.hidden); });
    if (profileIntro) profileIntro.hidden = kind !== 'profile';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.creativeWorkflow === kind)));
    if (status) status.textContent = kind === 'browse' ? 'Browse opportunities and events below, or choose an activity to open its form.' : 'Showing the relevant form' + (kind === 'profile' ? 's' : '') + '. Existing account and publication requirements still apply.';
    if (shouldScroll && kind !== 'browse') {
      const form = document.getElementById((map[kind] || [])[0]);
      form?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'});
    }
  };
  buttons.forEach(button => button.addEventListener('click', () => reveal(button.dataset.creativeWorkflow, true)));
  const bySection = {'#your-profile':'profile','#event-profile-editor':'profile','#post-event':'event','#post':'casting','#casting-commissioning':'request','#private-inquiries':'inquiry'};
  const syncHash = () => { reveal(bySection[location.hash] || 'browse'); };
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => { const kind = bySection[a.getAttribute('href')]; if (kind) reveal(kind); }));
  reveal('browse');
  syncHash();
  window.addEventListener('hashchange', syncHash);
})();