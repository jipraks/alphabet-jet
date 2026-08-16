import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Konversi data DeviceOrientation → kemiringan layar (roll & pitch)
 *  Rumus quaternion-nya sama seperti DeviceOrientationControls bawaan
 *  Three.js, jadi hasilnya benar untuk SEMUA orientasi layar
 *  (portrait maupun landscape, kiri maupun kanan).
 * ------------------------------------------------------------------ */

const _zee = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° sumbu X
const _quat = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

const DEG = Math.PI / 180;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function deviceAngles(alpha, beta, gamma, orient) {
  _euler.set(beta, alpha, -gamma, 'YXZ');
  _quat.setFromEuler(_euler);
  _quat.multiply(_q1);
  _quat.multiply(_q0.setFromAxisAngle(_zee, -orient));

  _fwd.set(0, 0, -1).applyQuaternion(_quat);
  _right.set(1, 0, 0).applyQuaternion(_quat);

  return {
    pitch: Math.asin(clamp(_fwd.y, -1, 1)),   // + = hidung HP naik
    roll: Math.asin(clamp(-_right.y, -1, 1))  // + = HP dimiringkan ke kanan
  };
}

/* ------------------------------------------------------------------ */

export class Controls {
  constructor(opts = {}) {
    this.steer = 0;        // -1 (kiri) .. +1 (kanan)
    this.elev = 0;         // -1 (turun) .. +1 (naik)
    this.throttle = 0.55;

    this._rawSteer = 0;
    this._rawElev = 0;

    this.mode = 'touch';
    this.gyroAvailable = false;
    this.gyroActive = false;
    this.sensitivity = 1;
    this.invertPitch = false;

    this._neutral = { pitch: 0, roll: 0 };
    this._last = { pitch: 0, roll: 0 };
    this._hasReading = false;
    this._needCalibrate = true;

    this.rollRange = 32 * DEG;   // miring sejauh ini = belok penuh
    this.pitchRange = 26 * DEG;
    this.deadzone = 0.09;

    this._keys = new Set();
    this._touch = null;
    this.onFirstReading = opts.onFirstReading || null;

    this._bindKeyboard();
  }

  /* ---------------- gyroscope ---------------- */

  static needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  async enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;

