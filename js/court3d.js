// The 3D court (three.js, loaded only when someone watches a game): the arena, the floor of the era, players built
// from simple shapes at their real heights who run, dribble, shoot, dunk, contest and jump for rebounds, the ball in
// flight, a TV camera, a camera behind the play and slow-motion replays.
// js/ui-court.js runs the game; every frame it hands this a snapshot (see frame()). window.COURT3D.
(function () {
  'use strict';
  const SRC = 'js/vendor/three.min.js';
  let loading = null;
  function supported() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  }
  // the motion-captured player (assets/3d/player.glb: the CC0 Quaternius Universal Animation Library mannequin and
  // its idle, walk, jog, sprint, crouch and jump clips); null when it cannot load, and the players are built from shapes
  let MC = null;
  const script = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error(src + ' did not load')); document.head.appendChild(s); });
  function loadMocap() {
    return script('js/vendor/GLTFLoader.js').then(() => script('js/vendor/SkeletonUtils.js')).then(() => new Promise(res => {
      try { new window.THREE.GLTFLoader().load('assets/3d/player.glb', g => { MC = { scene: g.scene, clips: g.animations }; res(); }, null, e => { console.warn('[court3d] players from shapes', e); res(); }); }
      catch (e) { console.warn('[court3d] players from shapes', e); res(); }
    })).catch(e => { console.warn('[court3d] players from shapes', e); });
  }
  function load() {
    if (loading) return loading;
    loading = (window.THREE ? Promise.resolve() : new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SRC; s.async = true;
      s.onload = () => (window.THREE ? res() : rej(new Error('three.js missing')));
      s.onerror = () => { loading = null; rej(new Error('three.js did not load')); };
      document.head.appendChild(s);
    })).then(() => loadMocap()).then(() => window.THREE);
    return loading;
  }

  const CW = 94, CH = 50, HOOP = 5.25, RIM_H = 10;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, f) => a + (b - a) * f;
  const smooth = (dt, ms) => 1 - Math.exp(-(dt || 16) / ms);
  const SKIN = '#8a5a3c';
  const FONT = "'Oswald', 'Arial Narrow', Arial, sans-serif";

  function create(stage, cfg) {
    const T = window.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // quality: phones draw at a lower resolution; if frames still run slow, it drops lower and the crowd sits still
    const phone = Math.min(screen.width || 9999, screen.height || 9999) < 600;
    let maxDpr = phone ? 1.5 : 2, lite = false, slow = 0;
    renderer.setPixelRatio(Math.min(maxDpr, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    const canvas = renderer.domElement;
    canvas.className = 'ct-gl';
    stage.appendChild(canvas);
    const over = document.createElement('canvas');
    over.className = 'ct-gl-over';
    stage.appendChild(over);
    const g2 = over.getContext('2d');

    const scene = new T.Scene();
    scene.background = new T.Color('#060609');
    scene.fog = new T.Fog('#060609', 140, 260);
    const cam = new T.PerspectiveCamera(34, 16 / 9, 0.5, 500);
    scene.add(new T.HemisphereLight(0xfff2dc, 0x2a2018, 0.95));
    const sun = new T.DirectionalLight(0xffffff, 0.7);
    sun.position.set(40, 90, 70);
    scene.add(sun);
    const fill = new T.DirectionalLight(0xbfd4ff, 0.25);
    fill.position.set(-60, 40, -50);
    scene.add(fill);
    const disposables = [];
    const keep = x => { disposables.push(x); return x; };
    const mat = (c, o) => keep(new T.MeshLambertMaterial(Object.assign({ color: new T.Color(c) }, o || {})));

    // ---------- the floor: the same lines as the flat view (era rules included), painted on wood ----------
    const FW = 2048, FH = Math.round(FW * 56 / 100);
    const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
    const fx = fc.getContext('2d');
    fx.fillStyle = '#b98445'; fx.fillRect(0, 0, FW, FH);
    const ftex = keep(new T.CanvasTexture(fc));
    ftex.encoding = T.sRGBEncoding;
    ftex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const fimg = new Image();
    fimg.onload = () => {
      fx.drawImage(fimg, 0, 0, FW, FH);
      ftex.needsUpdate = true;
      if (cfg.logoSrc && !/^https?:|^\/\//.test(cfg.logoSrc)) {
        const li = new Image();
        li.onload = () => {
          const px = FW / 100, r = 5.4 * px, cx = 50 * px, cy = 28 * px, k = Math.min(2 * r / li.width, 2 * r / li.height);
          fx.globalAlpha = 0.85; fx.drawImage(li, cx - li.width * k / 2, cy - li.height * k / 2, li.width * k, li.height * k); fx.globalAlpha = 1;
          ftex.needsUpdate = true;
        };
        li.src = cfg.logoSrc;
      }
    };
    fimg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cfg.floorSvg);
    const floor = new T.Mesh(keep(new T.PlaneGeometry(100, 56)), keep(new T.MeshPhongMaterial({ map: ftex, shininess: 70, specular: new T.Color('#3a3026') })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(47, 0, 25);
    scene.add(floor);
    const ground = new T.Mesh(keep(new T.PlaneGeometry(400, 400)), mat('#121215'));
    ground.rotation.x = -Math.PI / 2; ground.position.set(47, -0.03, 25);
    scene.add(ground);

    // ---------- the arena: stands on all four sides, a crowd that rises when the building gets loud ----------
    const stepMat = mat('#16161b'), crowdGeo = keep(new T.BoxGeometry(1.3, 2.1, 1.1));
    const seats = [];
    const ROWS = 11;
    function stand(x0, x1, z0, dz, rot) {
      for (let r = 0; r < ROWS; r++) {
        const d = 7 + r * 2.3, y = 0.6 + r * 1.35;
        const len = Math.abs(x1 - x0) + r * 4.6;
        const box = new T.Mesh(keep(new T.BoxGeometry(len, 1.35, 2.3)), stepMat);
        const cx = (x0 + x1) / 2;
        if (rot) { box.rotation.y = Math.PI / 2; box.position.set(z0 + dz * d, y - 0.68, cx); }
        else box.position.set(cx, y - 0.68, z0 + dz * d);
        scene.add(box);
        for (let s = -len / 2 + 1; s < len / 2 - 0.5; s += 1.9) {
          if (Math.random() < 0.08) continue;
          const p = rot ? [z0 + dz * d, y + 1.05, cx + s] : [cx + s, y + 1.05, z0 + dz * d];
          seats.push({ p, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8 });
        }
      }
    }
    stand(-6, 100, 0, -1, false);      // far sideline (behind the benches)
    stand(-6, 100, 50, 1, false);      // near sideline
    stand(0, 50, 0, -1, true);         // left baseline
    stand(0, 50, 94, 1, true);         // right baseline
    const crowd = new T.InstancedMesh(crowdGeo, keep(new T.MeshLambertMaterial({ color: 0xffffff })), seats.length);
    const tc = (cfg.homeColors || ['#555', '#999']).filter(Boolean);
    const shirt = ['#2b2b30', '#3a3a42', '#55555e', '#1d2733', '#4a3a30', '#6b6b74', '#22222a', '#8a8a92'];
    const M4 = new T.Matrix4(), col = new T.Color();
    seats.forEach((s, i) => {
      M4.makeTranslation(s.p[0], s.p[1], s.p[2]); crowd.setMatrixAt(i, M4);
      col.set(Math.random() < 0.28 ? tc[Math.floor(Math.random() * tc.length)] : shirt[Math.floor(Math.random() * shirt.length)]);
      col.multiplyScalar(0.55 + Math.random() * 0.35);
      crowd.setColorAt(i, col);
    });
    scene.add(crowd);
    // heads on the crowd, so the stands read as people
    const FACES = ['#3b2418', '#5a3a26', '#7a5034', '#9c6b48', '#c08f68', '#e0b896'];
    const heads = new T.InstancedMesh(keep(new T.SphereGeometry(0.42, 8, 6)), keep(new T.MeshLambertMaterial({ color: 0xffffff })), seats.length);
    seats.forEach((s, i) => { M4.makeTranslation(s.p[0], s.p[1] + 1.4, s.p[2]); heads.setMatrixAt(i, M4); col.set(FACES[Math.floor(Math.random() * FACES.length)]); col.multiplyScalar(0.7 + Math.random() * 0.25); heads.setColorAt(i, col); });
    scene.add(heads);
    // the scorer's table and the benches, across from the TV camera
    const table = new T.Mesh(keep(new T.BoxGeometry(28, 2.6, 2.4)), mat('#101014'));
    table.position.set(47, 1.3, -5); scene.add(table);
    const led = new T.Mesh(keep(new T.PlaneGeometry(27.6, 1.3)), keep(new T.MeshBasicMaterial({ color: new T.Color(tc[0] || '#d4af37') })));
    led.position.set(47, 1.5, -3.79); scene.add(led);
    [[22, 'home'], [72, 'away']].forEach(([x]) => { const b = new T.Mesh(keep(new T.BoxGeometry(20, 1.4, 1.8)), mat('#1c1c22')); b.position.set(x, 0.7, -4.2); scene.add(b); });
    // lights in the rafters
    const bulbs = new T.InstancedMesh(keep(new T.SphereGeometry(0.9, 8, 6)), keep(new T.MeshBasicMaterial({ color: 0xfff6dd })), 24);
    for (let i = 0; i < 24; i++) { M4.makeTranslation(-10 + (i % 12) * 10.4, 62, i < 12 ? -10 : 60); bulbs.setMatrixAt(i, M4); }
    scene.add(bulbs);

    // ---------- the baskets ----------
    const nets = [];
    function basket(right) {
      const X = x => (right ? CW - x : x), sgn = right ? -1 : 1;
      const g = new T.Group();
      const pad = mat('#1a1a20');
      const base = new T.Mesh(keep(new T.BoxGeometry(4, 3.4, 4.6)), pad); base.position.set(X(-5.2), 1.7, 25); g.add(base);
      const pole = new T.Mesh(keep(new T.BoxGeometry(0.7, 9, 0.7)), pad); pole.position.set(X(-4.6), 7.5, 25); g.add(pole);
      const arm = new T.Mesh(keep(new T.BoxGeometry(5.2, 0.6, 0.6)), pad); arm.position.set(X(-1.6), 11.2, 25); g.add(arm);
      const board = new T.Mesh(keep(new T.BoxGeometry(0.12, 3.5, 6)), keep(new T.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, shininess: 120 })));
      board.position.set(X(4), 11.25, 25); g.add(board);
      const edge = new T.LineSegments(keep(new T.EdgesGeometry(board.geometry)), keep(new T.LineBasicMaterial({ color: 0xffffff })));
      edge.position.copy(board.position); g.add(edge);
      const sq = new T.LineSegments(keep(new T.EdgesGeometry(keep(new T.PlaneGeometry(2, 1.5)))), keep(new T.LineBasicMaterial({ color: 0xffffff })));
      sq.rotation.y = Math.PI / 2; sq.position.set(X(4) + sgn * 0.08, 10.75, 25); g.add(sq);
      const rim = new T.Mesh(keep(new T.TorusGeometry(0.75, 0.06, 8, 24)), keep(new T.MeshLambertMaterial({ color: 0xff6a10, emissive: 0x401000 })));
      rim.rotation.x = Math.PI / 2; rim.position.set(X(HOOP), RIM_H, 25); g.add(rim);
      const net = new T.Mesh(keep(new T.CylinderGeometry(0.75, 0.42, 1.5, 12, 3, true)), keep(new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.75 })));
      net.position.set(X(HOOP), RIM_H - 0.75, 25); g.add(net);
      nets.push({ mesh: net, x: X(HOOP), t: 0 });
      scene.add(g);
    }
    basket(false); basket(true);

    // ---------- shadows (soft blobs, cheap on phones) ----------
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const sx = sc.getContext('2d'), grd = sx.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,.75)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = grd; sx.fillRect(0, 0, 64, 64);
    const stex = keep(new T.CanvasTexture(sc));
    const shadowGeo = keep(new T.PlaneGeometry(1, 1));
    const blob = size => {
      const m = new T.Mesh(shadowGeo, new T.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false }));
      disposables.push(m.material);
      m.rotation.x = -Math.PI / 2; m.scale.set(size, size, 1); m.position.y = 0.03; m.renderOrder = 1;
      scene.add(m); return m;
    };

    // ---------- the players ----------
    const G = {
      cyl: (a, b, h, n) => keep(new T.CylinderGeometry(a, b, h, n || 10)),
      sph: (r, w, h) => keep(new T.SphereGeometry(r, w || 12, h || 10)),
      box: (a, b, c) => keep(new T.BoxGeometry(a, b, c))
    };
    const geo = {
      thigh: G.cyl(0.27, 0.2, 1.6), shin: G.cyl(0.2, 0.12, 1.55), knee: G.sph(0.2, 10, 8), sock: G.cyl(0.135, 0.13, 0.42),
      shoe: G.box(0.74, 0.3, 0.38), sole: G.box(0.78, 0.08, 0.4),
      shorts: G.cyl(0.66, 0.76, 1.18, 16), stripe: G.box(0.05, 1.1, 0.12), torso: G.cyl(0.74, 0.56, 2.2, 16), shoulder: G.sph(0.25, 10, 8),
      upper: G.cyl(0.21, 0.16, 1.2), elbow: G.sph(0.16, 8, 6), fore: G.cyl(0.16, 0.12, 1.1),
      hand: G.sph(0.19, 10, 8), neck: G.cyl(0.18, 0.2, 0.4), head: G.sph(0.43, 16, 12), hair: keep(new T.SphereGeometry(0.445, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.1)),
      hit: G.cyl(1.5, 1.5, 7.5, 8), ring: keep(new T.RingGeometry(1.25, 1.6, 28)), num: keep(new T.PlaneGeometry(0.95, 0.95))
    };
    const skin = mat(SKIN), hairM = mat('#141416'), sockM = mat('#f1f1f1'), soleM = mat('#e9e9e9'), hitM = keep(new T.MeshBasicMaterial({ visible: false }));
    const ringM = { ball: keep(new T.MeshBasicMaterial({ color: 0xf5d76e, transparent: true, opacity: 0.55, side: T.DoubleSide })), sel: keep(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: T.DoubleSide })) };
    const kitM = {};
    ['home', 'away'].forEach(side => { const k = cfg.kit[side]; kitM[side] = { jersey: mat(k.fill), trim: mat(k.ring), shoe: mat(side === 'home' ? '#f2f2f2' : '#151515') }; });
    function limb(parent, g1, g2, m1, m2, l1, l2, at) {
      const top = new T.Group(); top.position.set(at[0], at[1], at[2]); parent.add(top);
      const a = new T.Mesh(g1, m1); a.position.y = -l1 / 2; top.add(a);
      const joint = new T.Group(); joint.position.y = -l1; top.add(joint);
      const b = new T.Mesh(g2, m2); b.position.y = -l2 / 2; joint.add(b);
      return { top, joint };
    }
    // a number painted for a jersey (one texture per number and color)
    const numCache = {};
    function numTex(n, color) {
      const k = n + '|' + color;
      if (numCache[k]) return numCache[k];
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      x.font = `700 ${String(n).length > 1 ? 92 : 104}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 7; x.strokeStyle = 'rgba(255,255,255,.55)'; x.strokeText(n, 64, 70);
      x.fillStyle = color || '#111'; x.fillText(n, 64, 70);
      const t = keep(new T.CanvasTexture(c)); t.encoding = T.sRGBEncoding;
      return (numCache[k] = t);
    }
    const figs = {};
    function figure(key) {
      const inf = cfg.info[key], km = kitM[inf.side];
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      // legs: thigh, knee, calf, a white sock and a sneaker on a sole
      const legs = [0.34, -0.34].map(z => {
        const L = limb(body, geo.thigh, geo.shin, skin, skin, 1.6, 1.55, [0, 3.3, z]);
        const knee = new T.Mesh(geo.knee, skin); L.joint.add(knee);
        const sock = new T.Mesh(geo.sock, sockM); sock.position.y = -1.28; L.joint.add(sock);
        const shoe = new T.Mesh(geo.shoe, km.shoe); shoe.position.set(0.16, -1.6, 0); L.joint.add(shoe);
        const sole = new T.Mesh(geo.sole, soleM); sole.position.set(0.17, -1.77, 0); L.joint.add(sole);
        return L;
      });
      // baggy shorts with a stripe down each side, a tank top over a chest wider at the shoulders
      const shorts = new T.Mesh(geo.shorts, km.jersey); shorts.position.y = 3.0; shorts.scale.x = 0.82; body.add(shorts);
      [0.72, -0.72].forEach(z => { const st2 = new T.Mesh(geo.stripe, km.trim); st2.position.set(0, 3.0, z); body.add(st2); });
      const torso = new T.Mesh(geo.torso, km.jersey); torso.position.y = 4.4; torso.scale.x = 0.62; body.add(torso);
      [0.74, -0.74].forEach(z => { const sh = new T.Mesh(geo.shoulder, skin); sh.position.set(0, 5.28, z); body.add(sh); });
      const band = new T.Mesh(G.cyl(0.62, 0.62, 0.14, 14), km.trim); band.position.y = 3.52; band.scale.x = 0.7; body.add(band);
      // the number, front (smaller) and back, in the trim color
      if (inf.num) {
        const nt = numTex(inf.num, cfg.kit[inf.side].ring);
        const nm = new T.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false }); disposables.push(nm);
        const back = new T.Mesh(geo.num, nm); back.position.set(-0.4, 4.55, 0); back.rotation.y = -Math.PI / 2; body.add(back);
        const front = new T.Mesh(geo.num, nm); front.position.set(0.4, 4.6, 0); front.rotation.y = Math.PI / 2; front.scale.set(0.62, 0.62, 1); body.add(front);
      }
      const arms = [0.78, -0.78].map(z => {
        const A = limb(body, geo.upper, geo.fore, skin, skin, 1.2, 1.1, [0, 5.3, z]);
        const elbow = new T.Mesh(geo.elbow, skin); A.joint.add(elbow);
        const wrist = new T.Group(); wrist.position.y = -1.1; A.joint.add(wrist);   // the wrist turns for the flick on a jumper
        const hand = new T.Mesh(geo.hand, skin); hand.position.y = -0.14; hand.scale.set(1, 1.15, 0.7); wrist.add(hand);
        A.wrist = wrist;
        A.hand = hand; return A;
      });
      const neck = new T.Mesh(geo.neck, skin); neck.position.y = 5.65; body.add(neck);
      const head = new T.Mesh(geo.head, skin); head.position.y = 6.12; head.scale.y = 1.08; body.add(head);
      const hair = new T.Mesh(geo.hair, hairM); hair.position.y = 6.14; body.add(hair);
      const hit = new T.Mesh(geo.hit, hitM); hit.position.y = 3.6; hit.userData.key = key; root.add(hit);
      const ring = new T.Mesh(geo.ring, ringM.ball); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; root.add(ring);
      const s = clamp((inf.ht || 79) / 12, 5.2, 7.7) / 6.6;
      root.scale.set(s, s, s);
      scene.add(root);
      const f = { root, body, legs, arms, hit, ring, s, hFt: s * 6.6, shadow: blob(2.6 * s), ang: null, ph: Math.random() * 6, last: null, speed: 0 };
      figs[key] = f;
      return f;
    }
    // ---------- the motion-captured players ----------
    // One clone of the mannequin per player, in his team's colors (the body the jersey color, the joints the trim), scaled
    // to his height, facing +x like the shape players. Clips by speed; the arm moves of a shot, block or rebound are layered
    // onto the arm bones, along axes found once on the rig (which local turn lifts the hand forward and up).
    let mcAxes = null;
    function mcCalibrate(bones) {
      const out = {};
      // which way the model faces: heel to toe of the left foot, flat
      const fwd = new T.Vector3(0, 0, 1);
      if (bones.foot_l && bones.ball_l) { const a = new T.Vector3(), b = new T.Vector3(); bones.foot_l.parent.updateMatrixWorld(true); bones.foot_l.getWorldPosition(a); bones.ball_l.getWorldPosition(b); b.sub(a); b.y = 0; if (b.lengthSq() > 1e-6) fwd.copy(b.normalize()); }
      out.fwd = fwd;
      ['l', 'r'].forEach(sd => {
        const up = bones['upperarm_' + sd], lo = bones['lowerarm_' + sd], hand = bones['hand_' + sd];
        if (!up || !lo || !hand) return;
        const test = (bone, want) => {
          let best = null;
          ['x', 'y', 'z'].forEach(ax => [1, -1].forEach(sg => {
            const q0 = bone.quaternion.clone(), a = new T.Vector3(), b = new T.Vector3();
            bone.parent.updateMatrixWorld(true); hand.getWorldPosition(a);
            const v = new T.Vector3(); v[ax] = 1; bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(v, sg * 0.6));
            bone.parent.updateMatrixWorld(true); hand.getWorldPosition(b);
            bone.quaternion.copy(q0);
            const d = b.sub(a), score = d.dot(want);
            if (!best || score > best.score) best = { score, axis: v.clone().multiplyScalar(sg) };
          }));
          return best.axis;
        };
        // forward (+z for the model) and up for the shoulder; forward for the elbow
        out[sd] = { up: test(up, fwd.clone().multiplyScalar(0.7).add(new T.Vector3(0, 1, 0))), lo: test(lo, fwd.clone().add(new T.Vector3(0, 0.5, 0))) };
      });
      return out;
    }
    function mcFigure(key) {
      const inf = cfg.info[key], k = cfg.kit[inf.side];
      const root = new T.Group(), body = new T.Group();
      root.add(body);
      const model = window.THREE.SkeletonUtils.clone(MC.scene);
      const bodyM = keep(new T.MeshLambertMaterial({ color: k.fill })), jointM = keep(new T.MeshLambertMaterial({ color: k.ring }));
      const bones = {};
      model.traverse(o => {
        if (o.isBone) bones[o.name] = o;
        if (o.isMesh) { o.material = /Joint/i.test((o.material && o.material.name) || '') ? jointM : bodyM; o.frustumCulled = false; }
      });
      const mixer = new T.AnimationMixer(model), acts = {};
      MC.clips.forEach(c => { acts[c.name] = mixer.clipAction(c); });
      // measured from the idle pose (arms hanging), the pose the act lifts from, while the model still faces its own way
      if (!mcAxes && acts.Idle_Loop) { acts.Idle_Loop.play(); mixer.update(0.5); mcAxes = mcCalibrate(bones); acts.Idle_Loop.stop(); }
      if (!mcAxes) mcAxes = mcCalibrate(bones);
      model.rotation.y = Math.atan2(mcAxes.fwd.z, mcAxes.fwd.x);   // turned to face +x like the court's players
      body.add(model);
      // the number on the back and (smaller) the front, at chest height in the model's meters
      if (inf.num) {
        const nm = new T.MeshBasicMaterial({ map: numTex(inf.num, k.text), transparent: true, depthWrite: false }); disposables.push(nm);
        const back = new T.Mesh(geo.num, nm); back.scale.set(0.3, 0.3, 1); back.position.set(0, 1.32, -0.16); back.rotation.y = Math.PI; model.add(back);
        const front = new T.Mesh(geo.num, nm); front.scale.set(0.18, 0.18, 1); front.position.set(0, 1.34, 0.17); model.add(front);
      }
      const ftH = clamp((inf.ht || 79) / 12, 5.2, 7.7), sc = ftH / 1.83;
      model.scale.set(sc, sc, sc);
      const hit = new T.Mesh(geo.hit, hitM); hit.position.y = 3.6; hit.userData.key = key; root.add(hit);
      const ring = new T.Mesh(geo.ring, ringM.ball); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; root.add(ring);
      scene.add(root);
      const s = ftH / 6.6;
      const f = { root, body, hit, ring, s, hFt: ftH, shadow: blob(2.6 * s), ang: null, ph: Math.random() * 6, last: null, speed: 0,
        arms: [{ hand: bones.hand_l || model }, { hand: bones.hand_r || model }], mc: { mixer, acts, cur: null, bones } };
      figs[key] = f;
      return f;
    }
    Object.keys(cfg.info).forEach(k => { if (MC && window.THREE.SkeletonUtils) { try { mcFigure(k); return; } catch (e) { console.warn('[court3d] shape player for', k, e); } } figure(k); });

    // ---------- the ball ----------
    const bc = document.createElement('canvas'); bc.width = 128; bc.height = 64;
    const bx = bc.getContext('2d');
    bx.fillStyle = '#d8661f'; bx.fillRect(0, 0, 128, 64);
    bx.strokeStyle = '#2a1206'; bx.lineWidth = 3;
    [32, 64, 96].forEach(x => { bx.beginPath(); bx.moveTo(x, 0); bx.lineTo(x, 64); bx.stroke(); });
    bx.beginPath(); bx.moveTo(0, 32); bx.lineTo(128, 32); bx.stroke();
    const btex = keep(new T.CanvasTexture(bc)); btex.encoding = T.sRGBEncoding;
    const ball = new T.Mesh(G.sph(0.4, 16, 12), keep(new T.MeshLambertMaterial({ map: btex })));
    scene.add(ball);
    const ballShadow = blob(1.0);

    // ---------- size ----------
    let W = 0, H = 0, dpr = 1;
    function resize() {
      W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
      dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H, false);
      over.width = Math.round(W * dpr); over.height = Math.round(H * dpr);
      cam.aspect = W / H; cam.updateProjectionMatrix();
      // a resized canvas is blank: draw the last frame again (a paused or finished game draws no more frames)
      if (lastS && !inFrame) { snap = true; frame(lastS, 0); }
    }
    let lastS = null, inFrame = false;
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', resize);
    resize();

    // ---------- the camera ----------
    const camPos = new T.Vector3(47, 34, 92), camLook = new T.Vector3(47, 2, 25), wantPos = new T.Vector3(), wantLook = new T.Vector3();
    let fov = 34, snap = true, lastDir = 1, orbit = 0;
    function aim(S, dt) {
      const b = S.ball, portrait = W / H < 1.05;
      let mode = S.cam === 'auto' ? (portrait ? 'end' : 'tv') : S.cam;
      let want = 34;
      if (S.replay) {
        // replay: low and close, swinging slowly around the play
        const R = S.replay, p = [R.x, R.y];
        orbit += (dt || 16) * 0.00022;
        const a = R.a0 + orbit, rad = portrait ? 24 : 21;
        wantPos.set(p[0] + Math.cos(a) * rad, 8.5, p[1] + Math.sin(a) * rad);
        wantLook.set(lerp(p[0], b.x, 0.4), 6, lerp(p[1], b.y, 0.4));
        want = portrait ? 54 : 38;
      } else if (mode === 'end') {
        // behind the play: the basket being attacked is up the screen
        if (S.dir) lastDir = S.dir;
        const d = lastDir, hx = d > 0 ? CW - HOOP : HOOP;
        const fxp = lerp(b.x, hx, 0.3);
        wantPos.set(clamp(fxp - d * (portrait ? 31 : 34), -18, CW + 18), portrait ? 21 : 19, lerp(25, b.y, 0.3));
        wantLook.set(fxp + d * 5, 1.5, lerp(25, b.y, 0.5));
        want = portrait ? 60 : 48;
      } else {
        // TV: high on the sideline, panning with the ball
        const tx = clamp(b.x, 22, CW - 22);
        wantPos.set(tx, 31, portrait ? 25 + 86 : 25 + 66);
        wantLook.set(tx, 1, 22);
        want = portrait ? 46 : 32;
      }
      if (S.zoom && !S.replay) {
        // a big moment: the camera leans in
        wantLook.x = lerp(wantLook.x, S.zoom.x, 0.5); wantLook.z = lerp(wantLook.z, S.zoom.y, 0.5);
        want *= 0.78;
      }
      const k = snap ? 1 : smooth(dt, S.replay ? 260 : 420);
      camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
      fov = snap ? want : lerp(fov, want, smooth(dt, 500));
      snap = false;
      cam.position.copy(camPos); cam.lookAt(camLook);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }

    // ---------- the bodies move ----------
    const handW = new T.Vector3();
    let bouncing = false;
    function pose(f, p, S, dt) {
      const R = f.root, B = f.body;
      const prev = f.last;
      const sp = p.vx != null ? Math.hypot(p.vx, p.vy) : prev ? Math.hypot(p.x - prev[0], p.y - prev[1]) / Math.max(1, dt) * 1000 : 0;
      f.speed = lerp(f.speed, Math.min(sp, 26), smooth(dt, 90));
      f.last = [p.x, p.y];
      R.position.set(p.x, 0, p.y);
      R.visible = p.a > 0.05;
      f.shadow.visible = R.visible;
      f.shadow.position.set(p.x, 0.03, p.y);
      // facing: where he runs when he runs, else the ball (the ball handler: the basket)
      // facing: a runner looks where he runs; a defender keeps his eyes on the ball while he slides, until he has to sprint
      let want = p.ang;
      const run0 = p.vx != null ? Math.hypot(p.vx, p.vy) : f.speed;
      if (p.vx != null && run0 > (p.def ? 15 : 6)) want = Math.atan2(p.vy, p.vx);
      else if (p.vx == null && f.speed > 7 && prev) want = Math.atan2(p.y - prev[1], p.x - prev[0]);
      if (f.ang == null) f.ang = want;
      const d = Math.atan2(Math.sin(want - f.ang), Math.cos(want - f.ang));
      f.ang += d * smooth(dt, 160);
      R.rotation.y = -f.ang;
      if (f.mc) { poseMC(f, p, S, dt, run0); return; }
      // the run: a forward lean, knees up, arms swinging bent at the elbow; a defender sliding sideways keeps a wide stance
      const mvAng = p.vx != null && run0 > 1 ? Math.atan2(p.vy, p.vx) : null;
      const side = mvAng != null ? Math.abs(Math.sin(mvAng - f.ang)) : 0;
      const slide = p.def && side > 0.55 && run0 > 2 && run0 < 16;
      const run = clamp(f.speed / 14, 0, 1) * (slide ? 0.25 : 1 - side * 0.55);
      f.ph += (dt || 16) / 1000 * (3 + f.speed * (slide ? 0.75 : 0.55));
      const swing = Math.sin(f.ph) * 1.0 * run;
      const handler = p.hold && !S.ball.flight;
      let crouch = p.def && run < 0.4 ? 0.3 : handler ? 0.24 : 0.1;
      let lx = slide ? 0.22 + Math.abs(Math.sin(f.ph)) * 0.22 : 0;   // legs out to the side (a slide)
      let l0z = swing + crouch, l1z = -swing + crouch;
      let k0 = -Math.max(0, Math.sin(f.ph)) * 1.35 * run - crouch * 1.6, k1 = -Math.max(0, -Math.sin(f.ph)) * 1.35 * run - crouch * 1.6;
      let bodyY = -crouch * 0.9 + Math.abs(Math.cos(f.ph)) * 0.2 * run;
      B.rotation.z = -0.2 * run - (handler ? 0.1 : 0);
      const elb = -0.35 - 1.1 * run;
      let aL = [-swing * 0.85, -0.12, elb], aR = [swing * 0.85, 0.12, elb];   // [forward, out, elbow]
      if (p.def && run < 0.5) { aL = [0.5, -0.8, -0.45]; aR = [0.5, 0.8, -0.45]; }   // the defensive stance: hands out
      let jump = 0, flick = 0;
      const A = p.act;
      if (A) {
        const t = A.f, up = clamp(t / 0.35, 0, 1), arc = Math.sin(Math.PI * clamp(t, 0, 1));
        B.rotation.z = 0;
        if (A.k === 'shoot') {
          // dip, rise, release at the top with a flick of the wrist, hold the follow-through
          const dip = t < 0.22 ? Math.sin(t / 0.22 * Math.PI) * 0.55 : 0, rise = clamp((t - 0.15) / 0.85, 0, 1);
          jump = Math.sin(Math.PI * rise) * 1.5;
          l0z = l1z = crouch + dip; k0 = k1 = -crouch * 1.6 - dip * 1.9 - (jump > 0.2 ? 0.25 : 0); bodyY -= dip * 0.45;
          const lift = clamp((t - 0.12) / 0.3, 0, 1);
          aL = [lerp(0.6, 2.6, lift), -0.18, -lerp(1.5, 0.4, lift)]; aR = [lerp(0.6, 2.95, lift), 0.08, -lerp(1.7, 0.1, lift)];
          flick = t > 0.48 ? -1.25 * clamp((t - 0.48) / 0.12, 0, 1) : 0.5 * lift;
        } else if (A.k === 'layup') {
          // off one foot: the near knee drives up, the ball hand reaches for the rim, the other arm shields
          jump = arc * 2.4;
          l0z = -0.35; k0 = -0.5; l1z = 1.5 * up; k1 = -1.7 * up;
          aR = [lerp(0.8, 3.05, up), 0.12, -lerp(1.2, 0.05, up)]; aL = [1.1, -0.55, -0.9];
          flick = t > 0.5 ? -0.8 : 0;
        } else if (A.k === 'dunk') {
          // up, a hang on the rim at the top, then down
          const r2 = t < 0.45 ? Math.sin(t / 0.45 * Math.PI / 2) : t < 0.72 ? 1 : Math.cos((t - 0.72) / 0.28 * Math.PI / 2);
          jump = r2 * 3.2; l0z = l1z = 0.35 * r2; k0 = k1 = -1.1 * r2;
          aL = [lerp(0.4, 2.9, up), -0.2, -0.15]; aR = [lerp(0.4, 3.05, up), 0.05, -0.1];
          if (t > 0.45 && t < 0.72) { aL[0] = 2.7; aR[0] = 2.75; }
        } else if (A.k === 'contest') { jump = Math.sin(Math.PI * clamp((t - 0.2) / 0.8, 0, 1)) * 1.2; aL = [2.4, -0.3, -0.1]; aR = [2.8, 0.1, -0.1]; }
        else if (A.k === 'block') {
          // both arms up, then the block hand swats down through the ball
          jump = arc * 2.6; l0z = l1z = 0.2; k0 = k1 = -0.5 * arc;
          aL = [2.7, -0.3, 0]; aR = [t < 0.5 ? 3.05 : lerp(3.05, 1.9, clamp((t - 0.5) / 0.2, 0, 1)), 0.1, 0];
        } else if (A.k === 'jump') {
          // a rebound: two hands up for it, then pulled into the chest
          jump = arc * 2.2; k0 = k1 = -0.6 * arc;
          if (t < 0.55) { aL = [2.85, -0.25, -0.2]; aR = [2.85, 0.25, -0.2]; } else { aL = [1.1, -0.35, -1.7]; aR = [1.1, 0.35, -1.7]; }
        }
        else if (A.k === 'ft') { jump = Math.max(0, Math.sin(Math.PI * clamp((t - 0.3) / 0.5, 0, 1))) * 0.3; const dip = t < 0.3 ? Math.sin(t / 0.3 * Math.PI) * 0.35 : 0; k0 = k1 = -crouch * 1.6 - dip * 1.6; l0z = l1z = crouch + dip; aL = [lerp(0.6, 2.6, up), -0.2, -lerp(1.4, 0.2, up)]; aR = [lerp(0.6, 2.85, up), 0.1, -lerp(1.6, 0.1, up)]; flick = t > 0.55 ? -1.2 : 0; }
        else if (A.k === 'cheer') { jump = Math.abs(Math.sin(t * Math.PI * 3)) * 0.8; aL = [2.9, -0.5, 0]; aR = [2.9, 0.5, 0]; }
      } else if (handler) {
        // dribbling with the right hand, low
        const db = Math.abs(Math.cos(f.ph * 0.75 + 0.6));
        aR = [0.55 + db * 0.35, 0.35, -0.5 - db * 0.4];
        flick = -0.3 * db;
      }
      f.legs[0].top.rotation.set(lx, 0, l0z); f.legs[1].top.rotation.set(-lx, 0, l1z);
      f.legs[0].joint.rotation.z = k0; f.legs[1].joint.rotation.z = k1;
      B.position.y = bodyY + jump / f.s;
      f.shadow.material.opacity = clamp(0.62 - jump * 0.12, 0.2, 0.62);
      f.shadow.scale.set(2.6 * f.s * (1 - jump * 0.06), 2.6 * f.s * (1 - jump * 0.06), 1);
      f.arms[0].top.rotation.set(aL[1], 0, aL[0]); f.arms[0].joint.rotation.z = -aL[2];
      f.arms[1].top.rotation.set(aR[1], 0, aR[0]); f.arms[1].joint.rotation.z = -aR[2];
      if (f.arms[1].wrist) f.arms[1].wrist.rotation.z = flick;
      f.ring.visible = p.hold || p.sel;
      f.ring.material = p.sel ? ringM.sel : ringM.ball;
      f.jump = jump;
    }

    // a motion-captured player: the clip for his speed (crouched on defense), in the air for a shot, block or rebound,
    // and the arms of the act layered on top
    const AIR = { shoot: 1.5, layup: 2.4, dunk: 3.2, block: 2.6, jump: 2.2, contest: 1.2, cheer: 0.8 };
    // turn a bone so the segment to its child points along dir (world), by weight w
    const vA = new T.Vector3(), vB = new T.Vector3(), qW = new T.Quaternion(), qP = new T.Quaternion(), qD = new T.Quaternion(), qI = new T.Quaternion();
    function aimBone(bone, child, dir, w) {
      if (!bone || !child) return;
      bone.updateMatrixWorld(true);
      bone.getWorldPosition(vA); child.getWorldPosition(vB);
      const cur = vB.sub(vA); if (cur.lengthSq() < 1e-8) return;
      qD.setFromUnitVectors(cur.normalize(), dir);
      if (w < 1) qD.copy(qI.identity().slerp(qD, w));
      bone.getWorldQuaternion(qW); qW.premultiply(qD);
      bone.parent.getWorldQuaternion(qP);
      bone.quaternion.copy(qP.invert().multiply(qW));
      bone.updateMatrixWorld(true);
    }
    const qTmp = new T.Quaternion();
    function poseMC(f, p, S, dt, sp) {
      const M = f.mc, A = p.act, t = A ? clamp(A.f, 0, 1) : 0, arc = Math.sin(Math.PI * t), up = clamp(t / 0.35, 0, 1);
      const jump = A && AIR[A.k] ? AIR[A.k] * arc : 0;
      let clip, rate = 1;
      if (jump > 0.25) clip = 'Jump_Loop';
      else if (sp < 1) clip = 'Idle_Loop';
      else if (sp < 6) { clip = 'Walk_Loop'; rate = clamp(sp / 4.6, 0.5, 1.6); }
      else if (sp < 15) { clip = 'Jog_Fwd_Loop'; rate = clamp(sp / 10, 0.6, 1.5); }
      else { clip = 'Sprint_Loop'; rate = clamp(sp / 20, 0.7, 1.4); }
      if (!M.acts[clip]) clip = 'Idle_Loop';
      if (M.cur !== clip && M.acts[clip]) {
        M.acts[clip].reset().setEffectiveWeight(1).fadeIn(0.18).play();
        if (M.cur && M.acts[M.cur]) M.acts[M.cur].fadeOut(0.18);
        M.cur = clip;
      }
      if (M.acts[clip]) M.acts[clip].setEffectiveTimeScale(rate);
      // a defender stays low: a third of the crouch blended over whatever he is doing (the clip alone is a deep sneak)
      const cr = M.acts.Crouch_Idle_Loop, low = p.def && jump < 0.25 && sp < 15 ? 0.32 : 0;
      if (cr) { if (low && !cr.isRunning()) cr.play(); cr.setEffectiveWeight(lerp(cr.getEffectiveWeight(), low, 0.15)); }
      M.mixer.update(Math.min(0.1, (dt || 16) / 1000));
      // the arms of the act: each upper arm and forearm aimed at a direction (forward, up, out to his side, mixed),
      // blended over whatever the clip is doing by how far into the move he is
      f.body.position.y = jump;
      let tg = null;   // [[upper dir, fore dir, weight] for left, for right], dirs as [forward, up, out]
      if (A) {
        const k = A.k, l = clamp((t - 0.1) / 0.3, 0, 1);
        if (k === 'shoot' || k === 'ft') tg = [[[0.5, 1, 0.25], [0.2, 1, -0.1], l], [[0.35, 1, 0], [0.15, 1, 0], l]];
        else if (k === 'layup') tg = [[[0.7, -0.2, 0.6], [1, 0.4, 0], 0.8], [[0.4, 1, 0], [0.3, 1, 0], up]];
        else if (k === 'dunk') tg = [[[0.3, 1, 0.3], [0.3, 1, 0], up], [[0.3, 1, -0.1], [0.4, 1, 0], up]];
        else if (k === 'block') tg = [[[0.2, 1, 0.4], [0, 1, 0], 1], t < 0.5 ? [[0.3, 1, 0], [0.3, 1, 0], 1] : [[1, 0.3, 0], [1, -0.4, 0], 1]];
        else if (k === 'jump') tg = t < 0.55 ? [[[0.3, 1, 0.3], [0.2, 1, 0], 1], [[0.3, 1, -0.3], [0.2, 1, 0], 1]] : [[[0.6, -0.6, 0.3], [0.3, 0.6, -0.8], 1], [[0.6, -0.6, -0.3], [0.3, 0.6, 0.8], 1]];
        else if (k === 'contest') tg = [[[0.3, 0.3, 0.8], [0.3, 0.6, 0.6], 0.7], [[0.5, 1, 0], [0.4, 1, 0], 1]];
        else if (k === 'cheer') tg = [[[0, 1, 0.5], [0, 1, 0.3], 1], [[0, 1, -0.5], [0, 1, -0.3], 1]];
      } else if (p.hold && !S.ball.flight) tg = [null, [[0.45, -1, -0.25], [0.6, -0.8, 0], 0.7]];   // the dribble hand out in front, low
      if (tg) {
        f.root.updateMatrixWorld(true);
        const fw = new T.Vector3(Math.cos(f.ang), 0, Math.sin(f.ang)), upv = new T.Vector3(0, 1, 0), out = new T.Vector3().crossVectors(fw, upv);   // out: his right
        ['l', 'r'].forEach((sd, i) => {
          const g = tg[i], B = M.bones;
          if (!g || !g[2]) return;
          const dir = d => new T.Vector3().addScaledVector(fw, d[0]).addScaledVector(upv, d[1]).addScaledVector(out, (sd === 'r' ? 1 : -1) * d[2]).normalize();
          aimBone(B['upperarm_' + sd], B['lowerarm_' + sd], dir(g[0]), g[2]);
          aimBone(B['lowerarm_' + sd], B['hand_' + sd], dir(g[1]), g[2]);
        });
      }
      f.shadow.material.opacity = clamp(0.62 - jump * 0.12, 0.2, 0.62);
      f.shadow.scale.set(2.6 * f.s * (1 - jump * 0.06), 2.6 * f.s * (1 - jump * 0.06), 1);
      f.ring.visible = p.hold || p.sel;
      f.ring.material = p.sel ? ringM.sel : ringM.ball;
      f.jump = jump;
    }

    // ---------- labels: points, misses, fouls, the play, names ----------
    const STY = {
      pts: ['#f5d76e', 30, 700], big: ['#f5d76e', 24, 700], foul: ['#ffb4b4', 18, 700], miss: ['#b6b6be', 16, 600],
      reb: ['#ffffff', 16, 600], sub: ['#e6e6ea', 14, 600], kind: ['#111111', 14, 700, '#f3cf5e'], play: ['#ffffff', 14, 700, 'rgba(10,10,14,.85)'], nm: ['#ffffff', 13, 600]
    };
    const v3 = new T.Vector3();
    function project(x, h, y) { v3.set(x, h, y).project(cam); return v3.z < 1 ? [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H] : null; }
    function label(text, x, h, y, cls, alpha, dy) {
      const s = STY[cls] || STY.reb, p = project(x, h, y);
      if (!p) return;
      const size = s[1] * (W < 520 ? 0.85 : 1);
      g2.globalAlpha = alpha;
      g2.font = `${s[2]} ${size}px ${FONT}`;
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      const yy = p[1] - (dy || 0);
      if (s[3]) {
        const w = g2.measureText(text).width + 14;
        g2.fillStyle = s[3]; g2.fillRect(p[0] - w / 2, yy - size * 0.72, w, size * 1.44);
        g2.fillStyle = s[0]; g2.fillText(text, p[0], yy + 1);
      } else {
        g2.lineJoin = 'round'; g2.lineWidth = 4; g2.strokeStyle = 'rgba(0,0,0,.85)'; g2.strokeText(text, p[0], yy);
        g2.fillStyle = s[0]; g2.fillText(text, p[0], yy);
      }
      g2.globalAlpha = 1;
    }

    // ---------- each frame ----------
    // S: { cam: 'tv'|'end'|'auto', players: [{ key, x, y, a, ang, act: { k, f } | null, hold, sel, def }], ball: { x, y, h, held, flight },
    //      dir, tags: [{ key?, x, y, text, cls, f }], rings: [{ x, y, f }], zoom: { x, y } | null, crowd: 0..1, replay: { kind, x, y, a0 } | null }
    let crowdT = 0, frameN = 0;
    const trail = [];
    function frame(S, dt) {
      lastS = S; inFrame = true;
      try { draw(S, dt); } finally { inFrame = false; }
    }
    function draw(S, dt) {
      if (!W) resize();
      const seen = {};
      S.players.forEach(p => { const f = figs[p.key]; if (!f) return; seen[p.key] = 1; pose(f, p, S, dt); });
      Object.keys(figs).forEach(k => { if (!seen[k]) { figs[k].root.visible = false; figs[k].shadow.visible = false; } });
      // the ball: in flight from the game, in a dribble from the handler's right hand
      const b = S.ball;
      if (b.held && figs[b.held] && !b.flight) {
        const f = figs[b.held];
        f.root.updateMatrixWorld(true);
        f.arms[1].hand.getWorldPosition(handW);
        if (f.jump > 0.2) { ball.position.set(handW.x, handW.y + 0.3, handW.z); bouncing = false; }
        else {
          const db = Math.abs(Math.cos(f.ph * 0.75 + 0.6));
          const fwd = 0.6;
          ball.position.set(handW.x + Math.cos(f.ang) * fwd, 0.4 + (Math.max(0.6, handW.y - 0.3) - 0.4) * db, handW.z + Math.sin(f.ang) * fwd);
          if (db < 0.2 && !bouncing) { bouncing = true; if (cfg.onBounce) cfg.onBounce(); }
          if (db > 0.5) bouncing = false;
        }
      } else if (b.hand && figs[b.hand] && b.flight) {
        // into a hand in flight (a block): the last part of the flight bends onto his actual hand
        const f = figs[b.hand];
        f.root.updateMatrixWorld(true);
        f.arms[1].hand.getWorldPosition(handW);
        const w = Math.pow(clamp(b.p, 0, 1), 2);
        ball.position.set(lerp(b.x, handW.x, w), lerp(Math.max(0.4, b.h == null ? 4 : b.h), handW.y + 0.25, w), lerp(b.y, handW.z, w));
      } else {
        ball.position.set(b.x, Math.max(0.4, b.h == null ? 4 : b.h), b.y);
      }
      ball.rotation.z -= (dt || 16) * 0.012;
      ballShadow.position.set(ball.position.x, 0.035, ball.position.z);
      const bs = 0.9 + ball.position.y * 0.06; ballShadow.scale.set(bs, bs, 1);
      ballShadow.material.opacity = clamp(0.7 - ball.position.y * 0.04, 0.15, 0.7);
      // the net snaps on a make
      (S.rings || []).forEach(r => nets.forEach(n => { if (Math.abs(r.x - n.x) < 2 && r.f < 0.2) n.t = 1; }));
      nets.forEach(n => { n.t = Math.max(0, n.t - (dt || 16) / 500); const k = n.t; n.mesh.scale.set(1 - k * 0.25, 1 + k * 0.35, 1 - k * 0.25); n.mesh.position.y = RIM_H - 0.75 - k * 0.25; });
      // the crowd: on its feet when it gets loud
      crowdT += dt || 16;
      const lv = clamp(S.crowd || 0, 0, 1);
      // too slow (frames over 28 ms for a while): lower resolution, a still crowd
      slow = (dt || 16) > 28 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 40 && !lite) { lite = true; maxDpr = 1; resize(); }
      frameN++;
      if (!lite && (lv > 0.04 || crowd.userData.lv > 0.04)) {
        if (frameN % (phone ? 4 : 2) === 0) {
          seats.forEach((s, i) => {
            const j = Math.max(0, Math.sin(crowdT * 0.006 * s.sp + s.ph)) * lv * 1.4;
            M4.makeTranslation(s.p[0], s.p[1] + j, s.p[2]); crowd.setMatrixAt(i, M4);
            M4.makeTranslation(s.p[0], s.p[1] + 1.4 + j, s.p[2]); heads.setMatrixAt(i, M4);
          });
          crowd.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
        }
      }
      crowd.userData.lv = lv;
      aim(S, dt);
      renderer.render(scene, cam);
      // the ball's trail through the air (shots and long passes): the last half second of its flight
      if (b.flight && !S.replay ? ball.position.y > 4.5 : S.replay && ball.position.y > 4.5) trail.push([ball.position.x, ball.position.y, ball.position.z, 0]);
      trail.forEach(q => { q[3] += dt || 16; });
      while (trail.length && (trail[0][3] > 520 || trail.length > 40)) trail.shift();
      if (!b.flight && !S.replay && trail.length && trail[trail.length - 1][3] > 120) trail.length = 0;
      // the labels on top
      g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2.clearRect(0, 0, W, H);
      if (trail.length > 2) {
        g2.lineCap = 'round';
        for (let i = 1; i < trail.length; i++) {
          const a = project(trail[i - 1][0], trail[i - 1][1], trail[i - 1][2]), c = project(trail[i][0], trail[i][1], trail[i][2]);
          if (!a || !c) continue;
          const f = i / trail.length;
          g2.strokeStyle = 'rgba(245, 215, 110,' + (0.55 * f * (1 - trail[i][3] / 520)).toFixed(3) + ')';
          g2.lineWidth = 1 + 4 * f;
          g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(c[0], c[1]); g2.stroke();
        }
      }
      (S.tags || []).forEach(tg => {
        const f = tg.key && figs[tg.key];
        const x = f ? f.root.position.x : tg.x, y = f ? f.root.position.z : tg.y, h = f ? f.hFt + 1.2 + (f.jump || 0) : 9;
        const a = tg.f < 0.75 ? 1 : (1 - tg.f) * 4;
        label(tg.text, x, h, y, tg.cls, a, tg.cls === 'kind' || tg.cls === 'play' ? 26 : tg.f * 20);
      });
      S.players.forEach(p => {
        if (!(p.sel || (p.hold && S.names)) || S.replay) return;
        const f = figs[p.key]; if (!f || !f.root.visible) return;
        label(cfg.info[p.key].last.toUpperCase(), f.root.position.x, f.hFt + 0.9 + (f.jump || 0), f.root.position.z, 'nm', 0.92, 0);
      });
      if (S.replay) {
        const w = W < 520 ? 88 : 110;
        g2.fillStyle = 'rgba(0,0,0,.78)'; g2.fillRect(12, 12, w, 30);
        g2.fillStyle = '#f3cf5e'; g2.fillRect(12, 12, 4, 30);
        g2.font = `700 ${W < 520 ? 14 : 16}px ${FONT}`; g2.textAlign = 'left'; g2.textBaseline = 'middle'; g2.fillStyle = '#fff';
        g2.fillText('REPLAY', 24, 28);
        if (S.replay.kind) { g2.font = `600 13px ${FONT}`; g2.fillStyle = '#f3cf5e'; g2.fillText(S.replay.kind, 14, 62); }
      }
    }

    // a tap on a player: his key
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    function pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(Object.keys(figs).filter(k => figs[k].root.visible).map(k => figs[k].hit), false);
      return hits.length ? hits[0].object.userData.key : null;
    }

    function destroy() {
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      disposables.forEach(d => { try { d.dispose(); } catch (e) { /* gone */ } });
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* fine */ }
      canvas.remove(); over.remove();
    }
    return { frame, resize, pick, destroy, snapCamera: () => { snap = true; } };
  }

  window.COURT3D = { supported, load, create };
})();
