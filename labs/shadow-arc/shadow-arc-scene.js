/* <shadow-arc-scene> — three.js bench for "position and length of a shadow"
   Attributes: experiment (position|length), on (yes|no),
               angle (0-180, A=20 B=55 C=90 D=125 E=160),
               rays (yes|no), measure (yes|no), view (apparatus|top|both),
               curtain (open|closed)
   Dispatches on window: "shadowarc" {detail:{angle,length,side}} every frame,
                         "shadowarc-measured" {detail:{position,length}} once per Measure press.
   Lengths in the events are centimetres. */
(() => {
  if (window.__shadowArcScene) return;
  window.__shadowArcScene = true;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const D2R = Math.PI / 180;

  /* the bench, in metres: a 12mm-per-cm stage the figure stands in the middle of */
  const FIG_H = 0.085;              /* top of the figure's head */
  const ARC_R = 0.42;               /* the arc is centred on the head, so a ray from the
                                       lamp through the head is the light's own direction */
  const MIN_LEN = 0.012;            /* the small pool of shadow directly under the feet */
  const DEAD = 5;                   /* degrees either side of C that read "underneath" */
  const STAGE_W = 0.98, STAGE_D = 0.52, STAGE_Y = 0.022;
  const TAPE_Z = 0.086, TAPE_HALF = 0.32;
  const POS = { A: 20, B: 55, C: 90, D: 125, E: 160 };

  /* the room */
  const WALL_Z = -0.72;                       /* front face of the back wall */
  const WIN = { x0: 0.22, x1: 1.08, y0: 0.16, y1: 0.72 };
  const ROD_Y = 0.78, CURT_TOP = 0.75, CURT_BOT = 0.08;
  const CURT_L = 0.15, CURT_R = 1.15;       /* the outer edges the curtains hang from */
  const CURT_W_OPEN = 0.15, CURT_W_SHUT = 0.515;
  const PEND = { x: -0.27, y: 0.56, z: -0.22 };

  const DAY_BG = 0xa8c5dd, LAMP_BG = 0x74655a;

  /* One pure function behind the whole bench: where the shadow falls and how
     long it is. Nothing in here touches the DOM or three.js. */
  function model(angleDeg) {
    const angle = clamp(isFinite(angleDeg) ? +angleDeg : 90, 0, 180);
    const elev = 90 - Math.abs(angle - 90);
    const t = Math.tan(Math.max(4, elev) * D2R);
    const length = Math.max(MIN_LEN, FIG_H / t);
    const side = angle < 90 - DEAD ? 'right' : angle > 90 + DEAD ? 'left' : 'underneath';
    return { angle, elev, side, length: Math.round(length * 1000) / 10 };
  }
  window.shadowArcModel = model;

  const lampAt = (angle) => ({
    x: -ARC_R * Math.cos(angle * D2R),
    y: FIG_H + ARC_R * Math.sin(angle * D2R)
  });
  const tipX = (angle) => {
    const m = model(angle);
    return (Math.cos(angle * D2R) >= 0 ? 1 : -1) * (m.length / 100);
  };
  window.shadowArcGeom = { FIG_H, ARC_R, MIN_LEN, POS, lampAt, model };

  class ShadowArcScene extends HTMLElement {
    static get observedAttributes() {
      return ['experiment', 'on', 'angle', 'rays', 'measure', 'view', 'curtain'];
    }

    constructor() {
      super();
      this.cfg = { experiment: 'position', on: 'no', angle: 20, rays: 'no', measure: 'no', view: 'apparatus', curtain: 'open' };
      this.cam = { az: -0.44, el: 0.30, dist: 1 };
      this.last = 0; this.lit = 0; this.ang = 20; this.strT = 0;
      this.shut = 0;                 /* 0 = curtains open, 1 = curtains closed */
      this.activeLetter = '';
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'angle') {
        const p = parseFloat(v);
        this.cfg.angle = isFinite(p) ? clamp(p, 0, 180) : this.cfg.angle;
        this.kick();
        return;
      }
      const was = this.cfg[n];
      this.cfg[n] = v === null || v === undefined ? was : v;
      if (n === 'measure' && this.cfg.measure === 'yes' && was !== 'yes') {
        /* deferred one turn, so every other attribute of the same render has
           landed and the reading can never be taken from a stale angle */
        clearTimeout(this._ft);
        this._ft = setTimeout(() => this.fireMeasure(), 0);
      }
      if (n === 'measure' && this.cfg.measure !== 'yes') this.strT = 0;
      this.kick();
    }

    /* the animation loop is paused whenever the page is not visible, so a change
       made off-screen is caught up by hand — the bench is never left unpainted */
    kick() {
      if (!this.r) return;
      clearTimeout(this._kt);
      this._kt = setTimeout(() => {
        if (performance.now() - (this._tick || 0) < 300) return;
        let t = Math.max(this.last * 1000, 1);
        for (let i = 0; i < 40; i++) { t += 26; this.step(t); }
      }, 70);
    }

    exp() { return this.cfg.experiment === 'length' ? 'length' : 'position'; }
    viewMode() {
      const v = this.cfg.view;
      return v === 'top' || v === 'both' ? v : 'apparatus';
    }
    curtainShut() { return this.cfg.curtain === 'closed' || this.cfg.curtain === 'shut' || this.cfg.curtain === 'yes'; }
    nearestLetter(a) {
      let best = '', bd = 1e9;
      Object.keys(POS).forEach((k) => { const d = Math.abs(POS[k] - a); if (d < bd) { bd = d; best = k; } });
      return bd <= 3 ? best : '';
    }
    fireMeasure() {
      const m = model(this.cfg.angle);
      window.dispatchEvent(new CustomEvent('shadowarc-measured', {
        detail: { position: this.nearestLetter(this.cfg.angle), length: m.length }
      }));
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', background: '#9db9d2' });
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
      r.toneMappingExposure = 1.08;
      r.autoClear = false;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.r = r;

      this.build();
      this.camA = new THREE.PerspectiveCamera(38, 1, 0.01, 12);
      this.camT = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4);

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
      g.addColorStop(0, inner);
      g.addColorStop(0.34, mid);
      g.addColorStop(1, 'rgba(255,200,110,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    /* the sky beyond the window: a plain gradient with a couple of soft clouds */
    skyTex() {
      const T = this.THREE, cv = document.createElement('canvas');
      const W = 640, H = 512;
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#4e94d8');
      g.addColorStop(0.5, '#94c6ea');
      g.addColorStop(0.86, '#d6e8f4');
      g.addColorStop(1, '#e7eee6');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      const cloud = (x, y, s, alpha) => {
        cx.save();
        cx.globalAlpha = alpha;
        cx.fillStyle = '#ffffff';
        try { cx.filter = 'blur(9px)'; } catch (e) { /* older canvas */ }
        [[0, 0, 1], [0.78, 0.16, 0.7], [-0.8, 0.18, 0.64], [0.34, -0.26, 0.6], [-0.34, -0.2, 0.52]]
          .forEach(([dx, dy, rr]) => {
            cx.beginPath();
            cx.ellipse(x + dx * s, y + dy * s, rr * s, rr * s * 0.58, 0, 0, Math.PI * 2);
            cx.fill();
          });
        cx.restore();
      };
      cloud(200, 160, 86, 0.95);
      cloud(470, 288, 58, 0.8);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    /* the tape measure: centimetre marks either side of the figure's feet */
    tapeTex() {
      const T = this.THREE, cv = document.createElement('canvas');
      const W = 1600, H = 110;
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#e9d79a'; cx.fillRect(0, 0, W, H);
      cx.fillStyle = '#d8c081'; cx.fillRect(0, 0, W, 8);
      const px = W / (TAPE_HALF * 200);           /* pixels per centimetre */
      const mid = W / 2;
      cx.strokeStyle = '#1d1a12';
      for (let c = -Math.round(TAPE_HALF * 100); c <= TAPE_HALF * 100; c++) {
        const x = mid + c * px;
        const major = c % 5 === 0, ten = c % 10 === 0;
        cx.lineWidth = ten ? 3.4 : major ? 2.4 : 1.4;
        cx.beginPath();
        cx.moveTo(x, H);
        cx.lineTo(x, H - (ten ? 44 : major ? 32 : 20));
        cx.stroke();
      }
      cx.fillStyle = '#1d1a12';
      cx.textAlign = 'center'; cx.textBaseline = 'top';
      cx.font = '900 30px Nunito, system-ui, sans-serif';
      [0, 10, 20, 30].forEach((c) => {
        [-1, 1].forEach((sgn) => {
          if (c === 0 && sgn < 0) return;
          cx.fillText(String(c), mid + sgn * c * px, 12);
        });
      });
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    }

    letterSprite(ch) {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const cx = cv.getContext('2d');
      const draw = (col, ring) => {
        cx.clearRect(0, 0, 96, 96);
        cx.beginPath(); cx.arc(48, 48, 33, 0, Math.PI * 2);
        cx.fillStyle = 'rgba(7,13,21,.92)'; cx.fill();
        cx.lineWidth = 5; cx.strokeStyle = ring; cx.stroke();
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillStyle = col;
        cx.font = '900 46px Nunito, system-ui, sans-serif';
        cx.fillText(ch, 48, 51);
      };
      draw('#cfe3f2', 'rgba(255,255,255,.6)');
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0.95 }));
      sp.name = 'arc_letter';
      sp.renderOrder = 30;
      sp.scale.set(0.036, 0.036, 1);
      sp.userData.setActive = (on) => {
        if (sp.userData.on === on) return;
        sp.userData.on = on;
        if (on) draw('#ffb627', 'rgba(255,182,39,.95)');
        else draw('#cfe3f2', 'rgba(255,255,255,.6)');
        tex.needsUpdate = true;
        sp.scale.setScalar(on ? 0.044 : 0.036);
        sp.scale.z = 1;
      };
      return sp;
    }

    /* a floating pill plate that names one piece of the apparatus */
    pillSprite(text) {
      const T = this.THREE, cv = document.createElement('canvas');
      const W = 512, H = 144;
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = '900 58px Nunito, system-ui, sans-serif';
      const tw = cx.measureText(text).width;
      const pw = Math.min(W - 12, tw + 92), ph = 104;
      const x0 = (W - pw) / 2, y0 = (H - ph) / 2, r = ph / 2;
      cx.beginPath();
      cx.moveTo(x0 + r, y0);
      cx.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r);
      cx.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r);
      cx.arcTo(x0, y0 + ph, x0, y0, r);
      cx.arcTo(x0, y0, x0 + pw, y0, r);
      cx.closePath();
      cx.fillStyle = 'rgba(9,16,26,.88)'; cx.fill();
      cx.lineWidth = 5; cx.strokeStyle = 'rgba(255,182,39,.85)'; cx.stroke();
      cx.fillStyle = '#ffe6b0';
      cx.letterSpacing = '4px';
      cx.fillText(text, W / 2, H / 2 + 3);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 1 }));
      sp.name = 'label_' + text.toLowerCase().replace(/\s+/g, '_');
      sp.renderOrder = 34;
      const h = 0.082;                       /* tall enough for a 9-year-old to read */
      sp.scale.set(h * (pw / ph), h, 1);
      return sp;
    }

    /* ---------- the bench ---------- */
    build() {
      const T = this.THREE;
      const s = new T.Scene();
      this.bg = new T.Color(DAY_BG);
      s.background = this.bg;
      /* fog sits far past anything the camera can reach and is tinted to the
         background, so it can never grey the room down */
      s.fog = new T.Fog(this.bg.clone(), 9, 30);
      this.s = s;

      this.mats = {
        stage: new T.MeshStandardMaterial({ name: 'stage_floor', color: 0x9aa3ab, roughness: 0.95, metalness: 0 }),
        grey: new T.MeshStandardMaterial({ name: 'lab_grey', color: 0x767f8a, roughness: 0.7, metalness: 0.06 }),
        steel: new T.MeshStandardMaterial({ name: 'steel', color: 0xbac4cd, roughness: 0.38, metalness: 0.3 }),
        wood: new T.MeshStandardMaterial({ name: 'wood_figure', color: 0xd8a969, roughness: 0.76, metalness: 0 }),
        joint: new T.MeshStandardMaterial({ name: 'wood_joint', color: 0xa87b43, roughness: 0.7, metalness: 0 }),
        room: new T.MeshStandardMaterial({ name: 'room_floor', color: 0x8d8a83, roughness: 0.97 }),
        wall: new T.MeshStandardMaterial({ name: 'room_wall', color: 0xc4c2b8, roughness: 0.98 }),
        frame: new T.MeshStandardMaterial({ name: 'window_frame', color: 0xe6e3d9, roughness: 0.62 }),
        curtain: new T.MeshStandardMaterial({ name: 'curtain', color: 0xc8b89c, roughness: 0.95, side: T.DoubleSide })
      };

      this.g = new T.Group(); this.g.name = 'shadow_arc_bench'; s.add(this.g);

      this.buildRoom();
      this.buildWindow();
      this.buildCurtains();
      this.buildPendant();
      this.buildRigs();
      this.buildStage();
      this.buildFigure();
      this.buildArc();
      this.buildLamp();
      this.buildRays();
      this.buildMeasure();
      this.buildDimension();
      this.buildLabels();
    }

    contactTex() {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,.9)');
      g.addColorStop(0.45, 'rgba(0,0,0,.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    buildRoom() {
      const T = this.THREE, G = this.g;
      const floor = new T.Mesh(new T.PlaneGeometry(4.4, 3.4), this.mats.room);
      floor.name = 'room_floor';
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -0.002, 0.5);
      floor.receiveShadow = true;
      G.add(floor);

      const ctex = this.contactTex();
      const patch = new T.Mesh(new T.PlaneGeometry(STAGE_W + 0.55, STAGE_D + 0.45),
        new T.MeshBasicMaterial({ name: 'bench_contact', map: ctex, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, fog: false }));
      patch.name = 'bench_contact';
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(0, 0.0012, 0.01);
      G.add(patch);

      this.footPatch = new T.Mesh(new T.PlaneGeometry(0.075, 0.05),
        new T.MeshBasicMaterial({ name: 'figure_contact', map: ctex, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, fog: false }));
      this.footPatch.name = 'figure_contact';
      this.footPatch.rotation.x = -Math.PI / 2;
      this.footPatch.position.set(0, STAGE_Y + 0.0016, 0.004);
      G.add(this.footPatch);
    }

    /* the back wall, built in four pieces around the window opening */
    buildWindow() {
      const T = this.THREE, G = this.g, M = this.mats;
      const w = new T.Group(); w.name = 'window_wall';
      const X0 = -2.2, X1 = 2.2, Y0 = -0.3, Y1 = 1.62, TH = 0.05;

      const slab = (x0, x1, y0, y1, nm) => {
        const m = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, TH), M.wall);
        m.name = nm;
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, WALL_Z - TH / 2);
        m.receiveShadow = true;
        w.add(m);
      };
      slab(X0, WIN.x0, Y0, Y1, 'wall_left');
      slab(WIN.x1, X1, Y0, Y1, 'wall_right');
      slab(WIN.x0, WIN.x1, WIN.y1, Y1, 'wall_over_window');
      slab(WIN.x0, WIN.x1, Y0, WIN.y0, 'wall_under_window');

      /* the sky, a little way beyond the opening */
      this.skyMat = new T.MeshBasicMaterial({ name: 'sky', map: this.skyTex(), toneMapped: false, fog: false });
      const sky = new T.Mesh(new T.PlaneGeometry((WIN.x1 - WIN.x0) + 0.5, (WIN.y1 - WIN.y0) + 0.4), this.skyMat);
      sky.name = 'sky';
      sky.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, WALL_Z - 0.30);
      w.add(sky);

      /* frame, mullions and sill */
      const bar = (x0, x1, y0, y1, z, d, nm) => {
        const m = new T.Mesh(new T.BoxGeometry(Math.max(0.004, x1 - x0), Math.max(0.004, y1 - y0), d), M.frame);
        m.name = nm;
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
        m.castShadow = false; m.receiveShadow = true;
        w.add(m);
      };
      const fz = WALL_Z - 0.012, fd = 0.035, t = 0.03;
      bar(WIN.x0 - t, WIN.x1 + t, WIN.y1, WIN.y1 + t, fz, fd, 'window_head');
      bar(WIN.x0 - t, WIN.x1 + t, WIN.y0 - t, WIN.y0, fz, fd, 'window_sill_frame');
      bar(WIN.x0 - t, WIN.x0, WIN.y0, WIN.y1, fz, fd, 'window_jamb');
      bar(WIN.x1, WIN.x1 + t, WIN.y0, WIN.y1, fz, fd, 'window_jamb');
      const cxm = (WIN.x0 + WIN.x1) / 2, cym = (WIN.y0 + WIN.y1) / 2;
      bar(cxm - 0.011, cxm + 0.011, WIN.y0, WIN.y1, fz, 0.03, 'window_mullion');
      bar(WIN.x0, WIN.x1, cym - 0.010, cym + 0.010, fz, 0.03, 'window_mullion');

      const sill = new T.Mesh(new T.BoxGeometry((WIN.x1 - WIN.x0) + 0.13, 0.026, 0.09), M.frame);
      sill.name = 'window_sill';
      sill.position.set(cxm, WIN.y0 - t - 0.013, WALL_Z + 0.018);
      sill.castShadow = true; sill.receiveShadow = true;
      w.add(sill);

      G.add(w);
      this.wallGroup = w;
    }

    /* a pair of curtains on a rod: bunched at the sides when open, meeting in
       the middle when closed */
    buildCurtains() {
      const T = this.THREE, G = this.g, M = this.mats;
      const c = new T.Group(); c.name = 'curtains';
      const rodZ = WALL_Z + 0.075;

      /* the rod and finials get their own material so they can fade with the wall */
      this.rodMat = this.mats.steel.clone();
      this.rodMat.name = 'curtain_rod_steel';
      const rod = new T.Mesh(new T.CylinderGeometry(0.0085, 0.0085, (CURT_R - CURT_L) + 0.14, 14), this.rodMat);
      rod.name = 'curtain_rod';
      rod.rotation.z = Math.PI / 2;
      rod.position.set((CURT_L + CURT_R) / 2, ROD_Y, rodZ);
      c.add(rod);
      [CURT_L - 0.07, CURT_R + 0.07].forEach((x) => {
        const f = new T.Mesh(new T.SphereGeometry(0.016, 16, 12), this.rodMat);
        f.name = 'rod_finial';
        f.position.set(x, ROD_Y, rodZ);
        c.add(f);
      });
      [-1, 1].forEach((sgn) => {
        const br = new T.Mesh(new T.BoxGeometry(0.018, 0.05, 0.11), this.rodMat);
        br.name = 'rod_bracket';
        br.position.set(sgn < 0 ? CURT_L - 0.03 : CURT_R + 0.03, ROD_Y - 0.03, (WALL_Z + rodZ) / 2);
        c.add(br);
      });

      /* one panel of pleated cloth, unit width, anchored on its outer edge */
      const panel = (nm) => {
        const h = CURT_TOP - CURT_BOT;
        const geo = new T.PlaneGeometry(1, h, 28, 6);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const u = p.getX(i) + 0.5, v = (p.getY(i) + h / 2) / h;
          const fold = Math.sin(u * Math.PI * 9) * 0.5 + Math.sin(u * Math.PI * 23) * 0.16;
          p.setZ(i, fold * 0.055 * (0.45 + 0.55 * (1 - v)));
          p.setY(i, p.getY(i) + Math.sin(u * Math.PI * 9) * 0.006 * v);
        }
        geo.computeVertexNormals();
        const m = new T.Mesh(geo, M.curtain);
        m.name = nm;
        m.position.y = (CURT_TOP + CURT_BOT) / 2;
        m.position.z = rodZ;
        m.castShadow = false; m.receiveShadow = true;
        c.add(m);
        return m;
      };
      this.curtL = panel('curtain_left');
      this.curtR = panel('curtain_right');
      G.add(c);
      this.curtGroup = c;
      this.setCurtains(0);
    }

    setCurtains(k) {
      const w = lerp(CURT_W_OPEN, CURT_W_SHUT, k);
      this.curtL.scale.x = w;
      this.curtL.position.x = CURT_L + w / 2;
      this.curtR.scale.x = w;
      this.curtR.position.x = CURT_R - w / 2;
      const z = lerp(0.9, 0.42, k);            /* gathered cloth folds deeper */
      this.curtL.scale.z = z; this.curtR.scale.z = z;
    }

    /* the pendant lamp hanging over the bench */
    buildPendant() {
      const T = this.THREE, G = this.g, M = this.mats;
      const p = new T.Group(); p.name = 'pendant_lamp';
      p.position.set(PEND.x, 0, PEND.z);

      const cord = new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, 0.92, 8), M.grey);
      cord.name = 'pendant_cord';
      cord.position.y = PEND.y + 0.10 + 0.46;
      p.add(cord);

      const shade = new T.Mesh(new T.CylinderGeometry(0.030, 0.082, 0.072, 30, 1, true),
        new T.MeshStandardMaterial({ name: 'pendant_shade', color: 0x8d97a2, roughness: 0.54, metalness: 0.12, side: T.DoubleSide }));
      shade.name = 'pendant_shade';
      shade.position.y = PEND.y + 0.064;
      shade.castShadow = false;
      p.add(shade);

      const inner = new T.Mesh(new T.ConeGeometry(0.079, 0.052, 30, 1, true),
        new T.MeshStandardMaterial({ name: 'pendant_inner', color: 0xfff2da, roughness: 0.9, side: T.BackSide }));
      inner.name = 'pendant_inner';
      inner.position.y = PEND.y + 0.058;
      p.add(inner);

      this.pendMat = new T.MeshStandardMaterial({ name: 'pendant_bulb', color: 0xfff6e4, emissive: 0xffdca6, emissiveIntensity: 0.1, roughness: 0.3, toneMapped: false });
      const bulb = new T.Mesh(new T.SphereGeometry(0.022, 20, 14), this.pendMat);
      bulb.name = 'pendant_bulb';
      bulb.position.y = PEND.y + 0.026;
      p.add(bulb);

      this.pendGlowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,246,224,1)', 'rgba(255,214,140,.55)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const glow = new T.Sprite(this.pendGlowMat);
      glow.name = 'pendant_glow';
      glow.scale.set(0.24, 0.24, 1);
      glow.position.y = PEND.y + 0.030;
      glow.renderOrder = 12;
      p.add(glow);

      G.add(p);
    }

    /* two rigs that cross-fade: daylight through the window, and the room lamp */
    buildRigs() {
      const T = this.THREE, G = this.g;

      /* — daylight — */
      const key = new T.DirectionalLight(0xfff3e0, 0);
      key.name = 'daylight_key';
      key.position.set((WIN.x0 + WIN.x1) / 2 + 0.18, WIN.y1 + 0.30, WALL_Z - 0.60);
      key.target.position.set(-0.06, 0.05, 0.08);
      /* only the experiment's own lamp casts a shadow map, so the one shadow on
         the stage is always the one the lesson is about; the daylight is grounded
         by the soft contact patches instead */
      key.castShadow = false;
      G.add(key, key.target);
      const hemi = new T.HemisphereLight(0xd7e9f7, 0x8b8578, 0);
      hemi.name = 'daylight_hemi';
      G.add(hemi);
      const bounce = new T.DirectionalLight(0xe8eef4, 0);
      bounce.name = 'daylight_bounce';
      bounce.position.set(-0.95, 0.58, 1.25);
      bounce.target.position.set(0, 0.05, 0);
      G.add(bounce, bounce.target);
      this.day = { key, hemi, bounce };

      /* — room lamp — */
      const spot = new T.SpotLight(0xffd9a4, 0, 3.4, 1.0, 0.92, 1.0);
      spot.name = 'room_lamp_key';
      spot.position.set(PEND.x, PEND.y + 0.03, PEND.z);
      spot.target.position.set(-0.52, 0.02, 0.24);
      G.add(spot, spot.target);
      const rhemi = new T.HemisphereLight(0xffdfbb, 0x594a3c, 0);
      rhemi.name = 'room_lamp_hemi';
      G.add(rhemi);
      const rfill = new T.DirectionalLight(0xffe7cb, 0);
      rfill.name = 'room_lamp_fill';
      rfill.position.set(0.8, 0.72, 1.15);
      rfill.target.position.set(0, 0.05, 0);
      G.add(rfill, rfill.target);
      this.room = { spot, hemi: rhemi, fill: rfill };
    }

    buildStage() {
      const T = this.THREE, M = this.mats, G = this.g;

      const top = new T.Mesh(new T.BoxGeometry(STAGE_W, STAGE_Y, STAGE_D), M.stage);
      top.name = 'stage_floor';
      top.position.y = STAGE_Y / 2;
      top.receiveShadow = true; top.castShadow = false;
      G.add(top);

      const rim = new T.Mesh(new T.BoxGeometry(STAGE_W + 0.014, 0.010, STAGE_D + 0.014), M.grey);
      rim.name = 'stage_rim'; rim.position.y = 0.005; rim.receiveShadow = true; G.add(rim);

      /* the tape measure, lying along the floor in front of the figure */
      this.tape = new T.Mesh(new T.PlaneGeometry(TAPE_HALF * 2, 0.052),
        new T.MeshStandardMaterial({ name: 'tape_measure', map: this.tapeTex(), roughness: 0.86 }));
      this.tape.name = 'tape_measure';
      this.tape.rotation.x = -Math.PI / 2;
      this.tape.position.set(0, STAGE_Y + 0.0012, TAPE_Z);
      this.tape.receiveShadow = true;
      G.add(this.tape);

      /* the mark the figure stands on */
      const mark = new T.Mesh(new T.RingGeometry(0.024, 0.029, 40),
        new T.MeshBasicMaterial({ name: 'stand_mark', color: 0x4d5862, transparent: true, opacity: 0.8, toneMapped: false }));
      mark.name = 'stand_mark';
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, STAGE_Y + 0.0014, 0);
      G.add(mark);
    }

    /* a small standing wooden figure, built from turned parts */
    buildFigure() {
      const T = this.THREE, M = this.mats;
      const f = new T.Group(); f.name = 'wooden_figure';
      f.position.y = STAGE_Y;
      const add = (geo, mat, x, y, z, rz) => {
        const m = new T.Mesh(geo, mat);
        m.position.set(x, y, z || 0);
        if (rz) m.rotation.z = rz;
        m.castShadow = true; m.receiveShadow = true;
        f.add(m);
        return m;
      };
      const leg = new T.CylinderGeometry(0.0058, 0.0048, 0.031, 14);
      add(leg, M.wood, -0.0085, 0.0155, 0).name = 'figure_leg';
      add(leg, M.wood, 0.0085, 0.0155, 0).name = 'figure_leg';
      const foot = new T.BoxGeometry(0.014, 0.005, 0.022);
      add(foot, M.joint, -0.0085, 0.0025, 0.004).name = 'figure_foot';
      add(foot, M.joint, 0.0085, 0.0025, 0.004).name = 'figure_foot';
      add(new T.BoxGeometry(0.026, 0.012, 0.016), M.joint, 0, 0.037, 0).name = 'figure_hips';
      add(new T.BoxGeometry(0.030, 0.026, 0.017), M.wood, 0, 0.056, 0).name = 'figure_torso';
      add(new T.CylinderGeometry(0.0055, 0.0055, 0.040, 14), M.joint, 0, 0.0685, 0, Math.PI / 2).name = 'figure_shoulders';
      const arm = new T.CylinderGeometry(0.0046, 0.0040, 0.030, 12);
      add(arm, M.wood, -0.0215, 0.054, 0, 0.17).name = 'figure_arm';
      add(arm, M.wood, 0.0215, 0.054, 0, -0.17).name = 'figure_arm';
      add(new T.CylinderGeometry(0.0038, 0.0038, 0.007, 12), M.joint, 0, 0.0725, 0).name = 'figure_neck';
      add(new T.SphereGeometry(0.0098, 22, 16), M.wood, 0, 0.0755, 0).name = 'figure_head';
      this.g.add(f);
      this.figure = f;
    }

    /* the flexible arc over the stage, marked A to E */
    buildArc() {
      const T = this.THREE, M = this.mats, G = this.g;
      const a = new T.Group(); a.name = 'light_arc';
      a.position.y = FIG_H;

      const rail = new T.Mesh(new T.TorusGeometry(ARC_R, 0.0055, 12, 150, Math.PI),
        new T.MeshStandardMaterial({ name: 'arc_rail', color: 0x9dabb7, roughness: 0.42, metalness: 0.2 }));
      rail.name = 'arc_rail';
      a.add(rail);

      const inner = new T.Mesh(new T.TorusGeometry(ARC_R - 0.011, 0.0022, 8, 130, Math.PI),
        new T.MeshStandardMaterial({ name: 'arc_guide', color: 0x6b7784, roughness: 0.8, metalness: 0.06 }));
      inner.name = 'arc_guide';
      a.add(inner);

      [-1, 1].forEach((sgn) => {
        const h = FIG_H - STAGE_Y;
        const post = new T.Mesh(new T.CylinderGeometry(0.0075, 0.0095, h, 16), M.grey);
        post.name = 'arc_post';
        post.position.set(sgn * ARC_R, -h / 2, 0);
        post.castShadow = false; post.receiveShadow = true;
        a.add(post);
        const foot = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 0.008, 22), M.grey);
        foot.name = 'arc_foot';
        foot.position.set(sgn * ARC_R, -h + 0.004, 0);
        foot.receiveShadow = true;
        a.add(foot);
      });

      this.letters = [];
      Object.keys(POS).forEach((k) => {
        const deg = POS[k], phi = Math.PI - deg * D2R;
        const tick = new T.Mesh(new T.BoxGeometry(0.0045, 0.020, 0.016),
          new T.MeshStandardMaterial({ name: 'arc_mark', color: 0xdde4ea, roughness: 0.5, metalness: 0.08 }));
        tick.name = 'arc_mark';
        tick.position.set(Math.cos(phi) * ARC_R, Math.sin(phi) * ARC_R, 0);
        tick.rotation.z = phi - Math.PI / 2;
        a.add(tick);
        const sp = this.letterSprite(k);
        sp.position.set(Math.cos(phi) * (ARC_R + 0.046), Math.sin(phi) * (ARC_R + 0.046), 0);
        sp.userData.key = k;
        a.add(sp);
        this.letters.push(sp);
      });

      G.add(a);
      this.arc = a;
    }

    buildLamp() {
      const T = this.THREE, M = this.mats, G = this.g;
      const l = new T.Group(); l.name = 'light_source';

      const clip = new T.Mesh(new T.TorusGeometry(0.0105, 0.0032, 8, 22), M.steel);
      clip.name = 'lamp_clip'; clip.rotation.y = Math.PI / 2; clip.position.z = -0.016; l.add(clip);
      const stem = new T.Mesh(new T.CylinderGeometry(0.0032, 0.0032, 0.018, 10), M.steel);
      stem.name = 'lamp_stem'; stem.rotation.x = Math.PI / 2; stem.position.z = -0.006; l.add(stem);
      const body = new T.Mesh(new T.CylinderGeometry(0.0125, 0.016, 0.024, 26), M.grey);
      body.name = 'lamp_body'; body.rotation.x = Math.PI / 2; body.position.z = 0.008; l.add(body);
      const bezel = new T.Mesh(new T.TorusGeometry(0.0158, 0.0020, 8, 26), M.steel);
      bezel.name = 'lamp_bezel'; bezel.position.z = 0.0202; l.add(bezel);

      this.lensMat = new T.MeshStandardMaterial({ name: 'lamp_lens', color: 0x3a3b34, emissive: 0xffe3a6, emissiveIntensity: 0, roughness: 0.18, toneMapped: false });
      const lens = new T.Mesh(new T.CircleGeometry(0.0148, 26), this.lensMat);
      lens.name = 'lamp_lens'; lens.position.z = 0.0206; l.add(lens);

      this.glowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,249,229,1)', 'rgba(255,214,130,.7)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const glow = new T.Sprite(this.glowMat);
      glow.name = 'lamp_glow'; glow.scale.set(0.075, 0.075, 1); glow.position.z = 0.024; glow.renderOrder = 26;
      l.add(glow);

      G.add(l);
      this.lamp = l;

      /* the shadow itself comes from a directional light along the lamp's own
         line of sight, so the cast shadow on the stage is exactly the length the
         model predicts */
      this.sun = new T.DirectionalLight(0xfff3da, 0);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -0.56; sc.right = 0.56; sc.top = 0.42; sc.bottom = -0.42;
      sc.near = 0.01; sc.far = 1.8;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.0035;
      /* aimed at the arc's own centre, so the light direction IS the arc angle
         and the cast shadow is exactly as long as the model says */
      this.sun.target.position.set(0, FIG_H, 0);
      G.add(this.sun, this.sun.target);

      /* a small warm falloff so the lamp housing itself reads as lit — kept short
         so the stage floor is lit by the sun alone and the shadow is the only
         thing that changes across it */
      this.bulb = new T.PointLight(0xffe4b4, 0, 0.20, 1.6);
      G.add(this.bulb);

      /* a faint cone from the lamp down to the figure */
      this.cone = new T.Mesh(new T.ConeGeometry(1, 1, 28, 1, true),
        new T.MeshBasicMaterial({ name: 'lamp_beam', color: 0xffe2ab, transparent: true, opacity: 0, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending, fog: false, toneMapped: false }));
      this.cone.name = 'lamp_beam'; this.cone.renderOrder = 16;
      G.add(this.cone);
    }

    /* floating name plates over the parts of the apparatus */
    buildLabels() {
      const G = this.g;
      const mk = (text, x, y, z) => {
        const sp = this.pillSprite(text);
        sp.position.set(x, y, z);
        G.add(sp);
        return sp;
      };
      this.labFigure = mk('FIGURE', 0, STAGE_Y + 0.208, 0);
      this.labStage = mk('STAGE', 0.352, STAGE_Y + 0.062, 0.195);
      this.labTape = mk('TAPE', -0.315, STAGE_Y + 0.050, TAPE_Z + 0.01);
      this.labLight = mk('LIGHT', 0, 0, 0);
      this.labels = [this.labFigure, this.labStage, this.labTape, this.labLight];
    }

    /* a small plate that holds the shadow's length, hidden until it is asked for */
    dimPill() {
      const T = this.THREE, cv = document.createElement('canvas');
      const W = 320, H = 128;
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'shadow_length_plate';
      sp.renderOrder = 36;
      sp.userData.set = (text, shown) => {
        if (sp.userData.txt === text && sp.userData.shown === shown) return;
        sp.userData.txt = text; sp.userData.shown = shown;
        cx.clearRect(0, 0, W, H);
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.font = '900 ' + (shown ? 54 : 64) + 'px Nunito, system-ui, sans-serif';
        const pw = Math.min(W - 8, cx.measureText(text).width + 74), ph = 92;
        const x0 = (W - pw) / 2, y0 = (H - ph) / 2, r = ph / 2;
        cx.beginPath();
        cx.moveTo(x0 + r, y0);
        cx.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r);
        cx.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r);
        cx.arcTo(x0, y0 + ph, x0, y0, r);
        cx.arcTo(x0, y0, x0 + pw, y0, r);
        cx.closePath();
        cx.fillStyle = shown ? 'rgba(9,16,26,.95)' : 'rgba(255,182,39,.95)';
        cx.fill();
        cx.lineWidth = 6;
        cx.strokeStyle = shown ? '#5ee07a' : 'rgba(9,16,26,.55)';
        cx.stroke();
        cx.fillStyle = shown ? '#5ee07a' : '#10161f';
        cx.fillText(text, W / 2, H / 2 + 3);
        tex.needsUpdate = true;
        const h = 0.062;
        sp.scale.set(h * (pw / ph), h, 1);
      };
      sp.userData.set('?', false);
      return sp;
    }

    buildDimension() {
      const T = this.THREE, G = this.g;
      const Z = 0.047;
      this.dimMat = new T.MeshBasicMaterial({ name: 'shadow_span', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      this.dimLine = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 8), this.dimMat);
      this.dimLine.name = 'shadow_span'; this.dimLine.renderOrder = 24; this.dimLine.visible = false;
      G.add(this.dimLine);
      this.dimEnds = [0, 1].map(() => {
        const m = new T.Mesh(new T.BoxGeometry(0.0022, 0.0022, 0.030), this.dimMat);
        m.name = 'shadow_span_end'; m.renderOrder = 24; m.visible = false;
        G.add(m);
        return m;
      });
      this.dimZ = Z;
      this.dim = this.dimPill();
      this.dim.visible = false;
      G.add(this.dim);
    }

    buildRays() {
      const T = this.THREE, G = this.g;
      const geo = new T.CylinderGeometry(1, 1, 1, 10);
      this.rayMat = new T.MeshBasicMaterial({ name: 'light_ray', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false });
      this.rays = [-0.058, -0.019, 0.019, 0.058].map((z) => {
        const m = new T.Mesh(geo, this.rayMat);
        m.name = 'light_ray'; m.renderOrder = 20; m.visible = false;
        m.userData.z = z;
        G.add(m);
        return m;
      });
      this.rayDotMat = new T.MeshBasicMaterial({ name: 'ray_landing', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      this.rayDots = this.rays.map(() => {
        const m = new T.Mesh(new T.CircleGeometry(0.0055, 18), this.rayDotMat);
        m.name = 'ray_landing'; m.rotation.x = -Math.PI / 2; m.visible = false;
        G.add(m);
        return m;
      });
    }

    buildMeasure() {
      const T = this.THREE, G = this.g;
      this.strMat = new T.MeshBasicMaterial({ name: 'measuring_string', color: 0xfff0c4, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      this.string = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10), this.strMat);
      this.string.name = 'measuring_string'; this.string.renderOrder = 22; this.string.visible = false;
      G.add(this.string);

      this.pinMat = new T.MeshBasicMaterial({ name: 'string_pin', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      this.pins = [0, 1].map(() => {
        const m = new T.Mesh(new T.CylinderGeometry(0.0022, 0.0022, 0.020, 10), this.pinMat);
        m.name = 'string_pin'; m.renderOrder = 23; m.visible = false;
        G.add(m);
        return m;
      });

      this.hiMat = new T.MeshBasicMaterial({ name: 'tape_reading', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
      this.hi = new T.Mesh(new T.PlaneGeometry(1, 0.052), this.hiMat);
      this.hi.name = 'tape_reading';
      this.hi.rotation.x = -Math.PI / 2;
      this.hi.position.y = STAGE_Y + 0.0022;
      this.hi.renderOrder = 21;
      this.hi.visible = false;
      G.add(this.hi);
    }

    /* ---------- interaction ---------- */
    bindPointer() {
      const el = this.r.domElement;
      let drag = null;
      el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.02, 1.2);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', (e) => {
        const still = drag && Math.abs(e.clientX - drag.x) < 4 && Math.abs(e.clientY - drag.y) < 4;
        drag = null;
        if (!still || !this.dim || !this.dim.visible) return;
        const b = el.getBoundingClientRect();
        const T = this.THREE;
        const rc = new T.Raycaster();
        rc.setFromCamera(new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1),
          this.viewMode() === 'top' ? this.camT : this.camA);
        if (rc.intersectObject(this.dim, false).length) {
          window.dispatchEvent(new CustomEvent('shadowarc-reveal', { detail: { position: this.nearestLetter(this.cfg.angle) } }));
        }
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.34, 2.4);
      }, { passive: false });
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    setSeg(mesh, from, to, r) {
      const T = this.THREE;
      const d = new T.Vector3().subVectors(to, from);
      const len = Math.max(0.0006, d.length());
      mesh.position.copy(from).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      mesh.scale.set(r, len, r);
    }

    frame(ms) {
      this._tick = performance.now();
      this.step(ms);
    }

    step(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const T = this.THREE, cfg = this.cfg;

      /* the light slides along the arc rather than jumping */
      this.ang = lerp(this.ang, cfg.angle, 1 - Math.exp(-dt * 8));
      if (Math.abs(this.ang - cfg.angle) < 0.05) this.ang = cfg.angle;
      const a = this.ang;
      const m = model(a);
      const tip = tipX(a);

      const on = cfg.on === 'yes' || cfg.on === true;
      this.lit = lerp(this.lit, on ? 1 : 0, 1 - Math.exp(-dt * 9));
      const L = smooth(clamp(this.lit, 0, 1));

      /* the curtains, and the cross-fade between the two rigs */
      this.shut = lerp(this.shut, this.curtainShut() ? 1 : 0, 1 - Math.exp(-dt * 3.4));
      if (Math.abs(this.shut - (this.curtainShut() ? 1 : 0)) < 0.002) this.shut = this.curtainShut() ? 1 : 0;
      const C = smooth(clamp(this.shut, 0, 1));
      const day = 1 - C;
      this.setCurtains(C);

      this.day.key.intensity = 2.45 * day;
      this.day.hemi.intensity = 1.25 * day;
      this.day.bounce.intensity = 0.85 * day;
      const q = 1 - 0.62 * L;            /* the room lamp gives way to the experiment */
      this.room.spot.intensity = 6.2 * C * q;
      this.room.hemi.intensity = 1.62 * C * q;
      this.room.fill.intensity = 0.95 * C * q;
      this.pendMat.emissiveIntensity = 0.1 + 1.5 * C;
      this.pendGlowMat.opacity = 0.5 * C;

      /* background and fog lift with the daylight, so nothing ever reads muddy */
      this.bg.setHex(LAMP_BG).lerp(new T.Color(DAY_BG), day);
      this.s.fog.color.copy(this.bg);
      if (this.r) this.r.setClearColor(this.bg, 1);

      const lp = lampAt(a);
      this.lamp.position.set(lp.x, lp.y, 0);
      this.lamp.lookAt(0, FIG_H, 0);
      this.sun.position.set(lp.x, lp.y, 0);
      this.sun.intensity = 7.4 * L;
      this.bulb.position.set(lp.x, lp.y, 0);
      this.bulb.intensity = 0.6 * L;
      this.lensMat.emissiveIntensity = 1.4 * L;
      this.glowMat.opacity = 0.72 * L;

      const head = new T.Vector3(0, FIG_H, 0);
      const lampV = new T.Vector3(lp.x, lp.y, 0);
      this.setSeg(this.cone, lampV, head, 1);
      this.cone.scale.set(0.055, ARC_R, 0.055);
      this.cone.material.opacity = 0.085 * L;
      this.cone.visible = L > 0.02;

      /* the name plates dim a little once the experiment's light is on */
      this.footPatch.material.opacity = 0.4 * (1 - L);
      const labOp = 1 - 0.42 * L;
      this.labels.forEach((sp) => { sp.material.opacity = labOp; });
      this.labLight.position.set(lp.x, lp.y + 0.070, 0);

      /* the marked position the lamp is sitting on */
      const letter = this.nearestLetter(cfg.angle);
      this.letters.forEach((sp) => sp.userData.setActive(sp.userData.key === letter));

      /* rays: parallel amber lines from the lamp, past the figure, to the tip */
      const wantR = cfg.rays === 'yes' && L > 0.05;
      this.rayMat.opacity = lerp(this.rayMat.opacity, wantR ? 0.85 : 0, 1 - Math.exp(-dt * 8));
      this.rayDotMat.opacity = this.rayMat.opacity * 0.8;
      const rv = this.rayMat.opacity > 0.02;
      this.rays.forEach((mesh, i) => {
        mesh.visible = rv;
        this.rayDots[i].visible = rv;
        if (!rv) return;
        const z = mesh.userData.z;
        this.setSeg(mesh, new T.Vector3(lp.x, lp.y, z), new T.Vector3(tip, STAGE_Y + 0.0015, z), 0.0009);
        this.rayDots[i].position.set(tip, STAGE_Y + 0.0018, z);
      });

      /* the string laid along the shadow, and the length read off the tape */
      const wantS = cfg.measure === 'yes' && this.exp() === 'length' && L > 0.05;
      this.strT = lerp(this.strT, wantS ? 1 : 0, 1 - Math.exp(-dt * (wantS ? 7 : 12)));
      const S = smooth(clamp(this.strT, 0, 1));
      const sv = S > 0.02;
      const endX = tip * S;
      this.string.visible = sv;
      this.strMat.opacity = 0.95 * S;
      if (sv) this.setSeg(this.string,
        new T.Vector3(0, STAGE_Y + 0.0032, 0.022),
        new T.Vector3(endX, STAGE_Y + 0.0032, 0.022), 0.0016);
      this.pinMat.opacity = 0.95 * S;
      this.pins.forEach((p, i) => {
        p.visible = sv;
        p.position.set(i ? endX : 0, STAGE_Y + 0.010, 0.022);
      });
      this.hi.visible = sv;
      this.hiMat.opacity = 0.42 * S;
      if (sv) {
        this.hi.scale.x = Math.max(0.0015, Math.abs(endX));
        this.hi.position.set(endX / 2, STAGE_Y + 0.0022, TAPE_Z);
      }

      const dimOn = L > 0.06;
      this.dimMat.opacity = 0.9 * L;
      this.dimLine.visible = dimOn;
      this.dimEnds.forEach((e, i) => {
        e.visible = dimOn;
        e.position.set(i ? tip : 0, STAGE_Y + 0.010, this.dimZ);
        e.scale.y = 9;
      });
      if (dimOn) this.setSeg(this.dimLine,
        new T.Vector3(0, STAGE_Y + 0.0055, this.dimZ),
        new T.Vector3(tip, STAGE_Y + 0.0055, this.dimZ), 0.0013);
      const shown = cfg.measure === 'yes';
      this.dim.visible = dimOn;
      this.dim.material.opacity = L;
      this.dim.userData.set(shown ? m.length.toFixed(1) + ' cm' : '?', shown);
      this.dim.position.set(tip / 2, STAGE_Y + 0.062, this.dimZ);

      this.draw();

      window.dispatchEvent(new CustomEvent('shadowarc', {
        detail: { angle: Math.round(cfg.angle), length: m.length, side: m.side }
      }));
    }

    aimMain() {
      const c = this.camA, cd = this.cam;
      const ty = 0.15, tx = 0;
      const aspect = (this.vw || 800) / (this.vh || 500);
      /* the whole apparatus has to fit at any shape of frame: the stage and the
         letter plates reach 0.62 either side of the target, and the pendant over
         the bench reaches 0.55 above it — with the frame shifted up by 40/1000,
         the upper half of the view is 8% shorter than the fov alone suggests */
      const tanH = Math.tan(19 * Math.PI / 180);
      const base = Math.max(0.72 / (tanH * 0.92), 0.68 / (tanH * Math.max(aspect, 0.35)));
      const d = cd.dist * base;
      c.aspect = aspect;
      /* the position rail sits along the bottom edge, so the bench is framed a
         little above centre */
      c.setViewOffset(1000, 1000, 0, 40, 1000, 1000);
      c.updateProjectionMatrix();
      c.position.set(tx + Math.sin(cd.az) * Math.cos(cd.el) * d, ty + Math.sin(cd.el) * d, Math.cos(cd.az) * Math.cos(cd.el) * d);
      c.lookAt(tx, ty, 0);
    }

    /* the wall would otherwise fill the frame the moment the pupil orbits past
       it, so it dissolves as the camera crosses into the space behind it */
    fadeWall() {
      const k = clamp((this.camA.position.z - (WALL_Z + 0.04)) / 0.34, 0, 1);
      if (this._wallK === k) return;
      this._wallK = k;
      const fade = (m) => {
        if (!m) return;
        m.transparent = k < 0.999;
        m.opacity = k;
        m.depthWrite = k > 0.5;
        m.needsUpdate = true;
      };
      /* lab grey is shared with the apparatus, so it is deliberately not faded */
      [this.mats.wall, this.mats.frame, this.mats.curtain, this.skyMat, this.rodMat].forEach(fade);
      if (this.wallGroup) this.wallGroup.visible = k > 0.012;
      if (this.curtGroup) this.curtGroup.visible = k > 0.012;
    }

    /* the second view looks down on the stage, tilted just off vertical so the
       arc overhead does not lie across the shadow it is casting */
    topCam(aspect) {
      const c = this.camT;
      const halfW = 0.55;
      const halfH = Math.max(halfW / Math.max(aspect, 0.2), 0.30);
      const w2 = Math.max(halfW, halfH * aspect);
      c.left = -w2; c.right = w2; c.top = halfH; c.bottom = -halfH;
      c.position.set(0, 0.92, 0.40);
      c.updateProjectionMatrix();
      c.lookAt(0, 0.02, 0);
      return c;
    }

    draw() {
      const r = this.r, W = this.vw || 800, H = this.vh || 500;
      const mode = this.viewMode();
      r.setScissorTest(false);
      r.setClearColor(this.bg, 1);
      r.clear(true, true, false);

      if (mode === 'top') {
        r.setViewport(0, 0, W, H);
        r.render(this.s, this.topCam(W / H));
        return;
      }

      this.aimMain();
      this.fadeWall();
      r.setViewport(0, 0, W, H);
      r.render(this.s, this.camA);

      if (mode !== 'both') return;
      const iw = Math.round(Math.min(360, W * 0.34)), ih = Math.round(iw * 0.62);
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
      r.render(this.s, this.topCam(iw / ih));
      r.setScissorTest(false);
    }
  }

  customElements.define('shadow-arc-scene', ShadowArcScene);
})();
