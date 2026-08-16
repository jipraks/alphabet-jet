// Membuat ikon PWA (192 & 512 px) dengan merender SVG di Chromium.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const svg = (s) => `
<html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2f6fb5"/>
      <stop offset="55%" stop-color="#86b6dd"/>
      <stop offset="100%" stop-color="#dbe9f2"/>
    </linearGradient>
    <linearGradient id="mt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#8d99a6"/>
      <stop offset="100%" stop-color="#3f4a57"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="108" fill="url(#sky)"/>
  <circle cx="384" cy="126" r="46" fill="#fff8e1" opacity=".9"/>
  <path d="M0 512 L118 300 L206 400 L286 238 L400 400 L512 322 L512 512 Z" fill="url(#mt)"/>
  <g transform="translate(238 250) scale(1.02)">
    <path d="M0,-118 L15,-60 L19,-34 L118,26 L118,54 L21,34 L23,68 L56,98 L56,116 L15,102
             L9,124 L-9,124 L-15,102 L-56,116 L-56,98 L-23,68 L-21,34 L-118,54 L-118,26
             L-19,-34 L-15,-60 Z"
          fill="#f2f7fc" stroke="#232c37" stroke-width="14" stroke-linejoin="round"/>
    <path d="M0,-92 L9,-40 L-9,-40 Z" fill="#7fc4f2"/>
  </g>
  <g transform="translate(386 386)">
    <circle r="76" fill="#f0a827" stroke="#fff" stroke-width="12"/>
    <text x="0" y="30" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900"
          font-size="104" fill="#fff" stroke="#28323d" stroke-width="12" paint-order="stroke">A</text>
  </g>
</svg>
</body></html>`;

await mkdir(new URL('../icons', import.meta.url), { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size));
  await page.screenshot({
    path: new URL(`../icons/icon-${size}.png`, import.meta.url).pathname,
    omitBackground: true
  });
  await page.close();
}
await browser.close();
console.log('ikon dibuat');
