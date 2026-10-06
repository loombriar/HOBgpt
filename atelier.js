/* House of Briar's decorative layer uses the marketplace's original photos. */
const houseCollections = {
  'autumn-atelier': {title:'The Autumn Atelier',season:'An autumn edit',description:'Velvet, rich texture, and a little main-character energy. For plans that deserve more than “a nice top.”',filter:'Top',icon:'spool',match:item=>/velvet/i.test(item.title+' '+item.description)||item.style==='Top'},
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
