/* <cooler-scene> — three.js picnic-table bench + particle zoom for the
   "keeping things cold" lesson.
   Attributes: experiment (plan|test|design), time (minutes),
               plan (comma list: change,same,measure,mistake-water,mistake-material),
               build (material,layers,lid), view (apparatus|particles|both)
   Dispatches on window: "cooler" {detail: readings} about every 90 ms,
                         "cooler-crossed" once when the design water passes 10 °C. */
(() => {
  if (window.__coolerScene) return;
  window.__coolerScene = true;

  const ROOM = 32, START = 4, TARGET = 10, TEST_MAX = 30, DESIGN_MAX = 60;
  const D0 = START - ROOM;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* Newton's law towards the 32 °C room, one rate per wrapping.
     By 30 min: none 24, foil 21, cloth 13, foam 9 */
  const RATE = {
    none: Math.log(28 / 8) / 30,
    foil: Math.log(28 / 11) / 30,
    cloth: Math.log(28 / 19) / 30,
    foam: Math.log(28 / 23) / 30
  };

  /* the pure model the whole lesson runs on */
  function physics(tMin) {
    const t = clamp(isFinite(tMin) ? tMin : 0, 0, TEST_MAX);
    const at = (k) => ROOM + D0 * Math.exp(-k * t);
    return {
      t, room: ROOM, start: START,
      none: at(RATE.none), foil: at(RATE.foil), cloth: at(RATE.cloth), foam: at(RATE.foam)
    };
  }

  const MAT_K = { foil: 0.0400, newspaper: 0.0150, cloth: 0.0130, bubble: 0.0100, foam: 0.0075 };
  const LAYER_F = { 1: 1, 2: 0.72, 3: 0.58 };
  const LID_K = { none: 0.0090, plastic: 0.0030, foam: 0.0008 };

  function parseBuild(str) {
    const p = String(str == null ? '' : str).split(',').map(x => x.trim().toLowerCase());
    return {
      material: MAT_K[p[0]] !== undefined ? p[0] : 'foil',
      layers: clamp(parseInt(p[1], 10) || 1, 1, 3),
      lid: LID_K[p[2]] !== undefined ? p[2] : 'none'
    };
  }

  function buildRate(b) {
    const bb = (typeof b === 'string' || b == null) ? parseBuild(b) : b;
    return MAT_K[bb.material] * LAYER_F[bb.layers] + LID_K[bb.lid];
  }

  /* same curve, with a rate made from the three build choices */
  function design(tMin, b) {
    const k = buildRate(b);
    const t = clamp(isFinite(tMin) ? tMin : 0, 0, DESIGN_MAX);
    return {
      t, room: ROOM, start: START, target: TARGET, k,
      temp: ROOM + D0 * Math.exp(-k * t),
      crossAt: Math.log((ROOM - START) / (ROOM - TARGET)) / k
    };
  }

  window.coolerPhysics = physics;
  window.coolerDesign = design;
  window.coolerRate = buildRate;
  window.coolerParseBuild = parseBuild;

  const tempColor = (T3, t) => new T3.Color().lerpColors(
    new T3.Color(0x62c2f2), new T3.Color(0xff6a5e),
    Math.pow(clamp((t - 2) / 32, 0, 1), 1.1));

  const WRAPS = [null, 'foil', 'cloth', 'foam'];
  const BX = [-0.168, -0.056, 0.056, 0.168];

  class CoolerScene extends HTMLElement {
    static get observedAttributes() { return ['experiment', 'time', 'plan', 'build', 'view']; }

    constructor() {
      super();
      this.cfg = { experiment: 'plan', time: 0, plan: '', build: 'foil,1,none', view: 'both' };
      this.cam = { az: 0.42, el: 0.28, dist: 0.9 };
      this.last = 0;
      this.emitAt = 0;
      this.scrAt = 0;
      this.crossed = false;
      this.ready = false;
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'time') {
        const p = parseFloat(v);
        const nt = clamp(isFinite(p) ? p : 0, 0, DESIGN_MAX);
        if (nt < this.cfg.time) this.crossed = false;
        this.cfg.time = nt;
      } else if (n === 'build') {
        if (v !== this.cfg.build) this.crossed = false;
        this.cfg.build = v || this.cfg.build;
      } else if (n === 'plan') {
        this.cfg.plan = v || '';
      } else this.cfg[n] = v || this.cfg[n];
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', background: '#08131f' });
      this.caps = document.createElement('div');
      this.caps.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:Nunito,system-ui,sans-serif';
      this.caps.innerHTML =
        '<div data-cap="a" style="position:absolute;left:14px;bottom:12px;padding:5px 12px;border-radius:999px;background:rgba(7,13,21,.78);border:1px solid rgba(255,255,255,.14);color:#8a98a6;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Apparatus</div>' +
        '<div data-cap="p" style="position:absolute;right:14px;bottom:12px;padding:5px 12px;border-radius:999px;background:rgba(7,13,21,.78);border:1px solid rgba(102,204,255,.35);color:#66ccff;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Particle zoom</div>' +
        '<div data-cap="frame" style="position:absolute;top:8px;bottom:8px;right:8px;left:8px;border:1px solid rgba(102,204,255,.3);border-radius:16px;box-shadow:inset 0 0 26px rgba(102,204,255,.07)"></div>';
      this.appendChild(this.caps);
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
      r.toneMappingExposure = 1.04;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.insertBefore(r.domElement, this.caps);
      this.r = r;

      const grain = this.grainTex();
      this.mats = {
        steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0x9aa7b4, metalness: 0.9, roughness: 0.32 }),
        dark: new THREE.MeshStandardMaterial({ name: 'matte_black', color: 0x1b283a, metalness: 0.2, roughness: 0.85 }),
        bottle: new THREE.MeshStandardMaterial({ name: 'bottle_plastic', color: 0xcfe6f5, metalness: 0, roughness: 0.07, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
        foil: new THREE.MeshStandardMaterial({ name: 'metal_foil', color: 0xe2ecf4, metalness: 0.68, roughness: 0.3, bumpMap: grain, bumpScale: 0.14 }),
        cloth: new THREE.MeshStandardMaterial({ name: 'thick_cloth', color: 0xc07f43, metalness: 0, roughness: 0.98, bumpMap: grain, bumpScale: 0.5 }),
        foam: new THREE.MeshStandardMaterial({ name: 'foam', color: 0xf1f4f7, metalness: 0, roughness: 0.94, bumpMap: grain, bumpScale: 0.22 }),
        bubble: new THREE.MeshStandardMaterial({ name: 'bubble_wrap', color: 0xbfe6f5, metalness: 0, roughness: 0.16, transparent: true, opacity: 0.55, bumpMap: this.bubbleTex(), bumpScale: 0.6 }),
        newspaper: new THREE.MeshStandardMaterial({ name: 'newspaper', color: 0xd8d2c2, metalness: 0, roughness: 0.96, map: this.newsTex() }),
        wood: new THREE.MeshStandardMaterial({ name: 'picnic_wood', color: 0x5c3a20, roughness: 0.96, bumpMap: grain, bumpScale: 0.3 }),
        woodDark: new THREE.MeshStandardMaterial({ name: 'picnic_wood_dark', color: 0x472d18, roughness: 0.98 }),
        capPlastic: new THREE.MeshStandardMaterial({ name: 'plastic_lid', color: 0x4a90e2, metalness: 0, roughness: 0.3 }),
        wire: new THREE.MeshStandardMaterial({ name: 'probe_wire', color: 0x0c1520, roughness: 0.95 }),
        face: new THREE.MeshStandardMaterial({ name: 'clock_face', color: 0xe9eef3, roughness: 0.7 })
      };

      this.buildApparatus();
      this.buildParticles();
      const env = this.makeEnv();
      this.sA.environment = env;
      this.sP.environment = env;
      this.sA.environmentIntensity = 0.5;
      this.sP.environmentIntensity = 0.7;

      this.camA = new THREE.PerspectiveCamera(38, 1, 0.02, 12);
      this.camP = new THREE.PerspectiveCamera(40, 1, 0.02, 12);
      this.pAngle = 0;

      this.bindPointer();
      new ResizeObserver(() => this.resize()).observe(this);
      this.resize();
      this.ready = true;
      r.setAnimationLoop((ms) => this.frame(ms));
    }

    grainTex() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#808080';
      cx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2800; i++) {
        const v = Math.round(104 + Math.random() * 96);
        cx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        cx.fillRect(Math.random() * 128, Math.random() * 128, 2.4, 2.4);
      }
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(3, 3);
      return tex;
    }

    bubbleTex() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#6e6e6e';
      cx.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const cxp = x * 16 + 8 + (y % 2 ? 8 : 0), cyp = y * 16 + 8;
          const g = cx.createRadialGradient(cxp, cyp, 1, cxp, cyp, 8);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.75, '#9b9b9b');
          g.addColorStop(1, '#6e6e6e');
          cx.fillStyle = g;
          cx.beginPath();
          cx.arc(cxp, cyp, 8, 0, Math.PI * 2);
          cx.fill();
        }
      }
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(4, 2);
      return tex;
    }

    newsTex() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ded8c9';
      cx.fillRect(0, 0, 128, 128);
      cx.fillStyle = 'rgba(40,44,50,.42)';
      for (let y = 6; y < 124; y += 7) {
        let x = 6;
        while (x < 120) {
          const w = 4 + Math.random() * 14;
          if (x + w > 120) break;
          cx.fillRect(x, y, w, 2.2);
          x += w + 3;
        }
      }
      cx.fillStyle = 'rgba(40,44,50,.6)';
      cx.fillRect(6, 112, 60, 5);
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(3, 1);
      tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    makeEnv() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 128;
      const cx = cv.getContext('2d');
      const g = cx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#ffe9cc');
      g.addColorStop(0.38, '#d8a76a');
      g.addColorStop(0.52, '#2a2117');
      g.addColorStop(1, '#05090f');
      cx.fillStyle = g; cx.fillRect(0, 0, 64, 128);
      cx.fillStyle = 'rgba(255,214,150,0.7)';
      cx.fillRect(8, 14, 18, 26);
      cx.fillStyle = 'rgba(255,255,255,0.6)';
      cx.fillRect(42, 10, 12, 20);
      const tex = new T.CanvasTexture(cv);
      tex.mapping = T.EquirectangularReflectionMapping;
      tex.colorSpace = T.SRGBColorSpace;
      const pm = new T.PMREMGenerator(this.r);
      const env = pm.fromEquirectangular(tex).texture;
      pm.dispose();
      return env;
    }

    /* the only words drawn inside the scene, besides the two caption chips */
    chip(text, color, w) {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 256, 96);
      if (cx.roundRect) {
        cx.beginPath();
        cx.roundRect(8, 20, 240, 56, 28);
      } else {
        cx.beginPath();
        cx.rect(8, 20, 240, 56);
      }
      cx.fillStyle = 'rgba(7,13,21,.88)';
      cx.fill();
      cx.lineWidth = 4;
      cx.strokeStyle = color;
      cx.stroke();
      cx.font = '900 32px Nunito, system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillStyle = color;
      cx.letterSpacing = '3px';
      let size = 32;
      while (size > 16 && cx.measureText(text).width > 216) {
        size -= 2;
        cx.font = '900 ' + size + 'px Nunito, system-ui, sans-serif';
      }
      cx.fillText(text, 128, 49);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'label_chip';
      sp.renderOrder = 22;
      const ww = w || 0.075;
      sp.scale.set(ww, ww * 0.375, 1);
      return sp;
    }

    /* ---------------- apparatus scene ---------------- */
    buildApparatus() {
      const T = this.THREE;
      const s = new T.Scene();
      s.background = new T.Color(0x08131f);
      s.fog = new T.Fog(0x08131f, 1.0, 2.4);
      this.sA = s;

      /* warm afternoon light on the table, dark room behind it */
      s.add(new T.HemisphereLight(0xffd9a8, 0x0a1420, 0.5));
      const sun = new T.DirectionalLight(0xffd2a1, 2.4);
      sun.position.set(0.55, 0.95, 0.5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = sun.shadow.camera.bottom = -0.7;
      sun.shadow.camera.right = sun.shadow.camera.top = 0.7;
      s.add(sun);
      const warm = new T.PointLight(0xffb066, 1.0, 2.0);
      warm.position.set(0.15, 0.42, 0.32);
      s.add(warm);
      const rim = new T.PointLight(0x66ccff, 1.5, 2.2);
      rim.position.set(-0.6, 0.5, -0.45);
      s.add(rim);

      this.buildTable();
      this.rigs = { bottles: this.buildBottles(), design: this.buildDesign() };
      Object.values(this.rigs).forEach(g => s.add(g));
    }

    buildTable() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'picnic_table';
      for (let i = 0; i < 5; i++) {
        const plank = new T.Mesh(new T.BoxGeometry(0.74, 0.016, 0.074), i % 2 ? M.woodDark : M.wood);
        plank.name = 'table_plank';
        plank.position.set(0, -0.008, -0.16 + i * 0.08);
        plank.receiveShadow = true;
        plank.castShadow = true;
        g.add(plank);
      }
      for (const x of [-0.27, 0.27]) {
        const beam = new T.Mesh(new T.BoxGeometry(0.03, 0.02, 0.40), M.woodDark);
        beam.name = 'table_beam';
        beam.position.set(x, -0.026, 0);
        g.add(beam);
        for (const z of [-0.14, 0.14]) {
          const leg = new T.Mesh(new T.BoxGeometry(0.026, 0.20, 0.026), M.woodDark);
          leg.name = 'table_leg';
          leg.position.set(x, -0.13, z);
          g.add(leg);
        }
      }
      this.sA.add(g);
    }

    /* ---------- one bottle of iced water ---------- */
    makeBottle(name) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = name;
      const V = (x, y) => new T.Vector2(x, y);
      const body = new T.Mesh(new T.LatheGeometry([
        V(0, 0), V(0.030, 0), V(0.0325, 0.006), V(0.0325, 0.086),
        V(0.0300, 0.098), V(0.0180, 0.114), V(0.0165, 0.120), V(0.0165, 0.134), V(0.0130, 0.134)
      ], 44), M.bottle);
      body.name = 'bottle'; body.castShadow = true; g.add(body);

      const waterMat = new T.MeshStandardMaterial({ name: 'iced_water', color: 0x62c2f2, roughness: 0.15, transparent: true, opacity: 0.9, emissive: 0x0e2c40, emissiveIntensity: 0.4 });
      const water = new T.Mesh(new T.LatheGeometry([
        V(0, 0.005), V(0.0295, 0.005), V(0.0295, 0.078), V(0, 0.078)
      ], 44), waterMat);
      water.name = 'water'; g.add(water);

      const ice = new T.Group(); ice.name = 'ice_bits';
      const iceMat = new T.MeshStandardMaterial({ name: 'ice', color: 0xdff2ff, roughness: 0.2, transparent: true, opacity: 0.6 });
      for (let i = 0; i < 3; i++) {
        const c = new T.Mesh(new T.BoxGeometry(0.012, 0.012, 0.012), iceMat);
        c.name = 'ice_cube';
        c.position.set((Math.random() - 0.5) * 0.03, 0.02 + Math.random() * 0.045, (Math.random() - 0.5) * 0.03);
        c.rotation.set(Math.random(), Math.random(), Math.random());
        ice.add(c);
      }
      g.add(ice);

      const wraps = {};
      ['foil', 'cloth', 'foam', 'bubble', 'newspaper'].forEach(kind => {
        const m = new T.Mesh(new T.CylinderGeometry(0.0365, 0.0365, 0.086, 40, 1, true), M[kind]);
        m.name = 'wrap_' + kind;
        m.position.y = 0.045;
        m.visible = false;
        m.castShadow = true;
        g.add(m);
        wraps[kind] = m;
      });

      const lids = {};
      const plastic = new T.Mesh(new T.CylinderGeometry(0.019, 0.019, 0.014, 28), M.capPlastic);
      plastic.name = 'lid_plastic'; plastic.position.y = 0.138; plastic.visible = false; plastic.castShadow = true;
      g.add(plastic); lids.plastic = plastic;
      const foamLid = new T.Mesh(new T.CylinderGeometry(0.025, 0.023, 0.020, 30), M.foam);
      foamLid.name = 'lid_foam'; foamLid.position.y = 0.139; foamLid.visible = false; foamLid.castShadow = true;
      g.add(foamLid); lids.foam = foamLid;

      g.userData = { waterMat, water, ice, iceMat, wraps, lids };
      return g;
    }

    probe(dropTo, top) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const len = top - dropTo;
      const stem = new T.Mesh(new T.CylinderGeometry(0.0028, 0.0028, len, 12), M.steel);
      stem.name = 'probe_stem'; stem.position.y = dropTo + len / 2; g.add(stem);
      const tipMat = new T.MeshStandardMaterial({ name: 'probe_tip', color: 0x8fd4f7, emissive: 0x8fd4f7, emissiveIntensity: 0.6, roughness: 0.35 });
      const tip = new T.Mesh(new T.SphereGeometry(0.005, 16, 12), tipMat);
      tip.name = 'probe_tip'; tip.position.y = dropTo; g.add(tip);
      const collar = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, 0.014, 14), M.dark);
      collar.name = 'probe_collar'; collar.position.y = top; g.add(collar);
      g.userData.tipMat = tipMat;
      return g;
    }

    logger(rows) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'data_logger';
      const post = new T.Mesh(new T.CylinderGeometry(0.010, 0.014, 0.085, 18), M.dark);
      post.name = 'logger_post'; post.position.y = 0.042; g.add(post);
      const foot = new T.Mesh(new T.CylinderGeometry(0.034, 0.039, 0.008, 26), M.dark);
      foot.name = 'logger_foot'; foot.position.y = 0.004; foot.castShadow = true; g.add(foot);
      const box = new T.Mesh(new T.BoxGeometry(0.145, 0.088, 0.045), M.dark);
      box.name = 'logger_body'; box.position.y = 0.13; box.rotation.x = -0.3; box.castShadow = true; g.add(box);
      const cv = document.createElement('canvas');
      cv.width = 448; cv.height = 272;
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      g.userData = { cv, tex, rows };
      const screen = new T.Mesh(new T.PlaneGeometry(0.126, 0.0765),
        new T.MeshBasicMaterial({ name: 'logger_screen', map: tex, toneMapped: false }));
      screen.name = 'logger_screen'; screen.position.set(0, 0.1325, 0.0265); screen.rotation.x = -0.3;
      g.add(screen);
      const bezel = new T.Mesh(new T.BoxGeometry(0.145, 0.09, 0.004), M.steel);
      bezel.name = 'logger_bezel'; bezel.position.set(0, 0.13, 0.0235); bezel.rotation.x = -0.3;
      g.add(bezel);
      for (let i = 0; i < 2; i++) {
        const led = new T.Mesh(new T.SphereGeometry(0.0035, 12, 10),
          new T.MeshStandardMaterial({ color: i ? 0xffb627 : 0x66ccff, emissive: i ? 0xffb627 : 0x66ccff, emissiveIntensity: 1, roughness: 0.4 }));
        led.name = 'logger_led'; led.position.set(-0.055 + i * 0.11, 0.085, 0.03); g.add(led);
      }
      return g;
    }

    clock() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'wall_clock';
      const post = new T.Mesh(new T.CylinderGeometry(0.005, 0.008, 0.20, 14), M.dark);
      post.name = 'clock_post'; post.position.y = 0.1; g.add(post);
      const foot = new T.Mesh(new T.CylinderGeometry(0.028, 0.032, 0.007, 22), M.dark);
      foot.name = 'clock_foot'; foot.position.y = 0.0035; foot.castShadow = true; g.add(foot);
      const head = new T.Group(); head.name = 'clock_head'; head.position.y = 0.235; g.add(head);
      const face = new T.Mesh(new T.CylinderGeometry(0.046, 0.046, 0.008, 40), M.face);
      face.name = 'clock_face'; face.rotation.x = Math.PI / 2; face.castShadow = true; head.add(face);
      const rim = new T.Mesh(new T.TorusGeometry(0.046, 0.004, 10, 44), M.dark);
      rim.name = 'clock_rim'; head.add(rim);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const tick = new T.Mesh(new T.BoxGeometry(i % 3 ? 0.002 : 0.004, i % 3 ? 0.005 : 0.009, 0.002), M.dark);
        tick.name = 'clock_tick';
        tick.position.set(Math.sin(a) * 0.038, Math.cos(a) * 0.038, 0.005);
        tick.rotation.z = -a;
        head.add(tick);
      }
      const hand = (len, w, color) => {
        const h = new T.Group(); h.name = 'clock_hand';
        const m = new T.Mesh(new T.BoxGeometry(w, len, 0.002),
          new T.MeshStandardMaterial({ color, roughness: 0.5 }));
        m.position.y = len / 2;
        h.add(m);
        h.position.z = 0.006;
        head.add(h);
        return h;
      };
      const hourH = hand(0.020, 0.0045, 0x1b283a);
      const minH = hand(0.034, 0.003, 0xe8493f);
      const pin = new T.Mesh(new T.SphereGeometry(0.004, 12, 10), M.dark);
      pin.position.z = 0.008; head.add(pin);
      g.userData = { hourH, minH };
      return g;
    }

    arrowGroup(n, color) {
      const T = this.THREE, g = new T.Group();
      g.name = 'heat_motes';
      const shaftGeo = new T.CylinderGeometry(0.0024, 0.0024, 0.017, 10);
      const headGeo = new T.ConeGeometry(0.0068, 0.014, 14);
      const st = [];
      for (let i = 0; i < n; i++) {
        const mat = new T.MeshBasicMaterial({ name: 'heat_arrow', color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
        const matHead = new T.MeshBasicMaterial({ name: 'heat_arrow_head', color: 0xffd9b0, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
        const a = new T.Group(); a.name = 'heat_arrow'; a.renderOrder = 14;
        const shaft = new T.Mesh(shaftGeo, mat); shaft.name = 'arrow_shaft'; shaft.position.y = -0.005; shaft.renderOrder = 14; a.add(shaft);
        const head = new T.Mesh(headGeo, matHead); head.name = 'arrow_head'; head.position.y = 0.0105; head.renderOrder = 15; a.add(head);
        a.userData.mats = [mat, matHead];
        g.add(a);
        st.push({ k: Math.random(), sp: 0.7 + Math.random() * 0.5, j: [Math.random(), Math.random(), Math.random()] });
      }
      g.userData = { st };
      return g;
    }

    aimArrow(a, dir) {
      if (!this._up) this._up = new this.THREE.Vector3(0, 1, 0);
      a.quaternion.setFromUnitVectors(this._up, dir.normalize());
    }

    /* ---------- four bottles: the plan set-up and the test ---------- */
    buildBottles() {
      const T = this.THREE, g = new T.Group();
      g.name = 'rig_four_bottles';
      const bottles = BX.map((x, i) => {
        const b = this.makeBottle('bottle_' + i);
        b.position.set(x, 0, 0);
        g.add(b);
        return b;
      });
      const probes = BX.map((x, i) => {
        const p = this.probe(0.03, 0.175);
        p.position.set(x, 0, 0);
        p.name = 'probe_' + i;
        g.add(p);
        return p;
      });
      const log = this.logger(4);
      log.position.set(0.268, 0, 0.125);
      log.rotation.y = -0.45;
      log.scale.setScalar(0.78);
      g.add(log);

      const wires = BX.map(x => {
        const c = new T.CatmullRomCurve3([
          new T.Vector3(x, 0.182, 0),
          new T.Vector3(x * 0.4 + 0.13, 0.150, 0.07),
          new T.Vector3(0.235, 0.095, 0.12),
          new T.Vector3(0.256, 0.058, 0.135)
        ]);
        const m = new T.Mesh(new T.TubeGeometry(c, 34, 0.0016, 7, false), this.mats.wire);
        m.name = 'probe_wire';
        g.add(m);
        return m;
      });

      const cl = this.clock();
      cl.position.set(-0.29, 0, -0.16);
      cl.rotation.y = 0.4;
      g.add(cl);

      const motes = BX.map(x => {
        const m = this.arrowGroup(12, 0xff7a4e);
        g.add(m);
        return m;
      });

      const chips = ['NONE', 'FOIL', 'CLOTH', 'FOAM'].map((t, i) => {
        const c = this.chip(t, '#d6dee6', 0.068);
        c.position.set(BX[i], 0.205, 0);
        g.add(c);
        return c;
      });

      const tagClock = this.chip('CLOCK', '#9fb3c4', 0.062);
      tagClock.position.set(-0.29, 0.315, -0.16); g.add(tagClock);
      const tagProbe = this.chip('THERMOMETER', '#9fb3c4', 0.086);
      tagProbe.position.set(-0.262, 0.163, 0); g.add(tagProbe);
      const tagLog = this.chip('DATA LOGGER', '#9fb3c4', 0.086);
      tagLog.position.set(0.268, 0.215, 0.125); g.add(tagLog);

      g.userData = { bottles, probes, wires, log, clock: cl, motes, chips, tagClock, tagProbe, tagLog };
      return g;
    }

    /* ---------- one bottle plus a tray of materials ---------- */
    buildDesign() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_build_a_cooler';
      const bottle = this.makeBottle('cooler_bottle');
      bottle.position.set(-0.04, 0, -0.01);
      bottle.scale.setScalar(1.18);
      g.add(bottle);

      const pr = this.probe(0.03, 0.20);
      pr.position.set(-0.04, 0, -0.01);
      pr.scale.setScalar(1.18);
      g.add(pr);

      const tray = new T.Group();
      tray.name = 'material_tray';
      tray.position.set(0.165, 0, 0.135);
      tray.rotation.y = -0.3;
      const base = new T.Mesh(new T.BoxGeometry(0.205, 0.008, 0.062), M.dark);
      base.name = 'tray_base'; base.position.y = 0.004; base.receiveShadow = true; tray.add(base);
      const kinds = ['foil', 'cloth', 'foam', 'bubble', 'newspaper'];
      const swatches = {};
      kinds.forEach((k, i) => {
        const sw = new T.Group();
        sw.name = 'swatch_' + k;
        sw.position.set(-0.078 + i * 0.039, 0.012, 0);
        const tile = new T.Mesh(new T.BoxGeometry(0.032, 0.012, 0.046), M[k]);
        tile.name = 'swatch'; tile.castShadow = true; sw.add(tile);
        const glowMat = new T.MeshBasicMaterial({ color: 0x5ee07a, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
        const glow = new T.Mesh(new T.TorusGeometry(0.026, 0.0025, 8, 30), glowMat);
        glow.name = 'swatch_ring'; glow.rotation.x = Math.PI / 2; glow.position.y = -0.006; sw.add(glow);
        sw.userData = { glowMat };
        tray.add(sw);
        swatches[k] = sw;
      });
      g.add(tray);

      const cl = this.clock();
      cl.position.set(-0.27, 0, -0.15);
      cl.rotation.y = 0.4;
      g.add(cl);

      const log = this.logger(1);
      log.position.set(0.245, 0, -0.085);
      log.rotation.y = -0.5;
      log.scale.setScalar(0.8);
      g.add(log);

      const motes = this.arrowGroup(14, 0xff7a4e);
      g.add(motes);

      const tag = (text, w, x, y, z) => {
        const c = this.chip(text, '#9fb3c4', w);
        c.position.set(x, y, z);
        g.add(c);
        return c;
      };
      tag('CLOCK', 0.062, -0.225, 0.30, -0.15);
      tag('THERMOMETER', 0.086, 0.022, 0.252, -0.01);
      tag('BOTTLE', 0.066, -0.168, 0.13, -0.01);
      tag('MATERIALS', 0.078, 0.175, 0.085, 0.135);
      tag('DATA LOGGER', 0.086, 0.245, 0.182, -0.085);

      g.userData = { bottle, probe: pr, swatches, clock: cl, log, motes };
      return g;
    }

    /* ---------------- particle zoom: a slice through a wrapping ---------------- */
    buildParticles() {
      const T = this.THREE, s = new T.Scene();
      s.background = new T.Color(0x060f19);
      this.sP = s;
      s.add(new T.HemisphereLight(0xffe0bb, 0x0a1420, 0.95));
      const d = new T.DirectionalLight(0xffffff, 1.1); d.position.set(0.4, 0.8, 0.7); s.add(d);

      const NX = 7, NY = 3, NZ = 2, SP = 0.027;
      const geo = new T.SphereGeometry(0.0074, 16, 12);
      const mk = (y, name) => {
        const grp = new T.Group(); grp.name = name; grp.position.set(0, y, 0);
        const box = new T.LineSegments(
          new T.EdgesGeometry(new T.BoxGeometry(NX * SP + 0.016, NY * SP + 0.016, NZ * SP + 0.028)),
          new T.LineBasicMaterial({ color: 0x2b3f57 }));
        box.name = 'wrap_slice_box'; grp.add(box);
        const cols = [];
        for (let x = 0; x < NX; x++) {
          const mat = new T.MeshStandardMaterial({ name: name + '_particle', color: 0x4a90e2, emissive: 0x4a90e2, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.1 });
          const ms = [];
          for (let yy = 0; yy < NY; yy++) {
            for (let z = 0; z < NZ; z++) {
              const m = new T.Mesh(geo, mat);
              m.name = 'particle';
              m.userData.home = new T.Vector3((x - (NX - 1) / 2) * SP, (yy - (NY - 1) / 2) * SP, (z - (NZ - 1) / 2) * SP);
              m.userData.seed = Math.random() * 6.28;
              grp.add(m);
              ms.push(m);
            }
          }
          cols.push({ mat, ms });
        }
        grp.userData = { cols, box, nx: NX };
        s.add(grp);
        return grp;
      };
      this.pFoil = mk(0.295, 'foil_slice');
      this.pFoam = mk(0.105, 'foam_slice');

      const cf = this.chip('FOIL', '#d6dee6', 0.072); cf.position.set(0, 0.232, 0); s.add(cf);
      const cm = this.chip('FOAM', '#d6dee6', 0.072); cm.position.set(0, 0.042, 0); s.add(cm);
    }

    /* ---------------- interaction ---------------- */
    bindPointer() {
      const el = this.r.domElement;
      let drag = null;
      el.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.05, 1.15);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', () => { drag = null; });
      el.addEventListener('wheel', e => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.3, 2.2);
      }, { passive: false });
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    exp() {
      const e = this.cfg.experiment;
      return e === 'test' || e === 'design' ? e : 'plan';
    }

    view() {
      if (this.exp() !== 'test') return 'apparatus';
      return this.cfg.view || 'both';
    }

    planHas(tok) {
      return String(this.cfg.plan || '').split(',').map(x => x.trim()).indexOf(tok) >= 0;
    }

    /* ---------------- per-frame ---------------- */
    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const cfg = this.cfg, exp = this.exp(), view = this.view();

      this.rigs.bottles.visible = exp !== 'design';
      this.rigs.design.visible = exp === 'design';

      let readings;
      if (exp === 'design') {
        const d = design(cfg.time, cfg.build);
        this.updDesign(d, now, dt);
        readings = Object.assign({ experiment: 'design' }, d);
        if (d.temp >= TARGET - 0.0005 && !this.crossed) {
          this.crossed = true;
          window.dispatchEvent(new CustomEvent('cooler-crossed', { detail: { minutes: d.crossAt } }));
        }
      } else {
        const ph = physics(exp === 'plan' ? 0 : cfg.time);
        this.updBottles(ph, exp, now, dt);
        this.updSlices(ph, now, dt);
        readings = Object.assign({ experiment: exp }, ph);
      }

      const focus = exp === 'design' ? [0.09, 0.80] : [0.10, 0.92];
      if (this._lastExp !== exp) {
        this._lastExp = exp;
        this.cam.dist = focus[1];
        this.cam.el = 0.28;
        this.cam.az = 0.38;
      }
      const c = this.camA, cd = this.cam, ty = focus[0];
      const paneW = view === 'both' ? Math.round(this.vw * 0.62) : this.vw;
      const aspect = paneW / (this.vh || 1);
      const fit = aspect < 1.35 ? clamp(1.35 / Math.max(aspect, 0.4), 1, 1.75) : 1;
      const dist = cd.dist * fit;
      c.position.set(Math.sin(cd.az) * Math.cos(cd.el) * dist, ty + Math.sin(cd.el) * dist, Math.cos(cd.az) * Math.cos(cd.el) * dist);
      c.lookAt(0, ty, 0);
      this.pAngle += dt * 0.12;
      const sway = Math.sin(this.pAngle * 0.5) * 0.12;
      this.camP.position.set(Math.sin(sway) * 0.62, 0.30, Math.cos(sway) * 0.62);
      this.camP.lookAt(0, 0.20, 0);

      const r = this.r, w = this.vw, h = this.vh;
      r.setScissorTest(true);
      const draw = (scene, cam, x, ww) => {
        cam.aspect = ww / h; cam.updateProjectionMatrix();
        r.setViewport(x, 0, ww, h); r.setScissor(x, 0, ww, h);
        r.render(scene, cam);
      };
      if (view === 'particles') draw(this.sP, this.camP, 0, w);
      else if (view === 'both') {
        const wa = Math.round(w * 0.62);
        draw(this.sA, this.camA, 0, wa);
        draw(this.sP, this.camP, wa, w - wa);
      } else draw(this.sA, this.camA, 0, w);
      r.setScissorTest(false);

      const capA = this.caps.querySelector('[data-cap="a"]'), capP = this.caps.querySelector('[data-cap="p"]');
      capA.style.display = view === 'particles' ? 'none' : 'block';
      capP.style.display = view === 'apparatus' ? 'none' : 'block';
      const capF = this.caps.querySelector('[data-cap="frame"]');
      if (view === 'apparatus') capF.style.display = 'none';
      else {
        capF.style.display = 'block';
        capF.style.left = (view === 'both' ? Math.round(w * 0.62) + 6 : 8) + 'px';
      }

      if (now - this.emitAt > 0.09) {
        this.emitAt = now;
        window.dispatchEvent(new CustomEvent('cooler', { detail: readings }));
      }
    }

    /* heat motes drifting IN from the warm air towards a bottle */
    inArrows(arrows, cx, count, speed, big, dt, spread) {
      const T = this.THREE;
      const sp = spread || 1;
      arrows.userData.st.forEach((st, i) => {
        const a = arrows.children[i];
        if (i >= count) { a.visible = false; return; }
        a.visible = true;
        st.k += dt * st.sp * speed;
        if (st.k >= 1) { st.k -= 1; st.j = [Math.random(), Math.random(), Math.random()]; }
        const ang = st.j[0] * Math.PI * 2;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const rr = lerp(0.082 * sp, 0.042 * sp, st.k);
        a.position.set(cx + dx * rr, 0.020 + st.j[2] * 0.068 * sp, dz * rr);
        this.aimArrow(a, new T.Vector3(-dx, 0, -dz));
        const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
        a.userData.mats.forEach(m => { m.opacity = (0.3 + 0.6 * fade) * 0.92; });
        a.scale.setScalar(big * (0.85 + 0.28 * fade));
      });
    }

    setClock(cl, minutes) {
      const u = cl.userData;
      u.minH.rotation.z = -(minutes / 60) * Math.PI * 2;
      u.hourH.rotation.z = -(minutes / 720) * Math.PI * 2 - 1.05;
    }

    updBottles(ph, exp, now, dt) {
      const T = this.THREE, u = this.rigs.bottles.userData;
      const test = exp === 'test';
      const built = test || this.planHas('change');
      const wired = test || this.planHas('same');
      const timed = test || this.planHas('measure');
      const mWater = !test && this.planHas('mistake-water');
      const mMat = !test && this.planHas('mistake-material');
      const temps = [ph.none, ph.foil, ph.cloth, ph.foam];
      const counts = [10, 8, 4, 2], speeds = [0.85, 0.72, 0.32, 0.18], bigs = [1.0, 0.95, 0.8, 0.7];

      u.bottles.forEach((b, i) => {
        const on = i === 0 || built;
        b.visible = on;
        u.probes[i].visible = on && wired;
        u.wires[i].visible = on && wired;
        u.chips[i].visible = on && test;
        const temp = test ? temps[i] : START;
        const col = tempColor(T, temp);
        const bu = b.userData;
        bu.waterMat.color.copy(col);
        bu.waterMat.emissive.copy(col);
        bu.waterMat.emissiveIntensity = 0.22 + clamp((temp - 4) / 28, 0, 1) * 0.5;
        const fill = (mWater && i === 1) ? 1.3 : 1;
        bu.water.scale.y = lerp(bu.water.scale.y, fill, 0.2);
        bu.ice.visible = temp < 9;
        bu.iceMat.opacity = clamp((9 - temp) / 4, 0, 1) * 0.8;
        const wrapKind = test ? WRAPS[i] : (mMat ? 'foam' : null);
        Object.keys(bu.wraps).forEach(k => { bu.wraps[k].visible = (k === wrapKind); });
        if (u.probes[i].visible) {
          u.probes[i].userData.tipMat.color.copy(col);
          u.probes[i].userData.tipMat.emissive.copy(col);
        }
        const active = on;
        this.inArrows(u.motes[i], BX[i], active ? (test ? counts[i] : 6) : 0, test ? speeds[i] : 0.6, test ? bigs[i] : 0.92, dt);
      });

      u.log.visible = wired;
      u.clock.visible = timed;
      u.tagLog.visible = wired;
      u.tagProbe.visible = wired;
      u.tagClock.visible = timed;
      this.setClock(u.clock, test ? ph.t : 0);

      if (now - this.scrAt > 0.12) {
        this.scrAt = now;
        this.drawScreen(test ? temps : null, u.log);
      }
    }

    updDesign(d, now, dt) {
      const T = this.THREE, u = this.rigs.design.userData;
      const b = parseBuild(this.cfg.build);
      const bu = u.bottle.userData;
      const col = tempColor(T, d.temp);
      bu.waterMat.color.copy(col);
      bu.waterMat.emissive.copy(col);
      bu.waterMat.emissiveIntensity = 0.22 + clamp((d.temp - 4) / 28, 0, 1) * 0.5;
      bu.ice.visible = d.temp < 9;
      bu.iceMat.opacity = clamp((9 - d.temp) / 4, 0, 1) * 0.8;
      u.probe.userData.tipMat.color.copy(col);
      u.probe.userData.tipMat.emissive.copy(col);

      const grow = 1 + (b.layers - 1) * 0.16;
      Object.keys(bu.wraps).forEach(k => {
        const w = bu.wraps[k];
        w.visible = k === b.material;
        w.scale.set(grow, 1, grow);
      });
      Object.keys(bu.lids).forEach(k => { bu.lids[k].visible = (k === b.lid); });

      Object.keys(u.swatches).forEach(k => {
        const sw = u.swatches[k], on = k === b.material;
        sw.position.y = lerp(sw.position.y, on ? 0.026 : 0.012, 0.18);
        sw.userData.glowMat.opacity = lerp(sw.userData.glowMat.opacity, on ? 0.85 : 0, 0.18);
      });

      const k01 = clamp((d.k - 0.004) / 0.045, 0, 1);
      this.inArrows(u.motes, -0.04, Math.round(2 + k01 * 10), 0.2 + k01 * 0.8, 0.75 + k01 * 0.4, dt, 1.18);
      this.setClock(u.clock, d.t);

      const NAMES = { foil: 'FOIL', cloth: 'CLOTH', foam: 'FOAM', bubble: 'BUBBLE WRAP', newspaper: 'NEWSPAPER' };
      const LIDS = { none: 'NO LID', plastic: 'PLASTIC LID', foam: 'FOAM LID' };
      if (now - this.scrAt > 0.12) {
        this.scrAt = now;
        this.drawScreen([d.temp], u.log, {
          material: NAMES[b.material] || '',
          sub: b.layers + (b.layers > 1 ? ' LAYERS · ' : ' LAYER · ') + (LIDS[b.lid] || '')
        });
      }
    }

    /* heat crossing a slice of each wrapping: straight through foil, barely into foam */
    updSlices(ph, now, dt) {
      const T = this.THREE;
      const run = (grp, inside, decay, speed) => {
        const cols = grp.userData.cols, n = grp.userData.nx;
        cols.forEach((c, j) => {
          const jj = n - 1 - j;
          const att = Math.exp(-decay * jj);
          const temp = inside + (ROOM - inside) * att;
          const col = tempColor(T, temp);
          c.mat.color.copy(col);
          c.mat.emissive.copy(col);
          c.mat.emissiveIntensity = 0.18 + 0.4 * clamp((temp - 6) / 30, 0, 1);
          const wave = 0.6 + 0.4 * Math.sin(now * speed * 4 - jj * 1.15);
          const amp = (0.0014 + 0.0075 * clamp((temp - 4) / 30, 0, 1)) * wave;
          c.ms.forEach((m) => {
            const h = m.userData.home, sd = m.userData.seed, f = 7 + temp * 0.3;
            m.position.set(
              h.x + Math.sin(now * f + sd) * amp,
              h.y + Math.sin(now * f * 1.17 + sd * 2) * amp,
              h.z + Math.cos(now * f * 0.93 + sd) * amp
            );
          });
        });
      };
      run(this.pFoil, ph.foil, 0.12, 1.6);
      run(this.pFoam, ph.foam, 0.95, 0.45);
    }

    drawScreen(temps, log, meta) {
      const cv = log && log.userData && log.userData.cv;
      if (!cv) return;
      const cx = cv.getContext('2d'), W = 448, H = 272;
      cx.fillStyle = '#04070c'; cx.fillRect(0, 0, W, H);
      cx.strokeStyle = 'rgba(102,204,255,.22)'; cx.lineWidth = 4;
      cx.strokeRect(10, 10, W - 20, H - 20);
      const cols = ['#8a98a6', '#9ec6e8', '#ffb627', '#5ee07a'];
      const labels = ['NONE', 'FOIL', 'CLOTH', 'FOAM'];
      if (temps && temps.length === 1) {
        if (meta) {
          cx.textBaseline = 'alphabetic';
          cx.textAlign = 'left';
          cx.font = '900 40px Nunito, system-ui, sans-serif';
          cx.letterSpacing = '3px';
          cx.fillStyle = '#66ccff';
          cx.fillText(meta.material, 36, 68);
          cx.font = '800 24px Nunito, system-ui, sans-serif';
          cx.fillStyle = '#8a98a6';
          cx.fillText(meta.sub, 36, 104);
          cx.letterSpacing = '0px';
          cx.strokeStyle = 'rgba(255,255,255,.12)';
          cx.lineWidth = 3;
          cx.beginPath(); cx.moveTo(36, 124); cx.lineTo(W - 36, 124); cx.stroke();
        }
        cx.fillStyle = '#66ccff';
        cx.beginPath(); cx.arc(62, 196, 18, 0, Math.PI * 2); cx.fill();
        cx.font = '900 104px Nunito, system-ui, sans-serif';
        cx.textAlign = 'right';
        cx.textBaseline = 'middle';
        cx.fillStyle = '#ffffff';
        cx.fillText(Math.round(temps[0]) + '°', W - 36, 196);
      } else {
        for (let i = 0; i < 4; i++) {
          const y = 48 + i * 60;
          cx.fillStyle = cols[i];
          cx.beginPath(); cx.arc(44, y, 12, 0, Math.PI * 2); cx.fill();
          cx.textBaseline = 'middle';
          cx.font = '900 30px Nunito, system-ui, sans-serif';
          cx.textAlign = 'left';
          cx.letterSpacing = '3px';
          cx.fillStyle = cols[i];
          cx.fillText(temps ? labels[i] : '- - -', 68, y + 1);
          cx.letterSpacing = '0px';
          cx.font = '900 56px Nunito, system-ui, sans-serif';
          cx.textAlign = 'right';
          cx.fillStyle = '#ffffff';
          cx.fillText(temps ? Math.round(temps[i]) + '°' : '--', W - 32, y);
        }
      }
      log.userData.tex.needsUpdate = true;
    }
  }

  customElements.define('cooler-scene', CoolerScene);
})();
