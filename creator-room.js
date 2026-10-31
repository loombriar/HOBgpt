(()=>{'use strict';
 const root=document.getElementById('creator-room');if(!root)return;
 const $=id=>document.getElementById(id),form=$('design-project-form');
 const controls=['creator-template','creator-neckline','creator-sleeves','creator-length','creator-color','creator-secondary-color','creator-print','creator-print-scale','creator-waist-detail','creator-fabric-finish','creator-offset-x','creator-offset-y','creator-scale','creator-opacity'];
 let avatarData='',avatarVersion=0,conceptVersion=0,conceptController=null;
 function invalidateConcept(){const hadPreview=conceptController||!$('creator-concept-image').hidden;conceptVersion++;conceptController?.abort();conceptController=null;$('creator-concept-consent').checked=false;$('creator-concept-image').hidden=true;$('creator-concept-image').removeAttribute('src');$('creator-concept-download').hidden=true;$('creator-concept-download').removeAttribute('href');$('creator-concept-cancel').hidden=true;if(hadPreview)$('creator-concept-status').textContent='Design changed. Generate a fresh concept when ready.';}
 const position=()=>({x:Number($('creator-offset-x').value),y:Number($('creator-offset-y').value),scale:Number($('creator-scale').value)/100,opacity:Number($('creator-opacity').value)/100});
 const resetPosition=()=>{for(const [id,value]of [['creator-offset-x',0],['creator-offset-y',0],['creator-scale',100],['creator-opacity',100]])$(id).value=value;};
 function invalidate(message='Design changed. Add the updated template to your brief before saving.'){if(active){active=false;$('creator-include-preview').checked=false;$('creator-include-preview').disabled=true;$('creator-status').textContent=message;}}
 function garmentPaths(sleeves='Short'){
  // Symmetric flat drafting: shaped shoulder, true underarm and a defined waist.
  const left=sleeves==='Sleeveless'?'L116 81 Q112 104 120 121':sleeves==='Long'?'L110 81 Q102 85 100 99 L77 203 L92 207 L115 123':'L110 81 Q103 84 100 94 L88 125 L105 133 L115 112';
  const right=sleeves==='Sleeveless'?'Q188 104 184 81 L166 75':sleeves==='Long'?'L208 207 L223 203 L200 99 Q198 85 190 81 L166 75':'L195 133 L212 125 L200 94 Q197 84 190 81 L166 75';
  const start='M134 75 '+left+' Q116 151 124 190 ',end=' Q184 151 '+(sleeves==='Sleeveless'?'180 121 ':sleeves==='Long'?'185 123 ':'185 112 ')+right+' Q150 97 134 75 Z';
  const top=start+'Q150 193 176 190'+end;
  return {
   'A-line':start+'C118 230 96 306 85 355 Q150 366 215 355 C204 306 182 230 176 190'+end,
   'Fitted':start+'C112 215 112 235 117 255 L123 357 Q150 362 177 357 L183 255 C188 235 188 215 176 190'+end,
   'Full skirt':start+'C106 225 77 302 54 348 Q150 380 246 348 C223 302 194 225 176 190'+end,
   'Jumpsuit':start+'C112 215 111 237 114 261 L111 357 Q128 361 143 357 L147 253 Q150 247 153 253 L157 357 Q172 361 189 357 L186 261 C189 237 188 215 176 190'+end,
   'Top & trousers':top+' M124 201 Q150 204 176 201 C189 222 188 245 186 267 L190 357 Q173 362 157 357 L153 263 Q150 255 147 263 L143 357 Q127 362 110 357 L114 267 C112 245 111 222 124 201 Z',
   'Top & skirt':top+' M124 202 Q150 205 176 202 C186 244 207 311 216 355 Q150 368 84 355 C93 311 114 244 124 202 Z'
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
 function values(){return {template:$('creator-template').value,neckline:$('creator-neckline').value,sleeves:$('creator-sleeves').value,length:$('creator-length').value,color:$('creator-color').value,secondary:$('creator-secondary-color').value,print:$('creator-print').value,printScale:Number($('creator-print-scale').value),waistDetail:$('creator-waist-detail').value,fabricFinish:$('creator-fabric-finish').value};}
 function render(){
  invalidateConcept();
  const v=values(),pos=position(),svg=$('creator-preview');svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,val]of Object.entries(attrs))n.setAttribute(k,String(val));parent.append(n);return n;};
  add('rect',{x:0,y:0,width:300,height:430,fill:'url(#creator-studio-paper)'});
  add('path',{d:'M22 32 H42 M22 32 V52 M278 32 H258 M278 32 V52 M22 390 H42 M22 390 V370 M278 390 H258 M278 390 V370',stroke:'#c9c1b4','stroke-width':.5,fill:'none'});
  if(avatarData)add('image',{href:avatarData,x:0,y:0,width:300,height:400,preserveAspectRatio:'xMidYMid meet','data-avatar-reference':'true'});
  const height=v.length==='Mini'?.4:v.length==='Midi'?.72:1;
  const shapeForLength=d=>d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,(_,x,y)=>x+' '+(Number(y)>195?195+(Number(y)-195)*height:y));
  const silhouette=shapeForLength(garmentPaths(v.sleeves)[v.template]);
  const outer=add('g',{transform:`translate(${pos.x} ${pos.y}) translate(150 195) scale(${pos.scale}) translate(-150 -195)`,opacity:pos.opacity});
  const group=add('g',{},outer);
  const neckline=v.neckline==='V-neck'?'M134 75 L150 110 L166 75 Z':v.neckline==='Square'?'M134 75 L134 101 Q150 103 166 101 L166 75 Z':'M134 75 Q150 103 166 75 Z';
  const defs=add('defs',{});
  // A neutral studio surface and soft cloth volumes, still a concept drawing.
  const paper=add('radialGradient',{id:'creator-studio-paper',cx:'38%',cy:'28%',r:'85%'},defs);
  for(const [offset,color]of [['0%','#fffefa'],['70%','#f5f0e7'],['100%','#eae3d8']])add('stop',{offset,'stop-color':color},paper);
  const shadow=add('filter',{id:'creator-soft-shadow',x:'-25%',y:'-15%',width:'150%',height:'145%'},defs);
  add('feGaussianBlur',{stdDeviation:3},shadow);
  const foldLight=add('linearGradient',{id:'creator-fold-light',x1:'0%',x2:'100%',y1:'0%',y2:'0%'},defs);
  for(const [offset,opacity]of [['0%',0],['30%',.08],['55%',.42],['78%',.12],['100%',0]])add('stop',{offset,'stop-color':'#fff','stop-opacity':opacity},foldLight);
  const foldShade=add('linearGradient',{id:'creator-fold-shade',x1:'0%',x2:'100%',y1:'0%',y2:'0%'},defs);
  for(const [offset,opacity]of [['0%',0],['44%',.19],['66%',.3],['100%',0]])add('stop',{offset,'stop-color':'#201c26','stop-opacity':opacity},foldShade);

  const base=add('linearGradient',{id:'creator-garment-base',x1:'0%',y1:'0%',x2:'100%',y2:'100%'},defs);
  add('stop',{offset:'0%','stop-color':'#ffffff','stop-opacity':.35},base);
  add('stop',{offset:'48%','stop-color':'#ffffff','stop-opacity':0},base);
  add('stop',{offset:'100%','stop-color':'#292722','stop-opacity':.32},base);
  const sheen=add('linearGradient',{id:'creator-garment-sheen',x1:'0%',y1:'0%',x2:'100%',y2:'0%'},defs);
  add('stop',{offset:'0%','stop-color':'#fff','stop-opacity':0},sheen);
  add('stop',{offset:'42%','stop-color':'#fff','stop-opacity':.2},sheen);
  add('stop',{offset:'58%','stop-color':'#fff','stop-opacity':.04},sheen);
  add('stop',{offset:'100%','stop-color':'#fff','stop-opacity':0},sheen);
  const weave=add('pattern',{id:'creator-garment-weave',width:3,height:3,patternUnits:'userSpaceOnUse'},defs);
  add('path',{d:'M0 3L3 0',fill:'none',stroke:'#fff','stroke-opacity':.09,'stroke-width':.3},weave);
  const mask=add('mask',{id:'creator-garment-cutouts',maskUnits:'userSpaceOnUse',x:0,y:0,width:300,height:430},defs);add('rect',{x:0,y:0,width:300,height:430,fill:'white'},mask);
  add('path',{d:neckline,fill:'black'},mask);

  const fill=(id,color)=>{if(v.print==='Solid')return color;const pattern=add('pattern',{id,width:v.printScale,height:v.printScale,patternUnits:'userSpaceOnUse'},defs);add('rect',{width:v.printScale,height:v.printScale,fill:color},pattern);if(v.print==='Polka dots')add('circle',{cx:v.printScale/2,cy:v.printScale/2,r:v.printScale/6,fill:'#292722','fill-opacity':.45},pattern);else add('path',{d:`M0 0 L0 ${v.printScale}`,'stroke-width':v.printScale/3,stroke:'#292722','stroke-opacity':.4},pattern);return `url(#${id})`;};
  const topFill=fill('creator-top-print',v.color),bottomFill=fill('creator-bottom-print',v.secondary);
  const clip=add('clipPath',{id:'creator-bottom-clip'},defs);add('rect',{x:0,y:195,width:300,height:235},clip);
  if(!avatarData)add('path',{d:silhouette,fill:'#302638','fill-opacity':.2,transform:'translate(3 6)',filter:'url(#creator-soft-shadow)','data-garment-shadow':'true'},group);
  const garment=add('g',{mask:'url(#creator-garment-cutouts)'},group);
  add('path',{d:silhouette,fill:topFill,stroke:'#39333a','stroke-width':.85},garment);
  add('path',{d:silhouette,fill:bottomFill,stroke:'#39333a','stroke-width':.85,'clip-path':'url(#creator-bottom-clip)'},garment);
  const garmentClip=add('clipPath',{id:'creator-garment-detail-clip'},defs);add('path',{d:silhouette},garmentClip);
  // Preserve the configured solid/printed colors while adding fabric depth.
  const surface=add('g',{'clip-path':'url(#creator-garment-detail-clip)'},garment);
  add('path',{d:silhouette,fill:'url(#creator-garment-base)',stroke:'none'},surface);
  add('path',{d:silhouette,fill:'url(#creator-garment-weave)','fill-opacity':v.fabricFinish==='Textured'?1:v.fabricFinish==='Satin'?.12:.55,stroke:'none'},surface);
  add('path',{d:silhouette,fill:'url(#creator-garment-sheen)','fill-opacity':v.fabricFinish==='Satin'?1:v.fabricFinish==='Textured'?.25:.75,stroke:'none'},surface);
  // Directional folds and edge highlights are clipped to the garment silhouette.
  const drape=add('g',{'clip-path':'url(#creator-garment-detail-clip)'},garment);
  const drapeShade=add('linearGradient',{id:'creator-drape-shade',x1:'0%',y1:'0%',x2:'100%',y2:'0%'},defs);
  for(const [offset,opacity] of [['0%',.15],['24%',0],['49%',.11],['75%',0],['100%',.17]])add('stop',{offset,'stop-color':'#292722','stop-opacity':opacity},drapeShade);
  add('path',{d:silhouette,fill:'url(#creator-drape-shade)',stroke:'none'},drape);
  const cloth=add('g',{'clip-path':'url(#creator-garment-detail-clip)','data-cloth-volumes':'true'},garment);
  const clothPath=(d,fill,opacity=1)=>add('path',{d:shapeForLength(d),fill,opacity,stroke:'none'},cloth);
  // Shaped side panels give the bodice and sleeves depth without a mannequin.
  clothPath('M109 81 Q124 115 127 145 Q123 171 129 194 L116 204 Q103 151 109 81 Z','url(#creator-fold-shade)',.85);
  clothPath('M191 81 Q176 115 173 145 Q177 171 171 194 L184 204 Q197 151 191 81 Z','url(#creator-fold-shade)',.85);
  clothPath('M132 95 Q146 112 147 142 L143 190 L130 190 Q140 145 132 95 Z','url(#creator-fold-light)',.8);
  clothPath('M153 100 Q170 113 169 147 L174 190 L157 190 Q165 145 153 100 Z','url(#creator-fold-light)',.65);
  if(v.sleeves!=='Sleeveless'){
   clothPath(v.sleeves==='Long'?'M108 88 Q101 140 83 202 L90 203 Q111 145 115 98 Z':'M105 86 Q101 108 92 123 L102 128 Q114 108 114 96 Z','url(#creator-fold-light)',.9);
   clothPath(v.sleeves==='Long'?'M192 88 Q199 140 217 202 L210 203 Q189 145 185 98 Z':'M195 86 Q199 108 208 123 L198 128 Q186 108 186 96 Z','url(#creator-fold-shade)',.7);
  }
  const legged=v.template==='Jumpsuit'||v.template==='Top & trousers';
  if(legged){
   for(const [a,b,c]of [[126,120,138],[174,162,180]]){
    clothPath(`M${a-3} 204 Q${a-7} 251 ${b} 353 L${c} 353 Q${a+5} 265 ${a+3} 204 Z`,'url(#creator-fold-light)',.9);
    clothPath(`M${a+3} 207 Q${a+1} 260 ${c-3} 354 L${c+3} 354 Q${a+7} 263 ${a+7} 207 Z`,'url(#creator-fold-shade)',.65);
   }
  }else{
   const edge=v.template==='Full skirt'?[60,240]:v.template==='Fitted'?[124,176]:[87,213];
   const count=v.template==='Full skirt'?6:v.template==='Fitted'?3:4;
   for(let i=0;i<count;i++){
    const start=125+i*50/count,end=edge[0]+i*(edge[1]-edge[0])/count,width=(edge[1]-edge[0])/count;
    clothPath(`M${start} 196 Q${start-3} 245 ${end} 352 Q${end+width*.4} 359 ${end+width*.78} 354 Q${start+9} 248 ${start+7} 196 Z`,'url(#creator-fold-light)',.95);
    clothPath(`M${start+7} 199 Q${start+9} 251 ${end+width*.68} 354 L${end+width} 351 Q${start+16} 248 ${start+11} 199 Z`,'url(#creator-fold-shade)',.7);
   }
  }
  const details=add('g',{'clip-path':'url(#creator-garment-detail-clip)','stroke-linecap':'round','stroke-linejoin':'round'},garment);
  const separates=v.template.startsWith('Top &');
  const seam=separates?'M124 185 Q150 188 176 185 M124 207 Q150 210 176 207':'M124 190 Q150 193 176 190';
  add('path',{d:shapeForLength(seam),fill:'none',stroke:'#343830','stroke-opacity':.42,'stroke-width':.65},details);
  const legs=v.template==='Jumpsuit'||v.template==='Top & trousers';
  if(legs)add('path',{d:shapeForLength('M127 211 Q124 225 116 233 M173 211 Q176 225 184 233 M150 207 L150 244'),fill:'none',stroke:'#343830','stroke-width':.8},details);
  add('path',{d:'M134 145 L137 183 L140 145 M160 145 L163 183 L166 145',fill:'none',stroke:'#343830','stroke-opacity':.22,'stroke-width':.5},details);
  if(!legs){
   const folds=v.template==='Fitted'?['M128 210 Q118 278 126 345','M172 210 Q182 278 174 345']:['M124 211 Q112 278 103 348','M141 212 Q134 284 132 355','M159 212 Q166 284 168 355','M176 211 Q188 278 197 348'];
   folds.forEach((d,index)=>add('path',{d:shapeForLength(d),fill:'none',stroke:'#292722','stroke-opacity':index%2?.24:.14,'stroke-width':index%2?1.1:.8},details));
  }
  add('path',{d:'M115 123 Q113 158 122 188 M185 123 Q187 158 178 188',fill:'none',stroke:'#fff','stroke-opacity':.18,'stroke-width':1},details);
  // Keep tailoring marks within the silhouette and adjust them to skirt length.
  if(!legs){
   const pleats=v.template==='Full skirt'?['M124 203 Q106 261 83 337','M142 204 Q134 272 128 348','M158 204 Q166 272 172 348','M176 203 Q194 261 217 337']:['M125 207 Q120 260 116 334','M175 207 Q180 260 184 334'];
   pleats.forEach((d,i)=>add('path',{d:shapeForLength(d),fill:'none',stroke:i%2?'#fff':'#292722','stroke-opacity':i%2?.19:.12,'stroke-width':i%2?1.5:1.1},details));
  }
  const hem=legs?'M111 351 Q128 355 143 351 M157 351 Q173 355 189 351':v.template==='Fitted'?'M123 351 Q150 356 177 351':v.template==='Full skirt'?'M57 343 Q150 373 243 343':'M87 350 Q150 361 213 350';
  add('path',{d:shapeForLength(hem),fill:'none',stroke:'#343830','stroke-opacity':.22,'stroke-width':.5},details);
  if(v.sleeves==='Short')add('path',{d:'M91 121 L106 128 M194 128 L209 121',fill:'none',stroke:'#343830','stroke-opacity':.5,'stroke-width':.65},details);
  // Construction accents follow sleeve selection without changing the editable silhouette.
  if(v.sleeves==='Long'){
   add('path',{d:'M78 196 Q85 200 93 200 M207 200 Q215 200 222 196',fill:'none',stroke:'#292722','stroke-opacity':.55,'stroke-width':.8},details);
   add('path',{d:'M82 189 Q86 192 95 193 M205 193 Q214 192 218 189',fill:'none',stroke:'#fff','stroke-opacity':.28,'stroke-width':.7},details);
  }else if(v.sleeves==='Sleeveless'){
   add('path',{d:'M116 84 Q112 104 120 121 M184 84 Q188 104 180 121',fill:'none',stroke:'#fff','stroke-opacity':.3,'stroke-width':.9},details);
  }
  // A restrained neckline facing adds depth while preserving the neckline cutout.
  const facing=v.neckline==='V-neck'?'M138 79 L150 103 L162 79':v.neckline==='Square'?'M138 79 L138 96 Q150 98 162 96 L162 79':'M138 79 Q150 96 162 79';
  add('path',{d:facing,fill:'none',stroke:'#fff','stroke-opacity':.42,'stroke-width':.8,'stroke-linecap':'round'},details);
  if(v.waistDetail!=='None'){
   const beltColor=v.waistDetail==='Contrast belt'?v.secondary:v.color;
   add('path',{d:'M123 185 Q150 188 177 185 L177 195 Q150 198 123 195 Z',fill:beltColor,stroke:'#39333a','stroke-width':1},details);
   add('rect',{x:145,y:185,width:10,height:11,rx:1,fill:'none',stroke:'#d8c19a','stroke-width':1.7},details);
  }
  add('path',{d:neckline,fill:'none',stroke:'#39333a','stroke-width':.85,'stroke-linecap':'round'},group);
  const viewLabel=add('text',{x:150,y:30,'text-anchor':'middle',fill:'#746d61','font-size':9,'font-family':'sans-serif','letter-spacing':1.5});viewLabel.textContent='FRONT · TECHNICAL SKETCH';
  const title=add('text',{x:150,y:418,'text-anchor':'middle',fill:'#292722','font-size':13,'font-family':'Georgia,serif','letter-spacing':'.5'});title.textContent=v.template+' · '+v.length;
  $('creator-preview-description').textContent=`${v.template} template, ${v.neckline}, ${v.sleeves.toLowerCase()} sleeves, ${v.length.toLowerCase()} length.${avatarData?' Shown on your uploaded avatar.':''} ${v.print==='Solid'?'':' '+v.print+' print.'} ${v.fabricFinish.toLowerCase()} appearance; ${v.waistDetail.toLowerCase()}. Technical concept sketch; confirm construction and measurements with your maker.`;
  for(const button of root.querySelectorAll('.creator-palette'))button.setAttribute('aria-pressed',String(button.dataset.top===v.color&&button.dataset.bottom===v.secondary));
  for(const button of root.querySelectorAll('[data-creator-template]'))button.setAttribute('aria-pressed',String(button.dataset.creatorTemplate===v.template));
 }
 const chooser=document.createElement('div');chooser.className='creator-template-grid';chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Choose a silhouette');
 for(const [name,path]of Object.entries(paths)){const button=document.createElement('button');button.type='button';button.dataset.creatorTemplate=name;button.setAttribute('aria-label',name);button.className='creator-template-card';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','45 60 210 320');icon.setAttribute('aria-hidden','true');const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d',path);const tileDefs=document.createElementNS(icon.namespaceURI,'defs'),gradient=document.createElementNS(icon.namespaceURI,'linearGradient'),gradientId='creator-tile-'+name.toLowerCase().replace(/[^a-z]+/g,'-');gradient.id=gradientId;gradient.setAttribute('x1','0%');gradient.setAttribute('x2','100%');gradient.setAttribute('y2','70%');for(const [offset,color]of [['0%','#dceee6'],['45%','#b7d9cc'],['100%','#6b9b87']]){const stop=document.createElementNS(icon.namespaceURI,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);gradient.append(stop);}tileDefs.append(gradient);shape.setAttribute('fill','url(#'+gradientId+')');shape.setAttribute('stroke','#484047');shape.setAttribute('stroke-width','1.2');icon.append(tileDefs,shape);const label=document.createElement('span');label.textContent=name;button.append(icon,label);button.addEventListener('click',()=>{checkpoint();$('creator-template').value=name;invalidate();render();checkpoint();});chooser.append(button);}
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
 function brief(){const v=values(),link=fabric();return `Template design: ${v.template}\nNeckline: ${v.neckline}\nSleeves: ${v.sleeves}\nLength: ${v.length}\nPreview color: ${v.color}\nBottom color: ${v.secondary}\nPrint: ${v.print}${v.print==='Solid'?'':' (repeat '+v.printScale+')'}\nWaist detail: ${v.waistDetail}\nFabric appearance: ${v.fabricFinish} (sketch reference only)${avatarData?'\nAvatar: user-provided visual reference only; does not establish garment size or fit.':''}\nFabric choice: ${$('creator-fabric-name').value.trim()||'To discuss with maker'}${link?'\nFabric product link: '+link:''}\nFabric quantity, suitability, price and availability need maker/store confirmation. This template is a concept, not a sewing pattern or guaranteed fit.`;}
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
