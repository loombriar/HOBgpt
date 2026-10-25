(()=>{'use strict';
 const $=id=>document.getElementById(id),node=(tag,text)=>{const element=document.createElement(tag);if(text)element.textContent=text;return element;};
 async function api(url,body,method='GET'){
  const multipart=body instanceof FormData;
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',...(body?{body:multipart?body:JSON.stringify(body),headers:multipart?{}:{'Content-Type':'application/json'}}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Sign in to use your design portfolio.');return data;
 }
 const button=(text,handler)=>{const b=node('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await handler();}catch(e){$('project-message').textContent=e.message;}finally{b.disabled=false;}};return b;};
 function preview(project){
  const card=node('article');card.className='room-card';card.append(node('h3',project.title),node('p','Created by '+project.displayName),node('p',project.details));
  for(const [label,value] of [['Budget',project.budget],['Size & fit',project.sizeNotes],['Preferred date',project.deadline]])if(value)card.append(node('p',label+': '+value));
  const gallery=node('div');gallery.className='design-project-gallery';
  for(const image of project.images){const link=node('a'),photo=node('img');link.href=image.url;link.target='_blank';link.rel='noopener noreferrer';photo.src=image.url;photo.alt=project.title+' drawing';photo.loading='lazy';link.append(photo);gallery.append(link);}
  card.append(gallery);return card;
 }
 async function refresh(){
  try{
   const data=await api('/api/my/design-projects');$('project-account-status').textContent='Your private design portfolio is ready.';
   const list=$('project-list');list.replaceChildren();if(!data.projects.length)list.append(node('p','Your first design starts here. Add a project below, then upload your drawings.'));
   for(const project of data.projects){
    const card=preview(project);card.append(node('p',project.visibility==='makers'?'Shared with makers':'Private project'));
    const controls=node('div');controls.className='design-project-actions';
    if(project.offers.some(offer=>offer.status==='accepted'))card.append(node('p','Matched with your chosen maker.'));
    else controls.append(button(project.visibility==='makers'?'Make private':'Share with makers',async()=>{await api('/api/my/design-projects/'+project.id,{visibility:project.visibility==='makers'?'private':'makers'},'PATCH');await refresh();}));
    controls.append(button('Delete project',async()=>{if(!confirm('Delete this project, its drawings and offers?'))return;await api('/api/my/design-projects/'+project.id,null,'DELETE');await refresh();}));card.append(controls);
    for(const image of project.images)card.append(button('Remove drawing '+(project.images.indexOf(image)+1),async()=>{await api(`/api/my/design-projects/${project.id}/images/${image.id}`,null,'DELETE');await refresh();}));
    if(project.images.length<3){
     const form=node('form');form.className='stack-form';form.setAttribute('aria-label','Upload drawing for '+project.title);
     const label=node('label','Drawing (JPEG, PNG or WebP, up to 10 MiB)'),input=node('input');input.type='file';input.name='image';input.accept='image/jpeg,image/png,image/webp';input.required=true;label.append(input);
     const consentLabel=node('label'),consent=node('input');consent.type='checkbox';consent.name='consent';consent.value='true';consent.required=true;
     consentLabel.append(consent,document.createTextNode(' I created this drawing or have permission to share it, and agree to send it to OpenAI for an image safety check. Image metadata is removed first.'));
     const save=node('button','Upload drawing');save.type='submit';const status=node('p');status.setAttribute('role','status');
     form.append(label,consentLabel,save,status);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;status.textContent='Checking and saving your drawing…';try{await api(`/api/my/design-projects/${project.id}/images`,new FormData(form),'POST');$('project-message').textContent='Drawing saved. Your project stays private until you share it.';await refresh();}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};card.append(form);
    }
    if(project.offers.length){card.append(node('h4','Offers to help'));for(const offer of project.offers){const item=node('div');item.className='room-card';item.append(node('h4',offer.makerName),node('p',offer.note),node('p','Status: '+offer.status));if(offer.contactEmail)item.append(node('p','Contact your maker: '+offer.contactEmail));if(offer.status==='pending')for(const status of ['accepted','declined'])item.append(button(status==='accepted'?'Accept & share contact emails':'Decline',async()=>{if(status==='accepted'&&!confirm('Share your account email and project details with this maker? This is an introduction, not a booking.'))return;await api(`/api/my/design-projects/${project.id}/offers/${offer.id}`,{status},'PATCH');await refresh();}));card.append(item);}}
    list.append(card);
   }
   const offers=$('maker-offer-list');offers.replaceChildren();if(!data.offers.length)offers.append(node('p','No offers yet. Browse shared projects to find a design you can make.'));
   for(const offer of data.offers){const card=offer.project?preview(offer.project):node('article');card.className='room-card';if(!offer.project)card.append(node('h3',offer.title));card.append(node('p',offer.note),node('p','Status: '+offer.status));if(offer.contactEmail)card.append(node('p','Contact the creator: '+offer.contactEmail));offers.append(card);}
  }catch(e){$('project-account-status').textContent=e.message;}
 }
 $('design-project-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,save=form.querySelector('button'),status=form.querySelector('[role=status]');save.disabled=true;try{await api('/api/my/design-projects',Object.fromEntries(new FormData(form)),'POST');form.reset();status.textContent='Private project created. Add drawings in My design portfolio above.';await refresh();$('my-projects').scrollIntoView({block:'start',behavior:'smooth'});}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 $('refresh-projects').onclick=refresh;
 $('load-maker-board').onclick=async()=>{const status=$('maker-board-status'),list=$('maker-project-list');status.textContent='Loading shared projects…';list.replaceChildren();try{const data=await api('/api/design-projects');status.textContent=data.projects.length?'Choose a project you could help make.':'No shared designs yet. Visit again as the community grows.';for(const project of data.projects){const card=preview(project),form=node('form');form.className='stack-form';const label=node('label','Your experience, availability and suggested next step'),note=node('textarea');note.name='note';note.required=true;note.minLength=30;note.maxLength=1200;label.append(note);const send=node('button','I can help make this');send.type='submit';const result=node('p');result.setAttribute('role','status');form.append(label,send,result);form.onsubmit=async event=>{event.preventDefault();send.disabled=true;try{const response=await api(`/api/design-projects/${project.id}/offers`,{note:note.value},'POST');result.textContent=response.message;await refresh();}catch(e){result.textContent=e.message;send.disabled=false;}};card.append(form);list.append(card);}}catch(e){status.textContent=e.message;}};
 void refresh();
})();
