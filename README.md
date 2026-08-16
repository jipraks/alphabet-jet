# ✈️ Jet Huruf — Petualangan Pilot Cilik

Game web untuk anak belajar mengenal huruf. Anak jadi pilot jet tempur, mendengar
perintah huruf lewat suara, lalu menabrak huruf yang benar di antara pilihan yang
melayang di atas pegunungan.

- **Kemudi pakai gyroscope HP** — miringkan HP seperti setir untuk membelok
- **Tuas throttle** untuk mengatur kecepatan
- **Pandangan dari kokpit** lengkap dengan bingkai kanopi, HUD, dan panel instrumen
- **Suara mesin jet** yang ikut naik-turun mengikuti gas
- **Perintah suara bahasa Indonesia** (Text-to-Speech bawaan HP)
- Kalau salah, huruf yang sama **diulang** sampai benar — tidak ada "game over"

Semua dibuat tanpa file gambar atau audio eksternal: pegunungan, awan, huruf, dan
seluruh suara dihasilkan secara prosedural. Total hanya ~520 KB (satu file `game.js`).

---

## 1. Cara deploy ke GitHub Pages

Repo ini sudah berisi hasil build (`game.js`), jadi tidak perlu proses build apa pun
di server.

1. Buat repo baru di GitHub, lalu unggah semua isi folder ini.

   ```bash
   git init
   git add .
   git commit -m "Jet Huruf"
   git branch -M main
   git remote add origin https://github.com/<username>/<nama-repo>.git
   git push -u origin main
   ```

2. Buka **Settings → Pages**.
3. Bagian *Build and deployment* → **Source: Deploy from a branch**.
4. Pilih branch **main**, folder **/ (root)**, lalu **Save**.
5. Tunggu 1–2 menit. Game akan tersedia di:

   ```
   https://<username>.github.io/<nama-repo>/
   ```

> **Penting:** gyroscope hanya bekerja lewat HTTPS. GitHub Pages sudah HTTPS,
> jadi aman. Kalau dibuka lewat `file://` atau HTTP biasa, sensor tidak akan jalan.

### Alternatif: deploy otomatis dari source

Kalau nanti ingin mengedit isi `src/` dan build-nya jalan otomatis, tersedia
workflow di `.github/workflows/deploy.yml`. Untuk memakainya, ubah
**Settings → Pages → Source** menjadi **GitHub Actions**.

---

## 2. Cara main

| Kontrol | Fungsi |
|---|---|
| Miringkan HP kiri/kanan | Belok kiri/kanan (pesawat ikut miring) |
| Miringkan HP maju/mundur | Turun / naik |
| Tuas **GAS** di kanan | Atur kecepatan |
| Tombol 🔊 | Ulangi perintah suara |
| Tombol ⊕ | Atur ulang posisi "tengah" gyro |
| Tombol ⏸ | Jeda + pengaturan |

Kalau main di laptop: panah **←↑→↓** atau **WASD** untuk kemudi, **Q/E** untuk gas.
Bisa juga geser jari/mouse di layar.

**Aturan main:** dengarkan huruf yang disebut, lalu terbangkan jet menabrak huruf
tersebut. Salah huruf atau terlewat → huruf yang sama diulang. Setiap 5 huruf benar
naik satu level dan jumlah pilihan huruf bertambah (3 → 4 → 5).

---

## 3. Pengaturan yang berguna

Di layar awal dan menu jeda:

- **Tingkat kepekaan** — Pelan / Sedang / Lincah. Untuk anak yang lebih kecil,
  pilih *Pelan*.
- **Tampilkan huruf di layar** — matikan kalau ingin anak benar-benar
  mengandalkan pendengaran saja (mode dengar murni).
- **Panah petunjuk arah** — panah kuning yang menunjuk ke huruf target kalau
  posisinya di luar layar. Matikan kalau sudah terlalu mudah.

---

## 4. Kalau ada masalah