    // iOS 13+ wajib minta izin, dan harus dari dalam gesture user
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      } catch (e) {
        return false;
      }
    }

    this._onOrient = (e) => {
      if (e.alpha === null && e.beta === null && e.gamma === null) return;
      const orient = this._screenAngle();
      const a = deviceAngles(
        (e.alpha || 0) * DEG,
        (e.beta || 0) * DEG,
        (e.gamma || 0) * DEG,
        orient
      );
      this._last = a;

      if (!this._hasReading) {
        this._hasReading = true;
        this.gyroAvailable = true;
        this.gyroActive = true;
        this.mode = 'gyro';
        this.onFirstReading?.();
      }
      if (this._needCalibrate) {
        this._neutral = { pitch: a.pitch, roll: a.roll };
        this._needCalibrate = false;
      }
    };

    window.addEventListener('deviceorientation', this._onOrient, true);

    // beri waktu sensor mengirim data pertama
    return new Promise(resolve => {
      let waited = 0;
      const iv = setInterval(() => {
        waited += 120;
        if (this._hasReading) { clearInterval(iv); resolve(true); }
        else if (waited > 1400) { clearInterval(iv); resolve(false); }
      }, 120);
    });
  }

  _screenAngle() {
    let deg = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      deg = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      deg = window.orientation;
    }
    return deg * DEG;
  }

  calibrate() {
    if (this._hasReading) {
      this._neutral = { pitch: this._last.pitch, roll: this._last.roll };
    } else {
      this._needCalibrate = true;
    }
  }

  /* ---------------- sentuh ---------------- */

  attachTouch(el) {
    const maxR = () => Math.min(window.innerWidth, window.innerHeight) * 0.22;

    const down = (e) => {
      if (e.target.closest('.no-drag')) return;
      const p = e.touches ? e.touches[0] : e;
      this._touch = { x: p.clientX, y: p.clientY, id: e.touches ? e.touches[0].identifier : 'm' };
      if (!this.gyroActive) this.mode = 'touch';
    };
    const move = (e) => {
      if (!this._touch) return;
      let p = e;
      if (e.touches) {
        p = [...e.touches].find(t => t.identifier === this._touch.id);
        if (!p) return;
      }
      const r = maxR();
      this._rawSteer = clamp((p.clientX - this._touch.x) / r, -1, 1);
      this._rawElev = clamp(-(p.clientY - this._touch.y) / r, -1, 1);
      if (e.cancelable) e.preventDefault();
    };
    const up = () => {
      this._touch = null;
      if (!this.gyroActive) { this._rawSteer = 0; this._rawElev = 0; }
    };

    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('touchcancel', up, { passive: true });
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /* ---------------- keyboard ---------------- */

  _bindKeyboard() {
    const map = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      KeyQ: 'thrDown', KeyE: 'thrUp',
      BracketLeft: 'thrDown', BracketRight: 'thrUp'
    };
    window.addEventListener('keydown', e => {
      const k = map[e.code];
      if (k) { this._keys.add(k); if (!this.gyroActive) this.mode = 'keyboard'; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      const k = map[e.code];
      if (k) this._keys.delete(k);
    });
  }

  /* ---------------- update ---------------- */

  update(dt) {
    let targetSteer = 0;
    let targetElev = 0;

    if (this.gyroActive && this._hasReading) {
      const dRoll = this._last.roll - this._neutral.roll;
      const dPitch = this._last.pitch - this._neutral.pitch;
      targetSteer = clamp(dRoll / this.rollRange, -1, 1);
      targetElev = clamp(dPitch / this.pitchRange, -1, 1);
      if (this.invertPitch) targetElev = -targetElev;
    } else {
      targetSteer = this._rawSteer;
      targetElev = this._rawElev;
    }

    // keyboard selalu boleh menimpa (berguna saat tes di laptop)
    if (this._keys.size) {
      if (this._keys.has('left')) targetSteer = -1;
      if (this._keys.has('right')) targetSteer = 1;
      if (this._keys.has('up')) targetElev = 1;
      if (this._keys.has('down')) targetElev = -1;
      if (this._keys.has('thrUp')) this.throttle = clamp(this.throttle + dt * 0.6, 0, 1);
      if (this._keys.has('thrDown')) this.throttle = clamp(this.throttle - dt * 0.6, 0, 1);
    }

    // zona mati: tangan anak tidak pernah benar-benar diam
    targetSteer = this._applyDeadzone(targetSteer);
    targetElev = this._applyDeadzone(targetElev);

    // kurva respons: pelan di tengah, lincah di ujung → lebih mudah lurus
    targetSteer = Math.sign(targetSteer) * Math.pow(Math.abs(targetSteer), 1.45) * this.sensitivity;
    targetElev = Math.sign(targetElev) * Math.pow(Math.abs(targetElev), 1.45) * this.sensitivity;

    targetSteer = clamp(targetSteer, -1, 1);
    targetElev = clamp(targetElev, -1, 1);

    // low-pass filter — menghilangkan getaran tangan
    const k = 1 - Math.exp(-dt * 9);
    this.steer += (targetSteer - this.steer) * k;
    this.elev += (targetElev - this.elev) * k;
  }

  _applyDeadzone(v) {
    const d = this.deadzone;
    if (Math.abs(v) < d) return 0;
    return Math.sign(v) * (Math.abs(v) - d) / (1 - d);
  }
}

/* ------------------------------------------------------------------ *
 *  Tuas throttle (elemen DOM, bisa digeser jari)
 * ------------------------------------------------------------------ */

export class ThrottleLever {
  constructor(el, controls) {
    this.el = el;
    this.track = el.querySelector('.thr-track');
    this.lever = el.querySelector('.thr-lever');
    this.fill = el.querySelector('.thr-fill');
    this.controls = controls;
    this.dragging = false;

    const setFromY = (clientY) => {
      const r = this.track.getBoundingClientRect();
      const t = 1 - (clientY - r.top) / r.height;
      this.controls.throttle = clamp(t, 0, 1);
    };

    const start = (e) => {
      this.dragging = true;
      const p = e.touches ? e.touches[0] : e;
      setFromY(p.clientY);
      if (e.cancelable) e.preventDefault();
    };
    const move = (e) => {
      if (!this.dragging) return;
      const p = e.touches ? e.touches[0] : e;
      setFromY(p.clientY);
      if (e.cancelable) e.preventDefault();
    };
    const end = () => { this.dragging = false; };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }

  render() {
    const t = this.controls.throttle;
    this.lever.style.bottom = `calc(${(t * 100).toFixed(1)}% - 15px)`;
    this.fill.style.height = `${(t * 100).toFixed(1)}%`;
  }
}
