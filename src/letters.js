import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Huruf yang namanya berima dalam bahasa Indonesia (be/ce/de/e/ge/pe/te/ve/zet, dst).
// Dipakai supaya pengecoh tidak terlalu mirip bunyinya dengan target.
const RHYME_GROUPS = [
  ['B', 'C', 'D', 'E', 'G', 'P', 'T', 'V', 'Z'],
  ['F', 'L', 'M', 'N', 'R', 'S', 'X'],
  ['A', 'H', 'K'],
  ['I', 'Q'],
  ['J', 'Y'],
  ['U', 'W'],
  ['O']
];

function groupOf(ch) {
  return RHYME_GROUPS.findIndex(g => g.includes(ch));
}

const RING_COLORS = [
  0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c,
  0x38d9a9, 0x4dabf7, 0x9775fa, 0xf783ac
];

const texCache = new Map();

function letterTexture(ch, colorHex) {
  const key = ch + ':' + colorHex;
  if (texCache.has(key)) return texCache.get(key);

  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(colorHex);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;

  // cakram bercahaya di belakang huruf
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, `rgba(${rgb},0.95)`);
  g.addColorStop(0.55, `rgba(${rgb},0.72)`);
  g.addColorStop(0.82, `rgba(${rgb},0.28)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // cincin luar
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.40, 0, Math.PI * 2);
  ctx.stroke();

  // huruf: putih dengan garis tepi gelap supaya terbaca di langit maupun gunung
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${S * 0.60}px "Arial Black", Arial, Helvetica, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15,20,30,0.92)';
  ctx.lineWidth = S * 0.075;
  ctx.strokeText(ch, S / 2, S / 2 + S * 0.035);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(ch, S / 2, S / 2 + S * 0.035);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */

class Burst {
  constructor(scene, color) {
    this.n = 90;
    const pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = 26 + Math.random() * 62;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[i * 3 + 1] = Math.cos(ph) * sp;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({
      color,
      size: 9,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.life = 0;
    this.maxLife = 0.9;
    scene.add(this.points);
    this.scene = scene;
  }

  setOrigin(v) { this.points.position.copy(v); }

  update(dt) {
    this.life += dt;
    const t = this.life / this.maxLife;
    if (t >= 1) return false;
    const arr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.n * 3; i++) arr[i] += this.vel[i] * dt;
    for (let i = 0; i < this.n; i++) this.vel[i * 3 + 1] -= 42 * dt;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = 1 - t * t;
    this.mat.size = 9 + t * 8;
    return true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ */

export const HIT_RADIUS = 42;

export class LetterField {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.bursts = [];
    this.target = null;
    this.spawnForward = new THREE.Vector3(0, 0, -1);
    this.spawnOrigin = new THREE.Vector3();
    this.active = false;
  }

  /** Pilih target + pengecoh yang bunyinya tidak terlalu mirip. */
  static pickLetters(count, avoid = null) {
    const pool = ALPHABET.filter(c => c !== avoid);
    const target = pool[Math.floor(Math.random() * pool.length)];
    const tg = groupOf(target);

    const rest = ALPHABET.filter(c => c !== target);
    // acak
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    const chosen = [];
    let sameGroupUsed = 0;
    for (const c of rest) {
      if (chosen.length >= count - 1) break;
      const same = groupOf(c) === tg;
      if (same && sameGroupUsed >= 1) continue; // maksimal 1 pengecoh yang berima
      if (same) sameGroupUsed++;
      chosen.push(c);
    }
    return { target, others: chosen };
  }

  clear() {
    for (const it of this.items) {
      this.group.remove(it.mesh);
      it.mesh.geometry.dispose();
      it.mesh.material.dispose();
    }
    this.items = [];
    this.active = false;
  }

  /**
   * Sebar huruf di depan pesawat.
   * @param {THREE.Vector3} pos posisi pesawat
   * @param {THREE.Vector3} forward arah terbang (ternormalisasi)
   */
  spawn(pos, forward, target, others, distance = 1000, camera = null) {
    this.clear();
    this.target = target;
    this.spawnOrigin.copy(pos);
    this.spawnForward.copy(forward).setY(forward.y * 0.35).normalize();

    const letters = [target, ...others];
    // acak posisi target di antara pengecoh
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }

    const right = new THREE.Vector3().crossVectors(this.spawnForward, new THREE.Vector3(0, 1, 0)).normalize();
    const center = pos.clone().addScaledVector(this.spawnForward, distance);
    // sedikit ke atas supaya anak cenderung terbang menjauhi gunung
    center.y += 40;

    const n = letters.length;

    // --- susun huruf supaya SELALU muat di layar, portrait maupun landscape ---
    let halfW = 320, halfH = 200;
    if (camera) {
      halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      halfW = halfH * camera.aspect;
    }
    // di layar sempit (portrait) huruf ditata dua baris supaya semua kelihatan
    const narrow = camera ? camera.aspect < 1 : false;
    const cols = (narrow && n >= 4) ? Math.ceil(n / 2) : n;
    const rows = Math.ceil(n / cols);
    const size = Math.min(118, Math.max(66, halfW * 0.16));
    const gapX = Math.min(150, (halfW * 0.52) / Math.max(1, (cols - 1) / 2 || 1));
    const gapY = Math.min(155, (halfH * 0.40) / Math.max(1, (rows - 1) / 2 || 1));
    this.hitRadius = size * 0.46;

    for (let i = 0; i < n; i++) {
      const ch = letters[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = (col - (cols - 1) / 2) * gapX;
      const oy = rows > 1 ? -(row - (rows - 1) / 2) * gapY : (Math.random() - 0.5) * 70;
      const p = center.clone()
        .addScaledVector(right, ox)
        .add(new THREE.Vector3(0, oy, 0));

      // jangan sampai huruf tenggelam di dalam gunung
      const ground = terrainHeight(p.x, p.z);
      if (p.y < ground + 95) p.y = ground + 95 + Math.random() * 60;
      if (p.y > 1500) p.y = 1500;

      const color = RING_COLORS[Math.floor(Math.random() * RING_COLORS.length)];
      // fog dimatikan supaya huruf tetap jelas terbaca walau masih jauh
      const mat = new THREE.MeshBasicMaterial({
        map: letterTexture(ch, color),
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.position.copy(p);
      mesh.renderOrder = 10;
      this.group.add(mesh);

      this.items.push({
        ch,
        mesh,
        color,
        basePos: p.clone(),
        phase: Math.random() * Math.PI * 2,
        hit: false
      });
    }
    this.active = true;
  }

  /**
   * @returns {null | {type:'correct'|'wrong', ch:string, pos:THREE.Vector3, color:number}
   *          | {type:'missed'}}
   */
  update(dt, planePos, camera, time) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      if (!this.bursts[i].update(dt)) {
        this.bursts[i].dispose();
        this.bursts.splice(i, 1);
      }
    }

    if (!this.active || !this.items.length) return null;

    let result = null;

    for (const it of this.items) {
      // mengambang pelan supaya terlihat hidup
      it.mesh.position.y = it.basePos.y + Math.sin(time * 1.3 + it.phase) * 5;
      it.mesh.quaternion.copy(camera.quaternion); // selalu menghadap pemain

      if (it.hit) continue;
      if (planePos.distanceTo(it.mesh.position) < (this.hitRadius || HIT_RADIUS)) {
        it.hit = true;
        result = {
          type: it.ch === this.target ? 'correct' : 'wrong',
          ch: it.ch,
          pos: it.mesh.position.clone(),
          color: it.color
        };
        this.explode(it.mesh.position, it.color);
        break;
      }
    }

    if (result) {
      this.clear();
      return result;
    }

    // sudah terlewat semua?
    const behind = new THREE.Vector3().subVectors(planePos, this.spawnOrigin).dot(this.spawnForward);
    const gateDist = new THREE.Vector3()
      .subVectors(this.items[0].mesh.position, this.spawnOrigin)
      .dot(this.spawnForward);
    if (behind > gateDist + 120) {
      this.clear();
      return { type: 'missed' };
    }

    return null;
  }

  explode(pos, color) {
    const b = new Burst(this.scene, color);
    b.setOrigin(pos);
    this.bursts.push(b);
  }

  /** Arah relatif ke huruf target — untuk panah petunjuk di HUD. */
  targetScreenInfo(camera) {
    if (!this.active) return null;
    const it = this.items.find(i => i.ch === this.target && !i.hit);
    if (!it) return null;
    const v = it.mesh.position.clone().project(camera);
    const behind = v.z > 1;
    return { x: v.x, y: v.y, behind, pos: it.mesh.position };
  }
}
