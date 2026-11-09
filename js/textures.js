// Procedural canvas textures: no image files to download.
import * as THREE from 'three';

let rng = 1;
const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// per-pixel grain on top of whatever is drawn
function grain(g, w, h, amt, seed = 7) {
  rng = seed;
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rand() - 0.5) * amt;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}

function grime(g, w, h, n, color, rmin, rmax, a = 0.08) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = rmin + rand() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', a * (0.4 + rand())));
    gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function floorTex() {
  const S = 512; const [c, g] = canvas(S); rng = 11;
  g.fillStyle = '#4a4c4d'; g.fillRect(0, 0, S, S);
  // 2x2 concrete tiles
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const v = 66 + rand() * 18; g.fillStyle = `rgb(${v},${v + 2},${v + 3})`;
    g.fillRect(tx * 256 + 3, ty * 256 + 3, 250, 250);
  }
  grime(g, S, S, 60, 'rgba(20,18,15,A)', 20, 90, 0.18);
  grime(g, S, S, 30, 'rgba(110,112,108,A)', 10, 40, 0.08);
  g.strokeStyle = 'rgba(15,15,15,0.9)'; g.lineWidth = 5;
  g.strokeRect(0, 0, 256, 256); g.strokeRect(256, 0, 256, 256); g.strokeRect(0, 256, 256, 256); g.strokeRect(256, 256, 256, 256);
  // cracks
  g.strokeStyle = 'rgba(10,10,10,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    let x = rand() * S, y = rand() * S; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, S, S, 26);
  return tex(c);
}

export function wallTex() {
  const S = 512; const [c, g] = canvas(S); rng = 23;
  g.fillStyle = '#5d6160'; g.fillRect(0, 0, S, S);
  // panels
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const v = 78 + rand() * 16; g.fillStyle = `rgb(${v},${v + 4},${v + 3})`;
    g.fillRect(px * 256 + 4, py * 200 + 6, 248, 190);
  }
  // lower band (darker, scuffed) + hazard stripe
  g.fillStyle = '#2f3232'; g.fillRect(0, 400, S, 112);
  g.save(); g.beginPath(); g.rect(0, 400, S, 16); g.clip();
  for (let x = -40; x < S + 40; x += 32) { g.fillStyle = '#8a6a14'; g.beginPath(); g.moveTo(x, 400); g.lineTo(x + 16, 400); g.lineTo(x + 32, 416); g.lineTo(x + 16, 416); g.fill(); }
  g.restore();
  // rivets
  g.fillStyle = 'rgba(25,25,25,0.8)';
  for (let x = 14; x < S; x += 60) for (const y of [14, 186, 214, 390]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  grime(g, S, S, 50, 'rgba(25,20,15,A)', 20, 120, 0.2);
  // rust drips
  for (let i = 0; i < 14; i++) {
    const x = rand() * S, y = rand() * 300, len = 40 + rand() * 160;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, 'rgba(80,40,15,0.45)'); gr.addColorStop(1, 'rgba(80,40,15,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + rand() * 4, len);
  }
  grain(g, S, S, 22, 3);
  return tex(c);
}

export function ceilTex() {
  const S = 256; const [c, g] = canvas(S); rng = 5;
  g.fillStyle = '#2a2c2d'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#151616'; g.lineWidth = 4;
  for (let i = 0; i <= S; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  g.fillStyle = '#1a1b1b';
  for (let i = 0; i < 8; i++) g.fillRect(30 + i * 8, 30, 3, 60);
  grime(g, S, S, 25, 'rgba(0,0,0,A)', 10, 60, 0.3);
  grain(g, S, S, 18, 9);
  return tex(c);
}

export function doorTex(stripe) {
  const S = 256; const [c, g] = canvas(S); rng = 31;
  g.fillStyle = '#4b5153'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#3a3f41'; g.fillRect(10, 10, S - 20, S - 20);
  for (let y = 30; y < S - 20; y += 22) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(20, y, S - 40, 4); }
  g.fillStyle = stripe; g.fillRect(0, 110, S, 22);
  grime(g, S, S, 20, 'rgba(15,10,5,A)', 10, 60, 0.3);
  grain(g, S, S, 20, 13);
  return tex(c, false);
}

