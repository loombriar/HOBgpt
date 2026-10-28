(()=>{'use strict';
 const root=document.getElementById('creator-room');if(!root)return;
 const $=id=>document.getElementById(id),form=$('design-project-form');
 const controls=['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color','creator-secondary-color','creator-print','creator-print-scale','creator-offset-x','creator-offset-y','creator-scale','creator-opacity'];
 let avatarData='',avatarVersion=0,conceptVersion=0,conceptController=null;
 function invalidateConcept(){const hadPreview=conceptController||!$('creator-concept-image').hidden;conceptVersion++;conceptController?.abort();conceptController=null;$('creator-concept-consent').checked=false;$('creator-concept-image').hidden=true;$('creator-concept-image').removeAttribute('src');$('creator-concept-download').hidden=true;$('creator-concept-download').removeAttribute('href');$('creator-concept-cancel').hidden=true;if(hadPreview)$('creator-concept-status').textContent='Design changed. Generate a fresh concept when ready.';}
 const position=()=>({x:Number($('creator-offset-x').value),y:Number($('creator-offset-y').value),scale:Number($('creator-scale').value)/100,opacity:Number($('creator-opacity').value)/100});
 const resetPosition=()=>{for(const [id,value]of [['creator-offset-x',0],['creator-offset-y',0],['creator-scale',100],['creator-opacity',100]])$(id).value=value;};
 function invalidate(message='Design changed. Add the updated template to your brief before saving.'){if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent=message;}}
 function garmentPaths(sleeves='Short'){
  // Fashion flats: balanced shoulders, shaped side seams, and a natural waist.
  const left=sleeves==='Sleeveless'?'L111 64 Q111 96 117 119':sleeves==='Long'?'L107 63 Q100 65 96 78 L68 192 L88 198 L114 111':'L107 63 Q100 65 96 76 L76 120 L100 132 L113 108';
  const right=sleeves==='Sleeveless'?'Q189 96 189 64 L170 56':sleeves==='Long'?'L212 198 L232 192 L204 78 Q200 65 193 63 L170 56':'L200 132 L224 120 L204 76 Q200 65 193 63 L170 56';
  const start='M130 56 '+left+' C113 134 118 159 123 174 ',end=' C182 159 187 134 '+(sleeves==='Sleeveless'?'183 119 ':sleeves==='Long'?'186 111 ':'187 108 ')+right+' L130 56 Z';
  const top=start+'Q150 177 177 174'+end;
  return {
   'A-line':start+'C115 222 85 326 69 377 Q150 396 231 377 C215 326 185 222 177 174'+end,
   'Fitted':start+'C111 199 110 227 116 257 L124 382 Q150 387 176 382 L184 257 C190 227 189 199 177 174'+end,
   'Full skirt':start+'C104 217 66 312 42 370 Q150 410 258 370 C234 312 196 217 177 174'+end,
   'Jumpsuit':start+'C111 206 108 236 112 267 L107 381 Q125 387 143 381 L147 246 Q150 239 153 246 L157 381 Q175 387 193 381 L188 267 C192 236 189 206 177 174'+end,
   'Top & trousers':top+' M123 187 Q150 190 177 187 C188 215 190 239 186 268 L203 381 Q179 389 157 381 L153 252 Q150 245 147 252 L143 381 Q121 389 97 381 L114 268 C110 239 112 215 123 187 Z',
   'Top & skirt':top+' M123 187 Q150 190 177 187 C188 233 218 332 234 377 Q150 399 66 377 C82 332 112 233 123 187 Z'
  };
 }
 const paths=garmentPaths();
 // History is tab-local. Never store avatars, drafts or consent in browser storage.
 const historyFields=[...controls,'creator-fabric-name','creator-fabric-url'];
 let history=[],historyIndex=-1;
 function snapshot(){return {fields:Object.fromEntries(historyFields.map(id=>[id,$(id).value])),avatar:avatarData};}
 function checkpoint(){const next=snapshot(),current=history[historyIndex];if(current&&JSON.stringify(current)===JSON.stringify(next))return;history=history.slice(0,historyIndex+1);history.push(next);if(history.length>40)history.shift();historyIndex=history.length-1;syncHistory();}
 function syncHistory(){$('creator-undo').disabled=historyIndex<=0;$('creator-redo').disabled=historyIndex>=history.length-1;}
 function restoreHistory(direction){checkpoint();const index=historyIndex+direction;if(index<0||index>=history.length)return;historyIndex=index;const state=history[index];for(const [id,value]of Object.entries(state.fields))$(id).value=value;avatarVersion++;avatarData=state.avatar;$('creator-avatar').value='';$('creator-remove-avatar').hidden=!avatarData;$('creator-avatar-adjustments').hidden=!avatarData;$('creator-avatar-status').textContent=avatarData?'Avatar restored locally in this tab.':'';invalidate();render();syncHistory();$('creator-history-status').textContent=direction<0?'Previous design restored.':'Design change reapplied.';}
 $('creator-undo').addEventListener('click',()=>restoreHistory(-1));
 $('creator-redo').addEventListener('click',()=>restoreHistory(1));
 root.addEventListener('change',event=>{if(historyFields.includes(event.target.id))checkpoint();});
 root.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.altKey||event.key.toLowerCase()!=='z'||event.target.closest('input,textarea,select,[contenteditable=true]'))return;event.preventDefault();restoreHistory(event.shiftKey?1:-1);});
 const palettes=[['Jade & cream','#216650','#efe3ce'],['Berry & blush','#87355d','#e6b4c8'],['Lilac & midnight','#b8a0d6','#30233c'],['Sunset & clay','#d88d58','#994e48']];
 for(const [name,top,bottom]of palettes){const button=document.createElement('button');button.type='button';button.className='creator-palette';button.dataset.top=top;button.dataset.bottom=bottom;button.setAttribute('aria-pressed','false');const chip=document.createElement('span');chip.className='creator-palette-chip';chip.setAttribute('aria-hidden','true');chip.style.setProperty('--palette-top',top);chip.style.setProperty('--palette-bottom',bottom);button.append(chip,document.createTextNode(name));button.addEventListener('click',()=>{checkpoint();$('creator-color').value=top;$('creator-secondary-color').value=bottom;invalidate();render();checkpoint();});$('creator-palettes').append(button);}

 let active=false;
 function values(){return {template:$('creator-template').value,neckline:$('creator-neckline').value,sleeves:$('creator-sleeves').value,length:$('creator-length').value,color:$('creator-color').value,secondary:$('creator-secondary-color').value,print:$('creator-print').value,printScale:Number($('creator-print-scale').value)};}
 const necklinePath=neckline=>neckline==='V-neck'?'M130 56 L150 91 L170 56 Z':neckline==='Square'?'M130 56 L130 82 Q150 84 170 82 L170 56 Z':'M130 56 C133 84 167 84 170 56 Z';
 function render(){
  invalidateConcept();
  const v=values(),pos=position(),svg=$('creator-preview');svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,val]of Object.entries(attrs))n.setAttribute(k,String(val));parent.append(n);return n;};
  add('rect',{x:0,y:0,width:300,height:430,fill:'#faf7f0'});
  if(avatarData)add('image',{href:avatarData,x:0,y:0,width:300,height:430,preserveAspectRatio:'xMidYMid meet','data-avatar-reference':'true'});
  const height=v.length==='Mini'?.43:v.length==='Midi'?.76:1;
  const shapeForLength=d=>d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,(_,x,y)=>x+' '+(Number(y)>180?180+(Number(y)-180)*height:y));
  const silhouette=shapeForLength(garmentPaths(v.sleeves)[v.template]);
  const defs=add('defs',{}),neckline=necklinePath(v.neckline);
  const mask=add('mask',{id:'creator-garment-cutouts',maskUnits:'userSpaceOnUse',x:0,y:0,width:300,height:430},defs);
  add('rect',{x:0,y:0,width:300,height:430,fill:'white'},mask);add('path',{d:neckline,fill:'black'},mask);
  const clip=add('clipPath',{id:'creator-garment-detail-clip'},defs);add('path',{d:silhouette},clip);
  const bottomClip=add('clipPath',{id:'creator-bottom-clip'},defs);add('rect',{x:0,y:178,width:300,height:252},bottomClip);
  const fill=(id,color)=>{if(v.print==='Solid')return color;const pattern=add('pattern',{id,width:v.printScale,height:v.printScale,patternUnits:'userSpaceOnUse'},defs);add('rect',{width:v.printScale,height:v.printScale,fill:color},pattern);if(v.print==='Polka dots')add('circle',{cx:v.printScale/2,cy:v.printScale/2,r:v.printScale/6,fill:'#292722','fill-opacity':.4},pattern);else add('path',{d:`M0 0 L0 ${v.printScale}`,'stroke-width':v.printScale/3,stroke:'#292722','stroke-opacity':.35},pattern);return `url(#${id})`;};
  const mainFill=fill('creator-top-print',v.color),bottomFill=fill('creator-bottom-print',v.secondary);
  const lighting=add('linearGradient',{id:'creator-fabric-light',x1:'0%',y1:'0%',x2:'100%',y2:'0%'},defs);
  for(const [offset,color,opacity]of [['0%','#302832',.08],['24%','#ffffff',.1],['52%','#ffffff',0],['100%','#302832',.1]])add('stop',{offset,'stop-color':color,'stop-opacity':opacity},lighting);
  const outer=add('g',{transform:`translate(${pos.x} ${pos.y}) translate(150 180) scale(${pos.scale}) translate(-150 -180)`,opacity:pos.opacity});
  const garment=add('g',{mask:'url(#creator-garment-cutouts)'},outer);
  add('path',{d:silhouette,fill:mainFill,stroke:'#383137','stroke-width':1.35,'stroke-linejoin':'round'},garment);
  add('path',{d:silhouette,fill:bottomFill,stroke:'#383137','stroke-width':1.35,'clip-path':'url(#creator-bottom-clip)'},garment);
  add('path',{d:silhouette,fill:'url(#creator-fabric-light)',stroke:'none'},garment);
  const details=add('g',{'clip-path':'url(#creator-garment-detail-clip)',fill:'none',stroke:'#4c4148','stroke-width':.65,'stroke-linecap':'round','stroke-linejoin':'round'},garment);
  const line=(d,opacity=.4,width=.65)=>add('path',{d:shapeForLength(d),'stroke-opacity':opacity,'stroke-width':width},details);
  const separates=v.template.startsWith('Top &'),legs=v.template==='Jumpsuit'||v.template==='Top & trousers';
  line(separates?'M122 169 Q150 172 178 169 M123 191 Q150 194 177 191':'M123 174 Q150 178 177 174',.8,1);
  line('M133 119 Q131 148 128 171 M167 119 Q169 148 172 171',.25);
  if(v.sleeves!=='Sleeveless'){
   line('M108 66 Q121 81 113 108 M192 66 Q179 81 187 108',.45);
   line(v.sleeves==='Short'?'M79 116 L101 127 M199 127 L221 116':'M69 187 L89 193 M211 193 L231 187',.45);
  }
  if(legs){
   line('M124 196 Q117 211 113 217 M176 196 Q183 211 187 217 M150 190 L150 232',.5);
   line('M127 239 L122 374 M173 239 L178 374',.22);
  }else{
   const folds=v.template==='Full skirt'?['M125 184 Q102 262 70 367','M140 185 Q133 283 128 389','M160 185 Q167 283 172 389','M175 184 Q198 262 230 367']:v.template==='Fitted'?['M128 191 Q119 262 129 376','M172 191 Q181 262 171 376']:['M125 187 Q108 272 88 374','M140 188 Q132 279 130 383','M160 188 Q168 279 170 383','M175 187 Q192 272 212 374'];
   folds.forEach(d=>line(d,.24,.8));
  }
  const hem=legs?(v.template==='Top & trousers'?'M98 376 Q121 383 143 376 M157 376 Q179 383 202 376':'M108 376 Q125 382 143 376 M157 376 Q175 382 192 376'):v.template==='Fitted'?'M124 377 Q150 382 176 377':v.template==='Full skirt'?'M44 365 Q150 405 256 365':'M71 372 Q150 391 229 372';
  line(hem,.4);
  // A second fine neckline line reads as a sewn facing rather than a cutout hole.
  add('path',{d:neckline,fill:'none',stroke:'#383137','stroke-width':1.1},outer);
  const shortSummary=$('creator-design-summary');if(shortSummary)shortSummary.textContent=v.template+' · '+v.sleeves+' sleeve · '+v.length;
  $('creator-preview-description').textContent=`${v.template} template, ${v.neckline}, ${v.sleeves.toLowerCase()} sleeves, ${v.length.toLowerCase()} length.${avatarData?' Shown on your uploaded avatar.':''} ${v.print==='Solid'?'':' '+v.print+' print.'} Technical concept sketch; confirm construction and measurements with your maker.`;
  for(const button of root.querySelectorAll('.creator-palette'))button.setAttribute('aria-pressed',String(button.dataset.top===v.color&&button.dataset.bottom===v.secondary));
  for(const button of root.querySelectorAll('[data-creator-template]'))button.setAttribute('aria-pressed',String(button.dataset.creatorTemplate===v.template));
 }
 const chooser=document.createElement('div');chooser.className='creator-template-grid';chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Choose a silhouette');
 for(const [name,path]of Object.entries(paths)){const button=document.createElement('button');button.type='button';button.dataset.creatorTemplate=name;button.className='creator-template-card';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','30 40 240 370');icon.setAttribute('aria-hidden','true');const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d',path);shape.setAttribute('fill','#b7d9cc');shape.setAttribute('stroke','#292722');shape.setAttribute('stroke-width','2');icon.append(shape);const neck=document.createElementNS(icon.namespaceURI,'path');neck.setAttribute('d',necklinePath('Scoop'));neck.setAttribute('fill','#faf7f0');neck.setAttribute('stroke','#292722');neck.setAttribute('stroke-width','1.5');icon.append(neck);const label=document.createElement('span');label.textContent=name;button.append(icon,label);button.addEventListener('click',()=>{checkpoint();$('creator-template').value=name;invalidate();render();checkpoint();});chooser.append(button);}
 $('creator-template').closest('label').before(chooser);
 const looks={everyday:['A-line','Scoop','Short','Midi','#b7d9cc'],evening:['Fitted','V-neck','Sleeveless','Maxi','#775166'],separates:['Top & skirt','Square','Sleeveless','Mini','#b8bdd9']};
 for(const button of root.querySelectorAll('[data-creator-look]'))button.addEventListener('click',()=>{checkpoint();const look=looks[button.dataset.creatorLook];['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color'].forEach((id,index)=>{$(id).value=look[index];});$('creator-secondary-color').value=look[4];invalidate();render();checkpoint();$('creator-status').textContent=button.querySelector('strong').textContent+' loaded. Make it your own with the details below.';});
 $('creator-avatar').addEventListener('change',async event=>{
  const version=++avatarVersion,file=event.target.files[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){event.target.value='';$('creator-avatar-status').textContent='Choose a PNG, JPG or WebP image up to 8 MB.';return;}
  $('creator-avatar-status').textContent='Loading your avatar on this device…';
  try{const reader=new FileReader();const source=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});const image=new Image();image.src=source;await image.decode();if(image.naturalWidth*image.naturalHeight>40_000_000)throw Error();const scale=Math.min(1,900/image.naturalWidth,1200/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);if(version!==avatarVersion)return;checkpoint();avatarData=canvas.toDataURL('image/png');resetPosition();invalidate('Avatar changed. Add the updated outfit to your brief before saving.');render();$('creator-remove-avatar').hidden=false;$('creator-avatar-adjustments').hidden=false;$('creator-avatar-status').textContent='Avatar added locally. Choose a template and adjust the outfit position.';checkpoint();}
  catch{if(version===avatarVersion){$('creator-avatar-status').textContent='This image could not be opened. Try another PNG, JPG or WebP.';event.target.value='';}}
 });
 $('creator-remove-avatar').addEventListener('click',()=>{checkpoint();avatarVersion++;avatarData='';$('creator-avatar').value='';$('creator-remove-avatar').hidden=true;$('creator-avatar-adjustments').hidden=true;$('creator-avatar-status').textContent='Avatar removed from the preview. Undo can restore it in this tab.';resetPosition();invalidate();render();checkpoint();});
 $('creator-reset-position').addEventListener('click',()=>{checkpoint();resetPosition();invalidate();render();checkpoint();});
 function fabric(){const raw=$('creator-fabric-url').value.trim();if(!raw)return '';let url;try{url=new URL(raw);}catch{throw Error('Use a complete fabric product link starting with https://.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a secure https:// fabric product link without sign-in details.');return url.href;}
 function brief(){const v=values(),link=fabric();return `Template design: ${v.template}\nNeckline: ${v.neckline}\nSleeves: ${v.sleeves}\nLength: ${v.length}\nPreview color: ${v.color}\nBottom color: ${v.secondary}\nPrint: ${v.print}${v.print==='Solid'?'':' (repeat '+v.printScale+')'}${avatarData?'\nAvatar: user-provided visual reference only; does not establish garment size or fit.':''}\nFabric choice: ${$('creator-fabric-name').value.trim()||'To discuss with maker'}${link?'\nFabric product link: '+link:''}\nFabric quantity, suitability, price and availability need maker/store confirmation. This template is a concept, not a sewing pattern or guaranteed fit.`;}
 $('creator-review-save').addEventListener('click',()=>$('creator-use-template').click());
 $('creator-copy-brief').addEventListener('click',async()=>{try{const text=brief();await navigator.clipboard.writeText(text);$('creator-status').textContent='Design brief copied. You can paste it into a message to your maker.';}catch(error){$('creator-status').textContent=error.message?.startsWith('Use ')?error.message:'Copy is unavailable in this browser. Use Review & save design to read your brief below.';}});
 $('creator-use-template').addEventListener('click',()=>{const status=$('creator-status');try{const text=brief(),field=$('project-details'),old=field.value.replace(/\n?\[Back Stage template\][\s\S]*?\[End template\]/g,'').trim();const combined=(old?old+'\n\n':'')+'[Back Stage template]\n'+text+'\n[End template]';if(combined.length>field.maxLength)throw Error('Shorten your notes or fabric description so your brief fits within 2,000 characters.');field.value=combined;active=true;$('creator-include-preview').disabled=false;if(!$('project-title').value)$('project-title').value=values().template+' outfit concept';status.textContent='Template added to your brief below. Save it as a private project when ready.';$('new-project').scrollIntoView({block:'start',behavior:'smooth'});}catch(e){status.textContent=e.message;}});
 for(const id of controls)$(id).addEventListener('input',()=>{render();if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent='Design changed. Add the updated template to your brief before saving.';}});
 for(const id of ['creator-fabric-name','creator-fabric-url'])$(id).addEventListener('input',()=>{invalidateConcept();if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent='Fabric changed. Add the updated template to your brief before saving.';}});
 async function exportSketch(){const source=new XMLSerializer().serializeToString($('creator-preview'));const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=600;canvas.height=860;canvas.getContext('2d').drawImage(image,0,0,600,860);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('The sketch could not be created. Your written brief can still be saved.');return blob;}finally{URL.revokeObjectURL(url);}}
 window.houseCreatorPreview=async()=>active&&$('creator-include-preview').checked?exportSketch():null;
 $('creator-download').addEventListener('click',async()=>{const button=$('creator-download');button.disabled=true;try{const blob=await exportSketch(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='house-of-briar-outfit.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('creator-status').textContent='Your outfit sketch was downloaded to this device.';}catch(error){$('creator-status').textContent=error.message||'The sketch could not be downloaded.';}finally{button.disabled=false;}});
 $('creator-concept-consent').addEventListener('change',()=>{if(!$('creator-concept-consent').checked)invalidateConcept();});
 $('creator-concept-cancel').addEventListener('click',()=>{invalidateConcept();$('creator-concept-status').textContent='Concept preview cancelled. Your sketch is unchanged.';});
 $('creator-visualize').addEventListener('click',async()=>{
  const status=$('creator-concept-status'),button=$('creator-visualize');if(!$('creator-concept-consent').checked){status.textContent='Agree to send your sketch to OpenAI before generating a concept.';return;}
  const attempt=++conceptVersion,controller=new AbortController();conceptController=controller;button.disabled=true;$('creator-concept-cancel').hidden=false;$('creator-concept-image').hidden=true;$('creator-concept-download').hidden=true;$('creator-concept-signin').hidden=true;status.textContent='Creating your AI concept. This may take a couple of minutes…';
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},160000);
  try{const details={...values(),includesAvatar:Boolean(avatarData),fabricNotes:$('creator-fabric-name').value.trim()},sketch=await exportSketch();if(attempt!==conceptVersion)return;const body=new FormData();body.append('image',sketch,'outfit-sketch.png');body.append('consent','true');body.append('details',JSON.stringify(details));const response=await fetch('/api/house/outfit-preview',{method:'POST',credentials:'same-origin',body,signal:controller.signal});const data=await response.json().catch(()=>({}));if(attempt!==conceptVersion)return;if(!response.ok){if(response.status===401||response.status===403)$('creator-concept-signin').hidden=false;throw Error(data.error?.message||'The concept preview is unavailable. Your sketch is unchanged.');}if(typeof data.image!=='string'||!data.image.startsWith('data:image/webp;base64,'))throw Error('The preview could not be opened. Please try again.');$('creator-concept-image').src=data.image;$('creator-concept-image').hidden=false;$('creator-concept-download').href=data.image;$('creator-concept-download').hidden=false;status.textContent=data.disclaimer||'AI concept only; garment details and fit may change.';}
  catch(error){if(attempt===conceptVersion)status.textContent=timedOut?'The preview took too long. Your sketch is unchanged; try again later.':error.message;}
  finally{clearTimeout(timer);if(conceptController===controller)conceptController=null;button.disabled=false;if(attempt===conceptVersion)$('creator-concept-cancel').hidden=true;}
 });
 form.addEventListener('reset',()=>{invalidateConcept();active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;});render();checkpoint();
})();
