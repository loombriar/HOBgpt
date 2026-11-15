(() => {
 'use strict';
 const canvas=document.getElementById('creator-3d-canvas');if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const $=id=>document.getElementById(id),panel=$('creator-3d-panel'),sketch=$('creator-preview');
 let yaw=.16,pitch=.025,zoom=1,drag=null,frame=0,technical=false,mesh=[],seams=[];
 const value=(id,fallback)=>$(id)?.value||fallback;
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const minus=(a,b)=>a.map((v,i)=>v-b[i]);
 function triangle(a,b,c,color){mesh.push({points:[a,b,c],color});}
 function connect(a,b,color){for(let j=0;j<a.length;j++){const k=(j+1)%a.length;triangle(a[j],b[j],a[k],color);triangle(a[k],b[j],b[k],color);}}
 function ring(rx,rz,y,fold=0){return Array.from({length:96},(_,j)=>{const t=j/96*Math.PI*2,r=1+fold*(.72*Math.cos(t*8+.2)+.2*Math.cos(t*13-.4)+.08*Math.sin(t*5));return [rx*Math.cos(t)*r,typeof y==='function'?y(t):y,rz*Math.sin(t)*r];});}
 function tube(start,end,radius,color){const axis=minus(end,start),length=Math.hypot(...axis),u=axis.map(v=>v/length),b=[0,0,1],v=cross(u,b);let prior;
  for(let i=0;i<=12;i++){const f=i/12,center=start.map((x,k)=>x+axis[k]*f),r=radius*(1-.18*f);const row=Array.from({length:32},(_,j)=>{const t=j/32*Math.PI*2;return center.map((x,k)=>x+r*(Math.cos(t)*v[k]+Math.sin(t)*b[k]));});if(prior)connect(prior,row,color);prior=row;}
  seams.push({points:prior.concat([prior[0]]),color:'#655154'});
 }
 function build(){mesh=[];seams=[];const color=value('creator-color','#b7d9cc'),finish=value('creator-fabric-finish','Matte'),length=value('creator-length','Midi'),sleeves=value('creator-sleeves','Short'),neck=value('creator-neckline','Scoop'),template=value('creator-template','A-line');
  const separated=template.startsWith('Top &');
  const bottomColor=value('creator-secondary-color',color);
  // A real neck opening, sloped shoulders and shaped chest replace the open cylinder.
  const topStyle=value('creator-top-style','Classic'),topHem=separated?(topStyle==='Cropped'?.16:topStyle==='Longline'?-.24:0):0;
  const neckDrop=t=>{const front=Math.max(0,-Math.sin(t));return neck==='V-neck'?.29*Math.pow(front,5):neck==='Square'?.2*Math.min(1,front*2.8):.16*front*front;};
  const profile=f=>{
   const stops=[[0,.19,.125],[.12,.42,.19],[.25,.48,.255],[.43,.435,.25],[.72,.36,.205],[1,.35,.18]];
   let k=1;while(k<stops.length-1&&f>stops[k][0])k++;
   const [fa,xa,za]=stops[k-1],[fb,xb,zb]=stops[k],u=(f-fa)/(fb-fa),s=u*u*(3-2*u);
   return [xa+(xb-xa)*s,za+(zb-za)*s];
  };
  const bodicePoint=(f,t)=>{
   const [rx,rz]=profile(f),front=Math.max(0,-Math.sin(t));
   const chest=.035*Math.exp(-Math.pow((f-.3)/.2,2))*front;
   return [rx*Math.cos(t),.96*(1-f)+topHem*f-neckDrop(t)*Math.pow(1-f,7),rz*Math.sin(t)-chest];
  };
  let prior,neckRow;
  for(let i=0;i<=40;i++){
   const f=i/40,row=Array.from({length:96},(_,j)=>bodicePoint(f,j/96*Math.PI*2));
   if(prior)connect(prior,row,color);else{neckRow=row;seams.push({points:row.concat([row[0]]),color:'#736b60'});}prior=row;
  }
  const lining=hex=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*.64).toString(16).padStart(2,'0')).join('');
  connect(neckRow,neckRow.map(p=>[p[0]*.94,p[1]-.022,p[2]*.94]),lining(color));
  seams.push({points:neckRow.map(p=>[p[0]*1.035,p[1]-.02,p[2]*1.035]),color:'#a29784',subtle:true});
  const skirtLength=length==='Mini'?.82:length==='Maxi'?2.08:1.58;
  const legged=template==='Jumpsuit'||template==='Top & trousers';
  const full=template==='Full skirt'||template==='Top & skirt';
  const aline=template==='A-line';
  const bottomStyle=value('creator-bottom-style','Classic');
  const fitted=template==='Fitted'||(separated&&bottomStyle==='Straight');
  const wide=separated&&bottomStyle==='Flared';
  let waist;
  if(legged){
   // Build a short hip section before splitting into legs so trousers and jumpsuits
   // read as one connected garment rather than two floating tubes.
   const waistRow=ring(.38,.19,.02),hipRow=ring(.42,.23,-.12);if(!separated)connect(prior,waistRow,bottomColor);connect(waistRow,hipRow,bottomColor);
   seams.push({points:waistRow.concat([waistRow[0]]),color:'#655154'});
   const leg=(cx,width)=>{let first,last;for(let i=0;i<=24;i++){const f=i/24,y=-.1-f*(skirtLength-.1),rx=width*(wide?1+.22*f:1-.18*f),rz=.2*(1-.18*f),lean=cx*(1+.08*f);const row=ring(rx,rz,y).map(p=>[p[0]+lean,p[1],p[2]]);if(first===undefined)first=row;if(last)connect(last,row,bottomColor);last=row;}seams.push({points:last.concat([last[0]]),color:'#756958'});return {first,last};};
   const left=leg(-.2,fitted?.2:wide?.32:.25),right=leg(.2,fitted?.2:wide?.32:.25);waist=waistRow;connect(hipRow,left.first,bottomColor);connect(hipRow,right.first,bottomColor);
  }else{
   for(let i=0;i<=38;i++){const f=i/38,flare=wide?.9:full?.76:fitted?.12:aline?.48:.43,base=.36+flare*Math.pow(f,full?.64:fitted?1.65:1.12),rx=base,rz=.165+(full?.38:fitted?.07:.27)*f,fold=(full?.052:fitted?.009:.042)*f;const row=ring(rx,rz,-f*skirtLength,fold);if(i===0)waist=row;if(i)connect(prior,row,bottomColor);prior=row;}
   seams.push({points:waist.concat([waist[0]]),color:'#655154'});seams.push({points:prior.concat([prior[0]]),color:'#756958'});
   const inner=prior.map(p=>[p[0]*.985,p[1]+.025,p[2]*.985]);connect(prior,inner,bottomColor);
   const flare=wide?.9:full?.76:fitted?.12:aline?.48:.43;for(const angle of [Math.PI*.25,Math.PI*.75,Math.PI*1.25,Math.PI*1.75]){const points=[];for(let i=0;i<=38;i++){const f=i/38,r=1+(full?.085:fitted?.012:.045)*f*(.72*Math.cos(angle*8+.2)+.2*Math.cos(angle*13-.4)+.08*Math.sin(angle*5));points.push([(.36+flare*Math.pow(f,full?.64:fitted?1.65:1.12))*Math.cos(angle)*r,-f*skirtLength,(.165+(full?.38:fitted?.07:.27)*f)*Math.sin(angle)*r]);}seams.push({points,color:'#766e66',subtle:true});}
  }
  // Princess seams follow the tailored chest and waist instead of hanging on a tube.
  for(const angle of [Math.PI*1.3,Math.PI*1.7,Math.PI*.5]){
   const points=[];for(let i=8;i<=40;i++)points.push(bodicePoint(i/40,angle));
   seams.push({points,color:'#6f7066',subtle:true});
  }
  if(sleeves!=='Sleeveless')for(const sign of [-1,1]){
   tube([sign*.37,.69,0],[sign*(sleeves==='Long'?.77:.64),sleeves==='Long'?-.12:.4,-.015],sleeves==='Long'?.14:.155,color);
  }
  canvas.dataset.bodice='tailored-neck-and-shoulders';
  canvas.dataset.topStyle=topStyle;
  const belt=value('creator-waist-detail','None');if(belt!=='None'||value('creator-accessory','None')==='Belt'){const c=belt==='Contrast belt'?value('creator-secondary-color','#775166'):color;connect(ring(.37,.18,.035),ring(.38,.185,-.05),c);}
  canvas.dataset.bottomStyle=bottomStyle;panel.setAttribute('aria-label','Interactive 3D '+template.toLowerCase());canvas.setAttribute('aria-label','Rotatable 3D '+template.toLowerCase()+'. Drag or use arrow keys to rotate; Home resets the view.');
  canvas.dataset.topColor=color;canvas.dataset.bottomColor=bottomColor;
  // Shared vertex normals keep cloth lighting continuous across triangle boundaries.
  const normals=new Map();
  for(const face of mesh){const [a,b,c]=face.points,n=cross(minus(b,a),minus(c,a));for(const p of face.points){const sum=normals.get(p)||[0,0,0];for(let i=0;i<3;i++)sum[i]+=n[i];normals.set(p,sum);}}
  for(const face of mesh)face.normals=face.points.map(p=>{const n=normals.get(p),length=Math.hypot(...n)||1;return n.map(v=>v/length);});
  canvas.dataset.lighting='smooth-cloth';
  canvas.dataset.meshTriangles=String(mesh.length);canvas.dataset.template=template;canvas.dataset.fabricFinish=finish;canvas.dataset.neckline=neck;canvas.dataset.length=length;canvas.dataset.sleeves=sleeves;
 }
 function rotate(p){const c=Math.cos(yaw),s=Math.sin(yaw),x=p[0]*c+p[2]*s,z=-p[0]*s+p[2]*c,cp=Math.cos(pitch),sp=Math.sin(pitch);return [x,p[1]*cp-z*sp,p[1]*sp+z*cp];}
 function project(p){const f=4.8/(4.8+p[2]),scale=150*zoom;return [300+p[0]*scale*f,270-p[1]*scale*f];}
 function paint(){frame=0;if(panel.hidden)return;ctx.clearRect(0,0,600,660);const bg=ctx.createLinearGradient(0,0,600,660);bg.addColorStop(0,'#f9f5ef');bg.addColorStop(1,'#e8dfd6');ctx.fillStyle=bg;ctx.fillRect(0,0,600,660);
  const floor=ctx.createRadialGradient(300,610,4,300,610,160*zoom);floor.addColorStop(0,'rgba(65,45,50,.18)');floor.addColorStop(1,'rgba(65,45,50,0)');ctx.fillStyle=floor;ctx.save();ctx.translate(0,526);ctx.scale(1,.14);ctx.fillRect(100,0,400,1200);ctx.restore();
  const faces=mesh.map(face=>{const points=face.points.map(rotate);return {...face,points,depth:points.reduce((sum,p)=>sum+p[2],0)/3};}).sort((a,b)=>b.depth-a.depth);
  const light=[-.45,.6,-.66],finish=value('creator-fabric-finish','Matte');
  for(const face of faces){
   const hex=face.color.replace('#',''),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)),points=face.points.map(project);
   const illumination=face.normals.map(normal=>{const n=rotate(normal),diffuse=Math.abs(n.reduce((sum,v,i)=>sum+v*light[i],0));return .48+.52*diffuse;});
   const order=[0,1,2].sort((a,b)=>illumination[a]-illumination[b]),low=order[0],high=order[2];
   const tone=shade=>{const spec=finish==='Satin'?Math.pow(shade,18)*58:Math.pow(shade,10)*10;return 'rgb('+rgb.map(v=>Math.min(255,Math.round(v*shade+spec))).join(',')+')';};
   let fill=tone(illumination[high]);
   if(Math.hypot(points[low][0]-points[high][0],points[low][1]-points[high][1])>.01){fill=ctx.createLinearGradient(...points[low],...points[high]);fill.addColorStop(0,tone(illumination[low]));fill.addColorStop(1,tone(illumination[high]));}
   ctx.fillStyle=fill;ctx.strokeStyle=fill;ctx.lineWidth=.4;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();
   // Fine crossed threads follow the projected cloth, rather than a flat screen overlay.
   if(finish==='Textured'){ctx.save();ctx.clip();ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo((points[1][0]+points[2][0])/2,(points[1][1]+points[2][1])/2);ctx.stroke();ctx.restore();}
  }
  // Draw only the front portions of seam lines, so back seams stay behind the cloth.
  for(const seam of seams){ctx.strokeStyle=seam.color;ctx.globalAlpha=seam.subtle?.22:.5;ctx.lineWidth=seam.subtle?.7:1;ctx.beginPath();let pen=false;for(const p of seam.points){const r=rotate(p),front=r[2]<.05;if(!front){pen=false;continue;}const [x,y]=project(r);if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;}ctx.stroke();}ctx.globalAlpha=1;
  ctx.fillStyle='#63515b';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(value('creator-template','OUTFIT').toUpperCase()+' · INTERACTIVE 3D STUDY',300,36);
  canvas.dataset.yaw=yaw.toFixed(3);canvas.dataset.pitch=pitch.toFixed(3);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
 function sync(){const active=Boolean(value('creator-template','A-line')),avatar=Boolean(sketch.querySelector('[data-avatar-reference]'));
  panel.hidden=!active||avatar||technical;sketch.toggleAttribute('hidden',active&&!avatar&&!technical);
  $('creator-3d-toggle').hidden=!active||avatar;$('creator-3d-toggle').textContent=technical?'Show 3D dress':'Show editable sketch';$('creator-3d-toggle').setAttribute('aria-pressed',String(technical));
  $('creator-3d-status').textContent=active?'Drag the '+value('creator-template','outfit').toLowerCase()+' to rotate it. This is a garment concept, not a fit simulation.':'Choose a silhouette to rotate its 3D garment preview.';
  build();schedule();
 }
 canvas.addEventListener('dblclick',()=>{yaw=.16;pitch=.025;zoom=1;$('creator-3d-zoom').value='100';$('creator-3d-zoom-value').textContent='100%';schedule();});
 canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus();});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.012;pitch=Math.max(-.55,Math.min(.55,pitch+(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;schedule();});
 const end=()=>{drag=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){yaw=.16;pitch=.025;}else if(e.key==='ArrowLeft')yaw-=.18;else if(e.key==='ArrowRight')yaw+=.18;else pitch=Math.max(-.55,Math.min(.55,pitch+(e.key==='ArrowUp'?-.1:.1)));schedule();});
 for(const [id,change]of [['creator-3d-left',-.35],['creator-3d-right',.35]])$(id).addEventListener('click',()=>{yaw+=change;schedule();});
 for(const [id,angle] of [['creator-3d-front',0],['creator-3d-side',Math.PI/2],['creator-3d-back',Math.PI]])$(id).addEventListener('click',()=>{yaw=angle;pitch=.06;schedule();});
 $('creator-3d-reset').addEventListener('click',()=>{yaw=.16;pitch=.025;zoom=1;$('creator-3d-zoom').value='100';$('creator-3d-zoom-value').textContent='100%';schedule();});
 $('creator-3d-zoom').addEventListener('input',e=>{zoom=Number(e.target.value)/100;$('creator-3d-zoom-value').textContent=Math.round(zoom*100)+'%';schedule();});
 $('creator-3d-toggle').addEventListener('click',()=>{technical=!technical;sync();});
 $('creator-3d-save').addEventListener('click',()=>{paint();canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='house-of-briar-'+value('creator-template','outfit').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-3d.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');});
 document.getElementById('creator-room').addEventListener('input',sync);
 document.getElementById('creator-room').addEventListener('click',e=>{if(e.target.closest('[data-creator-look],[data-creator-template],.creator-palette,#creator-undo,#creator-redo'))sync();});
 new MutationObserver(sync).observe(sketch,{childList:true});sync();
})();
