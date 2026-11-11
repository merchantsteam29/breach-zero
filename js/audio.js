// All sound is synthesised with WebAudio: no audio files.
// Buses: sfx / amb / mus -> master -> compressor -> out, plus a shared reverb send.

let ctx = null, master, comp, sfx, amb, mus, verb, verbIn, noiseBuf, brownBuf;
let vol = { master: 0.8, amb: 0.8, mus: 0.7 };
const now = () => ctx.currentTime;
const R = (a, b) => a + Math.random() * (b - a);

export function audioReady() { return !!ctx; }

export function initAudio() {
  if (/[?&]noaudio/.test(location.search)) return;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
  master = ctx.createGain(); master.connect(comp);
  sfx = ctx.createGain(); sfx.connect(master);
  amb = ctx.createGain(); amb.connect(master);
  mus = ctx.createGain(); mus.connect(master);
  // reverb: generated impulse, long concrete tail
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 900 ? i / 900 : 1); }
  verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.32; verbIn.connect(verb); verb.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  brownBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  { const d = brownBuf.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
  setVolumes(vol);
}

export function setVolumes(v) {
  vol = { ...vol, ...v };
  if (!ctx) return;
  master.gain.value = vol.master; amb.gain.value = vol.amb; mus.gain.value = vol.mus;
}

export function setListenerRaw(p, f) {
  if (!ctx) return;
  const L = ctx.listener;
  if (L.positionX) {
    L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
    L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
}

// ---------- building blocks ----------
function out(pos, wet = 0.4) {
  // returns an input node routed (optionally spatialised) into sfx + reverb
  const g = ctx.createGain();
  let tail = g;
  if (pos) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.rolloffFactor = 1.3; p.maxDistance = 60;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p); tail = p;
  }
  tail.connect(sfx);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; tail.connect(w); w.connect(verbIn); }
  return g;
}

