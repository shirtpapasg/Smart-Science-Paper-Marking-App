/* <shadow-show-scene> — three.js theatre for "it's showtime: a shadow puppet play"
   Attributes: experiment (materials|stage|show), on (yes|no),
               puppetmat (card|tracing|clear|cutcard),
               screenmat (whitecloth|blackcloth|clear|paper),
               puppets ("name:distance:turn:height:side", up to three, comma separated),
               scene (1-3), playing (yes|no), view (side|audience|both)
   Dispatches on window: "shadowshow" every frame with
     detail = { experiment, scene, sees, shadows: [{ name, height, shape }] },
   "shadowshow-scene" with { scene } when the playing scene changes, and
   "shadowshow-end" when the three scenes have finished.
   The shadows are real: one spot light with a shadow map, blocked by the puppets. */
(() => {
  if (window.__shadowShowScene) return;
  window.__shadowShowScene = true;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const D2R = Math.PI / 180;
  const num = (v, d) => { const p = parseFloat(v); return isFinite(p) ? p : d; };

  /* the theatre, in metres: light at the back, puppets on sticks, screen at the front */
  const LIGHT_X = -0.30, BEAM_Y = 0.1675, SCREEN_X = 0.28;
  const SCR_W = 0.34, SCR_H = 0.225, SCR_Y0 = 0.055;
  const PUP_X0 = -0.17, PUP_X1 = 0.235;      /* distance 0 = near the light, 1 = near the screen */
  const SX = 0.030, SY = 0.050, CARD_T = 0.0016;
  const SCENE_SECS = 10;
  const DARK_BG = 0x08131f;

  const pupX = (d) => PUP_X0 + (PUP_X1 - PUP_X0) * clamp(d, 0, 1);
  const magAt = (d) => (SCREEN_X - LIGHT_X) / Math.max(0.02, pupX(d) - LIGHT_X);

  const CAM = {
    materials: { az: -0.62, el: 0.30, dist: 1 },
    stage: { az: -0.66, el: 0.30, dist: 1 },
    show: { az: -0.58, el: 0.26, dist: 1 }
  };

  /* ---------- the puppet cut-outs ---------- */
  /* each part is a closed outline in normalised units: x -1..1, y 0..1 (0 = the
     stick end). holes are punched only into the card-with-cut-outs version. */
  const kx = SY / SX;
  const starPoly = (() => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1;
      p.push([Math.cos(a) * r * 0.45 * kx, 0.52 + Math.sin(a) * r * 0.45]);
    }
    return p;
  })();
  const moonPoly = (() => {
    const p = [], C = 0.52, RY = 0.45, d = 0.48, R2 = 0.82;
    const O = (a) => [Math.cos(a) * RY * kx, C + Math.sin(a) * RY];
    const I = (a) => [(d + Math.cos(a) * R2) * RY * kx, C + Math.sin(a) * R2 * RY];
    for (let i = 0; i <= 22; i++) p.push(O((54.5 + (305.5 - 54.5) * (i / 22)) * D2R));
    for (let i = 0; i <= 14; i++) p.push(I((277.1 + (82.9 - 277.1) * (i / 14)) * D2R));
    return p;
  })();

  const PUPPETS = {
    bird: {
      parts: [[[-1.00, 0.26], [-0.40, 0.22], [0.10, 0.20], [0.46, 0.28], [1.00, 0.40], [0.52, 0.52],
        [0.24, 0.56], [-0.06, 1.00], [-0.44, 0.58], [-0.74, 0.46], [-1.00, 0.52], [-0.72, 0.36]]],
      holes: [[0.62, 0.40, 0.075]]
    },
    fish: {
      parts: [[[-1.00, 0.92], [-0.52, 0.56], [-1.00, 0.20], [-0.55, 0.22], [-0.10, 0.14], [0.42, 0.20],
        [0.80, 0.40], [1.00, 0.56], [0.80, 0.72], [0.42, 0.90], [-0.10, 0.98], [-0.55, 0.90]]],
      holes: [[0.58, 0.56, 0.085]]
    },
    tree: {
      parts: [[[-0.14, 0.00], [0.14, 0.00], [0.14, 0.34], [0.46, 0.34], [0.62, 0.48], [0.56, 0.68],
        [0.34, 0.84], [0.12, 0.98], [-0.12, 0.98], [-0.34, 0.84], [-0.56, 0.68], [-0.62, 0.48],
        [-0.46, 0.34], [-0.14, 0.34]]],
      holes: [[0, 0.66, 0.12], [-0.28, 0.52, 0.09], [0.28, 0.52, 0.09]]
    },
    house: {
      parts: [[[-0.62, 0.00], [0.62, 0.00], [0.62, 0.56], [0.86, 0.56], [0.00, 1.00], [-0.86, 0.56], [-0.62, 0.56]]],
      holes: [[-0.28, 0.30, 0.13], [0.28, 0.30, 0.13]]
    },
    boat: {
      parts: [
        [[-0.92, 0.32], [-0.66, 0.04], [0.66, 0.04], [0.92, 0.32]],
        [[-0.05, 0.30], [0.05, 0.30], [0.05, 1.00], [-0.05, 1.00]],
        [[0.08, 0.34], [0.62, 0.34], [0.08, 0.94]]
      ],
      holes: [[-0.30, 0.18, 0.05], [0.30, 0.18, 0.05]]
    },
    cat: {
      parts: [
        [[-0.72, 0.00], [0.30, 0.00], [0.34, 0.30], [0.22, 0.52], [-0.10, 0.62], [-0.52, 0.52], [-0.72, 0.26]],
        [[0.02, 0.56], [0.10, 0.86], [0.26, 0.66], [0.52, 0.66], [0.66, 0.88], [0.70, 0.58], [0.62, 0.44], [0.30, 0.40]],
        [[-0.72, 0.10], [-0.96, 0.30], [-0.90, 0.56], [-0.76, 0.52], [-0.80, 0.34], [-0.62, 0.20]]
      ],
      holePart: 1,
      holes: [[0.30, 0.56, 0.05], [0.50, 0.56, 0.05]]
    },
    star: { parts: [starPoly], holes: [[0, 0.52, 0.13]] },
    moon: { parts: [moonPoly], holes: [[-0.50, 0.52, 0.08]] }
  };
  const PIDS = Object.keys(PUPPETS);

  /* how tall each cut-out really is, so the reading agrees with the screen */
  const EXT = {};
  PIDS.forEach((id) => {
    let lo = 9, hi = -9;
    PUPPETS[id].parts.forEach((pt) => pt.forEach((p) => { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }));
    EXT[id] = hi - lo;
  });

  /* ---------- the materials ---------- */
  const PMAT = {
    card: { label: 'THICK CARD', col: 0x26303c, op: 1, t: 0, cut: false, lets: 'no' },
    tracing: { label: 'TRACING PAPER', col: 0xdfe5ea, op: 0.52, t: 0.5, cut: false, lets: 'some' },
    clear: { label: 'CLEAR PLASTIC', col: 0xa9dcf5, op: 0.16, t: 0.86, cut: false, lets: 'most' },
    cutcard: { label: 'CARD WITH CUT-OUTS', col: 0x26303c, op: 1, t: 0, cut: true, lets: 'no' }
  };
  const SMAT = {
    whitecloth: { label: 'THIN WHITE CLOTH', col: 0xe9ece4, op: 1, lets: 'some', see: false, rough: 1 },
    blackcloth: { label: 'THICK BLACK CLOTH', col: 0x0a0d12, op: 1, lets: 'no', see: false, rough: 1 },
    clear: { label: 'CLEAR PLASTIC', col: 0x9ed4ef, op: 0.15, lets: 'most', see: true, rough: 0.2 },
    paper: { label: 'PAPER', col: 0xf1e8d4, op: 1, lets: 'some', see: false, rough: 0.95 }
  };

  const seesOf = (pm, sm) => {
    const P = PMAT[pm] || PMAT.card, S = SMAT[sm] || SMAT.whitecloth;
    if (S.lets === 'no') return 'nothing';
    if (S.see) return 'the puppet itself';
    if (P.lets === 'no') return 'crisp shadow';
    if (P.lets === 'some') return 'faint shadow';
    return 'nothing';
  };

  const shapeOf = (turn) => {
    const c = Math.abs(Math.cos(clamp(turn, 0, 180) * D2R));
    return c > 0.5 ? 'full' : c < 0.15 ? 'edge-on' : 'part-way';
  };

  /* ---------- the model: one pure function, no DOM, no three.js ---------- */
  function showModel(list, pm, sm) {
    return {
      sees: seesOf(pm, sm),
      shadows: (list || []).map((p) => ({
        name: p.id,
        height: Math.max(1, Math.round((EXT[p.id] || 1) * SY * magAt(p.d) * 100)),
        shape: shapeOf(p.turn)
      }))
    };
  }

  window.shadowShowModel = {
    read: showModel, puppets: PUPPETS, ids: PIDS, ext: EXT,
    puppetMaterials: PMAT, screenMaterials: SMAT, sees: seesOf, shape: shapeOf,
    mag: magAt, height: (id, d) => Math.max(1, Math.round((EXT[id] || 1) * SY * magAt(d) * 100))
  };

  class ShadowShowScene extends HTMLElement {
    static get observedAttributes() {
      return ['experiment', 'on', 'puppetmat', 'screenmat', 'puppets', 'scene', 'playing', 'view'];
    }

    constructor() {
      super();
      this.cfg = {
        experiment: 'materials', on: 'no', puppetmat: 'card', screenmat: 'whitecloth',
        puppets: 'cat:45:0:50:l', scene: '1', playing: 'no', view: 'both'
      };
      this.cam = Object.assign({}, CAM.materials);
      this.last = 0; this.lit = 0;
      this.slots = [];
      this._geo = {};
      this._pt = null; this._pn = 0;
      this._sig = '';
    }

    attributeChangedCallback(n, o, v) {
      this.cfg[n] = (v === null || v === undefined) ? this.cfg[n] : v;
      if (n === 'experiment' && !this._dragged) this.cam = Object.assign({}, CAM[this.exp()] || CAM.stage);
      if (n === 'puppets' || n === 'puppetmat') this._dirty = true;
      this.kick();
    }

    /* the loop pauses when the page is hidden, so a change made off-screen is
       caught up by hand — the theatre is never left unpainted */
    kick() {
      if (!this.r) return;
      clearTimeout(this._kt);
      this._kt = setTimeout(() => {
        if (performance.now() - (this._tick || 0) < 300) return;
        let t = Math.max(this.last * 1000, 1);
        for (let i = 0; i < 40; i++) { t += 26; this.step(t); }
      }, 70);
    }

    exp() {
      const e = this.cfg.experiment;
      return e === 'stage' || e === 'show' ? e : 'materials';
    }
    viewMode() {
      const v = this.cfg.view;
      return v === 'audience' || v === 'both' ? v : 'side';
    }
    playing() { return this.cfg.playing === 'yes' || this.cfg.playing === true; }
    sceneNo() { return clamp(Math.round(num(this.cfg.scene, 1)), 1, 3); }
    pmat() { return PMAT[this.cfg.puppetmat] ? this.cfg.puppetmat : 'card'; }
    smat() { return SMAT[this.cfg.screenmat] ? this.cfg.screenmat : 'whitecloth'; }

    parsePuppets() {
      return String(this.cfg.puppets || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3)
        .map((s) => {
          const a = s.split(':');
          return {
            id: PUPPETS[a[0]] ? a[0] : 'bird',
            d: clamp(num(a[1], 50) / 100, 0, 1),
            turn: clamp(num(a[2], 0), 0, 180),
            h: clamp(num(a[3], 50) / 100, 0, 1),
            side: a[4] === 'r' ? 'r' : 'l'
          };
        });
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
      this.camA.layers.enable(1);
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

    /* the bright pool the lamp throws on the cloth, so a backlit screen is not flat */
    hotspotTex() {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const cx = cv.getContext('2d');
      const g = cx.createRadialGradient(128, 128, 0, 128, 128, 150);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, '#e4e4e4');
      g.addColorStop(1, '#8d8d8d');
      cx.fillStyle = g; cx.fillRect(0, 0, 256, 256);
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

    /* a floating plate that names one piece of the theatre */
    pillSprite(text, h, accent, ink) {
      const T = this.THREE, cv = document.createElement('canvas');
      const W = 900, H = 144;
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
      cx.lineWidth = 5; cx.strokeStyle = accent || 'rgba(255,182,39,.85)'; cx.stroke();
      cx.fillStyle = ink || '#ffe6b0';
      cx.letterSpacing = '4px';
      cx.fillText(text, W / 2, H / 2 + 3);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'label_' + text.toLowerCase().replace(/[^a-z]+/g, '_');
      sp.renderOrder = 34;
      const hh = h || 0.040;
      sp.scale.set(hh * (pw / ph), hh, 1);
      sp.userData.pw = pw / ph;
      return sp;
    }

    setPillText(sp, text, h, accent, ink) {
      const fresh = this.pillSprite(text, h, accent, ink);
      sp.material.map.dispose();
      sp.material.map = fresh.material.map;
      sp.material.needsUpdate = true;
      sp.scale.copy(fresh.scale);
      fresh.material.dispose();
    }

    /* ---------- the theatre ---------- */
    build() {
      const T = this.THREE;
      const s = new T.Scene();
      this.bg = new T.Color(DARK_BG);
      s.background = this.bg;
      s.fog = new T.Fog(this.bg.clone(), 2.0, 5.0);
      this.s = s;

      this.mats = {
        deck: new T.MeshStandardMaterial({ name: 'stage_deck', color: 0x2b3745, roughness: 0.94 }),
        dark: new T.MeshStandardMaterial({ name: 'matte_black', color: 0x26333f, roughness: 0.9, metalness: 0.12 }),
        steel: new T.MeshStandardMaterial({ name: 'steel', color: 0xa8b6c2, roughness: 0.34, metalness: 0.8 }),
        grey: new T.MeshStandardMaterial({ name: 'lab_grey', color: 0x7d8996, roughness: 0.7, metalness: 0.08 }),
        wood: new T.MeshStandardMaterial({ name: 'stage_frame', color: 0xa2703d, roughness: 0.8 }),
        seat: new T.MeshStandardMaterial({ name: 'audience', color: 0x141b24, roughness: 1 })
      };

      /* one material per puppet card, shared by all three sticks */
      this.pmats = {};
      Object.keys(PMAT).forEach((k) => {
        const m = PMAT[k];
        this.pmats[k] = new T.MeshStandardMaterial({
          name: 'puppet_' + k, color: m.col, roughness: 0.72, metalness: 0.02,
          side: T.DoubleSide, transparent: m.op < 1, opacity: m.op
        });
      });

      this.g = new T.Group(); this.g.name = 'shadow_theatre'; s.add(this.g);

      this.buildRoom();
      this.buildLight();
      this.buildScreen();
      this.buildSlots();
      this.buildAudience();
      this.buildRigs();
      this.buildLabels();
      this.syncPuppets(true);
    }

    buildRoom() {
      const T = this.THREE, G = this.g;
      const deck = new T.Mesh(new T.PlaneGeometry(0.94, 0.62), this.mats.deck);
      deck.name = 'stage_deck';
      deck.rotation.x = -Math.PI / 2;
      deck.position.set(-0.02, 0, 0);
      deck.receiveShadow = true;
      G.add(deck);

      /* a low frame round the acting area, so the stage reads as a little theatre */
      [[-0.02, -0.305], [-0.02, 0.305]].forEach((p, i) => {
        const rail = new T.Mesh(new T.BoxGeometry(0.94, 0.018, 0.012), this.mats.wood);
        rail.name = 'stage_rail_' + i;
        rail.position.set(p[0], 0.009, p[1]);
        rail.receiveShadow = true;
        G.add(rail);
      });
      const back = new T.Mesh(new T.BoxGeometry(0.014, 0.052, 0.62), this.mats.wood);
      back.name = 'stage_back';
      back.position.set(-0.482, 0.026, 0);
      back.receiveShadow = true;
      G.add(back);

      const patch = new T.Mesh(new T.PlaneGeometry(0.98, 0.5),
        new T.MeshBasicMaterial({ name: 'stage_contact', map: this.contactTex(), transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, fog: false }));
      patch.name = 'stage_contact';
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(-0.02, 0.0012, 0);
      G.add(patch);
    }

    buildLight() {
      const T = this.THREE, M = this.mats, G = this.g;
      const lamp = new T.Group(); lamp.name = 'source_of_light';
      lamp.position.set(LIGHT_X, 0, 0);

      const foot = new T.Mesh(new T.BoxGeometry(0.062, 0.012, 0.062), M.dark);
      foot.name = 'lamp_foot'; foot.position.y = 0.006; lamp.add(foot);
      const post = new T.Mesh(new T.CylinderGeometry(0.0055, 0.0055, BEAM_Y - 0.008, 14), M.steel);
      post.name = 'lamp_post'; post.position.y = (BEAM_Y - 0.008) / 2 + 0.008; lamp.add(post);
      const body = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 0.048, 30), M.grey);
      body.name = 'lamp_body'; body.rotation.z = Math.PI / 2; body.position.set(-0.006, BEAM_Y, 0); lamp.add(body);
      const bezel = new T.Mesh(new T.TorusGeometry(0.0222, 0.0028, 8, 28), M.steel);
      bezel.name = 'lamp_bezel'; bezel.rotation.y = Math.PI / 2; bezel.position.set(0.019, BEAM_Y, 0); lamp.add(bezel);

      this.lensMat = new T.MeshStandardMaterial({ name: 'lamp_lens', color: 0x2f3138, emissive: 0xffe3a6, emissiveIntensity: 0, roughness: 0.18, toneMapped: false });
      const lens = new T.Mesh(new T.CircleGeometry(0.0206, 28), this.lensMat);
      lens.name = 'lamp_lens'; lens.rotation.y = Math.PI / 2; lens.position.set(0.0205, BEAM_Y, 0); lamp.add(lens);

      this.glowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,249,229,1)', 'rgba(255,214,130,.7)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const glow = new T.Sprite(this.glowMat);
      glow.name = 'lamp_glow'; glow.scale.set(0.10, 0.10, 1); glow.position.set(0.026, BEAM_Y, 0); glow.renderOrder = 26;
      glow.layers.set(1);
      lamp.add(glow);

      lamp.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
      G.add(lamp);

      this.beam = new T.Mesh(new T.ConeGeometry(1, 1, 30, 1, true),
        new T.MeshBasicMaterial({ name: 'light_beam', color: 0xffe2ab, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false, toneMapped: false }));
      this.beam.name = 'light_beam';
      this.beam.renderOrder = 16;
      this.beam.rotation.z = -Math.PI / 2;
      this.beam.position.set((LIGHT_X + SCREEN_X) / 2, BEAM_Y, 0);
      this.beam.scale.set(0.145, SCREEN_X - LIGHT_X, 0.145);
      this.beam.layers.set(1);
      G.add(this.beam);
    }

    buildScreen() {
      const T = this.THREE, M = this.mats, G = this.g;
      const S = SMAT.whitecloth;
      /* the screen is lit from behind, so its brightness cannot come from the
         surface facing the lamp — the cloth is drawn at an even glow and the
         real cast shadow is laid over it, which both sides of it can see */
      this.screenMat = new T.MeshBasicMaterial({
        name: 'the_screen', color: S.col, map: this.hotspotTex(),
        side: T.DoubleSide, transparent: false, opacity: 1
      });
      this.screenCol = new T.Color(S.col);
      const scr = new T.Mesh(new T.PlaneGeometry(SCR_W, SCR_H, 1, 1), this.screenMat);
      scr.name = 'the_screen';
      scr.rotation.y = -Math.PI / 2;
      scr.position.set(SCREEN_X, SCR_Y0 + SCR_H / 2, 0);
      G.add(scr);
      this.screen = scr;

      this.shadowMat = new T.ShadowMaterial({
        name: 'cast_shadow', color: 0x05070b, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false
      });
      /* one shadow skin a hair in front of the cloth and one a hair behind it, so
         the stage side and the audience side each see the cast shadow un-occluded */
      this.casts = [-0.0009, 0.0009].map((dx, i) => {
        const m = new T.Mesh(new T.PlaneGeometry(SCR_W, SCR_H, 1, 1), this.shadowMat);
        m.name = 'cast_shadow_' + (i ? 'audience' : 'stage');
        m.rotation.y = -Math.PI / 2;
        m.position.set(SCREEN_X + dx, SCR_Y0 + SCR_H / 2, 0);
        m.receiveShadow = true;
        m.renderOrder = 6;
        G.add(m);
        return m;
      });

      /* the frame the screen is stretched on */
      const fr = new T.Group(); fr.name = 'screen_frame';
      [-1, 1].forEach((sg) => {
        const postM = new T.Mesh(new T.BoxGeometry(0.014, SCR_Y0 + SCR_H + 0.020, 0.016), M.wood);
        postM.name = 'screen_post';
        postM.position.set(SCREEN_X, (SCR_Y0 + SCR_H + 0.020) / 2, sg * (SCR_W / 2 + 0.010));
        fr.add(postM);
        const ft = new T.Mesh(new T.BoxGeometry(0.070, 0.012, 0.030), M.dark);
        ft.name = 'screen_foot';
        ft.position.set(SCREEN_X, 0.006, sg * (SCR_W / 2 + 0.010));
        fr.add(ft);
      });
      [SCR_Y0 - 0.008, SCR_Y0 + SCR_H + 0.008].forEach((y, i) => {
        const rail = new T.Mesh(new T.BoxGeometry(0.012, 0.012, SCR_W + 0.020), M.wood);
        rail.name = 'screen_rail_' + i;
        rail.position.set(SCREEN_X, y, 0);
        fr.add(rail);
      });
      fr.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
      G.add(fr);
    }

    buildSlots() {
      const T = this.THREE, G = this.g;
      const stickGeo = new T.CylinderGeometry(0.0016, 0.0016, 1, 10);
      for (let i = 0; i < 3; i++) {
        const g = new T.Group(); g.name = 'puppet_slot_' + (i + 1);
        const turnG = new T.Group(); turnG.name = 'puppet_turn';
        const plate = new T.Group(); plate.name = 'puppet_card';
        plate.rotation.y = -Math.PI / 2;   /* the cut-out stands across the beam */
        turnG.add(plate);
        g.add(turnG);
        G.add(g);

        const stick = new T.Mesh(stickGeo, this.mats.dark);
        stick.name = 'puppet_stick_' + (i + 1);
        stick.castShadow = true; stick.receiveShadow = true;
        G.add(stick);

        this.slots.push({ g, turnG, plate, stick, id: '', mat: '', z: 0, d: 0.5, turn: 0, h: 0.5, live: false });
      }
    }

    buildAudience() {
      const T = this.THREE, G = this.g;
      /* a full house: two tiered rows of seated silhouettes facing the screen,
         the back row raised and offset half a seat like a little cinema */
      const head = new T.SphereGeometry(0.0095, 16, 12);
      const torso = new T.BoxGeometry(0.014, 0.030, 0.026);
      const rows = [
        { x: 0.345, y: 0 },
        { x: 0.420, y: 0.019 },
        { x: 0.495, y: 0.038 }
      ];
      const aud = new T.Group();
      aud.name = 'audience';
      const STEP = 0.062, N = 7;
      rows.forEach((row, ri) => {
        const riser = new T.Mesh(new T.BoxGeometry(0.078, Math.max(0.006, row.y + 0.008), 0.50), this.mats.deck);
        riser.name = 'audience_riser_' + (ri + 1);
        riser.position.set(row.x, (row.y + 0.008) / 2, 0);
        aud.add(riser);

        const back = new T.Mesh(new T.BoxGeometry(0.008, 0.022, 0.48), this.mats.seat);
        back.name = 'seat_backs_' + (ri + 1);
        back.position.set(row.x + 0.028, row.y + 0.019, 0);
        aud.add(back);

        const n = ri % 2 ? N - 1 : N;
        for (let i = 0; i < n; i++) {
          const z = (i - (n - 1) / 2) * STEP;
          const w = Math.sin((i + 1) * 12.9898 + ri * 3.7) * 0.5 + 0.5;   /* steady jitter */
          const p = new T.Group();
          p.name = 'audience_' + (ri + 1) + '_' + (i + 1);
          const t = new T.Mesh(torso, this.mats.seat);
          t.name = 'audience_shoulders';
          t.position.y = 0.016;
          const h = new T.Mesh(head, this.mats.seat);
          h.name = 'audience_head';
          h.position.set(-0.001, 0.041 + w * 0.004, 0);
          p.add(t, h);
          p.position.set(row.x + (w - 0.5) * 0.008, row.y + 0.008, z + (w - 0.5) * 0.008);
          p.rotation.y = (w - 0.5) * 0.5;
          aud.add(p);
        }
      });
      aud.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
      /* scenery: it belongs in the side view, never in front of the screen */
      aud.traverse((m) => m.layers.set(1));
      G.add(aud);
      this.aud = aud;
    }

    buildRigs() {
      const T = this.THREE, G = this.g;
      /* house lights: the room is readable before the show, then dims to a dark
         room as the source of light comes up */
      const hemi = new T.HemisphereLight(0x3c6180, 0x06101a, 1.45);
      hemi.name = 'room_wash';
      G.add(hemi);
      const rim = new T.DirectionalLight(0xa8cbe6, 0.72);
      rim.name = 'room_rim';
      rim.position.set(0.9, 0.8, 1.3);
      rim.target.position.set(0.1, 0.10, 0);
      G.add(rim, rim.target);
      this.wash = { hemi, rim };

      /* the source of light — the only thing in the room that casts */
      const key = new T.SpotLight(0xfff3da, 0, 1.7, 0.52, 0.26, 1.0);
      key.name = 'source_of_light_key';
      key.position.set(LIGHT_X, BEAM_Y, 0);
      key.target.position.set(SCREEN_X, BEAM_Y, 0);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.05;
      key.shadow.camera.far = 1.0;
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.0016;
      G.add(key, key.target);
      this.key = key;

      /* light that gets THROUGH a see-through puppet: same lamp, no shadow map,
         so a tracing-paper puppet leaves a grey ghost instead of a dark shadow */
      const thru = new T.SpotLight(0xfff3da, 0, 1.7, 0.52, 0.26, 1.0);
      thru.name = 'light_through_puppet';
      thru.position.set(LIGHT_X, BEAM_Y, 0);
      thru.target.position.set(SCREEN_X, BEAM_Y, 0);
      thru.castShadow = false;
      G.add(thru, thru.target);
      this.thru = thru;
    }

    buildLabels() {
      this.labLight = this.pillSprite('LIGHT', 0.038);
      this.labLight.position.set(LIGHT_X, BEAM_Y + 0.052, 0);
      this.g.add(this.labLight);

      this.labScreen = this.pillSprite('SCREEN', 0.038);
      this.labScreen.position.set(SCREEN_X, SCR_Y0 + SCR_H + 0.044, -0.12);
      this.g.add(this.labScreen);

      this.labAud = this.pillSprite('AUDIENCE', 0.032);
      this.labAud.position.set(0.42, 0.110, 0.21);
      this.g.add(this.labAud);

      this.labPMat = this.pillSprite(PMAT.card.label, 0.030, 'rgba(102,204,255,.85)', '#cdeeff');
      this.labPMat.position.set(0, BEAM_Y + 0.048, 0);
      this.g.add(this.labPMat);

      this.labSMat = this.pillSprite(SMAT.whitecloth.label, 0.030, 'rgba(102,204,255,.85)', '#cdeeff');
      this.labSMat.position.set(SCREEN_X, SCR_Y0 - 0.028, 0.11);
      this.g.add(this.labSMat);

      this.labels = [this.labLight, this.labScreen, this.labAud, this.labPMat, this.labSMat];
      /* labels, lamp flare and beam are for the side view only, so the audience
         view shows nothing but the screen */
      this.labels.forEach((sp) => sp.layers.set(1));
      this.labels = [this.labLight, this.labScreen, this.labAud];
    }

    /* ---------- puppets on sticks ---------- */
    geoParts(id, cut) {
      const key = id + (cut ? '#h' : '');
      if (this._geo[key]) return this._geo[key];
      const T = this.THREE, P = PUPPETS[id] || PUPPETS.bird, hp = P.holePart || 0;
      const arr = P.parts.map((poly, i) => {
        const sh = new T.Shape();
        poly.forEach((p, j) => {
          const x = p[0] * SX, y = (p[1] - 0.5) * SY;
          if (j) sh.lineTo(x, y); else sh.moveTo(x, y);
        });
        sh.closePath();
        if (cut && i === hp) (P.holes || []).forEach((h) => {
          const pa = new T.Path();
          pa.absarc(h[0] * SX, (h[1] - 0.5) * SY, h[2] * SY, 0, Math.PI * 2, true);
          sh.holes.push(pa);
        });
        const g = new T.ExtrudeGeometry(sh, { depth: CARD_T, bevelEnabled: false });
        g.translate(0, 0, -CARD_T / 2);
        return g;
      });
      this._geo[key] = arr;
      return arr;
    }

    syncPuppets(force) {
      if (!this.slots.length) return;
      const T = this.THREE, list = this.parsePuppets(), pm = this.pmat(), cut = PMAT[pm].cut;
      const sig = list.map((p) => p.id + p.side).join('|') + '#' + pm;
      const entering = force || (sig !== this._sig);
      this._sig = sig;
      this.slots.forEach((sl, i) => {
        const p = list[i];
        sl.live = !!p;
        sl.g.visible = !!p;
        sl.stick.visible = !!p;
        if (!p) return;
        if (force || sl.id !== p.id || sl.mat !== pm) {
          while (sl.plate.children.length) {
            const c = sl.plate.children.pop();
            sl.plate.remove(c);
          }
          this.geoParts(p.id, cut).forEach((g, k) => {
            const m = new T.Mesh(g, this.pmats[pm]);
            m.name = 'puppet_' + p.id + '_' + k;
            m.castShadow = true;
            m.receiveShadow = false;
            sl.plate.add(m);
          });
          sl.id = p.id; sl.mat = pm;
        }
        if (entering && this.playing()) sl.z = p.side === 'r' ? 0.30 : -0.30;
      });
      this._dirty = false;
    }

    targetZ(n, i) {
      if (n <= 1) return 0;
      if (n === 2) return i === 0 ? -0.058 : 0.058;
      return [-0.095, 0, 0.095][i];
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
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.02, 1.15);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', (e) => {
        const still = drag && Math.abs(e.clientX - drag.x) < 4 && Math.abs(e.clientY - drag.y) < 4;
        drag = null;
        if (still) this.tapAudience(e);
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.44, 2.4);
      }, { passive: false });
    }

    /* tapping someone in the seats asks the page for a reaction */
    tapAudience(e) {
      if (!this.aud || this.viewMode() === 'audience') return;
      const T = this.THREE, el = this.r.domElement, b = el.getBoundingClientRect();
      const rc = new T.Raycaster();
      rc.layers.enable(1);
      rc.setFromCamera(new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), this.camA);
      const hit = rc.intersectObject(this.aud, true)[0];
      if (!hit || !/^audience_\d/.test(hit.object.parent ? hit.object.parent.name : '')) return;
      window.dispatchEvent(new CustomEvent('shadowshow-audience', { detail: { seat: hit.object.parent.name } }));
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    read() {
      const live = this.slots.filter((s) => s.live).map((s) => ({ id: s.id || 'bird', d: s.d, turn: s.turn }));
      return Object.assign({ experiment: this.exp(), scene: this.sceneNo() },
        showModel(live, this.pmat(), this.smat()));
    }

    frame(ms) {
      this._tick = performance.now();
      this.step(ms);
    }

    step(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const T = this.THREE, cfg = this.cfg, playing = this.playing();

      if (this._dirty) this.syncPuppets(false);

      /* the show runs on its own clock, and tells the page which scene is up */
      if (playing) {
        if (this._pt === null) { this._pt = 0; this._pn = 0; this.emitScene(1); }
        else if (this._pn < 3) {
          this._pt += dt;
          const n = Math.min(3, Math.floor(this._pt / SCENE_SECS));
          if (n !== this._pn) {
            this._pn = n;
            if (n >= 3) window.dispatchEvent(new CustomEvent('shadowshow-end'));
            else this.emitScene(n + 1);
          }
        }
      } else { this._pt = null; this._pn = 0; }

      const on = cfg.on === 'yes' || cfg.on === true;
      this.lit = lerp(this.lit, on ? 1 : 0, 1 - Math.exp(-dt * 9));
      const L = smooth(clamp(this.lit, 0, 1));

      const P = PMAT[this.pmat()], S = SMAT[this.smat()];
      this.wash.hemi.intensity = 1.45 - 0.95 * L;
      this.wash.rim.intensity = 0.72 - 0.40 * L;
      this.key.intensity = 3.6 * L;
      this.thru.intensity = 3.6 * P.t * 0.82 * L;
      this.lensMat.emissiveIntensity = 1.5 * L;
      this.glowMat.opacity = 0.7 * L;
      this.beam.material.opacity = 0.07 * L;

      this.screenCol.setHex(S.col);
      this.screenMat.color.copy(this.screenCol).multiplyScalar(0.3 + 0.88 * L);
      this.screenMat.transparent = S.op < 1;
      this.screenMat.opacity = S.op;
      /* how dark the shadow lands: whatever light the puppet does NOT let through */
      this.shadowMat.opacity = (1 - P.t) * L * (S.see ? 0.2 : 0.9);

      /* every puppet slides to its place, turns and rises smoothly */
      const k = 1 - Math.exp(-dt * 7);
      const list = this.parsePuppets(), n = list.length;
      this.slots.forEach((sl, i) => {
        const p = list[i];
        if (!p || !sl.live) return;
        const bob = playing ? Math.sin(now * 1.7 + i * 2.1) * 0.0032 : 0;
        const sway = playing ? Math.sin(now * 1.1 + i * 1.7) * 3.5 : 0;
        sl.d = lerp(sl.d, p.d, k);
        sl.turn = lerp(sl.turn, p.turn, k);
        sl.h = lerp(sl.h, p.h, k);
        sl.z = lerp(sl.z, this.targetZ(n, i), playing ? k * 0.9 : k);
        const y = BEAM_Y + (sl.h - 0.5) * 0.020 + bob;
        sl.g.position.set(pupX(sl.d), y, sl.z);
        sl.turnG.rotation.y = (sl.turn + sway) * D2R;
        const len = Math.max(0.004, y - SY / 2 - 0.002);
        sl.stick.position.set(pupX(sl.d), len / 2, sl.z);
        sl.stick.scale.y = len;
      });

      const labOp = 1 - 0.36 * L;
      this.labels.forEach((sp) => { sp.material.opacity = playing ? 0 : labOp; });
      const showMat = this.exp() === 'materials' && !playing;
      this.labPMat.visible = showMat && this.slots[0].live;
      this.labSMat.visible = showMat;
      if (showMat) {
        if (this._pmLab !== P.label) { this.setPillText(this.labPMat, P.label, 0.030, 'rgba(102,204,255,.85)', '#cdeeff'); this._pmLab = P.label; }
        if (this._smLab !== S.label) { this.setPillText(this.labSMat, S.label, 0.030, 'rgba(102,204,255,.85)', '#cdeeff'); this._smLab = S.label; }
        this.labPMat.position.set(pupX(this.slots[0].d), BEAM_Y + 0.048, this.slots[0].z);
        this.labPMat.material.opacity = labOp;
        this.labSMat.material.opacity = labOp;
      }

      this.draw();
      window.dispatchEvent(new CustomEvent('shadowshow', { detail: this.read() }));
    }

    emitScene(n) {
      window.dispatchEvent(new CustomEvent('shadowshow-scene', { detail: { scene: n } }));
    }

    aimMain() {
      const c = this.camA, cd = this.cam;
      const aspect = (this.vw || 800) / (this.vh || 500);
      const tx = 0.045, ty = 0.125;
      const hw = 0.56, hh = 0.215;
      const tanH = Math.tan(19 * Math.PI / 180);
      const base = Math.max(hh / (tanH * 0.92), hw / (tanH * Math.max(aspect, 0.35)));
      const d = cd.dist * base;
      c.aspect = aspect;
      /* framed a little above centre, so the rail along the bottom never covers it */
      c.setViewOffset(1000, 1000, 0, 56, 1000, 1000);
      c.updateProjectionMatrix();
      c.position.set(tx + Math.sin(cd.az) * Math.cos(cd.el) * d, ty + Math.sin(cd.el) * d, Math.cos(cd.az) * Math.cos(cd.el) * d);
      c.lookAt(tx, ty, 0);
    }

    /* the audience's view: straight at the front of the screen */
    audienceCam(aspect) {
      const c = this.camS;
      const halfH = Math.max(SCR_H / 2 * 1.06, 0.06);
      const w2 = Math.max(SCR_W / 2 * 1.04, halfH * aspect);
      const hh = Math.max(halfH, w2 / Math.max(aspect, 0.2));
      c.left = -w2; c.right = w2; c.top = hh; c.bottom = -hh;
      c.position.set(SCREEN_X + 0.9, SCR_Y0 + SCR_H / 2, 0);
      c.up.set(0, 1, 0);
      c.updateProjectionMatrix();
      c.lookAt(SCREEN_X, SCR_Y0 + SCR_H / 2, 0);
      return c;
    }

    draw() {
      const r = this.r, W = this.vw || 800, H = this.vh || 500;
      const mode = this.viewMode();
      r.setScissorTest(false);
      r.setClearColor(this.bg, 1);
      r.clear(true, true, false);

      if (mode === 'audience') {
        r.setViewport(0, 0, W, H);
        r.render(this.s, this.audienceCam(W / H));
        return;
      }

      this.aimMain();
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
      r.render(this.s, this.audienceCam(iw / ih));
      r.setScissorTest(false);
    }
  }

  customElements.define('shadow-show-scene', ShadowShowScene);
})();
