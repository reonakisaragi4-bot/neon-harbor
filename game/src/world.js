// Neon Harbor — procedural low-poly coastal city.
// One seeded build: grid streets, blocks of varied buildings, sidewalks, beach,
// harbour with docks and boats, a bridge, a lighthouse, lamps, trees, clouds.
// All geometry is boxes, cylinders and spheres with shared materials — no
// loaded assets, no textures from disk. Window/sign textures are drawn on
// canvases at runtime.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Facade texture: rows of lit/unlit windows on a pale wall.
function makeFacadeTexture(rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 12; y += 26) {
      for (let x = 10; x < w - 10; x += 22) {
        const lit = rng.chance(0.28);
        g.fillStyle = lit ? '#ffe9a8' : '#2c3a55';
        g.fillRect(x, y, 14, 18);
      }
    }
  });
}

// Road texture for streets running along x: dashes along the texture's U
// axis (the street's length), pale edge lines.
function makeRoadTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#2f3240'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3e50';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 3, w, 2); g.fillRect(0, h - 5, w, 2);
    g.fillStyle = '#ffd23e';
    for (let x = 0; x < w; x += 32) g.fillRect(x, h / 2 - 2, 18, 4);
  });
}

// Road texture for streets running along z: dashes along the texture's V
// axis (the street's length). Kept separate from the U version on purpose —
// rotating one texture 90 degrees does not repeat the dashes the same way.
function makeRoadTextureV() {
  return canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#2f3240'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3e50';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8e8e8'; g.fillRect(3, 0, 2, h); g.fillRect(w - 5, 0, 2, h);
    g.fillStyle = '#ffd23e';
    for (let y = 0; y < h; y += 32) g.fillRect(w / 2 - 2, y, 4, 18);
  });
}

