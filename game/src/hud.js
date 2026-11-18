// Neon Harbor — HUD: cash, wanted stars, health, clock, objective, dialogue,
// toasts, and a live 2D canvas minimap (streets, water, beach, player arrow,
// police dots, traffic, mission blip). All DOM, no libraries.
import { CFG } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      clock: document.getElementById('clock'),
      health: document.getElementById('healthfill'),
      weapon: document.getElementById('weapon'),
      speedPanel: document.getElementById('speedPanel'),
      speedo: document.getElementById('speedo'),
      objective: document.getElementById('objective'),
      toast: document.getElementById('toast'),
      interact: document.getElementById('interact'),
      dialogue: document.getElementById('dialogue'),
      dialogueWho: document.querySelector('#dialogue .who'),
      dialogueLine: document.querySelector('#dialogue .line'),
      minimap: document.getElementById('minimap'),
      crosshair: document.getElementById('crosshair'),
      vignette: document.getElementById('vignette'),
      missionList: document.getElementById('missionList'),
      missionCash: document.getElementById('missionCash'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.dialogueQueue = [];
    this.dialogueActive = false;
    this._toastTimer = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setCash(n) { this.el.cash.textContent = '$' + n.toLocaleString('en-US'); }
  setStars(n) {
    let s = '';
    for (let i = 0; i < CFG.WANTED_MAX; i++) s += `<span class="${i < n ? '' : 'off'}">★</span>`;
    this.el.stars.innerHTML = s;
  }
  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.innerHTML = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}<small>NEON HARBOR</small>`;
  }
  setHealth(h) {
    this.el.health.style.width = Math.max(0, h) + '%';
    this.el.vignette.style.opacity = h < 35 ? String((35 - h) / 35 * 0.9) : '0';
  }
  setWeapon(w) {
    this.el.weapon.textContent = w === 'pistol' ? '🔫 Pistol — click to shoot' : '👊 Fists — F to punch';
    this.el.crosshair.style.display = w === 'pistol' ? 'block' : 'none';
  }
  setSpeed(kmh, driving) {
    this.el.speedPanel.classList.toggle('hidden', !driving);
    if (driving) this.el.speedo.innerHTML = `${Math.round(kmh)} <small>km/h</small>`;
  }
  setObjective(html) { this.el.objective.innerHTML = html; }

  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, ms);
  }

  setInteract(text) {
    if (text) { this.el.interact.textContent = text; this.el.interact.style.display = 'block'; }
    else this.el.interact.style.display = 'none';
  }

  // Dialogue: queue of [speaker, line]; E (or click) advances.
  showDialogue(lines) {
    this.dialogueQueue = lines.slice();
    this._nextDialogue();
  }
  _nextDialogue() {
    const next = this.dialogueQueue.shift();
    if (!next) {
      this.dialogueActive = false;
      this.el.dialogue.style.display = 'none';
      return;
    }
    this.dialogueActive = true;
    this.el.dialogueWho.textContent = next[0];
    this.el.dialogueLine.textContent = next[1];
    this.el.dialogue.style.display = 'block';
  }
  advanceDialogue() {
    if (this.dialogueActive) this._nextDialogue();
    return this.dialogueActive;
  }
  get dialogueOpen() { return this.dialogueActive; }

  // Mission panel (Tab).
  renderMissions(missions, index, cash) {
    let html = '';
    missions.forEach((m, i) => {
      const cls = i < index ? 'done' : i === index ? 'now' : 'locked';
      const mark = i < index ? '✓ ' : i === index ? '▶ ' : '· ';
      html += `<div class="${cls}">${mark}${m.title} — $${m.reward}</div>`;
    });
    this.el.missionList.innerHTML = html;
    this.el.missionCash.textContent = '$' + cash.toLocaleString('en-US');
  }

  // --- Minimap ------------------------------------------------------------
  drawMinimap(state) {
    // state: {playerX, playerZ, playerYaw, inCar, police:[{x,z}], traffic:[{x,z}],
    //         peds:[{x,z}], target:{x,z}|null, cashSpots:[{x,z}]}
    const g = this.mm, W = 190, H = 190;
    const S = 340; // world units shown per side (-260..300 mapped into the square)
    const toX = (x) => (x + 260) / 560 * W;
    const toZ = (z) => (z + 260) / 560 * H;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#12233d'; g.fillRect(0, 0, W, H);
    // Water: south + east.
    g.fillStyle = '#1e7fa8';
    g.fillRect(0, toZ(232), W, H - toZ(232));
    g.fillRect(toX(232), 0, W - toX(232), H);
    // Sand.
    g.fillStyle = '#e8d29a';
    g.fillRect(0, toZ(232), W, 6);
    g.fillRect(toX(232), 0, 6, H);
    // City ground.
    g.fillStyle = '#2c3a2c';
    g.fillRect(0, 0, toX(232), toZ(232));
    // Streets.
    g.strokeStyle = '#4a5568'; g.lineWidth = 3;
    const lines = state.streetLines || [];
    for (const c of lines) {
      g.beginPath(); g.moveTo(toX(c), 0); g.lineTo(toX(c), toZ(232)); g.stroke();
      g.beginPath(); g.moveTo(0, toZ(c)); g.lineTo(toX(232), toZ(c)); g.stroke();
    }
    // Blocks.
    g.fillStyle = '#3d4a63';
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const bx = -217 + (i + 0.5) * 62, bz = -217 + (j + 0.5) * 62;
      g.fillRect(toX(bx - 18), toZ(bz - 18), 36 / 560 * W, 36 / 560 * H);
    }
    // Cash pickups.
    g.fillStyle = '#7dff9b';
    for (const c of state.cashSpots || []) {
      g.beginPath(); g.arc(toX(c.x), toZ(c.z), 2.5, 0, Math.PI * 2); g.fill();
    }
    // Traffic.
    g.fillStyle = '#9fb3ff';
    for (const c of state.traffic || []) g.fillRect(toX(c.x) - 1.5, toZ(c.z) - 1.5, 3, 3);
    // Pedestrians.
    g.fillStyle = '#c9d4ff';
    for (const p of state.peds || []) g.fillRect(toX(p.x) - 1, toZ(p.z) - 1, 2, 2);
    // Mission target: pulsing yellow diamond.
    if (state.target) {
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      g.fillStyle = '#ffd23e';
      g.beginPath();
      g.moveTo(toX(state.target.x), toZ(state.target.z) - pulse);
      g.lineTo(toX(state.target.x) + pulse, toZ(state.target.z));
      g.lineTo(toX(state.target.x), toZ(state.target.z) + pulse);
      g.lineTo(toX(state.target.x) - pulse, toZ(state.target.z));
      g.closePath(); g.fill();
    }
    // Police: red dots with white ring.
    for (const c of state.police || []) {
      g.fillStyle = '#ff2a2a';
      g.beginPath(); g.arc(toX(c.x), toZ(c.z), 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
    }
    // Player arrow.
    const px = toX(state.playerX), pz = toZ(state.playerZ);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.atan2(Math.sin(state.playerYaw), Math.cos(state.playerYaw)) + Math.PI);
    g.fillStyle = state.inCar ? '#ff9f43' : '#ffffff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
  }
}
