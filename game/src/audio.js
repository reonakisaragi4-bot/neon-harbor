// Neon Harbor — all sound is synthesised with WebAudio. No audio files exist.
// Engine hum, two-tone police siren, gunshots, punches, cash chimes and UI
// clicks are all oscillators and filtered noise, built at runtime.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this._noiseBuf = null;
  }

  // Must be called from a user gesture (Start button) — browsers block audio before that.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Shared noise buffer for shots / punches / skids.
    const len = this.ctx.sampleRate * 0.5;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._startEngineLoop();
    this._startSirenLoop();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _startEngineLoop() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2); g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
  }

  // speed01: 0..1 of top speed. Call every frame while driving; 0 idles quiet.
  engine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 52 + speed01 * 150;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 1400, t, 0.1);
  }

  _startSirenLoop() {
    const ctx = this.ctx;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    const lfo = ctx.createOscillator();
    lfo.type = 'square'; lfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 190;
    lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start(); lfo.start();
  }

  siren(on) {
    if (!this.ctx) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.3);
  }

  _noiseBurst(dur, filterFreq, gain, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = type; flt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(); src.stop(ctx.currentTime + dur);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  shot() { this._noiseBurst(0.16, 1800, 0.5, 'highpass'); this._tone(140, 0.12, 0.35, 'square', 50); }
  punch() { this._noiseBurst(0.12, 300, 0.5); }
  pickup() { this._tone(880, 0.1, 0.22); setTimeout(() => this._tone(1318, 0.16, 0.22), 90); }
  cash() { this._tone(1046, 0.09, 0.25); setTimeout(() => this._tone(1568, 0.22, 0.25), 90); }
  click() { this._tone(660, 0.06, 0.15, 'square'); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 0.22), i * 110)); }
  busted() { this._tone(220, 0.5, 0.3, 'sawtooth', 55); }
  skid() { this._noiseBurst(0.25, 900, 0.12, 'bandpass'); }
}
