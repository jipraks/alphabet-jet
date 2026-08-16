import * as THREE from 'three';
import { Terrain, terrainHeight } from './terrain.js';
import { Sky, SUN_DIR } from './sky.js';
import { GameAudio, speak } from './audio.js';
import { Controls, ThrottleLever } from './controls.js';
import { LetterField } from './letters.js';
import { Hud } from './hud.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ================= konstanta penerbangan ================= */
const SPEED_MIN = 52;
const SPEED_MAX = 168;
const MAX_ROLL = THREE.MathUtils.degToRad(62);
const MAX_PITCH = THREE.MathUtils.degToRad(30);
const ROLL_RATE = 2.7;
const PITCH_RATE = 1.7;
const TURN_K = 0.56;
const GROUND_CLEAR = 34;
const CEILING = 2400;

const PRAISE = ['Hebat!', 'Bagus sekali!', 'Keren!', 'Mantap!', 'Pintar!', 'Wah, tepat sekali!'];
const RETRY = ['Ayo coba lagi.', 'Hampir!', 'Tidak apa-apa, coba lagi.'];

/* ================= state ================= */
const S = {
  phase: 'menu',
  score: 0,
  level: 1,
  streak: 0,
  best: 0,
  target: null,
  nextRoundAt: 0,
  showLetter: true,
  muted: false
};

let renderer, scene, camera, terrain, sky, field, hud, controls, thrLever, audio, jetBody;
let plane = { pos: new THREE.Vector3(), heading: 0, pitch: 0, roll: 0, speed: 90 };
let clock, elapsed = 0;
let warnGround = false;
let frameTimes = [], pixelRatio = 1;

/* ================================================================= */
/*  INIT                                                              */
/* ================================================================= */

function init() {
  const canvas = $('scene');

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance'
  });
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbdd3e5, 900, 2480);
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1.5, 12000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  updateFov();

  // cahaya
  scene.add(new THREE.HemisphereLight(0xcfe4f5, 0x4a4433, 1.0));
  const sun = new THREE.DirectionalLight(0xfff3dc, 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sun);

  sky = new Sky(scene);
  terrain = new Terrain(scene);
  field = new LetterField(scene);

  addJetBody();

  hud = new Hud($('hud'));

  controls = new Controls();
  controls.attachTouch($('app'));
  thrLever = new ThrottleLever($('throttle'), controls);

  audio = new GameAudio();

  // posisi awal — cari titik yang tidak di dalam gunung
  plane.pos.set(0, 0, 0);
  plane.pos.y = terrainHeight(0, 0) + 320;
  plane.heading = 0;
  terrain.preload(plane.pos.x, plane.pos.z);

  clock = new THREE.Clock();

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(() => {
    onResize();
    controls.calibrate();   // titik netral ikut berubah saat layar diputar
  }, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.phase === 'playing') pauseGame();
  });

  bindUi();

  // Kait bantu untuk pengujian otomatis — hanya aktif dengan ?debug=1
  if (new URLSearchParams(location.search).has('debug')) {
    window.__jet = {
      state: S, plane, controls,
      get field() { return field; },
      get camera() { return camera; }
    };
  }

  renderer.setAnimationLoop(loop);
}

/* Bagian pesawat yang terlihat dari kokpit (hidung + ujung sayap).
   Titik acuan hidung dipakai untuk menata ulang saat layar berubah. */
const NOSE_Y = -2.55, NOSE_Z = 7.2, NOSE_NDC = -0.60;
const REF_TAN = Math.tan(THREE.MathUtils.degToRad(35));

function addJetBody() {
  jetBody = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: 0x8b98a6, emissive: 0x2b323b, flatShading: true, fog: false
  });
  const matDark = new THREE.MeshLambertMaterial({
    color: 0x4a5462, emissive: 0x1e242b, flatShading: true, fog: false
  });

  // radome / hidung pesawat
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.7, 9.5, 14), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, NOSE_Y, -NOSE_Z);
  jetBody.add(nose);

  // dek hidung di depan kaca — bagian yang paling terlihat pilot
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 2.35, 3.4, 14), matDark);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, NOSE_Y - 0.22, -2.3);
  deck.scale.y = 0.62;   // dipipihkan supaya mirip moncong jet
  jetBody.add(deck);

  // pitot tube di ujung hidung
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), matDark);
  pitot.rotation.x = -Math.PI / 2;
  pitot.position.set(0, NOSE_Y + 0.3, -12.6);
  jetBody.add(pitot);

  camera.add(jetBody);
  layoutJetBody();
}