// Neon sign texture with original fictional business names.
function makeSignTexture(text, color) {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = color; g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];   // {minX,maxX,minZ,maxZ} building / prop footprints
    this.parkedSpots = []; // {x,z,yaw} where stealable cars sit
    this.clouds = [];
    this.neonSigns = [];
    this.waterMats = [];
    this.beacon = null;    // mission marker, set by missions.js
    this.streetLines = [];
    for (let i = 0; i <= CFG.BLOCKS; i++) {
      this.streetLines.push(-CFG.CITY_HALF + i * CFG.PITCH);
    }
    this._build();
  }

  _mat(color, opts = {}) {
    return new THREE.MeshLambertMaterial({ color, ...opts });
  }

  _box(w, h, d, mat, x, y, z, parent = this.scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  _build() {
    const rng = this.rng;
    const S = this.scene;

    // --- ground: city slab, sand, sea ---
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
      this._mat(0x77825f));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
    S.add(ground);

    const sand = new THREE.Mesh(new THREE.PlaneGeometry(560, 60), this._mat(PALETTE.sand));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, CFG.BEACH_Z + 18);
    S.add(sand);
    // Sand also hugs the harbour edge.
    const sandE = new THREE.Mesh(new THREE.PlaneGeometry(60, 560), this._mat(PALETTE.sand));
    sandE.rotation.x = -Math.PI / 2; sandE.position.set(CFG.HARBOUR_X + 18, 0.0, 0);
    S.add(sandE);

    const waterMat = new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.88 });
    this.waterMats.push(waterMat);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 320), waterMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, CFG.WATER_Z + 130);
    S.add(sea);
    const seaE = new THREE.Mesh(new THREE.PlaneGeometry(320, 900), waterMat);
    seaE.rotation.x = -Math.PI / 2; seaE.position.set(CFG.WATER_X + 130, -0.4, 0);
    S.add(seaE);

    // --- roads (textured strips along every street line) ---
    const roadTex = makeRoadTexture();
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    const roadTexV = makeRoadTextureV();
    roadTexV.wrapS = roadTexV.wrapT = THREE.RepeatWrapping;
    const L = CFG.CITY_HALF * 2 + CFG.STREET_W;
    for (const c of this.streetLines) {
      // Street running along x, located at z = c.
      const texH = roadTex.clone(); texH.needsUpdate = true; texH.repeat.set(Math.round(L / 32), 1);
      const geoH = new THREE.PlaneGeometry(L, CFG.STREET_W); geoH.rotateX(-Math.PI / 2);
      const mh = new THREE.Mesh(geoH, new THREE.MeshLambertMaterial({ map: texH }));
      mh.position.set(0, 0.03, c); mh.receiveShadow = true; S.add(mh);
      // Street running along z, located at x = c (V-dash texture, no rotation).
      const texV = roadTexV.clone(); texV.needsUpdate = true; texV.repeat.set(1, Math.round(L / 32));
      const geoV = new THREE.PlaneGeometry(CFG.STREET_W, L); geoV.rotateX(-Math.PI / 2);
      const mv = new THREE.Mesh(geoV, new THREE.MeshLambertMaterial({ map: texV }));
      mv.position.set(c, 0.03, 0); mv.receiveShadow = true; S.add(mv);
    }

    // --- sidewalks: pale strips hugging each road ---
    const walkMat = this._mat(PALETTE.sidewalk);
    for (const c of this.streetLines) {
      for (const off of [-1, 1]) {
        const o = off * (CFG.STREET_W / 2 + CFG.SIDEWALK_W / 2);
        const h = this._box(CFG.SIDEWALK_W, 0.12, L, walkMat, c + o, 0.06, 0);
        const v = this._box(L, 0.12, CFG.SIDEWALK_W, walkMat, 0, 0.06, c + o);
        h.receiveShadow = true; v.receiveShadow = true;
      }
    }

    // --- buildings: 1-4 per block, varied heights and colours ---
    const facadeTex = makeFacadeTexture(rng);
    const facadeMats = PALETTE.building.map((c) => new THREE.MeshLambertMaterial({ color: c, map: facadeTex }));
    const roofMats = PALETTE.roof.map((c) => this._mat(c));
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    // Shuffled per seed so different cities hang different signs.
    const signNames = rng.shuffle(['HOTEL CORAL', 'PIER 9', 'TACO BAY', 'NEON BAR', 'SURF SHOP', 'PALM MOTEL', 'DOCK CAFE']);
    let signIdx = 0;
    for (let bi = 0; bi < CFG.BLOCKS; bi++) {
      for (let bj = 0; bj < CFG.BLOCKS; bj++) {
        const cx = -CFG.CITY_HALF + (bi + 0.5) * CFG.PITCH;
        const cz = -CFG.CITY_HALF + (bj + 0.5) * CFG.PITCH;
        const n = rng.int(1, 4);
        // Skip the central plaza block — it becomes the open square.
        if (bi === 3 && bj === 3) { this._buildPlaza(cx, cz); continue; }
        for (let k = 0; k < n; k++) {
          const bw = rng.range(13, 22), bd = rng.range(13, 22);
          const bh = rng.bell(9, 46, 16);
          const ox = n === 1 ? 0 : rng.range(-9, 9);
          const oz = n === 1 ? 0 : rng.range(-9, 9);
          const x = cx + ox, z = cz + oz;
          const mat = rng.pick(facadeMats);
          const b = new THREE.Mesh(boxGeo, mat);
          b.scale.set(bw, bh, bd);
          b.position.set(x, bh / 2, z);
          b.castShadow = true; b.receiveShadow = true;
          S.add(b);
          // Roof cap + rooftop clutter.
          const roof = this._box(bw + 0.6, 0.7, bd + 0.6, rng.pick(roofMats), x, bh + 0.35, z);
          roof.castShadow = true;
          if (rng.chance(0.5)) this._box(rng.range(2, 4), rng.range(1, 2.5), rng.range(2, 4),
            this._mat(0x8a94a6), x + rng.range(-4, 4), bh + 1.4, z + rng.range(-4, 4));
          if (rng.chance(0.3)) {
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, rng.range(4, 9), 6), this._mat(0x555c66));
            ant.position.set(x + rng.range(-5, 5), bh + 3, z + rng.range(-5, 5));
            S.add(ant);
          }
          // Neon sign on some taller buildings. Double-sided so the glow
          // reads from the street behind it too, not just face-on. Hung
          // low enough (just over half the building's height) that a
          // street-level camera can actually see it.
          if (bh > 20 && signIdx < signNames.length && rng.chance(0.6)) {
            const name = signNames[signIdx++];
            const color = '#' + rng.pick(PALETTE.neon).toString(16).padStart(6, '0');
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 6),
              new THREE.MeshBasicMaterial({ map: makeSignTexture(name, color), side: THREE.DoubleSide }));
            sign.position.set(x, bh * 0.55, z + bd / 2 + 0.15);
            S.add(sign);
            this.neonSigns.push(sign);
          }
          this.colliders.push({ minX: x - bw / 2, maxX: x + bw / 2, minZ: z - bd / 2, maxZ: z + bd / 2 });
        }
      }
    }

    this._buildStreetProps();
    this._buildBeach();
    this._buildHarbour();
    this._buildBridge();
    this._buildClouds();
    this._makeParkedSpots();
  }

  _buildPlaza(cx, cz) {
    // Central square: fountain, benches, palm ring.
    const stone = this._mat(0xb8b0a0);
    this._box(34, 0.25, 34, stone, cx, 0.12, cz);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, 1.1, 20), this._mat(0x9db8c8));
    basin.position.set(cx, 0.7, cz); S_add(this.scene, basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.3, 20),
      new THREE.MeshLambertMaterial({ color: 0x2fa8d8, transparent: true, opacity: 0.85 }));
    water.position.set(cx, 1.15, cz); this.scene.add(water);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.6, 10), this._mat(0xd8d2c4));
    jet.position.set(cx, 2.2, cz); this.scene.add(jet);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this._makePalm(cx + Math.cos(a) * 14, cz + Math.sin(a) * 14);
    }
    this.colliders.push({ minX: cx - 7, maxX: cx + 7, minZ: cz - 7, maxZ: cz + 7 });
  }

  _makePalm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 6, 7), this._mat(0x8a6b46));
    trunk.position.set(x, 3, z); trunk.rotation.z = this.rng.range(-0.12, 0.12);
    trunk.castShadow = true; this.scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 8), this._mat(0x3f9e4d));
    leaves.position.set(x, 6.8, z); leaves.castShadow = true; this.scene.add(leaves);
    this.colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  }

  _buildStreetProps() {
    const rng = this.rng;
    const lampMat = this._mat(0x2b2f3a);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    // Lamps and trees along every street, on the sidewalk band.
    for (const c of this.streetLines) {
      for (let t = -CFG.CITY_HALF + 20; t < CFG.CITY_HALF; t += 34) {
        for (const side of [-1, 1]) {
          const o = side * (CFG.STREET_W / 2 + CFG.SIDEWALK_W + 0.4);
          if (rng.chance(0.55)) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.4, 8), lampMat);
            pole.position.set(c + o, 2.7, t + rng.range(-3, 3)); this.scene.add(pole);
            const arm = this._box(1.6, 0.14, 0.14, lampMat, c + o - side * 0.7, 5.3, pole.position.z);
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bulbMat);
            bulb.position.set(c + o - side * 1.4, 5.2, pole.position.z); this.scene.add(bulb);
          } else if (rng.chance(0.6)) {
            this._makePalm(c + o, t + rng.range(-3, 3));
          }
        }
      }
    }
  }

  _buildBeach() {
    const rng = this.rng;
    // Boardwalk strip along the sand, umbrellas, a lifeguard tower.
    const board = this._box(440, 0.3, 10, this._mat(0xa97c50), 0, 0.15, CFG.BEACH_Z + 2);
    board.receiveShadow = true;
    for (let x = -180; x < 200; x += 42) {
      const ux = x + rng.range(-6, 6);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), this._mat(0xe8e0d0));
      pole.position.set(ux, 1.5, CFG.BEACH_Z + 22); this.scene.add(pole);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 10),
        this._mat(rng.pick([0xff6b6b, 0x4ecdc4, 0xffe66d, 0xff9f43])));
      umb.position.set(ux, 3.6, CFG.BEACH_Z + 22); this.scene.add(umb);
    }
    // Lifeguard tower.
    const lg = this._box(4, 5, 4, this._mat(0xffffff), 120, 2.5, CFG.BEACH_Z + 30);
    this._box(5, 0.5, 5, this._mat(0xff5a5a), 120, 5.2, CFG.BEACH_Z + 30);
    this.colliders.push({ minX: 118, maxX: 122, minZ: CFG.BEACH_Z + 28, maxZ: CFG.BEACH_Z + 32 });
  }

  _buildHarbour() {
    const rng = this.rng;
    const wood = this._mat(0x8a6b46);
    // Three piers reaching into the eastern sea.
    for (const pz of [-124, -31, 62]) {
      this._box(46, 0.4, 7, wood, CFG.HARBOUR_X + 24, 0.2, pz);
      for (let px = CFG.HARBOUR_X + 6; px < CFG.HARBOUR_X + 46; px += 9) {
        this._box(1.2, 2.4, 1.2, wood, px, -0.6, pz + 3);
        this._box(1.2, 2.4, 1.2, wood, px, -0.6, pz - 3);
      }
    }
    // Moored boats: hull + cabin + mast.
    for (let i = 0; i < 7; i++) {
      const bx = CFG.HARBOUR_X + rng.range(18, 70);
      const bz = rng.pick([-150, -124, -100, -31, -8, 40, 62, 88]);
      const hull = this._box(rng.range(7, 11), 1.6, 3, this._mat(rng.pick(PALETTE.car)), bx, 0.4, bz);
      hull.rotation.y = rng.range(-0.3, 0.3);
      this._box(3, 1.6, 2, this._mat(0xf4f1de), bx, 1.8, bz).rotation.y = hull.rotation.y;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 6), this._mat(0x5b4a3a));
      mast.position.set(bx, 5, bz); this.scene.add(mast);
    }
    // Lighthouse on a small island, north-east.
    const lx = CFG.WATER_X + 62, lz = -186;
    const island = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 2, 18), this._mat(0x9a8a6a));
    island.position.set(lx, 0.4, lz); this.scene.add(island);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 22, 14),
      this._mat(0xffffff));
    tower.position.set(lx, 12, lz); tower.castShadow = true; this.scene.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 3, 14),
      this._mat(0xd7263d));
    band.position.set(lx, 17, lz); this.scene.add(band);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe259 }));
    lamp.position.set(lx, 23.6, lz); this.scene.add(lamp);
    // Rotating beam (additive cone).
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe259, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    beam.rotation.z = Math.PI / 2; beam.position.set(lx + 30, 23.6, lz);
    this.scene.add(beam);
    this.lighthouseBeam = beam;
    this.colliders.push({ minX: lx - 5, maxX: lx + 5, minZ: lz - 5, maxZ: lz + 5 });
  }

  _buildBridge() {
    // A low causeway bridge crossing the harbour channel to the lighthouse
    // island, aligned with the street at z = -155. It is a flat road slab
    // (no collider), so the player can walk and drive across it — the final
    // mission step ends on its far side, by the lighthouse.
    const z = -155;
    const deck = this._box(124, 0.24, 14, this._mat(0x6b7280), CFG.HARBOUR_X + 42, 0.12, z);
    deck.receiveShadow = true;
    // Road paint on the deck.
    this._box(122, 0.1, 10, this._mat(0x2f3240), CFG.HARBOUR_X + 42, 0.27, z);
    for (const side of [-1, 1]) {
      this._box(124, 0.8, 0.7, this._mat(0xffd23e), CFG.HARBOUR_X + 42, 0.75, z + side * 6.6);
    }
    // Pink gateway arches over the causeway, and slim supports in the water.
    for (const px of [CFG.HARBOUR_X + 10, CFG.HARBOUR_X + 74]) {
      this._box(2.5, 2, 12, this._mat(0x8a94a6), px, -0.9, z);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(8, 1.0, 8, 16, Math.PI), this._mat(0xff2e88));
      arch.position.set(px, 0.3, z); arch.rotation.y = Math.PI / 2;
      this.scene.add(arch);
    }
  }

  _buildClouds() {
    const rng = this.rng;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 11; i++) {
      const g = new THREE.Group();
      const n = rng.int(3, 5);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 12), 10, 8), mat);
        s.scale.y = 0.45;
        s.position.set(rng.range(-10, 10), rng.range(-1, 1), rng.range(-5, 5));
        g.add(s);
      }
      g.position.set(rng.range(-320, 320), rng.range(68, 105), rng.range(-320, 320));
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  _makeParkedSpots() {
    const rng = this.rng;
    // Parked cars line the edges of streets, facing along the street.
    for (let i = 0; i < 26; i++) {
      const horizontal = rng.chance(0.5);
      const line = rng.pick(this.streetLines);
      const along = rng.range(-CFG.CITY_HALF + 20, CFG.CITY_HALF - 20);
      const side = rng.pick([-1, 1]) * (CFG.STREET_W / 2 - 2.2);
      const x = horizontal ? along : line + side;
      const z = horizontal ? line + side : along;
      // Parallel-parked along the curb, nose pointing down the street, so a
      // stolen car can drive straight off instead of into the block.
      const yaw = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
      this.parkedSpots.push({ x, z, yaw });
    }
  }

  // --- queries used by gameplay ---
  streetPoint(rng, onRoad = true) {
    const line = rng.pick(this.streetLines);
    const along = rng.range(-CFG.CITY_HALF + 10, CFG.CITY_HALF - 10);
    if (rng.chance(0.5)) return { x: along, z: line + (onRoad ? 0 : rng.pick([-1, 1]) * 9) };
    return { x: line + (onRoad ? 0 : rng.pick([-1, 1]) * 9), z: along };
  }

  sidewalkPoint(rng) {
    const line = rng.pick(this.streetLines);
    const along = rng.range(-CFG.CITY_HALF + 10, CFG.CITY_HALF - 10);
    const off = rng.pick([-1, 1]) * (CFG.STREET_W / 2 + CFG.SIDEWALK_W / 2);
    if (rng.chance(0.5)) return { x: along, z: line + off };
    return { x: line + off, z: along };
  }

  // A sidewalk point near (x,z), for staged scenes: picks a street line
  // within `radius` of the point and a spot along it within the same radius.
  sidewalkPointNear(rng, x, z, radius = 45) {
    const near = this.streetLines.filter((l) => Math.abs(l - x) < radius || Math.abs(l - z) < radius);
    const line = near.length ? rng.pick(near) : rng.pick(this.streetLines);
    const onXStreet = Math.abs(line - z) < radius && (Math.abs(line - x) >= radius || rng.chance(0.5));
    const centre = onXStreet ? x : z;
    const along = centre + rng.range(-radius, radius);
    const off = rng.pick([-1, 1]) * (CFG.STREET_W / 2 + CFG.SIDEWALK_W / 2);
    if (onXStreet) return { x: along, z: line + off };
    return { x: line + off, z: along };
  }

  // Push a circle (x,z,r) out of every building collider it overlaps.
  resolveCollision(pos, r) {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) { pos.x += r; continue; }
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      }
    }
    // Keep inside the playable area (east edge is the bridge end / lighthouse).
    pos.x = Math.max(-260, Math.min(335, pos.x));
    pos.z = Math.max(-260, Math.min(262, pos.z));
  }

  update(dt, t) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.6;
      if (c.position.x > 340) c.position.x = -340;
    }
    if (this.lighthouseBeam) this.lighthouseBeam.rotation.y = t * 0.35;
    // Gentle neon flicker on one random sign.
    if (this.neonSigns.length && Math.random() < 0.02) {
      const s = this.neonSigns[Math.floor(Math.random() * this.neonSigns.length)];
      s.visible = !s.visible;
      setTimeout(() => { s.visible = true; }, 120);
    }
  }
}

function S_add(scene, mesh) { scene.add(mesh); }
