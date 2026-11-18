// Neon Harbor — combat: fists up close, a pistol at range.
// A shot fires a ray from the camera: nearest ped or police car in the cone
// takes the hit, with a muzzle flash, a tracer line and a thud. Hitting
// people raises the wanted level; punching does too, a little less.
import * as THREE from 'three';

export class Combat {
  constructor(scene, camera, sound, onEvent) {
    this.scene = scene;
    this.camera = camera;
    this.sound = sound;
    this.onEvent = onEvent; // ('wanted', {n, reason}) | ('hitPed', ped) | ('hitCop', cop)
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.cooldown = 0;
    // Muzzle flash: a point light + a sprite that live for one frame-ish.
    this.flash = new THREE.PointLight(0xffd27a, 0, 14);
    this.scene.add(this.flash);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(this.tracerGeo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.scene.add(this.tracer);
    this.tracerT = 0;
  }

  setWeapon(w) { this.weapon = w; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerT * 8);
      this.flash.intensity = Math.max(0, this.tracerT * 40);
    }
  }

  // Punch: anything standing within 2.2m in front of the player.
  punch(playerPos, playerYaw, peds) {
    if (this.cooldown > 0) return false;
    this.cooldown = 0.45;
    this.sound.punch();
    const fx = Math.sin(playerYaw), fz = Math.cos(playerYaw);
    const ped = peds.nearestInCone(playerPos.x, playerPos.z, fx, fz, 2.4, 0.6);
    if (ped) {
      peds.knockDown(ped);
      this.onEvent('hitPed', { ped, weapon: 'fists' });
      this.onEvent('wanted', { n: 1, reason: 'assault' });
      return true;
    }
    return false;
  }

  // Shoot: ray from the camera through the crosshair.
  shoot(playerPos, peds, police) {
    if (this.cooldown > 0) return false;
    this.cooldown = 0.32;
    this.sound.shot();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone();
    // Muzzle position: just in front of the camera.
    const muzzle = origin.clone().addScaledVector(dir, 1.2);
    this.flash.position.copy(muzzle);
    this.flash.intensity = 60;
    // Find the nearest hit: peds first, then police cars.
    const fx = dir.x, fz = dir.z;
    const ped = peds.nearestInCone(playerPos.x, playerPos.z, fx, fz, 46, 0.985);
    let end = origin.clone().addScaledVector(dir, 46);
    let hit = false;
    if (ped) {
      end = new THREE.Vector3(ped.x, 1.2, ped.z);
      peds.knockDown(ped);
      this.onEvent('hitPed', { ped, weapon: 'pistol' });
      hit = true;
    } else {
      // Police cars: nearest cop within the cone.
      let best = null, bestD = 46;
      for (const c of police.cops) {
        const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1 || d > bestD) continue;
        if ((dx * fx + dz * fz) / d > 0.985) { best = c; bestD = d; }
      }
      if (best) {
        end = new THREE.Vector3(best.x, 1.1, best.z);
        this.onEvent('hitCop', { cop: best });
        hit = true;
      }
    }
    // Tracer line muzzle -> end.
    const pos = this.tracerGeo.attributes.position;
    pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.tracerT = 0.12;
    this.tracer.material.opacity = 0.9;
    if (hit) this.onEvent('wanted', { n: 1, reason: 'shooting' });
    return hit;
  }
}
