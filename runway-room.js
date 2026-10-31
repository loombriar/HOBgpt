'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('runway');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const status = message => { $('status').textContent = message; };
  const value = id => Number($(id).value);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let garment = null, playing = false, time = 0, previous = 0, frame = 0, loadVersion = 0, recording = false, recorder = null;

  function roundedPath(x, y, w, h, r) { const q = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath(); }
  function ellipse(x, y, rx, ry, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function line(points, color, width) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  function updateOutputs() {
    $('size').nextElementSibling.value = `${value('size')} px`;
    $('x').nextElementSibling.value = value('x');
    $('y').nextElementSibling.value = value('y');
    $('angle').nextElementSibling.value = `${value('angle')}°`;
    const camera = value('camera'); $('camera').nextElementSibling.value = camera === 0 ? 'Front' : `${Math.abs(camera)}° ${camera < 0 ? 'left' : 'right'}`;
    const light = value('light'); $('light').nextElementSibling.value = light === 0 ? 'Centered' : light > 0 ? 'Soft right' : 'Soft left';
  }
  function drawBackdrop() {
    const light = value('light') / 50;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#d7e8df'); bg.addColorStop(.48, '#eef2e9'); bg.addColorStop(1, '#f5d9d5');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * (.52 + light * .18), 300, 30, W * (.52 + light * .18), 300, 780);
    glow.addColorStop(0, 'rgba(255,255,255,.72)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, 555); ctx.scale(.98, 1);
    ctx.fillStyle = '#fff9ee'; ctx.beginPath(); ctx.moveTo(-160, -90); ctx.lineTo(160, -90); ctx.lineTo(540, 1000); ctx.lineTo(-540, 1000); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c4a677'; ctx.lineWidth = 3; ctx.globalAlpha = .72; ctx.beginPath(); ctx.moveTo(-160, -90); ctx.lineTo(-540, 1000); ctx.moveTo(160, -90); ctx.lineTo(540, 1000); ctx.stroke();
    ctx.globalAlpha = .16; for (let y = 20; y < 1000; y += 130) { const spread = y * .5; ctx.beginPath(); ctx.moveTo(-spread, y); ctx.lineTo(spread, y); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#4b3745'; ctx.textAlign = 'center'; ctx.font = '700 26px Georgia'; ctx.fillText('HOUSE OF BRIAR', W / 2, 76); ctx.font = '16px Georgia'; ctx.fillStyle = '#84666d'; ctx.fillText('Independent by design', W / 2, 106);
    ctx.fillStyle = 'rgba(72,54,60,.10)'; ctx.fillRect(0, H - 58, W, 58);
  }
  function drawMannequin(cx, baseY, shape, skin, walk, yaw, light) {
    const side = Math.sin(yaw), front = Math.cos(yaw), sway = walk * 7, stride = walk * 18;
    const skinLight = ctx.createLinearGradient(-80 + light * 80, 0, 100 + light * 80, 0);
    skinLight.addColorStop(0, '#6d473e'); skinLight.addColorStop(.22, skin); skinLight.addColorStop(.55, '#fff1df'); skinLight.addColorStop(.8, skin); skinLight.addColorStop(1, '#754b46');
    ctx.save(); ctx.translate(cx + sway, baseY);
    ellipse(0, 476, 102 * front, 17, 'rgba(61,42,54,.18)');
    const legY = 300;
    line([[-31 * shape, legY], [-43 * shape + stride, 405], [-48 * shape + stride, 490]], skinLight, 31);
    line([[31 * shape, legY], [43 * shape - stride, 405], [48 * shape - stride, 490]], skinLight, 31);
    ellipse(-51 * shape + stride, 500, 31, 11, '#5b4053'); ellipse(51 * shape - stride, 500, 31, 11, '#5b4053');
    line([[-55 * shape, 128], [-83 * shape - stride * .35, 215], [-72 * shape + stride * .25, 300]], skinLight, 25);
    line([[55 * shape, 128], [83 * shape + stride * .35, 215], [72 * shape - stride * .25, 300]], skinLight, 25);
    const torso = ctx.createLinearGradient(-78, 80, 78, 0); torso.addColorStop(0, '#563f4c'); torso.addColorStop(.22, '#b9d8ca'); torso.addColorStop(.5, '#f9f0df'); torso.addColorStop(.75, '#b9d8ca'); torso.addColorStop(1, '#56404c');
    ctx.fillStyle = torso; ctx.beginPath(); ctx.moveTo(-49 * shape, 97); ctx.quadraticCurveTo(-72 * shape, 150, -38 * shape, 217); ctx.quadraticCurveTo(-80 * shape, 260, -51 * shape, 315); ctx.quadraticCurveTo(0, 337, 51 * shape, 315); ctx.quadraticCurveTo(80 * shape, 260, 38 * shape, 217); ctx.quadraticCurveTo(72 * shape, 150, 49 * shape, 97); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(65,43,56,.2)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-43 * shape, 111); ctx.quadraticCurveTo(0, 136, 43 * shape, 111); ctx.stroke();
    line([[0, 67], [0, 107]], skinLight, 27); ellipse(0, 39, 44, 54, '#5d4551'); ellipse(0, 49, 34, 43, skinLight); ellipse(-11, 48, 3, 3, '#493744'); ellipse(11, 48, 3, 3, '#493744'); line([[-7, 70], [7, 70]], '#a66f78', 3);
    ctx.restore();
  }
  function drawGarment(cx, baseY, shape, walk, yaw) {
    if (!garment) return;
    const w = value('size'), ratio = garment.height / garment.width, h = w * ratio;
    const depth = Math.cos(yaw) * (1 - Math.min(.13, Math.abs(value('y')) / 4000));
    const x = cx + value('x') + Math.sin(yaw) * 42 + walk * 5, y = baseY - 245 + value('y') + Math.abs(walk) * 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(value('angle') * Math.PI / 180 + yaw * .1); ctx.transform(depth, 0, Math.sin(yaw) * .15, 1, 0, 0);
    ctx.shadowColor = 'rgba(55,35,48,.27)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 16;
    ctx.globalAlpha = .98; ctx.drawImage(garment, -w / 2, 0, w, h); ctx.shadowColor = 'transparent';
    ctx.restore();
    ctx.save(); ctx.globalAlpha = .35; ctx.fillStyle = '#453447'; ctx.beginPath(); ctx.ellipse(cx + value('x') + Math.sin(yaw) * 42, baseY + 38 + value('y') * .12, Math.max(50, w * .25), 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function draw() {
    updateOutputs(); ctx.clearRect(0, 0, W, H); drawBackdrop();
    const walk = playing ? Math.sin(time * 4.5) : 0, yaw = value('camera') * Math.PI / 180, cx = W / 2, baseY = 950, shape = value('shape'), skin = $('skin').value;
    drawMannequin(cx, baseY, shape, skin, walk, yaw, value('light') / 50); drawGarment(cx, baseY, shape, walk, yaw);
    ctx.textAlign = 'center'; ctx.fillStyle = '#5e4953'; ctx.font = '600 15px system-ui'; ctx.fillText(garment ? 'Depth-aware preview · visual styling only' : 'Upload a garment to begin your fitting-room view', W / 2, H - 25);
  }
  function tick(now) { if (!playing) { frame = 0; return; } if (previous) time += Math.min((now - previous) / 1000, .05); previous = now; draw(); frame = requestAnimationFrame(tick); }
  function setPlaying(next) { playing = next; previous = 0; $('walk').textContent = next ? 'Pause the look' : 'Walk the look'; $('walk').setAttribute('aria-pressed', String(next)); cancelAnimationFrame(frame); frame = 0; if (next) frame = requestAnimationFrame(tick); else draw(); }
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('use-sketch').addEventListener('click', async () => {
    const version = ++loadVersion;
    try {
      const svg = window.parent.document.getElementById('creator-preview');
      if (!svg || !svg.childElementCount) { status('Choose an outfit in the design studio above first.'); return; }
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', '600'); clone.setAttribute('height', '860');
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      try {
        const img = new Image(); img.src = url; await img.decode();
        const surface = document.createElement('canvas'); surface.width = 600; surface.height = 860;
        surface.getContext('2d').drawImage(img, 0, 0, 600, 860);
        const bitmap = await createImageBitmap(surface);
        if (version !== loadVersion) { bitmap.close(); return; }
        garment?.close(); garment = bitmap; $('remove').disabled = false;
        $('size').value = 360; $('y').value = 290;
        draw(); status('Current outfit sketch loaded. Adjust placement to style your runway view.');
      } finally { URL.revokeObjectURL(url); }
    } catch { status('The sketch could not open. Try uploading a saved outfit sketch instead.'); }
  });
  $('photo').addEventListener('change', async () => { const version = ++loadVersion, file = $('photo').files[0]; if (!file) return; if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { status('Choose a PNG, JPEG or WebP photo under 10 MB.'); $('photo').value = ''; return; } try { const bitmap = await createImageBitmap(file); if (version !== loadVersion) { bitmap.close(); return; } if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); status('Choose a smaller photo (under 40 megapixels).'); return; } garment?.close(); garment = bitmap; $('remove').disabled = false; draw(); status('Garment ready. Adjust the depth-lit placement, then walk the look.'); } catch { status('This photo could not open. Try another PNG, JPEG or WebP.'); } });
  ['shape', 'skin', 'size', 'x', 'y', 'angle', 'camera', 'light'].forEach(id => $(id).addEventListener('input', draw));
  $('walk').addEventListener('click', () => setPlaying(!playing));
  $('reset').addEventListener('click', () => { for (const [id, v] of Object.entries({ size: 260, x: 0, y: 0, angle: 0, camera: 0, light: 15 })) $(id).value = v; draw(); status('Placement, camera, and light reset.'); });
  $('remove').addEventListener('click', () => { loadVersion++; garment?.close(); garment = null; $('photo').value = ''; $('remove').disabled = true; draw(); status('Garment removed.'); });
  $('snapshot').addEventListener('click', () => { draw(); canvas.toBlob(blob => { if (blob) { download(blob, 'briar-runway-3d.png'); status('High-resolution runway image saved.'); } else status('Image could not be saved.'); }, 'image/png'); });
  const mime = typeof MediaRecorder === 'function' ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) : null;
  if (!mime || typeof canvas.captureStream !== 'function') { $('record').disabled = true; $('record').textContent = 'Video saving unavailable'; }
  $('record').addEventListener('click', () => { if (recording) return; let stream; const wasPlaying = playing; const finish = () => { recording = false; $('record').disabled = false; ['use-sketch', 'walk', 'photo', 'shape', 'skin', 'size', 'x', 'y', 'angle', 'camera', 'light', 'reset', 'snapshot'].forEach(id => $(id).disabled = false); $('remove').disabled = !garment; stream?.getTracks().forEach(t => t.stop()); setPlaying(wasPlaying); }; try { stream = canvas.captureStream(30); recorder = new MediaRecorder(stream, { mimeType: mime }); const chunks = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder.onerror = () => { status('Video could not be saved. Try Save high-res image.'); finish(); }; recorder.onstop = () => { if (chunks.length) { download(new Blob(chunks, { type: mime }), `briar-runway-3d.${mime.includes('mp4') ? 'mp4' : 'webm'}`); status('Your six-second 3D runway walk is saved.'); } finish(); }; recording = true; ['use-sketch', 'walk', 'photo', 'shape', 'skin', 'size', 'x', 'y', 'angle', 'camera', 'light', 'reset', 'remove', 'snapshot', 'record'].forEach(id => $(id).disabled = true); setPlaying(true); recorder.start(); status('Recording your six-second runway walk…'); setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 6000); } catch { finish(); status('Video could not be saved. Try Save high-res image.'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (recorder?.state === 'recording') recorder.stop(); setPlaying(false); } });
  draw(); if (reducedMotion.matches) status('Motion starts only when you press Walk the look.');
})();
