import * as THREE from 'three';
import { fbm, ridged, smoothstep } from './noise.js';

export const CHUNK_SIZE = 520;      // ukuran satu petak terrain (meter)
const SEGMENTS = 22;                // resolusi petak
const RADIUS = 5;                   // berapa petak di sekitar pesawat yang dirender

/**
 * Tinggi permukaan tanah di titik (x, z).
 * Kombinasi: dataran bergelombang + punggungan gunung yang dimasker
 * supaya ada lembah datar di antara barisan pegunungan.
 */
export function terrainHeight(x, z) {
  // masker skala besar: menentukan di mana ada gugusan gunung
  const maskRaw = fbm(x * 0.000085, z * 0.000085, 3);
  const mask = smoothstep(0.28, 0.66, maskRaw);

  // dataran bergelombang halus
  const rolling = (fbm(x * 0.00075, z * 0.00075, 4) - 0.5) * 150;

  // punggungan gunung
  const ridge = ridged(x * 0.00042, z * 0.00042, 5);

  // detail kasar di lereng
  const detail = (fbm(x * 0.0035, z * 0.0035, 3) - 0.5) * 38 * (0.35 + mask);

  return rolling + Math.pow(ridge, 1.42) * 1380 * mask + detail;
}

const _c = new THREE.Color();

function colorFor(height, slope, x, z) {
  // variasi kecil supaya warna tidak rata
  const v = fbm(x * 0.0025, z * 0.0025, 2) * 0.16 - 0.08;

  let r, g, b;
  if (height < 18) {
    // dasar lembah — rumput agak gelap
    r = 0.20; g = 0.36; b = 0.19;
  } else if (height < 210) {
    const t = (height - 18) / 192;
    r = 0.20 + t * 0.14; g = 0.36 + t * 0.10; b = 0.19 + t * 0.05;
  } else if (height < 480) {
    // hutan pinus → batuan
    const t = (height - 210) / 270;
    r = 0.34 + t * 0.14; g = 0.46 - t * 0.09; b = 0.24 + t * 0.06;
  } else if (height < 760) {
    // batuan abu-abu kecoklatan
    const t = (height - 480) / 280;
    r = 0.48 + t * 0.10; g = 0.37 + t * 0.10; b = 0.30 + t * 0.12;
  } else {
    // salju di puncak
    const t = smoothstep(760, 900, height);
    r = 0.58 + t * 0.38; g = 0.47 + t * 0.47; b = 0.42 + t * 0.52;
  }

  // lereng curam = batu tersingkap (salju/rumput tidak menempel)
  const rock = smoothstep(0.55, 0.9, slope);
  r = r * (1 - rock) + 0.42 * rock;
  g = g * (1 - rock) + 0.36 * rock;
  b = b * (1 - rock) + 0.33 * rock;

  _c.setRGB(
    Math.min(1, Math.max(0, r + v)),
    Math.min(1, Math.max(0, g + v)),
    Math.min(1, Math.max(0, b + v))
  );
  return _c;
}

function buildChunk(cx, cz, material) {
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const wx = originX + pos.getX(i);
    const wz = originZ + pos.getZ(i);
    const h = terrainHeight(wx, wz);
    pos.setY(i, h);
  }

  // hitung kemiringan sederhana lalu warnai tiap vertex
  const step = CHUNK_SIZE / SEGMENTS;
  for (let i = 0; i < pos.count; i++) {
    const wx = originX + pos.getX(i);
    const wz = originZ + pos.getZ(i);
    const h = pos.getY(i);
    const hx = terrainHeight(wx + step, wz);
    const hz = terrainHeight(wx, wz + step);
    const slope = Math.min(1, Math.hypot(hx - h, hz - h) / step * 1.6);
    const col = colorFor(h, slope, wx, wz);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(originX, 0, originZ);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true
    });
    this.group = new THREE.Group();
    scene.add(this.group);
    this._budgetPerFrame = 2; // bangun maksimal 2 petak per frame supaya tidak nge-lag
  }

  update(px, pz) {
    const ccx = Math.round(px / CHUNK_SIZE);
    const ccz = Math.round(pz / CHUNK_SIZE);

    // buang petak yang sudah jauh di belakang
    for (const [key, mesh] of this.chunks) {
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - ccx) > RADIUS + 1 || Math.abs(kz - ccz) > RADIUS + 1) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }

    // bangun petak yang kurang, prioritaskan yang paling dekat
    let budget = this._budgetPerFrame;
    const wanted = [];
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const kx = ccx + dx, kz = ccz + dz;
        const key = `${kx},${kz}`;
        if (!this.chunks.has(key)) wanted.push([dx * dx + dz * dz, kx, kz, key]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);
    for (const [, kx, kz, key] of wanted) {
      if (budget-- <= 0) break;
      const mesh = buildChunk(kx, kz, this.material);
      this.chunks.set(key, mesh);
      this.group.add(mesh);
    }
  }

  /** Isi penuh area sekitar sekaligus — dipakai sekali sebelum game mulai. */
  preload(px, pz) {
    const saved = this._budgetPerFrame;
    this._budgetPerFrame = 9999;
    this.update(px, pz);
    this._budgetPerFrame = saved;
  }
}
