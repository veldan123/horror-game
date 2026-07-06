// Procedural horror audio — everything is synthesized with WebAudio,
// no sound files needed. Created lazily on first user gesture because
// browsers block audio until then.
export class HorrorAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._heartbeatTimer = null;
    this._creakTimer = null;
    this._shriekReady = true;
  }

  /** Call from a click handler. Safe to call repeatedly. */
  resume() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      // Compressor keeps the scream/jumpscare from clipping into static.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this._startAmbience();
      this._scheduleCreak();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSource(loop = false) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = loop;
    return src;
  }

  // --- Constant background: low beating drone + air rumble + thin whistle ---
  _startAmbience() {
    const ctx = this.ctx;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneGain.connect(this.master);
    for (const freq of [46, 46.8]) { // slightly detuned pair = slow unsettling beat
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(droneGain);
      osc.start();
    }
    // Slowly swell the drone in and out.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    lfo.start();

    // Dull room-tone rumble.
    const rumble = this._noiseSource(true);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 220;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.02;
    rumble.connect(rumbleLp).connect(rumbleGain).connect(this.master);
    rumble.start();

    // Faint whistling, like wind through a vent.
    const wind = this._noiseSource(true);
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 900;
    windBp.Q.value = 12;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.006;
    wind.connect(windBp).connect(windGain).connect(this.master);
    wind.start();
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.11;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 0.004;
    windLfo.connect(windLfoGain).connect(windGain.gain);
    windLfo.start();
  }

  // --- Random one-shot noises every 8–20s: creaks, knocks, distant groans ---
  _scheduleCreak() {
    const delay = 8000 + Math.random() * 12000;
    this._creakTimer = setTimeout(() => {
      const pick = Math.random();
      if (pick < 0.4) this._creak();
      else if (pick < 0.7) this._knock();
      else this._groan();
      this._scheduleCreak();
    }, delay);
  }

  _pan() {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    p.connect(this.master);
    return p;
  }

  _creak() {
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(70, t + 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + 1.4);
    osc.connect(lp).connect(g).connect(this._pan());
    osc.start(t);
    osc.stop(t + 1.5);
  }

  _knock() {
    const ctx = this.ctx, t = ctx.currentTime;
    const knocks = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < knocks; i++) {
      const src = this._noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 150;
      const g = ctx.createGain();
      const start = t + i * (0.35 + Math.random() * 0.2);
      g.gain.setValueAtTime(0.25, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      src.connect(lp).connect(g).connect(this._pan());
      src.start(start);
      src.stop(start + 0.25);
    }
  }

  _groan() {
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55 + Math.random() * 20;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 7;
    vib.connect(vibGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.8);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    osc.connect(g).connect(this._pan());
    osc.start(t); vib.start(t);
    osc.stop(t + 2.7); vib.stop(t + 2.7);
  }

  // --- Monster scream: distorted sawtooth dive + shrieking noise ---
  scream(short = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = short ? 0.7 : 1.6;
    const startF = short ? 1200 : 850;
    const endF = short ? 600 : 250;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 7);
    }
    shaper.curve = curve;

    for (const detune of [0, 35]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(startF, t);
      // Jittery pitch fall — sounds throat-like, not synthetic.
      for (let i = 1; i <= 8; i++) {
        const f = startF + (endF - startF) * (i / 8) + (Math.random() - 0.5) * 120;
        osc.frequency.linearRampToValueAtTime(Math.max(f, 80), t + dur * (i / 8));
      }
      osc.connect(shaper);
      osc.start(t);
      osc.stop(t + dur);
    }

    const breath = this._noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    breath.connect(bp).connect(shaper);
    breath.start(t);
    breath.stop(t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(short ? 0.35 : 0.55, t + 0.04);
    g.gain.setValueAtTime(short ? 0.35 : 0.55, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    shaper.connect(g).connect(this.master);
  }

  /** Occasional shorter shriek while chasing, rate-limited. */
  chaseShriek() {
    if (!this._shriekReady) return;
    this._shriekReady = false;
    this.scream(true);
    setTimeout(() => { this._shriekReady = true; }, 3500 + Math.random() * 2000);
  }

  // --- Heartbeat while being chased ---
  startHeartbeat() {
    if (!this.ctx || this._heartbeatTimer) return;
    const beat = () => {
      this._thump(0.5);
      setTimeout(() => this._thump(0.35), 180);
      this._heartbeatTimer = setTimeout(beat, this._heartbeatInterval);
    };
    this._heartbeatInterval = 900;
    beat();
  }

  /** dist in meters; closer monster = faster heart. */
  setHeartbeatDistance(dist) {
    this._heartbeatInterval = 450 + Math.min(Math.max(dist, 0), 15) * 40;
  }

  stopHeartbeat() {
    clearTimeout(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  _thump(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(52, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  /** Monster footstep thud, volume by distance. */
  monsterStep(dist) {
    if (!this.ctx || dist > 14) return;
    const vol = (1 - dist / 14) * 0.3;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(44, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // --- Stingers ---
  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;

    const noise = this._noiseSource();
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    noise.connect(ng).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.5);

    // Dissonant cluster diving down an octave.
    for (const f of [220, 233, 311, 466]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f / 2, t + 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.9);
    }

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 40;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.7, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + 1.0);

    this.scream();
  }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, delay] of [[1250, 0], [1870, 0.07]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
      osc.connect(g).connect(this.master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.45);
    }
  }

  doorOpen() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const noise = this._noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    noise.connect(lp).connect(g).connect(this.master);
    noise.start(t);
    noise.stop(t + 1.7);
  }
}
