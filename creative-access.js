(()=>{'use strict';const status=document.getElementById('creative-access-status');if(!status)return;
async function check(path){try{return await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'}});}catch{return null;}}
(async()=>{const [customer,designer]=await Promise.all([check('/api/creative-house/my-profile'),check('/api/creative-house/profiles')]);
if(designer?.ok){status.textContent='Active designer access confirmed. You can publish opportunities, events, and send private inquiries. Creative profile editing also requires a House account session.';return;}
if(customer?.ok){status.textContent='House account signed in. You can save your own creative profile and review incoming inquiries. Designer-only actions require an active linked designer account; an email address alone does not grant access.';return;}
if(!customer&&!designer){status.textContent='Could not check access. Please try again when connected.';return;}
status.textContent='Not signed in. You can browse public opportunities and events. Sign in with your House account to manage a creative profile; active designer access is required for designer-only actions.';
})();})();
