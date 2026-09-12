/* <potato-scene> — three.js bench for "what causes the temperature to change?"
   Attributes: experiment (camera|energy|flow), time (minutes 0–20),
               potato (°C at the start), water (°C at the start),
               view (normal|thermal|energy), lowered (yes|no), arrow (none|out|in)
   Dispatches on window: "potato" {detail: readings} about every 90 ms,
                         "potato-meet" once when the two readings come within 1 °C. */
(() => {
  if (window.__potatoScene) return;
  window.__potatoScene = true;

  const TMAX = 20, K = 0.3, TOTAL = 50, ROOM = 25, KR = 0.16;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);

  /* One pure model used by every step.
     Both objects relax exponentially towards a shared final temperature,
     weighted towards the water because there is more of it. When the bench is
     left alone, a second and slower loss pulls the pair towards the room. */
  function physics(tMin, potato0, water0, roomMin) {
    const p0 = clamp(isFinite(potato0) ? +potato0 : 80, 0, 100);
    const w0 = clamp(isFinite(water0) ? +water0 : 22, 0, 100);
    const t = clamp(isFinite(tMin) ? +tMin : 0, 0, TMAX);
    const rm = clamp(isFinite(roomMin) ? +roomMin : 0, 0, 600);
    const final = 0.3 * p0 + 0.7 * w0;
    const decay = Math.exp(-K * t);
    let potato = final + (p0 - final) * decay;
    let water = final + (w0 - final) * decay;
    if (rm > 0) {
      const rd = Math.exp(-KR * rm);
      potato = ROOM + (potato - ROOM) * rd;
      water = ROOM + (water - ROOM) * rd;
    }
    const gap = Math.abs(potato - water);
    /* energy: the dot total is fixed at 50, the split follows the two readings */
    const tot = 0.3 * potato + 0.7 * water;
    const share = tot > 0.01 ? clamp((0.3 * potato) / tot, 0, 1) : 0.3;
    const energyP = Math.round(TOTAL * share);
    return {
      t, potato, water, final, gap, done: gap <= 1,
      potato0: p0, water0: w0, total: TOTAL,
      room: ROOM, roomMin: rm, drifting: rm > 0.001,
      energyP, energyW: TOTAL - energyP,
      dir: p0 - w0 > 0.5 ? 'out' : (w0 - p0 > 0.5 ? 'in' : 'none')
    };
  }
  window.potatoPhysics = physics;

  /* red-orange for hot · amber in the middle · blue for cold */
  const STOPS = [[0, 0x2f6fd6], [20, 0x4a90e2], [45, 0xffb627], [90, 0xff5030]];
  const tempColor = (T3, t) => {
    const v = clamp(isFinite(t) ? t : 20, 0, 90);
    let i = 0;
    while (i < STOPS.length - 2 && v > STOPS[i + 1][0]) i++;
    const a = STOPS[i], b = STOPS[i + 1];
    const f = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
    return new T3.Color(a[1]).lerp(new T3.Color(b[1]), f);
  };

  const BASIN_R = 0.115, WATER_TOP = 0.059, POT_X = -0.03;
  const POT_UP = 0.175, POT_DOWN = 0.030;

  class PotatoScene extends HTMLElement {
    static get observedAttributes() {
      return ['experiment', 'time', 'potato', 'water', 'view', 'lowered', 'arrow', 'room'];
    }

    constructor() {
      super();
      this.cfg = { experiment: 'camera', time: 0, potato: 80, water: 22, view: 'normal', lowered: 'no', arrow: 'none', room: 0 };
      this.cam = { az: 0.42, el: 0.30, dist: 0.70 };
      this.last = 0;
      this.emitAt = 0;
      this.scrAt = 0;
      this.low = 0;
      this.met = false;
      this.dotsInit = false;
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'time') {
        const p = parseFloat(v);
        const nt = clamp(isFinite(p) ? p : 0, 0, TMAX);
        if (nt < this.cfg.time - 0.001) this.met = false;
        this.cfg.time = nt;
      } else if (n === 'potato' || n === 'water') {
        const p = parseFloat(v);
        if (isFinite(p)) { this.cfg[n] = p; this.met = false; }
      } else if (n === 'room') {
        const p = parseFloat(v);
        this.cfg.room = isFinite(p) ? Math.max(0, p) : 0;
      } else this.cfg[n] = v || this.cfg[n];
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
      r.toneMappingExposure = 1.25;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.r = r;

      const grain = this.grainTex();
      this.mats = {
        steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0x9aa7b4, metalness: 0.9, roughness: 0.32 }),
        dark: new THREE.MeshStandardMaterial({ name: 'matte_black', color: 0x1b283a, metalness: 0.2, roughness: 0.85 }),
        plastic: new THREE.MeshStandardMaterial({ name: 'clear_plastic', color: 0xcfe6f5, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
        wire: new THREE.MeshStandardMaterial({ name: 'probe_wire', color: 0x14202e, roughness: 0.7 }),
        skin: new THREE.MeshStandardMaterial({ name: 'potato_skin', color: 0xc08a4e, roughness: 0.92, metalness: 0, transparent: true, opacity: 1, bumpMap: grain, bumpScale: 0.4 }),
        water: new THREE.MeshStandardMaterial({ name: 'basin_water', color: 0x4a90e2, roughness: 0.14, metalness: 0, transparent: true, opacity: 0.52 })
      };

      this.build();
      const env = this.makeEnv();
      this.s.environment = env;
      this.s.environmentIntensity = 0.55;
      this.camA = new THREE.PerspectiveCamera(38, 1, 0.02, 12);

      this.bindPointer();
      new ResizeObserver(() => this.resize()).observe(this);
      this.resize();
      r.setAnimationLoop((ms) => this.frame(ms));
    }

    grainTex() {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#808080';
      cx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 3200; i++) {
        const v = Math.round(96 + Math.random() * 108);
        cx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        cx.fillRect(Math.random() * 128, Math.random() * 128, 2.6, 2.6);
      }
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(3, 3);
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
      cx.fillStyle = 'rgba(102,204,255,0.55)';
      cx.fillRect(6, 20, 16, 28);
      cx.fillStyle = 'rgba(255,255,255,0.75)';
      cx.fillRect(40, 10, 14, 22);
      const tex = new T.CanvasTexture(cv);
      tex.mapping = T.EquirectangularReflectionMapping;
      tex.colorSpace = T.SRGBColorSpace;
      const pm = new T.PMREMGenerator(this.r);
      const env = pm.fromEquirectangular(tex).texture;
      pm.dispose();
      return env;
    }

    /* a re-drawable caption chip: the labels follow the readings */
    chip(text, color, w) {
      const T = this.THREE;
      const cv = document.createElement('canvas');
      cv.width = 384; cv.height = 96;
      const cx = cv.getContext('2d');
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'label_chip';
      sp.renderOrder = 22;
      const ww = w || 0.118;
      sp.scale.set(ww, ww * 0.25, 1);
      sp.userData.draw = (t2, c2) => {
        cx.clearRect(0, 0, 384, 96);
        cx.beginPath();
        if (cx.roundRect) cx.roundRect(6, 20, 372, 56, 28);
        else cx.rect(6, 20, 372, 56);
        cx.fillStyle = 'rgba(7,13,21,.88)';
        cx.fill();
        cx.lineWidth = 4;
        cx.strokeStyle = c2;
        cx.stroke();
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillStyle = c2;
        cx.letterSpacing = '3px';
        let size = 34;
        cx.font = '900 ' + size + 'px Nunito, system-ui, sans-serif';
        while (cx.measureText(t2).width > 328 && size > 18) {
          size -= 2;
          cx.font = '900 ' + size + 'px Nunito, system-ui, sans-serif';
        }
        cx.fillText(t2, 192, 49);
        tex.needsUpdate = true;
        sp.userData.text = t2;
      };
      sp.userData.draw(text, color);
      return sp;
    }

    /* a lumpy potato, not an egg: low-frequency displacement on a sphere */
    potatoGeo() {
      const T = this.THREE;
      const geo = new T.SphereGeometry(0.034, 48, 34);
      const p = geo.attributes.position, v = new T.Vector3(), n = new T.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        n.copy(v).normalize();
        const d = 1
          + 0.15 * Math.sin(n.x * 3.1 + 1.3) * Math.cos(n.y * 2.4 + 0.4)
          + 0.10 * Math.sin(n.y * 4.4 + 0.7) * Math.cos(n.z * 3.2 + 1.1)
          + 0.07 * Math.sin(n.z * 5.7 + 2.2) * Math.cos(n.x * 4.3 + 0.9)
          + 0.05 * Math.sin(n.x * 7.3 + n.y * 6.1 + n.z * 5.2)
          + 0.07 * n.x;
        v.multiplyScalar(d);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      return geo;
    }

    /* ---------------- bench ---------------- */
    build() {
      const T = this.THREE, M = this.mats;
      const s = new T.Scene();
      s.background = new T.Color(0x08131f);
      s.fog = new T.Fog(0x08131f, 0.8, 2.1);
      this.s = s;

      s.add(new T.HemisphereLight(0x9fd0ff, 0x0a1420, 0.8));
      const d = new T.DirectionalLight(0xffffff, 2.6);
      d.position.set(0.5, 0.9, 0.6);
      d.castShadow = true;
      d.shadow.mapSize.set(1024, 1024);
      d.shadow.camera.left = d.shadow.camera.bottom = -0.7;
      d.shadow.camera.right = d.shadow.camera.top = 0.7;
      s.add(d);
      const rim = new T.PointLight(0x66ccff, 2.2, 2.2);
      rim.position.set(-0.55, 0.5, -0.4);
      s.add(rim);
      const fill = new T.DirectionalLight(0xbfe0ff, 0.9);
      fill.position.set(-0.6, 0.4, 0.5);
      s.add(fill);

      const bench = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 0.012, 64), new T.MeshStandardMaterial({ color: 0x091521, roughness: 1 }));
      bench.name = 'bench';
      bench.position.y = -0.006;
      bench.receiveShadow = true;
      s.add(bench);

      /* basin of water */
      const wall = new T.Mesh(new T.CylinderGeometry(BASIN_R, BASIN_R * 0.88, 0.078, 52, 1, true), M.plastic);
      wall.name = 'basin_wall'; wall.position.y = 0.039; s.add(wall);
      const rim2 = new T.Mesh(new T.TorusGeometry(BASIN_R, 0.0032, 10, 60), new T.MeshStandardMaterial({ name: 'basin_rim', color: 0x7fb6d8, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.7 }));
      rim2.name = 'basin_rim'; rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.078; s.add(rim2);
      const floor = new T.Mesh(new T.CylinderGeometry(BASIN_R * 0.88, BASIN_R * 0.88, 0.005, 52), M.plastic);
      floor.name = 'basin_floor'; floor.position.y = 0.0025; s.add(floor);
      const water = new T.Mesh(new T.CylinderGeometry(BASIN_R * 0.972, BASIN_R * 0.862, 0.056, 52), M.water);
      water.name = 'basin_water'; water.position.y = 0.031; water.renderOrder = 5; s.add(water);
      this.waterMesh = water;

      /* the potato */
      const pot = new T.Mesh(this.potatoGeo(), M.skin);
      pot.name = 'potato';
      pot.scale.set(1.16, 0.82, 0.94);
      pot.rotation.z = 0.22;
      pot.castShadow = true;
      pot.position.set(POT_X, POT_UP, 0);
      pot.renderOrder = 12;
      s.add(pot);
      this.pot = pot;

      /* tongs holding it above the basin */
      const tongs = new T.Group();
      tongs.name = 'tongs';
      for (let i = 0; i < 2; i++) {
        const arm = new T.Mesh(new T.BoxGeometry(0.0045, 0.072, 0.007), M.steel);
        arm.name = 'tong_arm';
        arm.position.set(i ? 0.026 : -0.026, 0.030, 0);
        arm.rotation.z = i ? -0.30 : 0.30;
        arm.castShadow = true;
        tongs.add(arm);
      }
      const hinge = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.026, 14), M.steel);
      hinge.name = 'tong_hinge'; hinge.rotation.z = Math.PI / 2; hinge.position.y = 0.066; tongs.add(hinge);
      const grip = new T.Mesh(new T.BoxGeometry(0.01, 0.052, 0.012), M.dark);
      grip.name = 'tong_grip'; grip.position.y = 0.096; tongs.add(grip);
      s.add(tongs);
      this.tongs = tongs;

      /* stand, two probes, logger, wires */
      const st = this.stand(0.30); st.position.set(0.02, 0, -0.185); s.add(st);
      this.probeP = this.probe(0xff6a5e); this.probeP.position.set(POT_X, 0, 0); this.probeP.name = 'probe_potato'; s.add(this.probeP);
      this.probeW = this.probe(0x4a90e2); this.probeW.position.set(0.076, 0, 0.018); this.probeW.name = 'probe_water'; s.add(this.probeW);
      this.setProbe(this.probeP, POT_UP);
      this.setProbe(this.probeW, 0.026);
      s.add(this.logger());
      s.add(this.wireCurve(POT_X), this.wireCurve(0.076));

      /* heat motes + energy dots + the big flow arrow */
      this.motes = this.arrowGroup(16, 0xff7a4e); s.add(this.motes);
      this.buildDots();
      this.buildFlowArrow();

      this.chipP = this.chip('POTATO', '#d6dee6'); this.chipP.position.set(POT_X, POT_UP + 0.058, 0); s.add(this.chipP);
      this.chipW = this.chip('WATER', '#d6dee6'); this.chipW.position.set(0.115, 0.13, 0.02); s.add(this.chipW);

      this.roomMotes = this.arrowGroup(9, 0xffb627); this.roomMotes.name = 'room_motes'; s.add(this.roomMotes);
      s.add(this.roomThermo());
    }

    stand(height) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'stand';
      const base = new T.Mesh(new T.BoxGeometry(0.15, 0.014, 0.11), M.dark);
      base.name = 'stand_base'; base.position.y = 0.007; base.castShadow = true; g.add(base);
      const rod = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, height, 16), M.steel);
      rod.name = 'stand_rod'; rod.position.y = height / 2; rod.castShadow = true; g.add(rod);
      const arm = new T.Mesh(new T.BoxGeometry(0.13, 0.008, 0.012), M.dark);
      arm.name = 'stand_arm'; arm.position.set(-0.03, 0.262, 0.05); g.add(arm);
      return g;
    }

    probe(color) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const stem = new T.Mesh(new T.CylinderGeometry(0.0032, 0.0032, 1, 14), M.steel);
      stem.name = 'probe_stem'; g.add(stem);
      const tipMat = new T.MeshStandardMaterial({ name: 'probe_tip', color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35 });
      const tip = new T.Mesh(new T.SphereGeometry(0.0058, 18, 14), tipMat);
      tip.name = 'probe_tip'; g.add(tip);
      const collar = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.016, 16), M.dark);
      collar.name = 'probe_collar'; collar.position.y = 0.245; g.add(collar);
      g.userData = { tipMat, stem, tip };
      return g;
    }

    setProbe(p, tipY) {
      const len = Math.max(0.01, 0.245 - tipY);
      p.userData.stem.scale.y = len;
      p.userData.stem.position.y = tipY + len / 2;
      p.userData.tip.position.y = tipY;
    }

    logger() {
      const T = this.THREE, M = this.mats;
      const g = new T.Group();
      g.name = 'data_logger';
      g.position.set(0.205, 0, 0.145);
      g.rotation.y = 0.24;
      g.scale.setScalar(0.76);
      const post = new T.Mesh(new T.CylinderGeometry(0.011, 0.015, 0.10, 20), M.dark);
      post.name = 'logger_post'; post.position.y = 0.05; g.add(post);
      const foot = new T.Mesh(new T.CylinderGeometry(0.038, 0.043, 0.009, 28), M.dark);
      foot.name = 'logger_foot'; foot.position.y = 0.0045; foot.castShadow = true; g.add(foot);
      const box = new T.Mesh(new T.BoxGeometry(0.152, 0.056, 0.05), M.dark);
      box.name = 'logger_body'; box.position.y = 0.132; box.rotation.x = -0.3; box.castShadow = true; g.add(box);
      const cv = document.createElement('canvas'); cv.width = 448; cv.height = 224;
      this.scrCv = cv;
      this.scrTex = new T.CanvasTexture(cv);
      this.scrTex.colorSpace = T.SRGBColorSpace;
      const screen = new T.Mesh(new T.PlaneGeometry(0.132, 0.066),
        new T.MeshBasicMaterial({ name: 'logger_screen', map: this.scrTex, toneMapped: false }));
      screen.name = 'logger_screen'; screen.position.set(0, 0.134, 0.0285); screen.rotation.x = -0.3; g.add(screen);
      const bezel = new T.Mesh(new T.BoxGeometry(0.152, 0.078, 0.004), M.steel);
      bezel.name = 'logger_bezel'; bezel.position.set(0, 0.132, 0.0255); bezel.rotation.x = -0.3; g.add(bezel);
      for (let i = 0; i < 2; i++) {
        const led = new T.Mesh(new T.SphereGeometry(0.004, 12, 10),
          new T.MeshStandardMaterial({ color: i ? 0x4a90e2 : 0xff6a5e, emissive: i ? 0x4a90e2 : 0xff6a5e, emissiveIntensity: 1, roughness: 0.4 }));
        led.name = 'logger_led'; led.position.set(-0.058 + i * 0.116, 0.101, 0.036); g.add(led);
      }
      return g;
    }

    wireCurve(fromX) {
      const T = this.THREE;
      const c = new T.CatmullRomCurve3([
        new T.Vector3(fromX, 0.256, 0),
        new T.Vector3(fromX * 0.4 + 0.09, 0.216, 0.05),
        new T.Vector3(0.182, 0.13, 0.115),
        new T.Vector3(0.2, 0.082, 0.14)
      ]);
      const m = new T.Mesh(new T.TubeGeometry(c, 40, 0.0022, 8, false), this.mats.wire);
      m.name = 'probe_wire';
      return m;
    }

    arrowGroup(n, color) {
      const T = this.THREE, g = new T.Group();
      g.name = 'heat_motes';
      const shaftGeo = new T.CylinderGeometry(0.0024, 0.0024, 0.017, 10);
      const headGeo = new T.ConeGeometry(0.0068, 0.014, 14);
      const st = [];
      for (let i = 0; i < n; i++) {
        const mat = new T.MeshBasicMaterial({ name: 'heat_mote', color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
        const matHead = new T.MeshBasicMaterial({ name: 'heat_mote_head', color: 0xffd9b0, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
        const a = new T.Group(); a.name = 'heat_mote'; a.renderOrder = 14;
        const shaft = new T.Mesh(shaftGeo, mat); shaft.name = 'mote_shaft'; shaft.position.y = -0.005; shaft.renderOrder = 14; a.add(shaft);
        const head = new T.Mesh(headGeo, matHead); head.name = 'mote_head'; head.position.y = 0.0105; head.renderOrder = 15; a.add(head);
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

    buildDots() {
      const T = this.THREE;
      const geo = new T.SphereGeometry(0.0044, 10, 8);
      const mat = new T.MeshBasicMaterial({ name: 'energy_dot', color: 0xffd45a, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false });
      const g = new T.Group(); g.name = 'energy_dots'; g.renderOrder = 20;
      this.dots = [];
      for (let i = 0; i < TOTAL; i++) {
        const m = new T.Mesh(geo, mat);
        m.name = 'energy_dot';
        m.renderOrder = 20;
        g.add(m);
        /* a home inside the potato and a home inside the water */
        const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.5) * 0.024;
        const ph = new T.Vector3(Math.cos(a) * rr * 1.1, (Math.random() - 0.5) * 0.03, Math.sin(a) * rr * 0.9);
        const a2 = Math.random() * Math.PI * 2, rr2 = 0.05 + Math.random() * 0.05;
        const wh = new T.Vector3(Math.cos(a2) * rr2, 0.012 + Math.random() * 0.036, Math.sin(a2) * rr2);
        this.dots.push({ m, ph, wh, u: 0, seed: Math.random() * 6.28 });
      }
      this.dotsGrp = g;
      this.s.add(g);
    }

    buildFlowArrow() {
      const T = this.THREE;
      const g = new T.Group();
      g.name = 'flow_arrow';
      const mat = new T.MeshBasicMaterial({ name: 'flow_arrow', color: 0xff8a3e, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
      const shaft = new T.Mesh(new T.CylinderGeometry(0.0075, 0.0075, 0.105, 16), mat);
      shaft.name = 'flow_shaft'; shaft.rotation.z = -Math.PI / 2; shaft.position.x = 0.048; shaft.renderOrder = 24; g.add(shaft);
      const head = new T.Mesh(new T.ConeGeometry(0.019, 0.036, 20), mat);
      head.name = 'flow_head'; head.rotation.z = -Math.PI / 2; head.position.x = 0.118; head.renderOrder = 24; g.add(head);
      g.position.set(POT_X + 0.012, 0.112, 0.045);
      g.visible = false;
      g.userData = { mat };
      this.flowArrow = g;
      this.s.add(g);
    }

    /* a wall thermometer standing behind the bench, fixed at the room temperature */
    roomThermo() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'room_thermometer';
      g.position.set(0, 0, -0.33);
      g.rotation.y = 0.12;
      const foot = new T.Mesh(new T.CylinderGeometry(0.03, 0.036, 0.008, 24), M.dark);
      foot.name = 'thermo_foot'; foot.position.y = 0.004; foot.castShadow = true; g.add(foot);
      const post = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.10, 14), M.steel);
      post.name = 'thermo_post'; post.position.y = 0.05; g.add(post);
      const plate = new T.Mesh(new T.BoxGeometry(0.09, 0.182, 0.006), M.dark);
      plate.name = 'thermo_plate'; plate.position.set(0, 0.19, 0); plate.castShadow = true; g.add(plate);

      const cv = document.createElement('canvas'); cv.width = 200; cv.height = 420;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, 200, 420);
      cx.fillStyle = '#0b1420';
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(4, 4, 192, 412, 18); cx.fill(); } else cx.fillRect(4, 4, 192, 412);
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = '#8a98a6'; cx.font = '900 26px Nunito, system-ui, sans-serif';
      cx.letterSpacing = '4px';
      cx.fillText('ROOM', 100, 34);
      cx.letterSpacing = '0px';
      const top = 62, bot = 300;
      cx.fillStyle = '#101d2c';
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(78, top, 44, bot - top + 26, 22); cx.fill(); }
      cx.strokeStyle = 'rgba(255,255,255,.32)'; cx.lineWidth = 2;
      cx.font = '800 16px Nunito, system-ui, sans-serif'; cx.textAlign = 'right';
      for (let v = 0; v <= 50; v += 10) {
        const y = bot - (v / 50) * (bot - top);
        cx.beginPath(); cx.moveTo(58, y); cx.lineTo(74, y); cx.stroke();
        cx.fillStyle = '#5a6775'; cx.fillText(String(v), 54, y);
      }
      const y25 = bot - (25 / 50) * (bot - top);
      cx.fillStyle = '#ff6a5e';
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(86, y25, 28, bot - y25 + 20, 14); cx.fill(); }
      cx.beginPath(); cx.arc(100, bot + 22, 26, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = '#ffb627'; cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(74, y25); cx.lineTo(126, y25); cx.stroke();
      cx.textAlign = 'center'; cx.fillStyle = '#ff6a5e';
      cx.font = '900 50px Nunito, system-ui, sans-serif';
      cx.fillText('25 \u00b0C', 100, 386);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const face = new T.Mesh(new T.PlaneGeometry(0.084, 0.176),
        new T.MeshBasicMaterial({ name: 'thermo_face', map: tex, transparent: true, toneMapped: false }));
      face.name = 'thermo_face'; face.position.set(0, 0.19, 0.005); g.add(face);

      const glowMat = new T.MeshBasicMaterial({ name: 'thermo_glow', color: 0xffb627, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
      const glow = new T.Mesh(new T.PlaneGeometry(0.116, 0.208), glowMat);
      glow.name = 'thermo_glow'; glow.position.set(0, 0.19, -0.005); g.add(glow);
      this.roomGlowMat = glowMat;
      return g;
    }

    /* heat leaving the bench for the room */
    runRoomMotes(now, dt) {
      this.roomMotes.userData.st.forEach((st, i) => {
        const a = this.roomMotes.children[i];
        a.visible = true;
        st.k += dt * st.sp * 0.42;
        if (st.k >= 1) { st.k -= 1; st.j = [Math.random(), Math.random(), Math.random()]; }
        const ang = st.j[0] * Math.PI * 2, rr = 0.02 + st.j[1] * 0.072;
        a.position.set(Math.cos(ang) * rr, 0.062 + st.k * 0.115, Math.sin(ang) * rr);
        a.quaternion.identity();
        const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
        a.userData.mats.forEach(m => { m.opacity = 0.32 + 0.55 * fade; });
        a.scale.setScalar(0.95 * (0.8 + 0.3 * fade));
      });
    }

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
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.3, 1.8);
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
      return e === 'energy' || e === 'flow' ? e : 'camera';
    }

    view() {
      const exp = this.exp();
      if (exp === 'energy') return 'energy';
      const v = this.cfg.view;
      return v === 'thermal' || v === 'energy' ? v : 'normal';
    }

    /* ---------------- per-frame ---------------- */
    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const T = this.THREE, cfg = this.cfg, exp = this.exp(), view = this.view();
      const ph = physics(exp === 'flow' ? 0 : cfg.time, cfg.potato, cfg.water, exp === 'flow' ? 0 : cfg.room);

      /* lower the potato into the basin */
      const wantLow = exp === 'flow' || exp === 'energy' || cfg.lowered === 'yes' ? 1 : 0;
      this.low = lerp(this.low, wantLow, 1 - Math.exp(-dt * 3.4));
      const e = smooth(clamp(this.low, 0, 1));
      const potY = lerp(POT_UP, POT_DOWN, e);
      this.pot.position.y = potY;
      this.pot.rotation.y = now * 0.05;
      this.tongs.position.set(POT_X, lerp(potY, 0.40, smooth(clamp((this.low - 0.35) / 0.65, 0, 1))), 0);
      this.tongs.visible = this.low < 0.97;
      const spread = 0.30 + smooth(clamp(this.low, 0, 1)) * 0.22;
      this.tongs.children[0].rotation.z = spread;
      this.tongs.children[1].rotation.z = -spread;
      this.setProbe(this.probeP, potY);
      this.chipP.position.set(POT_X, potY + 0.058, 0);

      /* paint by view */
      const hot = tempColor(T, ph.potato), cool = tempColor(T, ph.water);
      const sk = this.mats.skin, wm = this.mats.water;
      /* the painted views are a camera, not a lit object: unlit, untone-mapped,
         so the pixel on screen IS the temperature colour */
      const flat = view !== 'normal';
      if (this._flat !== flat) {
        this._flat = flat;
        sk.toneMapped = wm.toneMapped = !flat;
        sk.needsUpdate = wm.needsUpdate = true;
      }
      if (view === 'thermal') {
        sk.color.set(0x000000); sk.emissive.copy(hot); sk.emissiveIntensity = 1;
        sk.opacity = 1; sk.bumpScale = 0.06;
        wm.color.set(0x000000); wm.emissive.copy(cool); wm.emissiveIntensity = 1; wm.opacity = 0.62;
      } else if (view === 'energy') {
        sk.color.set(0x000000); sk.emissive.copy(hot); sk.emissiveIntensity = 0.55;
        sk.opacity = 0.4; sk.bumpScale = 0.06;
        wm.color.set(0x000000); wm.emissive.copy(cool); wm.emissiveIntensity = 0.4; wm.opacity = 0.26;
      } else {
        sk.color.set(0xc08a4e); sk.emissive.copy(hot); sk.emissiveIntensity = 0.12;
        sk.opacity = 1; sk.bumpScale = 0.4;
        wm.color.set(0x4a90e2); wm.emissive.set(0x0b2138); wm.emissiveIntensity = 0.3; wm.opacity = 0.52;
      }
      sk.depthWrite = view !== 'energy';
      /* the water never depth-occludes the potato sitting inside it */
      wm.depthWrite = false;
      this.probeP.userData.tipMat.color.copy(hot);
      this.probeP.userData.tipMat.emissive.copy(hot);
      this.probeW.userData.tipMat.color.copy(cool);
      this.probeW.userData.tipMat.emissive.copy(cool);

      /* the caption chips name each object by which one is hotter */
      const hotter = ph.potato - ph.water > 0.5 ? 'p' : (ph.water - ph.potato > 0.5 ? 'w' : 'e');
      if (this._hotter !== hotter) {
        this._hotter = hotter;
        if (hotter === 'p') { this.chipP.userData.draw('HOT POTATO', '#ff6a5e'); this.chipW.userData.draw('COLD WATER', '#66ccff'); }
        else if (hotter === 'w') { this.chipP.userData.draw('COLD POTATO', '#66ccff'); this.chipW.userData.draw('HOT WATER', '#ff6a5e'); }
        else { this.chipP.userData.draw('POTATO', '#d6dee6'); this.chipW.userData.draw('WATER', '#d6dee6'); }
      }

      /* left alone: the heat leaks away to the room */
      const drifting = ph.drifting && exp !== 'flow';
      this.roomGlowMat.opacity = drifting ? 0.14 + 0.2 * (0.5 + 0.5 * Math.sin(now * 3.2)) : 0;
      this.roomMotes.visible = drifting && view !== 'energy'
        && Math.abs(ph.potato - ROOM) + Math.abs(ph.water - ROOM) > 1.5;
      if (this.roomMotes.visible) this.runRoomMotes(now, dt);

      /* heat motes: thick at first, thinning as the readings close in, gone when they meet */
      this.motes.visible = view !== 'energy';
      if (this.motes.visible) this.runMotes(ph, potY, now, dt);

      /* energy dots */
      this.dotsGrp.visible = view === 'energy';
      if (this.dotsGrp.visible) this.runDots(ph, potY, now, dt);

      /* the big flow arrow on the which-way step */
      const arrow = exp === 'flow' ? (cfg.arrow === 'out' || cfg.arrow === 'in' ? cfg.arrow : 'none') : 'none';
      this.flowArrow.visible = arrow !== 'none';
      if (this.flowArrow.visible) {
        this.flowArrow.rotation.y = arrow === 'in' ? Math.PI : 0;
        this.flowArrow.position.x = POT_X + (arrow === 'in' ? 0.118 : 0.012);
        this.flowArrow.userData.mat.color.copy(arrow === 'out' ? hot : cool);
        this.flowArrow.userData.mat.opacity = 0.62 + 0.34 * (0.5 + 0.5 * Math.sin(now * 4.2));
      }

      if (now - this.scrAt > 0.12) { this.scrAt = now; this.drawScreen(ph); }

      /* camera */
      const cd = this.cam, ty = lerp(0.115, 0.072, e);
      const aspect = (this.vw || 800) / (this.vh || 500);
      const fit = aspect < 1.35 ? clamp(1.35 / Math.max(aspect, 0.4), 1, 1.7) : 1;
      const dist = cd.dist * fit;
      const c = this.camA;
      c.aspect = aspect;
      c.updateProjectionMatrix();
      c.position.set(Math.sin(cd.az) * Math.cos(cd.el) * dist, ty + Math.sin(cd.el) * dist, Math.cos(cd.az) * Math.cos(cd.el) * dist);
      c.lookAt(0, ty, 0);
      this.r.render(this.s, c);

      const readings = Object.assign({ experiment: exp, view, lowered: this.low > 0.5 }, ph);
      if (ph.gap <= 1 && cfg.time > 0.001 && exp !== 'flow' && !this.met) {
        this.met = true;
        window.dispatchEvent(new CustomEvent('potato-meet', { detail: readings }));
      }
      if (now - this.emitAt > 0.09) {
        this.emitAt = now;
        window.dispatchEvent(new CustomEvent('potato', { detail: readings }));
      }
    }

    runMotes(ph, potY, now, dt) {
      const T = this.THREE;
      const out = ph.dir !== 'in';
      const gap0 = Math.max(1, Math.abs(ph.potato0 - ph.water0));
      const strength = this.low > 0.6 && this.cfg.time > 0.001 && this.exp() !== 'flow'
        ? clamp(ph.gap / gap0, 0, 1) * clamp(gap0 / 20, 0.25, 1)
        : 0;
      this.motes.userData.st.forEach((st, i) => {
        const a = this.motes.children[i];
        if (strength < 0.03 || i / this.motes.children.length > strength + 0.12) { a.visible = false; return; }
        a.visible = true;
        st.k += dt * st.sp * (0.35 + strength * 0.75);
        if (st.k >= 1) { st.k -= 1; st.j = [Math.random(), Math.random(), Math.random()]; }
        const ang = st.j[0] * Math.PI * 2;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const k = out ? st.k : 1 - st.k;
        const rr = lerp(0.038, 0.104, k);
        a.position.set(POT_X + dx * rr, 0.012 + st.j[2] * 0.042, dz * rr);
        this.aimArrow(a, new T.Vector3(out ? dx : -dx, 0, out ? dz : -dz));
        const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
        a.userData.mats.forEach(m => { m.opacity = (0.4 + 0.6 * fade) * (0.4 + 0.6 * strength); });
        a.scale.setScalar(1.05 * (0.85 + 0.28 * fade));
      });
    }

    runDots(ph, potY, now, dt) {
      const nP = ph.energyP;
      const k = 1 - Math.exp(-dt * 3.2);
      this.dots.forEach((d, i) => {
        const target = i < nP ? 0 : 1;
        d.u = this.dotsInit ? lerp(d.u, target, k) : target;
        const u = smooth(clamp(d.u, 0, 1));
        const j = Math.sin(now * 2.6 + d.seed) * 0.0018;
        d.m.position.set(
          lerp(POT_X + d.ph.x, d.wh.x, u) + j,
          lerp(potY + d.ph.y, d.wh.y, u) + Math.sin(Math.PI * u) * 0.026 + j,
          lerp(d.ph.z, d.wh.z, u)
        );
        const pulse = 0.82 + 0.18 * Math.sin(now * 3.1 + d.seed * 2);
        d.m.scale.setScalar(pulse * (1 + Math.sin(Math.PI * u) * 0.55));
      });
      this.dotsInit = true;
    }

    drawScreen(ph) {
      const cv = this.scrCv, cx = cv.getContext('2d'), W = 448, H = 224;
      cx.fillStyle = '#04070c'; cx.fillRect(0, 0, W, H);
      cx.strokeStyle = 'rgba(102,204,255,.22)'; cx.lineWidth = 4;
      cx.strokeRect(10, 10, W - 20, H - 20);
      const row = (y, color, label, val) => {
        cx.fillStyle = color;
        cx.beginPath(); cx.arc(46, y, 14, 0, Math.PI * 2); cx.fill();
        cx.textBaseline = 'middle';
        cx.font = '900 30px Nunito, system-ui, sans-serif';
        cx.textAlign = 'left';
        cx.letterSpacing = '3px';
        cx.fillText(label, 72, y + 1);
        cx.letterSpacing = '0px';
        cx.font = '900 92px Nunito, system-ui, sans-serif';
        cx.textAlign = 'right';
        cx.fillText(Math.round(val) + '°', W - 32, y);
      };
      row(68, '#ff6a5e', 'POTATO', ph.potato);
      row(158, '#4a90e2', 'WATER', ph.water);
      cx.fillStyle = 'rgba(255,255,255,.12)';
      cx.fillRect(30, 112, W - 60, 3);
      this.scrTex.needsUpdate = true;
    }
  }

  customElements.define('potato-scene', PotatoScene);
})();
