/* <shadow-scene> — three.js bench for "how do shadows form?"
   Attributes: experiment (straight|materials), on (yes|no),
               slots (comma list of slot numbers 1-8 holding the matching hole cards),
               third (slot number or none), thirdheight (0-100),
               path (yes|no), material (white|fabric|clear),
               shape (card|rabbit|bird|butterfly),
               curtain (open|closed), view (apparatus|top|both)
   Dispatches on window: "shadow" {detail:{onScreen,aligned,through,shade}} every frame,
                         "shadow-aligned" once when the third hole lines up. */
(() => {
  if (window.__shadowScene) return;
  window.__shadowScene = true;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);

  const NSLOT = 8, SLOT0 = -0.285, SLOT_D = 0.072;
  const SLOT_X = (n) => SLOT0 + (n - 1) * SLOT_D;
  const LIGHT_SLOT = 2, LIGHT_X = SLOT_X(LIGHT_SLOT);
  const SCREEN_X = 0.315;
  const BEAM_Y = 0.085, HOLE_R = 0.0115;
  const CARD_W = 0.20, CARD_H = 0.19, CARD_T = 0.005;
  const CARD_Y = 0.018 + CARD_H / 2;
  const H_MIN = 0.035, H_SPAN = 0.135;
  const TOL = HOLE_R * 0.72;
  const ALIGN_H = ((BEAM_Y - H_MIN) / H_SPAN) * 100;
  const TOL_H = (TOL / H_SPAN) * 100;

  const MAT = {
    white: { through: 'no', shade: 'dark', pass: 0 },
    fabric: { through: 'some', shade: 'faint', pass: 0.34 },
    clear: { through: 'most', shade: 'none', pass: 0.9 }
  };

  /* One pure model behind both benches: where the light gets to, and what it
     leaves behind. Nothing in here touches the DOM or three.js. */
  function physics(cfg) {
    const exp = cfg.experiment === 'materials' ? 'materials' : 'straight';
    const on = cfg.on === 'yes' || cfg.on === true;

    if (exp === 'materials') {
      const m = MAT[cfg.material] ? cfg.material : null;
      const d = m ? MAT[m] : { through: '', shade: '', pass: 1 };
      return {
        experiment: exp, on, material: m, pass: d.pass,
        onScreen: !!(on && m && d.pass > 0.05),
        aligned: true,
        through: on && m ? d.through : '',
        shade: on && m ? d.shade : '',
        cards: [], passed: [], blocked: null, endX: 0, y3: 0
      };
    }

    const list = [];
    (cfg.slots || []).forEach((n) => {
      if (n >= 1 && n <= NSLOT) list.push({ slot: n, x: SLOT_X(n), y: BEAM_Y, kind: 'match' });
    });
    const th = clamp(isFinite(cfg.thirdHeight) ? +cfg.thirdHeight : 78, 0, 100);
    const y3 = H_MIN + (th / 100) * H_SPAN;
    if (cfg.third >= 1 && cfg.third <= NSLOT) list.push({ slot: cfg.third, x: SLOT_X(cfg.third), y: y3, kind: 'third' });
    list.sort((a, b) => a.x - b.x);

    const cards = list.filter((c) => c.x > LIGHT_X + 0.001);
    const passed = [];
    let blocked = null;
    for (let i = 0; i < cards.length; i++) {
      if (Math.abs(cards[i].y - BEAM_Y) > TOL) { blocked = cards[i]; break; }
      passed.push(cards[i]);
    }
    const aligned = cfg.third >= 1 ? Math.abs(y3 - BEAM_Y) <= TOL : true;
    const onScreen = on && !blocked;
    return {
      experiment: exp, on, cards, passed, blocked, aligned, onScreen,
      through: cards.length,
      shade: onScreen ? 'none' : 'dark',
      endX: blocked ? blocked.x - CARD_T / 2 : SCREEN_X - 0.002,
      y3, thirdHeight: th, material: null, pass: onScreen ? 1 : 0
    };
  }
  window.shadowPhysics = physics;
  window.shadowGeom = { SLOT_X, NSLOT, LIGHT_SLOT, ALIGN_H, TOL_H, H_MIN, H_SPAN, BEAM_Y };

  class ShadowScene extends HTMLElement {
    static get observedAttributes() {
      return ['experiment', 'on', 'slots', 'third', 'thirdheight', 'path', 'material', 'shape', 'curtain', 'view'];
    }

    constructor() {
      super();
      this.cfg = { experiment: 'straight', on: 'no', slots: '', third: 'none', thirdheight: 78, path: 'no', material: 'white', shape: 'card', curtain: 'open', view: 'apparatus' };
      this.curt = 0;
      this.cam = { az: -0.46, el: 0.30, dist: 1.05 };
      this.last = 0; this.lit = 0; this.alignedOnce = false;
      this.geoH = -1;
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'thirdheight') {
        const p = parseFloat(v);
        this.cfg.thirdheight = isFinite(p) ? clamp(p, 0, 100) : 78;
      } else this.cfg[n] = v === null || v === undefined ? this.cfg[n] : v;
      if (n === 'third' && (v === 'none' || !v)) this.alignedOnce = false;
    }

    slotList() {
      return String(this.cfg.slots || '').split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= NSLOT);
    }
    thirdSlot() {
      const n = parseInt(this.cfg.third, 10);
      return n >= 1 && n <= NSLOT ? n : 0;
    }
    exp() { return this.cfg.experiment === 'materials' ? 'materials' : 'straight'; }
    viewMode() {
      const v = this.cfg.view;
      return v === 'top' || v === 'both' ? v : 'apparatus';
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', background: '#05090f' });
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
      r.toneMappingExposure = 1.0;
      r.autoClear = false;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.r = r;

      this.build();
      this.camA = new THREE.PerspectiveCamera(38, 1, 0.01, 8);
      this.camT = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4);
      this.camT.up.set(0, 0, -1);

      this.bindPointer();
      new ResizeObserver(() => this.resize()).observe(this);
      this.resize();
      r.setAnimationLoop((ms) => this.frame(ms));
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

    weaveTex() {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, 256, 256);
      cx.fillStyle = '#fff';
      const p = 16, w = 9;
      for (let i = 0; i < 256; i += p) { cx.fillRect(i, 0, w, 256); cx.fillRect(0, i, 256, w); }
      const t = new T.CanvasTexture(cv);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(7, 5);
      return t;
    }

    /* the flat card the torch shines through: a plain rectangle, or an animal
       cut-out built from overlapping ellipses so its shadow is worth looking at */
    shapeGeom(kind) {
      const T = this.THREE;
      this._geo = this._geo || {};
      if (this._geo[kind]) return this._geo[kind];
      const P2 = Math.PI * 2;
      const shapes = [];
      const el = (cx, cy, rx, ry, rot) => {
        const s = new T.Shape();
        s.absellipse(cx, cy, rx, ry, 0, P2, false, rot || 0);
        shapes.push(s);
      };
      const tri = (a, b, c) => {
        const s = new T.Shape();
        s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.lineTo(c[0], c[1]);
        shapes.push(s);
      };
      if (kind === 'rabbit') {
        el(40, 34, 28, 21); el(26, 31, 17, 16); el(58, 44, 13, 13);
        el(72, 54, 15, 13); el(69, 78, 6.5, 19, 0.20); el(82, 74, 6.5, 18, -0.24);
        el(12, 38, 8.5, 8.5);
      } else if (kind === 'bird') {
        el(46, 42, 30, 13, 0.10); el(76, 50, 11.5, 10.5);
        tri([85, 52], [102, 46], [85, 41]);
        el(44, 60, 23, 11, 0.52); el(52, 30, 16, 8, -0.35);
        tri([19, 45], [0, 60], [2, 33]);
      } else if (kind === 'butterfly') {
        el(50, 50, 4.5, 25); el(50, 77, 5.5, 5.5);
        el(29, 64, 21, 16, 0.50); el(71, 64, 21, 16, -0.50);
        el(33, 30, 16, 13, -0.34); el(67, 30, 16, 13, 0.34);
        el(43, 90, 1.6, 11, 0.30); el(57, 90, 1.6, 11, -0.30);
      } else {
        const s = new T.Shape(), r = 5;
        s.moveTo(r, 14); s.lineTo(100 - r, 14); s.quadraticCurveTo(100, 14, 100, 14 + r);
        s.lineTo(100, 86 - r); s.quadraticCurveTo(100, 86, 100 - r, 86);
        s.lineTo(r, 86); s.quadraticCurveTo(0, 86, 0, 86 - r);
        s.lineTo(0, 14 + r); s.quadraticCurveTo(0, 14, r, 14);
        shapes.push(s);
      }
      const S = kind === 'card' ? 0.00175 : 0.0019;
      const g = new T.ExtrudeGeometry(shapes, { depth: 0.0035, bevelEnabled: false, curveSegments: 18 });
      g.scale(S, S, 1);
      g.translate(-50 * S, -50 * S, -0.00175);
      g.computeBoundingBox();
      const bb = g.boundingBox, uv = g.attributes.uv, pos = g.attributes.position;
      const sx = Math.max(1e-6, bb.max.x - bb.min.x), sy = Math.max(1e-6, bb.max.y - bb.min.y);
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getY(i) - bb.min.y) / sy);
      uv.needsUpdate = true;
      this._geo[kind] = g;
      return g;
    }

    numSprite(n) {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 96, 96);
      cx.beginPath(); cx.arc(48, 48, 34, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(7,13,21,.9)'; cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(102,204,255,.45)'; cx.stroke();
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = '#a8cbe6';
      cx.font = '900 46px Nunito, system-ui, sans-serif';
      cx.fillText(String(n), 48, 51);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.95 }));
      sp.name = 'slot_number';
      sp.scale.set(0.028, 0.028, 1);
      return sp;
    }

    labelPlate(text, color) {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = 320; cv.height = 96;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 320, 96);
      cx.beginPath();
      if (cx.roundRect) cx.roundRect(6, 20, 308, 56, 28); else cx.rect(6, 20, 308, 56);
      cx.fillStyle = 'rgba(7,13,21,.9)'; cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = color; cx.stroke();
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = color; cx.letterSpacing = '5px';
      cx.font = '900 34px Nunito, system-ui, sans-serif';
      cx.fillText(text, 163, 49);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'card_label';
      sp.renderOrder = 30;
      sp.scale.set(0.105, 0.0315, 1);
      sp.userData.redraw = (t2, c2) => {
        cx.clearRect(0, 0, 320, 96);
        cx.beginPath();
        if (cx.roundRect) cx.roundRect(6, 20, 308, 56, 28); else cx.rect(6, 20, 308, 56);
        cx.fillStyle = 'rgba(7,13,21,.9)'; cx.fill();
        cx.lineWidth = 4; cx.strokeStyle = c2; cx.stroke();
        cx.fillStyle = c2; cx.letterSpacing = '5px';
        cx.font = '900 34px Nunito, system-ui, sans-serif';
        cx.fillText(t2, 163, 49);
        tex.needsUpdate = true;
      };
      return sp;
    }

    /* ---------- geometry helpers ---------- */
    cardShape(holeY, holeR) {
      const T = this.THREE, hw = CARD_W / 2, hh = CARD_H / 2, rr = 0.009;
      const s = new T.Shape();
      s.moveTo(-hw + rr, -hh);
      s.lineTo(hw - rr, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + rr);
      s.lineTo(hw, hh - rr); s.quadraticCurveTo(hw, hh, hw - rr, hh);
      s.lineTo(-hw + rr, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - rr);
      s.lineTo(-hw, -hh + rr); s.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
      if (holeR > 0) {
        const p = new T.Path();
        p.absarc(0, holeY, holeR, 0, Math.PI * 2, true);
        s.holes.push(p);
      }
      const g = new T.ExtrudeGeometry(s, { depth: CARD_T, bevelEnabled: false, curveSegments: 22 });
      g.translate(0, 0, -CARD_T / 2);
      return g;
    }

    /* ---------- benches ---------- */
    build() {
      const T = this.THREE;
      const s = new T.Scene();
      s.background = new T.Color(0x05090f);
      s.fog = new T.Fog(0x05090f, 1.5, 3.4);
      this._bgDark = new T.Color(0x05090f);
      this._bgDay = new T.Color(0x223143);
      this.s = s;

      /* a dark room: barely any ambient, so the lamp is the only bright thing */
      s.add(new T.HemisphereLight(0x3d4a58, 0x0a1018, 0.26));
      const fill = new T.DirectionalLight(0xc6d2dc, 0.30);
      fill.position.set(-0.5, 0.8, 0.7);
      s.add(fill);

      /* daylight through the window — the bench is bright while the curtain is open */
      this.dayHemi = new T.HemisphereLight(0xcfe6fb, 0x3a4652, 0);
      s.add(this.dayHemi);
      this.dayKey = new T.DirectionalLight(0xe4f0ff, 0);
      this.dayKey.position.set(-0.25, 0.85, -1.0);
      this.dayKey.target.position.set(0, 0.06, 0);
      s.add(this.dayKey, this.dayKey.target);
      this.dayBounce = new T.DirectionalLight(0xd8e8f6, 0);
      this.dayBounce.position.set(0.4, 0.55, 1.1);
      s.add(this.dayBounce);

      /* the room lamp takes over once the curtain is drawn, at about the same level */
      this.roomHemi = new T.HemisphereLight(0x59647a, 0x141c26, 0);
      s.add(this.roomHemi);
      this.roomKey = new T.DirectionalLight(0xffeed2, 0);
      this.roomKey.position.set(-0.35, 1.0, 0.15);
      s.add(this.roomKey);
      this.roomBulb = new T.PointLight(0xffdfae, 0, 2.6, 1);
      this.roomBulb.position.set(-0.30, 0.44, -0.38);
      s.add(this.roomBulb);

      this.mats = {
        rail: new T.MeshStandardMaterial({ name: 'light_box_base', color: 0x33465a, roughness: 0.86, metalness: 0.1 }),
        groove: new T.MeshStandardMaterial({ name: 'slot_groove', color: 0x0d1520, roughness: 1 }),
        steel: new T.MeshStandardMaterial({ name: 'steel', color: 0x9dabb8, roughness: 0.34, metalness: 0.85 }),
        dark: new T.MeshStandardMaterial({ name: 'matte_black', color: 0x1e2b3a, roughness: 0.88, metalness: 0.15 }),
        cardA: new T.MeshStandardMaterial({ name: 'hole_card', color: 0xaebfcd, roughness: 0.92, side: T.DoubleSide }),
        cardC: new T.MeshStandardMaterial({ name: 'high_hole_card', color: 0xd2a962, roughness: 0.92, side: T.DoubleSide }),
        screen: new T.MeshStandardMaterial({ name: 'white_screen', color: 0xeef4f9, roughness: 1, metalness: 0 }),
        table: new T.MeshStandardMaterial({ name: 'table_top', color: 0xccd2d6, roughness: 0.96 })
      };

      this.gStraight = new T.Group(); this.gStraight.name = 'light_box_bench'; s.add(this.gStraight);
      this.gMaterials = new T.Group(); this.gMaterials.name = 'materials_bench'; s.add(this.gMaterials);

      this.buildStraight();
      this.buildMaterials();
      this.buildBeam();
      s.add(this.roomLamp());
      s.add(this.windowWall());
      this.buildLabels();
    }

    /* the wall the bench stands beside: a bright window and a pair of curtains */
    windowWall() {
      const T = this.THREE, g = new T.Group();
      g.name = 'room_wall';
      const WZ = -0.54, WX = 0.0, WY = 0.33, WW = 0.78, WH = 0.50;

      const wall = new T.Mesh(new T.PlaneGeometry(2.6, 1.5),
        new T.MeshStandardMaterial({ name: 'wall', color: 0x263442, roughness: 1, side: T.FrontSide }));
      wall.name = 'wall'; wall.position.set(0, 0.36, WZ); wall.receiveShadow = true; g.add(wall);

      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      const cx = cv.getContext('2d');
      const sky = cx.createLinearGradient(0, 0, 0, 128);
      sky.addColorStop(0, '#cfe9ff');
      sky.addColorStop(0.52, '#eaf5ff');
      sky.addColorStop(0.72, '#dfeedd');
      sky.addColorStop(1, '#b9d2ae');
      cx.fillStyle = sky; cx.fillRect(0, 0, 128, 128);
      cx.fillStyle = 'rgba(255,255,255,.85)';
      cx.beginPath(); cx.arc(38, 40, 14, 0, 6.3); cx.arc(54, 44, 11, 0, 6.3); cx.arc(24, 46, 10, 0, 6.3); cx.fill();
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      this.paneMat = new T.MeshBasicMaterial({ name: 'window_sky', map: tex, toneMapped: false });
      const pane = new T.Mesh(new T.PlaneGeometry(WW, WH), this.paneMat);
      pane.name = 'window_sky'; pane.position.set(WX, WY, WZ + 0.004); g.add(pane);

      const fm = new T.MeshStandardMaterial({ name: 'window_frame', color: 0x1a2532, roughness: 0.8 });
      const bar = (w, h, x, y) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, 0.012), fm);
        m.name = 'window_frame'; m.position.set(WX + x, WY + y, WZ + 0.012); g.add(m);
      };
      bar(WW + 0.04, 0.022, 0, WH / 2); bar(WW + 0.04, 0.022, 0, -WH / 2);
      bar(0.022, WH + 0.04, -WW / 2, 0); bar(0.022, WH + 0.04, WW / 2, 0);
      bar(0.014, WH, 0, 0); bar(WW, 0.014, 0, 0);

      const rod = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, WW + 0.30, 12),
        new T.MeshStandardMaterial({ name: 'curtain_rod', color: 0x8e9daa, roughness: 0.35, metalness: 0.8 }));
      rod.name = 'curtain_rod'; rod.rotation.z = Math.PI / 2;
      rod.position.set(WX, WY + WH / 2 + 0.05, WZ + 0.05); g.add(rod);

      const pc = document.createElement('canvas');
      pc.width = 64; pc.height = 8;
      const px = pc.getContext('2d');
      for (let i = 0; i < 64; i += 8) {
        const v = 120 + Math.round(70 * Math.sin(i / 8));
        px.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        px.fillRect(i, 0, 8, 8);
      }
      const ptex = new T.CanvasTexture(pc);
      ptex.wrapS = ptex.wrapT = T.RepeatWrapping;
      ptex.repeat.set(3, 1);
      const cmat = new T.MeshStandardMaterial({ name: 'curtain', color: 0x3f5f7d, roughness: 0.95, bumpMap: ptex, bumpScale: 0.5 });
      this.curtains = [-1, 1].map((sgn) => {
        const m = new T.Mesh(new T.BoxGeometry(WW * 0.62, WH + 0.10, 0.014), cmat);
        m.name = 'curtain'; m.castShadow = false;
        m.position.set(WX + sgn * WW * 0.42, WY - 0.01, WZ + 0.05);
        m.userData.sgn = sgn;
        g.add(m);
        return m;
      });
      this.winGeom = { WX, WY, WZ, WW, WH };
      return g;
    }

    buildLabels() {
      const L = (text, color, pos, scale) => {
        const sp = this.labelPlate(text, color);
        sp.position.set(pos[0], pos[1], pos[2]);
        if (scale) sp.scale.set(scale, scale * 0.3, 1);
        return sp;
      };
      this.lblStraight = [
        L('TORCH', '#ffb627', [LIGHT_X, 0.195, 0], 0.115),
        L('SCREEN', '#ffffff', [SCREEN_X, 0.255, 0], 0.120),
        L('SLOTS', '#9fd0f0', [SLOT_X(5), 0.058, 0.175], 0.102)
      ];
      this.lblStraight.forEach(o => this.gStraight.add(o));
      this.lblMaterials = [
        L('TORCH', '#ffb627', [-0.15, 0.40, 0.015], 0.115),
        L('TABLE', '#ffffff', [0.165, 0.058, 0.145], 0.112)
      ];
      this.lblMaterials.forEach(o => this.gMaterials.add(o));
    }

    /* a pendant hanging over the back of the bench */
    roomLamp() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'room_lamp';
      g.position.set(-0.30, 0, -0.38);
      const cord = new T.Mesh(new T.CylinderGeometry(0.0016, 0.0016, 0.26, 8), M.dark);
      cord.name = 'lamp_cord'; cord.position.y = 0.62; g.add(cord);
      const shade = new T.Mesh(new T.CylinderGeometry(0.016, 0.05, 0.048, 28, 1, true),
        new T.MeshStandardMaterial({ name: 'room_shade', color: 0x1b2836, roughness: 0.72, metalness: 0.2, side: T.DoubleSide }));
      shade.name = 'room_shade'; shade.position.y = 0.474; g.add(shade);
      this.roomDiscMat = new T.MeshBasicMaterial({ name: 'room_bulb', color: 0xffe6bc, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: T.DoubleSide });
      const disc = new T.Mesh(new T.CircleGeometry(0.048, 28), this.roomDiscMat);
      disc.name = 'room_bulb'; disc.rotation.x = Math.PI / 2; disc.position.y = 0.4505; g.add(disc);
      this.roomGlowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,242,214,1)', 'rgba(255,216,152,.6)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const gl = new T.Sprite(this.roomGlowMat);
      gl.name = 'room_glow'; gl.scale.set(0.26, 0.26, 1); gl.position.y = 0.45; gl.renderOrder = 8; g.add(gl);
      return g;
    }

    buildStraight() {
      const T = this.THREE, M = this.mats, G = this.gStraight;

      const rail = new T.Mesh(new T.BoxGeometry(0.70, 0.018, 0.25), M.rail);
      rail.name = 'light_box_base';
      rail.position.set(0.005, 0.009, 0);
      rail.receiveShadow = true; rail.castShadow = true;
      G.add(rail);

      const lip = new T.Mesh(new T.BoxGeometry(0.70, 0.012, 0.008), M.dark);
      lip.name = 'base_lip'; lip.position.set(0.005, 0.024, 0.121); G.add(lip);
      const lip2 = lip.clone(); lip2.position.z = -0.121; G.add(lip2);

      /* eight slots, each a pair of ridges with a dark groove between them */
      for (let n = 1; n <= NSLOT; n++) {
        const x = SLOT_X(n);
        for (let i = 0; i < 2; i++) {
          const rdg = new T.Mesh(new T.BoxGeometry(0.004, 0.014, 0.215), M.dark);
          rdg.name = 'slot_ridge';
          rdg.position.set(x + (i ? 0.0055 : -0.0055), 0.025, 0);
          rdg.castShadow = true;
          G.add(rdg);
        }
        const gr = new T.Mesh(new T.BoxGeometry(0.007, 0.004, 0.212), M.groove);
        gr.name = 'slot_groove'; gr.position.set(x, 0.0195, 0); G.add(gr);
        const sp = this.numSprite(n);
        sp.position.set(x, 0.030, 0.148);
        G.add(sp);
      }

      /* the lamp, standing in slot 2 */
      const lamp = new T.Group(); lamp.name = 'light_source';
      lamp.position.set(LIGHT_X, 0, 0);
      const foot = new T.Mesh(new T.BoxGeometry(0.026, 0.028, 0.07), M.dark);
      foot.name = 'lamp_foot'; foot.position.y = 0.032; foot.castShadow = true; lamp.add(foot);
      const neck = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.05, 12), M.steel);
      neck.name = 'lamp_neck'; neck.position.y = 0.062; lamp.add(neck);
      const body = new T.Mesh(new T.CylinderGeometry(0.019, 0.023, 0.044, 26), M.dark);
      body.name = 'lamp_body'; body.rotation.z = -Math.PI / 2; body.position.set(-0.006, BEAM_Y, 0); body.castShadow = true; lamp.add(body);
      const ring = new T.Mesh(new T.TorusGeometry(0.019, 0.0022, 8, 26), M.steel);
      ring.name = 'lamp_bezel'; ring.rotation.y = Math.PI / 2; ring.position.set(0.016, BEAM_Y, 0); lamp.add(ring);
      this.lensMat = new T.MeshStandardMaterial({ name: 'lamp_lens', color: 0x2a2b26, emissive: 0xffe3a6, emissiveIntensity: 0, roughness: 0.2, toneMapped: false });
      const lens = new T.Mesh(new T.CircleGeometry(0.0175, 26), this.lensMat);
      lens.name = 'lamp_lens'; lens.rotation.y = Math.PI / 2; lens.position.set(0.0162, BEAM_Y, 0); lamp.add(lens);
      this.glowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,248,225,1)', 'rgba(255,214,130,.7)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const glow = new T.Sprite(this.glowMat);
      glow.name = 'lamp_glow'; glow.scale.set(0.062, 0.062, 1); glow.position.set(0.021, BEAM_Y, 0); glow.renderOrder = 26; lamp.add(glow);
      G.add(lamp);

      this.spot = new T.SpotLight(0xfff2d6, 0, 1.4, 0.215, 0.28, 1);
      this.spot.position.set(LIGHT_X + 0.018, BEAM_Y, 0);
      this.spot.castShadow = true;
      this.spot.shadow.mapSize.set(2048, 2048);
      this.spot.shadow.camera.near = 0.02;
      this.spot.shadow.camera.far = 1.2;
      this.spot.shadow.bias = -0.0007;
      this.spot.shadow.normalBias = 0.0018;
      this.spot.target.position.set(SCREEN_X, BEAM_Y, 0);
      G.add(this.spot, this.spot.target);

      /* the white screen at the far end */
      const scr = new T.Mesh(new T.PlaneGeometry(0.26, 0.195), M.screen);
      scr.name = 'white_screen';
      scr.rotation.y = -Math.PI / 2;
      scr.position.set(SCREEN_X, 0.018 + 0.0975, 0);
      scr.receiveShadow = true;
      G.add(scr);
      const frame = new T.Mesh(new T.BoxGeometry(0.008, 0.209, 0.274), M.dark);
      frame.name = 'screen_frame'; frame.position.set(SCREEN_X + 0.006, 0.018 + 0.0975, 0); frame.castShadow = true; G.add(frame);
      const sfoot = new T.Mesh(new T.BoxGeometry(0.032, 0.016, 0.22), M.dark);
      sfoot.name = 'screen_foot'; sfoot.position.set(SCREEN_X + 0.004, 0.009, 0); G.add(sfoot);

      /* three cards, pooled */
      this.cards = ['a', 'b', 'c'].map((id) => {
        const hy = id === 'c' ? H_MIN + 0.78 * H_SPAN - CARD_Y : BEAM_Y - CARD_Y;
        const m = new T.Mesh(this.cardShape(hy, HOLE_R), id === 'c' ? M.cardC : M.cardA);
        m.name = id === 'c' ? 'high_hole_card' : 'hole_card';
        m.rotation.y = Math.PI / 2;
        m.castShadow = true; m.receiveShadow = true;
        m.visible = false;
        m.userData = { id, a: 0 };
        G.add(m);
        return m;
      });

      /* amber markers that ride on the dashed path */
      this.rings = [];
      for (let i = 0; i < 4; i++) {
        const mat = new T.MeshBasicMaterial({ name: 'path_ring', color: 0xffb627, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
        const m = new T.Mesh(new T.TorusGeometry(HOLE_R + 0.0022, 0.0011, 8, 30), mat);
        m.name = 'path_ring'; m.rotation.y = Math.PI / 2; m.renderOrder = 28; m.visible = false;
        G.add(m);
        this.rings.push(m);
      }
      this.blockMat = new T.MeshBasicMaterial({ name: 'blocked_marker', color: 0xff6a5e, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
      this.blockRing = new T.Mesh(new T.TorusGeometry(0.0108, 0.0016, 8, 30), this.blockMat);
      this.blockRing.name = 'blocked_marker'; this.blockRing.rotation.y = Math.PI / 2; this.blockRing.renderOrder = 29; this.blockRing.visible = false;
      G.add(this.blockRing);

      const dg = new T.BufferGeometry();
      dg.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
      this.dashMat = new T.LineDashedMaterial({ name: 'straight_path', color: 0xffb627, dashSize: 0.013, gapSize: 0.0095, transparent: true, opacity: 0, depthTest: false, fog: false, toneMapped: false });
      this.dash = new T.Line(dg, this.dashMat);
      this.dash.name = 'straight_path'; this.dash.renderOrder = 27; this.dash.visible = false;
      G.add(this.dash);

      this.spotMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,252,240,1)', 'rgba(255,230,170,.8)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      this.spotDecal = new T.Sprite(this.spotMat);
      this.spotDecal.name = 'bright_spot'; this.spotDecal.renderOrder = 25; this.spotDecal.scale.set(0.05, 0.05, 1);
      G.add(this.spotDecal);
    }

    buildMaterials() {
      const T = this.THREE, M = this.mats, G = this.gMaterials;
      G.visible = false;

      const table = new T.Mesh(new T.BoxGeometry(0.46, 0.016, 0.36), M.table);
      table.name = 'table_top'; table.position.y = 0.008; table.receiveShadow = true; G.add(table);
      const edge = new T.Mesh(new T.BoxGeometry(0.472, 0.008, 0.372), M.dark);
      edge.name = 'table_edge'; edge.position.y = -0.002; G.add(edge);

      /* the torch, above and pointing down */
      const torch = new T.Group(); torch.name = 'torch';
      torch.position.set(0, 0.40, 0.015);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.021, 0.026, 0.085, 26), M.dark);
      barrel.name = 'torch_body'; barrel.position.y = 0.042; barrel.castShadow = true; torch.add(barrel);
      const headM = new T.Mesh(new T.CylinderGeometry(0.030, 0.021, 0.03, 26), M.steel);
      headM.name = 'torch_head'; headM.position.y = -0.014; torch.add(headM);
      this.torchLensMat = new T.MeshStandardMaterial({ name: 'torch_lens', color: 0x26272a, emissive: 0xffeec4, emissiveIntensity: 0, roughness: 0.2, toneMapped: false });
      const tl = new T.Mesh(new T.CircleGeometry(0.028, 26), this.torchLensMat);
      tl.name = 'torch_lens'; tl.rotation.x = Math.PI / 2; tl.position.y = -0.029; torch.add(tl);
      this.torchGlowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,248,225,1)', 'rgba(255,214,130,.7)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      const tg = new T.Sprite(this.torchGlowMat);
      tg.name = 'torch_glow'; tg.scale.set(0.09, 0.09, 1); tg.position.y = -0.036; tg.renderOrder = 26; torch.add(tg);
      G.add(torch);

      const hang = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.14, 12), M.steel);
      hang.name = 'torch_arm'; hang.rotation.z = Math.PI / 2; hang.position.set(-0.075, 0.442, 0.015); G.add(hang);

      this.torchLight = new T.SpotLight(0xfff3dc, 0, 1.2, 0.48, 0.30, 1);
      this.torchLight.position.set(0, 0.372, 0.015);
      this.torchLight.castShadow = true;
      this.torchLight.shadow.mapSize.set(2048, 2048);
      this.torchLight.shadow.camera.near = 0.02;
      this.torchLight.shadow.camera.far = 0.9;
      this.torchLight.shadow.bias = -0.0006;
      this.torchLight.shadow.normalBias = 0.0016;
      this.torchLight.target.position.set(0, 0, 0.015);
      G.add(this.torchLight, this.torchLight.target);

      /* the stand that holds a card flat between torch and table */
      const st = new T.Group(); st.name = 'card_stand'; st.position.set(-0.175, 0, 0.02);
      const base = new T.Mesh(new T.BoxGeometry(0.075, 0.014, 0.10), M.dark);
      base.name = 'stand_base'; base.position.y = 0.023; base.castShadow = true; st.add(base);
      const rod = new T.Mesh(new T.CylinderGeometry(0.0055, 0.0055, 0.20, 14), M.steel);
      rod.name = 'stand_rod'; rod.position.y = 0.12; rod.castShadow = true; st.add(rod);
      const arm = new T.Mesh(new T.BoxGeometry(0.075, 0.008, 0.012), M.dark);
      arm.name = 'stand_arm'; arm.position.set(0.038, 0.163, 0); arm.castShadow = true; st.add(arm);
      G.add(st);

      const CW = 0.175, CD = 0.135, CT = 0.0035, CY = 0.165;
      const flatGeo = this.shapeGeom('card');
      this.mWhite = new T.Mesh(flatGeo, new T.MeshStandardMaterial({ name: 'card_white', color: 0xeef2f6, roughness: 0.95 }));
      this.mWhite.name = 'card_white'; this.mWhite.castShadow = true;

      this.mFabric = new T.Mesh(flatGeo, new T.MeshStandardMaterial({
        name: 'card_fabric', color: 0xa8b8c6, roughness: 0.98,
        alphaMap: this.weaveTex(), alphaTest: 0.5, side: T.DoubleSide
      }));
      this.mFabric.name = 'card_fabric'; this.mFabric.castShadow = true;

      this.mClear = new T.Mesh(flatGeo, new T.MeshStandardMaterial({
        name: 'card_clear', color: 0xc8e8ff, roughness: 0.05, metalness: 0,
        transparent: true, opacity: 0.17, side: T.DoubleSide, depthWrite: false
      }));
      this.mClear.name = 'card_clear'; this.mClear.castShadow = false;

      /* only the rim of the clear sheet stops any light — a faint outline */
      const rs = new T.Shape();
      rs.moveTo(-CW / 2, -CD / 2); rs.lineTo(CW / 2, -CD / 2); rs.lineTo(CW / 2, CD / 2); rs.lineTo(-CW / 2, CD / 2); rs.lineTo(-CW / 2, -CD / 2);
      const rh = new T.Path();
      rh.moveTo(-CW / 2 + 0.004, -CD / 2 + 0.004); rh.lineTo(CW / 2 - 0.004, -CD / 2 + 0.004);
      rh.lineTo(CW / 2 - 0.004, CD / 2 - 0.004); rh.lineTo(-CW / 2 + 0.004, CD / 2 - 0.004); rh.lineTo(-CW / 2 + 0.004, -CD / 2 + 0.004);
      rs.holes.push(rh);
      this.clearRim = new T.Mesh(new T.ExtrudeGeometry(rs, { depth: 0.003, bevelEnabled: false }),
        new T.MeshStandardMaterial({ name: 'clear_rim', color: 0xa9d4ef, roughness: 0.3, transparent: true, opacity: 0.7 }));
      this.clearRim.name = 'clear_rim'; this.clearRim.rotation.x = -Math.PI / 2; this.clearRim.castShadow = true;

      [this.mWhite, this.mFabric, this.mClear].forEach((m) => { m.position.set(0, CY, 0.015); m.rotation.x = -Math.PI / 2; G.add(m); });
      this.clearRim.position.set(0, CY, 0.015); G.add(this.clearRim);
      this.cardY = CY;

      this.matLabel = this.labelPlate('WHITE', '#d6dee6');
      this.matLabel.position.set(0, CY + 0.05, 0.015);
      G.add(this.matLabel);

      const clipA = new T.Mesh(new T.BoxGeometry(0.022, 0.012, 0.018), M.steel);
      clipA.name = 'card_clip'; clipA.position.set(-0.086, CY, 0.02); G.add(clipA);

      /* two soft cones: torch to card, then card to table */
      const coneGeo = new T.ConeGeometry(1, 1, 30, 1, true);
      const mk = (op) => new T.MeshBasicMaterial({ name: 'torch_beam', color: 0xffe6b4, transparent: true, opacity: op, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending, fog: false, toneMapped: false });
      this.coneTop = new T.Mesh(coneGeo, mk(0));
      this.coneTop.name = 'torch_beam_upper';
      this.coneTop.position.set(0, (0.372 + CY) / 2, 0.015);
      this.coneTop.scale.set(0.075, 0.372 - CY, 0.075);
      G.add(this.coneTop);
      this.coneBot = new T.Mesh(coneGeo, mk(0));
      this.coneBot.name = 'torch_beam_lower';
      this.coneBot.position.set(0, (CY + 0.016) / 2, 0.015);
      this.coneBot.scale.set(0.098, CY - 0.016, 0.098);
      G.add(this.coneBot);

      this.tablePatchMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,250,232,.9)', 'rgba(255,226,160,.45)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
      this.tablePatch = new T.Sprite(this.tablePatchMat);
      this.tablePatch.name = 'light_through'; this.tablePatch.scale.set(0.26, 0.26, 1);
      this.tablePatch.position.set(0, 0.018, 0.015);
      this.tablePatch.renderOrder = 18;
      G.add(this.tablePatch);
    }

    buildBeam() {
      const T = this.THREE, G = this.gStraight;
      const mk = (op, col) => new T.MeshBasicMaterial({ name: 'beam', color: col, transparent: true, opacity: op, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending, fog: false, toneMapped: false });
      this.beamCone = new T.Mesh(new T.ConeGeometry(1, 1, 30, 1, true), mk(0, 0xffe2ab));
      this.beamCone.name = 'beam_cone'; this.beamCone.rotation.z = Math.PI / 2; this.beamCone.renderOrder = 16;
      G.add(this.beamCone);
      this.pencils = [];
      for (let i = 0; i < 3; i++) {
        const m = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 22, 1, true), mk(0, 0xffeec8));
        m.name = 'beam_pencil'; m.rotation.z = Math.PI / 2; m.renderOrder = 17; m.visible = false;
        G.add(m);
        this.pencils.push(m);
      }
      this.coreMat = new T.MeshBasicMaterial({ name: 'beam_ray', color: 0xfffbee, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false });
      this.core = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 14), this.coreMat);
      this.core.name = 'beam_ray'; this.core.rotation.z = Math.PI / 2; this.core.renderOrder = 19;
      G.add(this.core);
    }

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
      el.addEventListener('pointerup', () => { drag = null; });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.36, 2.4);
      }, { passive: false });
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    setSeg(mesh, x0, x1, r0, r1) {
      const len = Math.max(0.0005, x1 - x0);
      mesh.position.set(x0 + len / 2, BEAM_Y, 0);
      mesh.scale.set(r1 === undefined ? r0 : r1, len, r1 === undefined ? r0 : r1);
      return len;
    }

    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const T = this.THREE, cfg = this.cfg, exp = this.exp();
      const ph = physics({
        experiment: exp, on: cfg.on, slots: this.slotList(), third: this.thirdSlot(),
        thirdHeight: cfg.thirdheight, material: cfg.material
      });

      this.lit = lerp(this.lit, ph.on ? 1 : 0, 1 - Math.exp(-dt * 9));
      const L = smooth(clamp(this.lit, 0, 1));

      /* curtain: open lets the daylight in, closed hands over to the room lamp */
      const want = cfg.curtain === 'closed' ? 1 : 0;
      this.curt = lerp(this.curt, want, 1 - Math.exp(-dt * 3.2));
      const C = smooth(clamp(this.curt, 0, 1)), D = 1 - C;
      const W = this.winGeom;
      this.curtains.forEach((m) => {
        const sgn = m.userData.sgn;
        m.position.x = W.WX + sgn * lerp(W.WW * 0.44, W.WW * 0.16, C);
        m.scale.x = lerp(0.55, 1.16, C);
      });
      this.dayHemi.intensity = 1.05 * D;
      this.dayKey.intensity = 1.30 * D;
      this.dayBounce.intensity = 0.55 * D;
      this.s.background.copy(this._bgDark).lerp(this._bgDay, D);
      this.s.fog.color.copy(this.s.background);
      this.paneMat.color.setScalar(lerp(0.14, 1, D));
      this.roomHemi.intensity = 0.74 * C;
      this.roomKey.intensity = 0.42 * C;
      this.roomBulb.intensity = 0.68 * C;
      this.roomDiscMat.opacity = 0.95 * C;
      this.roomGlowMat.opacity = 0.45 * C;

      const lop = 0.98 - 0.34 * L;
      this.lblStraight.forEach(o => { o.material.opacity = lop; });
      this.lblMaterials.forEach(o => { o.material.opacity = lop; });

      this.gStraight.visible = exp === 'straight';
      this.gMaterials.visible = exp === 'materials';

      if (exp === 'straight') this.frameStraight(ph, L, now, dt);
      else this.frameMaterials(ph, L, now, dt);

      this.draw(exp);

      if (ph.experiment === 'straight' && this.thirdSlot() && ph.aligned && !this.alignedOnce) {
        this.alignedOnce = true;
        window.dispatchEvent(new CustomEvent('shadow-aligned', { detail: { slot: this.thirdSlot(), height: ph.thirdHeight } }));
      }
      if (ph.experiment === 'straight' && this.thirdSlot() && !ph.aligned) this.alignedOnce = false;

      window.dispatchEvent(new CustomEvent('shadow', {
        detail: { onScreen: ph.onScreen, aligned: ph.aligned, through: ph.through, shade: ph.shade }
      }));
    }

    frameStraight(ph, L, now, dt) {
      const T = this.THREE;
      this.spot.intensity = 1.7 * L;
      this.lensMat.emissiveIntensity = 1.3 * L;
      this.glowMat.opacity = 0.7 * L;
      this.torchLight.intensity = 0;

      /* cards slide down into their slots */
      const placed = {};
      this.slotList().forEach((n, i) => { placed[i === 0 ? 'a' : 'b'] = n; });
      const t3 = this.thirdSlot();
      if (t3) placed.c = t3;
      this.cards.forEach((m) => {
        const n = placed[m.userData.id];
        const want = n ? 1 : 0;
        m.userData.a = lerp(m.userData.a, want, 1 - Math.exp(-dt * 10));
        const a = smooth(clamp(m.userData.a, 0, 1));
        m.visible = a > 0.012;
        if (n) m.position.set(SLOT_X(n), CARD_Y + (1 - a) * 0.08, 0);
        m.scale.set(1, 1, a * 0.9 + 0.1);
      });

      /* the third card's hole is on a slider, so its geometry follows */
      const hq = Math.round(ph.thirdHeight * 2) / 2;
      if (hq !== this.geoH) {
        this.geoH = hq;
        const old = this.cards[2].geometry;
        this.cards[2].geometry = this.cardShape(H_MIN + (hq / 100) * H_SPAN - CARD_Y, HOLE_R);
        old.dispose();
      }

      const startX = LIGHT_X + 0.018;
      const endX = ph.endX;
      const passed = ph.passed;
      const firstX = passed.length ? passed[0].x : endX;

      const coneLen = Math.max(0.001, firstX - startX);
      const rBase = Math.min(0.03, 0.005 + coneLen * 0.10);
      this.setSeg(this.beamCone, startX, firstX, rBase);
      this.beamCone.material.opacity = 0.11 * L;
      this.beamCone.visible = L > 0.02;

      for (let i = 0; i < this.pencils.length; i++) {
        const m = this.pencils[i];
        if (i >= passed.length) { m.visible = false; continue; }
        const a = passed[i].x, b = i + 1 < passed.length ? passed[i + 1].x : endX;
        if (b - a < 0.002) { m.visible = false; continue; }
        this.setSeg(m, a, b, HOLE_R * 0.78);
        m.material.opacity = 0.17 * L;
        m.visible = L > 0.02;
      }

      this.setSeg(this.core, startX, endX, 0.0009);
      this.coreMat.opacity = 0.62 * L;
      this.core.visible = L > 0.02 && endX > startX + 0.002;

      /* bright spot: on the screen, or on the card that stopped it */
      const spotX = ph.blocked ? ph.blocked.x - CARD_T / 2 - 0.0015 : SCREEN_X - 0.0022;
      const sz = ph.blocked ? 0.042 : 0.058;
      this.spotDecal.position.set(spotX, BEAM_Y, 0);
      this.spotDecal.scale.set(sz, sz, 1);
      this.spotMat.opacity = L * (0.85 + 0.1 * Math.sin(now * 5));
      this.spotDecal.visible = L > 0.02;

      /* show the path */
      const showPath = this.cfg.path === 'yes';
      const pa = this.dashMat.opacity;
      this.dashMat.opacity = lerp(pa, showPath ? 0.95 : 0, 1 - Math.exp(-dt * 8));
      this.dash.visible = this.dashMat.opacity > 0.02;
      if (this.dash.visible) {
        const p = this.dash.geometry.attributes.position;
        p.setXYZ(0, LIGHT_X + 0.016, BEAM_Y, 0);
        p.setXYZ(1, ph.blocked ? ph.blocked.x : SCREEN_X - 0.002, BEAM_Y, 0);
        p.needsUpdate = true;
        this.dash.geometry.computeBoundingSphere();
        this.dash.computeLineDistances();
      }
      this.rings.forEach((m, i) => {
        const c = passed[i];
        m.visible = !!c && this.dash.visible;
        if (m.visible) { m.position.set(c.x, BEAM_Y, 0); m.material.opacity = this.dashMat.opacity * 0.9; }
      });
      this.blockRing.visible = !!ph.blocked && this.dash.visible;
      if (this.blockRing.visible) {
        this.blockRing.position.set(ph.blocked.x - CARD_T, BEAM_Y, 0);
        this.blockMat.opacity = this.dashMat.opacity * (0.6 + 0.35 * Math.sin(now * 4.5));
      }
    }

    frameMaterials(ph, L, now, dt) {
      this.spot.intensity = 0;
      this.torchLight.intensity = 1.0 * L;
      this.torchLensMat.emissiveIntensity = 1.3 * L;
      this.torchGlowMat.opacity = 0.65 * L;

      const m = ph.material;
      const shp = ['rabbit', 'bird', 'butterfly'].indexOf(this.cfg.shape) >= 0 ? this.cfg.shape : 'card';
      if (this._shape !== shp) {
        this._shape = shp;
        const g = this.shapeGeom(shp);
        this.mWhite.geometry = this.mFabric.geometry = this.mClear.geometry = g;
        this._pop = 0;
      }
      this._pop = lerp(this._pop === undefined ? 1 : this._pop, 1, 1 - Math.exp(-dt * 7));
      const pop = 0.86 + 0.14 * smooth(clamp(this._pop, 0, 1));
      this.mWhite.visible = m === 'white';
      this.mFabric.visible = m === 'fabric';
      this.mClear.visible = m === 'clear';
      [this.mWhite, this.mFabric, this.mClear].forEach(o => o.scale.set(pop, pop, 1));
      this.clearRim.visible = m === 'clear' && shp === 'card';
      this.matLabel.visible = !!m;
      if (m && this._m !== m) {
        this._m = m;
        const c = m === 'white' ? '#eef2f6' : m === 'fabric' ? '#ffb627' : '#66ccff';
        this.matLabel.userData.redraw(m.toUpperCase(), c);
      }

      this.coneTop.material.opacity = 0.10 * L;
      this.coneBot.material.opacity = 0.10 * L * (m ? ph.pass : 1);
      this.tablePatchMat.opacity = L * (m ? ph.pass * 0.35 : 0.28);
    }

    /* camera work: free orbit, a locked plan view, or both at once */
    aimMain(exp) {
      const c = this.camA, cd = this.cam;
      const ty = exp === 'materials' ? 0.17 : 0.09;
      const tx = exp === 'materials' ? 0 : 0.01;
      const aspect = (this.vw || 800) / (this.vh || 500);
      const fit = aspect < 1.5 ? clamp(1.5 / Math.max(aspect, 0.4), 1, 1.8) : 1;
      const d = cd.dist * fit * (exp === 'materials' ? 0.92 : 1);
      c.aspect = aspect;
      /* the card rail and the chooser live along the bottom edge, so the bench
         is framed a little above centre */
      c.setViewOffset(1000, 1000, 0, exp === 'materials' ? 40 : 52, 1000, 1000);
      c.updateProjectionMatrix();
      c.position.set(tx + Math.sin(cd.az) * Math.cos(cd.el) * d, ty + Math.sin(cd.el) * d, Math.cos(cd.az) * Math.cos(cd.el) * d);
      c.lookAt(tx, ty, 0);
    }

    /* the second view: a plan view of the light box, or a high look-down on the
       table where the card and its shadow can both be seen */
    topCam(exp, aspect) {
      const T = this.THREE;
      if (exp === 'materials') {
        const c = this.camM || (this.camM = new T.PerspectiveCamera(34, 1, 0.01, 8));
        const d = 0.78, el = 0.78;
        c.aspect = aspect;
        c.setViewOffset(1000, 1000, 0, 30, 1000, 1000);
        c.updateProjectionMatrix();
        c.position.set(0, 0.11 + Math.sin(el) * d, Math.cos(el) * d);
        c.lookAt(0, 0.08, 0);
        return c;
      }
      const c = this.camT;
      const halfW = 0.40;
      const halfH = Math.max(halfW / Math.max(aspect, 0.2), 0.15);
      const w2 = Math.max(halfW, halfH * aspect);
      const shift = halfH * 0.14;
      c.left = -w2; c.right = w2; c.top = halfH - shift; c.bottom = -halfH - shift;
      c.position.set(0.01, 1.0, 0);
      c.updateProjectionMatrix();
      c.lookAt(0.01, 0.02, 0);
      return c;
    }

    draw(exp) {
      const r = this.r, W = this.vw || 800, H = this.vh || 500;
      const mode = this.viewMode();
      r.setScissorTest(false);
      r.setClearColor(0x05090f, 1);
      r.clear(true, true, false);

      if (mode === 'top') {
        r.setViewport(0, 0, W, H);
        r.render(this.s, this.topCam(exp, W / H));
        return;
      }

      this.aimMain(exp);
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
      r.setClearColor(0x05090f, 1);
      r.clear(true, true, false);
      r.render(this.s, this.topCam(exp, iw / ih));
      r.setScissorTest(false);
    }
  }

  customElements.define('shadow-scene', ShadowScene);
})();
