// Neon Harbor — pedestrians: low-poly people strolling the sidewalks.
// They follow sidewalk lanes, turn at intersections, and flee when a fast
// car or a shouting player comes at them. Shot or punched, they fall, fade,
// and respawn elsewhere.
import * as THREE from 'three';
import { CFG } from './config.js';

const SHIRT = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95d5b2, 0xf78fb3, 0x74c0fc, 0xffa94d, 0xb197fc];
const PANTS = [0x2b2d42, 0x495057, 0x6c757d, 0x343a40, 0x5f6c7b];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x2b2118 }));
  hair.position.y = 1.95; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26),
    new THREE.MeshLambertMaterial({ color: pants }));
  legL.position.set(-0.16, 0.38, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2),
    new THREE.MeshLambertMaterial({ color: shirt }));
  armL.position.set(-0.42, 1.14, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

export class PedestrianManager {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < CFG.PED_COUNT; i++) this._spawn();
  }

  // Stage n extra pedestrians on sidewalks near (cx,cz) — used by the
  // screenshot scenes so the sidewalks by the camera are never empty.
  // `exclude` is a {x,z} point (e.g. the player) kept clear of staged peds.
  spawnNear(cx, cz, n, exclude = null) {
    for (let i = 0; i < n; i++) {
      const p = this.world.sidewalkPointNear(this.rng, cx, cz, 45);
      if (exclude && Math.hypot(p.x - exclude.x, p.z - exclude.z) < 2.5) continue;
      this._spawn(p);
    }
  }

  _spawn(at = null) {
    const rng = this.rng;
    const p = at || this.world.sidewalkPoint(rng);
    const mesh = makePersonMesh(rng.pick(SHIRT), rng.pick(PANTS), rng.pick(SKIN));
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const ped = {
      mesh, axis, dir: rng.pick([-1, 1]),
      speed: rng.range(0.9, 1.7), walkPhase: rng.range(0, 6),
      state: 'walk', fleeT: 0, downT: 0, x: p.x, z: p.z,
    };
    mesh.rotation.y = axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
    this.peds.push(ped);
    return ped;
  }

  // A threat (player car speeding, or the player on foot sprinting close)
  // makes nearby pedestrians run away from it.
  scare(x, z, radius = 9) {
    for (const p of this.peds) {
      if (p.state !== 'walk') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.state = 'flee'; p.fleeT = 3.5;
        p.fleeX = (p.x - x) / (d || 1); p.fleeZ = (p.z - z) / (d || 1);
        p.speed = 4.6;
      }
    }
  }

  // Hit test for combat: nearest standing ped within `maxDist` of (x,z)
  // and within a cone around the forward direction (fx,fz).
  nearestInCone(x, z, fx, fz, maxDist = 42, cosHalf = 0.94) {
    let best = null, bestD = maxDist;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const dx = p.x - x, dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 1 || d > bestD) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > cosHalf) { best = p; bestD = d; }
    }
    return best;
  }

  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.downT = 0;
    ped.mesh.rotation.x = -Math.PI / 2; // fall flat
    ped.mesh.position.y = 0.35;
  }

  update(dt, playerPos, playerSpeed, inCar) {
    for (const p of this.peds) {
      if (p.state === 'down') {
        p.downT += dt;
        p.mesh.visible = p.downT < 4.5;
        p.mesh.scale.y = Math.max(0.01, 1 - Math.max(0, p.downT - 3.5));
        if (p.downT > 5) {
          // Respawn fresh elsewhere.
          this.scene.remove(p.mesh);
          const i = this.peds.indexOf(p);
          this.peds.splice(i, 1);
          this._spawn();
        }
        continue;
      }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        p.x += p.fleeX * p.speed * dt;
        p.z += p.fleeZ * p.speed * dt;
        p.mesh.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
        if (p.fleeT <= 0) { p.state = 'walk'; p.speed = this.rng.range(0.9, 1.7); }
      } else {
        // Stroll along the sidewalk; turn at intersections sometimes.
        const step = p.speed * p.dir * dt;
        if (p.axis === 'x') p.x += step; else p.z += step;
        const along = p.axis === 'x' ? p.x : p.z;
        const nearLine = this.world.streetLines.some((l) => Math.abs(along - l) < 0.8);
        if (Math.abs(along) > CFG.CITY_HALF + 2 || (nearLine && this.rng.chance(dt * 0.25))) {
          const cross = this.rng.pick(this.world.streetLines);
          const off = this.rng.pick([-1, 1]) * (CFG.STREET_W / 2 + CFG.SIDEWALK_W / 2);
          if (p.axis === 'x') { p.axis = 'z'; p.dir = this.rng.pick([-1, 1]); p.x = cross + off; }
          else { p.axis = 'x'; p.dir = this.rng.pick([-1, 1]); p.z = cross + off; }
          if (Math.abs(along) > CFG.CITY_HALF + 2) {
            if (p.axis === 'x') p.x = -Math.sign(p.x) * CFG.CITY_HALF;
            else p.z = -Math.sign(p.z) * CFG.CITY_HALF;
          }
          p.mesh.rotation.y = p.axis === 'x'
            ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
        }
        // Flee a speeding car or a sprinting player.
        const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
        if (d < 7 && ((inCar && playerSpeed > 8) || (!inCar && playerSpeed > 7.5))) {
          this.scare(playerPos.x, playerPos.z, 8);
        }
      }
      // Walk-cycle swing.
      p.walkPhase += dt * (p.state === 'flee' ? 11 : 6) * Math.max(0.4, p.speed / 1.5);
      const s = Math.sin(p.walkPhase) * 0.5;
      const u = p.mesh.userData;
      u.legL.rotation.x = s; u.legR.rotation.x = -s;
      u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
      p.mesh.position.set(p.x, p.mesh.position.y, p.z);
    }
  }
}
