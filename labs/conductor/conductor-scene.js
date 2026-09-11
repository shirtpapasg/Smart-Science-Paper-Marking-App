/* <conductor-scene> — three.js bench + particle-zoom viewer for the
   "good and poor conductors" lesson.
   Attributes: experiment (hot|cold|ice), time (minutes 0–15),
               view (apparatus|particles|both)
   Dispatches on window: "conductor" {detail: readings} about every 90 ms,
                         "conductor-melted" once when the first ice cube is gone. */
(() => {
  if (window.__conductorScene) return;
  window.__conductorScene = true;

  const TUB = 25, ROOM = 30, HOT0 = 60, COLD0 = 6, TMAX = 15;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* Newton's cooling towards the tub water, one rate per cup wall.
     hot:  60 → 32 (metal) / 52 (foam) by 15 min
     cold:  6 → 22 (metal) / 12 (foam) by 15 min */
  const RATE = {
    hot: { metal: Math.log(35 / 7) / 15, foam: Math.log(35 / 27) / 15 },
    cold: { metal: Math.log(19 / 3) / 15, foam: Math.log(19 / 13) / 15 }
  };
  const MELT = { metal: 3, foam: 15 };

  /* one pure model used by both the hot and the cold step */
  /* start = the water in the cups at 0 min, tub = the water around them; both
     may be set from the page (sliders). Without them the defaults apply. */
  function physics(tMin, mode, start0, tub0) {
    const cold = mode === 'cold';
    const k = cold ? RATE.cold : RATE.hot;
    const s0 = parseFloat(start0), b0 = parseFloat(tub0);
    const start = isFinite(s0) ? clamp(s0, 0, 100) : (cold ? COLD0 : HOT0);
    const tub = isFinite(b0) ? clamp(b0, 0, 100) : TUB;
    const t = clamp(isFinite(tMin) ? tMin : 0, 0, TMAX);
    const d0 = start - tub;
    const metal = tub + d0 * Math.exp(-k.metal * t);
    const foam = tub + d0 * Math.exp(-k.foam * t);
    return {
      t, mode: cold ? 'cold' : 'hot', tub, start, metal, foam,
      gap: Math.abs(metal - foam), dir: cold ? 1 : -1
    };
  }

  function melted(tMin) {
    const t = clamp(isFinite(tMin) ? tMin : 0, 0, TMAX);
    return {
      t, room: ROOM,
      metal: clamp(t / MELT.metal, 0, 1),
      foam: clamp(t / MELT.foam, 0, 1)
    };
  }

  window.conductorPhysics = physics;
  window.conductorMelt = melted;

  const tempColor = (T3, t) => new T3.Color().lerpColors(
    new T3.Color(0x4a90e2), new T3.Color(0xff6a5e),
    Math.pow(clamp((t - 8) / 48, 0, 1), 1.4));

  class ConductorScene extends HTMLElement {
    static get observedAttributes() { return ['experiment', 'time', 'view', 'water', 'tub']; }

    constructor() {
      super();
      this.cfg = { experiment: 'hot', time: 0, view: 'both', water: null, tub: null };
      this.cam = { az: 0.55, el: 0.26, dist: 0.62 };
      this.last = 0;
      this.emitAt = 0;
      this.scrAt = 0;
      this.gone = false;
      this.ready = false;
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'time') {
        const p = parseFloat(v);
        const nt = clamp(isFinite(p) ? p : 0, 0, TMAX);
        if (nt < this.cfg.time) this.gone = false;
        this.cfg.time = nt;
      } else if (n === 'water' || n === 'tub') {
        const p = parseFloat(v);
        this.cfg[n] = isFinite(p) ? p : null;
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
      r.toneMappingExposure = 1.25;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.insertBefore(r.domElement, this.caps);
      this.r = r;

      const grain = this.grainTex();
      this.mats = {
        steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0x9aa7b4, metalness: 0.9, roughness: 0.32 }),
        dark: new THREE.MeshStandardMaterial({ name: 'matte_black', color: 0x1b283a, metalness: 0.2, roughness: 0.85 }),
        foam: new THREE.MeshStandardMaterial({ name: 'foam', color: 0xf1f4f7, metalness: 0, roughness: 0.94, bumpMap: grain, bumpScale: 0.22 }),
        plastic: new THREE.MeshStandardMaterial({ name: 'clear_plastic', color: 0xcfe6f5, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
        lid: new THREE.MeshStandardMaterial({ name: 'cup_lid', color: 0xdfe9f2, metalness: 0, roughness: 0.25, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
        glass: new THREE.MeshStandardMaterial({ name: 'glass', color: 0xbcd8e8, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
        tubeGlass: new THREE.MeshStandardMaterial({ name: 'tube_glass', color: 0xdff1ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
        dye: new THREE.MeshStandardMaterial({ name: 'coloured_water', color: 0xe8493f, roughness: 0.3, emissive: 0x6e1a12, emissiveIntensity: 0.7 }),
        cool: new THREE.MeshStandardMaterial({ name: 'bath_water', color: 0x4a90e2, roughness: 0.15, transparent: true, opacity: 0.7 }),
        ice: new THREE.MeshStandardMaterial({ name: 'ice', color: 0xdff2ff, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.82 }),
        rubber: new THREE.MeshStandardMaterial({ name: 'rubber_ring', color: 0x243040, roughness: 0.9 }),
        wire: new THREE.MeshStandardMaterial({ name: 'probe_wire', color: 0x14202e, roughness: 0.7 }),
        wood: new THREE.MeshStandardMaterial({ name: 'wood', color: 0xa9743f, roughness: 0.95 }),
        skin: new THREE.MeshStandardMaterial({ name: 'hand', color: 0xe0a97f, roughness: 0.8 })
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
      cx.fillText(text, 128, 49);
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.name = 'label_chip';
      sp.renderOrder = 22;
      const ww = w || 0.082;
      sp.scale.set(ww, ww * 0.375, 1);
      return sp;
    }

    /* ---------------- apparatus scene ---------------- */
    buildApparatus() {
      const T = this.THREE;
      const s = new T.Scene();
      s.background = new T.Color(0x08131f);
      s.fog = new T.Fog(0x08131f, 0.8, 2.1);
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

      this.rigs = { cups: this.buildCups(), ice: this.buildIce() };
      Object.values(this.rigs).forEach(g => s.add(g));
    }

    stand(height) {
      const T = this.THREE, M = this.mats, g = new T.Group();
      const base = new T.Mesh(new T.BoxGeometry(0.15, 0.014, 0.11), M.dark);
      base.name = 'stand_base'; base.position.y = 0.007; base.castShadow = true; g.add(base);
      const rod = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, height, 16), M.steel);
      rod.name = 'stand_rod'; rod.position.y = height / 2; rod.castShadow = true; g.add(rod);
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

    buildCups() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_two_cups_in_tub';
      const TW = 0.34, TD = 0.22, TH = 0.10;

      const tub = new T.Mesh(new T.BoxGeometry(TW, TH, TD), M.plastic);
      tub.name = 'plastic_tub'; tub.position.y = TH / 2; g.add(tub);
      const edges = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(TW, TH, TD)),
        new T.LineBasicMaterial({ color: 0x7fb6d8, transparent: true, opacity: 0.55 }));
      edges.name = 'tub_edges'; edges.position.y = TH / 2; g.add(edges);
      const tubFloor = new T.Mesh(new T.BoxGeometry(TW - 0.008, 0.005, TD - 0.008), M.plastic);
      tubFloor.name = 'tub_floor'; tubFloor.position.y = 0.0025; g.add(tubFloor);
      const tubWaterMat = new T.MeshStandardMaterial({ name: 'tub_water', color: 0x4a90e2, roughness: 0.16, transparent: true, opacity: 0.5 });
      const tubWater = new T.Mesh(new T.BoxGeometry(TW - 0.012, 0.066, TD - 0.012), tubWaterMat);
      tubWater.name = 'tub_water'; tubWater.position.y = 0.038; g.add(tubWater);

      const makeCup = (x, wallMat, name) => {
        const c = new T.Group(); c.name = name; c.position.set(x, 0.006, 0);
        const wall = new T.Mesh(new T.CylinderGeometry(0.045, 0.038, 0.088, 44, 1, true), wallMat);
        wall.name = 'cup_wall'; wall.position.y = 0.044; wall.castShadow = true; c.add(wall);
        const base = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.004, 44), wallMat);
        base.name = 'cup_base'; base.position.y = 0.002; c.add(base);
        const waterMat = new T.MeshStandardMaterial({ name: 'cup_water', color: 0xff6a5e, roughness: 0.18, transparent: true, opacity: 0.95, emissive: 0x51150f, emissiveIntensity: 0.6 });
        const water = new T.Mesh(new T.CylinderGeometry(0.0432, 0.0368, 0.07, 44), waterMat);
        water.name = 'cup_water'; water.position.y = 0.038; c.add(water);
        const lid = new T.Mesh(new T.CylinderGeometry(0.0475, 0.0475, 0.006, 44), M.lid);
        lid.name = 'cup_lid'; lid.position.y = 0.09; c.add(lid);
        const lidRimMat = new T.MeshStandardMaterial({ name: 'lid_rim', color: 0xff6a5e, emissive: 0xff6a5e, emissiveIntensity: 0.55, roughness: 0.45 });
        const lidRim = new T.Mesh(new T.TorusGeometry(0.0475, 0.0026, 10, 46), lidRimMat);
        lidRim.name = 'lid_rim'; lidRim.rotation.x = Math.PI / 2; lidRim.position.y = 0.09; c.add(lidRim);
        g.add(c);
        return { grp: c, waterMat, lidRimMat, water };
      };

      const metal = makeCup(-0.078, M.steel, 'metal_cup');
      const foam = makeCup(0.078, M.foam, 'foam_cup');

      const st = this.stand(0.30); st.position.set(0, 0, -0.185); g.add(st);

      const pMetal = this.probe(0xff6a5e, 0.055); pMetal.position.set(-0.078, 0, 0.0); pMetal.name = 'probe_metal_cup'; g.add(pMetal);
      const pFoam = this.probe(0xff6a5e, 0.055); pFoam.position.set(0.078, 0, 0.0); pFoam.name = 'probe_foam_cup'; g.add(pFoam);

      /* the logger stands at the front of the bench, screen up towards the pupil */
      const logger = new T.Group(); logger.name = 'data_logger'; logger.position.set(0.175, 0, 0.155);
      logger.rotation.y = 0.2;
      logger.scale.setScalar(0.76);
      const post = new T.Mesh(new T.CylinderGeometry(0.011, 0.015, 0.10, 20), M.dark);
      post.name = 'logger_post'; post.position.y = 0.05; logger.add(post);
      const foot = new T.Mesh(new T.CylinderGeometry(0.038, 0.043, 0.009, 28), M.dark);
      foot.name = 'logger_foot'; foot.position.y = 0.0045; foot.castShadow = true; logger.add(foot);
      const box = new T.Mesh(new T.BoxGeometry(0.152, 0.056, 0.05), M.dark);
      box.name = 'logger_body'; box.position.y = 0.132; box.rotation.x = -0.3; box.castShadow = true; logger.add(box);
      const cv = document.createElement('canvas'); cv.width = 448; cv.height = 224;
      this.scrCv = cv;
      this.scrTex = new T.CanvasTexture(cv);
      this.scrTex.colorSpace = T.SRGBColorSpace;
      const screen = new T.Mesh(new T.PlaneGeometry(0.132, 0.066),
        new T.MeshBasicMaterial({ name: 'logger_screen', map: this.scrTex, toneMapped: false }));
      screen.name = 'logger_screen'; screen.position.set(0, 0.134, 0.0285); screen.rotation.x = -0.3;
      logger.add(screen);
      const bezel = new T.Mesh(new T.BoxGeometry(0.152, 0.078, 0.004), M.steel);
      bezel.name = 'logger_bezel'; bezel.position.set(0, 0.132, 0.0255); bezel.rotation.x = -0.3;
      logger.add(bezel);
      for (let i = 0; i < 2; i++) {
        const led = new T.Mesh(new T.SphereGeometry(0.004, 12, 10),
          new T.MeshStandardMaterial({ color: i ? 0xffb627 : 0xff6a5e, emissive: i ? 0xffb627 : 0xff6a5e, emissiveIntensity: 1, roughness: 0.4 }));
        led.name = 'logger_led'; led.position.set(-0.058 + i * 0.116, 0.101, 0.036); logger.add(led);
      }
      g.add(logger);

      const wireCurve = (fromX) => {
        const c = new T.CatmullRomCurve3([
          new T.Vector3(fromX, 0.246, 0),
          new T.Vector3(fromX * 0.5 + 0.07, 0.208, 0.055),
          new T.Vector3(0.155, 0.13, 0.12),
          new T.Vector3(0.172, 0.082, 0.148)
        ]);
        const m = new T.Mesh(new T.TubeGeometry(c, 40, 0.0022, 8, false), M.wire);
        m.name = 'probe_wire';
        return m;
      };
      g.add(wireCurve(-0.078));
      g.add(wireCurve(0.078));

      const motesM = this.arrowGroup(13, 0xff7a4e); g.add(motesM);
      const motesF = this.arrowGroup(5, 0xffb627); g.add(motesF);

      const chipM = this.chip('METAL', '#d6dee6'); chipM.position.set(-0.078, 0.152, 0); g.add(chipM);
      const chipF = this.chip('FOAM', '#d6dee6'); chipF.position.set(0.078, 0.152, 0); g.add(chipF);

      g.userData = { metal, foam, tubWaterMat, pMetal, pFoam, motesM, motesF, logger };
      return g;
    }

    buildIce() {
      const T = this.THREE, M = this.mats, g = new T.Group();
      g.name = 'rig_melting_race';

      const mk = (mat, x, name) => {
        const b = new T.Mesh(new T.BoxGeometry(0.13, 0.032, 0.11), mat);
        b.name = name; b.position.set(x, 0.016, 0); b.castShadow = true; b.receiveShadow = true;
        g.add(b);
        const ring = new T.Mesh(new T.TorusGeometry(0.036, 0.005, 12, 44), M.rubber);
        ring.name = 'rubber_ring'; ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.034, 0); g.add(ring);
        const puddleMat = new T.MeshStandardMaterial({ name: 'melt_water', color: 0x9fd6f5, roughness: 0.1, metalness: 0, transparent: true, opacity: 0 });
        const puddle = new T.Mesh(new T.CylinderGeometry(1, 1, 0.004, 40), puddleMat);
        puddle.name = 'puddle'; puddle.position.set(x, 0.034, 0); puddle.scale.setScalar(0.008); g.add(puddle);
        const cube = new T.Mesh(new T.BoxGeometry(0.042, 0.042, 0.042), M.ice);
        cube.name = 'ice_cube'; cube.position.set(x, 0.053, 0); cube.castShadow = true; g.add(cube);
        return { block: b, ring, puddle, puddleMat, cube, x };
      };

      const metal = mk(new T.MeshStandardMaterial({ name: 'metal_block', color: 0x9aa7b4, metalness: 0.9, roughness: 0.3 }), -0.105, 'metal_block');
      const foam = mk(M.foam, 0.105, 'foam_block');

      const motesM = this.arrowGroup(11, 0xff7a4e); g.add(motesM);
      const motesF = this.arrowGroup(4, 0xffb627); g.add(motesF);

      const chipM = this.chip('METAL', '#d6dee6', 0.07); chipM.position.set(-0.105, 0.125, 0); g.add(chipM);
      const chipF = this.chip('FOAM', '#d6dee6', 0.07); chipF.position.set(0.105, 0.125, 0); g.add(chipF);

      g.userData = { metal, foam, motesM, motesF };
      return g;
    }

    /* ---------------- particle zoom: a slice through each cup wall ---------------- */
    buildParticles() {
      const T = this.THREE, s = new T.Scene();
      s.background = new T.Color(0x060f19);
      this.sP = s;
      s.add(new T.HemisphereLight(0xbfe4ff, 0x0a1420, 0.95));
      const d = new T.DirectionalLight(0xffffff, 1.1); d.position.set(0.4, 0.8, 0.7); s.add(d);

      const NX = 7, NY = 3, NZ = 2, SP = 0.027;
      const geo = new T.SphereGeometry(0.0074, 16, 12);
      const mk = (y, name) => {
        const grp = new T.Group(); grp.name = name; grp.position.set(0, y, 0);
        const box = new T.LineSegments(
          new T.EdgesGeometry(new T.BoxGeometry(NX * SP + 0.016, NY * SP + 0.016, NZ * SP + 0.028)),
          new T.LineBasicMaterial({ color: 0x2b3f57 }));
        box.name = 'wall_slice_box'; grp.add(box);
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
      this.pMetal = mk(0.295, 'metal_wall_slice');
      this.pFoam = mk(0.105, 'foam_wall_slice');

      const cm = this.chip('METAL', '#d6dee6', 0.072); cm.position.set(0, 0.232, 0); s.add(cm);
      const cf = this.chip('FOAM', '#d6dee6', 0.072); cf.position.set(0, 0.042, 0); s.add(cf);
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
        this.cam.az -= (e.clientX - drag.x) * 0.006;
        this.cam.el = clamp(this.cam.el + (e.clientY - drag.y) * 0.005, -0.05, 1.15);
        drag = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener('pointerup', () => { drag = null; });
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

    view() {
      if (this.exp() === 'ice') return 'apparatus';
      return this.cfg.view || 'both';
    }

    exp() {
      const e = this.cfg.experiment;
      return e === 'cold' || e === 'ice' ? e : 'hot';
    }

    /* ---------------- per-frame ---------------- */
    frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016);
      this.last = now;
      const cfg = this.cfg, exp = this.exp(), view = this.view();

      this.rigs.cups.visible = exp === 'hot' || exp === 'cold';
      this.rigs.ice.visible = exp === 'ice';

      let readings;
      if (exp === 'hot' || exp === 'cold') {
        const ph = physics(cfg.time, exp, cfg.water, cfg.tub);
        this.updCups(ph, now, dt);
        this.updSlices(ph, now, dt);
        readings = Object.assign({ experiment: exp }, ph);
      } else {
        const mp = melted(cfg.time);
        this.updIce(mp, now, dt);
        readings = Object.assign({ experiment: 'ice' }, mp);
        if (mp.metal >= 1 && !this.gone) {
          this.gone = true;
          window.dispatchEvent(new CustomEvent('conductor-melted', { detail: readings }));
        }
      }

      const focus = exp === 'ice' ? [0.075, 0.6] : [0.105, 0.78];
      if (this._lastExp !== exp) {
        this._lastExp = exp;
        this.cam.dist = focus[1];
        this.cam.el = exp === 'ice' ? 0.34 : 0.26;
        this.cam.az = 0.42;
      }
      const c = this.camA, cd = this.cam, ty = focus[0];
      /* the apparatus pane is narrow in the split view — pull back so the tub,
         both cups and the logger all stay inside the frustum */
      const paneW = view === 'both' ? Math.round(this.vw * 0.62) : this.vw;
      const aspect = paneW / (this.vh || 1);
      const fit = aspect < 1.35 ? clamp(1.35 / Math.max(aspect, 0.4), 1, 1.7) : 1;
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
        window.dispatchEvent(new CustomEvent('conductor', { detail: readings }));
      }
    }

    /* arrows through a cup wall: outwards when the cup is the hotter one.
       A good conductor gets more arrows, moving faster. */
    cupArrows(arrows, cupX, temp, tub, now, dt, speed, big) {
      const T = this.THREE;
      const out = temp > tub;
      const strength = this.cfg.time > 0.001 ? clamp(Math.abs(temp - tub) / 32, 0, 1) : 0;
      arrows.userData.st.forEach((st, i) => {
        const a = arrows.children[i];
        if (strength < 0.02) { a.visible = false; return; }
        a.visible = true;
        st.k += dt * st.sp * speed * (0.3 + strength * 0.7);
        if (st.k >= 1) { st.k -= 1; st.j = [Math.random(), Math.random(), Math.random()]; }
        const ang = st.j[0] * Math.PI * 2;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const far = clamp(Math.min(0.088 / Math.max(Math.abs(dx), 0.001), 0.092 / Math.max(Math.abs(dz), 0.001)), 0.058, 0.1);
        const k = out ? st.k : 1 - st.k;
        const rr = lerp(0.05, far, k);
        a.position.set(cupX + dx * rr, 0.015 + st.j[2] * 0.052, dz * rr);
        this.aimArrow(a, new T.Vector3(out ? dx : -dx, 0, out ? dz : -dz));
        const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
        a.userData.mats.forEach(m => { m.opacity = (0.4 + 0.6 * fade) * (0.35 + 0.65 * strength); });
        a.scale.setScalar(big * (0.85 + 0.28 * fade));
      });
    }

    updCups(ph, now, dt) {
      const T = this.THREE, u = this.rigs.cups.userData;
      const paint = (cup, temp) => {
        const col = tempColor(T, temp);
        cup.waterMat.color.copy(col);
        cup.waterMat.emissive.copy(col);
        cup.waterMat.emissiveIntensity = 0.18 + clamp(Math.abs(temp - ph.tub) / 35, 0, 1) * 0.7;
        cup.lidRimMat.color.copy(col);
        cup.lidRimMat.emissive.copy(col);
      };
      paint(u.metal, ph.metal);
      paint(u.foam, ph.foam);
      u.tubWaterMat.color.copy(tempColor(T, ph.tub)).lerp(new T.Color(0x4a90e2), 0.55);
      u.pMetal.userData.tipMat.color.copy(tempColor(T, ph.metal));
      u.pMetal.userData.tipMat.emissive.copy(tempColor(T, ph.metal));
      u.pFoam.userData.tipMat.color.copy(tempColor(T, ph.foam));
      u.pFoam.userData.tipMat.emissive.copy(tempColor(T, ph.foam));

      this.cupArrows(u.motesM, -0.078, ph.metal, ph.tub, now, dt, 0.75, 1.15);
      this.cupArrows(u.motesF, 0.078, ph.foam, ph.tub, now, dt, 0.22, 0.8);

      if (now - this.scrAt > 0.12) {
        this.scrAt = now;
        this.drawScreen(ph);
      }
    }

    /* heat crossing a slice of each wall: fast and far in metal, barely at all in foam */
    updSlices(ph, now, dt) {
      const T = this.THREE;
      const cold = ph.mode === 'cold';
      if (!this._cHot) { this._cHot = new T.Color(0xff6a5e); this._cCool = new T.Color(0x4a90e2); }
      const run = (grp, inside, decay, speed) => {
        const cols = grp.userData.cols, n = grp.userData.nx;
        const drive = cold ? ph.tub : inside;
        const other = cold ? inside : ph.tub;
        cols.forEach((c, j) => {
          const jj = cold ? (n - 1 - j) : j;
          const att = Math.exp(-decay * jj);
          const temp = other + (drive - other) * att;
          const col = tempColor(T, temp);
          c.mat.color.copy(col);
          c.mat.emissive.copy(col);
          c.mat.emissiveIntensity = 0.18 + 0.4 * clamp((temp - 10) / 45, 0, 1);
          const wave = 0.6 + 0.4 * Math.sin(now * speed * 4 - jj * 1.15);
          const amp = (0.0014 + 0.0075 * clamp((temp - 6) / 48, 0, 1)) * wave;
          c.ms.forEach((m, i) => {
            const h = m.userData.home, sd = m.userData.seed, f = 7 + temp * 0.22;
            m.position.set(
              h.x + Math.sin(now * f + sd) * amp,
              h.y + Math.sin(now * f * 1.17 + sd * 2) * amp,
              h.z + Math.cos(now * f * 0.93 + sd) * amp
            );
          });
        });
      };
      run(this.pMetal, ph.metal, 0.1, 1.6);
      run(this.pFoam, ph.foam, 0.95, 0.45);
    }

    updIce(mp, now, dt) {
      const T = this.THREE, u = this.rigs.ice.userData;
      const shape = (side, f) => {
        const left = Math.max(0, 1 - f);
        const s = Math.max(0.001, Math.pow(left, 0.34));
        side.cube.visible = f < 1;
        side.cube.scale.set(s, s * Math.max(0.25, left), s);
        side.cube.position.y = 0.036 + 0.021 * s * Math.max(0.25, left);
        side.puddle.scale.set(0.0055 + 0.03 * f, 1, 0.0055 + 0.03 * f);
        side.puddleMat.opacity = 0.72 * Math.min(1, f * 2.4);
      };
      shape(u.metal, mp.metal);
      shape(u.foam, mp.foam);

      const started = this.cfg.time > 0.001;
      const rise = (arrows, x, active, speed, big) => {
        arrows.userData.st.forEach((st, i) => {
          const a = arrows.children[i];
          if (!active) { a.visible = false; return; }
          a.visible = true;
          st.k += dt * st.sp * speed;
          if (st.k >= 1) { st.k -= 1; st.j = [Math.random(), Math.random(), Math.random()]; }
          const ang = st.j[0] * Math.PI * 2, rr = 0.005 + st.j[1] * 0.017;
          a.position.set(x + Math.cos(ang) * rr, 0.03 + st.k * 0.05, Math.sin(ang) * rr);
          a.quaternion.identity();
          const fade = Math.sin(clamp(st.k, 0, 1) * Math.PI);
          a.userData.mats.forEach(m => { m.opacity = 0.4 + 0.6 * fade; });
          a.scale.setScalar(big * (0.8 + 0.3 * fade));
        });
      };
      rise(u.motesM, -0.105, started && mp.metal < 1, 0.9, 1.15);
      rise(u.motesF, 0.105, started && mp.foam < 1, 0.24, 0.8);
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
        cx.font = '900 34px Nunito, system-ui, sans-serif';
        cx.textAlign = 'left';
        cx.letterSpacing = '3px';
        cx.fillText(label, 72, y + 1);
        cx.letterSpacing = '0px';
        cx.font = '900 92px Nunito, system-ui, sans-serif';
        cx.textAlign = 'right';
        cx.fillText(Math.round(val) + '°', W - 32, y);
      };
      row(68, '#ff6a5e', 'METAL', ph.metal);
      row(158, '#ffb627', 'FOAM', ph.foam);
      cx.fillStyle = 'rgba(255,255,255,.12)';
      cx.fillRect(30, 112, W - 60, 3);
      this.scrTex.needsUpdate = true;
    }
  }

  customElements.define('conductor-scene', ConductorScene);
})();
