/* House of Briar's decorative layer uses the marketplace's original photos. */
const houseCollections = {
  'autumn-atelier': {title:'The Autumn Atelier',season:'An autumn edit',description:'Velvet, rich texture, and a little main-character energy. For plans that deserve more than “a nice top.”',filter:'all',icon:'spool',match:item=>/velvet/i.test(item.title+' '+item.description)||item.style==='Top'},
  'winter-briar': {title:'Winter Briar',season:'A winter daydream',description:'Velvet, golden details, and a little candlelit drama. Bring your own hot chocolate.',filter:'all',icon:'needle',match:item=>/velvet|gold/i.test(item.title+' '+item.description)},
  'garden-party': {title:'The Garden Party',season:'A collection in bloom',description:'Romantic dresses and a little botanical daydreaming. Garden party optional. Dramatic entrance encouraged.',filter:'Dress',icon:'briar',match:item=>item.style==='Dress'},
  'independent-by-design': {title:'Independent by Design',season:'Meet your next favorite',description:'Small runs. Singular ideas. Pieces with a person behind them—and absolutely no interest in blending in.',filter:'all',icon:'needle',match:()=>true}
};

function houseIcon(name){
  const paths={spool:'M13 7h22M13 41h22M16 7v34M32 7v34M16 14h16M16 20h16M16 26h16M16 32h16M16 38h16M35 25c13 0 7 17 2 13',needle:'M10 39 35 9c6-7 11-1 6 5L16 42M33 13l4-4M11 40c-10 4-9-13 0-11s7 11 17 6',briar:'M7 42c17-11 10-23 34-35M19 30l-8-5M27 20l9 2M32 15l-2-8M18 31c-10-14-16 2-3 3M28 21c7-15 20-2 5 3'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','atelier-icon');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.needle);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
}

const houseCollectionSlug=location.pathname.match(/^\/collections\/([^/]+)\/?$/)?.[1];
const houseCollection=houseCollections[houseCollectionSlug];
if(houseCollection){
  document.body.dataset.collection=houseCollectionSlug;
  const copy=document.querySelector('.sewing-hero-content');
  copy.querySelector('.eyebrow').textContent=houseCollection.season;
  copy.querySelector('h1').textContent=houseCollection.title;
  copy.querySelector('h1 + p').textContent=houseCollection.description;
  document.querySelector('.sewing-hero').setAttribute('aria-label',houseCollection.title);
  const heading=document.querySelector('#shop h2');heading.textContent='Explore the collection';
  activeFilter=houseCollection.filter;applyFilterButtons();loadGallery();
  const home=makeElement('a','atelier-back','← Back to the House');home.href='/';copy.prepend(home);
}

document.querySelectorAll('[data-house-icon]').forEach(el=>el.prepend(houseIcon(el.dataset.houseIcon)));

async function renderHouseEditorial(){
  const spread=byId('house-editorial-pieces'),edits=byId('house-collection-grid');
  if(!spread||!edits)return;
  try{
    const payload=await apiRequest('/api/gallery');
    const items=(Array.isArray(payload.items)?payload.items:[]).filter(item=>getProductImages(item)[0]?.url);
    const featured=houseCollection?items.filter(houseCollection.match):items;
    spread.dataset.count=String(Math.min(featured.length,3));
    if(!featured.length){spread.append(makeElement('p','atelier-empty','New pieces are on their way. Explore the market below.'));}
    featured.slice(0,3).forEach((item,index)=>{
      const card=makeElement('button','atelier-photo atelier-photo-'+index);card.type='button';card.setAttribute('aria-label',`Explore ${item.title}`);
      const image=document.createElement('img');image.src=getProductImages(item)[0].url;image.alt=item.title+' by '+(item.designerName||item.designerId||'an independent designer');image.loading='lazy';image.decoding='async';
      const caption=makeElement('span','atelier-photo-caption');caption.append(makeElement('span','atelier-photo-number',String(index+1).padStart(2,'0')),makeElement('strong','',item.title),makeElement('span','',('$'+Number(item.price||0).toFixed(2))+' · View piece ↗'));
      card.append(image,caption);card.addEventListener('click',()=>openProductDetails(item));spread.append(card);
    });
    for(const [slug,collection] of Object.entries(houseCollections)){
      const card=makeElement('a','atelier-collection');card.href='/collections/'+slug;
      const item=slug==='independent-by-design'?(items.find(item=>item.style==='Set / Outfit')||items.at(-1)):items.find(collection.match),cover=makeElement('div','atelier-collection-cover');
      if(item){const img=document.createElement('img');img.src=getProductImages(item)[0].url;img.alt='';img.loading='lazy';cover.append(img);}
      cover.append(houseIcon(collection.icon));
      const copy=makeElement('div','atelier-collection-copy');copy.append(makeElement('span','eyebrow',collection.season),makeElement('h3','',collection.title),makeElement('p','',collection.description),makeElement('span','atelier-collection-link','Explore the edit ↗'));
      card.append(cover,copy);edits.append(card);
    }
  }catch{spread.append(makeElement('p','atelier-empty','Our photo edit is taking a moment. You can still browse the market below.'));}
}
renderHouseEditorial();

const motionButton=makeElement('button','atelier-motion-button','Pause animation');motionButton.type='button';motionButton.setAttribute('aria-pressed','false');
motionButton.addEventListener('click',()=>{const paused=document.body.dataset.motion!=='paused';document.body.dataset.motion=paused?'paused':'running';motionButton.textContent=paused?'Play animation':'Pause animation';motionButton.setAttribute('aria-pressed',String(paused));});document.querySelector('.sewing-hero').append(motionButton);

function houseLookbook(items){
  const photos=items.flatMap(item=>getProductImages(item).map(image=>({item,image})));const host=makeElement('div','house-lookbook');
  if(!photos.length){host.append(makeElement('p','','Their next chapter is coming soon.'));return host;}
  let index=0;const photo=document.createElement('img'),caption=makeElement('p','house-lookbook-caption'),status=makeElement('span','small-print');status.setAttribute('aria-live','polite');
  const controls=makeElement('div','house-lookbook-controls'),previous=makeElement('button','secondary-button','← Previous photo'),next=makeElement('button','secondary-button','Next photo →'),piece=makeElement('button','primary-button','View this piece');
  [previous,next,piece].forEach(b=>b.type='button');
  function show(){const entry=photos[index];photo.src=entry.image.url;photo.alt=entry.item.title+' — lookbook photo '+(index+1);caption.textContent=entry.item.title+' · $'+Number(entry.item.price).toFixed(2);status.textContent=`Photo ${index+1} of ${photos.length}`;previous.disabled=next.disabled=photos.length<2;}
  previous.addEventListener('click',()=>{index=(index+photos.length-1)%photos.length;show();});next.addEventListener('click',()=>{index=(index+1)%photos.length;show();});piece.addEventListener('click',()=>{byId('designer-storefront-dialog')?.close();openProductDetails(photos[index].item);});controls.append(previous,next,piece);host.append(photo,caption,status,controls);show();return host;
}
async function renderHouseSpotlights(){
  const host=byId('house-spotlights');if(!host)return;host.replaceChildren();
  try{const {designers}=await apiRequest('/api/designers');
    for(const maker of (designers||[]).filter(d=>d.availableCount>0).slice(0,4)){
      const [{designer,items},studio]=await Promise.all([apiRequest('/api/designers/'+encodeURIComponent(maker.id)),apiRequest('/api/designers/'+encodeURIComponent(maker.id)+'/studio')]);
      const card=makeElement('article','house-spotlight');card.append(makeElement('p','eyebrow','From the maker'),makeElement('h3','',designer.brandName||designer.displayName));
      if(studio.photoUrl){const img=document.createElement('img');img.src=studio.photoUrl;img.alt='Behind the scenes at '+(designer.brandName||designer.displayName);img.loading='lazy';card.append(img);}
      card.append(makeElement('p','',studio.story||designer.bio||'Independent by design. Explore the pieces and meet their maker.'));
      if(designer.productionMethod)card.append(makeElement('p','small-print','The process: '+designer.productionMethod));
      const details=document.createElement('details'),summary=makeElement('summary','','Open the interactive lookbook');details.append(summary,houseLookbook(items||[]));card.append(details);
      const visit=makeElement('button','text-button','Meet the designer →');visit.type='button';visit.addEventListener('click',()=>openDesignerStorefront(maker.id));card.append(visit);host.append(card);
    }
    if(!host.children.length)host.append(makeElement('p','','New designers are moving into the House. Their stories will appear here.'));
  }catch{host.append(makeElement('p','','The studio stories are taking a moment. You can still meet designers through their listings.'));}
}
renderHouseSpotlights();

async function loadHouseStudio(id){try{const studio=await apiRequest('/api/designers/'+encodeURIComponent(id)+'/studio');byId('designer-studio-story').value=studio.story||'';byId('designer-studio-remove').hidden=!studio.photoUrl;}catch{}}
async function saveHouseStudio(){
  await apiRequest('/api/my/studio-story',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({story:byId('designer-studio-story').value})});
  const file=byId('designer-studio-photo').files[0];if(file){if(file.size>8*1024*1024)throw new Error('Choose a studio photo smaller than 8 MB.');const data=new FormData();data.append('image',file);await apiRequest('/api/my/studio-photo',{method:'POST',body:data});byId('designer-studio-photo').value='';}
  void renderHouseSpotlights();
}
byId('designer-studio-remove')?.addEventListener('click',async()=>{try{await apiRequest('/api/my/studio-photo',{method:'DELETE'});byId('designer-studio-remove').hidden=true;void renderHouseSpotlights();setMessage(byId('designer-brand-message'),'Studio photo removed.','success');}catch(error){setMessage(byId('designer-brand-message'),error.message,'error');}});