function noise(dest, t, dur, { type = 'lowpass', f = 1000, f2, q = 1, gain = 1, attack = 0.002, brown = false } = {}) {
  const s = ctx.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

function tone(dest, t, dur, { type = 'sine', f = 440, f2, gain = 0.5, attack = 0.005, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  return o;
}

// ---------- weapons ----------
export function shot(kind) {
  if (!ctx) return; const t = now(), d = out(null, 0.9);
  if (kind === 'shotgun') {
    noise(d, t, 0.5, { f: 5000, f2: 300, gain: 1.4, attack: 0.001 });
    tone(d, t, 0.35, { type: 'sine', f: 120, f2: 35, gain: 1.6 });
    noise(d, t + 0.01, 0.9, { f: 600, f2: 120, gain: 0.5, brown: true });
  } else if (kind === 'smg') {
    noise(d, t, 0.12, { f: 6000, f2: 700, gain: 0.75, attack: 0.001 });
    tone(d, t, 0.1, { type: 'triangle', f: 230, f2: 70, gain: 0.6 });
    noise(d, t + 0.004, 0.3, { type: 'bandpass', f: 1700, f2: 400, q: 0.8, gain: 0.25 });
  } else {
    noise(d, t, 0.22, { f: 7000, f2: 500, gain: 1.0, attack: 0.001 });
    tone(d, t, 0.18, { type: 'triangle', f: 190, f2: 50, gain: 0.9 });
    noise(d, t + 0.005, 0.5, { type: 'bandpass', f: 1400, f2: 300, q: 0.7, gain: 0.35 });
  }
}
export function click(f = 2400, g = 0.25, dt = 0) {
  if (!ctx) return; const t = now() + dt, d = out(null, 0.1);
  noise(d, t, 0.04, { type: 'bandpass', f, q: 4, gain: g });
  tone(d, t, 0.03, { type: 'square', f: f * 0.5, gain: g * 0.3 });
}
export function reloadSeq(kind) {
  if (!ctx) return;
  if (kind === 'pistol') { click(1500, 0.3, 0.1); click(900, 0.25, 0.55); click(2600, 0.35, 1.0); click(3200, 0.3, 1.12); }
}
export function shell() { if (!ctx) return; click(1800, 0.3); click(1100, 0.22, 0.08); }
export function pump() { if (!ctx) return; click(700, 0.45); click(1300, 0.4, 0.16); }
export function empty() { click(3400, 0.3); }
export function brass() { if (!ctx) return; const t = now() + R(0.25, 0.4), d = out(null, 0.2); tone(d, t, 0.08, { f: R(4000, 5200), gain: 0.06 }); tone(d, t + 0.09, 0.05, { f: R(4200, 5400), gain: 0.03 }); }

export function ricochet(pos) {
  if (!ctx) return; const t = now(), d = out(pos, 0.5);
  noise(d, t, 0.06, { type: 'bandpass', f: R(2500, 4500), q: 2, gain: 0.5 });
  if (Math.random() < 0.35) tone(d, t, 0.25, { type: 'sine', f: R(2000, 3500), f2: R(700, 1200), gain: 0.08 });
}
export function fleshHit(pos) {
  if (!ctx) return; const t = now(), d = out(pos, 0.2);
  noise(d, t, 0.12, { f: 900, f2: 200, gain: 0.8 });
  tone(d, t, 0.1, { type: 'sine', f: 140, f2: 60, gain: 0.5 });
}

// ---------- player ----------
export function footstep(intensity = 1, wet = false) {
  if (!ctx) return; const t = now(), d = out(null, 0.25);
  noise(d, t, 0.09 + 0.05 * intensity, { type: 'bandpass', f: R(300, 520), q: 0.9, gain: 0.18 * intensity });
  noise(d, t, 0.04, { type: 'highpass', f: 2500, gain: 0.05 * intensity });
  if (wet) noise(d, t + 0.02, 0.15, { type: 'bandpass', f: 1800, q: 3, gain: 0.07 });
}
export function land(h = 1) { if (!ctx) return; const t = now(), d = out(null, 0.3); noise(d, t, 0.18, { f: 400, gain: 0.35 * h }); tone(d, t, 0.15, { f: 80, f2: 40, gain: 0.3 * h }); }
export function hurt() {
  if (!ctx) return; const t = now(), d = out(null, 0.2);
  noise(d, t, 0.18, { f: 300, gain: 0.8 });
  const o = tone(d, t, 0.32, { type: 'sawtooth', f: R(150, 180), f2: 95, gain: 0.25, attack: 0.02 });
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
  o.disconnect(); const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.connect(fl); fl.connect(g); g.connect(d);
}
export function heartbeat(strength) {
  if (!ctx) return; const t = now(), d = out(null, 0);
  tone(d, t, 0.14, { f: 55, f2: 40, gain: 0.8 * strength });
  tone(d, t + 0.22, 0.12, { f: 50, f2: 38, gain: 0.55 * strength });
}
export function breath(strength) {
  if (!ctx) return; const t = now(), d = out(null, 0.1);
  noise(d, t, 0.55, { type: 'bandpass', f: 900, f2: 600, q: 0.8, gain: 0.05 * strength, attack: 0.2 });
}
export function heal() { if (!ctx) return; const t = now(), d = out(null, 0.3); [523, 659, 784].forEach((f, i) => tone(d, t + i * 0.08, 0.4, { f, gain: 0.12 })); noise(d, t, 0.3, { type: 'highpass', f: 3000, gain: 0.06 }); }
export function flashlight(on) { click(on ? 2000 : 1500, 0.3); }

// ---------- world ----------
export function pickup(kind) {
  if (!ctx) return; const t = now(), d = out(null, 0.3);
  if (kind === 'key') { [880, 1320, 1760].forEach((f, i) => tone(d, t + i * 0.07, 0.25, { type: 'square', f, gain: 0.06 })); }
  else if (kind === 'weapon') { click(800, 0.5); click(1600, 0.4, 0.12); tone(d, t, 0.6, { f: 220, f2: 110, gain: 0.2 }); }
  else { click(1200, 0.35); click(2000, 0.25, 0.06); }
}
export function door(pos, open = true) {
  if (!ctx) return; const t = now(), d = out(pos, 0.5);
  noise(d, t, 0.25, { type: 'highpass', f: 2200, gain: 0.25 });
  noise(d, t + 0.05, 0.9, { type: 'bandpass', f: open ? 200 : 260, f2: open ? 120 : 160, q: 2, gain: 0.5, attack: 0.1 });
  tone(d, t + 0.85, 0.2, { f: 70, gain: 0.4 });
}
export function denied(pos) {
  if (!ctx) return; const t = now(), d = out(pos, 0.2);
  tone(d, t, 0.18, { type: 'square', f: 180, gain: 0.12 }); tone(d, t + 0.22, 0.25, { type: 'square', f: 140, gain: 0.12 });
}
export function granted(pos) { if (!ctx) return; const t = now(), d = out(pos, 0.2); tone(d, t, 0.1, { type: 'square', f: 1200, gain: 0.08 }); tone(d, t + 0.12, 0.15, { type: 'square', f: 1600, gain: 0.08 }); }
export function radio() { if (!ctx) return; const t = now(), d = out(null, 0.1); noise(d, t, 0.7, { type: 'bandpass', f: 2200, q: 0.6, gain: 0.25, attack: 0.05 }); click(900, 0.3); }
export function breaker() {
  if (!ctx) return; const t = now(), d = out(null, 0.8);
  noise(d, t, 0.15, { f: 3000, gain: 1 }); tone(d, t, 0.6, { f: 90, f2: 30, gain: 1 });
  tone(d, t + 0.4, 3, { type: 'sawtooth', f: 40, f2: 60, gain: 0.15, attack: 1.5 });
}
export function liftArrive() {
  if (!ctx) return; const t = now(), d = out(null, 0.8);
  [392, 523, 659].forEach((f, i) => tone(d, t + i * 0.25, 1.2, { f, gain: 0.2 }));
  noise(d, t, 2.5, { f: 200, gain: 0.4, attack: 0.5, brown: true });
}
export function flame() { if (!ctx) return; const t = now(), d = out(null, 0.25); noise(d, t, 0.2, { type: 'bandpass', f: 900, f2: 1400, q: 0.6, gain: 0.32, attack: 0.02 }); noise(d, t, 0.18, { f: 260, gain: 0.25, brown: true }); }
export function burst(pos) { if (!ctx) return; const t = now(), d = out(pos, 0.6); noise(d, t, 0.6, { f: 1800, f2: 120, gain: 1.2 }); noise(d, t, 0.35, { type: 'bandpass', f: 600, q: 1.2, gain: 0.8 }); tone(d, t, 0.4, { f: 90, f2: 35, gain: 0.8 }); }
export function swell(pos) { if (!ctx) return; const t = now(), d = out(pos, 0.3); tone(d, t, 0.7, { type: 'sawtooth', f: 70, f2: 160, gain: 0.25 }); noise(d, t, 0.7, { type: 'bandpass', f: 400, f2: 1600, q: 2, gain: 0.35, attack: 0.2 }); }
export function spit(pos) { if (!ctx) return; const t = now(), d = out(pos, 0.3); noise(d, t, 0.3, { type: 'bandpass', f: 700, f2: 1800, q: 1.5, gain: 0.7 }); }
export function splat(pos) { if (!ctx) return; const t = now(), d = out(pos, 0.3); noise(d, t, 0.25, { f: 1500, f2: 200, gain: 0.6 }); }

// ---------- monsters ----------
// a voice: filtered saw/noise with vibrato + formants
function voice(pos, { f = 120, f2 = 80, dur = 1, gain = 0.5, rough = 0.5, form = [600, 1200], wet = 0.5 }) {
  const t = now(), d = out(pos, wet);
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const lfo = ctx.createOscillator(); lfo.frequency.value = R(5, 13); const lg = ctx.createGain(); lg.gain.value = f * 0.08 * (1 + rough);
  lfo.connect(lg); lg.connect(o.frequency);
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(f * 1.013, t); o2.frequency.exponentialRampToValueAtTime(f2 * 1.02, t + dur);
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  o.connect(mix); o2.connect(mix);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.15, dur * 0.2));
  env.gain.setValueAtTime(gain, t + dur * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const ff of form) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = ff * R(0.9, 1.1); b.Q.value = 4; mix.connect(b); b.connect(env); }
  env.connect(d);
  // raspy breath noise on top
  noise(d, t, dur, { type: 'bandpass', f: form[0] * 1.5, q: 1, gain: gain * rough * 0.6, attack: 0.05 });
  o.start(t); o2.start(t); lfo.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
}

