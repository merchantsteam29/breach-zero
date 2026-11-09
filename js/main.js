// BREACH: ZERO: engine loop, floors, lighting, objectives, scares, stalker scenes, the boss finale,
// survival mode, records and unlocks, controller input, HUD and menus.
import * as THREE from 'three';
import { FLOORS, ARENA, DIFFICULTY } from './levels.js';
import { buildWorld, unlockDoor, C, H, KEYNAME } from './world.js';
import { Enemies } from './enemies.js';
import { Player, WEAPON_ORDER, WEAPON_NAME } from './player.js';
import { FX, makeComposer } from './fx.js';
import { cookieTex } from './textures.js';
import { Pad, BTN } from './pad.js';
import * as A from './audio.js';

const $ = (id) => document.getElementById(id);
const TEST = new URLSearchParams(location.search).has('test');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const TOTAL_NOTES = FLOORS.reduce((n, F) => n + F.notes.length, 0);

// ---------- settings ----------
const DEF = { sens: 1, fov: 80, bright: 1, vol: 0.8, amb: 0.8, quality: 'medium', invert: false, bob: true, reduceFlash: false, autoRes: true, pads: true, padSens: 1,
  extras: { vhs: false, noir: false, light: false, gold: false } };
const settings = { ...DEF, ...store.get('bz_settings', {}) };
settings.extras = { ...DEF.extras, ...(settings.extras || {}) };
const QUAL = {
  low: { pr: 0.75, shadow: 512, lights: 3, maxPx: 1280 * 720 },
  medium: { pr: 1, shadow: 1024, lights: 5, maxPx: 1920 * 1080 },
  high: { pr: 1.5, shadow: 2048, lights: 7, maxPx: 2560 * 1440 },
};

// ---------- records + unlocks ----------
const REC0 = { runs: 0, escapes: 0, deaths: 0, kills: 0, best: {}, nightmare: false, logs: [], survWave: 0, survKills: 0, bossKills: 0 };
const rec = { ...REC0, ...store.get('bz_records', {}) };
const saveRec = () => store.set('bz_records', rec);
const EXTRAS = [
  { key: 'vhs', name: 'VHS tape filter', how: 'Escape the lab on any difficulty', ok: () => rec.escapes > 0 },
  { key: 'noir', name: 'Noir filter (black & white, red stays red)', how: `Find all ${TOTAL_NOTES} audio logs (across any runs)`, ok: () => rec.logs.length >= TOTAL_NOTES },
  { key: 'light', name: 'Infinite flashlight', how: 'Escape on Nightmare', ok: () => rec.nightmare },
  { key: 'gold', name: 'Golden guns', how: 'Reach wave 10 in Survival', ok: () => rec.survWave >= 10 },
];
const unlockedKeys = () => EXTRAS.filter((x) => x.ok()).map((x) => x.key);

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.08);
// the fog is fully black well before 40 m, so nothing past that needs drawing
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 40);
const vmScene = new THREE.Scene(); const vmCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 5);
const hemi = new THREE.HemisphereLight(0x1a2430, 0x050505, 2.6); scene.add(hemi);

const G = {
  renderer, scene, camera, vmScene, settings, cookie: cookieTex(), state: 'boot', diff: DIFFICULTY.normal, diffKey: 'normal', mode: 'story',
  stats: null, keys: new Set(), floor: 0, world: null, flow: null, blackout: 0, god: false, cheats: {},
};
G.fx = new FX(scene);
G.player = new Player(G);
G.enemies = new Enemies(G);
G.shake = (a) => { G.player.trauma = Math.min(1, G.player.trauma + a * (settings.reduceFlash ? 0.5 : 1)); };

let post = null, pool = [], dynScale = 1;
// render resolution = quality's pixel ratio x dynScale (auto-lowered when the frame rate drops)
function sizeRenderer() {
  const q = QUAL[settings.quality] || QUAL.medium;
  // never shade more than the quality's pixel budget, however big the window is (4K screens!)
  const budget = Math.sqrt(q.maxPx / Math.max(1, innerWidth * innerHeight));
  renderer.setPixelRatio(Math.min(Math.min(devicePixelRatio, 1) * q.pr, budget) * dynScale);
  renderer.setSize(innerWidth, innerHeight, false);
  if (post) { post.comp.setPixelRatio(renderer.getPixelRatio()); post.comp.setSize(innerWidth, innerHeight); }
}
function applyQuality() {
  const q = QUAL[settings.quality] || QUAL.medium;
  dynScale = 1; sizeRenderer(); applyBump();
  G.player.setShadowRes(q.shadow);
  for (const l of pool) scene.remove(l);
  pool = [];
  for (let i = 0; i < q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 15, 1.4); l.castShadow = false; scene.add(l); pool.push(l); }
  if (post) post.comp.dispose();
  post = makeComposer(renderer, scene, camera, vmScene, vmCam, settings.quality);
  post.comp.setPixelRatio(renderer.getPixelRatio()); post.comp.setSize(innerWidth, innerHeight);
}
// bump-mapped walls/floors cost ~25% of the frame on their own: Low quality goes without
function applyBump() {
  const on = settings.quality !== 'low', M = G.world?.materials; if (!M) return;
  for (const m of [M.wall, M.floor]) { const want = on ? m.userData.bump : null; if (m.bumpMap !== want) { m.bumpMap = want; m.needsUpdate = true; } }
}
// Below ~50 fps for 1.5 s, drop the render resolution a step (to 50% at most); above ~57 fps
// for 6 s, step it back up. Keeps weak GPUs playable without touching the settings.
let slowT = 0, fastT = 0;
function autoResolution(rawDt) {
  if (!settings.autoRes && dynScale !== 1) { dynScale = 1; sizeRenderer(); }
  if (TEST || !settings.autoRes || G.state !== 'play' || rawDt > 0.25) { slowT = fastT = 0; return; }
  if (fpsAvg < 50) { slowT += rawDt; fastT = 0; } else if (fpsAvg > 57) { fastT += rawDt; slowT = 0; } else slowT = fastT = 0;
  if (slowT > 1.5 && dynScale > 0.5) { dynScale = Math.max(0.5, dynScale - 0.15); slowT = 0; sizeRenderer(); }
  else if (fastT > 6 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.15); fastT = 0; sizeRenderer(); }
}
function applySettings() {
  renderer.toneMappingExposure = settings.bright * 1.2;
  A.setVolumes({ master: settings.vol, amb: settings.amb, mus: settings.amb });
  camera.fov = settings.fov; camera.updateProjectionMatrix();
}
// unlockable extras (only the ones actually earned take effect)
const GOLD = [0xd8a93e, 0x9c7424], gunCols = G.player.gunMats.map((m) => m.color.getHex());
function applyExtras() {
  const u = new Set(unlockedKeys()), x = settings.extras, on = (k) => !!x[k] && u.has(k);
  G.cheats = { light: on('light'), gold: on('gold') };
  G.player.gunMats.forEach((m, i) => { m.color.setHex(G.cheats.gold ? GOLD[i] : gunCols[i]); m.metalness = G.cheats.gold ? 0.95 : i ? 0.4 : 0.6; m.roughness = G.cheats.gold ? 0.25 : i ? 0.55 : 0.35; });
  G.filter = on('vhs') ? 1 : on('noir') ? 2 : 0;
}
addEventListener('resize', () => {
  camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  sizeRenderer();
});

// ---------- input ----------
const I = { keys: {}, dx: 0, dy: 0, lmb: false, lmbEdge: false, rmb: false, jump: false, melee: false, locked: false, pad: null };
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (I.keys[e.code]) return; I.keys[e.code] = true;
  if (G.state !== 'play') return;
  const P = G.player;
  if (e.code === 'Space') { I.jump = true; e.preventDefault(); }
  if (e.code === 'KeyR') P.reload();
  if (e.code === 'KeyF') toggleLight();
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyQ') P.useMedkit();
  if (e.code === 'KeyV') I.melee = true;
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0) P.switchTo(WEAPON_ORDER[n]);
  if (e.code === 'KeyP' || (TEST && e.code === 'Escape')) pause();
});
addEventListener('keyup', (e) => { I.keys[e.code] = false; });
addEventListener('blur', () => { I.keys = {}; I.lmb = I.rmb = false; });
addEventListener('mousemove', (e) => { if (I.locked) { I.dx += e.movementX; I.dy += e.movementY; } });
canvas.addEventListener('mousedown', (e) => {
  if (G.state === 'play' && !I.locked && !TEST) { lock(); return; }
  if (e.button === 0) { I.lmb = true; I.lmbEdge = true; } if (e.button === 2) I.rmb = true; if (e.button === 1) I.melee = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (G.state === 'play') G.player.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  I.locked = document.pointerLockElement === canvas;
  if (I.locked) $('clickPlay').hidden = true;
  else if (G.state === 'play' && !TEST && !I.pad) pause();
});
function lock() {
  if (TEST) { I.locked = true; return; }
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch {} setTimeout(() => { if (!I.locked && !I.pad && G.state === 'play') $('clickPlay').hidden = false; }, 300); });
  } catch { if (!I.pad) $('clickPlay').hidden = false; }
}
$('clickPlay').addEventListener('click', () => lock());
function toggleLight() {
  const P = G.player; if (!P.alive) return;
  if (!P.flashDead) { P.flashOn = !P.flashOn; A.flashlight(P.flashOn); } else A.empty();
}

