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
    bg.addColorStop(0, '#201d28'); bg.addColorStop(.52, '#413541'); bg.addColorStop(1, '#76616b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // A lit backdrop and architectural columns create a runway, not a flat illustration.
    const halo = ctx.createRadialGradient(W * (.5 + light * .08), 540, 40, W * .5, 640, 730);
    halo.addColorStop(0, 'rgba(255,239,209,.48)'); halo.addColorStop(.55, 'rgba(231,195,161,.12)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    for (const x of [70, 1010]) {
      const pillar = ctx.createLinearGradient(x - 28, 0, x + 28, 0);
      pillar.addColorStop(0, '#241e29'); pillar.addColorStop(.5, '#6b5360'); pillar.addColorStop(1, '#251e29');
      ctx.fillStyle = pillar; ctx.fillRect(x - 28, 0, 56, 1190);
      ctx.fillStyle = 'rgba(225,183,128,.58)'; ctx.fillRect(x + (x < W/2 ? 27 : -29), 0, 2, 1190);
    }
    // Recessed ceiling light bars and a distant stage add architectural depth.
    for (const y of [52, 112, 230]) {
      ctx.strokeStyle = 'rgba(241,204,163,.15)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(105, y); ctx.lineTo(W - 105, y); ctx.stroke();
    }
    const stageGlow = ctx.createRadialGradient(W / 2, 510, 25, W / 2, 510, 420);
    stageGlow.addColorStop(0, 'rgba(252,220,181,.18)'); stageGlow.addColorStop(1, 'rgba(252,220,181,0)');
    ctx.fillStyle = stageGlow; ctx.fillRect(100, 220, W - 200, 550);
    const horizon = 570, floor = H - 65;
    ctx.fillStyle = '#b7a39a'; ctx.beginPath(); ctx.moveTo(355, horizon); ctx.lineTo(725, horizon); ctx.lineTo(1070, floor); ctx.lineTo(10, floor); ctx.closePath(); ctx.fill();
    const runway = ctx.createLinearGradient(0, horizon, 0, floor);
    runway.addColorStop(0, '#ded0c2'); runway.addColorStop(.55, '#aa918a'); runway.addColorStop(1, '#6c5661');
    ctx.fillStyle = runway; ctx.beginPath(); ctx.moveTo(365, horizon); ctx.lineTo(715, horizon); ctx.lineTo(1045, floor); ctx.lineTo(35, floor); ctx.closePath(); ctx.fill();
    const sheen = ctx.createLinearGradient(W*.5, horizon, W*.5, floor);
    sheen.addColorStop(0, 'rgba(255,250,228,.26)'); sheen.addColorStop(1, 'rgba(255,241,222,.02)');
    ctx.fillStyle = sheen; ctx.beginPath(); ctx.moveTo(480,horizon); ctx.lineTo(600,horizon); ctx.lineTo(720,floor); ctx.lineTo(360,floor); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(245,205,149,.72)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(365,horizon); ctx.lineTo(35,floor); ctx.moveTo(715,horizon); ctx.lineTo(1045,floor); ctx.stroke();
    for (let i=1;i<=5;i++) {
      const t=i/6, y=horizon+(floor-horizon)*t*t;
      const half=175+330*t*t;
      ctx.strokeStyle='rgba(255,237,218,.09)'; ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(W/2-half,y);ctx.lineTo(W/2+half,y);ctx.stroke();
    }
    // Soft pools of light fall on the catwalk rather than floating over the model.
    for (const y of [735, 925, 1120]) {
      const pool = ctx.createRadialGradient(W / 2, y, 10, W / 2, y, 235);
      pool.addColorStop(0, 'rgba(255,236,211,.14)'); pool.addColorStop(1, 'rgba(255,236,211,0)');
      ctx.fillStyle = pool; ctx.fillRect(260, y - 150, 560, 300);
    }
    for (const x of [185,895]) {
      const spot=ctx.createRadialGradient(x,410,5,x,410,310);
      spot.addColorStop(0,'rgba(255,233,198,.32)');spot.addColorStop(1,'rgba(255,233,198,0)');
      ctx.fillStyle=spot;ctx.fillRect(x-310,100,620,750);
    }
    ctx.textAlign='center';ctx.fillStyle='#f2d7ad';ctx.font='600 35px Georgia';
    ctx.fillText('HOUSE OF BRIAR',W/2,155);
    ctx.fillStyle='rgba(249,231,210,.8)';ctx.font='18px Georgia';
    ctx.fillText('THE RUNWAY STUDIO',W/2,190);
    ctx.fillStyle='rgba(23,18,28,.6)';ctx.fillRect(0,H-65,W,65);
  }
  function hexRgb(hex) {
    const clean = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16));
  }
  function rgba(hex, alpha) {
    return `rgba(${hexRgb(hex).join(',')},${alpha})`;
  }
  function radialLight(x, y, radius, color, alpha = 1) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(1, rgba(color, 0));
    return gradient;
  }
  function drawContactShadow(cx, baseY, width, yaw, strength = .28) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'blur(18px)';
    ctx.fillStyle = `rgba(34,24,35,${strength})`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(yaw) * 22, baseY + 25, width * (.5 + Math.abs(Math.cos(yaw)) * .18), 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function limb(points, widths, colors) {
    const gradient = ctx.createLinearGradient(points[0][0] - 35, 0, points[0][0] + 35, 0);
    colors.forEach(([stop, color]) => gradient.addColorStop(stop, color));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const [px, py] = i ? points[i - 1] : points[0];
      const dx = x - px, dy = y - py, length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length * widths[i], ny = dx / length * widths[i];
      if (!i) ctx.moveTo(x + nx, y + ny); else ctx.lineTo(x + nx, y + ny);
    });
    for (let i = points.length - 1; i >= 0; i--) {
      const [x, y] = points[i], [px, py] = i ? points[i - 1] : points[i];
      const dx = x - px, dy = y - py, length = Math.hypot(dx, dy) || 1;
      ctx.lineTo(x + dy / length * widths[i], y - dx / length * widths[i]);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#382734', .16); ctx.lineWidth = 2; ctx.stroke();
  }
  function joint(x, y, rx, ry, fill, highlight) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = highlight; ctx.beginPath(); ctx.ellipse(x - rx * .25, y - ry * .25, rx * .42, ry * .28, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawMannequin(cx, baseY, shape, skin, walk, yaw, light) {
    const sway = walk * 7, stride = walk * 18;
    const [r, g, b] = hexRgb(skin);
    const shadow = `rgb(${Math.max(18, r * .34 | 0)},${Math.max(14, g * .34 | 0)},${Math.max(16, b * .34 | 0)})`;
    const mid = `rgb(${r},${g},${b})`;
    const highlight = `rgb(${Math.min(255, r + 58)},${Math.min(255, g + 52)},${Math.min(255, b + 48)})`;
    const skinStops = [[0, shadow], [.25, mid], [.48, highlight], [.68, mid], [1, shadow]];
    ctx.save(); ctx.translate(cx + sway, baseY);
    drawContactShadow(0, 485, 205 * shape, yaw, .46);

    // Legs are built from thigh, knee, calf, and ankle volumes rather than single strokes.
    ctx.globalAlpha = .84;
    limb([[-30 * shape, 297], [-39 * shape + stride, 370], [-43 * shape + stride, 414]], [24 * shape, 20 * shape, 18 * shape], skinStops);
    ctx.globalAlpha = 1;
    limb([[30 * shape, 297], [39 * shape - stride, 370], [43 * shape - stride, 414]], [24 * shape, 20 * shape, 18 * shape], skinStops);
    joint(-43 * shape + stride, 414, 19 * shape, 20, mid, rgba('#fff0df', .24));
    joint(43 * shape - stride, 414, 19 * shape, 20, mid, rgba('#fff0df', .24));
    limb([[-43 * shape + stride, 420], [-48 * shape + stride, 493]], [18 * shape, 13 * shape], skinStops);
    limb([[43 * shape - stride, 420], [48 * shape - stride, 493]], [18 * shape, 13 * shape], skinStops);
    joint(-51 * shape + stride, 501, 31, 10, '#463443', rgba('#9a7786', .3));
    joint(51 * shape - stride, 501, 31, 10, '#594055', rgba('#b18a91', .26));

    // Arms sit behind the torso and bend naturally at the elbow.
    ctx.globalAlpha = .82;
    limb([[-48 * shape, 122], [-78 * shape - stride * .35, 205], [-68 * shape + stride * .25, 270]], [18 * shape, 15 * shape, 12 * shape], skinStops);
    ctx.globalAlpha = 1;
    limb([[48 * shape, 122], [78 * shape + stride * .35, 205], [68 * shape - stride * .25, 270]], [18 * shape, 15 * shape, 12 * shape], skinStops);
    joint(-78 * shape - stride * .35, 205, 15 * shape, 17, mid, rgba('#fff0df', .22));
    joint(78 * shape + stride * .35, 205, 15 * shape, 17, mid, rgba('#fff0df', .3));
    joint(-68 * shape + stride * .25, 285, 14 * shape, 22, mid, rgba('#fff0df', .25));
    joint(68 * shape - stride * .25, 285, 14 * shape, 22, mid, rgba('#fff0df', .32));
    // Small hands make the silhouette read as a person rather than a mannequin icon.
    joint(-68 * shape + stride * .25, 306, 13 * shape, 19, mid, rgba('#fff0df', .28));
    joint(68 * shape - stride * .25, 306, 13 * shape, 19, mid, rgba('#fff0df', .35));

    // Ribcage, waist and hips use overlapping volumes to create a believable center of gravity.
    const torso = ctx.createLinearGradient(-105 + light * 75, 0, 105 + light * 75, 0);
    torso.addColorStop(0, shadow); torso.addColorStop(.2, mid); torso.addColorStop(.45, highlight); torso.addColorStop(.62, mid); torso.addColorStop(1, shadow);
    ctx.fillStyle = torso; ctx.beginPath();
    ctx.moveTo(-47 * shape, 94); ctx.bezierCurveTo(-72 * shape, 125, -69 * shape, 172, -37 * shape, 216);
    ctx.bezierCurveTo(-51 * shape, 232, -68 * shape, 255, -57 * shape, 278);
    ctx.bezierCurveTo(-50 * shape, 300, -39 * shape, 317, -27 * shape, 326);
    ctx.quadraticCurveTo(0, 342, 27 * shape, 326);
    ctx.bezierCurveTo(39 * shape, 317, 50 * shape, 300, 57 * shape, 278);
    ctx.bezierCurveTo(68 * shape, 255, 51 * shape, 232, 37 * shape, 216);
    ctx.bezierCurveTo(69 * shape, 172, 72 * shape, 125, 47 * shape, 94); ctx.closePath(); ctx.fill();
    ctx.fillStyle = radialLight(-24 + light * 58, 156, 170, '#fff8ed', .28); ctx.beginPath(); ctx.ellipse(0, 185, 43 * shape, 115, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba('#3b2735', .22); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-39 * shape, 111); ctx.quadraticCurveTo(0, 135, 39 * shape, 111); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-36 * shape, 225); ctx.quadraticCurveTo(0, 243, 36 * shape, 225); ctx.stroke();
    ctx.strokeStyle = rgba('#fff4e5', .24); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20 * shape, 130); ctx.quadraticCurveTo(-10 * shape, 190, -18 * shape, 260); ctx.stroke();

    // Neck, ears, jaw, nose and lips give the face planes that the original lacked.
    limb([[0, 65], [0, 106]], [17, 15], skinStops);
    joint(-38, 45, 8, 17, mid, rgba('#fff0df', .2)); joint(38, 45, 8, 17, mid, rgba('#fff0df', .28));
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(0, 38, 47, 58, 0, 0, Math.PI * 2); ctx.fill();
    const face = ctx.createRadialGradient(-15 + light * 28, 28, 4, 4, 48, 55);
    face.addColorStop(0, highlight); face.addColorStop(.55, mid); face.addColorStop(1, shadow);
    ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(-3, 47, 37, 46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba('#fff5e7', .35); ctx.beginPath(); ctx.ellipse(-14, 33, 11, 21, -.18, 0, Math.PI * 2); ctx.fill();
    joint(-12, 45, 3.4, 3.1, '#3e2b38', '#8e6d72'); joint(12, 45, 3.4, 3.1, '#3e2b38', '#8e6d72');
    ctx.strokeStyle = rgba('#593843', .45); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(-2, 62); ctx.lineTo(4, 64); ctx.stroke();
    ctx.strokeStyle = '#9a606b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 72); ctx.quadraticCurveTo(0, 76, 8, 72); ctx.stroke();
    ctx.restore();
  }
  function drawGarment(cx, baseY, shape, walk, yaw) {
    if (!garment) return;
    const w = value('size'), ratio = garment.height / garment.width, h = w * ratio;
    const depth = Math.max(.34, Math.cos(yaw)) * (1 - Math.min(.13, Math.abs(value('y')) / 4000));
    const x = cx + value('x') + Math.sin(yaw) * 42 + walk * 5;
    const y = baseY - 245 + value('y') + Math.abs(walk) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(value('angle') * Math.PI / 180 + yaw * .1);
    ctx.transform(depth, 0, Math.sin(yaw) * .15, 1, 0, 0);
    ctx.shadowColor = 'rgba(35,22,32,.38)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 18;
    ctx.globalAlpha = .98;
    ctx.drawImage(garment, -w / 2, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = 'rgba(48,29,43,.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + h * .8, Math.max(35, w * .28), Math.max(10, h * .045), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function draw() {
    updateOutputs(); ctx.clearRect(0, 0, W, H); drawBackdrop();
    const walk = playing ? Math.sin(time * 4.5) : 0, yaw = value('camera') * Math.PI / 180, cx = W / 2, baseY = 950, shape = value('shape'), skin = $('skin').value;
    ctx.save(); ctx.translate(cx, 1030); ctx.scale(1.32, 1.32); ctx.translate(-cx, -1030); drawMannequin(cx, baseY, shape, skin, walk, yaw, value('light') / 50); drawGarment(cx, baseY, shape, walk, yaw); ctx.restore();
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