const VOICES = {
  husk: { idle: { f: 95, f2: 70, dur: 1.6, gain: 0.35, rough: 0.8, form: [500, 900] }, alert: { f: 420, f2: 260, dur: 1.1, gain: 0.7, rough: 1.2, form: [900, 2100] } },
  crawler: { idle: { f: 260, f2: 200, dur: 0.6, gain: 0.25, rough: 1.5, form: [1400, 2600] }, alert: { f: 900, f2: 1300, dur: 0.7, gain: 0.55, rough: 1.8, form: [1800, 3200] } },
  brute: { idle: { f: 55, f2: 42, dur: 2.2, gain: 0.6, rough: 0.7, form: [250, 500] }, alert: { f: 110, f2: 60, dur: 1.8, gain: 1.0, rough: 1.0, form: [350, 800] } },
  spitter: { idle: { f: 160, f2: 120, dur: 1.2, gain: 0.3, rough: 1.4, form: [700, 1500] }, alert: { f: 500, f2: 380, dur: 0.9, gain: 0.55, rough: 1.6, form: [1100, 2500] } },
  burster: { idle: { f: 70, f2: 55, dur: 1.8, gain: 0.4, rough: 1.4, form: [300, 700] }, alert: { f: 210, f2: 140, dur: 1.2, gain: 0.7, rough: 1.7, form: [500, 1200] } },
  stalker: { idle: { f: 70, f2: 64, dur: 2.6, gain: 0.45, rough: 0.3, form: [300, 2600] }, alert: { f: 1200, f2: 240, dur: 2.2, gain: 0.85, rough: 2.2, form: [1600, 3600] } },
  host: { idle: { f: 40, f2: 30, dur: 3, gain: 0.8, rough: 0.9, form: [180, 420] }, alert: { f: 85, f2: 38, dur: 2.6, gain: 1.2, rough: 1.3, form: [260, 700, 1500] } },
};
export function growl(kind, pos) { if (ctx) voice(pos, { ...VOICES[kind].idle, f: VOICES[kind].idle.f * R(0.85, 1.15) }); }
export function shriek(kind, pos) { if (ctx) voice(pos, { ...VOICES[kind].alert, f: VOICES[kind].alert.f * R(0.9, 1.1) }); }
export function attack(kind, pos) { if (!ctx) return; const v = VOICES[kind].alert; voice(pos, { ...v, dur: 0.4, gain: v.gain * 0.8 }); noise(out(pos, 0.2), now() + 0.25, 0.15, { type: 'bandpass', f: 800, q: 1, gain: 0.4 }); }
export function pain(kind, pos) { if (!ctx) return; const v = VOICES[kind].alert; voice(pos, { ...v, f: v.f * 1.2, f2: v.f, dur: 0.3, gain: v.gain * 0.6 }); }
export function death(kind, pos) { if (!ctx) return; const v = VOICES[kind].alert; voice(pos, { ...v, f: v.f, f2: v.f * 0.3, dur: 1.4, gain: v.gain * 0.8 }); setTimeout(() => ctx && noise(out(pos, 0.3), now(), 0.4, { f: 300, gain: 0.5 }), 600); }
export function step(kind, pos) {
  if (!ctx) return; const t = now(), d = out(pos, 0.2);
  const big = kind === 'brute' || kind === 'host';
  noise(d, t, big ? 0.25 : 0.08, { type: 'bandpass', f: big ? 120 : (kind === 'crawler' ? 1200 : 380), q: 1, gain: big ? 0.9 : 0.25 });
  if (big) tone(d, t, 0.2, { f: 50, f2: 30, gain: 0.6 });
}