function houseTryOnButton(item){const button=makeElement('button','secondary-button','Try this piece on · AI preview');button.type='button';button.addEventListener('click',()=>{
  byId('product-dialog')?.close();byId('house-tryon-form').reset();byId('house-tryon-listing').value=item.id;byId('house-tryon-result').replaceChildren();byId('house-tryon-status').textContent='';byId('house-tryon-title').textContent='Try on: '+item.title;byId('house-tryon-dialog').showModal();
});return button;}
byId('house-tryon-close')?.addEventListener('click',()=>{byId('house-tryon-dialog').close();byId('house-tryon-photo').value='';byId('house-tryon-result').replaceChildren();});
byId('house-tryon-dialog')?.addEventListener('close',()=>{byId('house-tryon-photo').value='';byId('house-tryon-result').replaceChildren();});
byId('house-tryon-form')?.addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter,status=byId('house-tryon-status');button.disabled=true;
  try{const file=byId('house-tryon-photo').files[0];if(!file||file.size>8*1024*1024)throw new Error('Choose a photo smaller than 8 MB.');const body=new FormData();body.append('image',file);body.append('listingId',byId('house-tryon-listing').value);body.append('consent',String(byId('house-tryon-consent').checked));setMessage(status,'Creating your preview. This can take a couple of minutes.','');
    const result=await apiRequest('/api/house/try-on',{method:'POST',body});if(!byId('house-tryon-dialog').open)return;const image=document.createElement('img');image.src=result.image;image.alt='AI visual try-on preview';byId('house-tryon-result').replaceChildren(image,makeElement('p','small-print',result.disclaimer));setMessage(status,'Your AI preview is ready.','success');byId('house-tryon-photo').value='';
  }catch(error){setMessage(status,error.status===401?'Sign in through Visitor’s Suite or Designer’s Room, then return to try this piece on.':error.message,'error');}finally{button.disabled=false;}
});
byId('house-styling-form')?.addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter,status=byId('house-styling-status'),results=byId('house-styling-results');button.disabled=true;results.replaceChildren();setMessage(status,'Finding your kind of different…','');
  try{const payload=await apiRequest('/api/house/styling',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:byId('house-styling-prompt').value})});
    for(const {item,idea} of payload.suggestions||[]){const card=makeElement('article','house-styling-card');const image=document.createElement('img');image.src=getProductImages(item)[0]?.url||'';image.alt=item.title;image.loading='lazy';const copy=makeElement('div');copy.append(makeElement('h3','',item.title),makeElement('p','',idea));const visit=makeElement('button','primary-button','View piece');visit.type='button';visit.addEventListener('click',()=>openProductDetails(item));copy.append(visit,houseTryOnButton(item));card.append(image,copy);results.append(card);}setMessage(status,payload.note||'Your styling ideas are ready.','success');
  }catch(error){setMessage(status,error.status===401?'Sign in through Visitor’s Suite or Designer’s Room to ask the stylist.':error.message,'error');}finally{button.disabled=false;}
});