// ---------- controller ----------
// Only trusted pads (standard mapping, not wheels/joysticks), axes count only after being seen centred.
const pad = new Pad();
let padSprint = false, navT = 0, focusI = 0;
function pollPad(dt) {
  pad.enabled = !!settings.pads;
  const p = pad.poll();
  if (!p) { I.pad = null; return; }
  if (G.state === 'play') {
    $('clickPlay').hidden = true;
    const curve = (v) => v * Math.abs(v), s = 1150 * settings.sens * settings.padSens * dt;
    I.dx += curve(p.rx) * s; I.dy += curve(p.ry) * s * 0.75;
    if (p.pressed(BTN.L3)) padSprint = !padSprint;
    if (p.ly > -0.3) padSprint = false;
    I.pad = { mx: p.lx, mz: -p.ly, sprint: padSprint, crouch: p.down(BTN.B) };
    if (p.down(BTN.RT)) { if (!I.padFire) I.lmbEdge = true; I.lmb = true; I.padFire = true; } else if (I.padFire) { I.lmb = false; I.padFire = false; }
    I.rmb = p.down(BTN.LT) || (I.rmb && !I.padAim); I.padAim = p.down(BTN.LT);
    const P = G.player;
    if (p.pressed(BTN.A)) I.jump = true;
    if (p.pressed(BTN.X)) { if (!$('hLog').hidden || nearestUse()) interact(); else P.reload(); }
    if (p.pressed(BTN.Y) || p.pressed(BTN.RIGHT)) P.cycle(1);
    if (p.pressed(BTN.LEFT)) P.cycle(-1);
    if (p.pressed(BTN.LB)) toggleLight();
    if (p.pressed(BTN.RB)) I.melee = true;
    if (p.pressed(BTN.UP)) P.useMedkit();
    if (p.pressed(BTN.START) || p.pressed(BTN.BACK)) pause();
  } else {
    I.pad = { mx: 0, mz: 0 };
    menuNav(p, dt);
  }
}
// D-pad / stick moves a highlight through the open menu; A presses, B goes back
function menuNav(p, dt) {
  const scr = [...document.querySelectorAll('.screen')].find((s) => !s.hidden); if (!scr) return;
  const items = [...scr.querySelectorAll('button, input, select')].filter((el) => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
  if (!items.length) return;
  navT -= dt;
  const v = p.down(BTN.DOWN) || p.ly > 0.5 ? 1 : p.down(BTN.UP) || p.ly < -0.5 ? -1 : 0;
  const h = p.down(BTN.RIGHT) || p.lx > 0.5 ? 1 : p.down(BTN.LEFT) || p.lx < -0.5 ? -1 : 0;
  let cur = items.indexOf(document.activeElement);
  if (cur < 0) { cur = Math.min(focusI, items.length - 1); items[cur].focus(); }
  if (v && navT <= 0) { navT = 0.18; cur = (cur + v + items.length) % items.length; items[cur].focus(); A.click(2600, 0.08); }
  else if (!v && !h) navT = 0;
  focusI = cur;
  const el = items[cur];
  if (h && navT <= 0 && el) {
    navT = 0.12;
    if (el.type === 'range') { el.value = +el.value + h * (+el.step || 1) * (el.max - el.min > 5 ? 2 : 1); el.dispatchEvent(new Event('input')); }
    else if (el.tagName === 'SELECT') { el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + h)); el.dispatchEvent(new Event('change')); }
  }
  if (p.pressed(BTN.A) && el) { A.initAudio(); el.click(); }
  if (p.pressed(BTN.B) || (p.pressed(BTN.START) && G.state === 'pause')) {
    if (G.state === 'pause' && scr.id === 'sPause') resume();
    else scr.querySelector('[data-back]')?.click();
  }
}

// ---------- UI helpers ----------
const ui = {
  cache: {},
  set(id, v, prop = 'textContent') { const k = id + prop; if (this.cache[k] === v) return; this.cache[k] = v; $(id)[prop] = v; },
  // style / class writes only when the value changes (they dirty the page's style every frame otherwise)
  style(id, p, v) { const k = id + '|' + p; if (this.cache[k] === v) return; this.cache[k] = v; if (p.startsWith('--')) $(id).style.setProperty(p, v); else $(id).style[p] = v; },
  cls(el, c, on) { if (el.classList.contains(c) !== on) el.classList.toggle(c, on); },
  hitmarker(kill, head) {
    const h = $('hitmark'); h.className = 'hitmark show' + (kill ? ' kill' : '');
    clearTimeout(this.hmT); this.hmT = setTimeout(() => (h.className = 'hitmark' + (kill ? ' kill' : '')), kill ? 220 : 90);
    if (kill && head) this.flash('HEADSHOT', 600);
  },
  damageDir(from) {
    const P = G.player, vx = from.x - P.pos.x, vz = from.z - P.pos.z;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const ang = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
    const i = document.createElement('i'); i.style.transform = `rotate(${ang}rad)`; $('dmgdirs').appendChild(i);
    setTimeout(() => i.remove(), 900);
  },
  flash(text, ms = 1800, color = '') {
    const t = $('hToast'); t.textContent = text; t.style.color = color; t.classList.add('show');
    clearTimeout(this.tT); this.tT = setTimeout(() => t.classList.remove('show'), ms);
  },
};
G.ui = ui;

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  focusI = 0;
  if (id && I.pad) setTimeout(() => $(id)?.querySelector('button.primary, button')?.focus(), 30);
}

// ---------- floors ----------
function disposeWorld() {
  if (!G.world) return;
  scene.remove(G.world.group);
  G.world.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); });
  G.world = null;
}

function loadFloor(fi, { menu = false, arena = false } = {}) {
  disposeWorld(); G.enemies.clear(); G.fx.clear();
  const F = arena ? ARENA : FLOORS[fi];
  G.floor = fi; G.keys = new Set(); G.powerOn = false; G.finale = null; G.liftArrived = false; G.blackout = 0;
  G.stalker = null; G.stalkerDone = false; G.boss = null; G.bossDead = false;
  A.chaseMusic(false); $('hBoss').hidden = true;
  G.world = buildWorld(scene, arena ? 9 : fi, F); applyBump();
  scene.fog.density = F.fog; hemi.color.setHex(F.ambient);
  const W = G.world;
  for (const s of W.spawns) {
    if (menu && s.dormant) continue;
    G.enemies.spawn(s.type, s.x, s.z, { dormant: s.dormant });
  }
  const P = G.player;
  P.pos.set(W.start.x, 0, W.start.z);
  // face the open side
  const [gx, gz] = W.cellOf(W.start.x, W.start.z); let best = 0, bestYaw = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let n = 0; while (n < 6 && !'#'.includes(W.grid[gz + dz * (n + 1)]?.[gx + dx * (n + 1)] ?? '#')) n++;
    if (n > best) { best = n; bestYaw = Math.atan2(-dx, -dz); }
  }
  P.yaw = bestYaw; P.pitch = 0;
  G.flowCell = null; updateFlow(true);
  G.eventT = 20 + Math.random() * 20; G.dripT = 3;
  warmShaders();
  if (!menu) { A.startAmbience(fi); showFloorCard(F, fi, arena); }
}

function showFloorCard(F, fi, arena) {
  const c = $('floorCard'); c.hidden = true; void c.offsetWidth;
  $('fcNum').textContent = arena ? 'SURVIVAL' : `FLOOR ${fi + 1} / ${FLOORS.length}`; $('fcName').textContent = F.name; $('fcSub').textContent = F.sub; c.hidden = false;
  clearTimeout(showFloorCard.t); showFloorCard.t = setTimeout(() => (c.hidden = true), 4600);
}