/* Jaga supaya hidung pesawat selalu duduk di bagian bawah layar,
   berapa pun bidang pandang / rasio layarnya. */
function layoutJetBody() {
  if (!jetBody) return;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const s = t / REF_TAN;
  jetBody.scale.setScalar(s);
  jetBody.position.y = NOSE_NDC * t * NOSE_Z * s - NOSE_Y * s;
}

/* Bidang pandang menyesuaikan bentuk layar: di portrait dilebarkan
   supaya semua huruf pilihan tetap kelihatan. */
function updateFov() {
  const aspect = camera.aspect;
  const hTarget = THREE.MathUtils.degToRad(72);
  const v = 2 * Math.atan(Math.tan(hTarget / 2) / aspect);
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 70, 90);
  camera.updateProjectionMatrix();
}

/* ================================================================= */
/*  UI                                                                */
/* ================================================================= */

function segment(el, cb) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    [...el.children].forEach(c => c.classList.toggle('on', c === b));
    cb(b.dataset.v);
  });
}

function bindUi() {
  let ctrlPref = 'gyro';

  segment($('ctrlSeg'), v => {
    ctrlPref = v;
    $('ctrlHint').textContent = v === 'gyro'
      ? 'Pegang HP seperti setir, lalu miringkan kiri/kanan untuk belok.'
      : 'Sentuh layar lalu geser jari untuk mengarahkan pesawat.';
  });
  segment($('sensSeg'), v => { controls.sensitivity = parseFloat(v); syncSeg($('sensSeg2'), v); });
  segment($('sensSeg2'), v => { controls.sensitivity = parseFloat(v); syncSeg($('sensSeg'), v); });

  $('optShowLetter').addEventListener('change', e => setShowLetter(e.target.checked));
  $('optShowLetter2').addEventListener('change', e => setShowLetter(e.target.checked));
  $('optArrow').addEventListener('change', e => { hud.showArrow = e.target.checked; });
  $('optMute').addEventListener('change', e => { S.muted = e.target.checked; audio.setMuted(S.muted); });

  $('startBtn').addEventListener('click', async () => {
    const btn = $('startBtn');
    btn.disabled = true;
    btn.textContent = 'MENYIAPKAN…';

    audio.start();
    // "pemanasan" mesin suara di Android
    speak(' ', { rate: 1 });

    if (ctrlPref === 'gyro') {
      const ok = await controls.enableGyro();
      if (!ok) {
        $('ctrlHint').textContent = 'Sensor gyro tidak tersedia — pakai geser jari di layar.';
        controls.mode = 'touch';
      } else {
        controls.calibrate();
      }
    }

    goFullscreen();
    keepAwake();

    $('startScreen').classList.add('hidden');
    $('cockpit').classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'MULAI TERBANG';

    startCountdown();
  });

  $('pauseBtn').addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('recalBtn').addEventListener('click', () => {
    controls.calibrate();
    flashFeedback('Posisi tengah disimpan', '#8cffaf');
  });
  $('calBtn').addEventListener('click', () => {
    controls.calibrate();
    flashFeedback('Tengah!', '#8cffaf');
  });
  $('repeatBtn').addEventListener('click', () => {
    if (S.target) announce(S.target);
  });
}

function syncSeg(el, v) {
  [...el.children].forEach(c => c.classList.toggle('on', c.dataset.v === v));
}

function setShowLetter(v) {
  S.showLetter = v;
  $('optShowLetter').checked = v;
  $('optShowLetter2').checked = v;
  $('order').classList.toggle('listen-only', !v);
}

function goFullscreen() {
  const el = document.documentElement;
  const rq = el.requestFullscreen || el.webkitRequestFullscreen;
  if (rq) { try { rq.call(el)?.catch?.(() => {}); } catch (e) { /* diabaikan */ } }

  // Kunci orientasi yang SEDANG dipakai. Penting: tanpa ini, memiringkan HP
  // untuk membelok bisa memicu auto-rotate di tengah permainan.
  if (screen.orientation && screen.orientation.lock) {
    const type = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
    try { screen.orientation.lock(type)?.catch?.(() => {}); } catch (e) { /* diabaikan */ }
  }
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* diabaikan */ }
}

/* ================================================================= */
/*  ALUR PERMAINAN                                                    */
/* ================================================================= */

