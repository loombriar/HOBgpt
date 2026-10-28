(()=>{'use strict';
 const root=document.getElementById('creator-room');if(!root)return;
 const $=id=>document.getElementById(id),form=$('design-project-form');
 const controls=['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color','creator-offset-x','creator-offset-y','creator-scale','creator-opacity'];
 let avatarData='',avatarVersion=0;
 const position=()=>({x:Number($('creator-offset-x').value),y:Number($('creator-offset-y').value),scale:Number($('creator-scale').value)/100,opacity:Number($('creator-opacity').value)/100});
 const resetPosition=()=>{for(const [id,value]of [['creator-offset-x',0],['creator-offset-y',0],['creator-scale',100],['creator-opacity',100]])$(id).value=value;};
 function invalidate(message='Design changed. Add the updated template to your brief before saving.'){if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent=message;}}
 const paths={
  'A-line':'M108 80 L92 98 L79 158 L96 164 L109 124 L115 195 L65 355 Q150 380 235 355 L185 195 L191 124 L204 164 L221 158 L208 98 L192 80 L170 72 Q150 94 130 72 Z',
  'Fitted':'M108 80 L92 98 L79 158 L96 164 L109 124 L118 195 Q98 240 112 355 L188 355 Q202 240 182 195 L191 124 L204 164 L221 158 L208 98 L192 80 L170 72 Q150 94 130 72 Z',
  'Full skirt':'M108 80 L92 98 L79 158 L96 164 L109 124 L116 195 L40 350 Q150 390 260 350 L184 195 L191 124 L204 164 L221 158 L208 98 L192 80 L170 72 Q150 94 130 72 Z',
  'Top & skirt':'M108 80 L92 98 L79 158 L96 164 L109 124 L113 190 L187 190 L191 124 L204 164 L221 158 L208 98 L192 80 L170 72 Q150 94 130 72 Z M115 204 L72 355 Q150 375 228 355 L185 204 Z'
 };
 let active=false;
 function values(){return {template:$('creator-template').value,neckline:$('creator-neckline').value,sleeves:$('creator-sleeves').value,length:$('creator-length').value,color:$('creator-color').value};}
 function render(){
  const v=values(),pos=position(),svg=$('creator-preview');svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,val]of Object.entries(attrs))n.setAttribute(k,String(val));parent.append(n);return n;};
  add('rect',{x:0,y:0,width:300,height:430,fill:'#faf7f0'});
  if(avatarData)add('image',{href:avatarData,x:0,y:0,width:300,height:400,preserveAspectRatio:'xMidYMid meet','data-avatar-reference':'true'});
  const height=v.length==='Mini'?.65:v.length==='Midi'?.83:1;
  const outer=add('g',{transform:`translate(${pos.x} ${pos.y}) translate(150 195) scale(${pos.scale}) translate(-150 -195)`,opacity:pos.opacity});
  const group=add('g',{transform:`translate(0 ${72*(1-height)}) scale(1 ${height})`},outer);
  const neckline=v.neckline==='V-neck'?'M130 72 L150 118 L170 72 Z':v.neckline==='Square'?'M130 72 L130 104 L170 104 L170 72 Z':'M130 72 Q150 105 170 72 Z';
  const defs=add('defs',{});
  const base=add('linearGradient',{id:'creator-garment-base',x1:'0%',y1:'0%',x2:'100%',y2:'100%'},defs);
  add('stop',{offset:'0%', 'stop-color':v.color, 'stop-opacity':.98},base);add('stop',{offset:'48%', 'stop-color':v.color, 'stop-opacity':.9},base);add('stop',{offset:'100%', 'stop-color':'#292722', 'stop-opacity':.3},base);
  const sheen=add('linearGradient',{id:'creator-garment-sheen',x1:'0%',y1:'0%',x2:'100%',y2:'0%'},defs);
  add('stop',{offset:'0%', 'stop-color':'#fff', 'stop-opacity':0},sheen);add('stop',{offset:'42%', 'stop-color':'#fff', 'stop-opacity':.2},sheen);add('stop',{offset:'58%', 'stop-color':'#fff', 'stop-opacity':.04},sheen);add('stop',{offset:'100%', 'stop-color':'#fff', 'stop-opacity':0},sheen);
  const weave=add('pattern',{id:'creator-garment-weave',width:8,height:8,patternUnits:'userSpaceOnUse'},defs);add('path',{d:'M0 2H8M0 6H8M2 0V8M6 0V8',stroke:'#fff','stroke-opacity':.16,'stroke-width':.45},weave);
  const mask=add('mask',{id:'creator-garment-cutouts',maskUnits:'userSpaceOnUse',x:0,y:0,width:300,height:430},defs);add('rect',{x:0,y:0,width:300,height:430,fill:'white'},mask);
  add('path',{d:neckline,fill:'black'},mask);
  if(v.sleeves==='Sleeveless')for(const d of ['M92 98 L79 158 L96 164 L109 124 L108 80 Z','M208 98 L221 158 L204 164 L191 124 L192 80 Z'])add('path',{d,fill:'black'},mask);
  const silhouette=paths[v.template];
  const garment=add('g',{mask:'url(#creator-garment-cutouts)'},group);
  add('path',{d:silhouette,fill:'url(#creator-garment-base)',stroke:'#292722','stroke-width':3,'stroke-linejoin':'round'},garment);
  if(v.sleeves==='Long')for(const d of ['M92 98 L79 158 L58 235 L79 241 L109 124','M208 98 L221 158 L242 235 L221 241 L191 124'])add('path',{d,fill:'url(#creator-garment-base)',stroke:'#292722','stroke-width':3,'stroke-linejoin':'round'},garment);
  // A restrained textile overlay makes the chosen color feel like fabric without
  // pretending the preview is a photograph or a fit calculation.
  add('path',{d:silhouette,fill:'url(#creator-garment-weave)','fill-opacity':.55,stroke:'none'},garment);
  add('path',{d:silhouette,fill:'url(#creator-garment-sheen)','fill-opacity':.75,stroke:'none'},garment);
  const detail=add('g',{fill:'none','stroke-linecap':'round','stroke-linejoin':'round'},group);
  add('path',{d:neckline,stroke:'#292722','stroke-width':2},detail);
  const waist=v.template==='Top & skirt'?'M113 190 Q150 198 187 190':'M115 194 Q150 202 185 194';
  add('path',{d:waist,stroke:'#292722','stroke-opacity':.58,'stroke-width':1.2,'stroke-dasharray':'3 3'},detail);
  const folds=v.template==='Fitted'?['M128 210 Q118 278 126 345','M172 210 Q182 278 174 345']:['M124 211 Q112 278 103 348','M141 212 Q134 284 132 355','M159 212 Q166 284 168 355','M176 211 Q188 278 197 348'];
  folds.forEach((d,index)=>add('path',{d,stroke:'#292722','stroke-opacity':index%2?.24:.14,'stroke-width':index%2?1.1:.8},detail));
  if(v.sleeves!=='Sleeveless')for(const d of ['M80 157 L96 163','M204 163 L220 157'])add('path',{d,stroke:'#292722','stroke-opacity':.52,'stroke-width':1.1},detail);
  add('path',{d:'M109 124 Q104 158 112 190 M191 124 Q196 158 188 190',stroke:'#fff','stroke-opacity':.2,'stroke-width':1},detail);
  const title=add('text',{x:150,y:418,'text-anchor':'middle',fill:'#292722','font-size':13,'font-family':'Georgia,serif','letter-spacing':'.4'});title.textContent=v.template+' · '+v.length;
  const note=add('text',{x:150,y:32,'text-anchor':'middle',fill:'#746d61','font-size':8,'font-family':'sans-serif','letter-spacing':1.4});note.textContent='FRONT · FABRIC STUDY';
  $('creator-preview-description').textContent=`${v.template} template, ${v.neckline}, ${v.sleeves.toLowerCase()} sleeves, ${v.length.toLowerCase()} length.${avatarData?' Shown on your uploaded avatar.':''} Textured concept illustration only; confirm construction and measurements with your maker.`;
 }
 const looks={everyday:['A-line','Scoop','Short','Midi','#b7d9cc'],evening:['Fitted','V-neck','Sleeveless','Maxi','#775166'],separates:['Top & skirt','Square','Sleeveless','Mini','#b8bdd9']};
 for(const button of root.querySelectorAll('[data-creator-look]'))button.addEventListener('click',()=>{const look=looks[button.dataset.creatorLook];['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color'].forEach((id,index)=>{$(id).value=look[index];});invalidate();render();$('creator-status').textContent=button.querySelector('strong').textContent+' loaded. Make it your own with the details below.';});
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
 function brief(){const v=values(),link=fabric();return `Template design: ${v.template}\nNeckline: ${v.neckline}\nSleeves: ${v.sleeves}\nLength: ${v.length}\nPreview color: ${v.color}${avatarData?'\nAvatar: user-provided visual reference only; does not establish garment size or fit.':''}\nFabric choice: ${$('creator-fabric-name').value.trim()||'To discuss with maker'}${link?'\nFabric product link: '+link:''}\nFabric quantity, suitability, price and availability need maker/store confirmation. This template is a concept, not a sewing pattern or guaranteed fit.`;}
 $('creator-use-template').addEventListener('click',()=>{const status=$('creator-status');try{const text=brief(),field=$('project-details'),old=field.value.replace(/\n?\[Back Stage template\][\s\S]*?\[End template\]/g,'').trim();const combined=(old?old+'\n\n':'')+'[Back Stage template]\n'+text+'\n[End template]';if(combined.length>field.maxLength)throw Error('Shorten your notes or fabric description so your brief fits within 2,000 characters.');field.value=combined;active=true;$('creator-include-preview').disabled=false;if(!$('project-title').value)$('project-title').value=values().template+' outfit concept';status.textContent='Template added to your brief below. Save it as a private project when ready.';$('new-project').scrollIntoView({block:'start',behavior:'smooth'});}catch(e){status.textContent=e.message;}});
 for(const id of controls)$(id).addEventListener('input',()=>{render();if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent='Design changed. Add the updated template to your brief before saving.';}});
 for(const id of ['creator-fabric-name','creator-fabric-url'])$(id).addEventListener('input',()=>{if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent='Fabric changed. Add the updated template to your brief before saving.';}});
 window.houseCreatorPreview=async()=>{if(!active||!$('creator-include-preview').checked)return null;const source=new XMLSerializer().serializeToString($('creator-preview'));const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=600;canvas.height=860;canvas.getContext('2d').drawImage(image,0,0,600,860);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('The sketch could not be created. Your written brief can still be saved.');return blob;}finally{URL.revokeObjectURL(url);}};
 form.addEventListener('reset',()=>{active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;});render();
})();
