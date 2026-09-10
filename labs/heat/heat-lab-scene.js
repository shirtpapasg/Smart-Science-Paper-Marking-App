/* <heat-lab-scene> — three.js apparatus + particle-zoom viewer for the
   heat / expansion & contraction lesson.
   Attributes: experiment (solid|liquid|gas|feel), view (apparatus|particles|both),
               target (target temperature °C), tool (hand|thermometer|gun),
               action (nonce string, e.g. "test:1723" runs the ball-and-ring test)
   Dispatches on window: "heatlab" {detail: physics}, "heatlab-touch" {detail:{block}} */
(() => {
  if (window.__heatLabScene) return;
  window.__heatLabScene = true;

  const T_ROOM = 30, ALPHA = 12e-6, D0 = 25.0, RING_MM = 25.05, EX = 80, R_BALL = 0.028;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;

  function physics(t) {
    const ballMm = D0 * (1 + ALPHA * (t - T_ROOM));
    const riseMm = 1.0444 * (t - T_ROOM);
    const ratio = (t + 273.15) / (T_ROOM + 273.15);
    const balloonMl = Math.max(0, 250 * ratio - 250);
    return {
      t, ballMm, ringMm: RING_MM, fits: ballMm < RING_MM, riseMm,
      balloonMl, balloonCm: balloonMl > 0 ? 2 * Math.cbrt((3 * balloonMl) / (4 * Math.PI)) : 0,
      suckMl: Math.max(0, 250 - 250 * ratio),
      spacingPct: ALPHA * (t - T_ROOM) * 100,
      energyPct: (ratio - 1) * 100
    };
  }

  class HeatLabScene extends HTMLElement {
    static get observedAttributes() { return ['experiment', 'view', 'target', 'tool', 'action', 'focus']; }

    constructor() {
      super();
      this.cfg = { experiment: 'solid', view: 'both', target: T_ROOM, tool: 'thermometer', action: '', focus: 'all' };
      this.camCX = 0;
      this.temp = T_ROOM;
      this.a = { ringX: 0.19, burnerX: -0.32, basinX: 0.34, ballY: 0.26, dye: 0 };
      this.test = null;
      this.burstT = 0;
      this.popped = false;
      this.fragT = -1;
      this.last = 0;
      this.emitAt = 0;
      this.ready = false;
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'target') {
        const p = parseFloat(v);
        const nt = clamp(isFinite(p) ? p : T_ROOM, 0, 260);
        if (this.cfg.experiment === 'gas' && nt < 20 && this.cfg.target >= 20 && !this.popped) this.fitT = 0;
        this.cfg.target = nt;
      }
      else if (n === 'action') {
        if (v && v !== this.cfg.action && this.ready) this.startTest();
        this.cfg.action = v || '';
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
        ball: new THREE.MeshStandardMaterial({ name: 'metal_ball', color: 0x8f9bab, metalness: 0.85, roughness: 0.3, emissive: 0xff4a10, emissiveIntensity: 0 }),
        dark: new THREE.MeshStandardMaterial({ name: 'matte_black', color: 0x1b283a, metalness: 0.2, roughness: 0.85 }),
        glass: new THREE.MeshStandardMaterial({ name: 'glass', color: 0xbcd8e8, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
        dye: new THREE.MeshStandardMaterial({ name: 'coloured_water', color: 0xe8493f, roughness: 0.3, emissive: 0x6e1a12, emissiveIntensity: 0.7 }),
        tubeGlass: new THREE.MeshStandardMaterial({ name: 'tube_glass', color: 0xdff1ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
        cool: new THREE.MeshStandardMaterial({ name: 'bath_water', color: 0x4a90e2, roughness: 0.15, transparent: true, opacity: 0.7 }),
        hot: new THREE.MeshStandardMaterial({ name: 'hot_water', color: 0xe86a3f, roughness: 0.15, transparent: true, opacity: 0.7 }),
        ice: new THREE.MeshStandardMaterial({ name: 'ice', color: 0xdff2ff, roughness: 0.2, transparent: true, opacity: 0.85 }),
        rubber: new THREE.MeshStandardMaterial({ name: 'balloon_rubber', color: 0xff5a5a, roughness: 0.75, metalness: 0 }),
        wood: new THREE.MeshStandardMaterial({ name: 'wood', color: 0xa9743f, roughness: 0.95 }),
        skin: new THREE.MeshStandardMaterial({ name: 'hand', color: 0xe0a97f, roughness: 0.8 }),
        flame: new THREE.MeshBasicMaterial({ name: 'flame', color: 0x9ed6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
        flameCore: new THREE.MeshBasicMaterial({ name: 'flame_core', color: 0x4a90e2, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      };

      this.buildApparatus();
      this.buildParticles();
      const env = this.makeEnv();
      this.sA.environment = env;
      this.sP.environment = env;
      this.sA.environmentIntensity = 0.55;
      this.sP.environmentIntensity = 0.7;

      this.cam = { az: 0.55, el: 0.22, dist: 0.8 };
      this.camA = new THREE.PerspectiveCamera(38, 1, 0.02, 12);
      this.camP = new THREE.PerspectiveCamera(40, 1, 0.02, 12);
      this.camP.position.set(0.32, 0.30, 0.42);
      this.camP.lookAt(0, 0.18, 0);
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

      this.rigs = {};
      this.rigs.solid = this.buildSolid();
      this.rigs.liquid = this.buildLiquid();
      this.rigs.gas = this.buildGas();
      this.rigs.feel = this.buildFeel();
      Object.values(this.rigs).forEach(g => s.add(g));
      this.isolateRigMaterials();
    }

    isolateRigMaterials() {
      Object.keys(this.rigs).forEach(k => {
        const map = new Map(), list = [];
        this.rigs[k].traverse(o => {
          if (!o.material) return;
          let c = map.get(o.material);
          if (!c) {
            c = o.material.clone();
            c.userData.baseOpacity = c.opacity;
            c.userData.baseTransparent = c.transparent;
            c.userData.baseDepthWrite = c.depthWrite;
            map.set(o.material, c); list.push(c);
          }
          o.material = c;
        });
        this.rigs[k].userData.mats = list;
      });
    }

    setRigDim(k, dim) {
      const list = this.rigs[k].userData.mats || [];
      this.rigs[k].userData.dimmed = dim;
      list.forEach(m => {
        const bo = m.userData.baseOpacity === undefined ? 1 : m.userData.baseOpacity;
        if (dim) { m.transparent = true; m.opacity = Math.min(bo, 0.7); m.depthWrite = m.userData.baseDepthWrite; }
        else { m.transparent = m.userData.baseTransparent; m.opacity = bo; m.depthWrite = m.userData.baseDepthWrite; }
      });
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

    burner() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const base = new T.Mesh(new T.CylinderGeometry(0.036, 0.042, 0.052, 32), M.dark);
      base.name = 'burner_base'; base.position.y = 0.026; base.castShadow = true; g.add(base);
      const collar = new T.Mesh(new T.CylinderGeometry(0.016, 0.02, 0.02, 24), M.steel);
      collar.name = 'burner_collar'; collar.position.y = 0.062; g.add(collar);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.011, 0.013, 0.12, 24), M.steel);
      barrel.name = 'burner_barrel'; barrel.position.y = 0.132; barrel.castShadow = true; g.add(barrel);
      const knob = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.014, 16), M.dark);
      knob.name = 'gas_tap'; knob.rotation.z = Math.PI / 2; knob.position.set(0.03, 0.058, 0); g.add(knob);
      const flame = new T.Group(); flame.name = 'flame'; flame.position.y = 0.192;
      const outer = new T.Mesh(new T.ConeGeometry(0.016, 0.098, 24, 1, true), M.flame);
      outer.name = 'flame_outer'; outer.position.y = 0.049; flame.add(outer);
      const core = new T.Mesh(new T.ConeGeometry(0.008, 0.05, 20, 1, true), M.flameCore);
      core.name = 'flame_core'; core.position.y = 0.025; flame.add(core);
      const light = new T.PointLight(0x8fd0ff, 3, 0.5); light.position.y = 0.05; flame.add(light);
      g.add(flame); g.userData.flame = flame;
      return g;
    }

    basin() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const wall = new T.Mesh(new T.CylinderGeometry(0.11, 0.085, 0.058, 48, 1, true), new T.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.5, side: T.DoubleSide }));
      wall.name = 'basin'; wall.position.y = 0.029; g.add(wall);
      const floor = new T.Mesh(new T.CircleGeometry(0.085, 48), new T.MeshStandardMaterial({ color: 0xc8d2da, roughness: 0.6 }));
      floor.name = 'basin_floor'; floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; g.add(floor);
      const water = new T.Mesh(new T.CircleGeometry(0.1, 48), M.cool);
      water.name = 'bath_water'; water.rotation.x = -Math.PI / 2; water.position.y = 0.046; g.add(water);
      const ice = new T.Group(); ice.name = 'ice_cubes';
      for (let i = 0; i < 12; i++) {
        const c = new T.Mesh(new T.BoxGeometry(0.019, 0.019, 0.019), M.ice);
        const a = (i / 12) * Math.PI * 2, rr = 0.04 + (i % 3) * 0.021;
        c.position.set(Math.cos(a) * rr, 0.048, Math.sin(a) * rr);
        c.rotation.set(Math.random(), Math.random(), Math.random());
        ice.add(c);
      }
      g.add(ice);
      g.userData.water = water; g.userData.ice = ice;
      return g;
    }

    flask(scale) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const pts = [];
      const prof = [[0.001, 0], [0.052, 0], [0.052, 0.006], [0.05, 0.012], [0.017, 0.115], [0.016, 0.13], [0.016, 0.165], [0.019, 0.168], [0.019, 0.175]];
      prof.forEach(p => pts.push(new T.Vector2(p[0] * scale, p[1] * scale)));
      const glass = new T.Mesh(new T.LatheGeometry(pts, 48), M.glass);
      glass.name = 'conical_flask'; g.add(glass);
      const inner = [];
      prof.forEach(p => inner.push(new T.Vector2(Math.max(0.0008, (p[0] - 0.0022)) * scale, (p[1] + 0.002) * scale)));
      g.userData.innerProfile = inner;
      return g;
    }

    buildSolid() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_ball_and_ring';

      const ballStand = this.stand(0.44); ballStand.position.set(0, 0, -0.15); g.add(ballStand);
      const arm = this.clampArm(0.15); arm.position.set(0, 0.40, -0.15); g.add(arm);
      const ball = new T.Mesh(new T.SphereGeometry(R_BALL, 48, 32), M.ball);
      ball.name = 'metal_ball'; ball.castShadow = true; g.add(ball);
      const chain = new T.Mesh(new T.CylinderGeometry(0.0018, 0.0018, 1, 8), M.steel);
      chain.name = 'chain'; g.add(chain);

      const ringGroup = new T.Group(); ringGroup.name = 'ring_assembly';
      const ringStand = this.stand(0.30); ringStand.position.set(0, 0, -0.15); ringGroup.add(ringStand);
      const ringArm = this.clampArm(0.135); ringArm.position.set(0, 0.16, -0.15); ringGroup.add(ringArm);
      const visInner = R_BALL * (1 + EX * (RING_MM / D0 - 1));
      const ring = new T.Mesh(new T.TorusGeometry(visInner + 0.005, 0.005, 20, 64), M.steel);
      ring.name = 'metal_ring'; ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; ring.castShadow = true;
      ringGroup.add(ring);
      g.add(ringGroup);

      const burner = this.burner(); g.add(burner);
      const basin = this.basin(); g.add(basin);

      g.userData = { ball, chain, arm, ringGroup, burner, basin, visInner };
      return g;
    }

    buildLiquid() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_water_in_tube';
      const basin = this.basin(); basin.scale.set(1.15, 1, 1.15); g.add(basin);

      const fl = this.flask(1); fl.position.y = 0.004; g.add(fl);
      const water = new T.Mesh(new T.LatheGeometry(fl.userData.innerProfile, 40), M.dye);
      water.name = 'coloured_water'; water.position.y = 0.004; g.add(water);

      const stopper = new T.Mesh(new T.CylinderGeometry(0.021, 0.019, 0.028, 24), M.dark);
      stopper.name = 'rubber_stopper'; stopper.position.y = 0.184; g.add(stopper);

      const tube = new T.Mesh(new T.CylinderGeometry(0.0062, 0.0062, 0.235, 24, 1, true), M.tubeGlass);
      tube.name = 'glass_tube'; tube.position.y = 0.30; g.add(tube);
      const col = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 1, 20), M.dye);
      col.name = 'water_column'; g.add(col);
      const mark = new T.Mesh(new T.TorusGeometry(0.0072, 0.0011, 8, 32), new T.MeshStandardMaterial({ name: 'marker_line', color: 0xffb627, emissive: 0xffb627, emissiveIntensity: 0.8, roughness: 0.4 }));
      mark.name = 'initial_mark'; mark.rotation.x = Math.PI / 2; mark.position.y = 0.245; g.add(mark);

      const steam = new T.Group(); steam.name = 'steam';
      for (let i = 0; i < 8; i++) {
        const p = new T.Mesh(new T.SphereGeometry(0.008, 12, 10), new T.MeshBasicMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.16, depthWrite: false }));
        p.position.set(-0.06 + (i % 4) * 0.04, 0.08 + (i % 3) * 0.05, 0.03 - (i % 2) * 0.06);
        steam.add(p);
      }
      g.add(steam);

      g.userData = { col, mark, basin, steam, markY: 0.245 };
      return g;
    }

    buildGas() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_balloon';
      const tri = new T.Group(); tri.name = 'tripod';
      for (let i = 0; i < 3; i++) {
        const leg = new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, 0.18, 12), M.steel);
        const a = (i / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.055, 0.09, Math.sin(a) * 0.055);
        leg.rotation.z = -Math.cos(a) * 0.13; leg.rotation.x = Math.sin(a) * 0.13;
        leg.name = 'tripod_leg'; leg.castShadow = true; tri.add(leg);
      }
      const hoop = new T.Mesh(new T.TorusGeometry(0.055, 0.0035, 10, 40), M.steel);
      hoop.name = 'tripod_ring'; hoop.rotation.x = Math.PI / 2; hoop.position.y = 0.178; tri.add(hoop);
      const gauze = new T.Mesh(new T.CylinderGeometry(0.062, 0.062, 0.003, 40), new T.MeshStandardMaterial({ name: 'wire_gauze', color: 0x8d99a6, roughness: 0.7, metalness: 0.5 }));
      gauze.name = 'wire_gauze'; gauze.position.y = 0.181; tri.add(gauze);
      g.add(tri);

      const fl = this.flask(1); fl.position.y = 0.183; g.add(fl);
      const neck = new T.Mesh(new T.CylinderGeometry(0.0205, 0.0205, 0.02, 24), M.rubber);
      neck.name = 'balloon_neck'; neck.position.y = 0.358; g.add(neck);
      const balloonProfile = [[0.20, 0], [0.23, 0.10], [0.42, 0.26], [0.72, 0.58], [0.94, 1.02], [1.0, 1.36], [0.90, 1.72], [0.62, 1.98], [0.28, 2.12], [0.07, 2.17]];
      const bpts = balloonProfile.map(p => new T.Vector2(p[0], p[1]));
      const balloon = new T.Mesh(new T.LatheGeometry(bpts, 48), M.rubber);
      balloon.name = 'balloon'; balloon.castShadow = true; g.add(balloon);
      const knot = new T.Mesh(new T.SphereGeometry(0.26, 16, 12), M.rubber);
      knot.name = 'balloon_knot'; knot.scale.set(1, 0.6, 1); balloon.add(knot);

      const frags = new T.Group(); frags.name = 'balloon_pieces'; frags.visible = false;
      for (let i = 0; i < 12; i++) {
        const p = new T.Mesh(new T.SphereGeometry(0.011, 12, 8), M.rubber);
        p.name = 'balloon_piece';
        p.scale.set(1, 0.35, 1.4);
        frags.add(p);
      }
      g.add(frags);

      const burner = this.burner(); g.add(burner);
      g.userData = { balloon, frags, burner, neckY: 0.366 };
      return g;
    }

    buildFeel() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_feel_vs_measure';
      const mk = (mat, x, name) => {
        const b = new T.Mesh(new T.BoxGeometry(0.075, 0.05, 0.055), mat);
        b.name = name; b.position.set(x, 0.025, 0); b.castShadow = true; b.receiveShadow = true;
        g.add(b); return b;
      };
      const metal = mk(new T.MeshStandardMaterial({ name: 'metal_block', color: 0x9aa7b4, metalness: 0.9, roughness: 0.3 }), -0.16, 'metal_block');
      const wood = mk(M.wood, -0.055, 'wooden_block');

      const beaker = new T.Group(); beaker.name = 'beaker'; beaker.position.set(0.06, 0, 0);
      const bwall = new T.Mesh(new T.CylinderGeometry(0.036, 0.034, 0.08, 40, 1, true), M.tubeGlass);
      bwall.name = 'beaker_glass'; bwall.position.y = 0.04; beaker.add(bwall);
      const bbase = new T.Mesh(new T.CircleGeometry(0.034, 40), M.tubeGlass);
      bbase.name = 'beaker_base'; bbase.rotation.x = -Math.PI / 2; bbase.position.y = 0.001; beaker.add(bbase);
      const bwater = new T.Mesh(new T.CylinderGeometry(0.0335, 0.0325, 0.052, 40), M.cool);
      bwater.name = 'water_in_beaker'; bwater.position.y = 0.027; beaker.add(bwater);
      g.add(beaker);

      const air = new T.Mesh(new T.SphereGeometry(0.03, 20, 14), new T.MeshBasicMaterial({ name: 'air_zone', color: 0x66ccff, transparent: true, opacity: 0.1, depthWrite: false }));
      air.name = 'the_air'; air.position.set(0.175, 0.11, 0); g.add(air);
      const airRing = new T.Mesh(new T.TorusGeometry(0.032, 0.0014, 8, 40), new T.MeshStandardMaterial({ name: 'air_ring', color: 0x66ccff, emissive: 0x66ccff, emissiveIntensity: 0.8, roughness: 0.4 }));
      airRing.name = 'air_marker'; airRing.rotation.x = Math.PI / 2; airRing.position.copy(air.position); g.add(airRing);

      const hand = new T.Group(); hand.name = 'hand';
      const palm = new T.Mesh(new T.SphereGeometry(0.035, 24, 18), M.skin);
      palm.scale.set(1, 0.5, 0.85); palm.name = 'palm'; hand.add(palm);
      for (let i = 0; i < 4; i++) {
        const f = new T.Mesh(new T.CapsuleGeometry(0.007, 0.03, 6, 10), M.skin);
        f.name = 'finger'; f.rotation.x = Math.PI / 2;
        f.position.set(-0.021 + i * 0.014, -0.004, 0.042); hand.add(f);
      }
      const thumb = new T.Mesh(new T.CapsuleGeometry(0.008, 0.024, 6, 10), M.skin);
      thumb.name = 'thumb'; thumb.rotation.z = Math.PI / 2; thumb.position.set(-0.038, -0.002, 0.012); hand.add(thumb);
      g.add(hand);

      const thermo = new T.Group(); thermo.name = 'thermometer';
      const stem = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.16, 20), M.glass);
      stem.name = 'thermometer_stem'; thermo.add(stem);
      const merc = new T.Mesh(new T.CylinderGeometry(0.0022, 0.0022, 0.1, 12), M.dye);
      merc.name = 'thermometer_liquid'; merc.position.y = -0.028; thermo.add(merc);
      const bulb = new T.Mesh(new T.SphereGeometry(0.0062, 20, 16), M.dye);
      bulb.name = 'thermometer_bulb'; bulb.position.y = -0.082; thermo.add(bulb);
      g.add(thermo);

      const gun = new T.Group(); gun.name = 'thermo_gun';
      const body = new T.Mesh(new T.BoxGeometry(0.052, 0.05, 0.09), new T.MeshStandardMaterial({ name: 'gun_shell', color: 0xffb627, roughness: 0.55 }));
      body.name = 'gun_body'; gun.add(body);
      const grip = new T.Mesh(new T.BoxGeometry(0.032, 0.062, 0.03), M.dark);
      grip.name = 'gun_grip'; grip.position.set(0, -0.05, -0.02); grip.rotation.x = -0.18; gun.add(grip);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.011, 0.014, 0.03, 20), M.dark);
      barrel.name = 'gun_barrel'; barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.058; gun.add(barrel);
      const screen = new T.Mesh(new T.BoxGeometry(0.03, 0.018, 0.002), new T.MeshStandardMaterial({ name: 'gun_display', color: 0x3fc35f, emissive: 0x3fc35f, emissiveIntensity: 0.7, roughness: 0.4 }));
      screen.name = 'gun_display'; screen.position.set(0, 0.006, -0.046); gun.add(screen);
      const beam = new T.Mesh(new T.CylinderGeometry(0.0012, 0.0012, 1, 8), new T.MeshBasicMaterial({ color: 0xe8493f, transparent: true, opacity: 0.7, depthWrite: false }));
      beam.name = 'laser'; gun.add(beam);
      gun.userData.beam = beam;
      g.add(gun);

      g.userData = {
        metal, wood, beaker, bwater, air, hand, thermo, gun, hover: null,
        targets: {
          metal: { x: -0.16, top: 0.05 },
          wood: { x: -0.055, top: 0.05 },
          water: { x: 0.06, top: 0.053 },
          air: { x: 0.175, top: 0.11 }
        }
      };
      return g;
    }

    /* ---------------- particle scene ---------------- */
    buildParticles() {
      const T = this.THREE, s = new T.Scene();
      s.background = new T.Color(0x060f19);
      this.sP = s;
      s.add(new T.HemisphereLight(0xbfe4ff, 0x0a1420, 0.9));
      const d = new T.DirectionalLight(0xffffff, 1.1); d.position.set(0.4, 0.8, 0.7); s.add(d);

      const box = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.28, 0.28, 0.28)),
        new T.LineBasicMaterial({ color: 0x2b3f57 }));
      box.name = 'zoom_box'; box.position.y = 0.18; s.add(box);
      this.pBox = box;

      const geo = new T.SphereGeometry(0.014, 20, 14);
      const mk = (color, n, name) => {
        const grp = new T.Group(); grp.name = name;
        const mat = new T.MeshStandardMaterial({ name: name + '_particle', color, roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: 0.18 });
        for (let i = 0; i < n; i++) {
          const m = new T.Mesh(geo, mat); m.name = 'particle'; grp.add(m);
        }
        grp.position.y = 0.18; s.add(grp); return grp;
      };
      this.pGroups = {
        solid: mk(0x66ccff, 64, 'solid_particles'),
        liquid: mk(0x4a90e2, 34, 'liquid_particles'),
        gas: mk(0xffb627, 22, 'gas_particles')
      };
      this.pState = { liquid: [], gas: [] };
      ['liquid', 'gas'].forEach(k => {
        this.pGroups[k].children.forEach(m => {
          const p = {
            p: new T.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2),
            v: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
          };
          this.pState[k].push(p); m.position.copy(p.p);
        });
      });
      this.pSeed = new Array(64).fill(0).map(() => Math.random() * Math.PI * 2);
    }

    /* ---------------- interaction ---------------- */
    bindPointer() {
      const el = this.r.domElement;
      let drag = null;
      el.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId);
        this._dragging = true;
        this._downAt = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.15, 1.15);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', e => {
        drag = null;
        this._dragging = false;
        const d = this._downAt;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) this.pick(e);
      });
      el.addEventListener('wheel', e => {
        e.preventDefault();
        this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.28, 1.8);
      }, { passive: false });
    }

    pick(e) {
      const T = this.THREE, rect = this.r.domElement.getBoundingClientRect();
      const w = this.cfg.view === 'both' ? Math.round(rect.width * 0.62) : rect.width;
      if (e.clientX - rect.left > w) return;
      const nd = new T.Vector2(((e.clientX - rect.left) / w) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new T.Raycaster(); ray.setFromCamera(nd, this.camA);

      if (this.cfg.experiment === 'all') {
        const keys = ['solid', 'liquid', 'gas', 'feel'];
        const hit = ray.intersectObjects(keys.map(k => this.rigs[k]), true)[0];
        if (!hit) return;
        let key = null;
        ['solid', 'liquid', 'gas', 'feel'].forEach(k => { let p = hit.object; while (p) { if (p === this.rigs[k]) key = k; p = p.parent; } });
        if (key) window.dispatchEvent(new CustomEvent('heatlab-focus', { detail: { key } }));
        return;
      }

      if (this.cfg.experiment !== 'feel') return;
      const u = this.rigs.feel.userData;
      const hit = ray.intersectObjects([u.metal, u.wood, u.bwater, u.air], false)[0];
      if (hit) {
        const n = hit.object.name;
        u.hover = n === 'metal_block' ? 'metal' : n === 'wooden_block' ? 'wood' : n === 'water_in_beaker' ? 'water' : 'air';
        window.dispatchEvent(new CustomEvent('heatlab-touch', { detail: { block: u.hover, tool: this.cfg.tool } }));
      }
    }

    startTest() {
      this.test = { t: 0, reported: false };
    }

    /* ---------------- per-frame ---------------- */
    resize() {
      if (!this.r) return;
      const w = this.clientWidth || 800, h = this.clientHeight || 500;
      this.r.setSize(w, h, false);
      this.vw = w; this.vh = h;
    }

    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const cfg = this.cfg, exp = cfg.experiment;

      this.temp = lerp(this.temp, cfg.target, 1 - Math.pow(exp === 'gas' ? 0.5 : 0.06, dt));
      if (Math.abs(this.temp - cfg.target) < 0.05) this.temp = cfg.target;
      const ph = physics(this.temp);

      const wrap = cfg.experiment === 'all';
      const LAYOUT = { solid: -0.55, liquid: -0.24, gas: 0.04, feel: 0.46 };
      const FOCUS_H = { solid: 0.22, liquid: 0.26, gas: 0.24, feel: 0.09 };
      Object.keys(this.rigs).forEach(k => {
        this.rigs[k].visible = wrap || k === exp;
        this.rigs[k].position.x = wrap ? LAYOUT[k] : 0;
      });
      if (wrap) {
        this.updSolid(ph, dt, now, true);
        this.updLiquid(ph, now);
        this.updGas(ph, now, dt);
        this.updFeel(now, true);
      } else {
        if (exp === 'solid') this.updSolid(ph, dt, now);
        if (exp === 'liquid') this.updLiquid(ph, now);
        if (exp === 'gas') this.updGas(ph, now, dt);
        if (exp === 'feel') this.updFeel(now);
      }
      this.updParticles(ph, exp, now, dt);

      // cameras
      const focus = { solid: [0, 0.20, 0.62], liquid: [0, 0.26, 0.8], gas: [0, 0.25, 0.8], feel: [0, 0.09, 0.66], all: [0, 0.20, 1.6] }[exp] || [0, 0.2, 0.8];
      if (this._lastExp !== exp) { this._lastExp = exp; this.cam.dist = focus[2]; if (wrap) this.cam.el = 0.22; }
      if (wrap) {
        const fk = cfg.focus && LAYOUT[cfg.focus] !== undefined ? cfg.focus : 'all';
        Object.keys(this.rigs).forEach(k => this.setRigDim(k, fk !== 'all' && k !== fk));
        const cx = fk === 'all' ? 0 : LAYOUT[fk];
        const wantDist = fk === 'all' ? 1.6 : (fk === 'feel' ? 0.7 : 0.62);
        const wantH = fk === 'all' ? 0.20 : FOCUS_H[fk];
        this.camCX = lerp(this.camCX, cx, 1 - Math.pow(0.02, dt));
        this.cam.dist = lerp(this.cam.dist, wantDist, 1 - Math.pow(0.02, dt));
        focus[1] = lerp(this._camH === undefined ? 0.2 : this._camH, wantH, 1 - Math.pow(0.02, dt));
        this._camH = focus[1];
        if (!this._dragging) this.cam.az += dt * 0.09;
      } else {
        this.camCX = lerp(this.camCX, 0, 1 - Math.pow(0.02, dt));
        this._camH = undefined;
        Object.keys(this.rigs).forEach(k => this.setRigDim(k, false));
      }
      const ty = focus[1];
      const c = this.camA, cd = this.cam;
      c.position.set(this.camCX + Math.sin(cd.az) * Math.cos(cd.el) * cd.dist, ty + Math.sin(cd.el) * cd.dist, Math.cos(cd.az) * Math.cos(cd.el) * cd.dist);
      c.lookAt(this.camCX, ty, 0);
      this.pAngle += dt * 0.12;
      this.camP.position.set(Math.sin(this.pAngle) * 0.44, 0.34, Math.cos(this.pAngle) * 0.44);
      this.camP.lookAt(0, 0.18, 0);

      // render (split when view=both)
      const r = this.r, w = this.vw, h = this.vh, view = cfg.view;
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
      capP.style.right = view === 'both' ? '14px' : '14px';

      if (now - this.emitAt > 0.09) {
        this.emitAt = now;
        window.dispatchEvent(new CustomEvent('heatlab', { detail: Object.assign({ testing: !!this.test, popped: this.popped, stress: clamp(this.burstT / 3, 0, 1) }, ph) }));
      }
    }

    updSolid(ph, dt, now, wrap) {
      const u = this.rigs.solid.userData, a = this.a, tgt = this.cfg.target;
      const heating = tgt > 110, icing = tgt < 20;
      const rBall = R_BALL * (1 + EX * (ph.ballMm / D0 - 1));
      u.ball.scale.setScalar(rBall / R_BALL);

      let ringX = 0.19, burnerX = -0.32, basinX = 0.34, ballY = 0.26;
      if (wrap) ringX = 0;
      if (this.test) {
        const t = this.test.t += dt;
        ringX = 0;
        const stopY = 0.16 + Math.sqrt(Math.max(0.000001, rBall * rBall - u.visInner * u.visInner));
        const downY = ph.fits ? 0.085 : stopY;
        if (t < 0.55) ballY = 0.26;
        else if (t < 2.0) ballY = lerp(0.26, downY, (t - 0.55) / 1.45);
        else if (t < 3.1) { ballY = downY; if (!this.test.reported) { this.test.reported = true; window.dispatchEvent(new CustomEvent('heatlab-test', { detail: { fits: ph.fits, t: ph.t, ballMm: ph.ballMm } })); } }
        else if (t < 4.0) ballY = lerp(downY, 0.26, (t - 3.1) / 0.9);
        else if (t > 4.6) this.test = null;
      } else {
        if (heating) burnerX = 0;
        else if (icing) {
          basinX = 0;
          const arrived = Math.abs(a.basinX) < 0.015;
          ballY = arrived ? 0.052 + Math.sin(now * 2.6) * 0.0035 : 0.26;
        }
      }
      a.ringX = lerp(a.ringX, ringX, 1 - Math.pow(0.02, dt));
      a.burnerX = lerp(a.burnerX, burnerX, 1 - Math.pow(0.03, dt));
      a.basinX = lerp(a.basinX, basinX, 1 - Math.pow(0.02, dt));
      a.ballY = lerp(a.ballY, ballY, 1 - Math.pow(0.06, dt));

      u.ringGroup.position.x = a.ringX;
      u.burner.position.x = a.burnerX;
      u.basin.position.x = a.basinX;
      u.ball.position.set(0, a.ballY, 0);
      const top = 0.395;
      u.chain.position.set(0, (top + a.ballY) / 2, 0);
      u.chain.scale.y = Math.max(0.001, top - a.ballY);

      const flame = u.burner.userData.flame;
      flame.visible = heating && !this.test && !wrap;
      u.burner.visible = !wrap;
      u.basin.visible = !wrap;
      if (flame.visible) flame.scale.setScalar(0.94 + Math.sin(now * 22) * 0.06);
      u.basin.userData.ice.visible = icing;
      if (icing) {
        const inBath = Math.abs(a.basinX) < 0.02;
        u.basin.userData.ice.children.forEach((c, i) => {
          c.position.y = 0.048 + (inBath ? Math.sin(now * 2.2 + i) * 0.004 : 0);
          c.rotation.y += dt * (inBath ? 0.5 : 0.1) * (i % 2 ? 1 : -1);
        });
        const w = u.basin.userData.water;
        w.position.y = 0.046 + (inBath ? Math.sin(now * 5) * 0.0012 : 0);
        w.scale.setScalar(inBath ? 1 + Math.sin(now * 5) * 0.006 : 1);
      }

      const hot = clamp((ph.t - 110) / 150, 0, 1);
      u.ball.material.emissiveIntensity = hot * 0.9;
      u.ball.material.color.setRGB(0.56 + hot * 0.35, 0.61 - hot * 0.2, 0.67 - hot * 0.35);
    }

    updLiquid(ph, now) {
      const u = this.rigs.liquid.userData, tgt = this.cfg.target;
      const hot = tgt > 45, icing = tgt < 20;
      const colMm = clamp(60 + ph.riseMm, 4, 228);
      const h = colMm * 0.001;
      const base = 0.185;
      u.col.scale.y = h;
      u.col.position.set(0, base + h / 2, 0);
      u.mark.position.y = base + 0.06;
      u.basin.userData.water.material.color.set(hot ? 0xe86a3f : 0x4a90e2);
      u.basin.userData.ice.visible = icing;
      u.steam.visible = hot;
      if (hot) u.steam.children.forEach((p, i) => {
        p.position.y = 0.06 + ((now * 0.06 + i * 0.09) % 0.22);
        p.material.opacity = 0.2 * (1 - ((now * 0.06 + i * 0.09) % 0.22) / 0.22);
      });
    }

    updGas(ph, now, dt) {
      const u = this.rigs.gas.userData, tgt = this.cfg.target;
      const b = u.balloon, frags = u.frags;
      const BURST_ML = 150;

      if (this.popped) {
        b.visible = false;
        frags.visible = true;
        this.fragT += dt;
        frags.children.forEach(p => {
          const v = p.userData.v;
          if (!v) return;
          p.position.addScaledVector(v, dt);
          v.y -= 2.4 * dt;
          p.rotation.x += dt * 4; p.rotation.z += dt * 3;
          if (p.position.y < 0.02) { p.position.y = 0.02; v.set(v.x * 0.4, Math.abs(v.y) * 0.25, v.z * 0.4); }
        });
        if (ph.balloonMl < 60) {
          this.popped = false; this.burstT = 0; this.fragT = -1;
          this.fitT = 0;
          frags.visible = false;
        }
      } else {
        b.visible = true;
        frags.visible = false;
        let fit = 1;
        if (this.fitT >= 0) {
          this.fitT += dt;
          const k = clamp(this.fitT / 0.9, 0, 1);
          fit = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
          fit *= 1 + Math.sin(k * Math.PI) * 0.18;
          if (k >= 1) this.fitT = -1;
        }
        if (ph.balloonMl > 0.5) {
          const strain = ph.balloonMl > BURST_ML ? 1 + Math.sin(now * 26) * 0.012 : 1;
          const r = Math.max(0.014, (ph.balloonCm / 2) * 0.01) * strain * fit;
          b.scale.set(r, r * 1.02, r);
          b.position.y = u.neckY;
          b.rotation.z = Math.sin(now * 1.5) * 0.03;
          b.rotation.x = Math.cos(now * 1.2) * 0.025;
        } else {
          const limp = (0.016 + ph.suckMl * 0.00003) * fit;
          b.scale.set(limp * 1.15, limp * 0.42, limp * 1.15);
          b.position.y = u.neckY;
          b.rotation.z = 0.22 + Math.sin(now * 1.1) * 0.02;
          b.rotation.x = 0;
        }
        if (ph.balloonMl > BURST_ML) {
          this.burstT += dt;
          if (this.burstT >= 3) {
            this.popped = true; this.fragT = 0;
            const r = Math.max(0.02, (ph.balloonCm / 2) * 0.01);
            frags.children.forEach((p, i) => {
              const a = (i / frags.children.length) * Math.PI * 2, el = 0.3 + Math.random() * 0.9;
              p.position.set(Math.cos(a) * r * 0.8, u.neckY + r * 1.3, Math.sin(a) * r * 0.8);
              p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
              p.userData.v = new this.THREE.Vector3(Math.cos(a) * 0.5, 0.35 + el * 0.35, Math.sin(a) * 0.5);
            });
            window.dispatchEvent(new CustomEvent('heatlab-burst', { detail: { t: ph.t } }));
          }
        } else {
          this.burstT = Math.max(0, this.burstT - dt * 0.6);
        }
      }

      const flame = u.burner.userData.flame;
      flame.visible = tgt > 45;
      if (flame.visible) flame.scale.setScalar(0.94 + Math.sin(now * 22) * 0.06);
    }

    updFeel(now, wrap) {
      const u = this.rigs.feel.userData, tool = this.cfg.tool;
      const key = u.hover;
      const tgt = u.targets[key] || { x: 0.0, top: 0.05 };
      const bob = Math.sin(now * 2.2) * 0.003;

      if (wrap) {
        const m = u.targets.metal, w = u.targets.water, wd = u.targets.wood;
        u.hand.visible = u.thermo.visible = u.gun.visible = true;
        u.hand.position.set(m.x, m.top + 0.032 + bob, -0.004);
        u.thermo.position.set(w.x, w.top + 0.062 + bob, 0);
        u.gun.position.set(wd.x, wd.top + 0.17 + bob, -0.23);
        if (!this._gunAim) this._gunAim = new this.THREE.Vector3();
        this._gunAim.set(wd.x, Math.max(0.02, wd.top - 0.006), 0);
        u.gun.lookAt(this._gunAim);
        const gbeam = u.gun.userData.beam;
        gbeam.visible = true;
        const glen = Math.max(0.04, u.gun.position.distanceTo(this._gunAim) - 0.075);
        gbeam.scale.y = glen; gbeam.rotation.x = Math.PI / 2; gbeam.position.set(0, -0.004, 0.07 + glen / 2);
        return;
      }

      u.hand.visible = tool === 'hand';
      u.thermo.visible = tool === 'thermometer';
      u.gun.visible = tool === 'gun';

      u.hand.position.set(tgt.x, tgt.top + 0.032 + bob, -0.004);
      const thermoY = key === 'water' ? tgt.top + 0.062 : key === 'air' ? 0.175 : tgt.top + 0.09;
      u.thermo.position.set(tgt.x, thermoY + bob, key === 'water' || key === 'air' ? 0 : 0.006);

      u.gun.position.set(tgt.x, tgt.top + 0.17 + bob, -0.23);
      if (!this._gunAim) this._gunAim = new this.THREE.Vector3();
      this._gunAim.set(tgt.x, Math.max(0.02, tgt.top - 0.006), 0);
      u.gun.lookAt(this._gunAim);
      const beam = u.gun.userData.beam;
      beam.visible = !!u.hover;
      if (u.hover) {
        const len = Math.max(0.04, u.gun.position.distanceTo(this._gunAim) - 0.075);
        beam.scale.y = len; beam.rotation.x = Math.PI / 2; beam.position.set(0, -0.004, 0.07 + len / 2);
      }
    }

    updParticles(ph, exp, now, dt) {
      const key = exp === 'liquid' ? 'liquid' : exp === 'gas' ? 'gas' : 'solid';
      Object.keys(this.pGroups).forEach(k => { this.pGroups[k].visible = k === key; });
      const heatK = clamp((ph.t - 0) / 260, 0, 1);
      const spread = 1 + EX * ALPHA * (ph.t - T_ROOM);
      if (key === 'solid') {
        const g = this.pGroups.solid, s = 0.052 * spread, amp = 0.0025 + heatK * 0.0085;
        let i = 0;
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
          const m = g.children[i], ph2 = this.pSeed[i], f = 6 + heatK * 22;
          m.position.set(
            (x - 1.5) * s + Math.sin(now * f + ph2) * amp,
            (y - 1.5) * s + Math.sin(now * f * 1.13 + ph2 * 2) * amp,
            (z - 1.5) * s + Math.cos(now * f * 0.91 + ph2) * amp
          );
          i++;
        }
      } else {
        const g = this.pGroups[key], st = this.pState[key];
        const lim = key === 'gas' ? 0.13 : 0.09;
        const sp = (key === 'gas' ? 0.11 : 0.035) * (0.35 + heatK * 1.5);
        g.children.forEach((m, i) => {
          const p = st[i];
          p.p.addScaledVector(p.v, sp * dt);
          ['x', 'y', 'z'].forEach(ax => {
            if (p.p[ax] > lim) { p.p[ax] = lim; p.v[ax] *= -1; }
            if (p.p[ax] < -lim) { p.p[ax] = -lim; p.v[ax] *= -1; }
          });
          m.position.copy(p.p);
          if (key === 'liquid') m.position.y += Math.sin(now * (4 + heatK * 14) + i) * 0.004;
        });
      }
      this.pBox.material.color.setHex(key === 'gas' ? 0x4a3a1a : key === 'liquid' ? 0x1e3a5c : 0x24485e);
    }
  }

  customElements.define('heat-lab-scene', HeatLabScene);
})();