function startCountdown() {
  S.phase = 'countdown';
  const el = $('countdown');
  const span = el.querySelector('span');
  el.classList.remove('hidden');
  let n = 3;
  span.textContent = n;
  const tick = () => {
    n--;
    if (n > 0) {
      span.textContent = n;
      span.style.animation = 'none'; void span.offsetWidth; span.style.animation = '';
      setTimeout(tick, 800);
    } else {
      span.textContent = 'TERBANG!';
      span.style.animation = 'none'; void span.offsetWidth; span.style.animation = '';
      setTimeout(() => {
        el.classList.add('hidden');
        S.phase = 'playing';
        startRound(false);
      }, 850);
    }
  };
  setTimeout(tick, 800);
}

function startRound(repeat) {
  const count = Math.min(3 + Math.floor(S.score / 5), 5);

  if (repeat && S.target) {
    const picked = LetterField.pickLetters(count);
    const others = picked.others.filter(c => c !== S.target).slice(0, count - 1);
    while (others.length < count - 1) {
      const c = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      if (c !== S.target && !others.includes(c)) others.push(c);
    }
    spawnAt(S.target, others);
  } else {
    const { target, others } = LetterField.pickLetters(count, S.target);
    S.target = target;
    spawnAt(target, others);
  }

  $('orderLetter').textContent = S.target;
  announce(S.target);
}

function spawnAt(target, others) {
  const fwd = forwardVector();
  const dist = clamp(plane.speed * 7.0, 650, 1250);
  field.spawn(plane.pos, fwd, target, others, dist, camera);
}

function announce(letter) {
  audio.playWhoosh();
  speak(`Cari huruf ${letter}. ${letter}!`, { rate: 0.82 });
}

function onCorrect(ch) {
  S.score++;
  S.streak++;
  S.best = Math.max(S.best, S.streak);
  audio.playCorrect();
  flash('good');
  flashFeedback('BENAR! ⭐', '#9dffc4');

  const levelUp = S.score % 5 === 0;
  if (levelUp) {
    S.level++;
    setTimeout(() => {
      audio.playLevelUp();
      flashFeedback('LEVEL ' + S.level + '!', '#ffd76b');
      speak(`Level ${S.level}!`, { rate: 0.9 });
    }, 900);
  } else {
    speak(PRAISE[Math.floor(Math.random() * PRAISE.length)], { rate: 0.95, pitch: 1.2 });
  }

  S.nextRoundAt = elapsed + (levelUp ? 2.6 : 1.7);
  S.pendingRepeat = false;
}

function onWrong(ch) {
  S.streak = 0;
  audio.playWrong();
  flash('bad');
  flashFeedback('COBA LAGI', '#ff9a9a');
  speak(`Itu huruf ${ch}. ${RETRY[Math.floor(Math.random() * RETRY.length)]}`, { rate: 0.9 });
  S.nextRoundAt = elapsed + 2.1;
  S.pendingRepeat = true;
}

function onMissed() {
  S.streak = 0;
  flashFeedback('KELEWATAN', '#ffd76b');
  speak('Yah, terlewat. Ayo coba lagi.', { rate: 0.92 });
  S.nextRoundAt = elapsed + 1.6;
  S.pendingRepeat = true;
}

function flash(kind) {
  const el = $('flash');
  el.className = kind;
  setTimeout(() => { el.className = ''; }, 220);
}