// Compile every shader the floor can need up front (hidden ambushers, decals, acid, every
// monster material) so the first sight of something new doesn't freeze the game for a moment.
function warmShaders() {
  const extra = G.enemies.warmGroup(); scene.add(extra);
  const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { renderer.compile(scene, camera); renderer.compile(vmScene, vmCam); } catch {}
  for (const o of hidden) o.visible = false;
  scene.remove(extra);
}

// BFS flow field from the player's cell: monsters walk downhill on it
function updateFlow(force) {
  const W = G.world, P = G.player; if (!W) return;
  const [px, pz] = W.cellOf(P.pos.x, P.pos.z), key = px + ',' + pz;
  if (!force && key === G.flowCell) return;
  G.flowCell = key;
  const n = W.W * W.D; if (!G.flow || G.flow.length !== n) G.flow = new Int16Array(n);
  const f = G.flow; f.fill(-1);
  if (px < 0 || pz < 0 || px >= W.W || pz >= W.D) return;
  const q = new Int32Array(n); let h = 0, t = 0; f[pz * W.W + px] = 0; q[t++] = pz * W.W + px;
  while (h < t) {
    const i = q[h++], x = i % W.W, z = (i / W.W) | 0, d = f[i] + 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, j = nz * W.W + nx;
      if (nx < 0 || nz < 0 || nx >= W.W || nz >= W.D || f[j] !== -1 || !W.walkable(nx, nz)) continue;
      f[j] = d; q[t++] = j;
    }
  }
}
G.flowAt = (x, z) => { const W = G.world, gx = Math.floor(x / C), gz = Math.floor(z / C); if (gx < 0 || gz < 0 || gx >= W.W || gz >= W.D) return -1; return G.flow[gz * W.W + gx]; };

// ---------- game flow ----------
function newStats() { return { kills: 0, shots: 0, hits: 0, time: 0, notes: 0, taken: 0, found: [] }; }

function startGame(diffKey, fromSave) {
  A.initAudio(); A.menuMusic(false); A.stopAlarm();
  G.mode = 'story'; G.surv = null; applyExtras();
  G.diffKey = diffKey; G.diff = DIFFICULTY[diffKey];
  if (fromSave) {
    G.stats = { ...newStats(), ...fromSave.stats };
    loadFloor(Math.min(fromSave.floor, FLOORS.length - 1)); G.player.load(fromSave.player);
  } else {
    G.stats = newStats(); G.player.resetAll(); loadFloor(0);
    rec.runs++; saveRec();
  }
  G.player.pos.set(G.world.start.x, 0, G.world.start.z);
  checkpoint();
  enterPlay();
  fadeIn();
}

function startSurvival(diffKey) {
  A.initAudio(); A.menuMusic(false); A.stopAlarm();
  G.mode = 'survival'; applyExtras();
  G.diffKey = diffKey; G.diff = DIFFICULTY[diffKey];
  G.stats = newStats();
  const P = G.player; P.resetAll();
  P.hasShotgun = true; P.hasSmg = true; P.medkits = 2;
  P.ammo.pistol.reserve = 60; P.ammo.shotgun.reserve = 12; P.ammo.smg.reserve = 90;
  loadFloor(0, { arena: true });
  P.pos.set(G.world.start.x, 0, G.world.start.z);
  G.surv = { wave: 0, state: 'break', t: 6, toSpawn: 0, spawnT: 0, bossUp: false };
  enterPlay(); fadeIn();
}

function checkpoint() {
  if (G.mode !== 'story') return;
  G.check = { floor: G.floor, player: G.player.save(), stats: { ...G.stats, found: [...G.stats.found] }, diff: G.diffKey };
  store.set('bz_save', G.check);
}

function enterPlay() {
  G.state = 'play'; show(null); $('hud').hidden = false; lock();
  G.player.showWeapon();
}

