// Neon Harbor — the player: Jax Marlowe, a low-poly third-person character.
// Walk / run / jump on foot with a mouse-orbit chase camera; the camera pulls
// back and steadies when driving. Movement is camera-relative.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makePersonMesh } from './pedestrians.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = makePersonMesh(0x1b9aaa, 0x2b2d42, 0xe0ac69);
    // Jax stands out: teal jacket, gold chain, dark cap.
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    chain.position.set(0, 1.42, 0.18); chain.rotation.x = 0.35;
    this.mesh.add(chain);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44),
      new THREE.MeshLambertMaterial({ color: 0xd7263d }));
    cap.position.y = 1.98; this.mesh.add(cap);
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(-31, 0, 31);
    this.yaw = Math.PI * 0.75;      // facing
    this.velY = 0;
    this.grounded = true;
    this.walkPhase = 0;
    this.moving = false;
    this.speed = 0;
    this.health = 100;
    this.inCar = false;
    this.car = null;

    // Camera orbit state.
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.32;
    this.camDist = 7.5;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  place(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw; this.camYaw = yaw;
    this.velY = 0;
    this._syncMesh();
  }

  _syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  // input: {fwd,back,left,right,run,jump} — camera-relative movement.
  update(dt, input, world) {
    if (this.inCar) return;
    const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
    const rightX = Math.sin(this.camYaw + Math.PI / 2), rightZ = Math.cos(this.camYaw + Math.PI / 2);
    let mx = 0, mz = 0;
    if (input.fwd) { mx += fwdX; mz += fwdZ; }
    if (input.back) { mx -= fwdX; mz -= fwdZ; }
    if (input.right) { mx += rightX; mz += rightZ; }
    if (input.left) { mx -= rightX; mz -= rightZ; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    const targetSpeed = this.moving ? (input.run ? CFG.RUN_SPEED : CFG.WALK_SPEED) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (this.moving) {
      const nx = mx / len, nz = mz / len;
      this.yaw = Math.atan2(nx, nz);
      this.pos.x += nx * this.speed * dt;
      this.pos.z += nz * this.speed * dt;
      world.resolveCollision(this.pos, 0.6);
    }
    // Jump + gravity.
    if (input.jump && this.grounded) { this.velY = CFG.JUMP_VEL; this.grounded = false; }
    if (!this.grounded) {
      this.velY -= CFG.GRAVITY * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.grounded = true; }
    }
    // Walk-cycle swing.
    if (this.moving && this.grounded) this.walkPhase += dt * this.speed * 1.6;
    const s = Math.sin(this.walkPhase) * (this.moving ? 0.55 : 0);
    const u = this.mesh.userData;
    u.legL.rotation.x = s; u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7;
    // Idle breathing.
    if (!this.moving) u.torso.scale.y = 1 + Math.sin(performance.now() * 0.002) * 0.012;
    this._syncMesh();
  }

  // Chase camera: position from orbit angles, look at the player (or the car).
  updateCamera(camera, dt, driving, carPos, carHeading) {
    const target = driving && carPos
      ? new THREE.Vector3(carPos.x, 1.6, carPos.z)
      : new THREE.Vector3(this.pos.x, 1.7 + this.pos.y * 0.5, this.pos.z);
    let yaw, pitch, dist;
    if (driving) {
      // Chase cam: behind the car, easing toward its heading.
      const desired = carHeading + Math.PI;
      let dy = desired - this.camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.camYaw += dy * Math.min(1, dt * 2.2);
      yaw = this.camYaw; pitch = 0.24; dist = 11;
    } else {
      yaw = this.camYaw; pitch = this.camPitch; dist = this.camDist;
    }
    const cx = target.x - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z - Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + Math.sin(pitch) * dist;
    camera.position.set(cx, Math.max(0.6, cy), cz);
    camera.lookAt(target);
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }
}
