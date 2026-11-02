(()=>{'use strict';
 const view=document.getElementById('collaboration-view'),filter=document.getElementById('collaboration-filter'),list=document.getElementById('collaboration-dashboard-list'),status=document.getElementById('collaboration-dashboard-status');
 if(!view||!filter||!list||!status)return;
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 let inquiries=[],available={received:false,sent:false},loading=0;
 function render(){
  list.replaceChildren();
  if(!available[view.value]){status.textContent=view.value==='sent'?'Sign in as an active designer to see sent inquiries.':'Sign in with your House account to see received inquiries.';return;}
  const visible=inquiries.filter(q=>!filter.value||q.status===filter.value);
  for(const q of visible){
   const card=el('article','');card.className='opportunity';
   card.append(el('h3',q.subject||'Collaboration inquiry'));
   card.append(el('p','Status: '+(q.status||'pending')));
   card.append(el('p',view.value==='sent'?'To: '+(q.recipient_slug||'Creative profile'):'From: '+(q.sender_name||'House designer')));
   card.append(el('p','Profile type: '+(q.recipient_kind||'creative')));
   card.append(el('p','Sent: '+(q.created_at||'Date unavailable')));
   card.append(el('p',q.message||''));
   if(q.collaboration_json){try{const b=JSON.parse(q.collaboration_json);if(b.projectType)card.append(el('p','Project: '+b.projectType.replaceAll('-',' ')));if(b.compensation)card.append(el('p','Compensation: '+b.compensation));if(b.projectLocation)card.append(el('p','Location: '+b.projectLocation));}catch{}}
   if(view.value==='received'&&q.status==='pending'){
    for(const decision of ['accepted','declined']){
     const button=el('button',decision==='accepted'?'Accept inquiry':'Decline inquiry');button.type='button';
     button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
       const r=await fetch('/api/creative-house/my-inquiries/'+encodeURIComponent(q.id)+'/respond',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:decision})});
       if(!r.ok)throw Error('Unable to update inquiry.');
       await load();
       document.dispatchEvent(new Event('backstage-collaboration-updated'));
      }catch(e){status.textContent=e.message;button.disabled=false;}
     });card.append(button);
    }
   }
   list.append(card);
  }
  status.textContent=visible.length?visible.length+' '+(view.value==='sent'?'sent':'received')+' inquiry'+(visible.length===1?'':'ies')+' shown.':'No inquiries match this view and status.';
 }
 async function load(){
  const request=++loading;status.textContent='Loading collaborations…';
  const urls={received:'/api/creative-house/my-inquiries',sent:'/api/creative-house/sent-inquiries'};
  const results=await Promise.all(Object.entries(urls).map(async([key,url])=>{try{const r=await fetch(url,{credentials:'same-origin'});if(!r.ok)return [key,false,[]];const data=await r.json();return [key,true,Array.isArray(data.inquiries)?data.inquiries:[]];}catch{return [key,false,[]];}}));
  if(request!==loading)return;
  const data=Object.fromEntries(results.map(([key,ok,items])=>[key,items]));
  available=Object.fromEntries(results.map(([key,ok])=>[key,ok]));
  if(!available[view.value]&&available[view.value==='sent'?'received':'sent'])view.value=view.value==='sent'?'received':'sent';
  inquiries=data[view.value];render();
  view.onchange=()=>{inquiries=data[view.value];render();};
 }
 filter.addEventListener('change',render);
 document.getElementById('collaboration-dashboard-refresh')?.addEventListener('click',load);
 document.addEventListener('backstage-collaboration-updated',load);
 const hash=new URLSearchParams(location.hash.split('?')[1]||'');
 if(hash.get('view')==='sent')view.value='sent';
 load();
})();