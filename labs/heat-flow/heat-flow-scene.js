/* <heat-flow-scene> — three.js bench + particle-zoom viewer for the
   "heat on the move" lesson (heat flows from hotter to colder).
   Attributes: experiment (flow|source), time (minutes 0–30), swap (true|false),
               surround (5|25|180), view (apparatus|particles|both)
   Dispatches on window: "heatflow" {detail: readings} about every 90 ms,
                         "heatflow-meet" {detail: readings} once when the two readings meet. */
(() => {
  if (window.__heatFlowScene) return;
  window.__heatFlowScene = true;

  const ROOM = 25, CC = 1, CT = 4, RATE = 0.32, DRIFT = 0.004, MEET = 0.05, PIE = 60, TMAX = 30;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* one pure model for both readings: two bodies swapping heat (Newton's cooling
     both ways, tub 4× the cup's heat capacity) plus a weak leak to the room. */
  function physics(tMin, swap) {
    const c0 = swap ? 20 : 50, u0 = swap ? 50 : 20;
    const m0 = (CC * c0 + CT * u0) / (CC + CT);
    const d0 = c0 - u0;
    const t = clamp(isFinite(tMin) ? tMin : 0, 0, TMAX);
    const mean = ROOM + (m0 - ROOM) * Math.exp(-DRIFT * t);
    const diff = d0 * Math.exp(-RATE * t);
    const cup = mean + (CT / (CC + CT)) * diff;
    const tub = mean - (CC / (CC + CT)) * diff;
    return {
      t, cup, tub, diff, room: ROOM, start: { cup: c0, tub: u0 },
      flowing: Math.abs(diff) > MEET,
      dir: diff > MEET ? 1 : diff < -MEET ? -1 : 0,
      meetAt: Math.log(Math.abs(d0) / MEET) / RATE
    };
  }
  window.heatFlowPhysics = physics;

  const tempColor = (T3, t) => new T3.Color().lerpColors(
    new T3.Color(0x4a90e2), new T3.Color(0xff6a5e),
    Math.pow(clamp((t - 20) / 30, 0, 1), 1.8));

  class HeatFlowScene extends HTMLElement {
    static get observedAttributes() { return ['experiment', 'time', 'swap', 'surround', 'view', 'arrows']; }

    constructor() {
      super();
      this.cfg = { experiment: 'flow', time: 0, swap: false, surround: 25, view: 'both', arrows: 'on' };
      this.cam = { az: 0.55, el: 0.24, dist: 0.72 };
      this.met = false;
      this.last = 0;
      this.emitAt = 0;
      this.scrAt = 0;
      this.ready = false;
      this.encK = 0;
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'time') {
        const p = parseFloat(v);
        this.cfg.time = clamp(isFinite(p) ? p : 0, 0, TMAX);
      } else if (n === 'swap') {
        const nv = v === 'true' || v === '1' || v === '';
        if (nv !== this.cfg.swap) this.met = false;
        this.cfg.swap = nv;
      } else if (n === 'surround') {
        const p = parseFloat(v);
        this.cfg.surround = isFinite(p) ? p : 25;
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
        '<div data-cap="p" style="position:absolute;right:14px;bottom:12px;padding:5px 12px;border-radius:999px;background:rgba(7,13,21,.78);border:1px solid rgba(102,204,255,.35);color:#66ccff;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Particle zoom</div>';
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
      r.toneMappingExposure = 1.25;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.insertBefore(r.domElement, this.caps);
      this.r = r;

      this.mats = {
        steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0x9aa7b4, metalness: 0.9, roughness: 0.32 }),
        dark: new THREE.MeshStandardMaterial({ name: 'matte_black', color: 0x1b283a, metalness: 0.2, roughness: 0.85 }),
        plastic: new THREE.MeshStandardMaterial({ name: 'clear_plastic', color: 0xcfe6f5, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
        cupWall: new THREE.MeshStandardMaterial({ name: 'cup_plastic', color: 0xeef6fb, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
        wire: new THREE.MeshStandardMaterial({ name: 'probe_wire', color: 0x14202e, roughness: 0.7 }),
        plate: new THREE.MeshStandardMaterial({ name: 'plate', color: 0xe8eef3, roughness: 0.35 }),
        wood: new THREE.MeshStandardMaterial({ name: 'table_top', color: 0x6b4a2c, roughness: 0.92 })
      };

      this.buildApparatus();
      this.buildParticles();
      const env = this.makeEnv();
      this.sA.environment = env;
      this.sP.environment = env;
      this.sA.environmentIntensity = 0.55;
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

    /* ---------------- apparatus scene ---------------- */
    buildApparatus() {
      const T = this.THREE;
      const s = new T.Scene();
      s.background = new T.Color(0x08131f);
      s.fog = new T.Fog(0x08131f, 0.75, 1.9);
      this.sA = s;

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

      this.rigs = { flow: this.buildFlow(), source: this.buildSource() };
      s.add(this.rigs.flow);
      s.add(this.rigs.source);
    }

    stand(height) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const base = new T.Mesh(new T.BoxGeometry(0.15, 0.014, 0.11), M.dark);
      base.name = 'stand_base'; base.position.y = 0.007; base.castShadow = true; g.add(base);
      const rod = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, height, 16), M.steel);
      rod.name = 'stand_rod'; rod.position.y = height / 2; rod.castShadow = true; g.add(rod);
      return g;
    }

    clampArm(len) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const boss = new T.Mesh(new T.BoxGeometry(0.03, 0.026, 0.03), M.dark);
      boss.name = 'clamp'; g.add(boss);
      const arm = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, len, 12), M.steel);
      arm.name = 'clamp_arm'; arm.rotation.x = Math.PI / 2; arm.position.z = len / 2; arm.castShadow = true; g.add(arm);
      return g;
    }

    probe(color, dropTo) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const len = 0.235 - dropTo;
      const stem = new T.Mesh(new T.CylinderGeometry(0.0032, 0.0032, len, 14), M.steel);
      stem.name = 'probe_stem'; stem.position.y = dropTo + len / 2; g.add(stem);
      const tipMat = new T.MeshStandardMaterial({ name: 'probe_tip', color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35 });
      const tip = new T.Mesh(new T.SphereGeometry(0.0058, 18, 14), tipMat);
      tip.name = 'probe_tip'; tip.position.y = dropTo; g.add(tip);
      const collar = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.016, 16), M.dark);
      collar.name = 'probe_collar'; collar.position.y = 0.235; g.add(collar);
      g.userData.tipMat = tipMat;
      return g;
    }

    arrowGroup(n, color) {
      const T = this.THREE, g = new T.Group();
      g.name = 'heat_arrows';
      const shaftGeo = new T.CylinderGeometry(0.0032, 0.0032, 0.03, 10);
      const headGeo = new T.ConeGeometry(0.0092, 0.019, 14);
      const st = [];
      for (let i = 0; i < n; i++) {
        const mat = new T.MeshBasicMaterial({ name: 'heat_arrow', color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
        const matHead = new T.MeshBasicMaterial({ name: 'heat_arrow_head', color: 0xffb08a, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
        const a = new T.Group(); a.name = 'heat_arrow'; a.renderOrder = 12;
        const shaft = new T.Mesh(shaftGeo, mat); shaft.name = 'arrow_shaft'; shaft.position.y = -0.0075; shaft.renderOrder = 12; a.add(shaft);
        const head = new T.Mesh(headGeo, matHead); head.name = 'arrow_head'; head.position.y = 0.017; head.renderOrder = 13; a.add(head);
        a.userData.mat = mat;
        a.userData.mats = [mat, matHead];
        g.add(a);
        st.push({ k: Math.random(), sp: 0.5 + Math.random() * 0.5, j: [Math.random(), Math.random(), Math.random()], lift: 0.03 + Math.random() * 0.05 });
      }
      g.userData.st = st;
      return g;
    }

    aimArrow(a, dir) {
      if (!this._up) this._up = new this.THREE.Vector3(0, 1, 0);
      a.quaternion.setFromUnitVectors(this._up, dir.normalize());
    }

    buildFlow() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_cup_in_tub';
      const TW = 0.34, TD = 0.22, TH = 0.10;

      const tub = new T.Mesh(new T.BoxGeometry(TW, TH, TD), M.plastic);
      tub.name = 'plastic_tub'; tub.position.y = TH / 2; g.add(tub);
      const edges = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(TW, TH, TD)),
        new T.LineBasicMaterial({ color: 0x7fb6d8, transparent: true, opacity: 0.55 }));
      edges.name = 'tub_edges'; edges.position.y = TH / 2; g.add(edges);
      const tubFloor = new T.Mesh(new T.BoxGeometry(TW - 0.008, 0.005, TD - 0.008), M.plastic);
      tubFloor.name = 'tub_floor'; tubFloor.position.y = 0.0025; g.add(tubFloor);

      const tubWaterMat = new T.MeshStandardMaterial({ name: 'cool_water', color: 0x4a90e2, roughness: 0.16, transparent: true, opacity: 0.72 });
      const tubWater = new T.Mesh(new T.BoxGeometry(TW - 0.012, 0.062, TD - 0.012), tubWaterMat);
      tubWater.name = 'tub_water'; tubWater.position.y = 0.036; g.add(tubWater);

      const cup = new T.Group(); cup.name = 'small_cup'; cup.position.set(-0.088, 0.006, 0);
      const wall = new T.Mesh(new T.CylinderGeometry(0.045, 0.039, 0.086, 40, 1, true), M.cupWall);
      wall.name = 'cup_wall'; wall.position.y = 0.043; cup.add(wall);
      const cupBase = new T.Mesh(new T.CircleGeometry(0.039, 40), M.cupWall);
      cupBase.name = 'cup_base'; cupBase.rotation.x = -Math.PI / 2; cupBase.position.y = 0.001; cup.add(cupBase);
      const rim = new T.Mesh(new T.TorusGeometry(0.045, 0.0022, 10, 44), M.cupWall);
      rim.name = 'cup_rim'; rim.rotation.x = Math.PI / 2; rim.position.y = 0.086; cup.add(rim);
      const cupWaterMat = new T.MeshStandardMaterial({ name: 'hot_water', color: 0xff6a5e, roughness: 0.18, transparent: true, opacity: 0.92, emissive: 0x51150f, emissiveIntensity: 0.6 });
      const cupWater = new T.Mesh(new T.CylinderGeometry(0.0425, 0.0375, 0.066, 40), cupWaterMat);
      cupWater.name = 'cup_water'; cupWater.position.y = 0.035; cup.add(cupWater);
      g.add(cup);

      const st = this.stand(0.30); st.position.set(-0.02, 0, -0.175); g.add(st);
      const arm = this.clampArm(0.16); arm.position.set(-0.02, 0.245, -0.175); g.add(arm);

      const pCup = this.probe(0xff6a5e, 0.03); pCup.position.set(-0.088, 0, 0.0);
      pCup.name = 'probe_in_cup'; g.add(pCup);
      const pTub = this.probe(0x66ccff, 0.012); pTub.position.set(0.10, 0, 0.0);
      pTub.name = 'probe_in_tub'; g.add(pTub);

      const logger = new T.Group(); logger.name = 'data_logger'; logger.position.set(0.165, 0, -0.205);
      logger.rotation.y = -0.42;
      const post = new T.Mesh(new T.CylinderGeometry(0.009, 0.013, 0.082, 20), M.dark);
      post.name = 'logger_post'; post.position.y = 0.041; logger.add(post);
      const foot = new T.Mesh(new T.CylinderGeometry(0.032, 0.036, 0.008, 28), M.dark);
      foot.name = 'logger_foot'; foot.position.y = 0.004; foot.castShadow = true; logger.add(foot);
      const box = new T.Mesh(new T.BoxGeometry(0.108, 0.042, 0.078), M.dark);
      box.name = 'logger_body'; box.position.y = 0.103; box.castShadow = true; logger.add(box);
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 160;
      this.scrCv = cv;
      this.scrTex = new T.CanvasTexture(cv);
      this.scrTex.colorSpace = T.SRGBColorSpace;
      const screen = new T.Mesh(new T.PlaneGeometry(0.096, 0.05),
        new T.MeshBasicMaterial({ name: 'logger_screen', map: this.scrTex }));
      screen.name = 'logger_screen'; screen.position.set(0, 0.128, 0.008); screen.rotation.x = -Math.PI / 3.1;
      logger.add(screen);
      const bezel = new T.Mesh(new T.BoxGeometry(0.106, 0.004, 0.058), M.steel);
      bezel.name = 'logger_bezel'; bezel.position.set(0, 0.1255, 0.006); bezel.rotation.x = -Math.PI / 3.1 + Math.PI / 2;
      logger.add(bezel);
      for (let i = 0; i < 2; i++) {
        const led = new T.Mesh(new T.SphereGeometry(0.0035, 12, 10),
          new T.MeshStandardMaterial({ color: i ? 0x66ccff : 0xff6a5e, emissive: i ? 0x66ccff : 0xff6a5e, emissiveIntensity: 0.9, roughness: 0.4 }));
        led.name = 'logger_led'; led.position.set(-0.032 + i * 0.064, 0.093, 0.04); logger.add(led);
      }
      g.add(logger);

      const wireCurve = (from) => {
        const T3 = this.THREE;
        const c = new T3.CatmullRomCurve3([
          new T3.Vector3(from.x, 0.246, from.z),
          new T3.Vector3(from.x * 0.5 + 0.05, 0.20, -0.07),
          new T3.Vector3(0.15, 0.11, -0.16),
          new T3.Vector3(0.16, 0.075, -0.185)
        ]);
        const m = new T3.Mesh(new T3.TubeGeometry(c, 40, 0.0022, 8, false), this.mats.wire);
        m.name = 'probe_wire';
        return m;
      };
      g.add(wireCurve({ x: -0.088, z: 0 }));
      g.add(wireCurve({ x: 0.10, z: 0 }));

      const arrows = this.arrowGroup(14, 0xff7a4e); g.add(arrows);

      g.userData = { cup, cupWater, cupWaterMat, tubWater, tubWaterMat, pCup, pTub, arrows, logger };
      return g;
    }

    buildSource() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_pie_and_surroundings';

      const table = new T.Mesh(new T.BoxGeometry(0.52, 0.016, 0.36), M.wood);
      table.name = 'table_top'; table.position.y = 0.008; table.receiveShadow = true; g.add(table);

      const plate = new T.Mesh(new T.CylinderGeometry(0.105, 0.092, 0.009, 48), M.plate);
      plate.name = 'plate'; plate.position.y = 0.0205; plate.castShadow = true; plate.receiveShadow = true; g.add(plate);

      const pie = new T.Group(); pie.name = 'warm_pie'; pie.position.y = 0.025;
      const crustMat = new T.MeshStandardMaterial({ name: 'pie_crust', color: 0xd9a24a, roughness: 0.82, emissive: 0xff4a10, emissiveIntensity: 0.08 });
      const body = new T.Mesh(new T.CylinderGeometry(0.072, 0.062, 0.036, 44), crustMat);
      body.name = 'pie_base'; body.position.y = 0.018; body.castShadow = true; pie.add(body);
      const filling = new T.Mesh(new T.CylinderGeometry(0.066, 0.066, 0.006, 44),
        new T.MeshStandardMaterial({ name: 'pie_filling', color: 0x8e2f1c, roughness: 0.6 }));
      filling.name = 'pie_filling'; filling.position.y = 0.037; pie.add(filling);
      const crimp = new T.Mesh(new T.TorusGeometry(0.072, 0.009, 12, 48), crustMat);
      crimp.name = 'pie_crimp'; crimp.rotation.x = Math.PI / 2; crimp.position.y = 0.036; pie.add(crimp);
      for (let i = 0; i < 6; i++) {
        const s = new T.Mesh(new T.BoxGeometry(0.13, 0.006, 0.012), crustMat);
        s.name = 'pie_lattice';
        s.position.y = 0.042;
        s.rotation.y = i < 3 ? 0.4 : 1.97;
        s.position.x = ((i % 3) - 1) * 0.031 * Math.cos(0.4);
        s.position.z = -((i % 3) - 1) * 0.031 * (i < 3 ? Math.sin(0.4) : -0.35);
        s.scale.x = 1 - Math.abs((i % 3) - 1) * 0.28;
        pie.add(s);
      }
      g.add(pie);

      const shimmer = new T.Group(); shimmer.name = 'heat_shimmer';
      for (let i = 0; i < 9; i++) {
        const p = new T.Mesh(new T.SphereGeometry(0.011, 12, 10),
          new T.MeshBasicMaterial({ name: 'shimmer', color: 0xffd0b0, transparent: true, opacity: 0.12, depthWrite: false, fog: false }));
        p.name = 'shimmer_puff';
        shimmer.add(p);
      }
      g.add(shimmer);

      const enc = new T.Group(); enc.name = 'surroundings'; enc.visible = false;
      const encMat = new T.MeshStandardMaterial({ name: 'enclosure', color: 0xbfe4ff, roughness: 0.4, transparent: true, opacity: 0.18, side: T.DoubleSide });
      const EW = 0.46, EH = 0.30, ED = 0.36;
      const panel = (w, h, d, x, y, z, nm) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, d), encMat);
        m.name = nm; m.position.set(x, y, z); enc.add(m); return m;
      };
      panel(EW, 0.006, ED, 0, EH, 0, 'enclosure_top');
      panel(0.006, EH, ED, -EW / 2, EH / 2, 0, 'enclosure_left');
      panel(0.006, EH, ED, EW / 2, EH / 2, 0, 'enclosure_right');
      panel(EW, EH, 0.006, 0, EH / 2, -ED / 2, 'enclosure_back');
      const shelves = new T.Group(); shelves.name = 'shelves';
      for (let i = 0; i < 2; i++) {
        const sh = new T.Mesh(new T.BoxGeometry(EW - 0.02, 0.004, ED - 0.04), encMat);
        sh.name = 'shelf'; sh.position.set(0, 0.15 + i * 0.09, 0); shelves.add(sh);
      }
      enc.add(shelves);
      const coils = new T.Group(); coils.name = 'oven_coils';
      for (let i = 0; i < 2; i++) {
        const c = new T.Mesh(new T.TorusGeometry(0.07, 0.006, 10, 40),
          new T.MeshStandardMaterial({ name: 'oven_coil', color: 0xff5a2a, emissive: 0xff5a2a, emissiveIntensity: 1.4, roughness: 0.5 }));
        c.name = 'coil'; c.rotation.x = Math.PI / 2; c.position.set(0, i ? EH - 0.03 : 0.02, -0.06);
        c.scale.set(1.6, 1, 1);
        coils.add(c);
      }
      enc.add(coils);
      const encLight = new T.PointLight(0xff7a3a, 0, 0.9);
      encLight.position.set(0, 0.16, 0); enc.add(encLight);
      g.add(enc);

      const arrows = this.arrowGroup(10, 0xff7a4e); g.add(arrows);
      g.userData = { pie, shimmer, enc, encMat, encLight, shelves, coils, arrows, crustMat };
      return g;
    }

    /* ---------------- particle zoom ---------------- */
    buildParticles() {
      const T = this.THREE, s = new T.Scene();
      s.background = new T.Color(0x060f19);
      this.sP = s;
      s.add(new T.HemisphereLight(0xbfe4ff, 0x0a1420, 0.9));
      const d = new T.DirectionalLight(0xffffff, 1.1); d.position.set(0.4, 0.8, 0.7); s.add(d);

      const mkBox = (y, col) => {
        const b = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.15, 0.15, 0.15)),
          new T.LineBasicMaterial({ color: col }));
        b.name = 'zoom_box'; b.position.set(0, y, 0); s.add(b); return b;
      };
      this.pBoxCup = mkBox(0.295, 0x5c3140);
      this.pBoxTub = mkBox(0.105, 0x1e3a5c);

      const geo = new T.SphereGeometry(0.0105, 18, 12);
      const mk = (y, n, color, name) => {
        const grp = new T.Group(); grp.name = name;
        const mat = new T.MeshStandardMaterial({ name: name + '_particle', color, roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: 0.22 });
        const st = [];
        for (let i = 0; i < n; i++) {
          const m = new T.Mesh(geo, mat); m.name = 'particle'; grp.add(m);
          st.push({
            p: new T.Vector3((Math.random() - 0.5) * 0.11, (Math.random() - 0.5) * 0.11, (Math.random() - 0.5) * 0.11),
            v: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
          });
        }
        grp.position.set(0, y, 0);
        grp.userData = { st, mat };
        this.sP.add(grp);
        return grp;
      };
      this.pCupG = mk(0.295, 14, 0xff6a5e, 'cup_particles');
      this.pTubG = mk(0.105, 20, 0x4a90e2, 'tub_particles');
    }

    /* ---------------- interaction ---------------- */
    bindPointer() {
      const el = this.r.domElement;
      let drag = null;
      el.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
        this._dragging = true;
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.05, 1.15);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', () => { drag = null; this._dragging = false; });
      el.addEventListener('wheel', e => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.28, 1.8);
      }, { passive: false });
    }

    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    /* ---------------- per-frame ---------------- */
    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const cfg = this.cfg, exp = cfg.experiment === 'source' ? 'source' : 'flow';
      const view = exp === 'source' ? 'apparatus' : cfg.view;

      const ph = physics(cfg.time, cfg.swap);
      this.rigs.flow.visible = exp === 'flow';
      this.rigs.source.visible = exp === 'source';

      let readings;
      if (exp === 'flow') {
        this.updFlow(ph, now, dt);
        readings = Object.assign({ experiment: 'flow', swap: cfg.swap }, ph);
        if (!ph.flowing && !this.met) {
          this.met = true;
          window.dispatchEvent(new CustomEvent('heatflow-meet', { detail: readings }));
        } else if (ph.flowing && cfg.time < ph.meetAt - 0.4) this.met = false;
      } else {
        readings = this.updSource(now, dt);
      }

      if (exp === 'flow') this.updParticles(ph, now, dt);

      const focus = exp === 'flow' ? [0, 0.115, 0.92] : [0, 0.13, 0.78];
      if (this._lastExp !== exp) {
        this._lastExp = exp;
        this.cam.dist = focus[2];
        this.cam.el = 0.26;
        this.cam.az = 0.55;
      }
      const c = this.camA, cd = this.cam, ty = focus[1];
      c.position.set(Math.sin(cd.az) * Math.cos(cd.el) * cd.dist, ty + Math.sin(cd.el) * cd.dist, Math.cos(cd.az) * Math.cos(cd.el) * cd.dist);
      c.lookAt(0, ty, 0);
      this.pAngle += dt * 0.12;
      const sway = Math.sin(this.pAngle * 0.5) * 0.14;
      this.camP.position.set(Math.sin(sway) * 0.74, 0.28, Math.cos(sway) * 0.74);
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

      if (now - this.emitAt > 0.09) {
        this.emitAt = now;
        window.dispatchEvent(new CustomEvent('heatflow', { detail: readings }));
      }
    }

    flowArrows(u, ph, now, dt) {
      const T = this.THREE;
      const strength = this.cfg.arrows === 'off' ? 0 : clamp(Math.abs(ph.diff) / 26, 0, 1);
      const hotIsCup = ph.diff > 0;
      /* energy spreads through the water on every side of the hot object: outwards
         from the cup in all directions, or inwards from all sides when swapped */
      const cx = -0.088, cz = 0, r0 = 0.05;
      const n = u.arrows.children.length;
      u.arrows.userData.st.forEach((st, i) => {
        const arw = u.arrows.children[i];
        if (strength < 0.015) { arw.visible = false; return; }
        arw.visible = true;
        st.k += dt * st.sp * (0.1 + strength * 0.26);
        if (st.k >= 1) {
          st.k -= 1;
          st.j = [Math.random(), Math.random(), Math.random()];
        }
        const a = (i / n) * Math.PI * 2 + (st.j[0] - 0.5) * 0.4;
        const dx = Math.cos(a), dz = Math.sin(a);
        const tx = (dx > 0 ? 0.235 : 0.072) / Math.max(Math.abs(dx), 0.001);
        const tz = 0.094 / Math.max(Math.abs(dz), 0.001);
        const r1 = clamp(Math.min(tx, tz), r0 + 0.036, 0.2);
        const k = hotIsCup ? st.k : 1 - st.k;
        const rr = lerp(r0, r1, k);
        arw.position.set(cx + dx * rr, 0.022 + st.j[2] * 0.03, cz + dz * rr);
        this.aimArrow(arw, new T.Vector3(hotIsCup ? dx : -dx, 0, hotIsCup ? dz : -dz));
        const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
        const op = 0.35 + 0.65 * fade * strength;
        arw.userData.mats.forEach(m => { m.opacity = op; });
        arw.scale.setScalar(0.78 + 0.42 * fade);
      });
    }

    updFlow(ph, now, dt) {
      const T = this.THREE, u = this.rigs.flow.userData;
      u.cupWaterMat.color.copy(tempColor(T, ph.cup));
      u.cupWaterMat.emissiveIntensity = 0.25 + clamp((ph.cup - 25) / 30, 0, 1) * 0.7;
      u.tubWaterMat.color.copy(tempColor(T, ph.tub));
      u.pCup.userData.tipMat.color.copy(tempColor(T, ph.cup));
      u.pCup.userData.tipMat.emissive.copy(tempColor(T, ph.cup));
      u.pTub.userData.tipMat.color.copy(tempColor(T, ph.tub));
      u.pTub.userData.tipMat.emissive.copy(tempColor(T, ph.tub));

      const wob = 0;
      u.cupWater.position.y = 0.035;
      u.tubWater.position.y = 0.036;

      this.flowArrows(u, ph, now, dt);

      if (now - this.scrAt > 0.12) {
        this.scrAt = now;
        this.drawScreen(ph);
      }
    }

    updSource(now, dt) {
      const T = this.THREE, u = this.rigs.source.userData, sur = this.cfg.surround;
      const diff = PIE - sur;
      const outward = diff > 0;
      const strength = this.cfg.arrows === 'off' ? 0 : clamp(Math.abs(diff) / 60, 0, 1);

      const inOven = sur > 100, inFridge = sur < 15;
      u.enc.visible = inOven || inFridge;
      this.encK = lerp(this.encK, inOven ? 1 : 0, 1 - Math.pow(0.02, dt));
      if (u.enc.visible) {
        u.encMat.color.lerpColors(new T.Color(0xbfe4ff), new T.Color(0x3a2318), this.encK);
        u.encMat.opacity = lerp(0.18, 0.62, this.encK);
        u.shelves.visible = inFridge;
        u.coils.visible = inOven;
        u.encLight.intensity = inOven ? 2.6 + Math.sin(now * 5) * 0.25 : 0;
        u.encLight.color.set(inOven ? 0xff7a3a : 0x9fd8ff);
        u.coils.children.forEach((c, i) => {
          c.material.emissiveIntensity = 1.1 + Math.sin(now * 3 + i) * 0.35;
        });
      } else u.encLight.intensity = 0;

      u.crustMat.emissive = u.crustMat.emissive || new T.Color(0x000000);
      u.crustMat.emissive.setHex(0xff4a10);
      u.crustMat.emissiveIntensity = outward ? 0.05 + strength * 0.1 : 0.16 + strength * 0.22;

      u.shimmer.visible = Math.abs(diff) > 2;
      if (u.shimmer.visible) {
        u.shimmer.children.forEach((p, i) => {
          const k = ((now * (0.1 + strength * 0.12) + i * 0.11) % 0.24) / 0.24;
          const ring = 0.02 + (i % 3) * 0.022;
          const a = (i / 9) * Math.PI * 2;
          p.position.set(
            Math.cos(a) * ring,
            outward ? 0.07 + k * 0.16 : 0.24 - k * 0.16,
            Math.sin(a) * ring
          );
          p.material.opacity = 0.16 * Math.sin(k * Math.PI) * (0.3 + strength);
          p.scale.setScalar(0.7 + k * 0.8);
        });
      }

      u.arrows.userData.st.forEach((st, i) => {
        const arw = u.arrows.children[i];
        if (strength < 0.02) { arw.visible = false; return; }
        arw.visible = true;
        st.k += dt * st.sp * (0.1 + strength * 0.26);
        if (st.k >= 1) { st.k -= 1; st.j = [Math.random(), Math.random(), Math.random()]; }
        const a = (i / u.arrows.children.length) * Math.PI * 2 + st.j[0] * 0.4;
        const el = 0.25 + st.j[1] * 0.85;
        const k = outward ? st.k : 1 - st.k;
        const rr = lerp(0.06, 0.19, k);
        arw.position.set(Math.cos(a) * rr, 0.05 + Math.sin(el) * rr * 0.8, Math.sin(a) * rr);
        const radial = new T.Vector3(Math.cos(a), Math.sin(el) * 0.8, Math.sin(a));
        this.aimArrow(arw, outward ? radial : radial.negate());
        const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
        const op = 0.2 + 0.8 * fade * strength;
        arw.userData.mats.forEach(m => { m.opacity = op; });
        arw.scale.setScalar(0.75 + 0.4 * fade);
      });

      return {
        experiment: 'source', pie: PIE, surround: sur, diff,
        flowing: Math.abs(diff) > 1, dir: diff > 1 ? 1 : diff < -1 ? -1 : 0,
        source: diff > 1
      };
    }

    updParticles(ph, now, dt) {
      const T = this.THREE;
      const run = (grp, temp, box) => {
        const st = grp.userData.st;
        const col = tempColor(T, temp);
        grp.userData.mat.color.copy(col);
        grp.userData.mat.emissive.copy(col);
        box.material.color.copy(col).multiplyScalar(0.28);
        const sp = 0.018 + clamp((temp - 15) / 40, 0, 1) * 0.16;
        const lim = 0.062;
        grp.children.forEach((m, i) => {
          const p = st[i];
          p.p.addScaledVector(p.v, sp * dt);
          ['x', 'y', 'z'].forEach(ax => {
            if (p.p[ax] > lim) { p.p[ax] = lim; p.v[ax] *= -1; }
            if (p.p[ax] < -lim) { p.p[ax] = -lim; p.v[ax] *= -1; }
          });
          m.position.copy(p.p);
          m.position.y += Math.sin(now * (3 + sp * 40) + i) * 0.004;
        });
      };
      run(this.pCupG, ph.cup, this.pBoxCup);
      run(this.pTubG, ph.tub, this.pBoxTub);
    }

    drawScreen(ph) {
      const cv = this.scrCv, cx = cv.getContext('2d');
      cx.fillStyle = '#04070c'; cx.fillRect(0, 0, 320, 160);
      cx.strokeStyle = 'rgba(102,204,255,.18)'; cx.lineWidth = 2;
      cx.strokeRect(8, 8, 304, 144);
      const row = (y, color, val) => {
        cx.fillStyle = color;
        cx.beginPath(); cx.arc(38, y, 11, 0, Math.PI * 2); cx.fill();
        cx.font = '900 54px Nunito, system-ui, sans-serif';
        cx.textAlign = 'right'; cx.textBaseline = 'middle';
        cx.fillText(val.toFixed(1) + '°', 286, y);
      };
      row(52, '#ff6a5e', ph.cup);
      row(112, '#66ccff', ph.tub);
      cx.fillStyle = 'rgba(255,255,255,.1)';
      cx.fillRect(20, 80, 280, 2);
      this.scrTex.needsUpdate = true;
    }
  }

  customElements.define('heat-flow-scene', HeatFlowScene);
})();
