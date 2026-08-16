/**
 * Semua suara dibuat secara sintesis (Web Audio API) — tidak ada file mp3,
 * jadi repo tetap ringan dan tidak ada masalah loading di GitHub Pages.
 */

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.voice = null;
    this._voiceReady = false;
  }

  /** Harus dipanggil dari gesture user (tap tombol MULAI). */
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // ---- suara mesin jet ----
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineGain.connect(this.master);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 1.1;
    this.engineFilter.connect(this.engineGain);

    // dua osilator saw yang sedikit beda frekuensi → getaran mesin
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 62;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'sawtooth';
    this.osc2.frequency.value = 63.7;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(this.engineFilter);

    // desis turbin frekuensi tinggi
    this.turbine = ctx.createOscillator();
    this.turbine.type = 'triangle';
    this.turbine.frequency.value = 520;
    this.turbineGain = ctx.createGain();
    this.turbineGain.gain.value = 0.02;
    this.turbine.connect(this.turbineGain);
    this.turbineGain.connect(this.master);

    // ---- angin / rumble ----
    this.nb = noiseBuffer(ctx, 3);
    this.wind = ctx.createBufferSource();
    this.wind.buffer = this.nb;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    // rumble rendah biar terasa "berat"
    this.rumble = ctx.createBufferSource();
    this.rumble.buffer = this.nb;
    this.rumble.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 110;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.0;
    this.rumble.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.master);

    this.osc1.start();
    this.osc2.start();
    this.turbine.start();
    this.wind.start();
    this.rumble.start();

    // naikkan volume mesin pelan-pelan
    const t = ctx.currentTime;
    this.engineGain.gain.setValueAtTime(0, t);
    this.engineGain.gain.linearRampToValueAtTime(0.16, t + 1.6);

    this.started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
    if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  /** throttle 0..1, speedNorm 0..1 */
  updateEngine(throttle, speedNorm) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 58 + throttle * 96;
    this.osc1.frequency.setTargetAtTime(base, t, 0.12);
    this.osc2.frequency.setTargetAtTime(base * 1.026, t, 0.12);
    this.engineFilter.frequency.setTargetAtTime(360 + throttle * 900, t, 0.15);
    this.engineGain.gain.setTargetAtTime(0.12 + throttle * 0.13, t, 0.2);

    this.turbine.frequency.setTargetAtTime(430 + throttle * 700, t, 0.15);
    this.turbineGain.gain.setTargetAtTime(0.008 + throttle * 0.022, t, 0.2);

    this.windGain.gain.setTargetAtTime(0.012 + speedNorm * 0.055, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(600 + speedNorm * 1500, t, 0.25);
    this.rumbleGain.gain.setTargetAtTime(0.05 + throttle * 0.09, t, 0.25);
  }

  _blip(freq, startAt, dur, type = 'triangle', vol = 0.22) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, startAt);
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(vol, startAt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, startAt + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(startAt);
    o.stop(startAt + dur + 0.05);
  }

  playCorrect() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    // arpeggio ceria naik
    this._blip(523.25, t, 0.16);          // C5
    this._blip(659.25, t + 0.09, 0.16);   // E5
    this._blip(783.99, t + 0.18, 0.28);   // G5
    this._blip(1046.5, t + 0.27, 0.42, 'triangle', 0.18); // C6
  }

  playWrong() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this._blip(196, t, 0.20, 'square', 0.14);
    this._blip(146.8, t + 0.14, 0.34, 'square', 0.14);
  }

  playWhoosh() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.nb;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
  }

  playLevelUp() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this._blip(f, t + i * 0.08, 0.3, 'triangle', 0.16);
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Suara perintah (Text-to-Speech bahasa Indonesia)                    */
/* ------------------------------------------------------------------ */

let cachedVoice = null;
let voicesScanned = false;

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  voicesScanned = true;
  // prioritas: id-ID → in-ID (kode lama) → apa pun yang ada
  cachedVoice =
    voices.find(v => /^id[-_]/i.test(v.lang)) ||
    voices.find(v => /^in[-_]/i.test(v.lang)) ||
    voices.find(v => /indones/i.test(v.name)) ||
    null;
  return cachedVoice;
}

if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  pickVoice();
}

export function speak(text, { rate = 0.88, pitch = 1.05, onEnd } = {}) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return false; }
  try {
    speechSynthesis.cancel();
    if (!voicesScanned) pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'id-ID';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    if (cachedVoice) u.voice = cachedVoice;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    speechSynthesis.speak(u);
    return true;
  } catch (e) {
    onEnd?.();
    return false;
  }
}

export function hasIndonesianVoice() {
  return !!cachedVoice;
}