function pause() {
  if (G.state !== 'play') return;
  G.state = 'pause'; I.lmb = I.rmb = false; I.keys = {};
  const s = G.stats, row = (a, b) => `<span>${a}</span><span>${b}</span>`;
  $('pStats').innerHTML = G.mode === 'survival'
    ? row('Mode', 'Survival') + row('Difficulty', G.diff.label) + row('Wave', G.surv.wave) + row('Kills', s.kills) + row('Time', fmt(s.time))
    : row('Floor', `${G.floor + 1} / ${FLOORS.length}`) + row('Difficulty', G.diff.label) + row('Kills', s.kills) + row('Audio logs', `${s.found.length} / ${TOTAL_NOTES}`) + row('Time', fmt(s.time));
  $('bRestartFloor').textContent = G.mode === 'survival' ? 'Restart survival' : 'Restart floor';
  show('sPause'); $('clickPlay').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function resume() { if (G.state !== 'pause') return; enterPlay(); }

function retryFloor() {
  A.stopAlarm(); A.chaseMusic(false);
  if (G.mode === 'survival') { startSurvival(G.diffKey); return; }
  const c = G.check; G.stats = { ...newStats(), ...c.stats, found: [...c.stats.found] };
  loadFloor(c.floor); G.player.load(c.player); G.player.pos.set(G.world.start.x, 0, G.world.start.z);
  enterPlay(); fadeIn();
}

function toTitle() {
  A.stopAlarm(); A.stopAmbience(); A.chaseMusic(false);
  G.state = 'menu'; G.mode = 'story'; $('hud').hidden = true; $('hLog').hidden = true; $('hTimer').hidden = true;
  clearTimeout(showFloorCard.t); $('floorCard').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  loadFloor(0, { menu: true }); G.player.spawn();
  refreshTitle(); show('sTitle'); A.menuMusic(true);
}
function refreshTitle() {
  const s = store.get('bz_save', null);
  $('bContinue').hidden = !s;
  if (s) $('contInfo').textContent = `Floor ${s.floor + 1} / ${FLOORS.length} · ${DIFFICULTY[s.diff]?.label || ''}`;
  const n = unlockedKeys().length;
  $('extrasInfo').textContent = `${n} / ${EXTRAS.length} unlocked`;
}

function fadeIn() { const f = $('fade'); f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth; f.style.transition = 'opacity 1.4s'; f.style.opacity = 0; }
function fadeOut(ms = 900) { const f = $('fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = 1; return new Promise((r) => setTimeout(r, ms)); }

G.onKill = (e) => { G.stats.kills++; rec.kills++; if (e.T.boss) rec.bossKills++; saveRec(); };
G.onDeath = () => {
  A.stinger(); A.stopAlarm(); A.chaseMusic(false);
  rec.deaths++;
  let msg;
  if (G.mode === 'survival') {
    const w = Math.max(0, G.surv.wave - (G.surv.state === 'fight' ? 1 : 0));
    const newBest = w > rec.survWave;
    rec.survWave = Math.max(rec.survWave, w); rec.survKills = Math.max(rec.survKills, G.stats.kills);
    msg = `You held out for ${w} wave${w === 1 ? '' : 's'} and ${G.stats.kills} kills.` + (newBest ? ' New record.' : ` Best: wave ${rec.survWave}.`);
  } else {
    const msgs = ['The lab keeps what it kills.', 'Something drags you into the dark.', 'Your light rolls away across the floor, still on.', 'BLOOM takes root.'];
    msg = G.stalker ? 'It was always going to catch you. Next time, keep moving.' : msgs[Math.floor(Math.random() * msgs.length)];
  }
  saveRec();
  $('deadMsg').textContent = msg;
  $('bRetry').textContent = G.mode === 'survival' ? 'Try again' : 'Retry floor';
  setTimeout(() => {
    if (G.state !== 'play') return;
    G.state = 'dead'; show('sDead'); $('hud').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }, 2200);
};

async function finishFloor() {
  if (G.state !== 'play' || G.mode !== 'story') return;
  G.state = 'transition';
  A.liftArrive(); A.stopAlarm(); A.chaseMusic(false);
  if (G.floor === FLOORS.length - 1) {
    await fadeOut(1600);
    G.state = 'win'; $('hud').hidden = true; A.stopAmbience();
    if (document.pointerLockElement) document.exitPointerLock();
    const before = new Set(unlockedKeys());
    const s = G.stats, acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    rec.escapes++; if (G.diffKey === 'nightmare') rec.nightmare = true;
    const prevBest = rec.best[G.diffKey]; const newBest = !prevBest || s.time < prevBest;
    if (newBest) rec.best[G.diffKey] = s.time;
    saveRec();
    const row = (a, b) => `<span>${a}</span><span>${b}</span>`;
    $('winStats').innerHTML = row('Difficulty', G.diff.label) + row('Time', fmt(s.time) + (newBest ? ' · NEW BEST' : '')) + row('Kills', s.kills) + row('Accuracy', acc + '%') + row('Damage taken', Math.round(s.taken)) + row('Audio logs', `${s.found.length} / ${TOTAL_NOTES}`);
    const fresh = EXTRAS.filter((x) => x.ok() && !before.has(x.key));
    $('winUnlocks').innerHTML = fresh.map((x) => `<div>&gt; UNLOCKED: ${x.name}</div>`).join('');
    $('winUnlocks').hidden = !fresh.length;
    store.del('bz_save');
    show('sWin'); fadeIn();
    return;
  }
  await fadeOut(1200);
  const keep = G.player.save();
  loadFloor(G.floor + 1); G.player.load(keep);
  G.player.pos.set(G.world.start.x, 0, G.world.start.z);
  checkpoint();
  G.state = 'play'; fadeIn();
}

// ---------- interaction ----------
function nearestUse() {
  const W = G.world, P = G.player, c = camera.position;
  if (!W || !P.fwd) return null;
  let best = null, bd = 2.4;
  const consider = (x, z, kind, ref) => {
    const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (d > bd) return;
    const dx = x - c.x, dz = z - c.z, l = Math.hypot(dx, dz) || 1, f = P.fwd;
    if (d > 1.1 && (dx * f.x + dz * f.z) / l < 0.45) return;
    best = { kind, ref, x, z }; bd = d;
  };
  for (const it of W.items) if (!it.taken && it.type === 'note') consider(it.x, it.z, 'note', it);
  if (W.power && !G.powerOn) consider(W.power.x, W.power.z, 'power', W.power);
  if (W.exit && !W.exit.open) consider(W.exit.front.x, W.exit.front.z, 'lift', W.exit);
  return best;
}

function interact() {
  if (!$('hLog').hidden) { closeLog(); return; }
  const u = nearestUse(); if (!u) return;
  if (u.kind === 'note') openLog(u.ref);
  else if (u.kind === 'power') powerOn();
  else if (u.kind === 'lift') { A.denied(new THREE.Vector3(u.x, 1.5, u.z)); ui.flash(G.world.F.finale ? (G.powerOn ? 'FREIGHT LIFT: ON ITS WAY' : 'FREIGHT LIFT: NO POWER') : 'LIFT LOCKED', 1500, '#ff8070'); }
}

function openLog(it) {
  const W = G.world, n = W.F.notes[it.extra];
  it.taken = true; it.mesh.userData.led.material = it.mesh.userData.led.material.clone(); it.mesh.userData.led.material.emissiveIntensity = 0.2;
  const id = G.floor + ':' + it.extra; if (!G.stats.found.includes(id)) G.stats.found.push(id);
  if (!rec.logs.includes(id)) { rec.logs.push(id); saveRec(); }
  A.radio();
  $('hLogFrom').textContent = n.from; $('hLogText').textContent = ''; $('hLog').hidden = false;
  // typed out, like a transcript coming in
  let i = 0; clearInterval(openLog.t);
  openLog.t = setInterval(() => { i += 3; $('hLogText').textContent = n.text.slice(0, i); if (i >= n.text.length) clearInterval(openLog.t); }, 16);
  G.logAt = { x: it.x, z: it.z };
}
function closeLog() { $('hLog').hidden = true; clearInterval(openLog.t); G.logAt = null; }

function powerOn() {
  const W = G.world; if (G.powerOn) return;
  if (!G.keys.has('y')) return;
  G.powerOn = true; W.power.on = true;
  A.breaker(); G.shake(0.7);
  setTimeout(() => { A.startAlarm(); A.stinger(); }, 900);
  // everything on the level hears it
  setTimeout(() => { for (const e of G.enemies.list) G.enemies.alert(e); }, 1200);
  if (W.bossSpot) {
    ui.flash('POWER RESTORED · SOMETHING IS WAKING UP', 3000, '#f0b43a');
    setTimeout(() => { if (G.world === W && G.state === 'play') spawnBoss(W.bossSpot.x, W.bossSpot.z); }, 2600);
  } else startLiftCountdown(65);
}
function startLiftCountdown(secs) {
  G.finale = { t: Math.round(secs * (G.diff.waves > 1 ? 1.1 : G.diff.waves < 1 ? 0.85 : 1)), spawnT: 3, total: 0 };
  G.finale.max = G.finale.t;
  ui.flash('FREIGHT LIFT CALLED · HOLD OUT', 3000, '#f0b43a');
}

// ---------- the boss ----------
function spawnBoss(x, z) {
  const e = G.enemies.spawn('host', x, z, { alert: true });
  G.boss = e; G.blackout = 1.6; G.shake(1); A.stinger(); flickerNear(x, z, 2);
  for (let i = 0; i < 3; i++) setTimeout(() => A.thump(new THREE.Vector3(x, 1, z)), i * 220);
  ui.flash('THE HOST', 2600, '#ff3a20');
  $('hBoss').hidden = false; ui.set('hBossName', 'THE HOST');
}
G.onBossHit = () => {};
G.onBossSummon = (b) => {
  const W = G.world, n = b.hp < b.maxHp * 0.5 ? 3 : 2;
  const spots = W.waveSpots.length ? [...W.waveSpots].sort((a, c) => Math.hypot(a.x - b.pos.x, a.z - b.pos.z) - Math.hypot(c.x - b.pos.x, c.z - b.pos.z)) : [{ x: b.pos.x, z: b.pos.z }];
  for (let i = 0; i < n; i++) { const s = spots[i % spots.length]; G.enemies.spawn('crawler', s.x + (Math.random() - 0.5), s.z + (Math.random() - 0.5), { alert: true, drop: true }); }
  G.blackout = Math.max(G.blackout, 1.2);
};
G.onBossDead = (b) => {
  if (G.boss !== b) return;
  G.boss = null; G.bossDead = true; $('hBoss').hidden = true;
  A.stinger(); G.shake(1); flickerNear(b.pos.x, b.pos.z, 1.5);
  if (G.mode === 'survival') { ui.flash('THE HOST IS DEAD', 2500, '#4ade80'); return; }
  setTimeout(() => { if (G.state === 'play' && !G.finale) startLiftCountdown(40); }, 1500);
  ui.flash('THE HOST IS DEAD', 2500, '#4ade80');
};

// ---------- the stalker (set scenes) ----------
function checkStalker() {
  const W = G.world, P = G.player;
  if (G.stalkerDone || !W.stalkerSpawn || !P.alive) return;
  const [cx, cz] = W.cellOf(P.pos.x, P.pos.z);
  if (W.stalkerCells.has(cx + ',' + cz)) startStalker();
}
function startStalker() {
  const W = G.world, s = W.stalkerSpawn; G.stalkerDone = true;
  const e = G.enemies.spawn('stalker', s.x, s.z, { alert: true });
  G.stalker = { e, t: 30 * (G.diffKey === 'nightmare' ? 1.2 : G.diffKey === 'easy' ? 0.75 : 1) };
  flickerNear(G.player.pos.x, G.player.pos.z, 1.6); flickerNear(s.x, s.z, 3);
  A.stinger(); A.chaseMusic(true); G.shake(0.6);
  ui.flash('RUN', 2600, '#ff3020');
}
function updateStalker(dt) {
  const S = G.stalker; if (!S) return;
  S.t -= dt;
  if (S.t <= 0 || !G.player.alive && G.state !== 'play') endStalker();
}
function endStalker() {
  const S = G.stalker; if (!S) return; G.stalker = null;
  const e = S.e; A.shriek('stalker', e.pos.clone().setY(2)); flickerNear(e.pos.x, e.pos.z, 1.5);
  setTimeout(() => G.enemies.vanish(e), 450);
  A.chaseMusic(false);
  if (G.player.alive) ui.flash('IT IS GONE · FOR NOW', 2400, '#b0b8bc');
}

// ---------- scripted scares ----------
function checkScares() {
  const W = G.world, P = G.player;
  for (const s of W.scares) {
    if (s.done || !P.alive) continue;
    if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < 1.7) { s.done = true; scare(s.kind); }
  }
}
function scare(kind) {
  const W = G.world, P = G.player, c = camera.position, fx = P.fwd.x, fz = P.fwd.z, fl = Math.hypot(fx, fz) || 1;
  const f = { x: fx / fl, z: fz / fl };
  const open = (x, z) => W.walkable(Math.floor(x / C), Math.floor(z / C)) && W.los(P.pos.x, P.pos.z, x, z);
  if (kind === 'lightsOut') {
    // the lamps die one by one, from the far end of the room toward you
    const near = W.fixtures.map((x) => ({ x, d: Math.hypot(x.pos.x - c.x, x.pos.z - c.z) })).filter((o) => o.d < 26).sort((a, b) => b.d - a.d);
    near.forEach((o, i) => setTimeout(() => { o.x.dark = 6 - i * 0.2; A.click(300 + Math.random() * 200, 0.15); }, i * 260));
    setTimeout(() => { G.blackout = 2.6; A.distant('scream'); }, near.length * 260 + 200);
    setTimeout(() => A.whisper(new THREE.Vector3(c.x - f.x * 1.5, 1.6, c.z - f.z * 1.5)), near.length * 260 + 1800);
  } else if (kind === 'runner') {
    const wall = W.raycast(new THREE.Vector3(c.x, 1, c.z), new THREE.Vector3(f.x, 0, f.z), 30).dist;
    if (wall < 8) { scare('fakeout'); return; }
    const d0 = Math.min(6, wall - 4), x = P.pos.x + f.x * d0, z = P.pos.z + f.z * d0;
    G.enemies.spawn('husk', x, z, { decoy: { dir: f, speed: 8, life: Math.min(2.2, (wall - d0 - 1) / 8) } });
    A.growl('husk', new THREE.Vector3(x, 1.5, z)); flickerNear(x + f.x * 4, z + f.z * 4, 1.4);
    setTimeout(() => A.stinger(), 120);
  } else if (kind === 'body') {
    // a body is lying behind you when you turn round
    let spot = null;
    for (const [bx, bz] of [[-f.x, -f.z], [-f.z, f.x], [f.z, -f.x]]) { const x = P.pos.x + bx * 2.4, z = P.pos.z + bz * 2.4; if (open(x, z)) { spot = { x, z }; break; } }
    if (!spot) { scare('fakeout'); return; }
    G.enemies.corpse(spot.x, spot.z);
    A.thump(new THREE.Vector3(spot.x, 0.5, spot.z));
    setTimeout(() => A.whisper(new THREE.Vector3(spot.x, 1, spot.z)), 900);
  } else if (kind === 'fakeout') {
    // footsteps closing in from behind... and nothing there
    for (let i = 0; i < 5; i++) setTimeout(() => {
      const d = 7 - i * 1.4, p = G.player.pos, fw = G.player.fwd;
      A.step('husk', new THREE.Vector3(p.x - fw.x * d, 0.2, p.z - fw.z * d));
    }, i * 380);
    setTimeout(() => { A.breath(1.4); G.blackout = Math.max(G.blackout, 0.9); A.whisper(new THREE.Vector3(c.x - f.x, 1.7, c.z - f.z)); }, 2000);
  } else if (kind === 'door') {
    // the nearest door slams shut and something hammers on it
    const d = W.doors.filter((x) => !x.locked && Math.hypot(x.x - P.pos.x, x.z - P.pos.z) < 16 && Math.hypot(x.x - P.pos.x, x.z - P.pos.z) > 2)
      .sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0];
    if (!d) { scare('fakeout'); return; }
    d.jam = 7; d.lightMat.emissive.setHex(0xff2010); A.door(new THREE.Vector3(d.x, 1.5, d.z), false); G.shake(0.3);
    for (let i = 0; i < 9; i++) setTimeout(() => { if (d.jam > 0) { A.thump(new THREE.Vector3(d.x, 1.5, d.z)); if (Math.hypot(d.x - G.player.pos.x, d.z - G.player.pos.z) < 8) G.shake(0.12); } }, 500 + i * (450 + Math.random() * 300));
  }
}

function pickup(it) {
  const P = G.player, D = G.diff;
  switch (it.type) {
    case 'key': {
      G.keys.add(it.extra); A.pickup('key');
      ui.flash(`${KEYNAME[it.extra]} KEYCARD`, 2200, { b: '#5b9bff', r: '#ff5a4a', y: '#ffd04a' }[it.extra]);
      ambush(it);
      break;
    }
    case 'ammo': { const n = Math.round(12 * D.ammo); P.addAmmo('pistol', n); A.pickup(); ui.flash(`+${n} PISTOL AMMO`, 1200); break; }
    case 'shells': { const n = Math.round(6 * D.ammo); P.addAmmo('shotgun', n); A.pickup(); ui.flash(`+${n} SHELLS`, 1200); break; }
    case 'smgammo': { const n = Math.round(30 * D.ammo); P.addAmmo('smg', n); A.pickup(); ui.flash(`+${n} SMG ROUNDS`, 1200); break; }
    case 'medkit': { if (P.medkits >= 3) return false; P.medkits++; A.pickup(); ui.flash('MEDKIT  [Q] TO USE', 1500); break; }
    case 'shotgun': { P.hasShotgun = true; A.pickup('weapon'); P.switchTo('shotgun'); ui.flash('SHOTGUN  [2]', 2200, '#f0b43a'); ambush(it); break; }
    case 'smg': { P.hasSmg = true; P.addAmmo('smg', 60); A.pickup('weapon'); P.switchTo('smg'); ui.flash('SMG  [3]', 2200, '#5ba8ff'); ambush(it); break; }
    default: return false;
  }
  it.taken = true; it.mesh.visible = false; return true;
}
function ambush(it) {
  const n = G.enemies.wake(it.x, it.z, 17);
  if (n) { setTimeout(() => { A.stinger(); G.shake(0.5); flickerNear(it.x, it.z, 1.2); }, 250); }
}
function flickerNear(x, z, t) { for (const f of G.world.fixtures) if (Math.hypot(f.pos.x - x, f.pos.z - z) < 16) f.dark = t * (0.6 + Math.random() * 0.8); }

// ---------- per-frame world updates ----------
function updateDoors(dt) {
  const W = G.world, P = G.player;
  const [pcx, pcz] = W.cellOf(P.pos.x, P.pos.z);
  for (const d of W.doors) {
    const pd = Math.hypot(P.pos.x - d.x, P.pos.z - d.z);
    let want = 0;
    if (pd < 3.6 && P.alive) {
      if (d.locked) {
        if (G.keys.has(d.key)) { unlockDoor(d); A.granted(new THREE.Vector3(d.x, 1.5, d.z)); ui.flash(`${KEYNAME[d.key]} DOOR UNLOCKED`, 1500, '#4ade80'); updateFlow(true); }
        else if (d.denyT <= 0) { A.denied(new THREE.Vector3(d.x, 1.5, d.z)); d.denyT = 3; }
      }
      if (!d.locked) want = 1;
    }
    if (d.locked && pd < 3.2) G.lockedNear = d;
    d.denyT -= dt;
    if (!d.locked && (pcx === d.cx && pcz === d.cz)) want = 1;
    if (!d.locked && !want) for (const e of G.enemies.list) if (e.state === 'hunt' && Math.hypot(e.pos.x - d.x, e.pos.z - d.z) < 2.4) { want = 1; break; }
    // a scare has jammed it shut (never with you standing in it)
    if (d.jam > 0) { d.jam -= dt; if (!(pcx === d.cx && pcz === d.cz)) { want = 0; d.hold = 0; } if (d.jam <= 0) d.lightMat.emissive.setHex(0x33ff66); }
    if (want) d.hold = 1.2; else d.hold = (d.hold || 0) - dt;
    const target = d.hold > 0 ? 1 : 0;
    if (target !== d.target) { d.target = target; A.door(new THREE.Vector3(d.x, 1.5, d.z), !!target); }
    d.open = THREE.MathUtils.clamp(d.open + (d.target ? 1 : -1) * dt * 2.6, 0, 1);
    const e = d.open * d.open * (3 - 2 * d.open);
    d.halves[0].position.x = -C / 4 - e * C * 0.48; d.halves[1].position.x = C / 4 + e * C * 0.48;
  }
  // lift
  const X = W.exit; if (!X) return;
  const ready = !W.F.finale || G.liftArrived;
  const fd = Math.hypot(P.pos.x - X.front.x, P.pos.z - X.front.z);
  X.open = ready && (fd < 3.5 || X.amt > 0.5);
  X.ind.emissive.setHex(ready ? 0x33ff66 : 0xff3322);
  const prev = X.amt; X.amt = THREE.MathUtils.clamp(X.amt + (X.open ? 1 : -1) * dt * 1.2, 0, 1);
  if (prev === 0 && X.amt > 0) A.door(new THREE.Vector3(X.x, 1.5, X.z), true);
  X.halves[0].position.x = -C / 4 - X.amt * C * 0.48; X.halves[1].position.x = C / 4 + X.amt * C * 0.48;
  const [ex, ez] = W.cellOf(P.pos.x, P.pos.z);
  if (X.amt > 0.8 && ex === X.cx && ez === X.cz && P.alive) finishFloor();
}

function updateItems(dt, t) {
  const W = G.world, P = G.player;
  for (const it of W.items) {
    if (it.taken) continue;
    if (it.bob) { it.mesh.rotation.y += dt * 1.6; it.mesh.position.y = it.y + Math.sin(t * 2 + it.x) * 0.06; }
    if (it.type === 'note') { it.mesh.userData.led.visible = Math.sin(t * 6) > 0; continue; }
    if (P.alive && Math.hypot(P.pos.x - it.x, P.pos.z - it.z) < 1.0 && P.pos.y < 1.2) pickup(it);
  }
  if (W.power) { const L = W.power.lever; L.rotation.x = THREE.MathUtils.damp(L.rotation.x, W.power.on ? 0.7 : -0.7, 8, dt); W.power.panel.material.emissive.setHex(W.power.on ? 0x33ff66 : 0xff2b1a); }
  if (G.logAt && Math.hypot(P.pos.x - G.logAt.x, P.pos.z - G.logAt.z) > 4) closeLog();
}

function updateLights(dt, t) {
  const W = G.world, c = camera.position, alarm = !!G.finale || !!G.boss || G.surv?.boss;
  G.blackout = Math.max(0, G.blackout - dt);
  for (const f of W.fixtures) {
    let on = 1;
    if (f.kind === 'k') { const n = Math.sin(t * 13 + f.ph) + Math.sin(t * 7.3 + f.ph * 2) + Math.sin(t * 31 + f.ph); on = n > 0.6 ? 1 : n > -0.2 ? 0.25 : 0.02; }
    else if (f.kind === 'E') on = 0.55 + 0.45 * Math.sin(t * 2.6 + f.ph);
    else if (f.kind === 'L') { on = Math.sin(t * 0.37 + f.ph) > 0.985 ? 0.3 : 1; }
    if (alarm && f.kind !== 'lift') { on = settings.reduceFlash ? 0.6 : (Math.sin(t * 5 + f.ph * 0.2) > 0 ? 1 : 0.15); }
    if (f.dark > 0) { f.dark -= dt; on *= Math.random() < 0.15 ? 0.6 : 0.02; }
    if (G.blackout > 0 && Math.hypot(f.pos.x - c.x, f.pos.z - c.z) < 18) on *= Math.random() < 0.06 ? 0.7 : 0.02;
    f.on = on;
    const col = alarm && f.kind !== 'lift' ? 0xff2010 : f.color;
    if (f.col !== col) { f.col = col; f.mat.emissive.setHex(col); }
    f.mat.emissiveIntensity = 2.2 * on;
    f.d = (f.pos.x - c.x) ** 2 + (f.pos.z - c.z) ** 2;
  }
  const near = W.fixtures.filter((f) => f.d < 30 * 30).sort((a, b) => a.d - b.d);
  pool.forEach((l, i) => {
    const f = near[i];
    if (!f) { l.intensity = 0; return; }
    l.position.copy(f.pos);
    l.color.setHex(alarm && f.kind !== 'lift' ? 0xff2010 : f.color);
    // fade the farthest pooled lights so swaps are not visible
    const edge = i >= pool.length - 2 ? 0.5 : 1;
    l.intensity = f.base * f.on * edge * (alarm && f.kind !== 'lift' ? 1.4 : 1);
    l.distance = f.kind === 'E' ? 11 : 15;
  });
}

const liveFoes = () => G.enemies.list.filter((e) => e.state !== 'dead' && e.state !== 'dormant' && e.state !== 'decoy' && !e.T.stalker);
// pick a wave spawn point out of sight, not too close
function waveSpot(minD = 8) {
  const P = G.player, W = G.world;
  const spots = W.waveSpots.map((s) => ({ ...s, d: Math.hypot(s.x - P.pos.x, s.z - P.pos.z), v: W.los(s.x, s.z, P.pos.x, P.pos.z) }))
    .filter((s) => s.d > minD).sort((a, b) => (a.v - b.v) || (a.d - b.d));
  return spots[Math.floor(Math.random() * Math.min(3, spots.length))];
}
function updateFinale(dt) {
  const F = G.finale; if (!F || G.liftArrived) return;
  F.t -= dt;
  $('hTimer').hidden = false; $('hTimer').className = 'timer'; ui.set('hTimer', `LIFT ${fmt(Math.max(0, F.t))}`);
  if (F.t <= 0) {
    G.liftArrived = true; A.liftArrive(); ui.flash('THE LIFT HAS ARRIVED · GET IN', 3500, '#4ade80');
    $('hTimer').className = 'timer go'; ui.set('hTimer', 'LIFT READY');
    return;
  }
  F.spawnT -= dt;
  const alive = liveFoes();
  const cap = Math.round(7 * G.diff.waves);
  if (F.spawnT <= 0 && alive.length < cap) {
    F.spawnT = (2.6 + Math.random() * 1.6) / G.diff.waves;
    const s = waveSpot(); if (!s) return;
    const brutes = alive.filter((e) => e.type === 'brute').length;
    const r = Math.random();
    const type = r < 0.45 ? 'husk' : r < 0.8 ? 'crawler' : r < 0.93 || brutes ? 'spitter' : 'brute';
    G.enemies.spawn(type, s.x + (Math.random() - 0.5), s.z + (Math.random() - 0.5), { alert: true, drop: true });
    F.total++;
  }
}

// ---------- survival ----------
function updateSurvival(dt) {
  const S = G.surv; if (!S) return;
  const timer = $('hTimer'); timer.hidden = false;
  if (S.state === 'break') {
    S.t -= dt; timer.className = 'timer go';
    ui.set('hTimer', `WAVE ${S.wave + 1} IN ${Math.ceil(Math.max(0, S.t))}`);
    if (S.t <= 0) {
      S.wave++; S.state = 'fight'; S.spawnT = 1;
      S.boss = S.wave % 5 === 0;
      S.toSpawn = Math.round((5 + S.wave * 2) * G.diff.waves) - (S.boss ? 4 : 0);
      if (S.boss) { const s = waveSpot(10) || G.world.waveSpots[0]; spawnBoss(s.x, s.z); G.boss.hp = G.boss.maxHp = G.boss.maxHp * (0.5 + S.wave * 0.06); }
      A.stinger(); ui.flash(S.boss ? `WAVE ${S.wave} · THE HOST` : `WAVE ${S.wave}`, 2200, '#ff5a3a');
      if (S.wave > 1) A.startAlarm(); setTimeout(() => A.stopAlarm(), 2500);
    }
    return;
  }
  const alive = liveFoes();
  timer.className = 'timer';
  ui.set('hTimer', `WAVE ${S.wave} · ${S.toSpawn + alive.length} LEFT`);
  S.spawnT -= dt;
  const cap = Math.round((5 + Math.min(6, S.wave)) * G.diff.waves);
  if (S.toSpawn > 0 && S.spawnT <= 0 && alive.length < cap) {
    S.spawnT = Math.max(0.55, 1.7 - S.wave * 0.07) / G.diff.waves;
    const s = waveSpot(); if (!s) return;
    const brutes = alive.filter((e) => e.type === 'brute').length, maxBrutes = S.wave >= 4 ? 1 + Math.floor(S.wave / 6) : 0;
    const r = Math.random();
    const type = r < 0.42 ? 'husk' : r < 0.74 ? 'crawler' : r < 0.9 && S.wave >= 2 ? 'spitter' : brutes < maxBrutes ? 'brute' : 'husk';
    G.enemies.spawn(type, s.x + (Math.random() - 0.5), s.z + (Math.random() - 0.5), { alert: true, drop: true });
    S.toSpawn--;
  }
  if (S.toSpawn <= 0 && alive.length === 0) {
    S.state = 'break'; S.t = 12; S.boss = false;
    if (S.wave > rec.survWave) { rec.survWave = S.wave; saveRec(); }
    ui.flash(`WAVE ${S.wave} CLEARED · SUPPLIES RESTOCKED`, 2600, '#4ade80');
    // supplies come back, the dead are cleared away
    for (const it of G.world.items) if (it.taken && it.type !== 'note') { it.taken = false; it.mesh.visible = true; }
    G.enemies.list = G.enemies.list.filter((e) => { if (e.state === 'dead' && !e.gone) G.enemies.vanish(e); return false; });
    A.liftArrive();
  }
}

function ambientEvents(dt) {
  G.dripT -= dt; if (G.dripT <= 0) { G.dripT = 2 + Math.random() * 6; A.distant('drip'); }
  G.eventT -= dt;
  if (G.eventT <= 0) {
    G.eventT = 22 + Math.random() * 35;
    const r = Math.random();
    if (r < 0.22) A.distant('scream');
    else if (r < 0.42) A.distant('bang');
    else if (r < 0.6) A.distant('metal');
    else if (r < 0.75) A.distant('vent');
    else if (r < 0.87) A.distant('behind');
    else { G.blackout = 2.5; A.distant('scream'); }
  }
}

// ---------- HUD ----------
function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function hud() {
  const P = G.player, W = G.world, F = W.F;
  ui.set('hFloor', G.mode === 'survival' ? `${F.name} · ${G.diff.label.toUpperCase()}` : `${F.name} · ${F.sub}`);
  // objective
  const met = (n) => (n.length === 1 ? G.keys.has(n) : n === 'power' ? G.powerOn : n === 'boss' ? G.bossDead : n === 'survive' ? G.liftArrived : false);
  const step = G.mode === 'survival' ? { text: G.surv.state === 'break' ? 'Restock. Get ready.' : 'Kill everything that comes through.' } : F.steps.find((s) => !met(s.need)) || F.steps[F.steps.length - 1];
  ui.set('hObj', G.stalker ? 'IT IS HUNTING YOU. KEEP MOVING.' : step.text);
  const keys = [...G.keys].map((k) => `<i style="color:${{ b: '#3b82f6', r: '#ef4444', y: '#facc15' }[k]}" title="${KEYNAME[k]}"></i>`).join('');
  ui.set('hKeys', keys, 'innerHTML');
  ui.style('hHp', 'width', Math.max(0, P.hp).toFixed(1) + '%'); ui.style('hSt', 'width', P.stamina.toFixed(1) + '%'); ui.style('hBt', 'width', P.battery.toFixed(1) + '%');
  ui.set('hHpN', String(Math.ceil(P.hp)));
  ui.cls($('hHp').parentElement.parentElement, 'low', P.hp < 35);
  ui.cls($('hBt').parentElement.parentElement, 'low', P.battery < 22);
  // heartbeat trace speeds up as you get hurt
  ui.style('hEcg', '--beat', (P.hp < 35 ? 0.45 : P.hp < 70 ? 0.7 : 1).toFixed(2) + 's');
  ui.set('hMed', `MEDKITS ${P.medkits} <small>[Q]</small>`, 'innerHTML');
  const a = P.ammo[P.weapon];
  const slots = WEAPON_ORDER.map((w, i) => (P.owns(w) ? `<b class="${w === P.weapon ? 'on' : ''}">${i + 1}</b>` : '')).join('');
  ui.set('hWeap', `${WEAPON_NAME[P.weapon]} <span class="slots">${slots}</span>`, 'innerHTML');
  ui.set('hMag', a ? String(a.mag) : '—'); ui.set('hRes', a ? String(a.reserve) : '∞');
  ui.cls($('hMag').parentElement, 'empty', !!a && a.mag === 0);
  const low = { pistol: 3, smg: 8, shotgun: 1 }[P.weapon];
  ui.set('hRel', P.reloadT > 0 ? 'RELOADING' : a && a.mag === 0 && a.reserve === 0 ? 'NO AMMO · [4] CROWBAR' : a && a.mag <= low && a.reserve > 0 ? '[R] RELOAD' : P.flashDead ? 'LIGHT RECHARGING' : '');
  // crosshair spread
  const moving = Math.hypot(P.vel.x, P.vel.z);
  const gap = ({ shotgun: 16, smg: 8, crowbar: 3 }[P.weapon] || 5) * (1 - P.ads * 0.6) + moving * 1.4 + P.kickV * 8 + (P.onGround ? 0 : 8);
  ui.style('cross', '--g', gap.toFixed(1) + 'px');
  ui.style('cross', 'opacity', P.sprinting || P.reloadT > 0 || !P.alive ? '0.25' : '1');
  // prompt
  let pr = '', bad = false;
  const u = nearestUse(), useKey = I.pad ? '[X]' : '[E]';
  if (!$('hLog').hidden) pr = '';
  else if (u?.kind === 'note') pr = `${useKey} Play audio log`;
  else if (u?.kind === 'power') { if (G.keys.has('y')) pr = `${useKey} Pull the main breaker`; else { pr = 'Breaker locked: YELLOW keycard'; bad = true; } }
  else if (u?.kind === 'lift') { pr = W.F.finale ? (G.powerOn ? 'FREIGHT LIFT: ON ITS WAY' : 'FREIGHT LIFT: NO POWER') : 'LIFT'; bad = true; }
  else if (G.lockedNear && G.lockedNear.locked) { pr = `${KEYNAME[G.lockedNear.key]} KEYCARD REQUIRED`; bad = true; }
  const pe = $('hPrompt'); ui.set('hPrompt', pr); ui.cls(pe, 'show', !!pr); ui.cls(pe, 'bad', bad);
  if (!G.finale && G.mode !== 'survival' && !$('hTimer').hidden) $('hTimer').hidden = true;
  // boss bar
  if (G.boss) ui.style('hBossBar', 'width', Math.max(0, G.boss.hp / G.boss.maxHp * 100).toFixed(1) + '%');
  ui.cls($('hud'), 'hunted', !!G.stalker);
}

// ---------- post uniforms ----------
function updatePost(dt, t) {
  const P = G.player, u = post.fin.uniforms;
  u.time.value = t % 100;
  u.hurt.value = Math.min(1, P.hurtFx * (settings.reduceFlash ? 0.5 : 1) + (P.alive ? 0 : 0.6));
  u.low.value = P.hp < 35 ? (1 - P.hp / 35) : 0;
  u.acid.value = P.acidFx;
  u.grain.value = settings.quality === 'low' ? 0.035 : 0.055;
  u.fade.value = P.alive ? 0 : Math.min(0.7, P.deathT * 0.3);
  u.fmode.value = G.state === 'menu' ? 0 : G.filter || 0;
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let menuT = 0, fpsAvg = 60;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime;
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
  autoResolution(rawDt);
  pollPad(dt);
  if (!G.world) return;
  const P = G.player;
  if (G.state === 'play' || G.state === 'transition') {
    if (G.state === 'play') G.stats.time += dt;
    G.enemies.passive = false;
    G.lockedNear = null;
    P.update(dt, I);
    updateFlow(false);
    G.enemies.update(dt);
    updateDoors(dt); updateItems(dt, t); updateFinale(dt); ambientEvents(dt);
    if (G.mode === 'survival') updateSurvival(dt); else { checkScares(); checkStalker(); }
    updateStalker(dt);
    hud();
  } else if (G.state === 'menu' || G.state === 'boot') {
    // slow creeping look around the cryo room for the title screen
    menuT += dt;
    P.yaw = 0.9 + Math.sin(menuT * 0.12) * 0.7; P.pitch = -0.08 + Math.sin(menuT * 0.21) * 0.05;
    P.flashOn = true; P.battery = 100; P.hp = 100;
    P.update(dt, { keys: {}, dx: 0, dy: 0, locked: false });
    G.enemies.passive = true; G.enemies.update(dt * 0.6);
    updateItems(dt, t);
  } else if (G.state === 'dead') {
    P.update(dt, I); G.enemies.update(dt); updateStalker(dt);
  }
  I.dx = 0; I.dy = 0;
  if (G.state !== 'pause') { updateLights(dt, t); G.fx.update(dt, camera, P.flashOn); }
  A.trackListener(camera.position, P.fwd || new THREE.Vector3(0, 0, -1));
  updatePost(dt, t);
  renderer.info.reset();
  post.comp.render();
}

// ---------- menus ----------
let backTo = 'sTitle', pendingMode = 'story';
$('bNew').onclick = () => { A.initAudio(); pendingMode = 'story'; $('diffTitle').textContent = 'New game · choose difficulty'; show('sDiff'); backTo = 'sTitle'; };
$('bSurvival').onclick = () => { A.initAudio(); pendingMode = 'survival'; $('diffTitle').textContent = 'Survival · choose difficulty'; show('sDiff'); backTo = 'sTitle'; };
$('bContinue').onclick = () => { const s = store.get('bz_save', null); if (s) startGame(s.diff, s); };
$('bSettings').onclick = () => { A.initAudio(); backTo = 'sTitle'; openSettings(); };
$('bControls').onclick = () => { backTo = 'sTitle'; show('sControls'); };
$('bRecords').onclick = () => { backTo = 'sTitle'; openRecords(); };
$('bExtras').onclick = () => { backTo = 'sTitle'; openExtras(); };
$('bPSettings').onclick = () => { backTo = 'sPause'; openSettings(); };
$('bPControls').onclick = () => { backTo = 'sPause'; show('sControls'); };
$('bResume').onclick = resume;
$('bRestartFloor').onclick = () => retryFloor();
$('bQuit').onclick = toTitle;
$('bRetry').onclick = retryFloor;
$('bDeadQuit').onclick = toTitle;
$('bWinMenu').onclick = toTitle;
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { if (backTo === 'sTitle') refreshTitle(); show(backTo); };
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => {
  if (pendingMode === 'survival') startSurvival(b.dataset.diff);
  else { store.del('bz_save'); startGame(b.dataset.diff); }
};
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (G.state === 'pause' && $('sPause').hidden === false) return; // browser already released the lock; stay paused
  const open = [...document.querySelectorAll('.screen')].find((s) => !s.hidden);
  if (open && open.id !== 'sTitle' && open.id !== 'sPause' && open.id !== 'sDead' && open.id !== 'sWin') show(backTo);
});