// ---------- melee ----------
export function swing() { if (!ctx) return; const t = now(), d = out(null, 0.1); noise(d, t, 0.22, { type: 'bandpass', f: 500, f2: 2200, q: 1.2, gain: 0.35, attack: 0.04 }); }
export function meleeHit(flesh, pos) {
  if (!ctx) return; const t = now(), d = out(pos, 0.3);
  if (flesh) { noise(d, t, 0.18, { f: 900, f2: 150, gain: 0.9 }); tone(d, t, 0.12, { f: 110, f2: 50, gain: 0.7 }); }
  else { tone(d, t, 0.5, { type: 'triangle', f: R(1800, 2300), f2: 1500, gain: 0.25 }); tone(d, t, 0.4, { type: 'square', f: R(3100, 3500), gain: 0.05 }); noise(d, t, 0.08, { type: 'highpass', f: 3000, gain: 0.5 }); }
}
// something heavy hitting a door from the far side
export function thump(pos) { if (!ctx) return; const t = now(), d = out(pos, 0.6); noise(d, t, 0.35, { f: 260, gain: 1.1, brown: true }); tone(d, t, 0.3, { f: 65, f2: 38, gain: 0.9 }); noise(d, t, 0.6, { type: 'bandpass', f: 140, q: 8, gain: 0.3 }); }
export function whisper(pos) {
  if (!ctx) return; const t = now(), d = out(pos, 0.5);
  for (let i = 0; i < 5; i++) noise(d, t + i * R(0.12, 0.22), R(0.15, 0.3), { type: 'bandpass', f: R(2500, 4500), q: 6, gain: 0.18, attack: 0.05 });
}

