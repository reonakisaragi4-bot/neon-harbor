// Neon Harbor — wanted level and Harbor PD pursuit.
// Stars rise on crimes (theft, assault, speeding through crowds) and fall
// when the cops lose sight of you. Police cars spawn on the street grid,
// chase with simple pursuit steering, and ram — on foot they can bust you.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeCarMesh } from './vehicles.js';

export class WantedSystem {
  constructor(onChange) {
    this.level = 0;
    this.unseenT = 0;
    this.onChange = onChange || (() => {});
  }

  add(n, reason) {
    const before = this.level;
    this.level = Math.max(0, Math.min(CFG.WANTED_MAX, this.level + n));
    this.unseenT = 0;
    if (this.level !== before) this.onChange(this.level, reason);
    return this.level;
  }

  // Called every frame: `seen` = any police can see the player.
  update(dt, seen) {
    if (this.level === 0) return;
    if (seen) this.unseenT = 0;
    else {
      this.unseenT += dt;
      if (this.unseenT > CFG.WANTED_DECAY_SEEN) {
        this.unseenT = 0;
        this.level -= 1;
        this.onChange(this.level, 'lost them');
      }
    }
  }
}

export class PoliceManager {
  constructor(scene, world, rng, wanted, sound) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.wanted = wanted;
    this.sound = sound;
    this.cops = []; // {mesh, x, z, heading, speed, ramCooldown, stuckT}
    this.ramCooldown = 0;
  }

  get count() { return this.cops.length; }

  _spawnOne(nearX, nearZ) {
    const mesh = makeCarMesh(0x11131a, 'police');
    // White doors: a pale box slab on each side reads as a patrol livery.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 1.7),
      new THREE.MeshLambertMaterial({ color: 0xf4f1de }));
    door.position.set(0, 0.72, 0.1); mesh.add(door);
    const spot = this.world.streetPoint(this.rng);
    // Spawn on a street 55-95 units from the player.
    let x = spot.x, z = spot.z, tries = 0;
    while (tries++ < 12) {
      const d = Math.hypot(x - nearX, z - nearZ);
      if (d > 55 && d < 100) break;
      const s2 = this.world.streetPoint(this.rng);
      x = s2.x; z = s2.z;
    }
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.cops.push({ mesh, x, z, heading: this.rng.range(0, Math.PI * 2), speed: 0, ramCd: 0, stuckT: 0 });
  }

  update(dt, player, playerCar, onRam) {
    const want = Math.min(this.wanted.level, 4);
    while (this.cops.length < want) this._spawnOne(player.x, player.z);
    while (this.cops.length > want) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    let anyNear = false;
    const t = performance.now() * 0.001;
    for (const c of this.cops) {
      const dx = px - c.x, dz = pz - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 55) anyNear = true;
      // Pursuit steering: turn toward the player, limited turn rate.
      const desired = Math.atan2(dx, dz);
      let dh = desired - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const turn = Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      c.heading += turn;
      const targetSpeed = Math.min(CFG.POLICE_SPEED, 10 + dist * 0.45);
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 0.9);
      const beforeX = c.x, beforeZ = c.z;
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      const pos = new THREE.Vector3(c.x, 0, c.z);
      this.world.resolveCollision(pos, 2.3);
      c.x = pos.x; c.z = pos.z;
      if (Math.abs(pos.x - beforeX) > 0.01 || Math.abs(pos.z - beforeZ) > 0.01) {
        c.stuckT += dt;
        if (c.stuckT > 1.2) { c.heading += Math.PI * 0.7; c.stuckT = 0; }
      } else c.stuckT = 0;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      // Flashing light bar.
      const lb = c.mesh.userData.lightBar;
      if (lb) {
        const phase = Math.floor(t * 6) % 2 === 0;
        lb.red.material.color.setHex(phase ? 0xff2020 : 0x550000);
        lb.blue.material.color.setHex(phase ? 0x101050 : 0x2050ff);
      }
      // Ram: contact with the player.
      c.ramCd -= dt;
      if (dist < 4.2 && c.ramCd <= 0) {
        c.ramCd = 1.4;
        c.speed *= 0.4;
        onRam(dist < 3 ? 10 : 6, c);
      }
      // Despawn stragglers that fell far behind.
      if (dist > 200) {
        this.scene.remove(c.mesh);
        this.cops.splice(this.cops.indexOf(c), 1);
      }
    }
    this.sound.siren(this.cops.length > 0);
    return anyNear;
  }

  // For the minimap: police positions.
  positions() {
    return this.cops.map((c) => ({ x: c.x, z: c.z }));
  }

  clear() {
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.cops = [];
  }
}
