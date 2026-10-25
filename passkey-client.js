/* Shared passkey controls for the storefront and account dashboard. */
(() => {
 const supported=()=>Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials&&window.SimpleWebAuthnBrowser);
 const api=async(path,body,method='POST')=>{
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||'Passkeys could not be updated. Please try again.');return data;
 };
 const base=kind=>'/api/passkeys/'+kind;
 const message=e=>['NotAllowedError','AbortError'].includes(e.name)?'Passkey request cancelled or timed out. You can try again or use your email code.':e.message||'Passkeys are not available here. Please use your email code.';
 async function signin(kind){
  const {options}=await api(base(kind)+'/signin/options',{});
  const response=await window.SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options});
  await api(base(kind)+'/signin/verify',{response});
  const sewing=new URLSearchParams(window.location.search).get('seamstress');
  window.location.assign(kind==='customer'&&['signin','signup'].includes(sewing)?'/sewing-services.html'+(sewing==='signin'?'#service-inbox':'#offer-services'):'/account');
 }
 function element(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
 function mountManage(host,kind){
  host.replaceChildren();const details=element('details',null,'visitor-panel');details.id='passkeys-'+kind;
  details.append(element('summary','Passkeys: fingerprint, face or PIN'));
  const content=element('div',null,'visitor-panel-content');content.style.padding='1rem';
  content.append(element('p','Choose a passkey for faster sign-in on a compatible device. Your fingerprint or face stays on your device. Email sign-in is always available.'));
  const status=element('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=element('ul');list.style.paddingLeft='1.2rem';
  const label=element('label','Passkey name '),input=element('input');input.maxLength=80;input.value='My passkey';input.autocomplete='off';input.style.maxWidth='100%';label.append(input);
  const add=element('button','Add a passkey','secondary-button');add.type='button';add.style.minHeight='44px';add.style.margin='0.75rem 0';
  content.append(label,add,status,list);details.append(content);host.append(details);
  let active=true,busy=false;
  async function refresh(){
   try{const data=await api(base(kind),undefined,'GET');if(!active)return;list.replaceChildren();
    if(!data.items.length)list.append(element('li','No passkeys added yet.'));
    for(const item of data.items){const li=element('li',item.name+' '),remove=element('button','Remove','text-button');remove.type='button';remove.style.minHeight='44px';remove.setAttribute('aria-label','Remove passkey '+item.name);
     remove.onclick=async()=>{if(busy||!window.confirm('Remove this passkey? You can still sign in by email.'))return;busy=true;remove.disabled=true;try{await api(base(kind)+'/'+encodeURIComponent(item.id),undefined,'DELETE');status.textContent='Passkey removed. If this was your current sign-in method, sign in again by email.';await refresh();}catch(e){status.textContent=message(e);}finally{busy=false;remove.disabled=false;}};
     li.append(remove);list.append(li);
    }
   }catch(e){if(active)status.textContent=message(e);}
  }
  add.onclick=async()=>{if(busy)return;busy=true;add.disabled=true;status.textContent='Follow your device’s instructions to add a passkey.';
   try{const {options}=await api(base(kind)+'/register/options',{});const response=await window.SimpleWebAuthnBrowser.startRegistration({optionsJSON:options});await api(base(kind)+'/register/verify',{response,name:input.value});status.textContent='Passkey added. Next time, choose “Sign in with a passkey.”';await refresh();}catch(e){status.textContent=message(e);}finally{busy=false;add.disabled=false;}
  };
  if(!supported()){add.disabled=true;label.hidden=true;status.textContent='Passkeys are not available in this browser. You can still sign in by email.';}
  details.addEventListener('toggle',()=>{if(details.open)void refresh();});
  return ()=>{active=false;host.replaceChildren();};
 }
 window.HousePasskeys={supported,signin,mountManage};
 for(const button of document.querySelectorAll('[data-passkey-signin]')){
  button.hidden=!supported();button.onclick=async()=>{button.disabled=true;const status=document.getElementById(button.dataset.passkeyStatus);if(status)status.textContent='Follow your device’s instructions to sign in.';try{await signin(button.dataset.passkeySignin);}catch(e){if(status)status.textContent=message(e);}finally{button.disabled=false;}};
 }
 for(const host of document.querySelectorAll('[data-passkey-manage]'))mountManage(host,host.dataset.passkeyManage);
})();
