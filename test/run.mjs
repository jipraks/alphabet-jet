import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8123;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore'
});
await sleep(900);

const viewports = [
  { name: 'landscape', width: 844, height: 390 },
  { name: 'portrait', width: 390, height: 844 }
];

let hardFail = false;

for (const vp of viewports) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox'
    ]
  });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://localhost:${PORT}/index.html?debug=1`, { waitUntil: 'networkidle' });
  await sleep(700);
  await page.screenshot({ path: `test/shot-${vp.name}-1-menu.png` });

  // pilih mode sentuh (tidak ada gyro di headless)
  await page.click('#ctrlSeg button[data-v="touch"]');
  await page.click('#startBtn');

  // hitung mundur ~3.3 detik
  await sleep(4200);
  await page.screenshot({ path: `test/shot-${vp.name}-2-fly.png` });

  // terbang beberapa detik, sambil sedikit membelok pakai keyboard
  await page.keyboard.down('ArrowRight');
  await sleep(1200);
  await page.keyboard.up('ArrowRight');
  await sleep(2000);
  await page.screenshot({ path: `test/shot-${vp.name}-3-bank.png` });

  // naikkan throttle penuh & terbang lurus lebih lama supaya kena huruf
  await page.keyboard.down('KeyE');
  await sleep(900);
  await page.keyboard.up('KeyE');
  await sleep(5000);
  await page.screenshot({ path: `test/shot-${vp.name}-4-letters.png` });

  // ---- uji logika: tabrak huruf BENAR → skor naik, huruf berganti ----
  const hit = async (wantCorrect) => page.evaluate((correct) => {
    const j = window.__jet;
    const f = j.field;
    if (!f.active || !f.items.length) return { ok: false, why: 'tidak ada huruf aktif' };
    const it = correct
      ? f.items.find(i => i.ch === f.target)
      : f.items.find(i => i.ch !== f.target);
    if (!it) return { ok: false, why: 'huruf tidak ditemukan' };
    const before = { score: j.state.score, target: f.target };
    j.plane.pos.copy(it.mesh.position);
    return { ok: true, before, ch: it.ch };
  }, wantCorrect);

  const snap = () => page.evaluate(() => ({
    score: window.__jet.state.score,
    target: window.__jet.state.target,
    active: window.__jet.field.active
  }));

  // renderer software di CI jauh lebih lambat dari HP asli, jadi tunggu
  // berdasarkan kondisi permainan, bukan durasi tetap
  const waitUntil = async (want, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if ((await snap()).active === want) return true;
      await sleep(250);
    }
    return false;
  };

  // 1) tabrakan diproses (huruf hilang) → 2) ronde berikutnya muncul
  const r1 = await hit(true);
  const cleared1 = await waitUntil(false);
  const afterCorrect = await snap();
  const spawned1 = await waitUntil(true);

  const r2 = await hit(false);
  const cleared2 = await waitUntil(false);
  const afterWrong = await snap();
  const spawned2 = await waitUntil(true);
  await page.screenshot({ path: `test/shot-${vp.name}-5-after.png` });

  const checks = [];
  checks.push(['tabrakan terdeteksi', r1.ok && cleared1 && r2.ok && cleared2]);
  checks.push(['tabrak huruf benar → skor jadi 1', r1.ok && afterCorrect.score === 1]);
  checks.push(['ronde baru otomatis muncul', spawned1 === true]);
  checks.push(['tabrak huruf salah → skor tidak naik', r2.ok && afterWrong.score === 1]);
  checks.push(['huruf target diulang setelah salah', r2.ok && afterWrong.target === r2.before.target]);
  checks.push(['huruf target berganti setelah benar', r1.ok && afterWrong.target !== r1.before.target]);
  checks.push(['ronde ulangan muncul', spawned2 === true]);

  const state = await page.evaluate(() => ({
    fatal: !document.getElementById('fatal').classList.contains('hidden'),
    fatalMsg: document.getElementById('fatalMsg').textContent,
    order: document.getElementById('orderLetter').textContent,
    spd: document.getElementById('spdValue').textContent,
    alt: document.getElementById('altValue').textContent,
    score: document.getElementById('scoreValue').textContent,
    thr: document.getElementById('thrValue').textContent
  }));

  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
  console.log('state:', JSON.stringify(state));
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) hardFail = true;
  }
  if (errors.length) {
    console.log('ERRORS:');
    errors.slice(0, 12).forEach(e => console.log('  ' + e));
    if (errors.some(e => !/AudioContext|speechSynthesis|Permissions|WebGL warn/i.test(e))) hardFail = true;
  } else {
    console.log('errors: none');
  }
  if (state.fatal) { hardFail = true; console.log('FATAL:', state.fatalMsg); }

  await browser.close();
}

server.kill();
console.log('\nRESULT:', hardFail ? 'FAIL' : 'OK');
process.exit(hardFail ? 1 : 0);
