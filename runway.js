'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('runway'), ctx = canvas.getContext('2d');
  const status = message => { $('status').textContent = message; };
  let garment = null, playing = false, time = 0, previous = 0, frame = 0, loadVersion = 0, recording = false, recorder = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const value = id => Number($(id).value);
  function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fill(); }
  function line(points, color, width) { ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke(); }
  function draw() {
    ctx.clearRect(0,0,720,900);
    const bg=ctx.createLinearGradient(0,0,0,900);bg.addColorStop(0,'#e2efe7');bg.addColorStop(1,'#f8e0dc');ctx.fillStyle=bg;ctx.fillRect(0,0,720,900);
    ctx.fillStyle='#fff5e9';ctx.beginPath();ctx.moveTo(275,350);ctx.lineTo(445,350);ctx.lineTo(660,900);ctx.lineTo(60,900);ctx.closePath();ctx.fill();
    line([[275,350],[60,900]],'#c1a16c',2);line([[445,350],[660,900]],'#c1a16c',2);
    for(const side of [0,1]){const x=side?685:35;line([[x,820],[x-10,630],[x+5,400],[x,100]],'#8e9d83',3);for(let y=140;y<830;y+=80){line([[x,y],[x+(side?-18:18),y-18]],'#8e9d83',2);ellipse(x+8,y+25,8,8,'#9b7189');ellipse(x-2,y+30,7,7,'#bd91a4');}}
    ctx.textAlign='center';ctx.fillStyle='#55404b';ctx.font='32px Georgia';ctx.fillText('HOUSE OF BRIAR',360,65);ctx.font='18px Georgia';ctx.fillText('Independent by design',360,98);
    const walk=playing?Math.sin(time*5):0, sway=playing?Math.sin(time*2.5):0;
    ctx.save();ctx.translate(360+sway*7,280+Math.abs(walk)*3);
    const shape=value('shape'), skin=$('skin').value;
    ellipse(0,470,75,12,'#b99c9b44');
    line([[-27*shape,290],[-33*shape+walk*12,375],[-35*shape-walk*13,454]],skin,25);
    line([[27*shape,290],[33*shape-walk*12,375],[35*shape+walk*13,454]],skin,25);
    ellipse(-35*shape-walk*13,461,23,9,'#79566b');ellipse(35*shape+walk*13,461,23,9,'#79566b');
    line([[-47*shape,112],[-70*shape-walk*7,198],[-62*shape+walk*9,270]],skin,20);
    line([[47*shape,112],[70*shape+walk*7,198],[62*shape-walk*9,270]],skin,20);
    ctx.fillStyle=skin;ctx.beginPath();ctx.moveTo(-43*shape,95);ctx.quadraticCurveTo(-64*shape,140,-28*shape,215);ctx.quadraticCurveTo(-72*shape,260,-47*shape,305);ctx.lineTo(47*shape,305);ctx.quadraticCurveTo(72*shape,260,28*shape,215);ctx.quadraticCurveTo(64*shape,140,43*shape,95);ctx.closePath();ctx.fill();
    line([[0,70],[0,104]],skin,23);ellipse(0,38,37,48,'#5d4650');ellipse(0,48,29,38,skin);ellipse(-9,46,2,2,'#493744');ellipse(9,46,2,2,'#493744');line([[-5,66],[5,66]],'#aa727b',2);
    ctx.fillStyle='#b9d8ca';ctx.fillRect(-33*shape,108,66*shape,55);ctx.fillStyle='#e6b0b5';ctx.fillRect(-35*shape,251,70*shape,54);
    if(garment){const w=value('size'),h=w*garment.height/garment.width;ctx.save();ctx.translate(value('x'),100+value('y'));ctx.rotate(value('angle')*Math.PI/180);ctx.drawImage(garment,-w/2,0,w,h);ctx.restore();}
    ctx.restore();ctx.fillStyle='#55404b';ctx.font='16px system-ui';ctx.fillText('Illustrated preview · not a fit simulation',360,860);
  }
  function tick(now){if(!playing){frame=0;return;}if(previous)time+=Math.min((now-previous)/1000,.05);previous=now;draw();frame=requestAnimationFrame(tick);}
  function setPlaying(next){playing=next;previous=0;$('walk').textContent=next?'Pause':'Walk';$('walk').setAttribute('aria-pressed',String(next));cancelAnimationFrame(frame);frame=0;if(next)frame=requestAnimationFrame(tick);else draw();}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('photo').addEventListener('change',async()=>{const version=++loadVersion,file=$('photo').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){status('Choose a PNG, JPEG or WebP photo under 10 MB.');$('photo').value='';return;}try{const bitmap=await createImageBitmap(file);if(version!==loadVersion){bitmap.close();return;}if(bitmap.width*bitmap.height>40000000){bitmap.close();status('Choose a smaller photo (under 40 megapixels).');return;}garment?.close();garment=bitmap;$('remove').disabled=false;draw();status('Photo ready. Adjust placement, then press Walk.');}catch{status('This photo could not open. Try another PNG, JPEG or WebP.');}});
  for(const id of ['shape','skin','size','x','y','angle'])$(id).addEventListener('input',draw);
  $('walk').addEventListener('click',()=>setPlaying(!playing));
  $('reset').addEventListener('click',()=>{for(const [id,v] of Object.entries({size:220,x:0,y:0,angle:0}))$(id).value=v;draw();status('Garment placement reset.');});
  $('remove').addEventListener('click',()=>{loadVersion++;garment?.close();garment=null;$('photo').value='';$('remove').disabled=true;draw();status('Photo removed.');});
  $('snapshot').addEventListener('click',()=>{draw();canvas.toBlob(blob=>{if(blob){download(blob,'briar-runway.png');status('Runway image saved.');}else status('Image could not be saved.');});});
  const mime=typeof MediaRecorder==='function'?['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type)):null;
  if(!mime||typeof canvas.captureStream!=='function'){$('record').disabled=true;$('record').textContent='Video saving unavailable';}
  $('record').addEventListener('click',()=>{
    if(recording)return;let stream;const wasPlaying=playing;
    const finish=()=>{recording=false;$('record').disabled=false;for(const id of ['walk','photo','shape','skin','size','x','y','angle','reset','snapshot'])$(id).disabled=false;$('remove').disabled=!garment;stream?.getTracks().forEach(t=>t.stop());setPlaying(wasPlaying);};
    try{stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>{chunks.length=0;status('Video could not be saved. Try Save image.');finish();};recorder.onstop=()=>{if(chunks.length){download(new Blob(chunks,{type:mime}),'briar-runway.'+(mime.includes('mp4')?'mp4':'webm'));status('Your runway walk is saved.');}finish();};recording=true;for(const id of ['walk','photo','shape','skin','size','x','y','angle','reset','remove','snapshot','record'])$(id).disabled=true;setPlaying(true);recorder.start();status('Recording your six-second walk…');setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},6000);}catch{finish();status('Video could not be saved. Try Save image.');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(recorder?.state==='recording')recorder.stop();setPlaying(false);}});
  draw();if(reducedMotion.matches)status('Motion starts only when you press Walk.');
})();
