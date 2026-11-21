// Neon Harbor — box-built cars: parked stealables, street traffic and police.
// A car is a body + cabin + wheels + lights; traffic follows the street grid,
// slows for the car ahead, and turns at intersections. The player-driven car
// uses simple arcade physics (accel, brake, steering, drift on hard turns).
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x14161c });
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x1c2f45 });

export function makeCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const isPolice = kind === 'police';
  const bodyLen = kind === 'truck' ? 5.4 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, bodyLen), bodyMat);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, kind === 'truck' ? 1.6 : 2.2), GLASS_MAT);
  cabin.position.set(0, 1.28, kind === 'truck' ? 0.9 : -0.2); cabin.castShadow = true; g.add(cabin);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 2.4), bodyMat);
    bed.position.set(0, 1.05, -1.3); g.add(bed);
  }
  // Bumpers, headlights, taillights.
  const chrome = new THREE.MeshLambertMaterial({ color: 0xcfd6de });
  const bumpF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 0.25), chrome);
  bumpF.position.set(0, 0.42, bodyLen / 2); g.add(bumpF);
  const bumpB = bumpF.clone(); bumpB.position.z = -bodyLen / 2; g.add(bumpB);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), headMat);
    hl.position.set(sx, 0.72, bodyLen / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tl.position.set(sx, 0.72, -bodyLen / 2 - 0.02); g.add(tl);
  }
  // Wheels.
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w); wheels.push(w);
  }
  if (isPolice) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.4; bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.x = 0.4; bar.add(blue);
    bar.position.set(0, 1.72, -0.2);
    g.add(bar);
    g.userData.lightBar = { red, blue };
  }
  g.userData.wheels = wheels;
  g.userData.kind = kind;
  return g;
}

// --- Player-driven car physics -------------------------------------------
export class DriveCar {
  constructor(mesh) {
    this.mesh = mesh;
    this.speed = 0;
    this.heading = 0;   // radians, 0 = facing -z? we use forward = (sin h, cos h) in xz
    this.pos = new THREE.Vector3();
    this.steer = 0;
    this.skidding = false;
  }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this._syncMesh();
  }

  _syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.06;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }

  // input: {fwd, back, left, right} booleans. Returns speed for HUD/audio.
  update(dt, input, world, others) {
    const accel = input.fwd ? CFG.CAR_ACCEL : 0;
    const brake = input.back ? CFG.CAR_BRAKE : 0;
    if (accel) this.speed += accel * dt;
    if (brake) this.speed -= (this.speed > 0.5 ? brake : CFG.CAR_ACCEL * 0.5) * dt;
    if (!accel && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    this.speed = Math.max(-10, Math.min(CFG.CAR_TOP_SPEED, this.speed));
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    const spd = this.speed;
    if (Math.abs(spd) > 0.3) {
      this.heading += this.steer * CFG.CAR_STEER * dt * Math.min(1, Math.abs(spd) / 12) * Math.sign(spd);
    }
    this.skidding = Math.abs(this.steer) > 0.7 && Math.abs(spd) > 16;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const nx = this.pos.x + fx * spd * dt;
    const nz = this.pos.z + fz * spd * dt;
    // Building collision: slide along walls, lose speed on impact.
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx; this.pos.z = nz;
    world.resolveCollision(this.pos, 2.4);
    if ((this.pos.x !== nx || this.pos.z !== nz) && Math.abs(spd) > 4) this.speed *= 0.55;
    // Soft bumps against other cars.
    for (const o of others) {
      if (!o || o === this) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 16 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        this.pos.x = o.x + (dx / d) * 4;
        this.pos.z = o.z + (dz / d) * 4;
        this.speed *= 0.7;
      }
    }
    this._syncMesh();
    return this.speed;
  }
}

