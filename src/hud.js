/**
 * HUD kaca depan (pitch ladder, reticle, indikator bank, panah petunjuk).
 * Digambar di canvas 2D terpisah supaya tajam dan murah secara performa.
 */

const GREEN = 'rgba(140, 255, 175, 0.92)';
const GREEN_DIM = 'rgba(140, 255, 175, 0.42)';

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.showArrow = true;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = w;
    this.h = h;
  }

  draw({ pitch, roll, targetInfo, warn, fov = 70 }) {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // S = sisi terpendek — dipakai supaya ukuran HUD konsisten
    // baik di layar portrait maupun landscape.
    const S = Math.min(w, h);
    const cx = w / 2;
    const cy = h * 0.5;   // titik bidik = pusat optik kamera (supaya ladder akurat)
    const pxPerDeg = h / fov;   // skala pitch ladder mengikuti bidang pandang asli

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-roll);

    ctx.lineWidth = 2;
    ctx.strokeStyle = GREEN_DIM;
    ctx.fillStyle = GREEN_DIM;
    ctx.font = `600 ${Math.round(S * 0.032)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pitchDeg = pitch * 180 / Math.PI;

    for (let d = -30; d <= 30; d += 10) {
      const y = (pitchDeg - d) * pxPerDeg;
      if (Math.abs(y) > h * 0.42) continue;

      if (d === 0) {
        // garis horizon
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-S * 0.46, y); ctx.lineTo(-S * 0.09, y);
        ctx.moveTo(S * 0.09, y); ctx.lineTo(S * 0.46, y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = GREEN_DIM;
        ctx.lineWidth = 1.6;
        const len = S * 0.15;
        const tick = d > 0 ? 7 : -7;
        if (d < 0) ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(-S * 0.30, y); ctx.lineTo(-S * 0.30 + len, y);
        ctx.lineTo(-S * 0.30 + len, y + tick);
        ctx.moveTo(S * 0.30, y); ctx.lineTo(S * 0.30 - len, y);
        ctx.lineTo(S * 0.30 - len, y + tick);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(String(Math.abs(d)), -S * 0.365, y);
        ctx.fillText(String(Math.abs(d)), S * 0.365, y);
      }
    }
    ctx.restore();

    // ---- busur indikator bank ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = GREEN_DIM;
    ctx.lineWidth = 2;
    const R = S * 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.stroke();
    for (const a of [-60, -30, -15, 0, 15, 30, 60]) {
      const ang = -Math.PI / 2 + a * Math.PI / 180;
      const l = a === 0 ? 13 : 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * R, Math.sin(ang) * R);
      ctx.lineTo(Math.cos(ang) * (R + l), Math.sin(ang) * (R + l));
      ctx.stroke();
    }
    // penunjuk bank
    const ba = -Math.PI / 2 + roll;
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ba) * (R - 4), Math.sin(ba) * (R - 4));
    const p1 = ba + 0.045, p2 = ba - 0.045;
    ctx.lineTo(Math.cos(p1) * (R - 17), Math.sin(p1) * (R - 17));
    ctx.lineTo(Math.cos(p2) * (R - 17), Math.sin(p2) * (R - 17));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ---- simbol pesawat di tengah ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = Math.max(2.5, S * 0.008);
    const a = S * 0.12, b = S * 0.045, c = S * 0.028;
    ctx.beginPath();
    ctx.moveTo(-a, 0); ctx.lineTo(-b, 0); ctx.lineTo(-b * 0.5, c);
    ctx.moveTo(a, 0); ctx.lineTo(b, 0); ctx.lineTo(b * 0.5, c);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.012, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ---- panah petunjuk ke huruf target ----
    if (this.showArrow && targetInfo) {
      const { x, y, behind } = targetInfo;
      const sx = (x * 0.5 + 0.5) * w;
      const sy = (-y * 0.5 + 0.5) * h;
      const margin = Math.min(w, h) * 0.13;
      const off = behind || sx < margin || sx > w - margin || sy < margin || sy > h - margin;

      if (off) {
        let dx = sx - cx, dy = sy - cy;
        if (behind) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const rr = Math.min(w, h) * 0.31;
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255, 214, 92, 0.95)';
        ctx.beginPath();
        ctx.moveTo(20, 0); ctx.lineTo(-12, 13); ctx.lineTo(-5, 0); ctx.lineTo(-12, -13);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // ---- peringatan ketinggian ----
    if (warn) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(S * 0.062)}px system-ui, sans-serif`;
      const a = 0.55 + Math.sin(performance.now() / 90) * 0.45;
      ctx.fillStyle = `rgba(255,90,90,${a.toFixed(2)})`;
      ctx.fillText('TARIK KE ATAS!', cx, h * 0.70);
      ctx.restore();
    }
  }
}