// stalker chase: a fast pulse plus screeching strings while it hunts you
let chase = null;
export function chaseMusic(on) {
  if (!ctx) return;
  if (on && !chase) {
    const t = now(), g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.6); g.connect(mus); g.connect(verbIn);
    const ns = [];
    for (const f of [622, 659, 932]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.025; const v = ctx.createOscillator(); v.frequency.value = R(5, 8); const vg = ctx.createGain(); vg.gain.value = 12; v.connect(vg); vg.connect(o.frequency); o.connect(og); og.connect(g); o.start(); v.start(); ns.push(o, v); }
    const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 46; const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 220;
    const am = ctx.createGain(); am.gain.value = 0; const amL = ctx.createOscillator(); amL.type = 'square'; amL.frequency.value = 3.2; const amG = ctx.createGain(); amG.gain.value = 0.35;
    amL.connect(amG); amG.connect(am.gain); b.connect(bl); bl.connect(am); am.connect(g); b.start(); amL.start(); ns.push(b, amL);
    chase = { g, ns };
  } else if (!on && chase) {
    const c = chase; chase = null; c.g.gain.cancelScheduledValues(now()); c.g.gain.setValueAtTime(c.g.gain.value, now()); c.g.gain.linearRampToValueAtTime(0, now() + 2);
    setTimeout(() => c.ns.forEach((n) => { try { n.stop(); } catch {} }), 2200);
  }
}

// ---------- scares + ambience ----------
export function stinger() {
  if (!ctx) return; const t = now(), d = out(null, 0.9);
  [220, 233, 311, 466, 622].forEach((f) => tone(d, t, 1.8, { type: 'sawtooth', f, f2: f * 0.94, gain: 0.08, attack: 0.01 }));
  noise(d, t, 1.4, { type: 'highpass', f: 1500, f2: 6000, gain: 0.35, attack: 0.01 });
  tone(d, t, 1, { f: 60, f2: 30, gain: 0.9 });
}
export function distant(kind) {
  if (!ctx) return; const a = R(0, Math.PI * 2), r = R(14, 30);
  const p = { x: listenerPos().x + Math.cos(a) * r, y: 1.5, z: listenerPos().z + Math.sin(a) * r };
  const t = now(), d = out(p, 1.2);
  if (kind === 'bang') { for (let i = 0; i < 3; i++) { noise(d, t + i * R(0.25, 0.4), 0.4, { f: 500, gain: 0.7, brown: true }); tone(d, t + i * 0.3, 0.3, { f: 70, f2: 40, gain: 0.5 }); } }
  else if (kind === 'metal') { tone(d, t, 3, { type: 'sawtooth', f: R(70, 110), f2: R(40, 60), gain: 0.06, attack: 0.8 }); noise(d, t, 3, { type: 'bandpass', f: R(300, 900), f2: R(150, 300), q: 12, gain: 0.25, attack: 1 }); }
  else if (kind === 'scream') voice(p, { f: R(500, 700), f2: R(250, 350), dur: 1.6, gain: 0.35, rough: 1.4, form: [1000, 2400], wet: 1.5 });
  else if (kind === 'drip') { tone(d, t, 0.12, { f: R(1500, 2400), f2: 600, gain: 0.07 }); }
  else if (kind === 'vent') { for (let i = 0; i < 6; i++) noise(d, t + i * R(0.12, 0.2), 0.12, { type: 'bandpass', f: 900, q: 3, gain: 0.25 }); }
  else if (kind === 'behind') {
    // footsteps right behind the player
    const f = lastFwd; const b = { x: listenerPos().x - f.x * 2.5, y: 0.2, z: listenerPos().z - f.z * 2.5 };
    for (let i = 0; i < 3; i++) noise(out(b, 0.2), t + i * 0.45, 0.1, { type: 'bandpass', f: 420, q: 1, gain: 0.25 });
  }
}
let lastP = { x: 0, y: 0, z: 0 }, lastFwd = { x: 0, z: 1 };
function listenerPos() { return lastP; }
export function trackListener(p, f) { lastP = p; lastFwd = f; setListenerRaw(p, f); }

