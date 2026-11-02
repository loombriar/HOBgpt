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
    halo.addColorStop(0, 'rgba(255,239,209,.26)'); halo.addColorStop(.55, 'rgba(231,195,161,.12)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    for (const x of [70, 1010]) {
      const pillar = ctx.createLinearGradient(x - 28, 0, x + 28, 0);
      pillar.addColorStop(0, '#241e29'); pillar.addColorStop(.5, '#6b5360'); pillar.addColorStop(1, '#251e29');
      ctx.fillStyle = pillar; ctx.fillRect(x - 28, 0, 56, 1190);
      ctx.fillStyle = 'rgba(225,183,128,.58)'; ctx.fillRect(x + (x < W/2 ? 27 : -29), 0, 2, 1190);
    }
    for (const y of [58, 116, 228]) { ctx.strokeStyle = 'rgba(242,209,171,.15)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(110, y); ctx.lineTo(W - 110, y); ctx.stroke(); }
    const stageGlow = ctx.createRadialGradient(W / 2, 510, 20, W / 2, 510, 410);
    stageGlow.addColorStop(0, 'rgba(251,221,188,.16)'); stageGlow.addColorStop(1, 'rgba(251,221,188,0)'); ctx.fillStyle = stageGlow; ctx.fillRect(130, 240, W - 260, 530);
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
    for (const y of [770, 970, 1160]) { const reflection = ctx.createRadialGradient(W / 2, y, 10, W / 2, y, 215); reflection.addColorStop(0, 'rgba(255,238,218,.12)'); reflection.addColorStop(1, 'rgba(255,238,218,0)'); ctx.fillStyle = reflection; ctx.fillRect(310, y - 130, 460, 260); }
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
  function strokeLimb(points, widths, colors, highlight = true) {
    const gradient = ctx.createLinearGradient(points[0][0] - 45, 0, points[0][0] + 45, 0);
    colors.forEach(([stop, color]) => gradient.addColorStop(stop, color));
    ctx.save();
    ctx.strokeStyle = gradient; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < points.length - 1; i++) {
      const width = (widths[i] + widths[i + 1]) / 2;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(...points[i]); ctx.lineTo(...points[i + 1]); ctx.stroke();
    }
    if (highlight) {
      ctx.globalAlpha = .1; ctx.strokeStyle = '#fff6e8'; ctx.lineWidth = Math.max(3, widths[0] * .18);
      ctx.beginPath(); ctx.moveTo(points[0][0] - widths[0] * .18, points[0][1]);
      points.slice(1).forEach(point => ctx.lineTo(point[0] - widths[0] * .18, point[1])); ctx.stroke();
    }
    ctx.restore();
  }
  function drawHand(x, y, scale, fill, highlight) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.08);
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.moveTo(-9 * scale, -2 * scale); ctx.quadraticCurveTo(-14 * scale, 10 * scale, -7 * scale, 17 * scale);
    ctx.quadraticCurveTo(0, 23 * scale, 8 * scale, 16 * scale); ctx.quadraticCurveTo(14 * scale, 6 * scale, 8 * scale, -4 * scale);
    ctx.quadraticCurveTo(0, -10 * scale, -9 * scale, -2 * scale); ctx.closePath(); ctx.fill();
    ctx.fillStyle = highlight; ctx.globalAlpha = .3; ctx.beginPath(); ctx.ellipse(-3 * scale, 5 * scale, 3 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawFoot(x, y, scale, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.ellipse(x, y, 25 * scale, 9 * scale, -.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,205,190,.22)'; ctx.beginPath();
    ctx.ellipse(x - 7 * scale, y - 3 * scale, 8 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawMannequin(cx, baseY, shape, skin, walk, yaw, light) {
    const sway = walk * 7, stride = walk * 18;
    const [r, g, b] = hexRgb(skin);
    const shadow = `rgb(${Math.max(18, r * .38 | 0)},${Math.max(14, g * .38 | 0)},${Math.max(16, b * .38 | 0)})`;
    const mid = `rgb(${r},${g},${b})`;
    const highlight = `rgb(${Math.min(255, r + 50)},${Math.min(255, g + 48)},${Math.min(255, b + 45)})`;
    const skinStops = [[0, shadow], [.22, mid], [.46, highlight], [.68, mid], [1, shadow]];
    ctx.save(); ctx.translate(cx + sway, baseY);
    drawContactShadow(0, 480, 200 * shape, yaw, .42);

    // A single continuous silhouette per limb reads more naturally than exposed ball joints.
    ctx.globalAlpha = .96;
    strokeLimb([[-28 * shape, 289], [-33 * shape + stride, 362], [-39 * shape + stride, 424], [-45 * shape + stride, 493]], [42 * shape, 35 * shape, 27 * shape, 20 * shape], skinStops);
    ctx.globalAlpha = 1;
    strokeLimb([[28 * shape, 289], [33 * shape - stride, 362], [39 * shape - stride, 424], [45 * shape - stride, 493]], [42 * shape, 35 * shape, 27 * shape, 20 * shape], skinStops);
    // Keep knees integrated with the leg silhouette; avoid visible circular joints.
    drawFoot(-50 * shape + stride, 501, 1, '#4b3748'); drawFoot(50 * shape - stride, 501, 1, '#594052');

    ctx.globalAlpha = .8;
    strokeLimb([[-49 * shape, 119], [-67 * shape - stride * .3, 184], [-70 * shape + stride * .18, 252], [-68 * shape + stride * .25, 294]], [29 * shape, 24 * shape, 19 * shape, 16 * shape], skinStops);
    ctx.globalAlpha = 1;
    strokeLimb([[49 * shape, 119], [67 * shape + stride * .3, 184], [70 * shape - stride * .18, 252], [68 * shape - stride * .25, 294]], [29 * shape, 24 * shape, 19 * shape, 16 * shape], skinStops);
    drawHand(-68 * shape + stride * .25, 303, .8 * shape, mid, '#fff1df');
    drawHand(68 * shape - stride * .25, 303, .8 * shape, mid, '#fff1df');

    // More restrained ribcage, waist, and hip proportions.
    const torso = ctx.createLinearGradient(-100 + light * 70, 0, 100 + light * 70, 0);
    torso.addColorStop(0, shadow); torso.addColorStop(.22, mid); torso.addColorStop(.46, highlight); torso.addColorStop(.63, mid); torso.addColorStop(1, shadow);
    ctx.fillStyle = torso; ctx.beginPath();
    ctx.moveTo(-46 * shape, 94); ctx.bezierCurveTo(-62 * shape, 128, -53 * shape, 180, -32 * shape, 215);
    ctx.bezierCurveTo(-39 * shape, 231, -58 * shape, 250, -56 * shape, 275);
    ctx.bezierCurveTo(-56 * shape, 302, -38 * shape, 324, -26 * shape, 333);
    ctx.quadraticCurveTo(0, 340, 26 * shape, 333); ctx.bezierCurveTo(38 * shape, 324, 56 * shape, 302, 56 * shape, 275);
    ctx.bezierCurveTo(58 * shape, 250, 39 * shape, 231, 32 * shape, 215);
    ctx.bezierCurveTo(53 * shape, 180, 62 * shape, 128, 46 * shape, 94); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 186, 40 * shape, 105, 0, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = radialLight(-22 + light * 58, 153, 160, '#fff8ed', .12); ctx.fillRect(-100, 70, 200, 250); ctx.restore();
    ctx.strokeStyle = rgba('#3b2735', .1); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-37 * shape, 109); ctx.quadraticCurveTo(0, 132, 37 * shape, 109); ctx.stroke();
    // Subtle shaping replaces the hard horizontal seam across the waist.

    // Smaller head, visible neck, and restrained facial details.
    strokeLimb([[0, 64], [0, 105]], [17, 14], skinStops, false);
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(0, 39, 40, 50, 0, 0, Math.PI * 2); ctx.fill();
    const face = ctx.createRadialGradient(-13 + light * 26, 29, 4, 4, 47, 52);
    face.addColorStop(0, highlight); face.addColorStop(.54, mid); face.addColorStop(1, shadow);
    ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(-2, 47, 34, 43, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba('#fff5e7', .3); ctx.beginPath(); ctx.ellipse(-12, 32, 9, 18, -.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3e2b38'; ctx.beginPath(); ctx.ellipse(-11, 45, 3, 3.4, 0, 0, Math.PI * 2); ctx.ellipse(11, 45, 3, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba('#593843', .42); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(-2, 61); ctx.lineTo(3, 63); ctx.stroke();
    ctx.strokeStyle = '#985f6c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-7, 71); ctx.quadraticCurveTo(0, 74, 7, 71); ctx.stroke();
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
    const walk = playing ? Math.sin(time * 4.5) : 0, yaw = value('camera') * Math.PI / 180, cx = W / 2, baseY = 865, shape = value('shape'), skin = $('skin').value;
    ctx.save(); ctx.translate(cx, 1030); ctx.scale(1.2, 1.2); ctx.translate(-cx, -1030); drawMannequin(cx, baseY, shape, skin, walk, yaw, value('light') / 50); drawGarment(cx, baseY, shape, walk, yaw); ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = '#f1d9ca'; ctx.font = '600 22px system-ui'; ctx.fillText(garment ? 'Depth-aware preview · visual styling only' : 'Upload a garment to begin your fitting-room view', W / 2, H - 25);
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