function openSettings() {
  const bind = (id, key, out, f = (v) => v) => {
    const el = $(id); el.value = settings[key]; if (out) $(out).textContent = f(settings[key]);
    el.oninput = () => { settings[key] = +el.value; if (out) $(out).textContent = f(settings[key]); applySettings(); store.set('bz_settings', settings); };
  };
  bind('sSens', 'sens', 'oSens', (v) => (+v).toFixed(2));
  bind('sPadSens', 'padSens', 'oPadSens', (v) => (+v).toFixed(2));
  bind('sFov', 'fov', 'oFov', (v) => v + '°');
  bind('sBright', 'bright', 'oBright', (v) => Math.round(v * 100) + '%');
  bind('sVol', 'vol', 'oVol', (v) => Math.round(v * 100) + '%');
  bind('sAmb', 'amb', 'oAmb', (v) => Math.round(v * 100) + '%');
  const q = $('sQual'); q.value = settings.quality; q.onchange = () => { settings.quality = q.value; store.set('bz_settings', settings); applyQuality(); };
  for (const [id, key] of [['sInvert', 'invert'], ['sBob', 'bob'], ['sFlash', 'reduceFlash'], ['sAutoRes', 'autoRes'], ['sPads', 'pads']]) {
    const c = $(id); c.checked = settings[key]; c.onchange = () => { settings[key] = c.checked; store.set('bz_settings', settings); };
  }
  show('sSettings');
}

