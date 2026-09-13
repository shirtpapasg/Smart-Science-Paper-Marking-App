/* <shadow-shape-scene> — three.js bench for "what shape is a shadow?"
   Attributes: experiment (flat|solid), on (yes|no), tilt (0-90),
               object (cube|cuboid|cylinder|cone|sphere|pyramid|ring|halfball),
               turn (0-360), tip (0-90), spin (yes|no),
               view (apparatus|screen|both)
   Dispatches on window: "shadowshape" every frame with
     detail = { experiment, object, turn, tip, hold, shape, outline, hole }
     where outline (and the ring's hole) are short lists of [u,v] points on the
     surface the shadow falls on, 0..1 across it — the sketch strip draws them;
   and "shadowshape-snap" with the same detail when the shadow itself is tapped. */
(() => {
  if (window.__shadowShapeScene) return;
  window.__shadowShapeScene = true;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const D2R = Math.PI / 180;

  /* the light box, in metres: the same rail, slots and screen as the earlier labs */
  const NSLOT = 8, SLOT0 = -0.285, SLOT_D = 0.072;
  const SLOT_X = (n) => SLOT0 + (n - 1) * SLOT_D;
  const LIGHT_SLOT = 1, OBJ_SLOT = 5;
  const LIGHT_X = SLOT_X(LIGHT_SLOT), OBJ_X = SLOT_X(OBJ_SLOT), SCREEN_X = 0.315;
  const BEAM_Y = 0.105;              /* lamp, object centre and shadow centre all sit at this height */
  const SCR_W = 0.30, SCR_H = 0.23, SCR_Y0 = 0.004;
  const MAG = (SCREEN_X - LIGHT_X) / (OBJ_X - LIGHT_X);
  const BASE_TOP = 0.070;            /* top of the wooden base in slot 5 */

  /* part A: a torch on a stand over the table, the cut-out held halfway down */
  const TORCH_Y = 0.225, CARD_Y = 0.1125, CARD_T = 0.0018;
  const TRI = [[0, 0.042], [-0.038, -0.024], [0.038, -0.024]];
  const TBL_W = 0.30, TBL_D = 0.23;  /* the patch of table the sketch outlines are measured across */

  const DARK_BG = 0x08131f;

  /* each bench has its own natural first view; once the pupil orbits, it is theirs */
  const CAM = {
    flat: { az: -0.52, el: 0.38, dist: 1 },
    solid: { az: -0.56, el: 0.32, dist: 1 }
  };

  const OBJ = {
    cube: { label: 'CUBE', kind: 'box', s: [0.052, 0.052, 0.052], col: 0x4a90e2 },
    cuboid: { label: 'CUBOID', kind: 'box', s: [0.034, 0.066, 0.030], col: 0x66ccff },
    cylinder: { label: 'CYLINDER', kind: 'cyl', r: 0.024, h: 0.064, col: 0x58e066 },
    cone: { label: 'CONE', kind: 'cone', r: 0.029, h: 0.066, col: 0xffd400 },
    sphere: { label: 'SPHERE', kind: 'ball', r: 0.029, col: 0xff5a5a },
    pyramid: { label: 'PYRAMID', kind: 'pyr', b: 0.054, h: 0.062, col: 0xf06fff },
    ring: { label: 'RING', kind: 'ring', R: 0.030, t: 0.0085, col: 0xb557e6 },
    halfball: { label: 'HALF-BALL', kind: 'half', r: 0.032, col: 0xffb627 }
  };
  const IDS = Object.keys(OBJ);

  /* ---------- the model: one pure function per bench, no DOM, no three.js ---------- */

  const ring = (n, r) => {
    const a = [];
    for (let i = 0; i < n; i++) { const th = (i / n) * Math.PI * 2; a.push([Math.cos(th) * r, Math.sin(th) * r]); }
    return a;
  };

  /* every corner and enough of every curve to find the true outline */
  function localPts(id) {
    const o = OBJ[id] || OBJ.cube, p = [];
    if (o.kind === 'box') {
      const w = o.s[0] / 2, h = o.s[1] / 2, d = o.s[2] / 2;
      [-1, 1].forEach((i) => [-1, 1].forEach((j) => [-1, 1].forEach((k) => p.push([i * w, j * h, k * d]))));
    } else if (o.kind === 'cyl') {
      ring(30, o.r).forEach((c) => { p.push([c[0], -o.h / 2, c[1]]); p.push([c[0], o.h / 2, c[1]]); });
    } else if (o.kind === 'cone') {
      p.push([0, o.h / 2, 0]);
      ring(30, o.r).forEach((c) => p.push([c[0], -o.h / 2, c[1]]));
    } else if (o.kind === 'pyr') {
      p.push([0, o.h / 2, 0]);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c) => p.push([c[0] * o.b / 2, -o.h / 2, c[1] * o.b / 2]));
    } else if (o.kind === 'ring') {
      /* a torus with its axis along the beam, so it faces the light at turn 0 */
      for (let i = 0; i < 26; i++) {
        const th = (i / 26) * Math.PI * 2;
        for (let j = 0; j < 8; j++) {
          const ph = (j / 8) * Math.PI * 2, rr = o.R + Math.cos(ph) * o.t;
          p.push([Math.sin(ph) * o.t, Math.sin(th) * rr, Math.cos(th) * rr]);
        }
      }
    } else if (o.kind === 'half') {
      const yc = -o.r * 0.38;
      for (let i = 0; i <= 5; i++) {
        const el = (i / 5) * Math.PI / 2;
        ring(22, Math.cos(el) * o.r).forEach((c) => p.push([c[0], yc + Math.sin(el) * o.r, c[1]]));
      }
      ring(22, o.r).forEach((c) => p.push([c[0], yc, c[1]]));
    } else if (o.kind === 'ball') {
      ring(28, o.r).forEach((c) => p.push([c[0], c[1], 0]));
    }
    return p;
  }

  /* turn about the upright axis first, then tip forward — the same order the
     meshes are nested in, so the drawing and the cast shadow always agree */
  function turned(pts, turn, tip) {
    const cy = Math.cos(turn * D2R), sy = Math.sin(turn * D2R);
    const cz = Math.cos(tip * D2R), sz = Math.sin(tip * D2R);
    return pts.map((q) => {
      const x1 = q[0] * cy + q[2] * sy, z1 = -q[0] * sy + q[2] * cy;
      return [x1 * cz - q[1] * sz, x1 * sz + q[1] * cz, z1];
    });
  }

  function hull(pts) {
    if (pts.length < 3) return pts.slice();
    const p = pts.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (let i = 0; i < p.length; i++) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop();
      lo.push(p[i]);
    }
    for (let i = p.length - 1; i >= 0; i--) {
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop();
      up.push(p[i]);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  const area = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const q = poly[i], r = poly[(i + 1) % poly.length];
      a += q[0] * r[1] - r[0] * q[1];
    }
    return Math.abs(a) / 2;
  };

  const m90 = (a) => {
    const x = ((a % 90) + 90) % 90;
    return Math.min(x, 90 - x);
  };

  /* The name of the shadow's shape, in words a nine-year-old already uses. It is
     worked out from which part of the solid is facing the light — the outline
     itself is always the true cast shadow, measured off the screen. */
  function nameOf(id, turnDeg, tipDeg) {
    const turn = isFinite(turnDeg) ? +turnDeg : 0;
    const t = clamp(isFinite(tipDeg) ? +tipDeg : 0, 0, 90);
    const up = t <= 10, flat = t >= 80;
    const nx = m90(turn) <= 8;
    switch (id) {
      case 'sphere': return 'circle';
      case 'cube':
        if (flat) return 'square';
        if (up) return nx ? 'square' : 'wide rectangle';
        if (nx && Math.abs(t - 45) <= 10) return 'tall rectangle';
        return 'six-sided shape';
      case 'cuboid':
        return up ? 'tall rectangle' : flat ? 'square' : 'six-sided shape';
      case 'cylinder':
        return up ? 'tall rectangle' : flat ? 'circle' : 'rounded shape';
      case 'cone':
        return up ? 'triangle' : flat ? 'circle' : 'rounded triangle';
      case 'pyramid':
        return up ? 'triangle' : flat ? 'square' : 'five-sided shape';
      case 'halfball':
        return up ? 'half circle' : flat ? 'circle' : 'rounded shape';
      case 'ring': {
        const c = Math.abs(Math.cos(turn * D2R) * Math.cos(t * D2R));
        return c > 0.32 ? 'ring' : c < 0.12 ? 'thin bar' : 'oval ring';
      }
    }
    return 'shape';
  }

  /* part B: cast every sample point from the lamp onto the screen */
  function solidModel(id, turn, tip) {
    const o = OBJ[id] ? id : 'cube';
    const norm = (yz) => [clamp(0.5 + yz[1] / SCR_W, -0.4, 1.4), clamp(1 - (yz[0] - SCR_Y0) / SCR_H, -0.4, 1.4)];
    const cast = (p) => {
      const t = (SCREEN_X - LIGHT_X) / Math.max(1e-4, (p[0] + OBJ_X) - LIGHT_X);
      return norm([BEAM_Y + p[1] * t, p[2] * t]);
    };
    let outline, hole = null;
    if (OBJ[o].kind === 'ball') {
      const r = (OBJ[o].r * MAG) / SCR_W;
      outline = ring(26, 1).map((c) => [0.5 + c[0] * r, 1 - ((BEAM_Y - SCR_Y0) / SCR_H) + c[1] * r * (SCR_W / SCR_H)]);
    } else {
      outline = hull(turned(localPts(o), turn, tip).map(cast));
      if (OBJ[o].kind === 'ring') {
        const inner = [];
        for (let i = 0; i < 26; i++) {
          const th = (i / 26) * Math.PI * 2, rr = OBJ[o].R - OBJ[o].t;
          inner.push([0, Math.sin(th) * rr, Math.cos(th) * rr]);
        }
        const h = hull(turned(inner, turn, tip).map(cast));
        if (area(h) > 0.012) hole = h;
      }
    }
    return { object: o, turn, tip, outline, hole, shape: nameOf(o, turn, tip) };
  }

  /* part A: the cut-out, tilted about the line the tweezers hold it on */
  const holdOf = (t) => (t <= 12 ? 'flat' : t >= 78 ? 'edge-on' : 'tilted');
  const flatShapeOf = (t) => (t <= 12 ? 'triangle' : t >= 78 ? 'thin line' : 'narrow triangle');

  function flatModel(tiltDeg) {
    const tilt = clamp(isFinite(tiltDeg) ? +tiltDeg : 0, 0, 90);
    const c = Math.cos(tilt * D2R), s = Math.sin(tilt * D2R);
    const pts = [];
    TRI.forEach((v) => {
      [-1, 1].forEach((sg) => {
        /* the card lies flat, then swings up about the z axis; its own thickness
           is what still blocks the light when it stands edge-on */
        const x = v[0] * c - sg * CARD_T * s;
        const y = CARD_Y + v[0] * s + sg * CARD_T * c;
        const t = TORCH_Y / Math.max(0.02, TORCH_Y - y);
        pts.push([clamp(0.5 + (x * t) / TBL_W, -0.4, 1.4), clamp(0.5 + (v[1] * t) / TBL_D, -0.4, 1.4)]);
      });
    });
    return { tilt, hold: holdOf(tilt), shape: flatShapeOf(tilt), outline: hull(pts), hole: null };
  }

  window.shadowShapeModel = { solid: solidModel, flat: flatModel, objects: OBJ, ids: IDS, holdOf };

  class ShadowShapeScene extends HTMLElement {
    static get observedAttributes() {
      return ['experiment', 'on', 'tilt', 'object', 'turn', 'tip', 'spin', 'view'];
    }

    constructor() {
      super();
      this.cfg = { experiment: 'flat', on: 'no', tilt: 0, object: 'cube', turn: 0, tip: 0, spin: 'no', view: 'apparatus' };
      this.cam = { az: -0.52, el: 0.38, dist: 1 };
      this.last = 0; this.lit = 0;
      this.tilt = 0; this.turn = 0; this.tip = 0;
      this.shownId = '';
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'tilt' || n === 'turn' || n === 'tip') {
        const p = parseFloat(v);
        if (isFinite(p)) this.cfg[n] = n === 'turn' ? ((p % 360) + 360) % 360 : clamp(p, 0, 90);
        this.kick();
        return;
      }
      this.cfg[n] = (v === null || v === undefined) ? this.cfg[n] : v;
      if (n === 'experiment' && !this._dragged) this.cam = Object.assign({}, CAM[this.exp()]);
      this.kick();
    }

    /* the loop pauses whenever the page is hidden, so a change made off-screen is
       caught up by hand — the bench is never left unpainted */
    kick() {
      if (!this.r) return;
      clearTimeout(this._kt);
      this._kt = setTimeout(() => {
        if (performance.now() - (this._tick || 0) < 300) return;
        let t = Math.max(this.last * 1000, 1);
        for (let i = 0; i < 40; i++) { t += 26; this.step(t); }
      }, 70);
    }

    exp() { return this.cfg.experiment === 'solid' ? 'solid' : 'flat'; }
    objId() { return OBJ[this.cfg.object] ? this.cfg.object : 'cube'; }
    spinning() { return this.cfg.spin === 'yes' || this.cfg.spin === true; }
    viewMode() {
      const v = this.cfg.view;
      return v === 'screen' || v === 'both' ? v : 'apparatus';
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', background: '#08131f' });
      this.boot();
    }

    async boot() {
      const THREE = await import('https://unpkg.com/three@0.184.0/build/three.module.js');
      this.THREE = THREE;
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.1;
      r.autoClear = false;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.r = r;

      this.build();
      this.camA = new THREE.PerspectiveCamera(38, 1, 0.01, 12);
      this.camS = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4);

      this.bindPointer();
      new ResizeObserver(() => this.resize()).observe(this);
      this.resize();
      r.setAnimationLoop((ms) => this.frame(ms));
      this.kick();
    }

    /* ---------- textures ---------- */
    radialTex(inner, mid) {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, inner); g.addColorStop(0.34, mid); g.addColorStop(1, 'rgba(255,200,110,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    contactTex() {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,.85)');
      g.addColorStop(0.45, 'rgba(0,0,0,.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    /* a floating plate that names one piece of the apparatus */
    pillSprite(text, h) {
      const T = this.THREE, cv = document.createElement('canvas');
      const W = 640, H = 144;
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = '900 58px Nunito, system-ui, sans-serif';
      const tw = cx.measureText(text).width;
      const pw = Math.min(W - 12, tw + 92), ph = 104;
      const x0 = (W - pw) / 2, y0 = (H - ph) / 2, rr = ph / 2;
      cx.beginPath();
      cx.moveTo(x0 + rr, y0);
      cx.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, rr);
      cx.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, rr);
      cx.arcTo(x0, y0 + ph, x0, y0, rr);
      cx.arcTo(x0, y0, x0 + pw, y0, rr);
      cx.closePath();
      cx.fillStyle = 'rgba(9,16,26,.88)'; cx.fill();
      cx.lineWidth = 5; cx.strokeStyle = 'rgba(255,182,39,.85)'; cx.stroke();
      cx.fillStyle = '#ffe6b0';
      cx.letterSpacing = '4px';
      cx.fillText(text, W / 2, H / 2 + 3);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'label_' + text.toLowerCase().replace(/[^a-z]+/g, '_');
      sp.renderOrder = 34;
      const hh = h || 0.076;
      sp.scale.set(hh * (pw / ph), hh, 1);
      return sp;
    }

    numSprite(n) {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 72;
      const cx = cv.getContext('2d');
      cx.beginPath(); cx.arc(36, 36, 26, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(7,13,21,.9)'; cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(159,208,240,.55)'; cx.stroke();
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = '#9fd0f0';
      cx.font = '900 34px Nunito, system-ui, sans-serif';
      cx.fillText(String(n), 36, 38);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.92 }));
      sp.name = 'slot_number';
      sp.scale.set(0.026, 0.026, 1);
      return sp;
    }

    /* ---------- the bench ---------- */
    build() {
      const T = this.THREE;
      const s = new T.Scene();
      this.bg = new T.Color(DARK_BG);
      s.background = this.bg;
      s.fog = new T.Fog(this.bg.clone(), 2.2, 5.4);
      this.s = s;

      this.mats = {
        table: new T.MeshStandardMaterial({ name: 'table_top', color: 0xb9c1c8, roughness: 0.95 }),
        rail: new T.MeshStandardMaterial({ name: 'light_box_base', color: 0x33465a, roughness: 0.86, metalness: 0.1 }),
        groove: new T.MeshStandardMaterial({ name: 'slot_groove', color: 0x0d1520, roughness: 1 }),
        dark: new T.MeshStandardMaterial({ name: 'matte_black', color: 0x1e2b3a, roughness: 0.88, metalness: 0.15 }),
        steel: new T.MeshStandardMaterial({ name: 'steel', color: 0x9dabb8, roughness: 0.34, metalness: 0.8 }),
        grey: new T.MeshStandardMaterial({ name: 'lab_grey', color: 0x6f7b88, roughness: 0.7, metalness: 0.08 }),
        wood: new T.MeshStandardMaterial({ name: 'wood_base', color: 0xc08b4c, roughness: 0.78 }),
        screen: new T.MeshStandardMaterial({ name: 'white_screen', color: 0xeef4f9, roughness: 1, metalness: 0 }),
        card: new T.MeshStandardMaterial({ name: 'triangle_cutout', color: 0xa9b6c4, roughness: 0.85, side: T.DoubleSide })
      };

      this.g = new T.Group(); this.g.name = 'shadow_shape_bench'; s.add(this.g);
      this.gFlat = new T.Group(); this.gFlat.name = 'flat_bench'; this.g.add(this.gFlat);
      this.gSolid = new T.Group(); this.gSolid.name = 'light_box_bench'; this.g.add(this.gSolid);

      this.buildRoom();
      this.buildTorchRig();
      this.buildCutout();
      this.buildBox();
      this.buildObjects();
      this.buildRigs();
      this.buildLabels();
    }

    buildRoom() {
      const T = this.THREE, G = this.g;
      const top = new T.Mesh(new T.PlaneGeometry(1.5, 1.1), this.mats.table);
      top.name = 'table_top';
      top.rotation.x = -Math.PI / 2;
      top.position.set(0, 0, 0.06);
      top.receiveShadow = true;
      G.add(top);

      const ctex = this.contactTex();
      const patch = new T.Mesh(new T.PlaneGeometry(0.92, 0.42),
        new T.MeshBasicMaterial({ name: 'bench_contact', map: ctex, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false, fog: false }));
      patch.name = 'bench_contact';
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(0, 0.0012, 0.01);
      G.add(patch);
    }

    /* ---------- part A: torch, stand, tweezers, cut-out ---------- */
    buildTorchRig() {
      const T = this.THREE, M = this.mats, G = this.gFlat;
      const st = new T.Group(); st.name = 'torch_stand';

      const foot = new T.Mesh(new T.BoxGeometry(0.10, 0.012, 0.14), M.dark);
      foot.name = 'stand_foot'; foot.position.set(-0.19, 0.006, 0); st.add(foot);
      const rod = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, TORCH_Y + 0.05, 14), M.steel);
      rod.name = 'stand_rod'; rod.position.set(-0.19, (TORCH_Y + 0.05) / 2, 0); st.add(rod);
      const boss = new T.Mesh(new T.BoxGeometry(0.024, 0.026, 0.026), M.grey);
      boss.name = 'stand_boss'; boss.position.set(-0.19, TORCH_Y, 0); st.add(boss);
      const arm = new T.Mesh(new T.CylinderGeometry(0.0048, 0.0048, 0.19, 12), M.steel);
      arm.name = 'stand_arm'; arm.rotation.z = Math.PI / 2; arm.position.set(-0.095, TORCH_Y, 0); st.add(arm);

      /* the torch, looking straight down at the table */
      const t = new T.Group(); t.name = 'torch';
      t.position.set(0, TORCH_Y, 0);
      const body = new T.Mesh(new T.CylinderGeometry(0.016, 0.020, 0.062, 28), M.grey);
      body.name = 'torch_body'; body.position.y = 0.032; t.add(body);
      const head = new T.Mesh(new T.CylinderGeometry(0.024, 0.018, 0.024, 28), M.dark);
      head.name = 'torch_head'; head.position.y = -0.004; t.add(head);
      const bezel = new T.Mesh(new T.TorusGeometry(0.0235, 0.0026, 8, 28), M.steel);
      bezel.name = 'torch_bezel'; bezel.rotation.x = Math.PI / 2; bezel.position.y = -0.016; t.add(bezel);
      const clamp2 = new T.Mesh(new T.TorusGeometry(0.022, 0.0042, 8, 24), M.grey);
      clamp2.name = 'torch_clamp'; clamp2.rotation.x = Math.PI / 2; clamp2.position.y = 0.026; t.add(clamp2);

      this.flatLensMat = new T.MeshStandardMaterial({ name: 'torch_lens', color: 0x2f3138, emissive: 0xffe3a6, emissiveIntensity: 0, roughness: 0.18, toneMapped: false });
      const lens = new T.Mesh(new T.CircleGeometry(0.0215, 28), this.flatLensMat);
      lens.name = 'torch_lens'; lens.rotation.x = Math.PI / 2; lens.position.y = -0.0172; t.add(lens);

      this.flatGlowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,249,229,1)', 'rgba(255,214,130,.7)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const glow = new T.Sprite(this.flatGlowMat);
      glow.name = 'torch_glow'; glow.scale.set(0.10, 0.10, 1); glow.position.y = -0.022; glow.renderOrder = 26;
      t.add(glow);

      st.add(t);
      G.add(st);
      this.torch = t;

      /* a faint cone of light down to the table */
      this.flatBeam = new T.Mesh(new T.ConeGeometry(1, 1, 30, 1, true),
        new T.MeshBasicMaterial({ name: 'torch_beam', color: 0xffe2ab, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false, toneMapped: false }));
      this.flatBeam.name = 'torch_beam';
      this.flatBeam.renderOrder = 16;
      this.flatBeam.position.set(0, TORCH_Y / 2, 0);
      this.flatBeam.scale.set(0.145, TORCH_Y, 0.145);
      G.add(this.flatBeam);
    }

    buildCutout() {
      const T = this.THREE, M = this.mats, G = this.gFlat;

      /* tilt happens about the line the tweezers grip, so they swing with the card */
      const tiltG = new T.Group(); tiltG.name = 'cutout_tilt';
      tiltG.position.set(0, CARD_Y, 0);

      const shape = new T.Shape();
      shape.moveTo(TRI[0][0], TRI[0][1]);
      shape.lineTo(TRI[1][0], TRI[1][1]);
      shape.lineTo(TRI[2][0], TRI[2][1]);
      shape.closePath();
      const geo = new T.ExtrudeGeometry(shape, { depth: CARD_T * 2, bevelEnabled: false });
      geo.translate(0, 0, -CARD_T);
      const card = new T.Mesh(geo, M.card);
      card.name = 'triangle_cutout';
      /* the plate is cut in its own plane, then laid flat, face up to the torch */
      card.rotation.x = -Math.PI / 2;
      card.castShadow = true; card.receiveShadow = true;
      tiltG.add(card);

      /* the tweezers, gripping the near edge of the card */
      const tw = new T.Group(); tw.name = 'tweezers';
      [-1, 1].forEach((sg) => {
        const arm = new T.Mesh(new T.BoxGeometry(0.0032, 0.0024, 0.085), M.steel);
        arm.name = 'tweezer_arm';
        arm.position.set(0, sg * 0.0034, 0.062);
        arm.rotation.x = sg * 0.035;
        tw.add(arm);
      });
      const grip = new T.Mesh(new T.BoxGeometry(0.008, 0.010, 0.030), M.grey);
      grip.name = 'tweezer_grip'; grip.position.set(0, 0, 0.112); tw.add(grip);
      tw.children.forEach((m) => { m.castShadow = false; m.receiveShadow = true; });
      tiltG.add(tw);

      G.add(tiltG);
      this.tiltG = tiltG;

      /* the clamp that holds the tweezers, off to the side of the light */
      const hold = new T.Group(); hold.name = 'tweezer_stand';
      const foot = new T.Mesh(new T.BoxGeometry(0.07, 0.011, 0.06), M.dark);
      foot.name = 'stand_foot'; foot.position.set(0, 0.0055, 0.185); hold.add(foot);
      const post = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, CARD_Y, 12), M.steel);
      post.name = 'stand_rod'; post.position.set(0, CARD_Y / 2, 0.185); hold.add(post);
      const boss = new T.Mesh(new T.BoxGeometry(0.020, 0.022, 0.022), M.grey);
      boss.name = 'stand_boss'; boss.position.set(0, CARD_Y, 0.176); hold.add(boss);
      hold.children.forEach((m) => { m.castShadow = false; m.receiveShadow = true; });
      G.add(hold);
    }

    /* ---------- part B: the light box ---------- */
    buildBox() {
      const T = this.THREE, M = this.mats, G = this.gSolid;

      const rail = new T.Mesh(new T.BoxGeometry(0.70, 0.018, 0.25), M.rail);
      rail.name = 'light_box_base';
      rail.position.set(0.005, 0.009, 0);
      rail.receiveShadow = true;
      G.add(rail);

      const lip = new T.Mesh(new T.BoxGeometry(0.70, 0.012, 0.008), M.dark);
      lip.name = 'light_box_lip'; lip.position.set(0.005, 0.019, 0.121); G.add(lip);
      const lip2 = lip.clone(); lip2.position.z = -0.121; G.add(lip2);

      /* eight slots, each a pair of ridges with a dark groove between them */
      for (let n = 1; n <= NSLOT; n++) {
        const x = SLOT_X(n);
        for (let i = 0; i < 2; i++) {
          const rdg = new T.Mesh(new T.BoxGeometry(0.004, 0.014, 0.215), M.dark);
          rdg.name = 'slot_ridge';
          rdg.position.set(x + (i ? 0.0055 : -0.0055), 0.025, 0);
          rdg.receiveShadow = true;
          G.add(rdg);
        }
        const gr = new T.Mesh(new T.BoxGeometry(0.007, 0.004, 0.212), M.groove);
        gr.name = 'slot_groove'; gr.position.set(x, 0.0195, 0); G.add(gr);
        const sp = this.numSprite(n);
        sp.position.set(x, 0.030, 0.148);
        G.add(sp);
      }

      /* the lamp, standing in slot 1 and looking down the box */
      const lamp = new T.Group(); lamp.name = 'light_source';
      lamp.position.set(LIGHT_X, 0, 0);
      const post = new T.Mesh(new T.BoxGeometry(0.0065, BEAM_Y - 0.012, 0.05), M.dark);
      post.name = 'lamp_post'; post.position.set(0, (BEAM_Y - 0.012) / 2 + 0.018, 0); lamp.add(post);
      const body = new T.Mesh(new T.CylinderGeometry(0.020, 0.024, 0.044, 30), M.grey);
      body.name = 'lamp_body'; body.rotation.z = Math.PI / 2; body.position.set(-0.004, BEAM_Y, 0); lamp.add(body);
      const bezel = new T.Mesh(new T.TorusGeometry(0.0202, 0.0026, 8, 28), M.steel);
      bezel.name = 'lamp_bezel'; bezel.rotation.y = Math.PI / 2; bezel.position.set(0.019, BEAM_Y, 0); lamp.add(bezel);

      this.boxLensMat = new T.MeshStandardMaterial({ name: 'lamp_lens', color: 0x2f3138, emissive: 0xffe3a6, emissiveIntensity: 0, roughness: 0.18, toneMapped: false });
      const lens = new T.Mesh(new T.CircleGeometry(0.019, 28), this.boxLensMat);
      lens.name = 'lamp_lens'; lens.rotation.y = Math.PI / 2; lens.position.set(0.0202, BEAM_Y, 0); lamp.add(lens);

      this.boxGlowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,249,229,1)', 'rgba(255,214,130,.7)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const glow = new T.Sprite(this.boxGlowMat);
      glow.name = 'lamp_glow'; glow.scale.set(0.09, 0.09, 1); glow.position.set(0.024, BEAM_Y, 0); glow.renderOrder = 26;
      lamp.add(glow);
      lamp.children.forEach((m) => { m.castShadow = false; });
      G.add(lamp);

      this.boxBeam = new T.Mesh(new T.ConeGeometry(1, 1, 30, 1, true),
        new T.MeshBasicMaterial({ name: 'lamp_beam', color: 0xffe2ab, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false, toneMapped: false }));
      this.boxBeam.name = 'lamp_beam';
      this.boxBeam.renderOrder = 16;
      this.boxBeam.rotation.z = -Math.PI / 2;
      this.boxBeam.position.set((LIGHT_X + SCREEN_X) / 2, BEAM_Y, 0);
      this.boxBeam.scale.set(0.085, SCREEN_X - LIGHT_X, 0.085);
      G.add(this.boxBeam);

      /* the white screen at the far end */
      const scr = new T.Mesh(new T.PlaneGeometry(SCR_W, SCR_H), M.screen);
      scr.name = 'white_screen';
      scr.rotation.y = -Math.PI / 2;
      scr.position.set(SCREEN_X, SCR_Y0 + SCR_H / 2, 0);
      scr.receiveShadow = true;
      G.add(scr);
      this.screen = scr;
      const frame = new T.Mesh(new T.BoxGeometry(0.008, SCR_H + 0.016, SCR_W + 0.016), M.dark);
      frame.name = 'screen_frame';
      frame.position.set(SCREEN_X + 0.006, SCR_Y0 + SCR_H / 2, 0);
      G.add(frame);
      const sfoot = new T.Mesh(new T.BoxGeometry(0.034, 0.016, 0.24), M.dark);
      sfoot.name = 'screen_foot'; sfoot.position.set(SCREEN_X + 0.004, 0.008, 0); G.add(sfoot);

      /* the wooden base in slot 5, with a turntable the object sits on */
      const base = new T.Group(); base.name = 'wooden_base';
      base.position.set(OBJ_X, 0, 0);
      const blk = new T.Mesh(new T.BoxGeometry(0.058, 0.030, 0.078), M.wood);
      blk.name = 'base_block'; blk.position.y = 0.033; base.add(blk);
      const tongue = new T.Mesh(new T.BoxGeometry(0.0065, 0.016, 0.060), M.wood);
      tongue.name = 'base_tongue'; tongue.position.y = 0.020; base.add(tongue);
      const plate = new T.Mesh(new T.CylinderGeometry(0.030, 0.030, 0.008, 34), M.dark);
      plate.name = 'turntable'; plate.position.y = 0.052; base.add(plate);
      this.dial = new T.Mesh(new T.CylinderGeometry(0.0285, 0.0285, 0.004, 34),
        new T.MeshStandardMaterial({ name: 'turntable_top', color: 0x2b3a4b, roughness: 0.6, metalness: 0.2 }));
      this.dial.name = 'turntable_top'; this.dial.position.y = 0.058; base.add(this.dial);
      const mark = new T.Mesh(new T.BoxGeometry(0.004, 0.005, 0.026),
        new T.MeshStandardMaterial({ name: 'turntable_mark', color: 0xffb627, roughness: 0.5, emissive: 0x3a2a06 }));
      mark.name = 'turntable_mark'; mark.position.set(0, 0.0595, 0.016); this.dial.add(mark);
      const spindle = new T.Mesh(new T.CylinderGeometry(0.0022, 0.0022, BASE_TOP + 0.048 - 0.058, 10), M.steel);
      spindle.name = 'spindle';
      spindle.position.y = 0.058 + (BASE_TOP + 0.048 - 0.058) / 2;
      base.add(spindle);
      /* only the object itself is allowed to cast, so the shadow on the screen is
         always the one the lesson is about */
      base.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
      G.add(base);
      this.base = base;
    }

    buildObjects() {
      const T = this.THREE;
      const tipG = new T.Group(); tipG.name = 'object_tip';
      tipG.position.set(OBJ_X, BEAM_Y, 0);
      const turnG = new T.Group(); turnG.name = 'object_turn';
      tipG.add(turnG);

      this.objMeshes = {};
      IDS.forEach((id) => {
        const o = OBJ[id];
        const mat = new T.MeshStandardMaterial({ name: 'solid_' + id, color: o.col, roughness: 0.34, metalness: 0.08 });
        const gp = new T.Group();
        gp.name = 'solid_' + id;
        let m;
        if (o.kind === 'box') m = new T.Mesh(new T.BoxGeometry(o.s[0], o.s[1], o.s[2]), mat);
        else if (o.kind === 'cyl') m = new T.Mesh(new T.CylinderGeometry(o.r, o.r, o.h, 44), mat);
        else if (o.kind === 'cone') m = new T.Mesh(new T.ConeGeometry(o.r, o.h, 48), mat);
        else if (o.kind === 'ball') m = new T.Mesh(new T.SphereGeometry(o.r, 40, 26), mat);
        else if (o.kind === 'pyr') {
          m = new T.Mesh(new T.ConeGeometry((o.b / 2) * Math.SQRT2, o.h, 4), mat);
          m.rotation.y = Math.PI / 4;
        } else if (o.kind === 'ring') {
          m = new T.Mesh(new T.TorusGeometry(o.R, o.t, 20, 48), mat);
          m.rotation.y = Math.PI / 2;
        } else {
          const yc = -o.r * 0.38;
          m = new T.Mesh(new T.SphereGeometry(o.r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat);
          m.position.y = yc;
          const cap = new T.Mesh(new T.CircleGeometry(o.r, 40), mat);
          cap.name = 'solid_halfball_face';
          cap.rotation.x = Math.PI / 2;
          cap.position.y = yc;
          cap.castShadow = true; cap.receiveShadow = true;
          gp.add(cap);
        }
        m.castShadow = true; m.receiveShadow = true;
        gp.add(m);
        gp.visible = false;
        turnG.add(gp);
        this.objMeshes[id] = gp;
      });

      this.gSolid.add(tipG);
      this.tipG = tipG; this.turnG = turnG;
    }

    buildRigs() {
      const T = this.THREE, G = this.g;

      /* a dim wash so the dark room is still readable with the light off */
      const hemi = new T.HemisphereLight(0x27425c, 0x05080d, 0.78);
      hemi.name = 'room_wash';
      G.add(hemi);
      const rim = new T.DirectionalLight(0x8fb6d6, 0.36);
      rim.name = 'room_rim';
      rim.position.set(-0.6, 0.8, 1.2);
      rim.target.position.set(0, 0.06, 0);
      G.add(rim, rim.target);
      this.wash = { hemi, rim };

      /* the torch over the table — the only thing that casts in part A */
      const flat = new T.SpotLight(0xfff3da, 0, 1.4, 0.62, 0.26, 1.0);
      flat.name = 'torch_key';
      flat.position.set(0, TORCH_Y, 0);
      flat.target.position.set(0, 0, 0);
      flat.castShadow = true;
      flat.shadow.mapSize.set(2048, 2048);
      flat.shadow.camera.near = 0.04;
      flat.shadow.camera.far = 0.42;
      flat.shadow.bias = -0.0004;
      flat.shadow.normalBias = 0.0016;
      G.add(flat, flat.target);
      this.flatKey = flat;

      /* the lamp in slot 1 — the only thing that casts in part B */
      const box = new T.SpotLight(0xfff3da, 0, 1.6, 0.42, 0.30, 1.0);
      box.name = 'light_box_key';
      box.position.set(LIGHT_X, BEAM_Y, 0);
      box.target.position.set(SCREEN_X, BEAM_Y + 0.012, 0);
      box.castShadow = true;
      box.shadow.mapSize.set(2048, 2048);
      box.shadow.camera.near = 0.08;
      box.shadow.camera.far = 0.85;
      box.shadow.bias = -0.0005;
      box.shadow.normalBias = 0.0018;
      G.add(box, box.target);
      this.boxKey = box;
    }

    buildLabels() {
      this.labTorch = this.pillSprite('TORCH', 0.040);
      this.labTorch.position.set(0, TORCH_Y + 0.040, 0);
      this.gFlat.add(this.labTorch);
      this.labCut = this.pillSprite('CUT-OUT', 0.038);
      this.labCut.position.set(-0.090, CARD_Y + 0.022, 0);
      this.gFlat.add(this.labCut);
      this.labTable = this.pillSprite('TABLE', 0.032);
      this.labTable.position.set(0.190, 0.024, 0.05);
      this.gFlat.add(this.labTable);

      this.labLight = this.pillSprite('LIGHT', 0.040);
      this.labLight.position.set(LIGHT_X, BEAM_Y + 0.050, 0);
      this.gSolid.add(this.labLight);
      this.labScreen = this.pillSprite('SCREEN', 0.040);
      this.labScreen.position.set(SCREEN_X, SCR_Y0 + SCR_H + 0.038, -0.10);
      this.gSolid.add(this.labScreen);
      this.objLabels = {};
      IDS.forEach((id) => {
        const sp = this.pillSprite(OBJ[id].label, 0.038);
        sp.position.set(OBJ_X, BEAM_Y + 0.070, 0);
        sp.visible = false;
        this.gSolid.add(sp);
        this.objLabels[id] = sp;
      });
      this.labels = [this.labTorch, this.labCut, this.labTable, this.labLight, this.labScreen];
    }

    /* ---------- interaction ---------- */
    bindPointer() {
      const el = this.r.domElement;
      let drag = null;
      el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        this._dragged = true;
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.02, 1.2);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', (e) => {
        const still = drag && Math.abs(e.clientX - drag.x) < 4 && Math.abs(e.clientY - drag.y) < 4;
        drag = null;
        if (!still || this.lit < 0.4) return;
        this.tapShadow(e);
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.42, 2.4);
      }, { passive: false });
    }

    /* tapping the shadow itself asks for a snapshot of its outline */
    tapShadow(e) {
      const T = this.THREE, el = this.r.domElement, b = el.getBoundingClientRect();
      const rc = new T.Raycaster();
      rc.setFromCamera(new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1),
        this.viewMode() === 'screen' ? this.camS : this.camA);
      const solid = this.exp() === 'solid';
      const target = solid ? this.screen : this.s.getObjectByName('table_top');
      const hit = target ? rc.intersectObject(target, false)[0] : null;
      if (!hit) return;
      const d = this.read();
      const p = hit.point;
      const uv = solid
        ? [0.5 + p.z / SCR_W, 1 - (p.y - SCR_Y0) / SCR_H]
        : [0.5 + p.x / TBL_W, 0.5 + p.z / TBL_D];
      if (!this.inside(uv, d.outline) || (d.hole && this.inside(uv, d.hole))) return;
      window.dispatchEvent(new CustomEvent('shadowshape-snap', { detail: d }));
    }

    inside(pt, poly) {
      if (!poly || poly.length < 3) return false;
      let win = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], c = poly[j];
        if ((a[1] > pt[1]) !== (c[1] > pt[1]) && pt[0] < ((c[0] - a[0]) * (pt[1] - a[1])) / (c[1] - a[1]) + a[0]) win = !win;
      }
      return win;
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    read() {
      return this.exp() === 'solid'
        ? Object.assign({ experiment: 'solid', hold: '' }, solidModel(this.objId(), Math.round(this.turn), Math.round(this.tip)))
        : Object.assign({ experiment: 'flat', object: 'cutout', turn: Math.round(this.tilt), tip: 0 }, flatModel(this.tilt));
    }

    frame(ms) {
      this._tick = performance.now();
      this.step(ms);
    }

    step(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const T = this.THREE, cfg = this.cfg, solid = this.exp() === 'solid';

      /* the object turns and tips smoothly, and keeps turning while it is spinning */
      const k = 1 - Math.exp(-dt * 8);
      this.tilt = lerp(this.tilt, cfg.tilt, k);
      if (Math.abs(this.tilt - cfg.tilt) < 0.05) this.tilt = cfg.tilt;
      if (this.spinning() && solid) {
        this.turn = (this.turn + dt * 26) % 360;
      } else {
        let d = ((cfg.turn - this.turn + 540) % 360) - 180;
        this.turn = (this.turn + d * k + 360) % 360;
        if (Math.abs(d) < 0.06) this.turn = cfg.turn;
      }
      this.tip = lerp(this.tip, cfg.tip, k);
      if (Math.abs(this.tip - cfg.tip) < 0.05) this.tip = cfg.tip;

      const on = cfg.on === 'yes' || cfg.on === true;
      this.lit = lerp(this.lit, on ? 1 : 0, 1 - Math.exp(-dt * 9));
      const L = smooth(clamp(this.lit, 0, 1));

      this.gFlat.visible = !solid;
      this.gSolid.visible = solid;

      /* the light is the only bright thing in the room */
      this.wash.hemi.intensity = 0.78 - 0.22 * L;
      this.wash.rim.intensity = 0.36 - 0.14 * L;
      this.flatKey.intensity = solid ? 0 : 2.6 * L;
      this.boxKey.intensity = solid ? 3.6 * L : 0;
      this.flatLensMat.emissiveIntensity = solid ? 0 : 1.5 * L;
      this.boxLensMat.emissiveIntensity = solid ? 1.5 * L : 0;
      this.flatGlowMat.opacity = solid ? 0 : 0.7 * L;
      this.boxGlowMat.opacity = solid ? 0.7 * L : 0;
      this.flatBeam.material.opacity = solid ? 0 : 0.075 * L;
      this.boxBeam.material.opacity = solid ? 0.075 * L : 0;

      const labOp = 1 - 0.34 * L;
      this.labels.forEach((sp) => { sp.material.opacity = labOp; });

      if (solid) {
        this.tipG.rotation.z = this.tip * D2R;
        this.turnG.rotation.y = this.turn * D2R;
        this.dial.rotation.y = this.turn * D2R;
        const id = this.objId();
        if (this.shownId !== id) {
          IDS.forEach((k2) => {
            this.objMeshes[k2].visible = k2 === id;
            this.objLabels[k2].visible = k2 === id;
          });
          this.shownId = id;
        }
        this.objLabels[id].material.opacity = labOp;
      } else {
        this.tiltG.rotation.z = this.tilt * D2R;
      }

      this.draw(solid);
      window.dispatchEvent(new CustomEvent('shadowshape', { detail: this.read() }));
    }

    aimMain(solid) {
      const c = this.camA, cd = this.cam;
      const aspect = (this.vw || 800) / (this.vh || 500);
      const tx = solid ? 0.015 : 0, ty = solid ? 0.125 : 0.135;
      const hw = solid ? 0.40 : 0.36, hh = solid ? 0.20 : 0.20;
      const tanH = Math.tan(19 * Math.PI / 180);
      const base = Math.max(hh / (tanH * 0.92), hw / (tanH * Math.max(aspect, 0.35)));
      const d = cd.dist * base;
      c.aspect = aspect;
      /* the bench is framed a little above centre, so the rail of buttons along
         the bottom edge never covers it */
      c.setViewOffset(1000, 1000, 0, solid ? 66 : 38, 1000, 1000);
      c.updateProjectionMatrix();
      c.position.set(tx + Math.sin(cd.az) * Math.cos(cd.el) * d, ty + Math.sin(cd.el) * d, Math.cos(cd.az) * Math.cos(cd.el) * d);
      c.lookAt(tx, ty, 0);
    }

    /* the second view looks straight at the surface the shadow lands on */
    shadowCam(aspect, solid) {
      const c = this.camS;
      const halfW = solid ? 0.175 : 0.17;
      const halfH = Math.max(halfW / Math.max(aspect, 0.2), solid ? 0.13 : 0.13);
      const w2 = Math.max(halfW, halfH * aspect);
      c.left = -w2; c.right = w2; c.top = halfH; c.bottom = -halfH;
      if (solid) {
        c.position.set(SCREEN_X - 0.21, SCR_Y0 + SCR_H / 2, 0);
        c.up.set(0, 1, 0);
        c.updateProjectionMatrix();
        c.lookAt(SCREEN_X, SCR_Y0 + SCR_H / 2, 0);
      } else {
        /* tilted off vertical, so the cut-out never lies across its own shadow */
        c.position.set(0, 0.27, 0.23);
        c.up.set(0, 1, 0);
        c.updateProjectionMatrix();
        c.lookAt(0, 0, 0.01);
      }
      return c;
    }

    draw(solid) {
      const r = this.r, W = this.vw || 800, H = this.vh || 500;
      const mode = this.viewMode();
      r.setScissorTest(false);
      r.setClearColor(this.bg, 1);
      r.clear(true, true, false);

      if (mode === 'screen') {
        r.setViewport(0, 0, W, H);
        r.render(this.s, this.shadowCam(W / H, solid));
        return;
      }

      this.aimMain(solid);
      r.setViewport(0, 0, W, H);
      r.render(this.s, this.camA);

      if (mode !== 'both') return;
      const iw = Math.round(Math.min(360, W * 0.34)), ih = Math.round(iw * 0.72);
      const ix = W - iw - 16, iy = H - ih - 16;
      r.setScissorTest(true);
      r.setScissor(ix - 2, iy - 2, iw + 4, ih + 4);
      r.setViewport(ix - 2, iy - 2, iw + 4, ih + 4);
      r.setClearColor(0x2f6fd6, 1);
      r.clear(true, true, false);
      r.setScissor(ix, iy, iw, ih);
      r.setViewport(ix, iy, iw, ih);
      r.setClearColor(this.bg, 1);
      r.clear(true, true, false);
      r.render(this.s, this.shadowCam(iw / ih, solid));
      r.setScissorTest(false);
    }
  }

  customElements.define('shadow-shape-scene', ShadowShapeScene);
})();