export function crateTex() {
  const S = 256; const [c, g] = canvas(S); rng = 41;
  g.fillStyle = '#3c4433'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#262c20'; g.lineWidth = 14; g.strokeRect(7, 7, S - 14, S - 14);
  g.beginPath(); g.moveTo(14, 14); g.lineTo(S - 14, S - 14); g.stroke();
  g.fillStyle = 'rgba(200,190,150,0.5)'; g.font = 'bold 30px monospace'; g.fillText('BIO-7', 80, 140);
  grime(g, S, S, 20, 'rgba(0,0,0,A)', 10, 50, 0.3);
  grain(g, S, S, 20, 2);
  return tex(c, false);
}

export function fleshTex(base = [168, 150, 140]) {
  const S = 256; const [c, g] = canvas(S); rng = 77;
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, S, S);
  grime(g, S, S, 60, 'rgba(90,20,25,A)', 8, 40, 0.5);
  grime(g, S, S, 30, 'rgba(40,50,40,A)', 10, 50, 0.4);
  g.strokeStyle = 'rgba(70,20,40,0.55)'; g.lineWidth = 1.5;
  for (let i = 0; i < 30; i++) {
    let x = rand() * S, y = rand() * S; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 30; y += (rand() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, S, S, 30, 4);
  return tex(c);
}

export function bloodTex() {
  const S = 128; const [c, g] = canvas(S); rng = 99;
  g.fillStyle = 'rgba(70,0,0,0.95)';
  g.beginPath(); g.arc(64, 64, 30, 0, 7); g.fill();
  for (let i = 0; i < 18; i++) {
    const a = rand() * 6.28, d = 25 + rand() * 30, r = 2 + rand() * 9;
    g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); g.fill();
  }
  const t = tex(c, false); return t;
}

export function holeTex() {
  const S = 64; const [c, g] = canvas(S);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(10,10,10,0.95)'); gr.addColorStop(0.5, 'rgba(30,30,30,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, false);
}

export function dotTex() {
  const S = 64; const [c, g] = canvas(S);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, false);
}

export function flashTex() {
  const S = 128; const [c, g] = canvas(S);
  g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate(Math.PI * 2 / 7 + 0.3);
    const gr = g.createLinearGradient(0, 0, 60, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(62, 0); g.lineTo(0, 7); g.fill();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
  return tex(c, false);
}

// Flashlight cookie: bright hot-spot, a soft ring and a faint dirty-lens pattern.
export function cookieTex() {
  const S = 256; const [c, g] = canvas(S); rng = 3;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.18, '#f4f4f4'); gr.addColorStop(0.32, '#9a9a9a');
  gr.addColorStop(0.42, '#c8c8c8'); gr.addColorStop(0.55, '#5a5a5a'); gr.addColorStop(0.85, '#1c1c1c'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply';
  grime(g, S, S, 20, 'rgba(120,120,120,A)', 10, 40, 0.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function beamTex() {
  const [c, g] = canvas(16, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  return tex(c, false);
}

export function labelTex(text, bg, fg) {
  const [c, g] = canvas(128, 64);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 34);
  return tex(c, false);
}

export function screenTex(hue) {
  const [c, g] = canvas(128, 80); rng = hue.length * 13;
  g.fillStyle = '#020604'; g.fillRect(0, 0, 128, 80);
  g.fillStyle = hue; g.font = '7px monospace';
  for (let y = 8; y < 76; y += 8) { let s = ''; const n = 4 + Math.floor(rand() * 16); for (let i = 0; i < n; i++) s += 'ABCDEF0123456789:/.-#'[Math.floor(rand() * 21)]; g.fillText(s, 6, y); }
  g.fillRect(84, 46, 34, 4); g.fillRect(84, 54, 22, 4); g.fillRect(84, 62, 28, 4);
  g.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = 0; y < 80; y += 2) g.fillRect(0, y, 128, 1);
  return tex(c, false);
}

export function fluidTex() {
  const [c, g] = canvas(64, 256); rng = 17;
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#0c2c2c'); gr.addColorStop(0.6, '#1a6a6a'); gr.addColorStop(1, '#2fa8a0');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(200,255,250,${0.1 + rand() * 0.35})`; g.beginPath(); g.arc(rand() * 64, rand() * 256, 0.6 + rand() * 1.8, 0, 7); g.fill(); }
  return tex(c);
}

export function signTex(text, color = '#c9d2cf') {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#151a1a'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(4, 4, 248, 56);
  g.fillStyle = color; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
  grain(g, 256, 64, 30, 8);
  return tex(c, false);
}