function openRecords() {
  const row = (a, b) => `<span>${a}</span><span>${b}</span>`;
  const best = (k) => (rec.best[k] ? fmt(rec.best[k]) : '—');
  $('recList').innerHTML = row('Runs started', rec.runs) + row('Escapes', rec.escapes) + row('Deaths', rec.deaths) + row('Monsters killed', rec.kills) + row('THE HOST killed', rec.bossKills)
    + row('Best time · Easy', best('easy')) + row('Best time · Normal', best('normal')) + row('Best time · Nightmare', best('nightmare'))
    + row('Audio logs found', `${rec.logs.length} / ${TOTAL_NOTES}`) + row('Survival · best wave', rec.survWave || '—') + row('Survival · most kills', rec.survKills || '—');
  show('sRecords');
}

function openExtras() {
  const u = new Set(unlockedKeys());
  $('extList').innerHTML = EXTRAS.map((x) => u.has(x.key)
    ? `<label class="row chk"><input type="checkbox" data-extra="${x.key}" ${settings.extras[x.key] ? 'checked' : ''}> ${x.name}</label>`
    : `<div class="locked"><b>[LOCKED]</b> ${x.name}<small>${x.how}</small></div>`).join('');
  for (const c of $('extList').querySelectorAll('[data-extra]')) c.onchange = () => {
    settings.extras[c.dataset.extra] = c.checked;
    // the two filters are either/or
    if (c.checked && c.dataset.extra === 'vhs') settings.extras.noir = false;
    if (c.checked && c.dataset.extra === 'noir') settings.extras.vhs = false;
    store.set('bz_settings', settings); applyExtras(); openExtras();
  };
  show('sExtras');
}