// --- Traffic: cars that cruise the grid, turn at intersections -----------
export class TrafficManager {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];       // {mesh, axis, dir, lane, speed, targetSpeed}
    this.parked = [];     // {mesh, x, z, yaw, taken}
    this._spawnParked();
    this._spawnTraffic(CFG.TRAFFIC_COUNT);
  }

  _spawnParked() {
    for (const spot of this.world.parkedSpots) {
      const kind = this.rng.chance(0.25) ? 'truck' : 'sedan';
      const mesh = makeCarMesh(this.rng.pick(PALETTE.car), kind);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.yaw;
      this.scene.add(mesh);
      this.parked.push({ mesh, x: spot.x, z: spot.z, yaw: spot.yaw, taken: false, kind });
    }
  }

  // One traffic car on a given street line; shared by the city-wide spawn
  // and by staged shots that need cars near the camera.
  _makeTrafficCar(axis, line, dir, along) {
    const mesh = makeCarMesh(this.rng.pick(PALETTE.car), this.rng.chance(0.2) ? 'truck' : 'sedan');
    const lane = dir > 0 ? 3.4 : -3.4; // right-hand traffic
    const car = {
      mesh, axis, dir, lane,
      speed: this.rng.range(7, 12),
      targetSpeed: this.rng.range(7, 12),
      x: axis === 'x' ? along : line + lane,
      z: axis === 'x' ? line + lane : along,
    };
    this.scene.add(mesh);
    this.cars.push(car);
    this._syncCar(car);
    return car;
  }

  _spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const line = this.rng.pick(this.world.streetLines);
      const dir = this.rng.pick([-1, 1]);
      const along = this.rng.range(-CFG.CITY_HALF, CFG.CITY_HALF);
      this._makeTrafficCar(axis, line, dir, along);
    }
  }

  // Stage n extra traffic cars on streets near (cx,cz) — used by the
  // screenshot scenes so the road by the camera is never empty. `exclude`
  // is a {x,z} point (e.g. the player's car) kept clear of staged cars.
  spawnNear(cx, cz, n, exclude = null) {
    const nearLines = this.world.streetLines.filter((l) => Math.abs(l - cx) < 60 || Math.abs(l - cz) < 60);
    for (let i = 0; i < n; i++) {
      const line = nearLines.length ? this.rng.pick(nearLines) : this.rng.pick(this.world.streetLines);
      const onXStreet = Math.abs(line - cz) < 60 && (Math.abs(line - cx) >= 60 || this.rng.chance(0.5));
      const axis = onXStreet ? 'x' : 'z';
      const centre = axis === 'x' ? cx : cz;
      const along = centre + this.rng.range(-45, 45);
      const dir = this.rng.pick([-1, 1]);
      const x = axis === 'x' ? along : line + (dir > 0 ? 3.4 : -3.4);
      const z = axis === 'x' ? line + (dir > 0 ? 3.4 : -3.4) : along;
      if (exclude && Math.hypot(x - exclude.x, z - exclude.z) < 13) continue;
      if (Math.abs(x) > CFG.CITY_HALF + 4 || Math.abs(z) > CFG.CITY_HALF + 4) continue;
      this._makeTrafficCar(axis, line, dir, along);
    }
  }

  _syncCar(c) {
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.axis === 'x'
      ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (c.dir > 0 ? 0 : Math.PI);
    for (const w of c.mesh.userData.wheels) w.rotation.x += c.speed * 0.02;
  }

  // Nearest car ahead on the same lane, for following behaviour.
  _carAhead(c) {
    let best = null, bestD = 14;
    for (const o of this.cars) {
      if (o === c || o.axis !== c.axis || o.dir !== c.dir) continue;
      const alongC = c.axis === 'x' ? c.x : c.z;
      const alongO = o.axis === 'x' ? o.x : o.z;
      const d = (alongO - alongC) * c.dir;
      const laneC = c.axis === 'x' ? c.z : c.x;
      const laneO = o.axis === 'x' ? o.z : o.x;
      if (d > 0 && d < bestD && Math.abs(laneC - laneO) < 1) { best = o; bestD = d; }
    }
    return best;
  }

  update(dt, playerCar) {
    for (const c of this.cars) {
      const ahead = this._carAhead(c);
      const want = ahead ? 0 : c.targetSpeed;
      c.speed += (want - c.speed) * Math.min(1, dt * 1.5);
      if (playerCar) {
        // Don't rear-end the player's car.
        const dx = playerCar.x - c.x, dz = playerCar.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 12) {
          const along = c.axis === 'x' ? dx : dz;
          if (along * c.dir > 0) c.speed = Math.min(c.speed, 2);
        }
      }
      const step = c.speed * c.dir * dt;
      if (c.axis === 'x') c.x += step; else c.z += step;
      // At the grid edge or an intersection, sometimes turn onto a cross street.
      const along = c.axis === 'x' ? c.x : c.z;
      const nearLine = this.world.streetLines.some((l) => Math.abs(along - l) < 1.2);
      if ((Math.abs(along) > CFG.CITY_HALF + 4) || (nearLine && this.rng.chance(dt * 0.12))) {
        const cross = this.rng.pick(this.world.streetLines);
        const newAxis = c.axis === 'x' ? 'z' : 'x';
        const newDir = this.rng.pick([-1, 1]);
        const lane = newDir > 0 ? 3.4 : -3.4;
        if (newAxis === 'x') { c.axis = 'x'; c.dir = newDir; c.z = cross + lane; c.x = Math.max(-CFG.CITY_HALF, Math.min(CFG.CITY_HALF, c.x)); }
        else { c.axis = 'z'; c.dir = newDir; c.x = cross + lane; c.z = Math.max(-CFG.CITY_HALF, Math.min(CFG.CITY_HALF, c.z)); }
        if (Math.abs(along) > CFG.CITY_HALF + 4) {
          // Wrap to the far side instead of driving off the map.
          if (c.axis === 'x') c.x = -Math.sign(c.x) * CFG.CITY_HALF;
          else c.z = -Math.sign(c.z) * CFG.CITY_HALF;
        }
      }
      this._syncCar(c);
    }
  }

  // Nearest free parked car to (x,z) within radius, for stealing.
  nearestParked(x, z, radius = 5) {
    let best = null, bestD = radius;
    for (const p of this.parked) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  // A traffic car the player can also steal if it stops nearby (rare).
  nearestTraffic(x, z, radius = 6) {
    let best = null, bestD = radius;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD && c.speed < 2) { best = c; bestD = d; }
    }
    return best;
  }
}
