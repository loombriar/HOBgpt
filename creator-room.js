(()=>{'use strict';
 const root=document.getElementById('creator-room');if(!root)return;
 const $=id=>document.getElementById(id),form=$('design-project-form');
 const controls=['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color','creator-secondary-color','creator-print','creator-print-scale','creator-offset-x','creator-offset-y','creator-scale','creator-opacity'];
 let avatarData='',avatarVersion=0;
 const position=()=>({x:Number($('creator-offset-x').value),y:Number($('creator-offset-y').value),scale:Number($('creator-scale').value)/100,opacity:Number($('creator-opacity').value)/100});
 const resetPosition=()=>{for(const [id,value]of [['creator-offset-x',0],['creator-offset-y',0],['creator-scale',100],['creator-opacity',100]])$(id).value=value;};
 function invalidate(message='Design changed. Add the updated template to your brief before saving.'){if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent=message;}}
 function garmentPaths(sleeves='Short'){
  const left=sleeves==='Sleeveless'?'Q105 102 109 126':sleeves==='Long'?'Q98 84 92 98 Q84 144 58 228 Q67 240 80 240 L109 126':'Q98 84 92 98 L79 154 Q87 160 97 162 L109 126';
  const right=sleeves==='Sleeveless'?'Q195 102 192 80':sleeves==='Long'?'L220 240 Q233 240 242 228 Q216 144 208 98 Q202 84 192 80':'L203 162 Q213 160 221 154 L208 98 Q202 84 192 80';
  const start='M130 72 Q119 74 108 80 '+left+' Q112 163 117 194 ',end=' Q188 163 191 126 '+right+' Q181 74 170 72 Q150 94 130 72 Z';
  const top=start+'Q150 201 183 194'+end;
  return {
   'A-line':start+'Q105 240 70 352 Q150 378 230 352 Q195 240 183 194'+end,
   'Fitted':start+'Q101 238 110 354 Q150 362 190 354 Q199 238 183 194'+end,
   'Full skirt':start+'Q89 252 44 350 Q150 395 256 350 Q211 252 183 194'+end,
   'Jumpsuit':start+'Q104 255 101 354 Q121 361 141 355 L146 266 Q150 258 154 266 L159 355 Q179 361 199 354 Q196 255 183 194'+end,
   'Top & trousers':top+' M117 206 Q150 213 183 206 Q192 251 201 354 Q180 361 158 356 L154 266 Q150 258 146 266 L142 356 Q120 361 99 354 Q108 251 117 206 Z',
   'Top & skirt':top+' M117 207 Q150 214 183 207 Q196 265 231 352 Q150 378 69 352 Q104 265 117 207 Z'
  };
 }
 const paths=garmentPaths();
 let active=false;
 function values(){return {template:$('creator-template').value,neckline:$('creator-neckline').value,sleeves:$('creator-sleeves').value,length:$('creator-length').value,color:$('creator-color').value,secondary:$('creator-secondary-color').value,print:$('creator-print').value,printScale:Number($('creator-print-scale').value)};}
 function render(){
  const v=values(),pos=position(),svg=$('creator-preview');svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,val]of Object.entries(attrs))n.setAttribute(k,String(val));parent.append(n);return n;};
  add('rect',{x:0,y:0,width:300,height:430,fill:'#faf7f0'});
  add('path',{d:'M22 32 H42 M22 32 V52 M278 32 H258 M278 32 V52 M22 390 H42 M22 390 V370 M278 390 H258 M278 390 V370',stroke:'#c9c1b4','stroke-width':.8,fill:'none'});
  add('ellipse',{cx:150,cy:384,rx:70,ry:5,fill:'#5c5548','fill-opacity':.07});
  if(!avatarData){add('ellipse',{cx:150,cy:43,rx:15,ry:21,fill:'#d4cec3','fill-opacity':.4});add('path',{'data-default-form':'true',d:'M141 63 L141 77 Q119 80 108 98 Q97 131 86 182 Q83 195 89 205 Q95 199 96 185 L117 128 Q120 170 116 197 Q107 237 116 276 L121 370 Q127 382 136 370 L150 264 L164 370 Q173 382 179 370 L184 276 Q193 237 184 197 Q180 170 183 128 L204 185 Q205 199 211 205 Q217 195 214 182 Q203 131 192 98 Q181 80 159 77 L159 63 Z',fill:'#ded8ce','fill-opacity':.32,stroke:'#b8b1a5','stroke-opacity':.5,'stroke-width':.8});}
  if(avatarData)add('image',{href:avatarData,x:0,y:0,width:300,height:400,preserveAspectRatio:'xMidYMid meet','data-avatar-reference':'true'});
  const height=v.length==='Mini'?.4:v.length==='Midi'?.72:1;
  const shapeForLength=d=>d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,(_,x,y)=>x+' '+(Number(y)>195?195+(Number(y)-195)*height:y));
  const silhouette=shapeForLength(garmentPaths(v.sleeves)[v.template]);
  const outer=add('g',{transform:`translate(${pos.x} ${pos.y}) translate(150 195) scale(${pos.scale}) translate(-150 -195)`,opacity:pos.opacity});
  const group=add('g',{},outer);
  const neckline=v.neckline==='V-neck'?'M130 72 L150 118 L170 72 Z':v.neckline==='Square'?'M130 72 L130 104 L170 104 L170 72 Z':'M130 72 Q150 105 170 72 Z';
  const defs=add('defs',{}),mask=add('mask',{id:'creator-garment-cutouts',maskUnits:'userSpaceOnUse',x:0,y:0,width:300,height:430},defs);add('rect',{x:0,y:0,width:300,height:430,fill:'white'},mask);
  add('path',{d:neckline,fill:'black'},mask);

  const fill=(id,color)=>{if(v.print==='Solid')return color;const pattern=add('pattern',{id,width:v.printScale,height:v.printScale,patternUnits:'userSpaceOnUse'},defs);add('rect',{width:v.printScale,height:v.printScale,fill:color},pattern);if(v.print==='Polka dots')add('circle',{cx:v.printScale/2,cy:v.printScale/2,r:v.printScale/6,fill:'#292722','fill-opacity':.45},pattern);else add('path',{d:`M0 0 L0 ${v.printScale}`,'stroke-width':v.printScale/3,stroke:'#292722','stroke-opacity':.4},pattern);return `url(#${id})`;};
  const topFill=fill('creator-top-print',v.color),bottomFill=fill('creator-bottom-print',v.secondary);
  const clip=add('clipPath',{id:'creator-bottom-clip'},defs);add('rect',{x:0,y:195,width:300,height:235},clip);
  const garment=add('g',{mask:'url(#creator-garment-cutouts)'},group);
  add('path',{d:silhouette,fill:topFill,stroke:'#292722','stroke-width':1.4},garment);
  add('path',{d:silhouette,fill:bottomFill,stroke:'#292722','stroke-width':1.4,'clip-path':'url(#creator-bottom-clip)'},garment);
  const garmentClip=add('clipPath',{id:'creator-garment-detail-clip'},defs);add('path',{d:silhouette},garmentClip);
  const details=add('g',{'clip-path':'url(#creator-garment-detail-clip)'},garment);
  const light=add('linearGradient',{id:'creator-fabric-shading',x1:'0%',y1:'0%',x2:'100%',y2:'20%'},defs);
  for(const [offset,color,opacity]of [['0%','#fff',.28],['30%','#fff',.04],['65%','#292722',.025],['100%','#292722',.16]])add('stop',{offset,'stop-color':color,'stop-opacity':opacity},light);
  add('path',{d:silhouette,fill:'url(#creator-fabric-shading)'},details);
  const separates=v.template.startsWith('Top &');
  const seam=separates?'M117 189 Q150 198 183 189 M117 211 Q150 219 183 211':'M117 194 Q150 201 183 194';
  add('path',{d:shapeForLength(seam),fill:'none',stroke:'#343830','stroke-opacity':.4,'stroke-width':.8},details);
  const legs=v.template==='Jumpsuit'||v.template==='Top & trousers';
  const folds=legs?'M126 218 Q119 283 120 351 M174 218 Q181 283 180 351 M150 217 L150 254':v.template==='Fitted'?'M128 208 Q116 277 126 351 M172 208 Q184 277 174 351':'M123 210 Q109 284 103 354 M140 211 Q133 293 132 363 M160 211 Q167 293 168 363 M177 210 Q191 284 197 354';
  add('path',{d:shapeForLength(folds),fill:'none',stroke:'#343830','stroke-opacity':.19,'stroke-width':.9,'stroke-linecap':'round'},details);
  add('path',{d:'M130 99 Q124 150 132 188 M170 99 Q176 150 168 188',fill:'none',stroke:'#343830','stroke-opacity':.18,'stroke-width':.7},details);
  add('path',{d:neckline,fill:'none',stroke:'#292722','stroke-width':1.2,'stroke-linecap':'round'},group);
  const title=add('text',{x:150,y:418,'text-anchor':'middle',fill:'#292722','font-size':13,'font-family':'Georgia,serif','letter-spacing':'.5'});title.textContent=v.template+' · '+v.length;
  $('creator-preview-description').textContent=`${v.template} template, ${v.neckline}, ${v.sleeves.toLowerCase()} sleeves, ${v.length.toLowerCase()} length.${avatarData?' Shown on your uploaded avatar.':''} ${v.print==='Solid'?'':' '+v.print+' print.'} Concept illustration only; not a fit or size calculation.`;
  for(const button of root.querySelectorAll('[data-creator-template]'))button.setAttribute('aria-pressed',String(button.dataset.creatorTemplate===v.template));
 }
 const chooser=document.createElement('div');chooser.className='creator-template-grid';chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Choose a silhouette');
 for(const [name,path]of Object.entries(paths)){const button=document.createElement('button');button.type='button';button.dataset.creatorTemplate=name;button.className='creator-template-card';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 40 300 350');icon.setAttribute('aria-hidden','true');const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d',path);shape.setAttribute('fill','#b7d9cc');shape.setAttribute('stroke','#292722');shape.setAttribute('stroke-width','2');icon.append(shape);const label=document.createElement('span');label.textContent=name;button.append(icon,label);button.addEventListener('click',()=>{$('creator-template').value=name;invalidate();render();});chooser.append(button);}
 $('creator-template').closest('label').before(chooser);
 const looks={everyday:['A-line','Scoop','Short','Midi','#b7d9cc'],evening:['Fitted','V-neck','Sleeveless','Maxi','#775166'],separates:['Top & skirt','Square','Sleeveless','Mini','#b8bdd9']};
 for(const button of root.querySelectorAll('[data-creator-look]'))button.addEventListener('click',()=>{const look=looks[button.dataset.creatorLook];['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color'].forEach((id,index)=>{$(id).value=look[index];});$('creator-secondary-color').value=look[4];invalidate();render();$('creator-status').textContent=button.querySelector('strong').textContent+' loaded. Make it your own with the details below.';});
 $('creator-avatar').addEventListener('change',async event=>{
  const version=++avatarVersion,file=event.target.files[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){event.target.value='';$('creator-avatar-status').textContent='Choose a PNG, JPG or WebP image up to 8 MB.';return;}
  $('creator-avatar-status').textContent='Loading your avatar on this device…';
  try{const reader=new FileReader();const source=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});const image=new Image();image.src=source;await image.decode();if(image.naturalWidth*image.naturalHeight>40_000_000)throw Error();const scale=Math.min(1,900/image.naturalWidth,1200/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);if(version!==avatarVersion)return;avatarData=canvas.toDataURL('image/png');resetPosition();invalidate('Avatar changed. Add the updated outfit to your brief before saving.');render();$('creator-remove-avatar').hidden=false;$('creator-avatar-adjustments').hidden=false;$('creator-avatar-status').textContent='Avatar added locally. Choose a template and adjust the outfit position.';}
  catch{if(version===avatarVersion){$('creator-avatar-status').textContent='This image could not be opened. Try another PNG, JPG or WebP.';event.target.value='';}}
 });
 $('creator-remove-avatar').addEventListener('click',()=>{avatarVersion++;avatarData='';$('creator-avatar').value='';$('creator-remove-avatar').hidden=true;$('creator-avatar-adjustments').hidden=true;$('creator-avatar-status').textContent='Avatar removed from this tab.';resetPosition();invalidate();render();});
 $('creator-reset-position').addEventListener('click',()=>{resetPosition();invalidate();render();});
 function fabric(){const raw=$('creator-fabric-url').value.trim();if(!raw)return '';let url;try{url=new URL(raw);}catch{throw Error('Use a complete fabric product link starting with https://.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a secure https:// fabric product link without sign-in details.');return url.href;}
 function brief(){const v=values(),link=fabric();return `Template design: ${v.template}\nNeckline: ${v.neckline}\nSleeves: ${v.sleeves}\nLength: ${v.length}\nPreview color: ${v.color}\nBottom color: ${v.secondary}\nPrint: ${v.print}${v.print==='Solid'?'':' (repeat '+v.printScale+')'}${avatarData?'\nAvatar: user-provided visual reference only; does not establish garment size or fit.':''}\nFabric choice: ${$('creator-fabric-name').value.trim()||'To discuss with maker'}${link?'\nFabric product link: '+link:''}\nFabric quantity, suitability, price and availability need maker/store confirmation. This template is a concept, not a sewing pattern or guaranteed fit.`;}
 $('creator-use-template').addEventListener('click',()=>{const status=$('creator-status');try{const text=brief(),field=$('project-details'),old=field.value.replace(/\n?\[Back Stage template\][\s\S]*?\[End template\]/g,'').trim();const combined=(old?old+'\n\n':'')+'[Back Stage template]\n'+text+'\n[End template]';if(combined.length>field.maxLength)throw Error('Shorten your notes or fabric description so your brief fits within 2,000 characters.');field.value=combined;active=true;$('creator-include-preview').disabled=false;if(!$('project-title').value)$('project-title').value=values().template+' outfit concept';status.textContent='Template added to your brief below. Save it as a private project when ready.';$('new-project').scrollIntoView({block:'start',behavior:'smooth'});}catch(e){status.textContent=e.message;}});
 for(const id of controls)$(id).addEventListener('input',()=>{render();if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent='Design changed. Add the updated template to your brief before saving.';}});
 for(const id of ['creator-fabric-name','creator-fabric-url'])$(id).addEventListener('input',()=>{if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent='Fabric changed. Add the updated template to your brief before saving.';}});
 async function exportSketch(){const source=new XMLSerializer().serializeToString($('creator-preview'));const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=600;canvas.height=860;canvas.getContext('2d').drawImage(image,0,0,600,860);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('The sketch could not be created. Your written brief can still be saved.');return blob;}finally{URL.revokeObjectURL(url);}}
 window.houseCreatorPreview=async()=>active&&$('creator-include-preview').checked?exportSketch():null;
 $('creator-download').addEventListener('click',async()=>{const button=$('creator-download');button.disabled=true;try{const blob=await exportSketch(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='house-of-briar-outfit.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('creator-status').textContent='Your outfit sketch was downloaded to this device.';}catch(error){$('creator-status').textContent=error.message||'The sketch could not be downloaded.';}finally{button.disabled=false;}});
 form.addEventListener('reset',()=>{active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;});render();
})();