// software-rendering warning (Chrome without GPU acceleration)
try {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  if (/swiftshader|llvmpipe|software/i.test(name) && !TEST) { $('gpuWarn').hidden = false; $('gpuWarnTitle').hidden = false; }
} catch {}

// ---------- boot ----------
applyQuality(); applySettings(); applyExtras();
loadFloor(0, { menu: true });
G.state = 'menu';
refreshTitle(); show('sTitle');
// terminal boot text on the title screen
(function bootText() {
  const lines = ['ARDENT OS v3.1 · SITE ZERO SECURITY TERMINAL', 'CONTAINMENT STATUS ......... BREACHED', 'SURFACE LINK ............... LOST', 'PERSONNEL ALIVE ............ 1 (UNVERIFIED)', '> AWAITING INPUT_'];
  const el = $('bootLines'); let i = 0; el.textContent = '';
  const tick = () => { if (i >= lines.length) return; el.textContent += (i ? '\n' : '') + lines[i++]; setTimeout(tick, TEST ? 0 : 260); };
  tick();
})();
$('loading').hidden = true; fadeIn();
document.addEventListener('pointerdown', () => { if (G.state === 'menu') { A.initAudio(); A.menuMusic(true); } }, { once: true });
frame();

// ---------- test hook ----------
if (TEST) {
  window.__bz = {
    G, I, A, rec, post: () => post, pool: () => pool, FLOORS,
    start: (d = 'normal', floor = 0) => { startGame(d); if (floor) { const keep = G.player.save(); loadFloor(floor); G.player.load(keep); G.player.pos.set(G.world.start.x, 0, G.world.start.z); } },
    survival: (d = 'normal') => startSurvival(d),
    tp: (cx, cz) => { G.player.pos.set(cx * C + C / 2, 0, cz * C + C / 2); updateFlow(true); },
    look: (yaw, pitch = 0) => { G.player.yaw = yaw; G.player.pitch = pitch; },
    keys: (...k) => k.forEach((x) => G.keys.add(x)),
    info: () => ({ state: G.state, mode: G.mode, floor: G.floor, hp: G.player.hp, pos: [+G.player.pos.x.toFixed(2), +G.player.pos.y.toFixed(2), +G.player.pos.z.toFixed(2)], ammo: G.player.ammo, weapon: G.player.weapon, keys: [...G.keys],
      enemies: G.enemies.list.map((e) => [e.type, e.state, Math.round(e.hp)]), power: G.powerOn, boss: G.boss ? Math.round(G.boss.hp) : null, bossDead: G.bossDead, stalker: !!G.stalker, lift: G.liftArrived,
      finale: G.finale && Math.round(G.finale.t), wave: G.surv?.wave, survState: G.surv?.state, kills: G.stats?.kills, fps: Math.round(fpsAvg), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    fire: () => { I.lmbEdge = true; I.lmb = true; setTimeout(() => (I.lmb = false), 50); },
    melee: () => { I.melee = true; },
    use: () => interact(), pause, resume, toTitle, finishFloor, powerOn, scare, startStalker, endStalker, openRecords, openExtras,
    nearest: (type) => { let b = null, bd = 1e9; for (const e of G.enemies.list) { if (e.state === 'dead' || e.state === 'dormant' || e.state === 'decoy' || (type && e.type !== type)) continue; const d = e.pos.distanceTo(G.player.pos); if (d < bd) { bd = d; b = e; } } return b; },
  };
}
