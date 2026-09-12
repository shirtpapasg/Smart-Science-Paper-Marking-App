/* Scenery — a small living world in the margins of the page.
   A day passes over one sitting: the sun comes up when the app opens, crosses
   the sky, sets after about forty minutes, and the moon and stars take over.
   Clouds drift, birds pass now and then, a rabbit lives on the hill.
   The pupil can join in: tap an empty part of the page and a bird takes off
   (a shooting star at night); press and hold on the grass and a flower grows;
   press and hold in the sky and a butterfly comes to your finger (fireflies
   at night). Nothing here is ever drawn behind the words: everything except
   the sky's tint is clipped to the empty margins. It pauses when the tab is
   hidden, stays still for "reduce motion", switches off below tablet width,
   and can be turned off from the buddy menu. Nothing is saved except that
   choice. */
(function () {
  const KEY = 'sm-scenery-v1';
  const DAY_MS = 40 * 60 * 1000;             // sunrise to sunset over one sitting
  const HOLD_MS = 520;
  const MIN_W = 760;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.id = 'sky'; canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1, on = true, running = false, last = 0, t0 = performance.now();
  let content = { l: 0, r: 0 };            // the column we never draw over
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, k) => a + (b - a) * k;
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  const enabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
  const setEnabled = v => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} apply(); };

  /* ── the world ── */
  const clouds = [], birds = [], flowers = [], butterflies = [], fireflies = [], stars = [], stars2 = [];
  let shooting = [], rabbit = null, nextFlock = 0, flowersSeeded = false;

  function seed() {
    clouds.length = 0;
    for (let i = 0; i < 5; i++) clouds.push({ x: rnd(0, 1), y: rnd(0.06, 0.34), s: rnd(0.6, 1.2), v: rnd(0.004, 0.011) });
    stars.length = 0; stars2.length = 0;
    for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: rnd(0, 0.62), r: rnd(0.6, 1.6), p: rnd(0, 6.28) });
    for (let i = 0; i < 40; i++) fireflies.push({ x: Math.random(), y: rnd(0.55, 0.9), p: rnd(0, 6.28), v: rnd(0.3, 0.8), dx: rnd(-1, 1), dy: rnd(-1, 1) });
    rabbit = { x: 0.08, dir: 1, hop: 0, next: 4, side: 'left' };
    nextFlock = 20 + rnd(0, 40);
  }
  function seedFlowers() {
    if (flowersSeeded || !W) return; flowersSeeded = true;
    const spots = [0.04, 0.09, 0.14, 0.86, 0.91, 0.96];
    spots.forEach(fx => flowers.push({ x: fx * W, g: 1, hue: [345, 30, 50, 280, 200][Math.floor(rnd(0, 5))], born: -10, sway: rnd(0, 6.28) }));
  }

  /* ── time of day: 0 sunrise … 0.5 noon … 1 sunset … then night ── */
  function phase(now) { if (dark()) return 1.5; return clamp((now - t0) / DAY_MS, 0, 1.5); }
  const isNight = p => p >= 1;

  function skyColors(p) {
    // [top, bottom] as [r,g,b] and a tint alpha; keyframes over the day
    const K = [
      [0.00, [255, 176, 120], [255, 226, 180], 0.30],   // sunrise
      [0.15, [150, 205, 255], [225, 242, 255], 0.26],   // morning
      [0.50, [125, 190, 255], [220, 240, 255], 0.22],   // noon
      [0.85, [140, 190, 240], [255, 215, 170], 0.26],   // late afternoon
      [1.00, [255, 140, 110], [255, 205, 150], 0.34],   // sunset
      [1.12, [40, 50, 100], [90, 80, 130], 0.42],       // dusk
      [1.30, [12, 18, 44], [30, 40, 80], 0.50],         // night
    ];
    let a = K[0], b = K[K.length - 1];
    for (let i = 0; i < K.length - 1; i++) if (p >= K[i][0] && p <= K[i + 1][0]) { a = K[i]; b = K[i + 1]; break; }
    const k = a === b ? 0 : (p - a[0]) / (b[0] - a[0]);
    const mix = (u, v) => u.map((c, i) => Math.round(lerp(c, v[i], k)));
    return { top: mix(a[1], b[1]), bot: mix(a[2], b[2]), alpha: lerp(a[3], b[3], k) };
  }

  /* ── layout ── */
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure(); seedFlowers(); apply();
  }
  function measure() {
    const w = document.querySelector('.wrap');
    if (!w) { content = { l: W / 2 - 320, r: W / 2 + 320 }; return; }
    const r = w.getBoundingClientRect();
    content = { l: r.left - 6, r: r.right + 6 };
  }
  const groundY = () => H - Math.min(150, H * 0.16);
  const inMargin = x => x < content.l || x > content.r;

  function apply() {
    on = enabled() && W >= MIN_W && !document.body.classList.contains('sheet-open');
    canvas.style.display = on ? 'block' : 'none';
    const m = document.getElementById('pm-scene');
    if (m) m.innerHTML = enabled() ? '<span>🌤</span>Scenery off' : '<span>🌤</span>Scenery on';
    if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  /* ── drawing ── */
  function clipMargins() {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(content.l, 0, content.r - content.l, H);
    ctx.clip('evenodd');
  }

  function drawSky(p) {
    const c = skyColors(p);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(${c.top.join(',')},${c.alpha})`);
    g.addColorStop(1, `rgba(${c.bot.join(',')},${c.alpha * 0.6})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawStars(p, now) {
    const a = clamp((p - 1.02) / 0.25, 0, 1); if (a <= 0) return;
    stars.forEach(s => {
      const tw = 0.55 + 0.45 * Math.sin(now / 900 + s.p);
      ctx.fillStyle = `rgba(255,250,225,${a * tw})`;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
    });
  }

  function drawSunMoon(p) {
    const gy = groundY();
    if (p <= 1) {                                   // the sun's arc
      const x = lerp(0.06, 0.94, p) * W, y = gy - Math.sin(p * Math.PI) * (gy - 70) - 10;
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 90);
      glow.addColorStop(0, 'rgba(255,214,90,.55)'); glow.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 90, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, 26, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x - 8, y - 8, 9, 0, 6.283); ctx.fill();
    } else {                                        // the moon climbs after sunset
      const q = clamp((p - 1) / 0.5, 0, 1), x = lerp(0.9, 0.1, q) * W, y = gy - Math.sin(q * Math.PI * 0.9 + 0.1) * (gy - 80) - 10;
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 80);
      glow.addColorStop(0, 'rgba(230,235,255,.35)'); glow.addColorStop(1, 'rgba(230,235,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 80, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#f2f3fa'; ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.fill();
      ctx.fillStyle = dark() ? '#141a27' : `rgb(${skyColors(p).top.join(',')})`;
      ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x - 9, y - 4, 19, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  function drawClouds(dt, p) {
    const night = isNight(p);
    clouds.forEach(c => {
      if (!reduced) { c.x += c.v * dt / 60; if (c.x > 1.15) c.x = -0.15; }
      const x = c.x * W, y = c.y * H, s = c.s * 34;
      ctx.fillStyle = night ? 'rgba(200,210,235,.16)' : 'rgba(255,255,255,.82)';
      [[0, 0, 1], [0.9, -0.25, 0.8], [-0.9, -0.15, 0.7], [0.45, 0.3, 0.7], [-0.4, 0.32, 0.65]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 6.283); ctx.fill();
      });
    });
  }

  function drawGround(now, p) {
    const gy = groundY(), night = isNight(p);
    const g1 = night ? 'rgba(40,70,60,.85)' : 'rgba(120,190,110,.9)', g2 = night ? 'rgba(30,55,48,.9)' : 'rgba(92,168,92,.95)';
    ctx.fillStyle = g1; ctx.beginPath(); ctx.moveTo(0, H);
    ctx.lineTo(0, gy + 30);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, gy + 30 - Math.sin(x / 260) * 22 - Math.cos(x / 97) * 6);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, H);
    ctx.lineTo(0, gy + 60);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, gy + 60 - Math.cos(x / 190 + 1) * 16);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // grass blades
    ctx.strokeStyle = night ? 'rgba(80,130,100,.7)' : 'rgba(60,140,70,.8)'; ctx.lineWidth = 1.5;
    for (let x = 6; x < W; x += 17) {
      if (!inMargin(x)) continue;
      const base = gy + 40 - Math.sin(x / 260) * 22, sway = reduced ? 0 : Math.sin(now / 700 + x) * 2.5;
      ctx.beginPath(); ctx.moveTo(x, base + 12); ctx.quadraticCurveTo(x + sway, base + 2, x + sway * 1.6, base - 8); ctx.stroke();
    }
  }

  function drawFlower(f, now) {
    const gy = groundY(), base = gy + 40 - Math.sin(f.x / 260) * 22 + 6;
    const g = clamp(f.g, 0, 1), h = 28 * g, sway = reduced ? 0 : Math.sin(now / 800 + f.sway) * 3 * g;
    ctx.strokeStyle = '#3d9a4f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(f.x, base); ctx.quadraticCurveTo(f.x + sway * 0.5, base - h * 0.6, f.x + sway, base - h); ctx.stroke();
    if (g > 0.35) {
      const b = clamp((g - 0.35) / 0.65, 0, 1), cx = f.x + sway, cy = base - h, r = 5.5 * b;
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * 6.283 + now / 4000;
        ctx.fillStyle = `hsl(${f.hue} 85% 68%)`;
        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.9, r * 0.6, a, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(cx, cy, 2.6 * b, 0, 6.283); ctx.fill();
    }
  }

  function drawBird(b, now) {
    const flap = Math.sin(now / 90 + b.p) * 6 * (b.s / 10);
    ctx.strokeStyle = b.night ? 'rgba(255,240,200,.85)' : 'rgba(60,70,90,.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - b.s, b.y + flap); ctx.quadraticCurveTo(b.x - b.s * 0.4, b.y - flap * 0.6, b.x, b.y);
    ctx.quadraticCurveTo(b.x + b.s * 0.4, b.y - flap * 0.6, b.x + b.s, b.y + flap); ctx.stroke();
  }

  function drawButterfly(bf, now) {
    const w = Math.abs(Math.sin(now / 110 + bf.p)) * 0.8 + 0.2;
    ctx.save(); ctx.translate(bf.x, bf.y);
    ctx.fillStyle = `hsl(${bf.hue} 80% 65%)`;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
      ctx.beginPath(); ctx.ellipse(sx * 6 * w, sy * (i < 2 ? 4 : 5), 7 * w, i < 2 ? 6 : 4.5, sx * 0.4, 0, 6.283); ctx.fill();
    });
    ctx.fillStyle = '#33313d'; ctx.fillRect(-1, -8, 2, 16);
    ctx.restore();
  }

  function drawRabbit(r, now, p) {
    const gy = groundY(), base = gy + 40 - Math.sin(r.x / 260) * 22 + 4;
    const hopY = r.hop > 0 ? -Math.sin(r.hop * Math.PI) * 22 : 0, x = r.x, y = base + hopY;
    const fur = isNight(p) ? '#cfd3e0' : '#e9e4dc';
    ctx.save(); ctx.translate(x, y); ctx.scale(r.dir, 1);
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, -9, 12, 9, 0, 0, 6.283); ctx.fill();          // body
    ctx.beginPath(); ctx.arc(10, -16, 6.5, 0, 6.283); ctx.fill();                  // head
    ctx.beginPath(); ctx.ellipse(8, -27, 2.2, 7, -0.15, 0, 6.283); ctx.fill();     // ears
    ctx.beginPath(); ctx.ellipse(12.5, -27, 2.2, 7, 0.15, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(-11, -8, 3.5, 0, 6.283); ctx.fill();                 // tail
    ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.arc(12.5, -17, 1.1, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f2a7b5'; ctx.beginPath(); ctx.arc(16, -15.5, 1, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  /* ── life ── */
  function launchFlock() {
    const fromLeft = Math.random() < 0.5, n = 3 + Math.floor(rnd(0, 3)), y = rnd(0.08, 0.36) * H;
    for (let i = 0; i < n; i++) birds.push({ x: fromLeft ? -40 - i * 26 : W + 40 + i * 26, y: y + (i % 2 ? 10 : -10) * i, vx: (fromLeft ? 1 : -1) * rnd(55, 80), vy: rnd(-4, 4), s: 10, p: rnd(0, 6.28), night: false });
  }
  function launchBird(x, y) {
    const dir = x < W / 2 ? 1 : -1;
    birds.push({ x, y, vx: dir * rnd(90, 130), vy: rnd(-45, -25), s: 10, p: rnd(0, 6.28), night: false, rising: true });
  }
  function launchStar(x, y) { shooting.push({ x, y, vx: (x < W / 2 ? 1 : -1) * 520, vy: 200, life: 1 }); }

  function frame(ts, once) {
    if (!on) { running = false; return; }
    if (document.hidden && !once) { running = false; return; }
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    const now = ts, p = phase(now), night = isNight(p);

    // life
    if (!reduced) {
      nextFlock -= dt; if (nextFlock <= 0 && !night) { launchFlock(); nextFlock = 60 + rnd(0, 90); }
      birds.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; if (b.rising) b.vy += 10 * dt; });
      for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x < -80 || birds[i].x > W + 80 || birds[i].y < -40) birds.splice(i, 1);
      shooting.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.6; });
      shooting = shooting.filter(s => s.life > 0);
      butterflies.forEach(bf => {
        if (bf.hold) { bf.x = lerp(bf.x, bf.tx + Math.sin(now / 300) * 14, 0.12); bf.y = lerp(bf.y, bf.ty - 18 + Math.cos(now / 260) * 10, 0.12); }
        else { bf.x += bf.vx * dt; bf.y += bf.vy * dt + Math.sin(now / 200) * 0.6; bf.life -= dt; }
      });
      for (let i = butterflies.length - 1; i >= 0; i--) if (!butterflies[i].hold && butterflies[i].life <= 0) butterflies.splice(i, 1);
      if (rabbit) {
        rabbit.next -= dt;
        if (rabbit.hop > 0) { rabbit.hop += dt * 1.6; rabbit.x += rabbit.dir * 60 * dt; if (rabbit.hop >= 1) rabbit.hop = 0; }
        else if (rabbit.next <= 0) { rabbit.hop = 0.01; rabbit.next = 3 + rnd(0, 6); if (Math.random() < 0.25) rabbit.dir *= -1; }
        // stay on its own side of the page, in the margin
        const lo = 30, hi = Math.max(lo + 1, content.l - 40), lo2 = content.r + 40, hi2 = W - 30;
        if (rabbit.side === 'left') { if (rabbit.x < lo) { rabbit.x = lo; rabbit.dir = 1; } if (rabbit.x > hi) { rabbit.x = hi; rabbit.dir = -1; } }
        else { if (rabbit.x < lo2) { rabbit.x = lo2; rabbit.dir = 1; } if (rabbit.x > hi2) { rabbit.x = hi2; rabbit.dir = -1; } }
      }
      flowers.forEach(f => { if (f.g < 1) f.g += dt * (f.hold ? 0.9 : 0.5); });
      fireflies.forEach(ff => {
        ff.x += ff.dx * dt * 0.004; ff.y += ff.dy * dt * 0.003;
        if (Math.random() < 0.02) { ff.dx = rnd(-1, 1); ff.dy = rnd(-1, 1); }
        ff.x = clamp(ff.x, 0, 1); ff.y = clamp(ff.y, 0.5, 0.92);
        if (ff.pull) { ff.x = lerp(ff.x, ff.pull.x / W, 0.04); ff.y = lerp(ff.y, ff.pull.y / H, 0.04); }
      });
    }

    // paint
    ctx.clearRect(0, 0, W, H);
    drawSky(p);
    ctx.save(); clipMargins();
    drawStars(p, now);
    drawSunMoon(p);
    shooting.forEach(s => {
      ctx.strokeStyle = `rgba(255,250,220,${s.life})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); ctx.stroke();
    });
    drawClouds(dt, p);
    drawGround(now, p);
    flowers.forEach(f => drawFlower(f, now));
    if (rabbit) drawRabbit(rabbit, now, p);
    birds.forEach(b => { b.night = night; drawBird(b, now); });
    butterflies.forEach(bf => drawButterfly(bf, now));
    if (night) fireflies.forEach(ff => {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(now / 500 * ff.v + ff.p));
      ctx.fillStyle = `rgba(210,255,140,${a})`; ctx.beginPath(); ctx.arc(ff.x * W, ff.y * H, 1.8, 0, 6.283); ctx.fill();
    });
    ctx.restore();

    if (!once) requestAnimationFrame(frame);
  }

  /* ── the pupil joins in: taps and holds on the empty margins only ── */
  let press = null;
  function isBackground(e) {
    const t = e.target;
    return (t === document.body || t === document.documentElement || t === canvas) && inMargin(e.clientX);
  }
  document.addEventListener('pointerdown', e => {
    if (!on || !isBackground(e) || e.button !== 0) return;
    const x = e.clientX, y = e.clientY, night = isNight(phase(performance.now()));
    press = { x, y, t: performance.now(), held: false, obj: null };
    press.timer = setTimeout(() => {
      if (!press) return; press.held = true;
      if (y > groundY() - 10 && !night) {                         // hold on the grass: a flower grows
        if (flowers.length > 60) flowers.shift();
        const f = { x, g: 0.05, hue: [345, 30, 50, 280, 200, 20][Math.floor(rnd(0, 6))], born: performance.now(), sway: rnd(0, 6.28), hold: true };
        flowers.push(f); press.obj = f;
      } else if (night) {                                          // hold at night: fireflies gather
        fireflies.forEach(ff => { ff.pull = { x, y }; }); press.obj = 'fireflies';
      } else {                                                     // hold in the sky: a butterfly comes
        const bf = { x, y: y + 30, tx: x, ty: y, hold: true, hue: [340, 30, 50, 270, 195][Math.floor(rnd(0, 5))], p: rnd(0, 6.28), life: 6, vx: 0, vy: 0 };
        butterflies.push(bf); press.obj = bf;
      }
    }, HOLD_MS);
  });
  document.addEventListener('pointermove', e => {
    if (!press) return;
    if (press.obj && press.obj.hold !== undefined && press.obj.tx !== undefined) { press.obj.tx = e.clientX; press.obj.ty = e.clientY; }
    if (press.obj === 'fireflies') fireflies.forEach(ff => { ff.pull = { x: e.clientX, y: e.clientY }; });
    if (!press.held && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(press.timer); press = null; }
  });
  function release(e) {
    if (!press) return;
    clearTimeout(press.timer);
    const night = isNight(phase(performance.now()));
    if (!press.held) {                                              // a tap: a bird takes off, or a shooting star
      if (reduced) { /* still: nothing flies */ }
      else if (night) launchStar(press.x, press.y); else launchBird(press.x, press.y);
    } else if (press.obj === 'fireflies') fireflies.forEach(ff => { ff.pull = null; });
    else if (press.obj && press.obj.tx !== undefined) { const bf = press.obj; bf.hold = false; bf.vx = rnd(-40, 40); bf.vy = rnd(-70, -40); bf.life = 5; }
    else if (press.obj) press.obj.hold = false;
    press = null;
  }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  /* ── wiring ── */
  addEventListener('resize', resize);
  addEventListener('scroll', measure, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { /* theme change repaints on the next frame */ }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const menu = document.getElementById('pip-menu');
  if (menu) {
    const b = document.createElement('button'); b.id = 'pm-scene'; b.type = 'button';
    const help = document.getElementById('pm-help');
    menu.insertBefore(b, help || null);
    b.onclick = e => { e.stopPropagation(); setEnabled(!enabled()); if (typeof pmOpen === 'function') pmOpen(false); };
  }
  seed(); resize();
  // for checking the scene by hand: draw one frame, or jump the day to a phase
  window.SCENERY = { setEnabled, enabled, phase: () => phase(performance.now()),
    frame: () => { last = performance.now() - 16; frame(performance.now(), true); },
    setPhase: p => { t0 = performance.now() - p * DAY_MS; } };
})();
