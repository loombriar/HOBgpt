(()=>{'use strict';
document.addEventListener('DOMContentLoaded',async()=>{
 let c=window.HOUSE_DESIGNER_SPOTLIGHT;
 try{const r=await fetch('/api/homepage/spotlight',{cache:'no-store'});if(r.ok){const data=await r.json();if(data.config)c=data.config;}}catch{}
 if(!c||!c.name||!Array.isArray(c.products)||!(typeof c.url==='string'&&c.url.startsWith('/')&&!c.url.startsWith('//')))return;
 const ad=document.querySelector('.house-designer-ad'),tpl=document.getElementById('atelier-gallery-preview');
 if(!ad||!tpl)return;
 const link=ad.querySelector('.house-designer-ad-image'),image=link?.querySelector('img'),caption=ad.querySelector('.house-designer-ad-caption');
 if(link)link.href=c.url;
 if(image&&c.heroImage){image.src=c.heroImage;image.alt=c.heroAlt||c.name+' collection';}
 if(caption){const spans=caption.querySelectorAll('span'),a=caption.querySelector('a');if(spans[0])spans[0].textContent='Designer spotlight / '+c.name;if(spans[1])spans[1].textContent=c.status||'Collection preview';if(a)a.href=c.url;}
 const root=tpl.content,eyebrow=root.querySelector('.eyebrow'),heading=root.querySelector('#home-shop-invitation-title'),gallery=root.querySelector('.house-preview-pieces'),action=root.querySelector('.house-shop-invitation-actions a');
 if(eyebrow)eyebrow.textContent='DESIGNER SPOTLIGHT / '+c.name.toUpperCase();
 if(heading){heading.textContent=c.headline||'Designer spotlight';if(heading.nextElementSibling)heading.nextElementSibling.textContent=c.description||'';}
 if(gallery&&c.products.length){gallery.replaceChildren();for(const p of c.products.slice(0,6)){if(!p.name||!p.image)continue;const a=document.createElement('a');a.className='house-preview-piece';a.href=c.url;const img=document.createElement('img');img.src=p.image;img.alt=p.name+' by '+c.name;img.loading='lazy';img.referrerPolicy='no-referrer';const title=document.createElement('strong');title.textContent=p.name;const meta=document.createElement('span');meta.textContent=[p.price,c.status||'Collection preview'].filter(Boolean).join(' · ');a.append(img,title,meta);gallery.append(a);}}
 if(action){action.href=c.url;action.textContent=c.collectionLinkText||'Explore the collection →';}
});
})();
