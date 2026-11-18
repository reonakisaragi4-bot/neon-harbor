// Neon Harbor — the story: four missions, "The Harbor Job".
// Each mission is a list of steps (go to a place, wait, survive a timer,
// talk to a character). A beacon marks the current target in the world and
// on the minimap; dialogue plays in the HUD; cash is paid on completion.
// Missions are sequential — finish one to unlock the next.
import * as THREE from 'three';
import { CFG, NAMES } from './config.js';

export const MISSIONS = [
  {
    id: 'first-contact',
    title: '1 · First Contact',
    intro: 'Rico Vane is waiting at Pier 9. Get over there and hear him out.',
    reward: 200,
    steps: [
      {
        type: 'goto', label: 'Meet Rico Vane at Pier 9',
        target: () => ({ x: 250, z: -124 }),
        radius: 7,
        talk: [
          ['Rico Vane', 'Jax! You look terrible. Prison agrees with you, huh?'],
          ['Jax Marlowe', 'Cut the jokes, Rico. What\'s the job?'],
          ['Rico Vane', 'Small stuff first. Prove you can still drive, then we talk real money.'],
        ],
      },
    ],
  },
  {
    id: 'getaway',
    title: '2 · Getaway Driver',
    intro: 'Rico needs a wheelman. Steal a car and reach the beach hideout in 90 seconds.',
    reward: 500,
    steps: [
      {
        type: 'goto', label: 'Steal a car — any car on the street (E)',
        target: () => ({ x: -31, z: -31 }),
        radius: 6, needCar: true,
        talk: [['Rico Vane', 'Wheels, Jax. Grab any ride on the street and get moving.']],
      },
      {
        type: 'timed', label: 'Reach the beach hideout before the timer runs out',
        target: () => ({ x: -93, z: 244 }),
        radius: 9, time: 90, needCar: true,
      },
    ],
  },
  {
    id: 'delivery',
    title: '3 · The Delivery',
    intro: 'Pick up the package at Coral Row market, then run it to the Docklands warehouse. The cops are jumpy — expect heat.',
    reward: 800,
    steps: [
      {
        type: 'goto', label: 'Pick up the package at Coral Row market',
        target: () => ({ x: 62, z: 62 }),
        radius: 7,
        onArrive: 'pickup',
        talk: [['Dealer', 'Package is in the trunk. No peeking. Warehouse at the docks — go.']],
      },
      {
        type: 'goto', label: 'Deliver the package to the Docklands warehouse',
        target: () => ({ x: 200, z: 62 }),
        radius: 8,
        onArrive: 'deliver',
      },
    ],
  },
  {
    id: 'heist',
    title: '4 · The Harbour Heist',
    intro: 'The big one. Crack the harbour vault, hold the pier while the alarm screams, then lose the cops across the bridge.',
    reward: 2000,
    steps: [
      {
        type: 'goto', label: 'Reach the harbour vault on Pier 9',
        target: () => ({ x: 252, z: 62 }),
        radius: 7,
        talk: [['Rico Vane', 'Vault\'s on the pier. Thirty seconds of drilling and the harbour is ours.']],
      },
      {
        type: 'hold', label: 'Hold the pier — crack the vault (stay in the ring)',
        target: () => ({ x: 252, z: 62 }),
        radius: 10, time: 25,
        onStart: 'alarm',
      },
      {
        type: 'goto', label: 'Escape across the bridge to the lighthouse',
        target: () => ({ x: 320, z: -155 }),
        radius: 12,
        talk: [['Rico Vane', 'You did it, Jax. The harbor is ours. Lay low — and spend it well.']],
      },
    ],
  },
];

export class MissionManager {
  constructor(scene, hud, sound, onEvent) {
    this.scene = scene;
    this.hud = hud;
    this.sound = sound;
    this.onEvent = onEvent; // (type, data) -> game: 'reward', 'wanted', 'toast', 'complete'
    this.index = 0;
    this.step = 0;
    this.state = 'idle'; // idle | active | done
    this.timer = 0;
    this.holdT = 0;
    this.beacon = this._makeBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.currentTarget = null;
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30; g.add(beam);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    diamond.position.y = 9; g.add(diamond);
    g.userData.diamond = diamond;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.25, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    return g;
  }

