(()=>{'use strict';
 const list=document.getElementById('notification-list'),status=document.getElementById('notification-status'),count=document.getElementById('notification-count');
 if(!list)return;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 async function load(){
  list.replaceChildren();let total=0,authorized=false;
  for(const endpoint of ['notifications','designer-notifications']){
   try{
    const response=await fetch('/api/creative-house/'+endpoint,{credentials:'same-origin'});
    if(!response.ok)continue;
    authorized=true;
    const data=await response.json();total+=data.unread||0;
    for(const item of data.notifications||[]){
     const card=node('article','');card.className='opportunity';
     card.append(node('h3',item.kind==='new_inquiry'?'New collaboration inquiry':'Collaboration inquiry updated'));
     card.append(node('p',item.kind==='new_inquiry'?'A designer sent you a private inquiry.':'A creative responded to your inquiry.'));
     card.append(node('p',item.created_at||''));
     const link=node('a','Review inquiries');link.href='#collaboration-dashboard';card.append(link);
     if(!item.read_at){
      const button=node('button','Mark as read');button.type='button';
      button.addEventListener('click',async()=>{
       button.disabled=true;
       try{const r=await fetch('/api/creative-house/'+endpoint+'/'+encodeURIComponent(item.id)+'/read',{method:'POST',credentials:'same-origin'});if(!r.ok)throw Error();await load();}
       catch{button.disabled=false;status.textContent='Unable to update notification.';}
      });card.append(button);
     }
     list.append(card);
    }
   }catch{status.textContent='Could not load notifications.';}
  }
  count.textContent=total?'('+total+' unread)':'';
  if(authorized)status.textContent=list.children.length?'Your private collaboration updates.':'No notifications yet.';
  else status.textContent='Sign in to view your collaboration notifications.';
 }
 document.addEventListener('backstage-collaboration-updated',load);
 document.getElementById('notification-refresh')?.addEventListener('click',load);
 load();
})();