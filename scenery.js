/* Scenery — a small living world in the margins of the page.
   A day passes over one sitting: the sun comes up when the app opens, crosses
   the sky, sets after about forty minutes, and the moon and stars take over.
   Clouds drift, birds pass now and then. The hills are lived in: by day a
   rabbit, a grasshopper, a caterpillar, mealworms in the soil, a chicken, a
   snail, a cockroach under its rock, a cat, a frog by the pond, mosquitoes over
   it and fish in it; by night a wolf who howls at the moon, an owl in the tree,
   bats and mice. Tap any of them and it reacts.
   The pupil can join in: tap an empty part of the page and a bird takes off
   (a shooting star at night); press and hold on the grass and a flower grows;
   press and hold in the sky and a butterfly comes to your finger (fireflies
   at night). Nothing here is ever drawn behind the words: the whole scene, sky
   included, is clipped to the empty margins. It pauses when the tab is
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
      [1.12, [40, 50, 100], [90, 80, 130], 0.30],       // dusk
      [1.30, [12, 18, 44], [30, 40, 80], 0.32],         // night
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
    measure(); seedFlowers(); buildCreatures(); apply();
  }
  function measure() {
    const w = document.querySelector('.wrap');
    if (!w) { content = { l: W / 2 - 320, r: W / 2 + 320 }; return; }
    const r = w.getBoundingClientRect();
    content = { l: r.left - 6, r: r.right + 6 };
    const nav = document.querySelector('.nav');
    navTop = nav && nav.offsetParent !== null ? nav.getBoundingClientRect().top : H;
    if (typeof placeDoor === 'function') placeDoor();
  }
  // the hills sit above the fixed bottom bar, so nothing lives behind it
  let navTop = 0;
  const groundY = () => (navTop || H) - Math.min(150, H * 0.16);
  const inMargin = x => x < content.l || x > content.r;

  function apply() {
    on = enabled() && W >= MIN_W && !document.body.classList.contains('sheet-open');
    canvas.style.display = on ? 'block' : 'none';
    const m = document.getElementById('pm-scene');
    if (m) m.innerHTML = enabled() ? '<span>🌤</span>Scenery off' : '<span>🌤</span>Scenery on';
    if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    placeDoor();
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
      // a crescent: draw the disc, then cut the shadow out so the sky shows through
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.clip();
      ctx.fillStyle = '#f2f3fa'; ctx.fillRect(x - 24, y - 24, 48, 48);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x - 10, y - 5, 19, 0, 6.283); ctx.fill();
      ctx.restore();
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

  /* ── the creatures ──
     Every animal is a small drawing with one or two habits and a reaction to a
     tap. Day: grasshopper, caterpillar, mosquitoes, frog, mealworms, chicken,
     cockroach, cat, snail, fish. Night: wolf, bats, owl, mice (the cat stays up
     and the fish keep swimming). Each lives on one side, at a fraction of that
     margin, so the scene fits whatever width the page has. */
  let creatures = [];
  const marginW = side => side === 'left' ? Math.max(0, content.l) : Math.max(0, W - content.r);
  const sideX = (side, f) => side === 'left' ? content.l * f : content.r + (W - content.r) * f;
  const hillY = x => groundY() + 40 - Math.sin(x / 260) * 22;
  const pond = () => { const mw = marginW('right'); return { x: sideX('right', 0.5), y: groundY() + 56, rx: clamp(mw * 0.26, 34, 80), ry: 13 }; };
  const tree = () => ({ x: sideX('right', 0.84), y: hillY(sideX('right', 0.84)) + 4 });
  const soil = () => ({ x: sideX('left', 0.18), y: hillY(sideX('left', 0.18)) + 8 });
  const rock = () => ({ x: sideX('left', 0.78), y: hillY(sideX('left', 0.78)) + 6 });

  function buildCreatures() {
    creatures = [];
    if (!W) return;
    const mk = (type, side, f, extra) => creatures.push(Object.assign({ type, side, f, x: sideX(side, f), t: rnd(1, 4), state: 'idle', dir: 1, s: 0, p: rnd(0, 6.28) }, extra || {}));
    // day
    mk('grasshopper', 'left', 0.34);
    mk('caterpillar', 'left', 0.48, { dir: 1, span: 40 });
    mk('mealworms', 'left', 0.18);
    mk('chicken', 'left', 0.80, { dir: -1 });
    mk('snail', 'left', 0.94, { dir: -1 });
    mk('cockroach', 'left', 0.78, { hidden: true });
    mk('cat', 'right', 0.22);
    mk('frog', 'right', 0.28);
    for (let i = 0; i < 3; i++) mk('mosquito', 'right', 0.5, { dx: rnd(-20, 20), dy: rnd(-26, -6), p: rnd(0, 6.28) });
    for (let i = 0; i < 3; i++) mk('fish', 'right', 0.5, { fx: rnd(-0.6, 0.6), dir: Math.random() < 0.5 ? 1 : -1, sp: rnd(6, 14), hue: [15, 35, 200][i] });
    // night
    mk('wolf', 'right', 0.62);
    mk('owl', 'right', 0.84);
    for (let i = 0; i < 2; i++) mk('bat', 'left', 0.5, { bx: rnd(0.1, 0.9), by: rnd(0.1, 0.45), vx: rnd(40, 70) * (Math.random() < 0.5 ? 1 : -1), vy: 0 });
    for (let i = 0; i < 2; i++) mk('mouse', 'left', [0.28, 0.72][i], { dir: 1 });
    // narrow margins: keep only the essentials so nothing piles up
    ['left', 'right'].forEach(side => {
      const mw = marginW(side);
      if (mw < 150) creatures = creatures.filter(c => c.side !== side || ['frog', 'chicken', 'owl', 'mouse', 'fish', 'cat'].indexOf(c.type) >= 0);
    });
  }

  const dayTypes = { grasshopper: 1, caterpillar: 1, mealworms: 1, chicken: 1, snail: 1, cockroach: 1, frog: 1, mosquito: 1 };
  const nightTypes = { wolf: 1, owl: 1, bat: 1, mouse: 1 };
  const awake = (c, night) => night ? !dayTypes[c.type] : !nightTypes[c.type];

  function poke(c) {
    c.s = 0.001;
    if (c.type === 'cockroach') { c.hidden = false; c.state = 'run'; c.t = 2.2; c.dir = c.x < sideX(c.side, 0.5) ? 1 : -1; }
    else if (c.type === 'snail') { c.state = 'hide'; c.t = 3; }
    else if (c.type === 'mosquito') { c.state = 'scatter'; c.t = 1.2; }
    else if (c.type === 'fish') { c.state = 'dart'; c.t = 0.8; c.dir *= -1; }
    else if (c.type === 'wolf') { c.state = 'howl'; c.t = 2.2; }
    else if (c.type === 'owl') { c.state = 'blink'; c.t = 1.4; }
    else if (c.type === 'mouse') { c.state = 'dash'; c.t = 1; c.dir *= -1; }
    else if (c.type === 'cat') { c.state = 'stretch'; c.t = 2.4; }
    else if (c.type === 'bat') { c.state = 'swoop'; c.t = 1; }
    else if (c.type === 'chicken') { c.state = 'flap'; c.t = 1.2; }
    else if (c.type === 'caterpillar') { c.state = 'curl'; c.t = 2; }
    else if (c.type === 'mealworms') { c.state = 'wriggle'; c.t = 2; }
    else { c.state = 'hop'; }
  }

  function updateCreatures(dt, now, night) {
    creatures.forEach(c => {
      if (!awake(c, night) && c.type !== 'cat' && c.type !== 'fish') return;
      c.t -= dt;
      if (c.s > 0) { c.s += dt; }
      switch (c.type) {
        case 'grasshopper': case 'frog':
          if (c.state === 'hop') { c.s += dt * (c.type === 'frog' ? 1.4 : 2.2); c.x += c.dir * (c.type === 'frog' ? 40 : 60) * dt; if (c.s >= 1) { c.state = 'idle'; c.s = 0; } }
          else if (c.t <= 0) { c.state = 'hop'; c.s = 0.001; c.t = rnd(4, 10); if (Math.random() < 0.4) c.dir *= -1; }
          break;
        case 'caterpillar':
          if (c.state === 'curl') { if (c.t <= 0) c.state = 'idle'; }
          else { c.x += c.dir * 4 * dt; if (Math.abs(c.x - sideX(c.side, c.f)) > c.span) c.dir *= -1; }
          break;
        case 'chicken':
          if (c.state === 'flap') { if (c.t <= 0) { c.state = 'idle'; c.t = rnd(2, 5); } }
          else if (c.state === 'walk') { c.x += c.dir * 18 * dt; if (c.t <= 0) { c.state = 'peck'; c.t = rnd(1.5, 3); } }
          else if (c.t <= 0) { c.state = 'walk'; c.t = rnd(2, 4); if (Math.random() < 0.5) c.dir *= -1; }
          break;
        case 'snail':
          if (c.state === 'hide') { if (c.t <= 0) c.state = 'idle'; }
          else { c.x += c.dir * 1.2 * dt; if (Math.abs(c.x - sideX(c.side, c.f)) > 30) c.dir *= -1; }
          break;
        case 'cockroach':
          if (c.state === 'run') { c.x += c.dir * 140 * dt; if (c.t <= 0) { c.hidden = true; c.state = 'idle'; c.t = rnd(12, 30); c.x = rock().x; } }
          else if (c.t <= 0) { c.hidden = false; c.state = 'run'; c.t = rnd(1.2, 2); c.dir = Math.random() < 0.5 ? 1 : -1; }
          break;
        case 'mosquito': {
          const pd = pond(); const sc = c.state === 'scatter' ? 3 : 1;
          c.dx += rnd(-1, 1) * 60 * dt * sc; c.dy += rnd(-1, 1) * 60 * dt * sc;
          c.dx = clamp(c.dx, -pd.rx - 10, pd.rx + 10); c.dy = clamp(c.dy, -40, -4);
          if (c.state === 'scatter' && c.t <= 0) c.state = 'idle';
          break; }
        case 'fish': {
          const pd = pond(); const sp = c.state === 'dart' ? 3 : 1;
          c.fx += c.dir * c.sp * sp * dt / pd.rx; if (Math.abs(c.fx) > 0.75) { c.fx = clamp(c.fx, -0.75, 0.75); c.dir *= -1; }
          if (c.state === 'dart' && c.t <= 0) c.state = 'idle';
          break; }
        case 'mealworms': if (c.state === 'wriggle' && c.t <= 0) c.state = 'idle'; break;
        case 'cat':
          if (c.state === 'stretch') { if (c.t <= 0) { c.state = 'sit'; c.t = rnd(6, 12); } }
          else if (c.t <= 0) { c.state = c.state === 'sit' ? 'sleep' : 'sit'; c.t = rnd(8, 16); }
          break;
        case 'wolf':
          if (c.state === 'howl') { if (c.t <= 0) { c.state = 'idle'; c.t = rnd(14, 30); } }
          else if (c.t <= 0) { c.state = 'howl'; c.t = 2.4; }
          break;
        case 'owl':
          if (c.state === 'blink') { if (c.t <= 0) { c.state = 'idle'; c.t = rnd(3, 7); } }
          else if (c.t <= 0) { c.state = 'blink'; c.t = 0.25; c.dir = Math.random() < 0.5 ? 1 : -1; }
          break;
        case 'bat': {
          const sp = c.state === 'swoop' ? 2.2 : 1;
          c.bx += c.vx * sp * dt / W; c.by += Math.sin(now / 350 + c.p) * 0.12 * dt + (c.state === 'swoop' ? 0.25 * dt : 0);
          if (c.bx < -0.05 || c.bx > 1.05) c.vx *= -1; c.by = clamp(c.by, 0.06, 0.5);
          if (c.state === 'swoop' && c.t <= 0) c.state = 'idle';
          break; }
        case 'mouse':
          if (c.state === 'dash') { c.x += c.dir * 120 * dt; if (c.t <= 0) { c.state = 'idle'; c.t = rnd(2, 6); } }
          else if (c.t <= 0) { c.state = 'dash'; c.t = rnd(0.4, 1); if (Math.random() < 0.5) c.dir *= -1; }
          break;
      }
      // keep every ground creature on its own margin
      if (['grasshopper', 'frog', 'chicken', 'snail', 'cockroach', 'mouse', 'caterpillar'].indexOf(c.type) >= 0) {
        const lo = c.side === 'left' ? 24 : content.r + 24, hi = c.side === 'left' ? content.l - 24 : W - 24;
        if (c.x < lo) { c.x = lo; c.dir = 1; } if (c.x > hi) { c.x = hi; c.dir = -1; }
      }
    });
  }

  function drawFeatures(now, night) {
    // pond
    const pd = pond();
    ctx.fillStyle = night ? 'rgba(60,90,150,.6)' : 'rgba(110,180,240,.75)';
    ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(pd.x - pd.rx * 0.2, pd.y - 3, pd.rx * 0.45, 3.5, 0, 0, 6.283); ctx.stroke();
    // tree
    const tr = tree();
    ctx.fillStyle = night ? '#3a2d24' : '#7a5230'; ctx.fillRect(tr.x - 5, tr.y - 62, 10, 62);
    ctx.fillStyle = night ? 'rgba(40,70,55,.95)' : 'rgba(70,150,80,.95)';
    [[0, -78, 30], [-22, -64, 22], [22, -66, 22], [0, -58, 26]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(tr.x + dx, tr.y + dy, r, 0, 6.283); ctx.fill(); });
    ctx.fillStyle = night ? '#2b2a2a' : '#6b6b70'; ctx.fillRect(tr.x - 22, tr.y - 44, 24, 3);          // a branch for the owl
    // soil patch and rock
    const so = soil(); ctx.fillStyle = night ? '#3a2a1e' : '#6b4a2f';
    ctx.beginPath(); ctx.ellipse(so.x, so.y, 26, 7, 0, 0, 6.283); ctx.fill();
    const rk = rock(); ctx.fillStyle = night ? '#4a4d58' : '#8a8f9a';
    ctx.beginPath(); ctx.ellipse(rk.x, rk.y - 4, 16, 9, 0, 0, 6.283); ctx.fill();
    drawLab(now, night);
  }

  const E = (x, y, rx, ry, col, rot) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.283); ctx.fill(); };
  const C = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };

  function drawCreature(c, now, night) {
    const gy = hillY(c.x) + 6;
    switch (c.type) {
      case 'grasshopper': {
        const hop = c.state === 'hop' ? -Math.sin(c.s * Math.PI) * 34 : 0, y = gy + hop;
        ctx.save(); ctx.translate(c.x, y); ctx.scale(c.dir, 1);
        E(0, -6, 11, 4, '#5cb85c'); C(10, -8, 3.5, '#4aa54a');
        ctx.strokeStyle = '#3d8b3d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-9, -14); ctx.lineTo(-6, -1); ctx.stroke();     // back leg
        ctx.beginPath(); ctx.moveTo(11, -10); ctx.lineTo(16, -17); ctx.moveTo(12, -10); ctx.lineTo(18, -14); ctx.stroke(); // antennae
        C(12, -9, 0.9, '#1c1c1c'); ctx.restore(); break; }
      case 'caterpillar': {
        const curl = c.state === 'curl';
        for (let i = 0; i < 6; i++) {
          const k = i / 5, x = c.x + c.dir * (curl ? Math.cos(k * 3) * 6 : (i - 2.5) * 5), y = gy - 4 - (curl ? Math.sin(k * 3) * 6 : Math.abs(Math.sin(now / 250 + i)) * 2.5);
          C(x, y, 3.4, i === 5 ? '#3f8f3f' : `hsl(${95 + i * 6} 60% ${52 - i * 2}%)`);
        }
        break; }
      case 'mealworms': {
        const so = soil(), sp = c.state === 'wriggle' ? 3 : 1;
        for (let w = 0; w < 3; w++) for (let i = 0; i < 5; i++) {
          const x = so.x - 14 + w * 14 + i * 2.2, y = so.y - 2 + Math.sin(now / 200 * sp + i * 0.9 + w) * 1.6;
          C(x, y, 1.4, '#d9b56a');
        }
        break; }
      case 'chicken': {
        const flap = c.state === 'flap', jump = flap ? -Math.abs(Math.sin(c.s * 6)) * 8 : 0, peck = c.state === 'peck' ? Math.abs(Math.sin(now / 180)) * 5 : 0;
        ctx.save(); ctx.translate(c.x, gy + jump); ctx.scale(c.dir, 1);
        E(0, -12, 12, 9, '#f6f2ea'); E(-2, -13, 6, flap ? 7 : 4, '#e9e3d8', flap ? -0.7 : -0.2);   // body, wing
        C(11, -22 + peck, 5.5, '#f6f2ea'); ctx.fillStyle = '#e04b3f'; ctx.fillRect(9, -30 + peck, 4, 4); C(12.5, -28 + peck, 2.2, '#e04b3f');
        ctx.fillStyle = '#f0a22e'; ctx.beginPath(); ctx.moveTo(16, -22 + peck); ctx.lineTo(21, -20 + peck); ctx.lineTo(16, -19 + peck); ctx.fill();
        C(13, -23 + peck, 0.9, '#1c1c1c');
        ctx.strokeStyle = '#f0a22e'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-3, 2); ctx.moveTo(4, -4); ctx.lineTo(4, 2); ctx.stroke();
        ctx.restore(); break; }
      case 'snail': {
        const hide = c.state === 'hide';
        ctx.save(); ctx.translate(c.x, gy); ctx.scale(c.dir, 1);
        if (!hide) { E(2, -3, 11, 3.5, '#c9a36a'); C(12, -7, 2.6, '#c9a36a'); ctx.strokeStyle = '#a8843f'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(13, -9); ctx.lineTo(15, -14); ctx.moveTo(11, -9); ctx.lineTo(10, -14); ctx.stroke(); }
        C(-3, -9, 7.5, '#a86a3d'); ctx.strokeStyle = '#7a4a26'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(-3, -9, 4.5, 0.5, 5.5); ctx.stroke();
        ctx.restore(); break; }
      case 'cockroach': {
        if (c.hidden) break;
        ctx.save(); ctx.translate(c.x, gy - 1); ctx.scale(c.dir, 1);
        E(0, -3, 8, 3.2, '#5a3a2a'); C(7, -3.5, 2.4, '#3d2419');
        ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1; const lg = Math.sin(now / 40) * 2;
        ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 4, -2); ctx.lineTo(i * 4 + lg, 2); ctx.moveTo(i * 4, -4); ctx.lineTo(i * 4 - lg, -8); } ctx.moveTo(8, -5); ctx.lineTo(14, -10); ctx.moveTo(8, -5); ctx.lineTo(15, -6); ctx.stroke();
        ctx.restore(); break; }
      case 'cat': {
        const sleep = c.state === 'sleep', stretch = c.state === 'stretch', fur = '#e8944a';
        ctx.save(); ctx.translate(c.x, gy); ctx.scale(-1, 1);
        if (sleep) { E(0, -8, 16, 8, fur); C(10, -12, 6, fur); }
        else if (stretch) { E(0, -9, 20, 6, fur, -0.15); C(16, -16, 6, fur); }
        else { E(0, -12, 11, 10, fur); C(9, -22, 6.5, fur); }
        const hx = sleep ? 10 : stretch ? 16 : 9, hy = sleep ? -12 : stretch ? -16 : -22;
        ctx.fillStyle = fur; ctx.beginPath(); ctx.moveTo(hx - 5, hy - 4); ctx.lineTo(hx - 3, hy - 11); ctx.lineTo(hx, hy - 5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx + 1, hy - 5); ctx.lineTo(hx + 4, hy - 11); ctx.lineTo(hx + 6, hy - 4); ctx.fill();
        if (!sleep) { C(hx - 2, hy - 1, 1.3, night ? '#9cff6a' : '#1c1c1c'); C(hx + 3, hy - 1, 1.3, night ? '#9cff6a' : '#1c1c1c'); }
        ctx.strokeStyle = fur; ctx.lineWidth = 3; ctx.lineCap = 'round'; const tw = Math.sin(now / 500 + c.p) * 6;
        ctx.beginPath(); ctx.moveTo(-10, -8); ctx.quadraticCurveTo(-20, -14 + tw, -24, -2 + tw); ctx.stroke();
        ctx.restore(); break; }
      case 'frog': {
        const pd = pond(), hop = c.state === 'hop' ? -Math.sin(c.s * Math.PI) * 26 : 0, x = c.x, y = pd.y - 4 + hop;
        ctx.save(); ctx.translate(x, y); ctx.scale(c.dir, 1);
        E(0, -6, 11, 7, '#4caf50'); E(-8, -1, 5, 3, '#43a047'); E(8, -1, 5, 3, '#43a047');
        C(-5, -13, 3.6, '#4caf50'); C(5, -13, 3.6, '#4caf50');
        const blink = Math.sin(now / 900 + c.p) > 0.97; if (!blink) { C(-5, -13, 1.6, '#1c1c1c'); C(5, -13, 1.6, '#1c1c1c'); }
        ctx.restore(); break; }
      case 'mosquito': {
        const pd = pond(), x = pd.x + c.dx, y = pd.y + c.dy + Math.sin(now / 60 + c.p) * 1.5;
        C(x, y, 1.3, night ? 'rgba(220,220,240,.8)' : '#3a3a48');
        ctx.strokeStyle = 'rgba(200,200,220,.6)'; ctx.lineWidth = 0.8; const w = Math.sin(now / 25 + c.p) * 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 2 + w); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 2 - w); ctx.stroke();
        break; }
      case 'fish': {
        const pd = pond(), x = pd.x + c.fx * pd.rx, y = pd.y + 2 + Math.sin(now / 400 + c.p) * 2;
        ctx.save(); ctx.translate(x, y); ctx.scale(c.dir, 1); ctx.globalAlpha = 0.9;
        E(0, 0, 7, 3.2, `hsl(${c.hue} 80% 60%)`); ctx.fillStyle = `hsl(${c.hue} 80% 55%)`; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, -3.5); ctx.lineTo(-11, 3.5); ctx.fill();
        C(4, -0.8, 0.8, '#1c1c1c'); ctx.restore(); break; }
      case 'wolf': {
        const howl = c.state === 'howl', col = '#3b3f52';
        ctx.save(); ctx.translate(c.x, gy); ctx.scale(-1, 1);
        E(0, -14, 15, 10, col); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-24, -22 + (howl ? 4 : 0)); ctx.lineTo(-12, -9); ctx.fill(); // tail
        const hx = 14, hy = howl ? -30 : -24;
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(howl ? -0.7 : -0.1);
        E(0, 0, 8, 5.5, col); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(-3, -11); ctx.lineTo(0, -4); ctx.fill(); ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(4, -11); ctx.lineTo(6, -4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(7, -2); ctx.lineTo(14, 1); ctx.lineTo(7, 3); ctx.fill();
        if (!howl) C(2, -1.5, 1.1, '#e8e2ff'); ctx.restore();
        ctx.fillStyle = col; ctx.fillRect(-9, -6, 4, 8); ctx.fillRect(5, -6, 4, 8);
        if (howl) { ctx.strokeStyle = 'rgba(230,230,255,.55)'; ctx.lineWidth = 1.2; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(24, -40, 4 + i * 5 + Math.sin(now / 200) * 1.5, -1.2, 0.2); ctx.stroke(); } }
        ctx.restore(); break; }
      case 'owl': {
        const tr = tree(), x = tr.x - 12, y = tr.y - 46, blink = c.state === 'blink';
        E(x, y - 8, 8, 10, '#8b6a4a'); E(x, y - 4, 6, 6, '#b89a78');
        ctx.fillStyle = '#8b6a4a'; ctx.beginPath(); ctx.moveTo(x - 7, y - 16); ctx.lineTo(x - 5, y - 22); ctx.lineTo(x - 2, y - 16); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 2, y - 16); ctx.lineTo(x + 5, y - 22); ctx.lineTo(x + 7, y - 16); ctx.fill();
        if (!blink) { C(x - 3, y - 11, 2.6, '#fff4c4'); C(x + 3, y - 11, 2.6, '#fff4c4'); C(x - 3 + c.dir * 0.6, y - 11, 1.2, '#1c1c1c'); C(x + 3 + c.dir * 0.6, y - 11, 1.2, '#1c1c1c'); }
        else { ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 5, y - 11); ctx.lineTo(x - 1, y - 11); ctx.moveTo(x + 1, y - 11); ctx.lineTo(x + 5, y - 11); ctx.stroke(); }
        ctx.fillStyle = '#f0a22e'; ctx.beginPath(); ctx.moveTo(x - 1.2, y - 8.5); ctx.lineTo(x + 1.2, y - 8.5); ctx.lineTo(x, y - 6); ctx.fill();
        break; }
      case 'bat': {
        const x = c.bx * W, y = c.by * H, flap = Math.sin(now / 70 + c.p) * 6;
        if (!inMargin(x)) break;
        ctx.fillStyle = '#2a2838'; ctx.beginPath();
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 8, y - 6 + flap, x - 16, y + flap); ctx.quadraticCurveTo(x - 9, y + 2, x - 5, y + 5); ctx.lineTo(x, y + 3);
        ctx.lineTo(x + 5, y + 5); ctx.quadraticCurveTo(x + 9, y + 2, x + 16, y + flap); ctx.quadraticCurveTo(x + 8, y - 6 + flap, x, y); ctx.fill();
        C(x, y + 1, 2.6, '#2a2838'); break; }
      case 'mouse': {
        ctx.save(); ctx.translate(c.x, gy - 1); ctx.scale(c.dir, 1);
        E(0, -3, 6.5, 3.8, '#9a9aa8'); C(6, -4, 2.8, '#9a9aa8'); C(5, -7, 1.6, '#c8b8c8'); C(7.5, -4.2, 0.8, '#1c1c1c');
        ctx.strokeStyle = '#9a9aa8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-12, -8 + Math.sin(now / 200) * 2, -15, -1); ctx.stroke();
        ctx.restore(); break; }
    }
  }
  function drawCreatures(now, night) {
    creatures.forEach(c => { if (awake(c, night) || c.type === 'cat' || c.type === 'fish') drawCreature(c, now, night); });
  }
  function creatureAt(x, y, night) {
    let best = null, bd = 30;
    creatures.forEach(c => {
      if (!(awake(c, night) || c.type === 'cat' || c.type === 'fish')) return;
      let cx = c.x, cy = hillY(c.x) - 8;
      if (c.type === 'fish') { const pd = pond(); cx = pd.x + c.fx * pd.rx; cy = pd.y; }
      if (c.type === 'mosquito') { const pd = pond(); cx = pd.x + c.dx; cy = pd.y + c.dy; }
      if (c.type === 'frog') cy = pond().y - 8;
      if (c.type === 'owl') { const tr = tree(); cx = tr.x - 12; cy = tr.y - 54; }
      if (c.type === 'bat') { cx = c.bx * W; cy = c.by * H; }
      if (c.type === 'mealworms') { cx = soil().x; cy = soil().y; }
      if (c.type === 'cockroach' && c.hidden) { cx = rock().x; cy = rock().y - 4; }
      const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = c; }
    });
    return best;
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
      updateCreatures(dt, now, night);
      fireflies.forEach(ff => {
        ff.x += ff.dx * dt * 0.004; ff.y += ff.dy * dt * 0.003;
        if (Math.random() < 0.02) { ff.dx = rnd(-1, 1); ff.dy = rnd(-1, 1); }
        ff.x = clamp(ff.x, 0, 1); ff.y = clamp(ff.y, 0.5, 0.92);
        if (ff.pull) { ff.x = lerp(ff.x, ff.pull.x / W, 0.04); ff.y = lerp(ff.y, ff.pull.y / H, 0.04); }
      });
    }

    // paint
    ctx.clearRect(0, 0, W, H);
    ctx.save(); clipMargins();
    drawSky(p);                       // the page itself stays crisp whatever the hour
    drawStars(p, now);
    drawSunMoon(p);
    shooting.forEach(s => {
      ctx.strokeStyle = `rgba(255,250,220,${s.life})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); ctx.stroke();
    });
    drawClouds(dt, p);
    drawGround(now, p);
    drawFeatures(now, night);
    flowers.forEach(f => drawFlower(f, now));
    if (rabbit && !night) drawRabbit(rabbit, now, p);
    drawCreatures(now, night);
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
    const hit = creatureAt(x, y, night);
    if (hit) { poke(hit); if (rabbit && !night && Math.abs(rabbit.x - x) < 30) rabbit.hop = 0.01; return; }
    if (rabbit && !night && Math.abs(rabbit.x - x) < 30 && Math.abs(hillY(rabbit.x) - y) < 40) { rabbit.hop = 0.01; return; }
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

  /* -- the members' lab ---------------------------------------------------
     A field lab on the far ridge, so the rabbit and the little ones pass in
     front of it. It needs room: on a narrow window there is no margin to put a
     building in, so it is left out and the tab in the bottom bar is the way in.
     The door is a real button over the drawing, which gives it a cursor, a
     focus ring and a name a screen reader can read. */
  const LAB_MIN_MARGIN = 150;
  const ridgeY = x => groundY() + 30 - Math.sin(x / 260) * 22 - Math.cos(x / 97) * 6;
  function labBox() {
    const mw = marginW('left');
    if (mw < LAB_MIN_MARGIN) return null;
    const w = clamp(mw * 0.52, 84, 152), h = w * 1.14;
    const x = sideX('left', 0.5), base = ridgeY(x) + 4;
    return { x, base, w, h, l: x - w / 2, t: base - h, w2: w, h2: base - (base - h) };
  }
  function roundRect(x, y, w, h, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
  function drawLab(now, night) {
    const b = labBox(); if (!b) return;
    const w = b.w, h = b.h, x = b.x, base = b.base, t = reduced ? 0 : now / 1000;
    const wallW = w * 0.82, wallH = h * 0.52, wallL = x - wallW / 2, wallT = base - wallH;
    const roofH = h * 0.30, roofT = wallT - roofH;

    E(x, base + 2, wallW * 0.60, 5, night ? 'rgba(0,0,0,.28)' : 'rgba(60,90,60,.16)');

    // chimney, with a slow curl of smoke
    const chW = w * 0.10, chX = wallL + wallW * 0.74, chT = roofT + roofH * 0.34;
    ctx.fillStyle = night ? '#38446a' : '#8c7862'; ctx.fillRect(chX, chT, chW, wallT - chT + 2);
    if (!reduced) for (let i = 0; i < 3; i++) {
      const k = (t * 0.32 + i / 3) % 1;
      C(chX + chW / 2 + Math.sin(k * 4 + i) * 6, chT - k * h * 0.40, w * 0.05 * (0.55 + k),
        (night ? 'rgba(185,195,220,' : 'rgba(255,255,255,') + (0.45 * (1 - k)).toFixed(3) + ')');
    }

    // roof, then walls
    ctx.fillStyle = night ? '#2e3a5e' : '#4a6fa5';
    ctx.beginPath(); ctx.moveTo(wallL - w * 0.08, wallT + 2); ctx.lineTo(x, roofT);
    ctx.lineTo(wallL + wallW + w * 0.08, wallT + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = night ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.moveTo(x, roofT); ctx.lineTo(wallL + wallW + w * 0.08, wallT + 2);
    ctx.lineTo(x, wallT + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = night ? '#26304d' : '#f7f2e6'; ctx.fillRect(wallL, wallT, wallW, wallH);
    ctx.strokeStyle = night ? 'rgba(255,255,255,.12)' : 'rgba(60,70,90,.20)';
    ctx.lineWidth = 1; ctx.strokeRect(wallL + 0.5, wallT + 0.5, wallW - 1, wallH - 1);

    // a window each side of the door; a flask bubbles away in the left one
    const wnW = wallW * 0.20, wnH = wallH * 0.26, wnY = wallT + wallH * 0.40;
    [wallL + wallW * 0.10, wallL + wallW * 0.70].forEach((wx, i) => {
      ctx.fillStyle = night ? '#f6d79a' : '#cfe6f7'; ctx.fillRect(wx, wnY, wnW, wnH);
      ctx.strokeStyle = night ? 'rgba(40,50,80,.5)' : 'rgba(70,90,120,.45)';
      ctx.beginPath(); ctx.moveTo(wx + wnW / 2, wnY); ctx.lineTo(wx + wnW / 2, wnY + wnH);
      ctx.moveTo(wx, wnY + wnH / 2); ctx.lineTo(wx + wnW, wnY + wnH / 2); ctx.stroke();
      ctx.strokeRect(wx + 0.5, wnY + 0.5, wnW - 1, wnH - 1);
      if (i === 0) {
        const fx = wx + wnW / 2, fb = wnY + wnH * 0.86, fw = wnW * 0.42;
        ctx.fillStyle = night ? 'rgba(120,220,190,.95)' : '#3fb28a';
        ctx.beginPath(); ctx.moveTo(fx - fw * 0.18, fb - wnH * 0.52); ctx.lineTo(fx - fw * 0.5, fb);
        ctx.lineTo(fx + fw * 0.5, fb); ctx.lineTo(fx + fw * 0.18, fb - wnH * 0.52); ctx.closePath(); ctx.fill();
        if (!reduced) for (let k = 0; k < 2; k++) {
          const u = (t * 0.6 + k / 2) % 1;
          C(fx + Math.sin(u * 6 + k) * fw * 0.2, fb - u * wnH * 0.75, Math.max(0.8, fw * 0.13 * (1 - u * 0.5)),
            'rgba(255,255,255,' + (0.7 * (1 - u)).toFixed(3) + ')');
        }
      }
    });

    // the door, with the light of the lab behind it
    const dW = wallW * 0.30, dH = wallH * 0.54, dL = x - dW / 2, dT = base - dH;
    if (night) { const g = ctx.createRadialGradient(x, dT + dH * 0.5, 1, x, dT + dH * 0.5, dW * 1.9);
      g.addColorStop(0, 'rgba(255,214,140,.5)'); g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g; ctx.fillRect(x - dW * 2, dT - dW, dW * 4, dH + dW * 2); }
    ctx.fillStyle = night ? '#f3c579' : '#9a6b3f';
    ctx.beginPath(); ctx.moveTo(dL, base); ctx.lineTo(dL, dT + dW * 0.42);
    ctx.quadraticCurveTo(x, dT - dW * 0.14, dL + dW, dT + dW * 0.42); ctx.lineTo(dL + dW, base);
    ctx.closePath(); ctx.fill();
    C(x, dT + dW * 0.34, dW * 0.16, night ? 'rgba(60,45,25,.55)' : 'rgba(255,255,255,.55)');
    C(dL + dW * 0.80, base - dH * 0.44, Math.max(1.2, dW * 0.07), night ? '#7a5a2e' : '#f0d9a4');
    // two steps down to the grass
    ctx.fillStyle = night ? 'rgba(210,218,238,.20)' : 'rgba(255,255,255,.5)';
    for (let i = 0; i < 2; i++) ctx.fillRect(x - dW * (0.62 + i * 0.22), base + i * 3.2, dW * (1.24 + i * 0.44), 3);

    // the sign over the door
    const fs = clamp(w * 0.118, 8.5, 13.5);
    ctx.font = '700 ' + fs.toFixed(1) + 'px Fredoka, ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = 'Members\u2019 lab';
    const sgW = Math.min(ctx.measureText(label).width + fs * 1.2, wallW - 4), sgH = fs * 1.72;
    const sgY = wallT + wallH * 0.17;
    roundRect(x - sgW / 2, sgY - sgH / 2, sgW, sgH, sgH * 0.36, night ? '#f0d9a4' : '#1d2a44');
    ctx.fillStyle = night ? '#20304f' : '#fdf6e3';
    ctx.fillText(label, x, sgY + 0.5);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /* The door is a real button sitting over the drawing. */
  let door = null;
  function placeDoor() {
    const b = on ? labBox() : null;
    if (!b) { if (door) door.style.display = 'none'; return; }
    if (!door) {
      door = document.createElement('button');
      door.id = 'lab-door'; door.type = 'button';
      door.title = 'Members\u2019 lab';
      door.setAttribute('aria-label', 'Members\u2019 lab, go in');
      door.onclick = () => {
        const r = door.getBoundingClientRect();
        if (typeof window.enterLab === 'function') window.enterLab(r);
        else location.href = 'lab.html';
      };
      document.body.appendChild(door);
    }
    door.style.display = 'block';
    door.style.left = b.l + 'px'; door.style.top = b.t + 'px';
    door.style.width = b.w + 'px'; door.style.height = (b.base - b.t) + 'px';
  }

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
