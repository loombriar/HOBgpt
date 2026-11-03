(()=>{'use strict';
 const view=document.getElementById('booking-view'),select=document.getElementById('booking-inquiry'),status=document.getElementById('booking-status'),details=document.getElementById('booking-details'),actions=document.getElementById('booking-actions'),form=document.getElementById('booking-proposal'),unread=document.getElementById('booking-unread');
 if(!view||!select||!form)return;
 const el=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 const api=()=>'/api/creative-house/'+view.value+'-bookings';
 const source=()=>'/api/creative-house/'+(view.value==='creative'?'my-inquiries':'sent-inquiries');
 let booking=null;
 async function threads(){
  select.replaceChildren(new Option('Select an accepted collaboration',''));
  try{const r=await fetch(source(),{credentials:'same-origin'});if(!r.ok)throw Error('Sign in to access your bookings.');const data=await r.json();for(const q of data.inquiries||[])if(q.status==='accepted')select.add(new Option(q.subject||'Collaboration',q.id));if(select.options.length===2)select.selectedIndex=1;await refresh();}
  catch(e){status.textContent=e.message;details.replaceChildren();actions.replaceChildren();}
 }
 async function refresh(){
  booking=null;details.replaceChildren();actions.replaceChildren();
  try{const n=await fetch(api()+'/notifications',{credentials:'same-origin'});if(n.ok){const d=await n.json();unread.textContent=d.unread?'('+d.unread+' updates)':'';for(const item of d.notifications||[])if(!item.read_at)await fetch(api()+'/notifications/'+encodeURIComponent(item.id)+'/read',{method:'POST',credentials:'same-origin'});}}
  catch{}
  if(!select.value){status.textContent='Select an accepted collaboration to manage a booking.';form.hidden=true;return;}
  try{const r=await fetch(api()+'/'+encodeURIComponent(select.value),{credentials:'same-origin'});if(!r.ok)throw Error('Booking unavailable.');booking=(await r.json()).booking;form.hidden=!!booking&&!['proposed','declined','canceled'].includes(booking.status);if(booking){for(const [key,label] of [['status','Status'],['starts_at','Start'],['ends_at','End'],['timezone','Time zone'],['location','Location'],['compensation','Compensation'],['details','Details']])details.append(el('p',label+': '+(booking[key]||'—')));if(booking.status==='proposed'&&booking.proposed_by!==view.value)for(const [decision,label] of [['confirm','Confirm booking'],['decline','Decline proposal']])action(decision,label);if(['proposed','confirmed'].includes(booking.status))action('cancel','Cancel booking');if(booking.status==='confirmed')action('complete','Mark completed');}status.textContent=booking?'Booking '+booking.status+'.':'No booking proposed yet.';}
  catch(e){status.textContent=e.message;form.hidden=true;}
 }
 function action(decision,label){const b=el('button',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{const r=await fetch(api()+'/'+encodeURIComponent(select.value)+'/decision',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision})});if(!r.ok)throw Error((await r.json()).error||'Unable to update booking.');await refresh();}catch(e){status.textContent=e.message;b.disabled=false;}});actions.append(b);}
 form.addEventListener('submit',async e=>{e.preventDefault();if(!select.value)return;const data=Object.fromEntries(new FormData(form));const start=new Date(data.starts_at),end=new Date(data.ends_at);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))return;data.starts_at=start.toISOString();data.ends_at=end.toISOString();const button=form.querySelector('button');button.disabled=true;try{const r=await fetch(api()+'/'+encodeURIComponent(select.value)+'/propose',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error((await r.json()).error||'Unable to propose booking.');await refresh();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}});
 view.addEventListener('change',threads);select.addEventListener('change',refresh);document.getElementById('booking-refresh')?.addEventListener('click',threads);document.addEventListener('backstage-collaboration-updated',threads);threads();
})();