let drone = null;
export function startAmbience(floor) {
  if (!ctx) return; stopAmbience();
  const t = now(), nodes = [];
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 3); g.connect(amb);
  const base = [41, 37, 33][floor % 3];
  for (const [f, gg] of [[base, 0.12], [base * 1.5 * 1.006, 0.05], [base * 2.01, 0.04]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const lfo = ctx.createOscillator(); lfo.frequency.value = R(0.05, 0.15); const lg = ctx.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(lp.frequency);
    const og = ctx.createGain(); og.gain.value = gg; o.connect(lp); lp.connect(og); og.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
  }
  // air handling hiss
  const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 400; const sg = ctx.createGain(); sg.gain.value = 0.18;
  s.connect(bp); bp.connect(sg); sg.connect(g); s.start(); nodes.push(s);
  drone = { g, nodes };
}
export function stopAmbience() {
  if (!drone) return; const d = drone; drone = null; const t = now();
  d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 1);
  setTimeout(() => d.nodes.forEach((n) => { try { n.stop(); } catch {} }), 1200);
}

// finale: alarm siren + pulsing music
let alarm = null;
export function startAlarm() {
  if (!ctx || alarm) return; const t = now();
  const g = ctx.createGain(); g.gain.value = 0.09; g.connect(mus); g.connect(verbIn);
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 600;
  const l = ctx.createOscillator(); l.frequency.value = 0.5; const lg = ctx.createGain(); lg.gain.value = 180; l.connect(lg); lg.connect(o.frequency);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; o.connect(lp); lp.connect(g);
  const pulse = ctx.createGain(); pulse.gain.value = 0.25; pulse.connect(mus);
  const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 55; const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 300;
  const am = ctx.createGain(); am.gain.value = 0; b.connect(bl); bl.connect(am); am.connect(pulse);
  const amL = ctx.createOscillator(); amL.type = 'square'; amL.frequency.value = 2.33; const amG = ctx.createGain(); amG.gain.value = 0.5; amL.connect(amG); amG.connect(am.gain);
  [o, l, b, amL].forEach((n) => n.start(t));
  alarm = { nodes: [o, l, b, amL], g, pulse };
}
export function stopAlarm() {
  if (!alarm) return; const a = alarm; alarm = null;
  a.g.gain.linearRampToValueAtTime(0, now() + 0.5); a.pulse.gain.linearRampToValueAtTime(0, now() + 0.5);
  setTimeout(() => a.nodes.forEach((n) => { try { n.stop(); } catch {} }), 700);
}

export function menuMusic(on) {
  if (!ctx) return;
  if (on && !menuMusic.n) {
    const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.5, now() + 4); g.connect(mus); g.connect(verbIn);
    const ns = [];
    for (const f of [55, 82.4, 87.3, 130.8]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = R(-8, 8);
      const og = ctx.createGain(); og.gain.value = 0.06; const l = ctx.createOscillator(); l.frequency.value = R(0.03, 0.1); const lg = ctx.createGain(); lg.gain.value = 0.05;
      l.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(g); o.start(); l.start(); ns.push(o, l);
    }
    menuMusic.n = { g, ns };
  } else if (!on && menuMusic.n) {
    const m = menuMusic.n; menuMusic.n = null; m.g.gain.linearRampToValueAtTime(0, now() + 1.5);
    setTimeout(() => m.ns.forEach((n) => n.stop()), 1700);
  }
}
