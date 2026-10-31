(() => {
 'use strict';
 const canvas=document.getElementById('creator-3d-canvas');if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const $=id=>document.getElementById(id),panel=$('creator-3d-panel'),sketch=$('creator-preview');
 let yaw=.32,pitch=.06,zoom=1,drag=null,frame=0,technical=false,mesh=[],seams=[];
 const value=(id,fallback)=>$(id)?.value||fallback;
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const minus=(a,b)=>a.map((v,i)=>v-b[i]);
 function triangle(a,b,c,color){mesh.push({points:[a,b,c],color});}
 function connect(a,b,color){for(let j=0;j<a.length;j++){const k=(j+1)%a.length;triangle(a[j],b[j],a[k],color);triangle(a[k],b[j],b[k],color);}}
 function ring(rx,rz,y,fold=0){return Array.from({length:64},(_,j)=>{const t=j/64*Math.PI*2,r=1+fold*Math.cos(t*12);return [rx*Math.cos(t)*r,typeof y==='function'?y(t):y,rz*Math.sin(t)*r];});}
 function tube(start,end,radius,color){const axis=minus(end,start),length=Math.hypot(...axis),u=axis.map(v=>v/length),b=[0,0,1],v=cross(u,b);let prior;
  for(let i=0;i<=12;i++){const f=i/12,center=start.map((x,k)=>x+axis[k]*f),r=radius*(1-.18*f);const row=Array.from({length:32},(_,j)=>{const t=j/32*Math.PI*2;return center.map((x,k)=>x+r*(Math.cos(t)*v[k]+Math.sin(t)*b[k]));});if(prior)connect(prior,row,color);prior=row;}
  seams.push({points:prior.concat([prior[0]]),color:'#655154'});
 }
 function build(){mesh=[];seams=[];const color=value('creator-color','#b7d9cc'),finish=value('creator-fabric-finish','Matte'),length=value('creator-length','Midi'),sleeves=value('creator-sleeves','Short'),neck=value('creator-neckline','Scoop');
  const topY=t=>{const front=Math.max(0,Math.sin(t));return .96-(neck==='V-neck'?.37*Math.pow(front,4):neck==='Square'?.28*Math.min(1,front*2):.24*front*front);};
  let prior;
  for(let i=0;i<=26;i++){const f=i/26,y=.96*(1-f),bust=Math.exp(-Math.pow((f-.25)/.24,2)),rx=.36+.14*(1-f)+.025*bust,rz=.21+.065*bust-.045*f;const row=ring(rx,rz,t=>topY(t)*(1-f),.006);
   if(prior)connect(prior,row,color);else seams.push({points:row.concat([row[0]]),color:'#8d7c70'});prior=row;
  }
  const skirtLength=length==='Mini'?.82:length==='Maxi'?2.08:1.58;
  let waist;
  for(let i=0;i<=38;i++){const f=i/38,rx=.36+.49*Math.pow(f,.78),rz=.165+.29*f,fold=.045*f;const row=ring(rx,rz,-f*skirtLength,fold);if(i===0)waist=row;if(i)connect(prior,row,color);prior=row;}
  seams.push({points:waist.concat([waist[0]]),color:'#655154'});seams.push({points:prior.concat([prior[0]]),color:'#756958'});
  // Thin inner hem provides visible thickness when the camera looks inside the skirt.
  const inner=prior.map(p=>[p[0]*.985,p[1]+.025,p[2]*.985]);connect(prior,inner,color);
  for(const angle of [Math.PI*.25,Math.PI*.75,Math.PI*1.25,Math.PI*1.75]){const points=[];for(let i=0;i<=38;i++){const f=i/38,r=1+.045*f*Math.cos(angle*12);points.push([(.36+.49*Math.pow(f,.78))*Math.cos(angle)*r,-f*skirtLength,(.165+.29*f)*Math.sin(angle)*r]);}seams.push({points,color:'#766e66',subtle:true});}
  if(sleeves!=='Sleeveless')for(const sign of [-1,1])tube([sign*.44,.82,0],[sign*(sleeves==='Long'?.83:.69),sleeves==='Long'?-.15:.48,0],.145,color);
  const belt=value('creator-waist-detail','None');if(belt!=='None'||value('creator-accessory','None')==='Belt'){const c=belt==='Contrast belt'?value('creator-secondary-color','#775166'):color;connect(ring(.37,.18,.035),ring(.38,.185,-.05),c);}
  canvas.dataset.meshTriangles=String(mesh.length);canvas.dataset.fabricFinish=finish;canvas.dataset.neckline=neck;canvas.dataset.length=length;canvas.dataset.sleeves=sleeves;
 }
 function rotate(p){const c=Math.cos(yaw),s=Math.sin(yaw),x=p[0]*c+p[2]*s,z=-p[0]*s+p[2]*c,cp=Math.cos(pitch),sp=Math.sin(pitch);return [x,p[1]*cp-z*sp,p[1]*sp+z*cp];}
 function project(p){const f=4.8/(4.8+p[2]),scale=150*zoom;return [300+p[0]*scale*f,270-p[1]*scale*f];}
 function paint(){frame=0;if(panel.hidden)return;ctx.clearRect(0,0,600,660);const bg=ctx.createLinearGradient(0,0,600,660);bg.addColorStop(0,'#f9f5ef');bg.addColorStop(1,'#e8dfd6');ctx.fillStyle=bg;ctx.fillRect(0,0,600,660);
  ctx.fillStyle='rgba(65,45,50,.13)';ctx.beginPath();ctx.ellipse(300,610,135*zoom,15,0,0,Math.PI*2);ctx.fill();
  const faces=mesh.map(face=>{const points=face.points.map(rotate);return {...face,points,depth:points.reduce((sum,p)=>sum+p[2],0)/3};}).sort((a,b)=>b.depth-a.depth);
  const light=[-.45,.6,-.66],finish=value('creator-fabric-finish','Matte');
  for(const face of faces){const [a,b,c]=face.points,n=cross(minus(b,a),minus(c,a)),len=Math.hypot(...n)||1,unit=n.map(v=>v/len),diffuse=Math.abs(unit.reduce((sum,v,i)=>sum+v*light[i],0)),spec=finish==='Satin'?Math.pow(diffuse,20)*65:Math.pow(diffuse,8)*9;const hex=face.color.replace('#',''),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));const shade=.47+.53*diffuse;ctx.fillStyle=`rgb(${rgb.map(v=>Math.min(255,Math.round(v*shade+spec))).join(',')})`;const points=face.points.map(project);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  }
  // Draw only the front portions of seam lines, so back seams stay behind the cloth.
  for(const seam of seams){ctx.strokeStyle=seam.color;ctx.globalAlpha=seam.subtle?.22:.5;ctx.lineWidth=seam.subtle?.7:1;ctx.beginPath();let pen=false;for(const p of seam.points){const r=rotate(p),front=r[2]<.05;if(!front){pen=false;continue;}const [x,y]=project(r);if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;}ctx.stroke();}ctx.globalAlpha=1;
  ctx.fillStyle='#63515b';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('A-LINE · INTERACTIVE 3D STUDY',300,36);
  canvas.dataset.yaw=yaw.toFixed(3);canvas.dataset.pitch=pitch.toFixed(3);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
 function sync(){const active=value('creator-template','A-line')==='A-line',avatar=Boolean(sketch.querySelector('[data-avatar-reference]'));
  panel.hidden=!active||avatar||technical;sketch.hidden=active&&!avatar&&!technical;
  $('creator-3d-toggle').hidden=!active||avatar;$('creator-3d-toggle').textContent=technical?'Show 3D dress':'Show editable sketch';$('creator-3d-toggle').setAttribute('aria-pressed',String(technical));
  $('creator-3d-status').textContent=active?'Drag the dress to rotate it. This is a garment concept, not a fit simulation.':'The first 3D model is the A-line dress. Choose A-line to rotate it; other silhouettes use the editable sketch.';
  build();schedule();
 }
 canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus();});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.012;pitch=Math.max(-.55,Math.min(.55,pitch+(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;schedule();});
 const end=()=>{drag=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){yaw=.32;pitch=.06;}else if(e.key==='ArrowLeft')yaw-=.18;else if(e.key==='ArrowRight')yaw+=.18;else pitch=Math.max(-.55,Math.min(.55,pitch+(e.key==='ArrowUp'?-.1:.1)));schedule();});
 for(const [id,change]of [['creator-3d-left',-.35],['creator-3d-right',.35]])$(id).addEventListener('click',()=>{yaw+=change;schedule();});
 $('creator-3d-reset').addEventListener('click',()=>{yaw=.32;pitch=.06;zoom=1;$('creator-3d-zoom').value='100';schedule();});
 $('creator-3d-zoom').addEventListener('input',e=>{zoom=Number(e.target.value)/100;schedule();});
 $('creator-3d-toggle').addEventListener('click',()=>{technical=!technical;sync();});
 $('creator-3d-save').addEventListener('click',()=>{paint();canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='house-of-briar-3d-dress.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');});
 document.getElementById('creator-room').addEventListener('input',sync);
 document.getElementById('creator-room').addEventListener('click',e=>{if(e.target.closest('[data-creator-look],[data-creator-template],.creator-palette,#creator-undo,#creator-redo'))sync();});
 new MutationObserver(sync).observe(sketch,{childList:true});sync();
})();
