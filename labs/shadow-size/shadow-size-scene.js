/* <shadow-size-scene> — three.js bench for "what decides the size of a shadow?"
   Attributes: experiment (source|screen), on (yes|no), curtain (open|closed),
               light (slot 1-8), object (slot 1-8), screen (slot 1-10),
               rays (yes|no), objectcm (height of the object in cm),
               view (apparatus|top|both)
   Dispatches on window: "shadowsize" {detail: model readings} every frame.
   The only words in this file are the slot numbers, the ruler's centimetre
   marks, and the four apparatus labels. */
(() => {
  if (window.__shadowSizeScene) return;
  window.__shadowSizeScene = true;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);

  const NSLOT = 8, SLOT0 = -0.285, SLOT_D = 0.072;
  const SLOT_X = (n) => SLOT0 + (n - 1) * SLOT_D;
  const CM_PER_SLOT = 6;                 /* one slot along the bench is 6 cm */
  const CM = SLOT_D / CM_PER_SLOT;       /* world units per centimetre */
  const DECK_Y = 0.020;                  /* top of the light box */
  const PLINTH_H = 0.030;                /* the object's wooden base */
  const BASE_Y = DECK_Y + PLINTH_H;      /* the plane the torch and the object stand on */
  const END_SLOT = 10;                   /* the screen board at the end of the bench */
  const RULER_MAX = 25;
  const FIG_UNIT = 0.0718;               /* built height of the figure, before scaling */

  /* the room */
  const FLOOR_Y = -0.42, WALL_Z = -0.78;
  const WIN_C = -0.86, WIN_W = 0.78, WIN_B = 0.10, WIN_T = 0.74;
  const WIN_L = WIN_C - WIN_W / 2, WIN_R = WIN_C + WIN_W / 2;
  const ROD_Y = 0.815, CURT_B = 0.035;
  const TABLE_Y0 = -0.032;

  /* One pure model behind both benches: similar triangles from the source of
     light, past the object, on to the screen. Nothing here touches the DOM. */
  function model(lightSlot, objectSlot, screenSlot, objectCm) {
    const oc = isFinite(objectCm) && objectCm > 0 ? +objectCm : 6;
    const sLO = Math.max(0, objectSlot - lightSlot);
    const sOS = Math.max(0, screenSlot - objectSlot);
    const dLightObject = sLO * CM_PER_SLOT;
    const dObjectScreen = sOS * CM_PER_SLOT;
    const dLightScreen = dLightObject + dObjectScreen;
    const mag = dLightObject > 0 ? dLightScreen / dLightObject : 1;
    return {
      shadow: oc * mag, mag, objectCm: oc,
      dLightObject, dObjectScreen, dLightScreen,
      slotsLightObject: sLO, slotsObjectScreen: sOS,
      lightSlot, objectSlot, screenSlot
    };
  }
  window.shadowSizeModel = model;
  window.shadowSizeGeom = { SLOT_X, NSLOT, CM_PER_SLOT, CM, END_SLOT, RULER_MAX, DECK_Y, BASE_Y };

  class ShadowSizeScene extends HTMLElement {
    static get observedAttributes() {
      return ['experiment', 'on', 'curtain', 'light', 'object', 'screen', 'rays', 'objectcm', 'view'];
    }

    constructor() {
      super();
      this.cfg = { experiment: 'source', on: 'no', curtain: 'open', light: 1, object: 8, screen: END_SLOT, rays: 'no', objectcm: 6, view: 'apparatus' };
      this.cam = { az: -0.38, el: 0.20, dist: 1.28 };
      this.last = 0; this.lit = 0; this.day = 1; this.curt = 0;
      this.pLight = SLOT_X(1); this.pObject = SLOT_X(8); this.pScreen = SLOT_X(END_SLOT);
      this.rayA = 0;
    }

    attributeChangedCallback(n, o, v) {
      if (v === null || v === undefined) return;
      if (n === 'light' || n === 'object' || n === 'screen' || n === 'objectcm') {
        const p = parseFloat(v);
        if (isFinite(p)) this.cfg[n] = p;
      } else this.cfg[n] = v;
    }

    slot(k, lo, hi, dflt) {
      const n = Math.round(this.cfg[k]);
      return isFinite(n) ? clamp(n, lo, hi) : dflt;
    }
    lightSlot() { return this.slot('light', 1, NSLOT, 1); }
    objectSlot() { return this.slot('object', 1, NSLOT, 8); }
    screenSlot() { return this.slot('screen', 2, END_SLOT, END_SLOT); }
    objectCm() { return clamp(this.cfg.objectcm || 6, 1, 14); }
    viewMode() {
      const v = this.cfg.view;
      return v === 'top' || v === 'both' ? v : 'apparatus';
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', background: '#b9c8d6' });
      this.boot();
    }

    async boot() {
      const THREE = await import('https://unpkg.com/three@0.184.0/build/three.module.js');
      this.THREE = THREE;
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.autoClear = false;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.r = r;

      this.build();
      this.camA = new THREE.PerspectiveCamera(38, 1, 0.02, 30);

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

    skyTex() {
      const T = this.THREE, W = 512, H = 512;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#5ea8e4');
      g.addColorStop(0.55, '#9fd0f0');
      g.addColorStop(1, '#e2f1fb');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      const puff = (x, y, r, a) => {
        const rg = cx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        rg.addColorStop(0.6, 'rgba(255,255,255,' + a * 0.55 + ')');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = rg;
        cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
      };
      [[150, 150, 1], [215, 132, 0.9], [95, 168, 0.78], [372, 262, 0.92], [430, 246, 0.8], [325, 280, 0.7]]
        .forEach(([x, y, s]) => puff(x, y, 72 * s, 0.95));
      /* a hint of green ground at the very bottom of the view */
      const gg = cx.createLinearGradient(0, H * 0.86, 0, H);
      gg.addColorStop(0, 'rgba(150,190,140,0)');
      gg.addColorStop(1, 'rgba(122,168,112,.95)');
      cx.fillStyle = gg; cx.fillRect(0, H * 0.84, W, H * 0.16);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    numSprite(n) {
      const T = this.THREE, cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 96, 96);
      cx.beginPath(); cx.arc(48, 48, 34, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(16,26,38,.92)'; cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(230,240,250,.55)'; cx.stroke();
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = '#dfeaf4';
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
      cx.fillStyle = 'rgba(10,19,32,.94)'; cx.fill();
      cx.lineWidth = 5; cx.strokeStyle = color; cx.stroke();
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = color; cx.letterSpacing = '5px';
      cx.font = '900 34px Nunito, system-ui, sans-serif';
      cx.fillText(text, 163, 49);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'apparatus_label';
      sp.renderOrder = 30;
      sp.scale.set(0.118, 0.035, 1);
      return sp;
    }

    /* the centimetre scale down the near edge of the screen */
    rulerTex() {
      const T = this.THREE, W = 96, H = 1200;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#1d2a38'; cx.fillRect(0, 0, W, H);
      cx.fillStyle = 'rgba(255,255,255,.14)'; cx.fillRect(W - 3, 0, 3, H);
      for (let c = 0; c <= RULER_MAX; c++) {
        const y = H - (c / RULER_MAX) * H;
        const big = c % 5 === 0;
        cx.fillStyle = big ? '#ffffff' : 'rgba(255,255,255,.55)';
        cx.fillRect(0, clamp(y - 2, 0, H - 4), big ? W * 0.60 : W * 0.30, big ? 4 : 3);
        if (big && c > 0) {
          cx.fillStyle = '#e4eef7';
          cx.font = '900 40px Nunito, system-ui, sans-serif';
          cx.textAlign = 'right'; cx.textBaseline = 'middle';
          cx.fillText(String(c), W - 7, clamp(y + 25, 22, H - 22));
        }
      }
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }

    /* ---------- the room and the bench ---------- */
    build() {
      const T = this.THREE;
      const s = new T.Scene();
      this.bgDay = new T.Color(0xb9c8d6);
      this.bgLamp = new T.Color(0xc2ab8e);
      s.background = this.bgDay.clone();
      /* fog sits far beyond the furthest the camera can pull back, so it never
         eats the brightness of the room */
      s.fog = new T.Fog(this.bgDay.clone(), 5.2, 13);
      this.s = s;

      this.mats = {
        rail: new T.MeshStandardMaterial({ name: 'light_box_base', color: 0x7c8894, roughness: 0.82, metalness: 0.08 }),
        groove: new T.MeshStandardMaterial({ name: 'slot_groove', color: 0x46525e, roughness: 1 }),
        steel: new T.MeshStandardMaterial({ name: 'steel', color: 0xb9c4ce, roughness: 0.32, metalness: 0.8 }),
        dark: new T.MeshStandardMaterial({ name: 'lab_grey', color: 0x5b6874, roughness: 0.85, metalness: 0.12 }),
        wood: new T.MeshStandardMaterial({ name: 'wooden_base', color: 0xc08a4a, roughness: 0.8, metalness: 0.02 }),
        figure: new T.MeshStandardMaterial({ name: 'object_body', color: 0x8a97a3, roughness: 0.7, metalness: 0.05 }),
        screen: new T.MeshStandardMaterial({ name: 'white_screen', color: 0xf2f6fa, roughness: 1, metalness: 0 }),
        wall: new T.MeshStandardMaterial({ name: 'wall', color: 0xd9dfe4, roughness: 0.96, metalness: 0, side: T.DoubleSide }),
        floor: new T.MeshStandardMaterial({ name: 'floor', color: 0x9aa2aa, roughness: 0.94, metalness: 0 }),
        table: new T.MeshStandardMaterial({ name: 'table_top', color: 0xb0a798, roughness: 0.86, metalness: 0.02 }),
        frame: new T.MeshStandardMaterial({ name: 'window_frame', color: 0xf0f3f6, roughness: 0.7, metalness: 0.04 })
      };

      this.buildRoom();
      this.buildLights();

      this.g = new T.Group(); this.g.name = 'light_box_bench'; s.add(this.g);
      this.buildBox();
      this.buildLight();
      this.buildObject();
      this.buildScreen();
      this.buildBeam();
      this.buildRays();
      this.buildLabels();
    }

    buildRoom() {
      const T = this.THREE, M = this.mats;
      const room = new T.Group(); room.name = 'room'; this.s.add(room);

      const floor = new T.Mesh(new T.PlaneGeometry(7, 7), M.floor);
      floor.name = 'floor'; floor.rotation.x = -Math.PI / 2;
      floor.position.y = FLOOR_Y; floor.receiveShadow = true;
      room.add(floor);

      /* the back wall, with the window cut out of it */
      const sh = new T.Shape();
      sh.moveTo(-2.0, FLOOR_Y); sh.lineTo(2.0, FLOOR_Y); sh.lineTo(2.0, 1.7); sh.lineTo(-2.0, 1.7); sh.lineTo(-2.0, FLOOR_Y);
      const hole = new T.Path();
      hole.moveTo(WIN_L, WIN_B); hole.lineTo(WIN_R, WIN_B); hole.lineTo(WIN_R, WIN_T); hole.lineTo(WIN_L, WIN_T); hole.lineTo(WIN_L, WIN_B);
      sh.holes.push(hole);
      const wall = new T.Mesh(new T.ShapeGeometry(sh), M.wall);
      wall.name = 'back_wall'; wall.position.z = WALL_Z; wall.receiveShadow = true;
      room.add(wall);

      /* the sky beyond */
      this.skyMat = new T.MeshBasicMaterial({ name: 'sky', map: this.skyTex(), toneMapped: false, fog: false });
      const sky = new T.Mesh(new T.PlaneGeometry(WIN_W + 0.5, (WIN_T - WIN_B) + 0.5), this.skyMat);
      sky.name = 'sky'; sky.position.set(WIN_C, (WIN_B + WIN_T) / 2, WALL_Z - 0.16);
      room.add(sky);

      /* reveal, frame and mullions */
      const rev = (w, h, x, y) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, 0.075), M.frame);
        m.name = 'window_reveal'; m.position.set(x, y, WALL_Z - 0.030);
        m.castShadow = false; m.receiveShadow = true;
        room.add(m);
      };
      const t = 0.030;
      rev(WIN_W + t * 2, t, WIN_C, WIN_B - t / 2);
      rev(WIN_W + t * 2, t, WIN_C, WIN_T + t / 2);
      rev(t, WIN_T - WIN_B, WIN_L - t / 2, (WIN_B + WIN_T) / 2);
      rev(t, WIN_T - WIN_B, WIN_R + t / 2, (WIN_B + WIN_T) / 2);
      const mulV = new T.Mesh(new T.BoxGeometry(0.022, WIN_T - WIN_B, 0.032), M.frame);
      mulV.name = 'mullion'; mulV.position.set(WIN_C, (WIN_B + WIN_T) / 2, WALL_Z - 0.008);
      room.add(mulV);
      const mulH = new T.Mesh(new T.BoxGeometry(WIN_W, 0.022, 0.032), M.frame);
      mulH.name = 'mullion'; mulH.position.set(WIN_C, (WIN_B + WIN_T) * 0.5 + 0.04, WALL_Z - 0.008);
      room.add(mulH);
      const sill = new T.Mesh(new T.BoxGeometry(WIN_W + 0.13, 0.022, 0.10), M.frame);
      sill.name = 'window_sill'; sill.position.set(WIN_C, WIN_B - 0.028, WALL_Z + 0.030);
      sill.castShadow = true; sill.receiveShadow = true;
      room.add(sill);

      /* curtain rod and rings */
      const rod = new T.Mesh(new T.CylinderGeometry(0.0085, 0.0085, WIN_W + 0.42, 14), M.steel);
      rod.name = 'curtain_rod'; rod.rotation.z = Math.PI / 2;
      rod.position.set(WIN_C, ROD_Y, WALL_Z + 0.075);
      room.add(rod);
      [-1, 1].forEach((sgn) => {
        const f = new T.Mesh(new T.SphereGeometry(0.014, 14, 10), M.steel);
        f.name = 'rod_finial';
        f.position.set(WIN_C + sgn * (WIN_W / 2 + 0.215), ROD_Y, WALL_Z + 0.075);
        room.add(f);
      });

      this.curtMat = new T.MeshStandardMaterial({
        name: 'curtain', color: 0xd8654f, roughness: 0.97, metalness: 0,
        side: T.DoubleSide, emissive: 0xff9a6a, emissiveIntensity: 0
      });
      const H = ROD_Y - 0.022 - CURT_B;
      const geo = this.curtainGeom(H, 7);
      this.curtains = [-1, 1].map((sgn) => {
        const m = new T.Mesh(geo, this.curtMat);
        m.name = 'curtain';
        m.position.set(sgn < 0 ? WIN_L - 0.045 : WIN_R + 0.045, CURT_B + H / 2, WALL_Z + 0.075);
        m.userData = { sgn, span: Math.abs(WIN_C - (sgn < 0 ? WIN_L - 0.045 : WIN_R + 0.045)) };
        m.receiveShadow = true;
        room.add(m);
        return m;
      });

      /* the table the bench stands on */
      const top = new T.Mesh(new T.BoxGeometry(1.34, 0.032, 0.70), M.table);
      top.name = 'table_top'; top.position.set(0.03, TABLE_Y0 - 0.016, 0);
      top.castShadow = true; top.receiveShadow = true;
      room.add(top);
      const edge = new T.Mesh(new T.BoxGeometry(1.34, 0.012, 0.70), M.dark);
      edge.name = 'table_edge'; edge.position.set(0.03, TABLE_Y0 - 0.038, 0);
      room.add(edge);
      [[-0.58, -0.29], [0.62, -0.29], [-0.58, 0.29], [0.62, 0.29]].forEach(([x, z]) => {
        const leg = new T.Mesh(new T.BoxGeometry(0.042, TABLE_Y0 - 0.044 - FLOOR_Y, 0.042), M.dark);
        leg.name = 'table_leg';
        leg.position.set(x, (TABLE_Y0 - 0.044 + FLOOR_Y) / 2, z);
        leg.castShadow = true; leg.receiveShadow = true;
        room.add(leg);
      });

      /* the pendant lamp over the bench */
      const cord = new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, 1.0, 8), M.dark);
      cord.name = 'lamp_cord'; cord.position.set(0.03, 1.06, 0.02);
      room.add(cord);
      const shade = new T.Mesh(new T.CylinderGeometry(0.026, 0.090, 0.074, 28, 1, true),
        new T.MeshStandardMaterial({ name: 'lamp_shade', color: 0xe8eaec, roughness: 0.7, metalness: 0.05, side: T.DoubleSide }));
      shade.name = 'lamp_shade'; shade.position.set(0.03, 0.560, 0.02);
      shade.castShadow = false; shade.receiveShadow = true;
      room.add(shade);
      this.bulbMat = new T.MeshStandardMaterial({ name: 'lamp_bulb', color: 0xd8d2c4, emissive: 0xffdda2, emissiveIntensity: 0, roughness: 0.4, toneMapped: false });
      const bulb = new T.Mesh(new T.SphereGeometry(0.020, 18, 14), this.bulbMat);
      bulb.name = 'lamp_bulb'; bulb.position.set(0.03, 0.532, 0.02);
      room.add(bulb);
      this.lampGlowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,238,206,.95)', 'rgba(255,210,140,.5)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0, fog: false });
      const lg = new T.Sprite(this.lampGlowMat);
      lg.name = 'lamp_glow'; lg.scale.set(0.30, 0.30, 1); lg.position.set(0.03, 0.532, 0.02);
      room.add(lg);
    }

    /* a plane with vertical folds, origin at its outer edge, running +x */
    curtainGeom(H, folds) {
      const T = this.THREE;
      const g = new T.PlaneGeometry(1, H, folds * 4, 6);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) + 0.5;
        const v = 0.5 - p.getY(i) / H;
        p.setZ(i, Math.sin(u * Math.PI * folds * 2) * 0.017 * (0.55 + 0.45 * v));
      }
      g.computeVertexNormals();
      g.translate(0.5, 0, 0);
      return g;
    }

    /* two rigs that cross-fade: daylight through the window, and the room lamp */
    buildLights() {
      const T = this.THREE, s = this.s;
      this.dayRig = []; this.lampRig = [];
      const add = (rig, l, base) => { l.userData.base = base; rig.push(l); s.add(l); return l; };

      const sun = add(this.dayRig, new T.DirectionalLight(0xfff6e4, 1), 2.05);
      sun.position.set(WIN_C - 0.5, 1.25, WALL_Z - 1.5);
      sun.target.position.set(0.06, 0.06, 0.04);
      s.add(sun.target);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const sc = sun.shadow.camera;
      sc.left = -1.0; sc.right = 1.0; sc.top = 1.0; sc.bottom = -0.8;
      sc.near = 0.4; sc.far = 4.2;
      sun.shadow.bias = -0.0012;
      sun.shadow.normalBias = 0.006;
      add(this.dayRig, new T.HemisphereLight(0xd6ecfb, 0x8d949a, 1), 1.20);
      const bounce = add(this.dayRig, new T.DirectionalLight(0xdfeaf4, 1), 0.62);
      bounce.position.set(0.9, 0.55, 1.5);

      /* the lamp is deliberately soft and mostly overhead — it keeps the room as
         bright as daylight without flooding the face of the screen, so the
         torch's own shadow still reads */
      const lamp = add(this.lampRig, new T.PointLight(0xffdcac, 1, 0, 0), 0.70);
      lamp.position.set(0.03, 0.508, 0.02);
      add(this.lampRig, new T.HemisphereLight(0xffe7c6, 0xa08d76, 1), 1.15);
      const warmFill = add(this.lampRig, new T.DirectionalLight(0xffeeda, 1), 0.95);
      warmFill.position.set(0.8, 0.7, 1.4);
      const warmBack = add(this.lampRig, new T.DirectionalLight(0xffe3bf, 1), 0.42);
      warmBack.position.set(0.6, 0.9, -1.2);
    }

    buildBox() {
      const T = this.THREE, M = this.mats, G = this.g;
      const rail = new T.Mesh(new T.BoxGeometry(0.79, 0.020, 0.26), M.rail);
      rail.name = 'light_box_base';
      rail.position.set(0.025, 0.010, 0);
      rail.receiveShadow = true; rail.castShadow = true;
      G.add(rail);

      const lip = new T.Mesh(new T.BoxGeometry(0.79, 0.012, 0.008), M.dark);
      lip.name = 'base_lip'; lip.position.set(0.025, 0.026, 0.126); G.add(lip);
      const lip2 = lip.clone(); lip2.position.z = -0.126; G.add(lip2);

      for (let n = 1; n <= NSLOT; n++) {
        const x = SLOT_X(n);
        for (let i = 0; i < 2; i++) {
          const rdg = new T.Mesh(new T.BoxGeometry(0.004, 0.014, 0.215), M.dark);
          rdg.name = 'slot_ridge';
          rdg.position.set(x + (i ? 0.0055 : -0.0055), 0.027, 0);
          rdg.castShadow = true; rdg.receiveShadow = true;
          G.add(rdg);
        }
        const gr = new T.Mesh(new T.BoxGeometry(0.007, 0.004, 0.212), M.groove);
        gr.name = 'slot_groove'; gr.position.set(x, 0.0215, 0); G.add(gr);
        const sp = this.numSprite(n);
        sp.position.set(x, 0.032, 0.152);
        G.add(sp);
      }
    }

    /* the torch: a small bright source standing on a card in a slot */
    buildLight() {
      const T = this.THREE, M = this.mats;
      const g = new T.Group(); g.name = 'torch';
      /* the emitting face sits exactly on the slot line, so the rendered shadow
         matches the model's similar triangles */
      const card = new T.Mesh(new T.BoxGeometry(0.006, 0.076, 0.086), M.dark);
      card.name = 'torch_card'; card.position.set(-0.020, DECK_Y + 0.038, 0); card.receiveShadow = true;
      g.add(card);
      const foot = new T.Mesh(new T.BoxGeometry(0.030, 0.012, 0.094), M.dark);
      foot.name = 'torch_foot'; foot.position.set(-0.014, DECK_Y + 0.006, 0); foot.castShadow = true; g.add(foot);
      const head = new T.Mesh(new T.CylinderGeometry(0.012, 0.014, 0.020, 24), M.dark);
      head.name = 'torch_head'; head.rotation.z = -Math.PI / 2; head.position.set(-0.011, BASE_Y, 0); head.castShadow = true; g.add(head);
      const bezel = new T.Mesh(new T.TorusGeometry(0.0118, 0.0018, 8, 26), M.steel);
      bezel.name = 'torch_bezel'; bezel.rotation.y = Math.PI / 2; bezel.position.set(-0.0005, BASE_Y, 0); g.add(bezel);
      this.lensMat = new T.MeshStandardMaterial({ name: 'torch_lens', color: 0x6a6f6a, emissive: 0xffe3a6, emissiveIntensity: 0, roughness: 0.2, toneMapped: false });
      const lens = new T.Mesh(new T.CircleGeometry(0.0105, 26), this.lensMat);
      lens.name = 'torch_lens'; lens.rotation.y = Math.PI / 2; lens.position.set(0.0002, BASE_Y, 0); g.add(lens);
      this.glowMat = new T.SpriteMaterial({ map: this.radialTex('rgba(255,250,232,1)', 'rgba(255,216,136,.72)'), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0, fog: false });
      const glow = new T.Sprite(this.glowMat);
      glow.name = 'torch_glow'; glow.scale.set(0.062, 0.062, 1); glow.position.set(0.004, BASE_Y, 0); glow.renderOrder = 26;
      g.add(glow);
      this.gLight = g;
      this.g.add(g);

      this.spot = new T.SpotLight(0xfff4dc, 0, 2.8, 0.62, 0.24, 0);
      this.spot.castShadow = true;
      this.spot.shadow.mapSize.set(2048, 2048);
      this.spot.shadow.camera.near = 0.012;
      this.spot.shadow.camera.far = 1.6;
      this.spot.shadow.bias = -0.0004;
      this.spot.shadow.normalBias = 0.0016;
      this.g.add(this.spot, this.spot.target);
    }

    /* a solid object: a small standing figure on a wooden base */
    buildObject() {
      const T = this.THREE, M = this.mats;
      const g = new T.Group(); g.name = 'object';
      const plinth = new T.Mesh(new T.CylinderGeometry(0.027, 0.030, PLINTH_H, 26), M.wood);
      plinth.name = 'wooden_base'; plinth.position.y = DECK_Y + PLINTH_H / 2;
      plinth.castShadow = true; plinth.receiveShadow = true;
      g.add(plinth);

      const f = new T.Group(); f.name = 'object_figure'; f.position.y = BASE_Y;
      const put = (mesh, y) => { mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; f.add(mesh); return mesh; };
      put(new T.Mesh(new T.CylinderGeometry(0.0115, 0.0200, 0.040, 24), M.figure), 0.020);
      put(new T.Mesh(new T.SphereGeometry(0.0125, 22, 16), M.figure), 0.0455);
      put(new T.Mesh(new T.SphereGeometry(0.0118, 22, 16), M.figure), 0.0600);
      [-1, 1].forEach((sgn) => {
        const a = new T.Mesh(new T.CapsuleGeometry(0.0034, 0.019, 4, 12), M.figure);
        a.position.set(0, 0.0355, sgn * 0.0145);
        a.rotation.x = sgn * -0.38;
        a.castShadow = true; a.receiveShadow = true;
        f.add(a);
      });
      this.fig = f;
      g.add(f);
      this.gObject = g;
      this.g.add(g);
    }

    buildScreen() {
      const T = this.THREE, M = this.mats;
      const g = new T.Group(); g.name = 'screen';
      const SW = 0.26, SH = 0.35;
      const board = new T.Mesh(new T.PlaneGeometry(SW, SH), M.screen);
      board.name = 'white_screen';
      board.rotation.y = -Math.PI / 2;
      board.position.set(0, DECK_Y + SH / 2, 0);
      board.receiveShadow = true;
      g.add(board);
      const back = new T.Mesh(new T.BoxGeometry(0.010, SH + 0.018, SW + 0.018), M.dark);
      back.name = 'screen_frame'; back.position.set(0.007, DECK_Y + SH / 2, 0);
      back.castShadow = true; back.receiveShadow = true;
      g.add(back);
      const foot = new T.Mesh(new T.BoxGeometry(0.040, 0.016, 0.22), M.dark);
      foot.name = 'screen_foot'; foot.position.set(0.005, DECK_Y + 0.008, 0); foot.castShadow = true; g.add(foot);

      const rulerH = RULER_MAX * CM;
      const ruler = new T.Mesh(new T.PlaneGeometry(0.038, rulerH),
        new T.MeshBasicMaterial({ name: 'ruler', map: this.rulerTex(), toneMapped: false }));
      ruler.name = 'ruler';
      ruler.rotation.y = -Math.PI / 2;
      ruler.position.set(-0.0012, BASE_Y + rulerH / 2, 0.106);
      g.add(ruler);

      /* the height the shadow reaches, marked against the ruler */
      this.markMat = new T.MeshBasicMaterial({ name: 'shadow_height', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: T.DoubleSide });
      this.mark = new T.Mesh(new T.PlaneGeometry(0.0042, 1), this.markMat);
      this.mark.name = 'shadow_height'; this.mark.rotation.y = -Math.PI / 2;
      this.mark.renderOrder = 24;
      g.add(this.mark);
      this.tickMat = new T.MeshBasicMaterial({ name: 'shadow_top_tick', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, side: T.DoubleSide });
      this.tick = new T.Mesh(new T.PlaneGeometry(0.062, 0.0034), this.tickMat);
      this.tick.name = 'shadow_top_tick'; this.tick.rotation.y = -Math.PI / 2;
      this.tick.renderOrder = 28;
      g.add(this.tick);

      this.gScreen = g;
      this.g.add(g);
      this.screenGeom = { SW, SH };
    }

    buildBeam() {
      const T = this.THREE;
      const mk = (col) => new T.MeshBasicMaterial({ name: 'beam', color: col, transparent: true, opacity: 0, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending, fog: false, toneMapped: false });
      this.cone = new T.Mesh(new T.ConeGeometry(1, 1, 34, 1, true), mk(0xffe2ab));
      this.cone.name = 'beam_cone'; this.cone.rotation.z = Math.PI / 2; this.cone.renderOrder = 16;
      this.g.add(this.cone);
    }

    buildRays() {
      const T = this.THREE;
      const mk = () => new T.LineDashedMaterial({ name: 'ray', color: 0xff8c00, dashSize: 0.013, gapSize: 0.009, transparent: true, opacity: 0, depthTest: false, fog: false, toneMapped: false });
      const geo = (n) => {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
        return g;
      };
      this.rayTop = new T.Line(geo(3), mk());
      this.rayTop.name = 'ray_top'; this.rayTop.renderOrder = 27; this.rayTop.visible = false;
      this.rayBase = new T.Line(geo(2), mk());
      this.rayBase.name = 'ray_base'; this.rayBase.renderOrder = 27; this.rayBase.visible = false;
      this.g.add(this.rayTop, this.rayBase);

      this.dotMat = new T.MeshBasicMaterial({ name: 'ray_point', color: 0xff8c00, transparent: true, opacity: 0, depthTest: false, toneMapped: false, fog: false });
      this.dots = [0, 1].map(() => {
        const m = new T.Mesh(new T.SphereGeometry(0.0042, 14, 10), this.dotMat);
        m.name = 'ray_point'; m.renderOrder = 29; m.visible = false;
        this.g.add(m);
        return m;
      });
    }

    buildLabels() {
      this.lblLight = this.labelPlate('TORCH', '#ffb627');
      this.lblObject = this.labelPlate('OBJECT', '#66ccff');
      this.lblScreen = this.labelPlate('SCREEN', '#ffffff');
      this.lblTable = this.labelPlate('TABLE', '#5ee07a');
      this.g.add(this.lblLight, this.lblObject, this.lblScreen);
      this.lblTable.position.set(-0.46, 0.112, 0.30);
      this.s.add(this.lblTable);
    }

    bindPointer() {
      const el = this.r.domElement;
      let drag = null;
      el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.02, 0.92);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', () => { drag = null; });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.6, 3.0);
      }, { passive: false });
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const on = this.cfg.on === 'yes' || this.cfg.on === true;
      const closed = this.cfg.curtain === 'closed';
      const ph = model(this.lightSlot(), this.objectSlot(), this.screenSlot(), this.objectCm());

      this.lit = lerp(this.lit, on ? 1 : 0, 1 - Math.exp(-dt * 9));
      this.curt = lerp(this.curt, closed ? 1 : 0, 1 - Math.exp(-dt * 3.4));
      const L = smooth(clamp(this.lit, 0, 1));
      const C = smooth(clamp(this.curt, 0, 1));
      this.day = 1 - C;

      const k = 1 - Math.exp(-dt * 12);
      this.pLight = lerp(this.pLight, SLOT_X(ph.lightSlot), k);
      this.pObject = lerp(this.pObject, SLOT_X(ph.objectSlot), k);
      this.pScreen = lerp(this.pScreen, SLOT_X(ph.screenSlot), k);

      this.gLight.position.x = this.pLight;
      this.gObject.position.x = this.pObject;
      this.gScreen.position.x = this.pScreen;

      const objH = ph.objectCm * CM;
      const fs = objH / FIG_UNIT;
      this.fig.scale.set(fs, fs, fs);

      /* the two rigs cross-fade; the room never goes dark. Once the torch is on
         the room light eases back a little so its shadow reads hard. */
      const dip = 1 - 0.46 * L;
      const dayK = this.day * dip, lampK = C * dip;
      this.dayRig.forEach((l) => { l.intensity = l.userData.base * dayK; });
      const sunShadow = dayK > 0.15;
      if (this._sunShadow !== sunShadow) {
        this._sunShadow = sunShadow;
        this.dayRig.forEach((l) => { if (l.isDirectionalLight && l.shadow.mapSize.width > 512) l.castShadow = sunShadow; });
      }
      this.lampRig.forEach((l) => { l.intensity = l.userData.base * lampK; });
      this.bulbMat.emissiveIntensity = 1.5 * C;
      this.lampGlowMat.opacity = 0.34 * C;
      this.curtMat.emissiveIntensity = 0.22 * C;
      this.curtains.forEach((m) => {
        const kx = lerp(0.22, 1, C);
        m.scale.set(m.userData.sgn * m.userData.span * kx, 1, lerp(2.1, 1, C));
      });
      this.s.background.copy(this.bgDay).lerp(this.bgLamp, C).multiplyScalar(0.62 + 0.38 * dip);
      this.s.fog.color.copy(this.s.background);

      /* the live geometry, taken from where things actually are this frame */
      const dLO = Math.max(0.004, this.pObject - this.pLight);
      const dLS = Math.max(0.006, this.pScreen - this.pLight);
      const magNow = dLS / dLO;
      const shadowTop = BASE_Y + objH * magNow;

      this.spot.position.set(this.pLight, BASE_Y, 0);
      this.spot.target.position.set(this.pScreen, BASE_Y + 0.06, 0);
      this.spot.angle = clamp(Math.atan(0.26 / dLS) + 0.10, 0.30, 1.05);
      this.spot.intensity = 26.0 * L;
      this.lensMat.emissiveIntensity = 1.6 * L;
      this.glowMat.opacity = 0.78 * L;

      /* the cone of light, spreading out from the torch */
      const len = Math.max(0.004, this.pScreen - this.pLight);
      const rEnd = clamp(len * 0.34, 0.02, 0.17);
      this.cone.position.set(this.pLight + len / 2, BASE_Y, 0);
      this.cone.scale.set(rEnd, len, rEnd);
      this.cone.material.opacity = 0.105 * L;
      this.cone.visible = L > 0.02;

      /* the two rays that explain the size */
      const wantRays = this.cfg.rays === 'yes' && L > 0.3;
      this.rayA = lerp(this.rayA, wantRays ? 1 : 0, 1 - Math.exp(-dt * 8));
      const A = clamp(this.rayA, 0, 1);
      const showRay = A > 0.02;
      this.rayTop.visible = this.rayBase.visible = showRay;
      this.dots.forEach((d) => { d.visible = showRay; });
      this.rayTop.material.opacity = this.rayBase.material.opacity = 0.95 * A;
      this.dotMat.opacity = 0.95 * A;
      if (showRay) {
        const pt = this.rayTop.geometry.attributes.position;
        pt.setXYZ(0, this.pLight, BASE_Y, 0);
        pt.setXYZ(1, this.pObject, BASE_Y + objH, 0);
        pt.setXYZ(2, this.pScreen - 0.003, shadowTop, 0);
        pt.needsUpdate = true;
        this.rayTop.geometry.computeBoundingSphere();
        this.rayTop.computeLineDistances();
        const pb = this.rayBase.geometry.attributes.position;
        pb.setXYZ(0, this.pLight, BASE_Y, 0);
        pb.setXYZ(1, this.pScreen - 0.003, BASE_Y, 0);
        pb.needsUpdate = true;
        this.rayBase.geometry.computeBoundingSphere();
        this.rayBase.computeLineDistances();
        this.dots[0].position.set(this.pObject, BASE_Y + objH, 0);
        this.dots[1].position.set(this.pScreen - 0.004, shadowTop, 0);
      }

      /* the measured height, read off the ruler */
      const h = Math.max(0.001, objH * magNow);
      this.mark.position.set(-0.0022, BASE_Y + h / 2, 0.082);
      this.mark.scale.set(1, h, 1);
      this.markMat.opacity = 0.78 * L * (0.35 + 0.65 * A);
      this.tick.position.set(-0.0028, BASE_Y + h, 0.098);
      this.tickMat.opacity = 0.96 * L * (0.3 + 0.7 * A);

      /* labels dim a little once the torch is on — they never disappear */
      const lop = 0.98 - 0.26 * L;
      this.lblLight.material.opacity = lop;
      this.lblObject.material.opacity = lop;
      this.lblScreen.material.opacity = lop;
      this.lblTable.material.opacity = lop * 0.9;
      this.lblLight.position.set(this.pLight, DECK_Y + 0.112, 0);
      this.lblObject.position.set(this.pObject, BASE_Y + objH + 0.038, 0);
      this.lblScreen.position.set(this.pScreen, DECK_Y + this.screenGeom.SH + 0.036, 0);

      this.draw();

      window.dispatchEvent(new CustomEvent('shadowsize', { detail: ph }));
    }

    aimMain() {
      const c = this.camA, cd = this.cam;
      const ty = 0.152, tx = 0.02;
      const aspect = (this.vw || 800) / (this.vh || 500);
      const fit = aspect < 1.5 ? clamp(1.5 / Math.max(aspect, 0.4), 1, 1.8) : 1;
      const d = cd.dist * fit;
      c.aspect = aspect;
      c.updateProjectionMatrix();
      c.position.set(tx + Math.sin(cd.az) * Math.cos(cd.el) * d, ty + Math.sin(cd.el) * d, Math.cos(cd.az) * Math.cos(cd.el) * d);
      c.lookAt(tx, ty, 0);
    }

    /* the second view: a long lens, almost level with the bench, so the two rays
       and the two triangles read as a diagram */
    sideCam(aspect) {
      const T = this.THREE;
      const c = this.camS || (this.camS = new T.PerspectiveCamera(22, 1, 0.02, 30));
      const tx = 0.025, ty = 0.150, az = -0.30, el = 0.10;
      const fit = aspect < 1.5 ? clamp(1.5 / Math.max(aspect, 0.4), 1, 1.8) : 1;
      const d = 1.80 * fit;
      c.aspect = aspect;
      c.setViewOffset(1000, 1000, 0, 52, 1000, 1000);
      c.updateProjectionMatrix();
      c.position.set(tx + Math.sin(az) * Math.cos(el) * d, ty + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
      c.lookAt(tx, ty, 0);
      return c;
    }

    draw() {
      const r = this.r, W = this.vw || 800, H = this.vh || 500;
      const mode = this.viewMode();
      const bg = this.s.background;
      r.setScissorTest(false);
      r.setClearColor(bg, 1);
      r.clear(true, true, false);

      if (mode === 'top') {
        r.setViewport(0, 0, W, H);
        r.render(this.s, this.sideCam(W / H));
        return;
      }

      this.aimMain();
      r.setViewport(0, 0, W, H);
      r.render(this.s, this.camA);

      if (mode !== 'both') return;
      const iw = Math.round(Math.min(380, W * 0.36)), ih = Math.round(iw * 0.62);
      const ix = W - iw - 16, iy = H - ih - 16;
      r.setScissorTest(true);
      r.setScissor(ix - 2, iy - 2, iw + 4, ih + 4);
      r.setViewport(ix - 2, iy - 2, iw + 4, ih + 4);
      r.setClearColor(0x2f6fd6, 1);
      r.clear(true, true, false);
      r.setScissor(ix, iy, iw, ih);
      r.setViewport(ix, iy, iw, ih);
      r.setClearColor(bg, 1);
      r.clear(true, true, false);
      r.render(this.s, this.sideCam(iw / ih));
      r.setScissorTest(false);
    }
  }

  customElements.define('shadow-size-scene', ShadowSizeScene);
})();