  get mission() { return MISSIONS[this.index]; }
  get finished() { return this.index >= MISSIONS.length; }

  start() {
    if (this.finished) return;
    this.state = 'active';
    this.step = 0;
    this._enterStep();
    this.hud.toast(this.mission.title);
  }

  _enterStep() {
    const s = this.mission.steps[this.step];
    this.timer = s.time || 0;
    this.holdT = 0;
    this.currentTarget = s.target();
    this.beacon.position.set(this.currentTarget.x, 0, this.currentTarget.z);
    this.beacon.visible = true;
    if (s.talk) this.hud.showDialogue(s.talk);
    if (s.onStart === 'alarm') this.onEvent('wanted', { n: 2, reason: 'vault alarm' });
  }

  objectiveText(playerPos) {
    if (this.finished) return '★ Story complete — Neon Harbor is yours. Free roam!';
    if (this.state !== 'active') return 'Press E at the ★ marker to start: ' + this.mission.title;
    const s = this.mission.steps[this.step];
    const d = playerPos ? Math.round(Math.hypot(this.currentTarget.x - playerPos.x, this.currentTarget.z - playerPos.z)) : 0;
    let extra = '';
    if (s.type === 'timed') extra = ` — ${Math.max(0, Math.ceil(this.timer))}s left!`;
    if (s.type === 'hold') extra = ` — hold ${Math.max(0, Math.ceil(this.timer))}s`;
    return `${s.label}  ·  <span class="dist">${d}m</span>${extra}`;
  }

  // Returns true while the mission chain is running.
  update(dt, playerPos, inCar) {
    if (this.state !== 'active' || this.finished) return;
    const s = this.mission.steps[this.step];
    const d = Math.hypot(this.currentTarget.x - playerPos.x, this.currentTarget.z - playerPos.z);
    // Beacon spin + bob.
    this.beacon.userData.diamond.rotation.y += dt * 2;
    this.beacon.userData.diamond.position.y = 9 + Math.sin(performance.now() * 0.002) * 0.8;
    if (s.type === 'goto') {
      if (s.needCar && !inCar) return; // wait until the player is driving
      if (d < s.radius) this._arrive(s);
    } else if (s.type === 'timed') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.hud.toast('Too slow! Try again.');
        this._restartMission();
        return;
      }
      if (s.needCar && !inCar) return;
      if (d < s.radius) this._arrive(s);
    } else if (s.type === 'hold') {
      if (d < s.radius) {
        this.timer -= dt;
        if (this.timer <= 0) this._arrive(s);
      } else {
        this.timer = Math.min(s.time, this.timer + dt * 0.5); // slipping out refills the timer
      }
    }
  }

  _arrive(s) {
    if (s.onArrive === 'pickup') this.onEvent('wanted', { n: 1, reason: 'package pickup' });
    if (s.onArrive === 'deliver') this.sound.cash();
    this.step += 1;
    if (this.step >= this.mission.steps.length) this._complete();
    else this._enterStep();
  }

  _restartMission() {
    this.step = 0;
    this._enterStep();
  }

  _complete() {
    const m = this.mission;
    this.beacon.visible = false;
    this.state = 'idle';
    this.sound.missionDone();
    this.onEvent('reward', { amount: m.reward, title: m.title });
    this.index += 1;
    if (!this.finished) {
      this.hud.toast('Mission complete! Next: ' + MISSIONS[this.index].title);
    } else {
      this.onEvent('complete', {});
    }
  }

  // The player can also trigger the start marker by walking to it.
  startMarkerPos() {
    if (this.finished || this.state === 'active') return null;
    // Start marker: the first step's target of the next mission.
    return MISSIONS[this.index].steps[0].target();
  }
}
