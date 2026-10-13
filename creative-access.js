(()=>{'use strict';const status=document.getElementById('creative-access-status');if(!status)return;
async function check(path){try{return await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'}});}catch{return null;}}
(async()=>{const [customer,designer]=await Promise.all([check('/api/creative-house/my-profile'),check('/api/creative-house/profiles')]);
if(designer?.ok){status.textContent='Active designer access confirmed. You can publish opportunities, events, and send private inquiries. Creative profile editing also requires a House account session.';return;}
if(customer?.ok){status.textContent='House account signed in. You can save your own creative profile and review incoming inquiries. Designer-only actions require an active linked designer account; an email address alone does not grant access.';return;}
if(!customer&&!designer){status.textContent='Could not check access. Please try again when connected.';return;}
status.textContent='Not signed in. You can browse public opportunities and events. Sign in with your House account to manage a creative profile; active designer access is required for designer-only actions.';
})();})();

(()=>{'use strict';
 const root=document.getElementById('creative-readiness');if(!root)return;
 const status=document.getElementById('creative-readiness-status');let role='model',roleSelected=false,saved={},signedIn=false,photos=0;
 const buttons=[...document.querySelectorAll('[data-join-role]')];
 const forms={talent:document.getElementById('profile-form'),event:document.getElementById('event-profile-form')};
 for(const form of Object.values(forms)){if(!form)continue;const label=document.createElement('p');label.className='creative-visibility';label.setAttribute('role','status');form.elements.published.closest('label').after(label);const update=()=>{label.textContent=(form.elements.published.checked?'Visible to active designers':'Private')+' · Save profile to apply changes';};form.elements.published.addEventListener('change',update);update();}
 function render(){const event=['dj','venue'].includes(role),candidate=saved[event?'event':'talent'],profile=candidate?.role===role?candidate:null;
  const done={account:signedIn,profile:!!profile,work:event?!!profile?.description:photos>0,visibility:!!profile};
  for(const [key,value]of Object.entries(done))root.querySelector('[data-ready="'+key+'"]').dataset.complete=String(value);
  root.querySelector('[data-ready="work"]').firstChild.textContent=event?'Add your service details':'Add portfolio photos';
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.joinRole===role)));
  status.textContent=!signedIn?'First, join or sign in to your House account.':!profile?'Next, complete and save your '+role+' profile.':!done.work?'Next, add portfolio photos below.':profile.published?'Your profile is visible to active designers.':'Your profile is private. Publish whenever you’re ready.';
  for(const [kind,form]of Object.entries(forms)){if(!form)continue;const p=saved[kind];if(p)form.querySelector('.creative-visibility').textContent=p.published?'Saved visibility: visible to active designers':'Saved visibility: private';}
 }
 async function refresh(){try{const read=async path=>{const r=await fetch(path,{credentials:'same-origin'});return r.ok?await r.json():null;};const [talent,event,portfolio]=await Promise.all([read('/api/creative-house/my-profile'),read('/api/creative-house/my-event-profile'),read('/api/creative-house/my-portfolio')]);signedIn=!!talent;saved={talent:talent?.profile,event:event?.profile};photos=portfolio?.images?.length||0;if(!roleSelected)role=saved.talent?.role||saved.event?.role||role;render();}catch{status.textContent='Could not check setup. Please refresh when connected.';}}
 buttons.forEach(button=>button.addEventListener('click',()=>{roleSelected=true;role=button.dataset.joinRole;const event=['dj','venue'].includes(role);document.querySelector('[data-creative-workflow="profile"]')?.click();const form=forms[event?'event':'talent'];if(form){form.elements.role.value=role;form.scrollIntoView({behavior:'auto',block:'center'});form.elements.display_name.focus();}render();}));
 for(const id of ['profile-status','event-profile-form-status','portfolio-status']){const target=document.getElementById(id);if(target)new MutationObserver(()=>{if(/saved|uploaded|Portfolio ·/i.test(target.textContent))refresh();}).observe(target,{childList:true,subtree:true,characterData:true});}
 refresh();
})();