function flashFeedback(text, color) {
  const el = $('feedback');
  el.textContent = text;
  el.style.color = color || '#fff';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function pauseGame() {
  if (S.phase !== 'playing') return;
  S.phase = 'paused';
  $('pScore').textContent = S.score;
  $('pLevel').textContent = S.level;
  $('pBest').textContent = S.best;
  $('pauseScreen').classList.remove('hidden');
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function resumeGame() {
  $('pauseScreen').classList.add('hidden');
  S.phase = 'playing';
  audio.resume();
  clock.getDelta(); // buang selisih waktu saat dijeda
}

/* ================================================================= */
/*  LOOP                                                             */
/* ================================================================= */

function forwardVector(out = new THREE.Vector3()) {
  const cp = Math.cos(plane.pitch);
  return out.set(
    -Math.sin(plane.heading) * cp,
    Math.sin(plane.pitch),
    -Math.cos(plane.heading) * cp
  );
}

const _fwd = new THREE.Vector3();

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (S.phase === 'paused') {
    renderer.render(scene, camera);
    return;
  }

  elapsed += dt;
  controls.update(dt);

  updateFlight(dt);

  terrain.update(plane.pos.x, plane.pos.z);
  sky.update(camera);

  // ---- gameplay ----
  if (S.phase === 'playing') {
    const res = field.update(dt, plane.pos, camera, elapsed);
    if (res) {
      if (res.type === 'correct') onCorrect(res.ch);
      else if (res.type === 'wrong') onWrong(res.ch);
      else onMissed();
    }
    if (!field.active && S.nextRoundAt && elapsed >= S.nextRoundAt) {
      S.nextRoundAt = 0;
      startRound(!!S.pendingRepeat);
    }
  } else {
    field.update(dt, plane.pos, camera, elapsed);
  }

  // ---- audio mesin ----
  const thr = controls.throttle;
  audio.updateEngine(thr, (plane.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));

  // ---- render ----
  renderer.render(scene, camera);

  drawOverlays();
  adaptQuality(dt);
}

function updateFlight(dt) {
  // kecepatan mengikuti throttle secara halus
  const targetSpeed = SPEED_MIN + controls.throttle * (SPEED_MAX - SPEED_MIN);
  plane.speed += (targetSpeed - plane.speed) * (1 - Math.exp(-dt / 1.5));

  // roll & pitch mendekati target
  const rollTarget = controls.steer * MAX_ROLL;
  let pitchTarget = controls.elev * MAX_PITCH;

  // bantuan otomatis: kalau terlalu dekat tanah, hidung diangkat
  const ground = terrainHeight(plane.pos.x, plane.pos.z);
  const agl = plane.pos.y - ground;
  warnGround = agl < GROUND_CLEAR * 3.2;
  if (agl < GROUND_CLEAR * 3.2) {
    const help = 1 - clamp(agl / (GROUND_CLEAR * 3.2), 0, 1);
    pitchTarget = Math.max(pitchTarget, help * MAX_PITCH * 0.95);
  }
  if (plane.pos.y > CEILING - 200) {
    const help = clamp((plane.pos.y - (CEILING - 200)) / 200, 0, 1);
    pitchTarget = Math.min(pitchTarget, -help * MAX_PITCH * 0.6);
  }

  plane.roll += clamp(rollTarget - plane.roll, -ROLL_RATE * dt, ROLL_RATE * dt);
  plane.pitch += clamp(pitchTarget - plane.pitch, -PITCH_RATE * dt, PITCH_RATE * dt);
  plane.pitch = clamp(plane.pitch, -MAX_PITCH, MAX_PITCH);

  // bank → belok (miring kanan = belok kanan)
  plane.heading -= Math.sin(plane.roll) * TURN_K * dt;

  // maju
  forwardVector(_fwd);
  plane.pos.addScaledVector(_fwd, plane.speed * dt);

  // lantai & langit-langit lunak — anak tidak pernah "jatuh"
  const g2 = terrainHeight(plane.pos.x, plane.pos.z);
  if (plane.pos.y < g2 + GROUND_CLEAR) plane.pos.y = g2 + GROUND_CLEAR;
  if (plane.pos.y > CEILING) plane.pos.y = CEILING;

  camera.position.copy(plane.pos);
  camera.rotation.set(plane.pitch, plane.heading, -plane.roll, 'YXZ');
}

let lastDom = {};
function setText(id, v) {
  if (lastDom[id] === v) return;
  lastDom[id] = v;
  $(id).textContent = v;
}

function drawOverlays() {
  hud.draw({
    pitch: plane.pitch,
    roll: plane.roll,
    targetInfo: S.phase === 'playing' ? field.targetScreenInfo(camera) : null,
    warn: warnGround,
    fov: camera.fov
  });

  const kmh = Math.round(plane.speed * 3.6);
  const agl = Math.round(plane.pos.y - terrainHeight(plane.pos.x, plane.pos.z));
  setText('spdValue', String(kmh));
  setText('altValue', String(Math.max(0, agl)));
  setText('scoreValue', String(S.score));
  setText('levelValue', String(S.level));
  setText('thrValue', Math.round(controls.throttle * 100) + '%');

  $('spdBar').style.width = ((plane.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN) * 100).toFixed(0) + '%';
  $('altBar').style.width = clamp(agl / 900 * 100, 0, 100).toFixed(0) + '%';
  thrLever.render();
}

/* Turunkan resolusi otomatis kalau HP-nya berat. */
function adaptQuality(dt) {
  frameTimes.push(dt);
  if (frameTimes.length < 90) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  frameTimes.length = 0;
  if (avg > 0.026 && pixelRatio > 0.85) {
    pixelRatio = Math.max(0.85, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
  }
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  updateFov();
  layoutJetBody();
  renderer.setSize(w, h, false);
  hud.resize();
}

/* ================================================================= */

try {
  init();
} catch (err) {
  console.error(err);
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('fatal').classList.remove('hidden');
  document.getElementById('fatalMsg').textContent =
    'Game tidak bisa dijalankan di peramban ini (butuh WebGL). Coba buka lewat Chrome versi terbaru. Detail: ' + (err && err.message);
}
