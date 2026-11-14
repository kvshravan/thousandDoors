/**
 * Plays a room's track. Until owners can choose real music, tracks are short
 * loops (original note patterns in the room data) synthesized with Web Audio.
 */

const LOOKAHEAD_S = 0.3;
const SCHEDULE_EVERY_MS = 50;
const VOLUME = 0.07;

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

export class MusicPlayer {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this.audio = null;
    this.master = null;
    this.track = null;
    this.sourceId = null;
    this.playing = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
  }

  get supported() {
    return Boolean(window.AudioContext || window.webkitAudioContext);
  }

  get state() {
    return { playing: this.playing, title: this.track?.title ?? null, sourceId: this.sourceId };
  }

  /** Starts a track. Must be called from a user gesture (browser autoplay rules). */
  play(track, sourceId) {
    if (!this.supported || !track?.notes?.length) return false;
    this._halt();
    if (!this.audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      this.audio = new Context();
    }
    this.audio.resume?.().catch(() => {});
    this.master = this.audio.createGain();
    this.master.gain.value = VOLUME;
    this.master.connect(this.audio.destination);
    this.track = track;
    this.sourceId = sourceId;
    this.playing = true;
    this._step = 0;
    this._nextTime = this.audio.currentTime + 0.05;
    this._schedule();
    this._timer = window.setInterval(() => this._schedule(), SCHEDULE_EVERY_MS);
    this.onChange?.(this.state);
    return true;
  }

  stop() {
    if (!this.playing) return;
    this._halt();
    this.onChange?.(this.state);
  }

  dispose() {
    this._halt();
    this.audio?.close().catch(() => {});
    this.audio = null;
  }

  _halt() {
    window.clearInterval(this._timer);
    this._timer = null;
    if (this.master && this.audio) {
      const master = this.master;
      master.gain.setTargetAtTime(0, this.audio.currentTime, 0.04);
      window.setTimeout(() => master.disconnect(), 300);
    }
    this.master = null;
    this.playing = false;
  }

  _schedule() {
    if (!this.playing || !this.audio) return;
    const beat = 60 / (this.track.tempo ?? 90) / 2;
    const { notes } = this.track;
    while (this._nextTime < this.audio.currentTime + LOOKAHEAD_S) {
      const note = notes[this._step % notes.length];
      if (typeof note === 'number') this._playNote(note, this._nextTime, beat * 1.6);
      this._nextTime += beat;
      this._step += 1;
    }
  }

  _playNote(note, time, duration) {
    const osc = this.audio.createOscillator();
    osc.type = this.track.wave ?? 'triangle';
    osc.frequency.value = midiToHz(note);
    const envelope = this.audio.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(1, time + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(envelope).connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}
