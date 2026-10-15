'use strict';
const status=document.getElementById('status');
const setupMode=new URLSearchParams(window.location.search).get('setup')==='1';
if(setupMode){const setup=document.querySelector('details');setup.open=true;document.getElementById('reviewer-signin').before(setup);document.getElementById('reviewer-signin').hidden=true;}
async function submitReviewer(event,route){
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
 const output=route==='enroll'?document.getElementById('setup-status'):status;
 const show=message=>{output.textContent=message;output.scrollIntoView({block:'nearest'});};
 const body=Object.fromEntries(new FormData(form));
 if(route==='enroll'&&body.password!==document.getElementById('confirm-password').value){show('The two passwords do not match. Enter the same app-only password in both boxes.');return;}
 button.disabled=true;show(route==='enroll'?'Saving reviewer password…':'Signing in…');
 try{
  const response=await fetch('/api/reviewer/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){
   if(route==='enroll'&&data.error?.code==='verification_required'){document.getElementById('setup-reverify').hidden=false;throw new Error('A fresh email sign-in is needed. Request a new code using the link below, verify it in this same browser, then return here within 15 minutes to save this password. Use the designated reviewer email.');}
   throw new Error(data.error?.message||data.message||'Could not complete reviewer sign-in.');
  }
  form.querySelectorAll('input[type=password]').forEach(input=>{input.value='';});
  if(route==='signin')window.location.assign(data.redirect==='/'?'/':'/designers/room');
  else {document.getElementById('setup-reverify').hidden=true;document.getElementById('reviewer-signin').hidden=false;document.getElementById('role').value=data.role;show('Reviewer password saved for '+data.role+'. You can now use it in the sign-in form above.');}
 }catch(error){show(error.message);}finally{button.disabled=false;}
}
document.getElementById('reviewer-signin').addEventListener('submit',event=>void submitReviewer(event,'signin'));
document.getElementById('reviewer-enroll').addEventListener('submit',event=>void submitReviewer(event,'enroll'));
void fetch('/api/reviewer/status',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(!data.enabled){status.textContent='Reviewer access has not been enabled by the account owner yet.';document.querySelectorAll('button').forEach(button=>{button.disabled=true;});}}).catch(()=>{status.textContent='Reviewer access could not be checked. Reload this page.';document.querySelectorAll('button').forEach(button=>{button.disabled=true;});});

// Browser validation can prevent the submit event entirely. Show the reason by the save button.
document.getElementById('reviewer-enroll').addEventListener('invalid',event=>{
 event.preventDefault();
 const message=event.target.validity.valueMissing?'Fill in both password boxes.':event.target.validity.tooShort?'Use at least 16 characters in each password box.':'Check the password fields and try again.';
 const output=document.getElementById('setup-status');output.textContent=message;output.scrollIntoView({block:'nearest'});
},true);