**Pesawat belok sendiri / tidak lurus**
Tekan tombol ⊕ (atur ulang posisi tengah) sambil HP dipegang di posisi yang nyaman.
Posisi itu akan jadi titik netral yang baru.

**Suara perintah terdengar seperti bahasa Inggris**
HP belum punya suara bahasa Indonesia. Di Android:
*Setelan → Sistem → Bahasa & masukan → Keluaran text-to-speech → Instal data suara →
Bahasa Indonesia*. Game tetap bisa dimainkan tanpa ini.

**Tidak ada suara sama sekali di iPhone**
Pastikan sakelar senyap (silent switch) di sisi HP tidak aktif — Web Audio ikut
dibungkam oleh mode senyap iOS.

**Gyro tidak jalan di iPhone**
iOS meminta izin sensor. Saat menekan MULAI TERBANG akan muncul dialog izin —
pilih *Allow*. Kalau terlanjur ditolak: Setelan → Safari → Gerakan & Orientasi → aktifkan.

**Layar berputar sendiri saat dimiringkan**
Game mengunci orientasi saat mulai. Kalau HP tetap berputar, matikan auto-rotate
lewat panel notifikasi sebelum mulai main.

**Patah-patah di HP lama**
Game otomatis menurunkan resolusi render kalau frame rate turun. Bisa juga
mengurangi jarak pandang di `src/terrain.js` (ubah `RADIUS = 5` jadi `4`).

---

## 5. Mengubah isi game

Sumber ada di `src/`. Setelah mengedit, jalankan build:

```bash
npm install       # sekali saja
npm run build     # menghasilkan game.js
npm run dev       # mode watch untuk development
npm run serve     # server lokal di http://localhost:8080
```

Beberapa titik ubah yang sering dibutuhkan:

| Yang ingin diubah | Lokasi |
|---|---|
| Daftar huruf (mis. hanya vokal) | `src/letters.js` → `ALPHABET` |
| Jumlah pilihan huruf per ronde | `src/main.js` → `startRound()`, baris `const count = ...` |
| Kecepatan min/maks | `src/main.js` → `SPEED_MIN`, `SPEED_MAX` |
| Kalimat perintah & pujian | `src/main.js` → `announce()`, `PRAISE`, `RETRY` |
| Bentuk & tinggi gunung | `src/terrain.js` → `terrainHeight()` |
| Warna langit | `src/sky.js` → uniform `uTop` / `uMid` / `uBottom` |
| Suara mesin | `src/audio.js` → `updateEngine()` |

Mau ganti dari huruf ke **angka** atau **suku kata**? Cukup ubah `ALPHABET` di
`src/letters.js` dan kalimat di `announce()` — sisanya jalan otomatis.

---

## 6. Struktur file

```
index.html              halaman utama
styles.css              tampilan kokpit, panel, menu
game.js                 hasil build (three.js + game) — INI yang dipakai browser
manifest.webmanifest    supaya bisa "Add to Home Screen"
icons/                  ikon aplikasi
src/
  main.js               loop permainan, fisika terbang, alur ronde
  terrain.js            pembentukan pegunungan
  sky.js                langit, matahari, awan
  letters.js            huruf target, tabrakan, efek ledakan
  controls.js           gyroscope, sentuh, keyboard, throttle
  audio.js              suara mesin & efek, text-to-speech
  hud.js                garis HUD hijau di kaca depan
  noise.js              fungsi noise untuk terrain
test/run.mjs            uji otomatis (Playwright)
```

## Uji otomatis

```bash
npm install
npm install -D playwright     # hanya untuk pengujian, tidak ikut ke build
node test/run.mjs
```

Membuka game di Chromium (portrait & landscape), memeriksa tidak ada error,
menguji tabrakan huruf benar/salah, dan menyimpan screenshot ke `test/`.

---

Dibuat dengan [three.js](https://threejs.org/). Bebas dipakai dan dimodifikasi.
