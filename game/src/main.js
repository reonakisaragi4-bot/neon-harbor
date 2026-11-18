// Neon Harbor — bootstrap, game loop, input, save/load, car theft.
// Wires every system together: world, traffic, pedestrians, police, missions,
// combat, HUD, sound. No network, no assets from disk beyond this folder.
import * as THREE from 'three';
import { CFG, SPAWN } from './config.js';
import { hashSeed, makeRng } from './rng.js';
import { SoundEngine } from './audio.js';
import { World } from './world.js';
import { TrafficManager, DriveCar, makeCarMesh } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { WantedSystem, PoliceManager } from './police.js';
import { MissionManager, MISSIONS } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'neonHarborSave.v1';
const urlParams = new URLSearchParams(location.search);
const SEED = urlParams.has('seed') ? Number(urlParams.get('seed')) || 1 : hashSeed('neon-harbor');

class Game {
  constructor() {
    this.rng = makeRng(SEED);
    this.sound = new SoundEngine();
    this.hud = new HUD();
    this.cash = 0;
    this.clockMin = CFG.CLOCK_START_MIN;
    this.state = 'menu'; // menu | playing | paused | over
    this.cruise = false; // staged shots: hold a gentle speed so the speedo reads live
    this.keys = {};
    this.mouse = { down: false, lastX: 0, lastY: 0 };
    this.missionCash = 0;
    this.shotMode = urlParams.has('shot');

    // Renderer / scene / camera.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'webgl';
    document.getElementById('app').prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc9ea);
    this.scene.fog = new THREE.Fog(0x9fd8ef, 420, 950);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1400);

    // Sun-soaked lighting: warm sun + sky bounce.
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe9b0, 1.7);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -300; sun.shadow.camera.right = 300;
    sun.shadow.camera.top = 300; sun.shadow.camera.bottom = -300;
    sun.shadow.camera.far = 800;
    this.scene.add(sun);

    // World + systems.
    this.world = new World(this.scene, this.rng);
    this.traffic = new TrafficManager(this.scene, this.world, this.rng);
    this.peds = new PedestrianManager(this.scene, this.world, this.rng);
    this.player = new Player(this.scene);
    this.wanted = new WantedSystem((level, reason) => this._onWantedChange(level, reason));
    this.police = new PoliceManager(this.scene, this.world, this.rng, this.wanted, this.sound);
    this.missions = new MissionManager(this.scene, this.hud, this.sound, (t, d) => this._onMissionEvent(t, d));
    this.combat = new Combat(this.scene, this.camera, this.sound, (t, d) => this._onCombatEvent(t, d));

    this.driveCar = null;      // DriveCar wrapping the stolen car's mesh
    this.stolenParked = null;  // parked record currently being driven
    this.cashSpots = [];
    this._makeCashSpots();
    this._wireUI();
    this._wireInput();
    this.player.place(SPAWN.x, SPAWN.z, SPAWN.yaw);
    this._updateLoadButton();

    // Start the render loop immediately so the title screen has a live city behind it.
    this.clock = new THREE.Clock();
    this._loop();
    if (this.shotMode) {
      const name = urlParams.get('shot') || 'cover';
      applyShot(this, name);
    }
  }

  // --- cash pickups -------------------------------------------------------
  _makeCashSpots() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dff9b });
    for (let i = 0; i < 6; i++) {
      const p = this.world.sidewalkPoint(this.rng);
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), mat);
      mesh.position.set(p.x, 1.4, p.z);
      this.scene.add(mesh);
      this.cashSpots.push({ mesh, x: p.x, z: p.z, active: true, respawnT: 0 });
    }
  }

  // --- UI wiring ----------------------------------------------------------
  _wireUI() {
    const $ = (id) => document.getElementById(id);
    $('startBtn').addEventListener('click', () => { this.sound.init(); this.sound.click(); this.startGame({}); });
    $('loadBtn').addEventListener('click', () => { this.sound.init(); this.sound.click(); this.startGame({ load: true }); });
    $('resumeBtn').addEventListener('click', () => this.resume());
    $('saveBtn').addEventListener('click', () => { this.saveGame(); $('saveMsg').textContent = 'Saved ✓ — progress kept in this browser.'; });
    $('restartBtn').addEventListener('click', () => { localStorage.removeItem(SAVE_KEY); location.reload(); });
    $('quitBtn').addEventListener('click', () => location.reload());
    $('retryBtn').addEventListener('click', () => { localStorage.removeItem(SAVE_KEY); location.reload(); });
    $('overQuitBtn').addEventListener('click', () => location.reload());
    $('pauseBtn').addEventListener('click', () => this.togglePause());
    $('muteBtn').addEventListener('click', () => this.toggleMute());
    $('missionPanel').addEventListener('click', () => this._toggleMissions(false));
  }

  _wireInput() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Tab') { e.preventDefault(); if (this.state === 'playing') this._toggleMissions(); }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing' || this.state === 'paused') this.togglePause();
      }
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'Digit1') this._setWeapon('fists');
      if (e.code === 'Digit2') this._setWeapon('pistol');
      if (e.code === 'KeyE') this._onInteract();
      if (e.code === 'KeyF') this._onPunch();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const cv = this.renderer.domElement;
    cv.addEventListener('mousedown', (e) => {
      this.mouse.down = true; this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY;
      if (this.state === 'playing' && this.combat.weapon === 'pistol') this._onShoot();
    });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    addEventListener('mousemove', (e) => {
      if (!this.mouse.down || this.state !== 'playing') return;
      const dx = e.clientX - this.mouse.lastX, dy = e.clientY - this.mouse.lastY;
      this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY;
      this.player.camYaw -= dx * 0.005;
      this.player.camPitch = Math.max(-0.1, Math.min(1.1, this.player.camPitch + dy * 0.004));
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.player.camDist = Math.max(4.5, Math.min(14, this.player.camDist + Math.sign(e.deltaY) * 0.8));
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  // --- state transitions --------------------------------------------------
  startGame({ load = false, shot = false } = {}) {
    this.sound.init();
    if (load) this._applySave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'));
    else if (!shot) {
      this.cash = 0; this.missionCash = 0;
      this.missions.index = 0; this.missions.state = 'idle';
    }
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('overScreen').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    if (!load && !shot && this.missions.index === 0 && this.missions.state === 'idle') {
      // Mission 1 starts the moment you step into the city.
      this.missions.start();
      this.hud.showDialogue([
        ['Rico Vane', 'Jax — Pier 9. Now. Don\'t keep me waiting, kid.'],
        ['Jax Marlowe', 'On my way, Rico. Neon Harbor, I\'m back.'],
      ]);
    }
    this.hud.setCash(this.cash);
    this.hud.setStars(this.wanted.level);
    this.hud.setWeapon(this.combat.weapon);
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pauseScreen').classList.remove('hidden');
      document.getElementById('saveMsg').textContent = '';
    } else if (this.state === 'paused') this.resume();
  }
  resume() {
    this.state = 'playing';
    document.getElementById('pauseScreen').classList.add('hidden');
  }

  toggleMute() {
    this.sound.setMuted(!this.sound.muted);
    document.getElementById('muteBtn').textContent = this.sound.muted ? '🔇' : '🔊';
  }

  _toggleMissions(force) {
    const panel = document.getElementById('missionPanel');
    const show = force !== undefined ? force : panel.style.display !== 'flex';
    panel.style.display = show ? 'flex' : 'none';
    if (show) this.hud.renderMissions(MISSIONS, this.missions.index, this.missionCash);
  }

  _setWeapon(w) {
    if (this.state !== 'playing') return;
    this.combat.setWeapon(w);
    this.hud.setWeapon(w);
    this.sound.click();
  }

  gameOver(kind) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.sound.busted();
    this.sound.siren(false);
    this.sound.engine(0, false);
    const t = document.getElementById('overTitle');
    const x = document.getElementById('overText');
    if (kind === 'busted') {
      t.textContent = 'BUSTED';
      x.textContent = 'Harbor PD dragged you in. The job will have to wait — bail is $500.';
    } else {
      t.textContent = 'WASTED';
      x.textContent = 'Neon Harbor took you down. Rico sends his regards.';
    }
    document.getElementById('overScreen').classList.remove('hidden');
  }

  // --- save / load ----------------------------------------------------------
  saveGame() {
    const s = {
      cash: this.cash, missionCash: this.missionCash,
      missionIndex: this.missions.index,
      health: this.player.health,
      x: this.player.x, z: this.player.z, yaw: this.player.yaw,
      clockMin: this.clockMin,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  }
  _applySave(s) {
    if (!s) return;
    this.cash = s.cash || 0; this.missionCash = s.missionCash || 0;
    this.missions.index = Math.min(s.missionIndex || 0, MISSIONS.length);
    this.player.health = s.health ?? 100;
    this.player.place(s.x ?? SPAWN.x, s.z ?? SPAWN.z, s.yaw ?? SPAWN.yaw);
    this.clockMin = s.clockMin ?? CFG.CLOCK_START_MIN;
  }
  _updateLoadButton() {
    try {
      if (localStorage.getItem(SAVE_KEY)) document.getElementById('loadBtn').classList.remove('hidden');
    } catch { /* private mode: no saves */ }
  }

  // --- events from systems --------------------------------------------------
  _onWantedChange(level, reason) {
    this.hud.setStars(level);
    if (level > 0 && reason) this.hud.toast(`Wanted ★${level} — ${reason}`, 2200);
  }
  _onMissionEvent(type, data) {
    if (type === 'reward') {
      this.cash += data.amount; this.missionCash += data.amount;
      this.hud.setCash(this.cash);
      this.hud.toast(`💰 Mission complete: ${data.title}  +$${data.amount}`, 3600);
      this.saveGame();
    } else if (type === 'wanted') {
      this.wanted.add(data.n, data.reason);
    } else if (type === 'complete') {
      this.hud.toast('★ THE HARBOR JOB COMPLETE ★  +$2,000 — free roam!', 5000);
    }
  }
  _onCombatEvent(type, data) {
    if (type === 'wanted') this.wanted.add(data.n, data.reason);
    else if (type === 'hitPed') this.hud.toast(data.weapon === 'pistol' ? 'Target down.' : 'Down he goes.', 1200);
    else if (type === 'hitCop') {
      this.hud.toast('You hit a cop car!', 1500);
      this.wanted.add(1, 'attacking police');
    }
  }

  // --- interaction: E key ----------------------------------------------------
  _onInteract() {
    if (this.state !== 'playing') return;
    if (this.hud.dialogueOpen) { this.hud.advanceDialogue(); return; }
    if (this.player.inCar) { this._exitCar(); return; }
    // Start a mission at its marker.
    const marker = this.missions.startMarkerPos();
    if (marker && Math.hypot(marker.x - this.player.x, marker.z - this.player.z) < 7) {
      this.missions.start();
      return;
    }
    // Steal the nearest parked car.
    const parked = this.traffic.nearestParked(this.player.x, this.player.z, 5.5);
    if (parked) { this._enterCar(parked); return; }
  }

  _onPunch() {
    if (this.state !== 'playing' || this.player.inCar) return;
    this.combat.punch(this.player.pos, this.player.yaw, this.peds);
  }
  _onShoot() {
    if (this.state !== 'playing' || this.player.inCar) return;
    this.combat.shoot(this.player.pos, this.peds, this.police);
  }

  _enterCar(parked) {
    parked.taken = true;
    this.stolenParked = parked;
    this.driveCar = new DriveCar(parked.mesh);
    this.driveCar.place(parked.x, parked.z, parked.yaw);
    this.player.inCar = true;
    this.player.mesh.visible = false;
    this.wanted.add(1, 'grand theft auto');
    this.hud.toast('🚗 Car stolen! Lose the cops.', 2200);
    this.sound.engine(0, true);
  }

  _exitCar() {
    const car = this.driveCar;
    if (!car) return;
    const side = car.heading + Math.PI / 2;
    const px = car.x + Math.sin(side) * 3, pz = car.z + Math.cos(side) * 3;
    this.player.inCar = false;
    this.player.mesh.visible = true;
    this.player.place(px, pz, car.heading);
    // The car stays where it stopped, stealable again.
    this.traffic.parked.push({ mesh: car.mesh, x: car.x, z: car.z, yaw: car.heading, taken: false, kind: 'sedan' });
    this.driveCar = null; this.stolenParked = null;
    this.sound.engine(0, false);
  }

  // --- debug / shot helpers --------------------------------------------------
  teleportPlayer(x, z, yaw) { this.player.place(x, z, yaw); }
  setCash(n) { this.cash = n; this.hud.setCash(n); }
  setWanted(n) { this.wanted.level = n; this.hud.setStars(n); }
  setClock(min) { this.clockMin = min; }
  spawnPoliceAt(list) {
    for (const p of list) {
      const mesh = makeCarMesh(0x11131a, 'police');
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 1.7),
        new THREE.MeshLambertMaterial({ color: 0xf4f1de }));
      door.position.set(0, 0.72, 0.1); mesh.add(door);
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.police.cops.push({ mesh, x: p.x, z: p.z, heading: Math.PI / 2, speed: 12, ramCd: 0, stuckT: 0 });
    }
  }
  enterCarAt(color, x, z, heading, kind) {
    const mesh = makeCarMesh(color, kind || 'sedan');
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.driveCar = new DriveCar(mesh);
    this.driveCar.place(x, z, heading);
    this.player.inCar = true;
    this.player.mesh.visible = false;
  }
  setMissionActive(idx, step) {
    this.missions.index = idx;
    this.missions.state = 'active';
    this.missions.step = step;
    this.missions._enterStep();
  }
  setCameraPreset(name, opts = {}) {
    if (name === 'chase') {
      this.cameraPreset = null;
      this.player.camYaw = this.driveCar ? this.driveCar.heading + Math.PI : this.player.yaw + Math.PI;
    } else if (name === 'orbit') {
      // Fixed orbit for staged shots: overrides the driving chase cam.
      this.cameraPreset = {
        yaw: opts.yaw ?? this.player.camYaw,
        pitch: opts.pitch ?? 0.32,
        dist: opts.dist ?? 9,
      };
    }
  }

  // Fixed-orbit camera for staged shots (framing the chase from the front).
  _applyPresetCamera() {
    const p = this.cameraPreset;
    const target = this.driveCar
      ? new THREE.Vector3(this.driveCar.x, 1.8, this.driveCar.z)
      : new THREE.Vector3(this.player.x, 1.7, this.player.z);
    const cx = target.x - Math.sin(p.yaw) * Math.cos(p.pitch) * p.dist;
    const cz = target.z - Math.cos(p.yaw) * Math.cos(p.pitch) * p.dist;
    const cy = target.y + Math.sin(p.pitch) * p.dist;
    this.camera.position.set(cx, Math.max(0.8, cy), cz);
    this.camera.lookAt(target);
  }

  // --- main loop ---------------------------------------------------------------
  _inputState() {
    const k = this.keys;
    const cruiseFwd = this.cruise && this.driveCar && this.driveCar.speed < 12;
    return {
      fwd: !!(k.KeyW || k.ArrowUp) || cruiseFwd, back: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft), right: !!(k.KeyD || k.ArrowRight),
      run: !!k.ShiftLeft || !!k.ShiftRight,
      jump: !!k.Space,
    };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.state === 'playing') this._update(dt, t);
    else {
      // Menu / pause / game-over: keep the world breathing behind the overlay.
      this.world.update(dt, t);
      this.traffic.update(dt, null);
    }
    this.player.updateCamera(this.camera, dt, this.player.inCar,
      this.driveCar ? this.driveCar.pos : null,
      this.driveCar ? this.driveCar.heading : 0);
    if (this.cameraPreset) this._applyPresetCamera();
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt, t) {
    const input = this._inputState();
    const inCar = this.player.inCar;
    let speedKmh = 0;

    if (inCar && this.driveCar) {
      const others = this.traffic.cars.map((c) => ({ x: c.x, z: c.z }));
      const spd = this.driveCar.update(dt, input, this.world, others);
      speedKmh = Math.abs(spd) * 3.6;
      this.sound.engine(Math.abs(spd) / CFG.CAR_TOP_SPEED, true);
      if (this.driveCar.skidding && Math.random() < dt * 6) this.sound.skid();
      // Speeding through crowds scares peds — and the law notices.
      if (Math.abs(spd) > 18 && Math.random() < dt * 0.5) {
        this.peds.scare(this.driveCar.x, this.driveCar.z, 12);
      }
    } else {
      this.player.update(dt, input, this.world);
      this.sound.engine(0, false);
    }
    const pSpeed = inCar ? Math.abs(this.driveCar.speed) : this.player.speed;
    const pPos = inCar ? this.driveCar.pos : this.player.pos;
    this.traffic.update(dt, inCar ? this.driveCar : null);
    this.peds.update(dt, pPos, pSpeed, inCar);
    this.world.update(dt, t);
    this.combat.update(dt);

    // Police chase + wanted decay.
    const seen = this.police.update(dt, this.player, inCar ? this.driveCar : null, (dmg) => {
      if (inCar) { this.player.hurt(Math.round(dmg / 2)); if (this.driveCar) this.driveCar.speed *= 0.5; }
      else if (this.player.hurt(dmg)) this.gameOver('busted');
      if (this.player.health <= 0 && this.state === 'playing') this.gameOver(inCar ? 'wasted' : 'busted');
    });
    this.wanted.update(dt, seen);
    // Slow health regen when the heat is off.
    if (this.wanted.level === 0 && this.player.health > 0 && this.player.health < 100) {
      this.player.heal(dt * 2);
    }

    // Missions.
    this.missions.update(dt, pPos, inCar);

    // Cash pickups.
    for (const c of this.cashSpots) {
      if (c.active) {
        c.mesh.rotation.y += dt * 2;
        c.mesh.position.y = 1.4 + Math.sin(t * 2 + c.x) * 0.25;
        if (Math.hypot(c.x - pPos.x, c.z - pPos.z) < 2.6) {
          c.active = false; c.mesh.visible = false; c.respawnT = 20;
          this.cash += 50; this.missionCash += 50;
          this.hud.setCash(this.cash);
          this.sound.pickup();
          this.hud.toast('💵 +$50 street cash', 1400);
        }
      } else {
        c.respawnT -= dt;
        if (c.respawnT <= 0) {
          const p = this.world.sidewalkPoint(this.rng);
          c.x = p.x; c.z = p.z; c.mesh.position.set(p.x, 1.4, p.z);
          c.active = true; c.mesh.visible = true;
        }
      }
    }

    // Clock.
    this.clockMin = (this.clockMin + dt * CFG.CLOCK_RATE) % (24 * 60);

    // Interact prompt.
    let prompt = null;
    if (!inCar && !this.hud.dialogueOpen) {
      const marker = this.missions.startMarkerPos();
      if (marker && Math.hypot(marker.x - this.player.x, marker.z - this.player.z) < 7) {
        prompt = `E — Start mission: ${MISSIONS[this.missions.index].title}`;
      } else if (this.traffic.nearestParked(this.player.x, this.player.z, 5.5)) {
        prompt = 'E — Steal car';
      }
    } else if (inCar) prompt = 'E — Exit car';
    this.hud.setInteract(prompt);

    // HUD refresh.
    this.hud.setHealth(this.player.health);
    this.hud.setSpeed(speedKmh, inCar);
    this.hud.setClock(this.clockMin);
    this.hud.setObjective(this.missions.objectiveText(pPos));
    this._minimapT = (this._minimapT || 0) + dt;
    if (this._minimapT > 0.15) {
      this._minimapT = 0;
      const target = this.missions.state === 'active'
        ? this.missions.currentTarget : this.missions.startMarkerPos();
      this.hud.drawMinimap({
        playerX: pPos.x, playerZ: pPos.z, playerYaw: inCar ? this.driveCar.heading : this.player.yaw,
        inCar, police: this.police.positions(),
        traffic: this.traffic.cars.map((c) => ({ x: c.x, z: c.z })),
        peds: this.peds.peds.filter((p) => p.state !== 'down').map((p) => ({ x: p.x, z: p.z })),
        target, cashSpots: this.cashSpots.filter((c) => c.active),
        streetLines: this.world.streetLines,
      });
    }
  }
}

new Game();
