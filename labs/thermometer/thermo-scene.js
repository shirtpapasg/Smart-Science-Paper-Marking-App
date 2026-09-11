/* <thermo-scene> — three.js bench for "What's the temperature?" (6.1).
   Built the same way conductor-scene.js is.
   Attributes: experiment (touch|measure), cup (a|b|c|d|e|none),
               action (dip|probe|none), eye (above|level|below),
               depth (ok|bottom|0–100), view (apparatus|zoom|both|eyeline),
               head (-100..100, eye height above/below the liquid top),
               temps ("a:14,b:23,c:36,d:42,e:51")
   Dispatches on window: "thermo" about every 90 ms with
     { experiment, cup, trueTemp, shownTemp, steady, feeling, dip, depthOk, eye }
   "thermo-settled" once when a reading stops changing,
   "thermo-dipped" once when a two-second finger dip finishes,
   "thermo-pick"   when a cup is tapped on the bench.
   The only words drawn in this file are the cup letters A–E, the scale
   numbers and the two caption chips. */
(() => {
  if (window.__thermoScene) return;
  window.__thermoScene = true;

  const ROOM = 28, TMAX = 70, RISE = 1.15, SETTLE = 4.0, DIP = 2.0;
  /* how deep the bulb sits: 0 = held in the air above the water,
     100 = resting on the bottom of the cup */
  const DEEP_TOP = 0.092, DEEP_BOTTOM = 0.0155, AIR_BELOW = 34, BOTTOM_ABOVE = 88;
  const IDS = ['a', 'b', 'c', 'd', 'e'];
  const XS = { a: -0.18, b: -0.09, c: 0, d: 0.09, e: 0.18 };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* pure physics: the liquid column creeps towards the water temperature */
  function physics(trueTemp, startTemp, tSec) {
    const t = Math.max(0, isFinite(tSec) ? tSec : 0);
    const steady = t >= SETTLE;
    const k = 1 - Math.exp(-t / RISE);
    return { t, steady, value: steady ? trueTemp : startTemp + (trueTemp - startTemp) * k };
  }

  /* a finger adapts: after a hot cup the next feels cooler than it is */
  const FEEL = [[19, 'icy'], [29, 'cool'], [40, 'warm'], [50, 'hot'], [1e4, 'very hot']];
  function feel(trueTemp, prevTemp) {
    const p = (prevTemp === null || prevTemp === undefined)
      ? trueTemp : trueTemp + (trueTemp - prevTemp) * 0.38;
    for (let i = 0; i < FEEL.length; i++) if (p < FEEL[i][0]) return FEEL[i][1];
    return 'very hot';
  }

  /* sight line from the eye, through the top of the liquid, onto the scale
     plate 6.8 mm behind it — that is the whole parallax error */
  const PLATE = 0.0068, EYE_DIST = 0.17, PER_DEG = 0.126 / TMAX, HEAD_RANGE = 0.105;
  function parallax(head, dist) {
    const dy = (clamp(isFinite(head) ? head : 0, -100, 100) / 100) * HEAD_RANGE;
    const d = isFinite(dist) && dist > 0.02 ? dist : EYE_DIST;
    return clamp(-(PLATE / d) * dy / PER_DEG, -6, 6);
  }

  function zoneOf(d) {
    const v = clamp(isFinite(d) ? d : 55, 0, 100);
    return v < AIR_BELOW ? 'air' : v > BOTTOM_ABOVE ? 'bottom' : 'ok';
  }
  /* a badly placed bulb settles on a wrong number: in the air it reads the
     room, on the bottom it reads the cup, which the bench has pulled part of
     the way back towards room temperature */
  function targetFor(zone, trueTemp) {
    if (zone === 'air') return ROOM;
    if (zone === 'bottom') return trueTemp + (ROOM - trueTemp) * 0.35;
    return trueTemp;
  }

  window.thermoPhysics = physics;
  window.thermoFeel = feel;
  window.thermoParallax = parallax;
  window.thermoZone = zoneOf;
  window.thermoTarget = targetFor;

  const tempColor = (T3, t) => new T3.Color().lerpColors(
    new T3.Color(0x4a90e2), new T3.Color(0xff6a5e),
    Math.pow(clamp((t - 8) / 52, 0, 1), 1.4));

  class ThermoScene extends HTMLElement {
    static get observedAttributes() { return ['experiment', 'cup', 'action', 'eye', 'depth', 'view', 'temps', 'head']; }

    constructor() {
      super();
      this.cfg = { experiment: 'touch', cup: 'none', action: 'none', eye: 'level', depth: 'ok', view: 'both', temps: '' };
      this.temps = { a: 14, b: 23, c: 36, d: 42, e: 51 };
      this.cam = { az: 0.34, el: 0.2, dist: 0.72 };
      this.elTarget = 0.2;
      this.last = 0; this.emitAt = 0;
      this.probeT = -1; this.dipT = -1;
      this.startTemp = ROOM; this.shown = ROOM;
      this.settled = false; this.dipDone = false;
      this.prevDip = null;
      this.head = 0;
      this.eyeDist = EYE_DIST;
    }

    attributeChangedCallback(n, o, v) {
      const val = v == null ? '' : String(v);
      if (n === 'temps') { this.setTemps(val); return; }
      if (n === 'head') {
        const h = parseFloat(val);
        if (isFinite(h)) this.head = clamp(h, -100, 100);
        return;
      }
      const was = this.cfg[n];
      this.cfg[n] = val || (n === 'cup' || n === 'action' ? 'none' : this.cfg[n]);
      if (n === 'cup' && this.cfg.cup !== was) {
        /* a new cup restarts whatever the hand or the thermometer was doing */
        this.settled = false; this.dipDone = false;
        this.startTemp = this.shown;
        this.probeT = this.cfg.action === 'probe' ? 0 : -1;
        this.dipT = this.cfg.action === 'dip' ? 0 : -1;
      }
      if (n === 'action' && this.cfg.action !== was) {
        if (this.cfg.action === 'dip') { this.dipT = 0; this.dipDone = false; }
        else if (this.cfg.action === 'probe') { this.probeT = 0; this.settled = false; this.startTemp = this.shown; }
        else { this.dipT = -1; this.probeT = -1; }
      }
      if (n === 'eye' && this.cfg.eye !== was) {
        this.elTarget = this.cfg.eye === 'above' ? 0.68 : this.cfg.eye === 'below' ? -0.04 : 0.16;
        this.head = this.cfg.eye === 'above' ? 100 : this.cfg.eye === 'below' ? -100 : 0;
      }
    }

    setTemps(raw) {
      if (!raw) return;
      const out = {};
      raw.split(',').forEach(pair => {
        const bits = pair.split(':');
        const id = (bits[0] || '').trim().toLowerCase();
        const t = parseFloat(bits[1]);
        if (IDS.indexOf(id) >= 0 && isFinite(t)) out[id] = t;
      });
      if (Object.keys(out).length) this.temps = Object.assign({}, this.temps, out);
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', background: '#08131f' });
      this.caps = document.createElement('div');
      this.caps.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:Nunito,system-ui,sans-serif';
      this.caps.innerHTML =
        '<div data-cap="a" style="position:absolute;left:14px;bottom:12px;padding:5px 12px;border-radius:999px;background:rgba(7,13,21,.78);border:1px solid rgba(255,255,255,.14);color:#8a98a6;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Apparatus</div>' +
        '<div data-cap="p" style="position:absolute;right:14px;bottom:12px;padding:5px 12px;border-radius:999px;background:rgba(7,13,21,.78);border:1px solid rgba(255,106,94,.35);color:#ff6a5e;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Liquid zoom</div>' +
        '<div data-cap="e" style="position:absolute;left:14px;bottom:12px;padding:5px 12px;border-radius:999px;background:rgba(7,13,21,.78);border:1px solid rgba(255,182,39,.4);color:#ffb627;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Eye line</div>' +
        '<div data-cap="frame" style="position:absolute;top:8px;bottom:8px;right:8px;left:8px;border:1px solid rgba(255,106,94,.28);border-radius:16px;box-shadow:inset 0 0 26px rgba(255,106,94,.06)"></div>';
      this.appendChild(this.caps);
      this.boot();
    }

    async boot() {
      try { await this.build(); } catch (e) { console.error('thermo-scene', e); }
    }

    async build() {
      const THREE = await import('https://unpkg.com/three@0.184.0/build/three.module.js');
      this.THREE = THREE;
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.22;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.insertBefore(r.domElement, this.caps);
      this.r = r;

      const grain = this.grainTex();
      this.mats = {
        steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0x9aa7b4, metalness: 0.9, roughness: 0.32 }),
        dark: new THREE.MeshStandardMaterial({ name: 'matte_black', color: 0x1b283a, metalness: 0.2, roughness: 0.85 }),
        felt: new THREE.MeshStandardMaterial({ name: 'bench_felt', color: 0x0a1622, roughness: 1, bumpMap: grain, bumpScale: 0.14 }),
        silicone: new THREE.MeshStandardMaterial({ name: 'silicone_cover', color: 0x35465c, roughness: 0.72, metalness: 0.05 }),
        cupGlass: new THREE.MeshStandardMaterial({ name: 'cup_glass', color: 0xcfe6f5, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
        water: new THREE.MeshStandardMaterial({ name: 'cup_water', color: 0x3f86cf, roughness: 0.16, transparent: true, opacity: 0.74 }),
        tubeGlass: new THREE.MeshStandardMaterial({ name: 'tube_glass', color: 0xdff1ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
        dye: new THREE.MeshStandardMaterial({ name: 'coloured_liquid', color: 0xff6a5e, roughness: 0.3, emissive: 0x6e1a12, emissiveIntensity: 0.75 }),
        skin: new THREE.MeshStandardMaterial({ name: 'hand', color: 0xe8b489, roughness: 0.72, emissive: 0x2e1a0c, emissiveIntensity: 0.6 }),
        board: new THREE.MeshStandardMaterial({ name: 'magnetic_board', color: 0x101b28, roughness: 0.9 }),
        tile: new THREE.MeshStandardMaterial({ name: 'letter_tile', color: 0x22303f, roughness: 0.7 })
      };

      this.buildBench();
      this.buildZoom();
      const env = this.makeEnv();
      this.sA.environment = env; this.sZ.environment = env;
      this.sA.environmentIntensity = 0.55; this.sZ.environmentIntensity = 0.7;

      this.camA = new THREE.PerspectiveCamera(38, 1, 0.02, 12);
      this.camZ = new THREE.PerspectiveCamera(40, 1, 0.02, 12);
      this.camE = new THREE.PerspectiveCamera(25, 1, 0.004, 8);
      this.zAngle = 0;
      this.ray = new THREE.Raycaster();

      this.bindPointer();
      new ResizeObserver(() => this.resize()).observe(this);
      this.resize();
      /* own rAF chain: the next frame is requested before this one runs, so a
         single bad frame can never stop the bench */
      const loop = (ms) => {
        this._raf = requestAnimationFrame(loop);
        try { this.frame(ms); } catch (e) { console.error('thermo-scene frame', e); }
      };
      this._raf = requestAnimationFrame(loop);
    }

    grainTex() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#808080'; cx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2400; i++) {
        const v = Math.round(104 + Math.random() * 96);
        cx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        cx.fillRect(Math.random() * 128, Math.random() * 128, 2.4, 2.4);
      }
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(4, 4);
      return tex;
    }

    makeEnv() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 128;
      const cx = cv.getContext('2d');
      const g = cx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#eaf6ff');
      g.addColorStop(0.38, '#7fb2d8');
      g.addColorStop(0.52, '#16293a');
      g.addColorStop(1, '#05090f');
      cx.fillStyle = g; cx.fillRect(0, 0, 64, 128);
      cx.fillStyle = 'rgba(102,204,255,0.5)'; cx.fillRect(6, 20, 16, 28);
      cx.fillStyle = 'rgba(255,255,255,0.7)'; cx.fillRect(40, 10, 14, 22);
      const tex = new T.CanvasTexture(cv);
      tex.mapping = T.EquirectangularReflectionMapping;
      tex.colorSpace = T.SRGBColorSpace;
      const pm = new T.PMREMGenerator(this.r);
      const env = pm.fromEquirectangular(tex).texture;
      pm.dispose();
      return env;
    }

    chip(text, color, w) {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = 192; cv.height = 96;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 192, 96);
      cx.beginPath();
      if (cx.roundRect) cx.roundRect(46, 18, 100, 60, 30); else cx.rect(46, 18, 100, 60);
      cx.fillStyle = 'rgba(7,13,21,.88)'; cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = color; cx.stroke();
      cx.font = '900 40px Nunito, system-ui, sans-serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = color;
      cx.fillText(text, 96, 50);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'letter_chip';
      sp.renderOrder = 22;
      const ww = w || 0.062;
      sp.scale.set(ww, ww * 0.5, 1);
      return sp;
    }

    /* the thermometer scale: 0–70 in tens, minor ticks every 2 degrees */
    scaleTex() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 1600;
      const cx = cv.getContext('2d');
      cx.scale(2, 2);
      cx.fillStyle = '#e8eef4'; cx.fillRect(0, 0, 160, 800);
      cx.fillStyle = 'rgba(10,19,32,.09)'; cx.fillRect(96, 0, 64, 800);
      const y = (t) => 800 - (t / TMAX) * 786 - 7;
      cx.strokeStyle = '#2a3a4b';
      for (let t = 0; t <= TMAX; t += 2) {
        const major = t % 10 === 0;
        cx.lineWidth = major ? 5 : 2.5;
        cx.beginPath();
        cx.moveTo(major ? 8 : 34, y(t));
        cx.lineTo(major ? 66 : 58, y(t));
        cx.stroke();
      }
      cx.fillStyle = '#16232f';
      cx.textAlign = 'left'; cx.textBaseline = 'middle';
      cx.font = '900 40px Nunito, system-ui, sans-serif';
      for (let t = 0; t <= TMAX; t += 10) cx.fillText(String(t), 76, y(t));
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    /* ---------------- the bench ---------------- */
    buildBench() {
      const T = this.THREE, M = this.mats;
      const s = new T.Scene();
      s.background = new T.Color(0x08131f);
      s.fog = new T.Fog(0x08131f, 1.15, 3.1);
      this.sA = s;

      s.add(new T.HemisphereLight(0x9fd0ff, 0x0a1420, 0.95));
      const d = new T.DirectionalLight(0xffffff, 2.9);
      d.position.set(0.45, 0.95, 0.55);
      d.castShadow = true;
      d.shadow.mapSize.set(1024, 1024);
      d.shadow.camera.left = d.shadow.camera.bottom = -0.7;
      d.shadow.camera.right = d.shadow.camera.top = 0.7;
      s.add(d);
      const rim = new T.PointLight(0x66ccff, 2.6, 3.4);
      rim.position.set(-0.5, 0.5, -0.4);
      s.add(rim);
      const warm = new T.PointLight(0xff8a6e, 1.2, 2.4);
      warm.position.set(0.4, 0.5, 0.34);
      s.add(warm);

      const bench = new T.Mesh(new T.CylinderGeometry(0.48, 0.48, 0.012, 64), M.felt);
      bench.name = 'bench'; bench.position.y = -0.006; bench.receiveShadow = true;
      s.add(bench);

      this.cups = {};
      this.picks = [];
      IDS.forEach((id, i) => {
        const x = XS[id];
        const g = new T.Group(); g.name = 'cup_' + id; g.position.set(x, 0, 0);
        const wall = new T.Mesh(new T.CylinderGeometry(0.034, 0.03, 0.062, 40, 1, true), M.cupGlass);
        wall.name = 'cup_wall'; wall.position.y = 0.037; g.add(wall);
        const base = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.005, 40), M.cupGlass);
        base.name = 'cup_base'; base.position.y = 0.0085; g.add(base);
        const rim = new T.Mesh(new T.TorusGeometry(0.034, 0.0018, 8, 44), M.steel);
        rim.name = 'cup_rim'; rim.rotation.x = Math.PI / 2; rim.position.y = 0.068; g.add(rim);
        /* every cup looks identical — the temperatures are hidden */
        const water = new T.Mesh(new T.CylinderGeometry(0.0322, 0.0285, 0.05, 40), M.water.clone());
        water.name = 'cup_water'; water.position.y = 0.034; g.add(water);
        const cover = new T.Group(); cover.name = 'silicone_cover';
        const lid = new T.Mesh(new T.CylinderGeometry(0.037, 0.037, 0.007, 40), M.silicone);
        lid.name = 'cover_disc'; lid.castShadow = true; cover.add(lid);
        const knob = new T.Mesh(new T.SphereGeometry(0.0062, 16, 12), M.silicone);
        knob.name = 'cover_knob'; knob.position.y = 0.008; cover.add(knob);
        cover.position.set(0, 0.072, 0);
        g.add(cover);
        const hit = new T.Mesh(new T.CylinderGeometry(0.046, 0.046, 0.14, 12),
          new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.name = 'cup_hit'; hit.position.y = 0.06; hit.userData.cupId = id;
        g.add(hit);
        this.picks.push(hit);
        const chip = this.chip(id.toUpperCase(), '#ffb627', 0.066);
        chip.position.set(0, 0.118, 0);
        g.add(chip);
        s.add(g);
        this.cups[id] = { grp: g, cover, water, waterMat: water.material, chip, x };
      });

      /* magnetic board with five letter tiles */
      const board = new T.Group(); board.name = 'magnetic_board';
      board.position.set(0, 0.085, -0.42); board.rotation.x = -0.12; board.scale.setScalar(0.95);
      const panel = new T.Mesh(new T.BoxGeometry(0.32, 0.1, 0.006), M.board);
      panel.name = 'board_panel'; panel.position.y = 0.06; board.add(panel);
      const trim = new T.Mesh(new T.BoxGeometry(0.33, 0.008, 0.012), M.steel);
      trim.name = 'board_trim'; trim.position.y = 0.008; board.add(trim);
      IDS.forEach((id, i) => {
        const tile = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.006), M.tile);
        tile.name = 'tile_' + id;
        tile.position.set(-0.12 + i * 0.06, 0.06, 0.006);
        board.add(tile);
        const face = new T.Mesh(new T.PlaneGeometry(0.036, 0.036), new T.MeshBasicMaterial({
          map: this.letterTex(id.toUpperCase()), transparent: true, toneMapped: false
        }));
        face.name = 'tile_face_' + id;
        face.position.set(-0.12 + i * 0.06, 0.06, 0.0098);
        board.add(face);
      });
      this.sA.add(board);

      /* the thermometer and its stand */
      const stand = new T.Group(); stand.name = 'thermometer_stand';
      stand.position.set(0.26, 0, 0.07);
      const foot = new T.Mesh(new T.BoxGeometry(0.08, 0.012, 0.06), M.dark);
      foot.name = 'stand_base'; foot.position.y = 0.006; foot.castShadow = true; stand.add(foot);
      const rod = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.2, 16), M.steel);
      rod.name = 'stand_rod'; rod.position.y = 0.1; stand.add(rod);
      const armMesh = new T.Mesh(new T.BoxGeometry(0.05, 0.008, 0.008), M.dark);
      armMesh.name = 'stand_clip'; armMesh.position.set(-0.02, 0.16, 0); stand.add(armMesh);
      s.add(stand);

      const th = new T.Group(); th.name = 'thermometer';
      const bulb = new T.Mesh(new T.SphereGeometry(0.009, 20, 16), M.dye);
      bulb.name = 'bulb'; th.add(bulb);
      const tube = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.15, 20, 1, true), M.tubeGlass);
      tube.name = 'tube'; tube.position.y = 0.078; th.add(tube);
      const cap = new T.Mesh(new T.SphereGeometry(0.0052, 14, 10), M.tubeGlass);
      cap.name = 'tube_cap'; cap.position.y = 0.153; th.add(cap);
      const col = new T.Mesh(new T.CylinderGeometry(0.0034, 0.0034, 1, 16), M.dye);
      col.name = 'liquid_column'; col.position.y = 0.004; th.add(col);
      const plate = new T.Mesh(new T.PlaneGeometry(0.028, 0.128), new T.MeshStandardMaterial({
        name: 'scale_plate', map: this.scaleTex(), roughness: 0.6, side: T.DoubleSide
      }));
      plate.name = 'scale_plate'; plate.position.set(0, 0.07, -0.0068); th.add(plate);
      th.position.set(0.24, 0.075, 0.07);
      s.add(th);
      const sight = new T.Mesh(new T.BoxGeometry(0.058, 0.0011, 0.0008), new T.MeshBasicMaterial({
        name: 'sight_line', color: 0xffb627, transparent: true, opacity: 0.96,
        depthTest: false, depthWrite: false, toneMapped: false, fog: false
      }));
      sight.name = 'sight_line'; sight.renderOrder = 24; sight.visible = false;
      s.add(sight);
      this.sight = sight;
      this.th = { grp: th, col, bulb, mat: M.dye };
      this.thTarget = new T.Vector3(0.24, 0.075, 0.07);

      /* the hand that does the finger test */
      const hand = new T.Group(); hand.name = 'hand';
      const palm = new T.Mesh(new T.BoxGeometry(0.052, 0.02, 0.042), M.skin);
      palm.name = 'palm'; palm.castShadow = true; hand.add(palm);
      const knuckle = new T.Mesh(new T.SphereGeometry(0.013, 16, 12), M.skin);
      knuckle.name = 'knuckle'; knuckle.position.set(-0.018, 0.002, 0.01); hand.add(knuckle);
      const finger = new T.Mesh(new T.CylinderGeometry(0.0058, 0.0052, 0.05, 14), M.skin);
      finger.name = 'finger'; finger.position.set(0.014, -0.028, 0.008); hand.add(finger);
      const tip = new T.Mesh(new T.SphereGeometry(0.0055, 14, 10), M.skin);
      tip.name = 'finger_tip'; tip.position.set(0.014, -0.053, 0.008); hand.add(tip);
      hand.rotation.z = 0.12;
      hand.position.set(0, 0.22, 0.04);
      hand.visible = false;
      s.add(hand);
      this.hand = hand;
    }

    letterTex(ch) {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 96, 96);
      cx.font = '900 68px Nunito, system-ui, sans-serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = '#a87f2c';
      cx.fillText(ch, 48, 52);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    /* ---------------- liquid zoom: why the column moves ---------------- */
    buildZoom() {
      const T = this.THREE;
      const s = new T.Scene();
      s.background = new T.Color(0x0b0f16);
      this.sZ = s;
      s.add(new T.HemisphereLight(0xbfe4ff, 0x0a1420, 0.95));
      const d = new T.DirectionalLight(0xffffff, 1.15); d.position.set(0.4, 0.8, 0.7); s.add(d);

      const bulb = new T.Mesh(new T.SphereGeometry(0.075, 32, 24), this.mats.tubeGlass);
      bulb.name = 'zoom_bulb'; bulb.position.y = 0.08; s.add(bulb);
      const stem = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.32, 24, 1, true), this.mats.tubeGlass);
      stem.name = 'zoom_stem'; stem.position.y = 0.3; s.add(stem);
      const fill = new T.Mesh(new T.CylinderGeometry(0.0155, 0.0155, 1, 20), this.mats.dye.clone());
      fill.name = 'zoom_column'; s.add(fill);
      this.zCol = fill;

      const geo = new T.SphereGeometry(0.0092, 14, 11);
      this.zParts = [];
      const mat = new T.MeshStandardMaterial({ name: 'liquid_particle', color: 0xff6a5e, emissive: 0xff6a5e, emissiveIntensity: 0.3, roughness: 0.35 });
      this.zMat = mat;
      for (let i = 0; i < 44; i++) {
        const m = new T.Mesh(geo, mat);
        m.name = 'particle';
        const r = 0.058 * Math.cbrt(Math.random());
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        m.userData.home = new T.Vector3(
          r * Math.sin(ph) * Math.cos(th),
          0.08 + r * Math.cos(ph) * 0.86,
          r * Math.sin(ph) * Math.sin(th));
        m.userData.seed = Math.random() * 6.28;
        m.position.copy(m.userData.home);
        s.add(m);
        this.zParts.push(m);
      }
    }

    /* ---------------- interaction ---------------- */
    bindPointer() {
      const el = this.r.domElement;
      let drag = null, moved = 0;
      el.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY };
        moved = 0;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
        if (this.view() === 'eyeline') {
          this.head = clamp(this.head - (e.clientY - drag.y) * 0.55, -100, 100);
          window.dispatchEvent(new CustomEvent('thermo-head', { detail: { head: this.head } }));
        } else {
          this.cam.az -= (e.clientX - drag.x) * 0.006;
          this.elTarget = clamp(this.elTarget + (e.clientY - drag.y) * 0.005, -0.1, 1.1);
        }
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', e => {
        drag = null;
        if (moved < 7) this.pickCup(e);
      });
      el.addEventListener('wheel', e => {
        e.preventDefault();
        const k = 1 + Math.sign(e.deltaY) * 0.08;
        if (this.view() === 'eyeline') this.eyeDist = clamp(this.eyeDist * k, 0.075, 0.46);
        else this.cam.dist = clamp(this.cam.dist * k, 0.3, 1.7);
      }, { passive: false });
    }

    pickCup(e) {
      if (!this.camA || this.view() === 'zoom') return;
      const rect = this.r.domElement.getBoundingClientRect();
      const paneW = this.view() === 'both' ? Math.round(this.vw * 0.68) : this.vw;
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x > paneW) return;
      const T = this.THREE;
      this.ray.setFromCamera(new T.Vector2((x / paneW) * 2 - 1, -(y / this.vh) * 2 + 1), this.camA);
      const hit = this.ray.intersectObjects(this.picks, false)[0];
      if (hit) window.dispatchEvent(new CustomEvent('thermo-pick', { detail: { cup: hit.object.userData.cupId } }));
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    view() { return this.cfg.view || 'both'; }
    exp() { return this.cfg.experiment === 'measure' ? 'measure' : 'touch'; }
    activeCup() { return IDS.indexOf(this.cfg.cup) >= 0 ? this.cfg.cup : null; }

    depthVal() {
      const d = this.cfg.depth;
      const n = parseFloat(d);
      if (isFinite(n)) return clamp(n, 0, 100);
      return d === 'bottom' ? 100 : 55;
    }

    /* ---------------- per frame ---------------- */
    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const T = this.THREE, exp = this.exp(), view = this.view();
      const eyeOn = view === 'eyeline';
      const cup = this.activeCup();
      const trueTemp = cup ? this.temps[cup] : ROOM;
      const dv = this.depthVal(), zone = zoneOf(dv), depthOk = zone === 'ok';

      /* covers lift off the active cup */
      IDS.forEach(id => {
        const c = this.cups[id], on = id === cup;
        /* in the first-person view the cover is set down behind the cup and the
           letter chips step aside, so nothing crosses the scale */
        /* set the cover down flat on the bench behind the cup */
        const ty = on ? (eyeOn ? 0.006 : 0.128) : 0.072;
        const tz = on ? (eyeOn ? -0.085 : 0.055) : 0;
        const tx = on && eyeOn ? -0.075 : 0;
        c.cover.position.x = lerp(c.cover.position.x, tx, 0.12);
        c.cover.position.y = lerp(c.cover.position.y, ty, 0.12);
        c.cover.position.z = lerp(c.cover.position.z, tz, 0.12);
        c.cover.rotation.x = lerp(c.cover.rotation.x, on && !eyeOn ? 0.7 : 0, 0.12);
        const lit = on ? 1 : 0;
        c.chip.material.opacity = lerp(c.chip.material.opacity, eyeOn ? 0 : 0.8 + 0.2 * lit, 0.12);
        c.grp.position.y = lerp(c.grp.position.y, on ? 0.004 : 0, 0.12);
      });

      /* the finger test */
      let dip = 0;
      if (exp === 'touch' && cup && this.dipT >= 0) {
        this.dipT += dt;
        dip = clamp(this.dipT / DIP, 0, 1);
        if (!this.dipDone && this.dipT >= DIP) {
          this.dipDone = true;
          const word = feel(trueTemp, this.prevDip);
          this.prevDip = trueTemp;
          window.dispatchEvent(new CustomEvent('thermo-dipped', { detail: { cup, trueTemp, feeling: word } }));
        }
      }
      const handOn = exp === 'touch' && !!cup;
      this.hand.visible = handOn;
      if (handOn) {
        const down = this.dipT < 0 ? 0 : clamp(this.dipT / 0.45, 0, 1) - clamp((this.dipT - DIP) / 0.45, 0, 1);
        const y = lerp(0.2, 0.098, clamp(down, 0, 1));
        this.hand.position.x = lerp(this.hand.position.x, this.cups[cup].x - 0.012, 0.14);
        this.hand.position.y = lerp(this.hand.position.y, y, 0.18);
        this.hand.position.z = lerp(this.hand.position.z, 0.012, 0.14);
      }

      /* the thermometer */
      const probing = exp === 'measure' && !!cup;
      if (probing) {
        this.thTarget.set(this.cups[cup].x, lerp(DEEP_TOP, DEEP_BOTTOM, dv / 100), 0);
        if (this.cfg.action === 'probe') {
          /* move the bulb between air, water and bottom and the column starts
             creeping towards the new, possibly wrong, reading */
          if (this.zone !== zone) {
            this.zone = zone;
            this.probeT = 0;
            this.settled = false;
            this.startTemp = this.shown;
          }
          if (this.probeT >= 0) {
            this.probeT += dt;
            const ph = physics(targetFor(zone, trueTemp), this.startTemp, this.probeT);
            this.shown = ph.value;
            if (ph.steady && !this.settled) {
              this.settled = true;
              window.dispatchEvent(new CustomEvent('thermo-settled', { detail: { cup, trueTemp, shownTemp: ph.value, zone } }));
            }
          }
        }
      } else {
        this.thTarget.set(0.24, 0.075, 0.07);
        this.shown = lerp(this.shown, ROOM, 0.02);
      }
      const th = this.th.grp;
      th.position.lerp(this.thTarget, 0.12);
      th.rotation.z = lerp(th.rotation.z, 0, 0.15);
      const len = 0.006 + clamp(this.shown, 0, TMAX) / TMAX * 0.126;
      this.th.col.scale.y = len;
      this.th.col.position.y = len / 2;

      /* the liquid zoom mirrors the same reading */
      const zt = clamp(this.shown, 0, TMAX);
      const zl = 0.03 + (zt / TMAX) * 0.42;
      this.zCol.scale.y = zl;
      this.zCol.position.y = 0.08 + zl / 2 - 0.03;
      const col = tempColor(T, zt);
      this.zMat.color.copy(col); this.zMat.emissive.copy(col);
      this.zMat.emissiveIntensity = 0.1 + 0.55 * clamp((zt - 14) / 48, 0, 1);
      const amp = 0.0018 + 0.011 * clamp((zt - 5) / 55, 0, 1);
      const spd = 5 + zt * 0.16;
      this.zParts.forEach(m => {
        const h = m.userData.home, sd = m.userData.seed;
        m.position.set(
          h.x + Math.sin(now * spd + sd) * amp,
          h.y + Math.sin(now * spd * 1.13 + sd * 2) * amp,
          h.z + Math.cos(now * spd * 0.91 + sd) * amp);
      });

      /* cameras */
      const cd = this.cam;
      cd.el = lerp(cd.el, this.elTarget, 0.09);
      const ty = probing ? 0.088 : 0.07, tx = 0.05;
      const paneW = view === 'both' ? Math.round(this.vw * 0.68) : this.vw;
      const aspect = paneW / (this.vh || 1);
      const fit = aspect < 1.45 ? clamp(1.45 / Math.max(aspect, 0.4), 1, 1.95) : 1;
      const dist = cd.dist * fit;
      const c = this.camA;
      c.position.set(tx + Math.sin(cd.az) * Math.cos(cd.el) * dist, ty + Math.sin(cd.el) * dist, Math.cos(cd.az) * Math.cos(cd.el) * dist);
      c.lookAt(tx, ty, 0);
      const thp = th.position, mY = thp.y + len;
      const dyHead = (this.head / 100) * HEAD_RANGE;
      this.camE.position.set(thp.x, mY + dyHead, thp.z + this.eyeDist);
      this.camE.lookAt(thp.x, mY, thp.z);
      /* where the sight line crosses the scale plate — the mark you would read */
      this.parOff = parallax(this.head, this.eyeDist);
      const hitY = mY + this.parOff * PER_DEG;
      this.sight.visible = eyeOn;
      if (eyeOn) {
        this.sight.position.set(thp.x, hitY, thp.z - PLATE + 0.0007);
        this.sight.material.color.setHex(Math.abs(this.head) <= 25 ? 0x5ee07a : 0xffb627);
      }
      /* the first-person view looks through the cup wall — thin it out so the
         column and the scale stay readable */
      IDS.forEach(id => {
        const m = this.cups[id].waterMat;
        m.opacity = lerp(m.opacity, eyeOn ? 0.26 : 0.74, 0.15);
      });
      this.zAngle += dt * 0.12;
      const sway = Math.sin(this.zAngle * 0.5) * 0.14;
      this.camZ.position.set(Math.sin(sway) * 0.98, 0.34, Math.cos(sway) * 0.98);
      this.camZ.lookAt(0, 0.25, 0);

      const r = this.r, w = this.vw, h = this.vh;
      r.setScissorTest(true);
      const draw = (scene, cam, x, ww) => {
        cam.aspect = ww / h; cam.updateProjectionMatrix();
        r.setViewport(x, 0, ww, h); r.setScissor(x, 0, ww, h);
        r.render(scene, cam);
      };
      if (view === 'eyeline') draw(this.sA, this.camE, 0, w);
      else if (view === 'zoom') draw(this.sZ, this.camZ, 0, w);
      else if (view === 'both') {
        const wa = Math.round(w * 0.68);
        draw(this.sA, this.camA, 0, wa);
        draw(this.sZ, this.camZ, wa, w - wa);
      } else draw(this.sA, this.camA, 0, w);
      r.setScissorTest(false);

      const capA = this.caps.querySelector('[data-cap="a"]'), capP = this.caps.querySelector('[data-cap="p"]');
      const capE = this.caps.querySelector('[data-cap="e"]');
      capA.style.display = (view === 'zoom' || eyeOn) ? 'none' : 'block';
      capP.style.display = (view === 'apparatus' || eyeOn) ? 'none' : 'block';
      capE.style.display = eyeOn ? 'block' : 'none';
      const capF = this.caps.querySelector('[data-cap="frame"]');
      if (view === 'apparatus' || eyeOn) capF.style.display = 'none';
      else {
        capF.style.display = 'block';
        capF.style.left = (view === 'both' ? Math.round(w * 0.68) + 6 : 8) + 'px';
      }

      if (now - this.emitAt > 0.09) {
        this.emitAt = now;
        const off = this.parOff || 0;
        let sightY = 0.5;
        if (this.view() === 'eyeline' && this.sight) {
          const v = this.sight.position.clone().project(this.camE);
          sightY = clamp(1 - (v.y * 0.5 + 0.5), 0.02, 0.98);
        }
        window.dispatchEvent(new CustomEvent('thermo', {
          detail: {
            experiment: exp, cup, trueTemp,
            shownTemp: probing ? this.shown + off : this.shown,
            steady: this.settled, feeling: this.dipDone ? feel(trueTemp, null) : null,
            dip, depthOk, zone, eye: this.cfg.eye, head: this.head, parallax: off, sightY,
            apparent: probing ? this.shown + off : null
          }
        }));
      }
    }
  }

  customElements.define('thermo-scene', ThermoScene);
})();
