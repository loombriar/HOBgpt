'use strict';
const status=document.getElementById('status');
async function submitReviewer(event,route){
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
 const body=Object.fromEntries(new FormData(form));
 if(route==='enroll'&&body.password!==document.getElementById('confirm-password').value){status.textContent='The passwords do not match.';return;}
 button.disabled=true;status.textContent=route==='enroll'?'Saving reviewer password…':'Signing in…';
 try{
  const response=await fetch('/api/reviewer/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message||data.message||'Could not complete reviewer sign-in.');
  form.querySelectorAll('input[type=password]').forEach(input=>{input.value='';});
  if(route==='signin')window.location.assign(data.redirect==='/'?'/':'/designers/room');
  else status.textContent='Reviewer password saved for '+data.role+'. Test it in a separate browser session before adding it to Play Console.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
}
document.getElementById('reviewer-signin').addEventListener('submit',event=>void submitReviewer(event,'signin'));
document.getElementById('reviewer-enroll').addEventListener('submit',event=>void submitReviewer(event,'enroll'));
void fetch('/api/reviewer/status',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(!data.enabled){status.textContent='Reviewer access has not been enabled by the account owner yet.';document.querySelectorAll('button').forEach(button=>{button.disabled=true;});}}).catch(()=>{status.textContent='Reviewer access could not be checked. Reload this page.';document.querySelectorAll('button').forEach(button=>{button.disabled=true;});});
