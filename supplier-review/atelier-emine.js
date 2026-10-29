'use strict';
(()=>{
 const API='/api/supplier-review/atelier-emine';
 const $=id=>document.getElementById(id);
 const initialToken=new URLSearchParams(location.hash.slice(1)).get('token');
 // A fragment is never sent to the server or in a referrer; remove it from the visible history immediately.
 if(location.hash)history.replaceState(null,'',location.pathname);
 let collection=null;
 const unsavedNotes=new Map();
 const text=(element,value)=>{element.textContent=value;return element};
 const statusLabel=review=>review.status==='confirmed'?'Confirmed by '+review.reviewer_name:review.status==='changes_requested'?'Changes requested':review.status==='needs_rereview'?'Updated — please review again':'Awaiting your review';
 async function api(path,options={}){
   const response=await fetch(API+path,{credentials:'same-origin',cache:'no-store',...options});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data?.error?.message||'The review could not be saved. Please try again.');
   return data;
 }
 function render(){
   const query=$('search').value.trim().toLowerCase(),filter=$('filter').value;
   const confirmed=collection.items.filter(x=>x.review.status==='confirmed').length;
   const changes=collection.items.filter(x=>x.review.status==='changes_requested').length;
   const items=collection.items.filter(item=>(item.title+' '+item.source.sku+' '+item.description).toLowerCase().includes(query)&&(filter==='all'||filter==='pending'&&['pending_seller_review','needs_rereview'].includes(item.review.status)||item.review.status===filter));
   text($('progress'),confirmed+' confirmed · '+changes+' with changes requested · '+(collection.items.length-confirmed-changes)+' awaiting review · '+items.length+' shown');
   $('items').replaceChildren();$('empty').hidden=items.length>0;
   for(const item of items){
     const card=$('item-template').content.firstElementChild.cloneNode(true);
     card.dataset.listingId=item.id;
     text(card.querySelector('.sku'),item.source.sku);text(card.querySelector('.title'),item.title);
     const price=card.querySelector('.price');text(price,'$'+Number(item.price).toFixed(2)+' USD');price.append(text(document.createElement('small'),'Source £'+item.source.price_gbp+' GBP'));
     text(card.querySelector('.review-status'),statusLabel(item.review));
     const image=card.querySelector('.photo img');image.alt='Supplier photo: '+item.title;image.src=item.source.image_urls[0];
     image.addEventListener('error',()=>{image.hidden=true;const fallback=text(document.createElement('p'),'The supplier photo could not load here. Open its link below to check it.');fallback.className='photo-fallback';card.querySelector('.photo').append(fallback)},{once:true});
     const main=document.createElement('a');main.href=item.source.image_urls[0];main.target='_blank';main.rel='noopener noreferrer';text(main,'Open main supplier photo');card.querySelector('.photo').after(main);
     const list=card.querySelector('.photo-links');item.source.image_urls.forEach((url,index)=>{const li=document.createElement('li'),a=text(document.createElement('a'),'Open supplied photo '+(index+1));a.href=url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li)});
     card.querySelector('.warning').hidden=!item.source.photo_review_status.startsWith('blocked_');
     text(card.querySelector('.description'),item.description);text(card.querySelector('.care'),'Care: '+item.source.care);text(card.querySelector('.specs'),'Supplied colour: '+item.source.source_colour+' · Supplied weight: '+item.source.source_weight_grams+' g. Please confirm.');
     const notes=card.querySelector('textarea');notes.value=unsavedNotes.get(item.id)??item.review.notes??'';notes.addEventListener('input',()=>unsavedNotes.set(item.id,notes.value));
     const checkbox=card.querySelector('.details-confirmed');
     async function submit(decision){
       const message=card.querySelector('.item-message');text(message,'');
       const name=$('reviewer-name').value.trim(),email=$('reviewer-email').value.trim(),authorized=$('authorized').checked;
       if(!name||!email||!$('reviewer-email').checkValidity()||!authorized){text(message,'Enter your name and business email, and confirm you are authorized to review above.');$('reviewer-name').focus();return}
       if(decision==='confirmed'&&!checkbox.checked){text(message,'Please check the item confirmation box first.');checkbox.focus();return}
       if(decision==='changes_requested'&&!notes.value.trim()){text(message,'Please add a note explaining what should change.');notes.focus();return}
       const buttons=card.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
       try{
         const result=await api('/items/'+encodeURIComponent(item.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,version:item.version,name,email,authorized,detailsConfirmed:checkbox.checked,notes:notes.value})});
         item.review=result.review;unsavedNotes.delete(item.id);checkbox.checked=false;text(card.querySelector('.review-status'),statusLabel(item.review));text(message,'Response saved. The listing remains a private draft.');
         const confirmed=collection.items.filter(x=>x.review.status==='confirmed').length;const changed=collection.items.filter(x=>x.review.status==='changes_requested').length;text($('progress'),confirmed+' confirmed · '+changed+' with changes requested · '+(collection.items.length-confirmed-changed)+' awaiting review');
       }catch(error){text(message,error.message)}finally{buttons.forEach(b=>b.disabled=false)}
     }
     card.querySelector('.confirm').addEventListener('click',()=>void submit('confirmed'));
     card.querySelector('.request').addEventListener('click',()=>void submit('changes_requested'));
     $('items').append(card);
   }
 }
 async function load(){
   try{
     collection=await api('');unsavedNotes.clear();text($('bio'),collection.profile.bio);
     if(collection.logoDataUrl){$('logo').src=collection.logoDataUrl;$('logo').hidden=false}
     text($('location'),collection.profile.brandName+' · '+collection.profile.location);
     $('collection').hidden=false;text($('message'),'Private access is active. Your responses save to House of Briar as you review.');render();
   }catch(error){text($('message'),error.message);$('collection').hidden=true}
 }
 $('search').addEventListener('input',render);$('filter').addEventListener('change',render);
 $('reload').addEventListener('click',()=>{if(confirm('Refresh the collection? Unsaved notes on this page will be lost.'))void load()});
 (async()=>{try{if(initialToken)await api('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:initialToken})});await load()}catch(error){text($('message'),error.message)}})();
})();
