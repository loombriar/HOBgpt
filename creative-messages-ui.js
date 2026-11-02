(()=>{'use strict';
 const view=document.getElementById('backstage-message-view'),thread=document.getElementById('backstage-message-thread'),list=document.getElementById('backstage-message-list'),status=document.getElementById('backstage-message-status'),form=document.getElementById('backstage-message-form'),count=document.getElementById('backstage-message-count');
 if(!view||!thread||!list||!form)return;
 const el=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 const api=()=>'/api/creative-house/'+view.value+'-messages';
 let inquiries={creative:[],designer:[]},available={creative:false,designer:false};
 async function refreshThreads(){
  const endpoints={creative:'/api/creative-house/my-inquiries',designer:'/api/creative-house/sent-inquiries'};
  await Promise.all(Object.keys(endpoints).map(async key=>{try{const r=await fetch(endpoints[key],{credentials:'same-origin'});available[key]=r.ok;inquiries[key]=r.ok?(await r.json()).inquiries||[]:[];}catch{available[key]=false;inquiries[key]=[];}}));
  if(!available[view.value]&&available[view.value==='creative'?'designer':'creative'])view.value=view.value==='creative'?'designer':'creative';
  const previous=thread.value;thread.replaceChildren(new Option('Select an accepted inquiry',''));
  for(const q of inquiries[view.value].filter(q=>q.status==='accepted'))thread.add(new Option(q.subject||'Collaboration',q.id));
  if([...thread.options].some(x=>x.value===previous))thread.value=previous;
  else if(thread.options.length===2)thread.selectedIndex=1;
  await refresh();
 }
 async function refresh(){
  list.replaceChildren();
  if(!available[view.value]){status.textContent='Sign in to view your conversations.';return;}
  try{const unread=await fetch(api()+'/unread',{credentials:'same-origin'});if(unread.ok){const data=await unread.json();count.textContent=data.unread?'('+data.unread+' unread)':'';}}catch{}
  if(!thread.value){status.textContent='Select an accepted collaboration to view messages.';return;}
  try{
   const r=await fetch(api()+'/'+encodeURIComponent(thread.value),{credentials:'same-origin'});if(!r.ok)throw Error('Conversation unavailable.');
   const data=await r.json();
   for(const m of data.messages||[]){
    const card=el('article','');card.className='opportunity';
    card.append(el('p',(m.sender_role===view.value?'You':'Collaborator')+' · '+m.created_at),el('p',m.body));
    if(m.sender_role!==view.value){
     const report=el('button','Report message');report.type='button';
     report.addEventListener('click',async()=>{const reason=window.prompt('Reason for report (5–500 characters)');if(reason===null)return;const r=await fetch(api()+'/'+encodeURIComponent(thread.value)+'/report',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:m.id,reason})});status.textContent=r.ok?'Report submitted.':'Unable to submit report.';});card.append(report);
    }list.append(card);
   }
   if(view.value==='creative'){
    const block=el('button','Block this designer');block.type='button';
    block.addEventListener('click',async()=>{
     if(!window.confirm('Block this designer? This will prevent further messages and inquiries.'))return;
     const r=await fetch('/api/creative-house/my-inquiries/'+encodeURIComponent(thread.value)+'/block',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
     if(r.ok){await refreshThreads();status.textContent='Designer blocked. Conversation unavailable.';}else status.textContent='Unable to block designer.';
    });list.append(block);
   }
   await fetch(api()+'/'+encodeURIComponent(thread.value)+'/read',{method:'POST',credentials:'same-origin'});
   status.textContent=(data.messages||[]).length+' messages in this private conversation.';
  }catch(e){status.textContent=e.message;}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!thread.value)return;
  const body=form.elements.body.value.trim();if(!body)return;
  const button=form.querySelector('button');button.disabled=true;
  try{const r=await fetch(api()+'/'+encodeURIComponent(thread.value),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})});if(!r.ok){const d=await r.json();throw Error(d.error||'Unable to send message.');}form.reset();await refresh();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}
 });
 view.addEventListener('change',refreshThreads);thread.addEventListener('change',refresh);
 document.getElementById('backstage-message-refresh')?.addEventListener('click',refreshThreads);
 document.addEventListener('backstage-collaboration-updated',refreshThreads);
 refreshThreads();
})();