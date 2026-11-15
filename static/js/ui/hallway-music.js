/**
 * The hallway's sound: an empty, echoing void. A low hum and slow, dark chords in
 * a long echo. Riding is a little brighter; opening a door creaks.
 * Everything is synthesized live with Web Audio; there are no audio files.
 *
 * Browsers only allow sound after a user gesture, so start() must come from one.
 */

const LOOKAHEAD_S = 0.3;
const SCHEDULE_EVERY_MS = 50;
const VOLUME = 0.36;
const TEMPO = { overview: 56, ride: 70 };
const STEPS_PER_BAR = 16;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const rand = (low, high) => low + Math.random() * (high - low);

// D minor, slowly: Dm(add9), Bbmaj7, Gm6, A7(b9). Roots, and the chord's voicing.
const CHORDS = [
  { root: 50, tones: [50, 57, 62, 64] },
  { root: 46, tones: [50, 53, 57, 58] },
  { root: 43, tones: [50, 55, 58, 64] },
  { root: 45, tones: [49, 55, 57, 58] },
];

export class HallwayMusic {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this.audio = null;
    this.playing = false;
    this.mode = 'overview';
    this.tempo = TEMPO.overview;
    this.intensity = 0;
    this._timer = null;
    this._step = 0;
    this._next = 0;
    this._levels = null;
    this._onVisibility = () => this._syncVisibility();
  }

  get supported() {
    return Boolean(window.AudioContext || window.webkitAudioContext);
  }

  get state() {
    return {
      playing: this.playing,
      mode: this.mode,
      tempo: Math.round(this.tempo),
      context: this.audio?.state ?? null,
      level: this.level(),
    };
  }

  /** Loudness of what's playing right now (RMS, 0..1). */
  level() {
    if (!this.analyser) return 0;
    this._levels ??= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this._levels);
    let sum = 0;
    for (const v of this._levels) sum += v * v;
    return Math.sqrt(sum / this._levels.length);
  }

  /** Starts the sound (call from a click or key press). */
  start() {
    if (!this.supported) return false;
    if (!this.audio) this._build();
    this.audio.resume?.().catch(() => {});
    if (this.playing) return true;
    const now = this.audio.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.linearRampToValueAtTime(VOLUME, now + 2.5);
    this.playing = true;
    this._step = 0;
    this._next = now + 0.1;
    this._schedule();
    this._timer = window.setInterval(() => this._schedule(), SCHEDULE_EVERY_MS);
    document.addEventListener('visibilitychange', this._onVisibility);
    this.onChange?.(this.state);
    return true;
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this._timer);
    this._timer = null;
    document.removeEventListener('visibilitychange', this._onVisibility);
    const now = this.audio.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.2);
    // The drone runs continuously; let the device rest once it's quiet.
    window.setTimeout(() => {
      if (!this.playing) this.audio?.suspend().catch(() => {});
    }, 1500);
    this.onChange?.(this.state);
  }

  /** 'overview' or 'ride': riding is a little quicker and brighter. */
  setMode(mode) {
    this.mode = mode === 'ride' ? 'ride' : 'overview';
    if (!this.audio) return;
    const now = this.audio.currentTime;
    const riding = this.mode === 'ride';
    this.padFilter.frequency.setTargetAtTime(riding ? 1300 : 700, now, 0.8);
    this.onChange?.(this.state);
  }

  /** An old door swinging open: the latch, then a long, squeaky hinge. */
  creak() {
    if (!this.playing) return;
    const t = this.audio.currentTime;
    this._clank(t, 0.5, { base: 140, wet: 0.25, pan: 0 });
    this._creakAt(t + 0.08, { level: 0.5, duration: 0.95, base: 290, pan: -0.15, wet: 0.35 });
    this._creakAt(t + 0.85, { level: 0.35, duration: 0.7, base: 470, pan: -0.1, wet: 0.45 });
  }

  /** Fades everything out (going through a door). */
  fadeOut(seconds = 0.9) {
    if (!this.audio) return;
    const now = this.audio.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  }

  dispose() {
    this.stop();
    this.audio?.close().catch(() => {});
    this.audio = null;
  }

  // ---- Setup ----

  _build() {
    const Context = window.AudioContext || window.webkitAudioContext;
    const ctx = new Context();
    this.audio = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 4;
    compressor.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    compressor.connect(this.analyser);
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(compressor);

    // A huge, dark space: long decaying noise, smoothed so the tail is soft.
    this.reverb = ctx.createConvolver();
    const length = Math.floor(ctx.sampleRate * 4.5);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < length; i += 1) {
        smooth += (Math.random() * 2 - 1 - smooth) * 0.35;
        data[i] = smooth * (1 - i / length) ** 2.2;
      }
    }
    this.reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.reverb.connect(wet).connect(this.master);

    this._buildDrone();

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.5;
    this.padFilter.connect(this.padBus);
    this._out(this.padBus, 0.7);
  }

  /** The vault's hum: low D and A, slowly breathing through a filter. */
  _buildDrone() {
    const ctx = this.audio;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.06;
    const depth = ctx.createGain();
    depth.gain.value = 160;
    breath.connect(depth).connect(filter.frequency);
    breath.start();
    const gain = ctx.createGain();
    gain.gain.value = 0.11;
    filter.connect(gain);
    this._out(gain, 0.5);
    for (const [note, type, detune] of [
      [38, 'sine', 0],
      [45, 'sine', 4],
      [50, 'triangle', -6],
      [57, 'sine', 7],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz(note);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
    }
  }

  /** Sends a node to the mix, with `wet` of it going to the reverb. */
  _out(node, wet) {
    node.connect(this.master);
    if (wet > 0) {
      const send = this.audio.createGain();
      send.gain.value = wet;
      node.connect(send).connect(this.reverb);
    }
  }

  _pan(value) {
    if (!this.audio.createStereoPanner) return this.audio.createGain();
    const panner = this.audio.createStereoPanner();
    panner.pan.value = value;
    return panner;
  }

  /** A gain node that swells to `peak` at `top` seconds and dies away by `end`. */
  _envelope(t, peak, top, end) {
    const gain = this.audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + top);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + end);
    return gain;
  }

  // ---- Scheduling ----

  _schedule() {
    if (!this.playing || !this.audio) return;
    const horizon = this.audio.currentTime + LOOKAHEAD_S;
    while (this._next < horizon) {
      this._playStep(this._step, this._next);
      this.tempo += (TEMPO[this.mode] - this.tempo) * 0.05;
      this.intensity += ((this.mode === 'ride' ? 1 : 0) - this.intensity) * 0.05;
      this._next += 30 / this.tempo;
      this._step += 1;
    }
  }

  _playStep(step, t) {
    const bar = Math.floor(step / STEPS_PER_BAR) % CHORDS.length;
    const pos = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const eighth = 30 / this.tempo;

    if (pos === 0) {
      this._pad(chord.tones, t, eighth * STEPS_PER_BAR);
      this._bass(chord.root - 12, t, eighth * STEPS_PER_BAR);
    }
  }

  // ---- Sounds ----

  /** A metal hit (the door's latch): a few inharmonic partials ringing out. */
  _clank(t, level, { base, wet, pan }) {
    const out = this._pan(pan);
    this._out(out, wet);
    [1, 2.32, 4.25, 6.63].forEach((ratio, i) => {
      const osc = this.audio.createOscillator();
      osc.frequency.value = base * ratio * rand(0.99, 1.01);
      const decay = rand(0.5, 1.6) / (i + 1);
      const gain = this._envelope(t, level / (i + 1), 0.004, decay);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });
  }

  /**
   * A squeaky hinge: a sawtooth sliding up and down in pitch, stuttering on and off
   * (stick-slip friction), through a narrow band like an old door's panel.
   */
  _creakAt(t, { level, duration, base, pan = 0, wet = 0.4 }) {
    const ctx = this.audio;
    const n = 48;
    const pitch = new Float32Array(n);
    const stutter = new Float32Array(n);
    const band = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const f = base * (1 + 0.8 * Math.sin(Math.PI * u) + 0.25 * Math.sin(u * 17)) * rand(0.97, 1.03);
      pitch[i] = f;
      band[i] = f * 2.2;
      stutter[i] = 18 + 30 * Math.sin(Math.PI * u) * rand(0.8, 1.2);
    }
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueCurveAtTime(pitch, t, duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5;
    filter.frequency.setValueCurveAtTime(band, t, duration);

    const slip = ctx.createOscillator();
    slip.type = 'square';
    slip.frequency.setValueCurveAtTime(stutter, t, duration);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const chatter = ctx.createGain();
    chatter.gain.value = 0.5;
    slip.connect(depth).connect(chatter.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.07);
    env.gain.setValueAtTime(level, t + duration * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const out = this._pan(pan);
    osc.connect(filter).connect(chatter).connect(env).connect(out);
    this._out(out, wet);
    for (const o of [osc, slip]) {
      o.start(t);
      o.stop(t + duration + 0.05);
    }
  }

  _pad(tones, t, duration) {
    for (const note of tones) {
      for (const detune of [-9, 9]) {
        const osc = this.audio.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = hz(note);
        osc.detune.value = detune;
        const gain = this.audio.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.045, t + duration * 0.3);
        gain.gain.setTargetAtTime(0.0001, t + duration * 0.8, duration * 0.12);
        osc.connect(gain).connect(this.padFilter);
        osc.start(t);
        osc.stop(t + duration * 1.4);
      }
    }
  }

  _bass(note, t, duration) {
    const osc = this.audio.createOscillator();
    osc.frequency.value = hz(note);
    const gain = this.audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 1.2);
    gain.gain.setTargetAtTime(0.0001, t + duration * 0.85, 0.6);
    osc.connect(gain);
    this._out(gain, 0.3);
    osc.start(t);
    osc.stop(t + duration + 2);
  }

  _syncVisibility() {
    if (!this.audio) return;
    if (document.visibilityState === 'hidden') this.audio.suspend().catch(() => {});
    else if (this.playing) this.audio.resume().catch(() => {});
  }
}
