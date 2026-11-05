// Sons sintetizados com Web Audio (sem arquivos).
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.music = null; this.musicOn = false; }

  // Precisa ser chamado num clique/gesto (regra dos navegadores). Mudo (testes): nunca liga.
  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicOn && !this.music) this.music = new Music(this);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!on && this.music) { this.music.stop(); this.music = null; }
    else if (on && this.ctx && !this.music) this.music = new Music(this);
  }

  _out(pan) {
    const c = this.ctx;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master);
      return p;
    }
    return this.master;
  }

  _tone(freq, dur, vol, pan = 0, type = 'sine', bend = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this._out(pan));
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, freq, q, pan = 0, attack = 0.001) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.loopStart = Math.random(); s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this._out(pan));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  hit(strength = 0.5, pan = 0) {
    const v = 0.25 + Math.min(1, strength) * 0.5;
    this._noise(0.05, v, 2600, 2.5, pan);
    this._tone(1300, 0.04, v * 0.5, pan, 'triangle', 0.6);
  }
  bounce(pan = 0) { this._tone(1050, 0.06, 0.35, pan, 'sine', 0.7); this._noise(0.03, 0.15, 3500, 3, pan); }
  net() { this._noise(0.12, 0.3, 500, 1.2); }
  floor(pan = 0) { this._tone(600, 0.08, 0.18, pan, 'sine', 0.6); }
  click() { this._tone(880, 0.05, 0.2, 0, 'square', 1.2); }
  cheer(big = false) {
    this._noise(big ? 2.4 : 1.4, big ? 0.35 : 0.22, 1200, 0.5, -0.4, 0.25);
    this._noise(big ? 2.4 : 1.4, big ? 0.35 : 0.22, 1700, 0.5, 0.4, 0.3);
  }
  groan() { this._noise(1.0, 0.15, 400, 0.7, 0, 0.15); }
  fanfare(win = true) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.35, 0.22, 0, 'triangle'), i * 160));
  }

  // Máquina lançadora: "tum" grave.
  launch(pan = 0) { this._tone(180, 0.12, 0.3, pan, 'triangle', 0.5); this._noise(0.06, 0.2, 900, 1.5, pan); }
  // Aviso de bola nova (a verde): dois bipes.
  newBall() {
    if (!this.ctx) return;
    this._tone(990, 0.12, 0.2, 0, 'square');
    setTimeout(() => this._tone(1320, 0.16, 0.2, 0, 'square'), 140);
  }
}

// Musiquinha leve em loop (sintetizada): baixo e arpejo simples, volume baixo.
// Sequência em semicolcheias; agenda as notas um pouco à frente com um temporizador.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // pentatônica
const BASS = [0, 0, 7, 7, 5, 5, 7, 2];
const MEL = [4, -1, 5, 3, -1, 4, 2, -1, 3, -1, 5, 6, -1, 4, 3, -1];
class Music {
  constructor(sfx, bpm = 104, root = 196) {
    this.sfx = sfx; this.c = sfx.ctx;
    this.step = 0; this.spb = 60 / bpm / 4; this.root = root;
    this.out = this.c.createGain(); this.out.gain.value = 0.07; this.out.connect(sfx.master);
    this.next = this.c.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 60);
  }
  _note(semi, t, dur, type, vol) {
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = this.root * Math.pow(2, semi / 12);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  _schedule() {
    while (this.next < this.c.currentTime + 0.25) {
      const k = this.step % 16, bar = Math.floor(this.step / 16) % BASS.length;
      if (k % 4 === 0) this._note(BASS[bar] - 12, this.next, this.spb * 3, 'triangle', 0.9);
      const m = MEL[k];
      if (m >= 0 && (bar % 2 === 0 || k < 8)) this._note(SCALE[(m + bar) % SCALE.length], this.next, this.spb * 1.6, 'square', 0.18);
      if (k % 2 === 1) this._note(36, this.next, 0.03, 'square', 0.05); // chimbal
      this.next += this.spb; this.step++;
    }
  }
  stop() { clearInterval(this.timer); this.out.disconnect(); }
}
