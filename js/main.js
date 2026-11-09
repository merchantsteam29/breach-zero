// BREACH: ZERO: engine loop, floors, lighting, objectives, finale, HUD and menus.
import * as THREE from 'three';
import { FLOORS, DIFFICULTY } from './levels.js';
import { buildWorld, unlockDoor, C, H, KEYNAME } from './world.js';
import { Enemies } from './enemies.js';
import { Player } from './player.js';
import { FX, makeComposer } from './fx.js';
import { cookieTex } from './textures.js';
import * as A from './audio.js';

const $ = (id) => document.getElementById(id);
const TEST = new URLSearchParams(location.search).has('test');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- settings ----------
const DEF = { sens: 1, fov: 80, bright: 1, vol: 0.8, amb: 0.8, quality: 'medium', invert: false, bob: true, reduceFlash: false };
const settings = { ...DEF, ...store.get('bz_settings', {}) };
const QUAL = {
  low: { pr: 0.75, shadow: 512, lights: 4 },
  medium: { pr: 1, shadow: 1024, lights: 6 },
  high: { pr: 1.5, shadow: 2048, lights: 8 },
};

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.08);
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 120);
const vmScene = new THREE.Scene(); const vmCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 5);
const hemi = new THREE.HemisphereLight(0x1a2430, 0x050505, 2.6); scene.add(hemi);

const G = {
  renderer, scene, camera, vmScene, settings, cookie: cookieTex(), state: 'boot', diff: DIFFICULTY.normal, diffKey: 'normal',
  stats: null, keys: new Set(), floor: 0, world: null, flow: null, blackout: 0, god: false,
};
G.fx = new FX(scene);
G.player = new Player(G);
G.enemies = new Enemies(G);
G.shake = (a) => { G.player.trauma = Math.min(1, G.player.trauma + a); };

let post = null, pool = [];
function applyQuality() {
  const q = QUAL[settings.quality] || QUAL.medium;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1) * q.pr);
  renderer.setSize(innerWidth, innerHeight, false);
  G.player.setShadowRes(q.shadow);
  for (const l of pool) scene.remove(l);
  pool = [];
  for (let i = 0; i < q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 15, 1.4); l.castShadow = false; scene.add(l); pool.push(l); }
  if (post) post.comp.dispose();
  post = makeComposer(renderer, scene, camera, vmScene, vmCam, settings.quality);
  post.comp.setPixelRatio(renderer.getPixelRatio()); post.comp.setSize(innerWidth, innerHeight);
}
function applySettings() {
  renderer.toneMappingExposure = settings.bright * 1.2;
  A.setVolumes({ master: settings.vol, amb: settings.amb, mus: settings.amb });
  camera.fov = settings.fov; camera.updateProjectionMatrix();
}
addEventListener('resize', () => {
  camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false); post.comp.setSize(innerWidth, innerHeight);
});

// ---------- input ----------
const I = { keys: {}, dx: 0, dy: 0, lmb: false, lmbEdge: false, rmb: false, jump: false, locked: false };
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (I.keys[e.code]) return; I.keys[e.code] = true;
  if (G.state !== 'play') return;
  const P = G.player;
  if (e.code === 'Space') { I.jump = true; e.preventDefault(); }
  if (e.code === 'KeyR') P.reload();
  if (e.code === 'KeyF' && P.alive) { if (!P.flashDead) { P.flashOn = !P.flashOn; A.flashlight(P.flashOn); } else A.empty(); }
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyQ') P.useMedkit();
  if (e.code === 'Digit1') P.switchTo('pistol');
  if (e.code === 'Digit2') P.switchTo('shotgun');
  if (e.code === 'KeyP' || (TEST && e.code === 'Escape')) pause();
});
addEventListener('keyup', (e) => { I.keys[e.code] = false; });
addEventListener('blur', () => { I.keys = {}; I.lmb = I.rmb = false; });
addEventListener('mousemove', (e) => { if (I.locked) { I.dx += e.movementX; I.dy += e.movementY; } });
canvas.addEventListener('mousedown', (e) => {
  if (G.state === 'play' && !I.locked && !TEST) { lock(); return; }
  if (e.button === 0) { I.lmb = true; I.lmbEdge = true; } if (e.button === 2) I.rmb = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (G.state === 'play') G.player.switchTo(G.player.weapon === 'pistol' ? 'shotgun' : 'pistol'); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  I.locked = document.pointerLockElement === canvas;
  if (I.locked) $('clickPlay').hidden = true;
  else if (G.state === 'play' && !TEST) pause();
});
function lock() {
  if (TEST) { I.locked = true; return; }
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch {} setTimeout(() => { if (!I.locked && G.state === 'play') $('clickPlay').hidden = false; }, 300); });
  } catch { $('clickPlay').hidden = false; }
}
$('clickPlay').addEventListener('click', () => lock());

// ---------- UI helpers ----------
const ui = {
  cache: {},
  set(id, v, prop = 'textContent') { const k = id + prop; if (this.cache[k] === v) return; this.cache[k] = v; $(id)[prop] = v; },
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
}

// ---------- floors ----------
function disposeWorld() {
  if (!G.world) return;
  scene.remove(G.world.group);
  G.world.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); });
  G.world = null;
}

function loadFloor(fi, { menu = false } = {}) {
  disposeWorld(); G.enemies.clear(); G.fx.clear();
  const F = FLOORS[fi];
  G.floor = fi; G.keys = new Set(); G.powerOn = false; G.finale = null; G.liftArrived = false; G.blackout = 0;
  G.world = buildWorld(scene, fi, F);
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
  if (!menu) { A.startAmbience(fi); showFloorCard(F, fi); }
}

function showFloorCard(F, fi) {
  const c = $('floorCard'); c.hidden = true; void c.offsetWidth;
  $('fcNum').textContent = `FLOOR ${fi + 1} / ${FLOORS.length}`; $('fcName').textContent = F.name; $('fcSub').textContent = F.sub; c.hidden = false;
  clearTimeout(showFloorCard.t); showFloorCard.t = setTimeout(() => (c.hidden = true), 4600);
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
  G.diffKey = diffKey; G.diff = DIFFICULTY[diffKey];
  if (fromSave) {
    G.stats = { ...newStats(), ...fromSave.stats };
    loadFloor(fromSave.floor); G.player.load(fromSave.player);
  } else {
    G.stats = newStats(); G.player.resetAll(); loadFloor(0);
  }
  G.player.pos.set(G.world.start.x, 0, G.world.start.z);
  checkpoint();
  enterPlay();
  fadeIn();
}

function checkpoint() {
  G.check = { floor: G.floor, player: G.player.save(), stats: { ...G.stats, found: [...G.stats.found] }, diff: G.diffKey };
  store.set('bz_save', G.check);
}

function enterPlay() {
  G.state = 'play'; show(null); $('hud').hidden = false; lock();
  G.player.pistol.visible = G.player.weapon === 'pistol'; G.player.shotgun.visible = G.player.weapon === 'shotgun';
}

function pause() {
  if (G.state !== 'play') return;
  G.state = 'pause'; I.lmb = I.rmb = false; I.keys = {};
  const s = G.stats;
  $('pStats').innerHTML = `<span>Floor</span><span>${G.floor + 1} / 3</span><span>Difficulty</span><span>${G.diff.label}</span><span>Kills</span><span>${s.kills}</span><span>Audio logs</span><span>${s.found.length} / 9</span><span>Time</span><span>${fmt(s.time)}</span>`;
  show('sPause'); $('clickPlay').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function resume() { if (G.state !== 'pause') return; enterPlay(); }

function retryFloor() {
  A.stopAlarm();
  const c = G.check; G.stats = { ...newStats(), ...c.stats, found: [...c.stats.found] };
  loadFloor(c.floor); G.player.load(c.player); G.player.pos.set(G.world.start.x, 0, G.world.start.z);
  enterPlay(); fadeIn();
}

function toTitle() {
  A.stopAlarm(); A.stopAmbience();
  G.state = 'menu'; $('hud').hidden = true; $('hLog').hidden = true; $('hTimer').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  loadFloor(0, { menu: true }); G.player.spawn();
  refreshTitle(); show('sTitle'); A.menuMusic(true);
}
function refreshTitle() {
  const s = store.get('bz_save', null);
  $('bContinue').hidden = !s;
  if (s) $('contInfo').textContent = `Floor ${s.floor + 1} · ${DIFFICULTY[s.diff]?.label || ''}`;
}

function fadeIn() { const f = $('fade'); f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth; f.style.transition = 'opacity 1.4s'; f.style.opacity = 0; }
function fadeOut(ms = 900) { const f = $('fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = 1; return new Promise((r) => setTimeout(r, ms)); }

G.onKill = (e) => { G.stats.kills++; };
G.onDeath = () => {
  A.stinger(); A.stopAlarm();
  const msgs = ['The lab keeps what it kills.', 'Something drags you into the dark.', 'Your light rolls away across the floor, still on.', 'BLOOM takes root.'];
  $('deadMsg').textContent = msgs[Math.floor(Math.random() * msgs.length)];
  setTimeout(() => {
    if (G.state !== 'play') return;
    G.state = 'dead'; show('sDead'); $('hud').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }, 2200);
};

async function finishFloor() {
  if (G.state !== 'play') return;
  G.state = 'transition';
  A.liftArrive(); A.stopAlarm();
  if (G.floor === FLOORS.length - 1) {
    await fadeOut(1600);
    G.state = 'win'; $('hud').hidden = true; A.stopAmbience();
    if (document.pointerLockElement) document.exitPointerLock();
    const s = G.stats, acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    $('winStats').innerHTML = `<span>Difficulty</span><span>${G.diff.label}</span><span>Time</span><span>${fmt(s.time)}</span><span>Kills</span><span>${s.kills}</span><span>Accuracy</span><span>${acc}%</span><span>Damage taken</span><span>${Math.round(s.taken)}</span><span>Audio logs</span><span>${s.found.length} / 9</span>`;
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
  else if (u.kind === 'lift') { A.denied(new THREE.Vector3(u.x, 1.5, u.z)); ui.flash(G.floor === 2 ? 'FREIGHT LIFT: NO POWER' : 'LIFT LOCKED', 1500, '#ff8070'); }
}

function openLog(it) {
  const W = G.world, n = W.F.notes[it.extra];
  it.taken = true; it.mesh.userData.led.material = it.mesh.userData.led.material.clone(); it.mesh.userData.led.material.emissiveIntensity = 0.2;
  const id = G.floor + ':' + it.extra; if (!G.stats.found.includes(id)) G.stats.found.push(id);
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
  ui.flash('POWER RESTORED · FREIGHT LIFT CALLED', 3000, '#f0b43a');
  G.finale = { t: Math.round(65 * (G.diff.waves > 1 ? 1.1 : G.diff.waves < 1 ? 0.85 : 1)), spawnT: 3, total: 0 };
  G.finale.max = G.finale.t;
  // everything on the level hears it
  setTimeout(() => { for (const e of G.enemies.list) G.enemies.alert(e); }, 1200);
}

function pickup(it) {
  const P = G.player, D = G.diff, pos = new THREE.Vector3(it.x, 1, it.z);
  switch (it.type) {
    case 'key': {
      G.keys.add(it.extra); A.pickup('key');
      ui.flash(`${KEYNAME[it.extra]} KEYCARD`, 2200, { b: '#5b9bff', r: '#ff5a4a', y: '#ffd04a' }[it.extra]);
      ambush(it);
      break;
    }
    case 'ammo': { const n = Math.round(12 * D.ammo); P.ammo.pistol.reserve = Math.min(120, P.ammo.pistol.reserve + n); A.pickup(); ui.flash(`+${n} PISTOL AMMO`, 1200); break; }
    case 'shells': { const n = Math.round(6 * D.ammo); P.ammo.shotgun.reserve = Math.min(48, P.ammo.shotgun.reserve + n); A.pickup(); ui.flash(`+${n} SHELLS`, 1200); break; }
    case 'medkit': { if (P.medkits >= 3) return false; P.medkits++; A.pickup(); ui.flash('MEDKIT  [Q] TO USE', 1500); break; }
    case 'shotgun': { P.hasShotgun = true; A.pickup('weapon'); P.switchTo('shotgun'); ui.flash('SHOTGUN  [2]', 2200, '#f0b43a'); ambush(it); break; }
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
    if (want) d.hold = 1.2; else d.hold = (d.hold || 0) - dt;
    const target = d.hold > 0 ? 1 : 0;
    if (target !== d.target) { d.target = target; A.door(new THREE.Vector3(d.x, 1.5, d.z), !!target); }
    d.open = THREE.MathUtils.clamp(d.open + (d.target ? 1 : -1) * dt * 2.6, 0, 1);
    const e = d.open * d.open * (3 - 2 * d.open);
    d.halves[0].position.x = -C / 4 - e * C * 0.48; d.halves[1].position.x = C / 4 + e * C * 0.48;
  }
  // lift
  const X = W.exit; if (!X) return;
  const ready = G.floor < 2 || G.liftArrived;
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
  const W = G.world, c = camera.position, alarm = !!G.finale;
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
  const alive = G.enemies.list.filter((e) => e.state !== 'dead' && e.state !== 'dormant');
  const cap = Math.round(7 * G.diff.waves);
  if (F.spawnT <= 0 && alive.length < cap) {
    F.spawnT = (2.6 + Math.random() * 1.6) / G.diff.waves;
    const P = G.player, W = G.world;
    const spots = W.waveSpots.map((s) => ({ ...s, d: Math.hypot(s.x - P.pos.x, s.z - P.pos.z), v: W.los(s.x, s.z, P.pos.x, P.pos.z) }))
      .filter((s) => s.d > 8).sort((a, b) => (a.v - b.v) || (a.d - b.d));
    const s = spots[Math.floor(Math.random() * Math.min(3, spots.length))]; if (!s) return;
    const brutes = alive.filter((e) => e.type === 'brute').length;
    const r = Math.random();
    const type = r < 0.45 ? 'husk' : r < 0.8 ? 'crawler' : r < 0.93 || brutes ? 'spitter' : 'brute';
    G.enemies.spawn(type, s.x + (Math.random() - 0.5), s.z + (Math.random() - 0.5), { alert: true, drop: true });
    F.total++;
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
  ui.set('hFloor', `${F.name} · ${F.sub}`);
  // objective
  const met = (n) => (n.length === 1 ? G.keys.has(n) : n === 'power' ? G.powerOn : n === 'survive' ? G.liftArrived : false);
  const step = F.steps.find((s) => !met(s.need)) || F.steps[F.steps.length - 1];
  ui.set('hObj', step.text);
  const keys = [...G.keys].map((k) => `<i style="color:${{ b: '#3b82f6', r: '#ef4444', y: '#facc15' }[k]}" title="${KEYNAME[k]}"></i>`).join('');
  ui.set('hKeys', keys, 'innerHTML');
  $('hHp').style.width = Math.max(0, P.hp) + '%'; $('hSt').style.width = P.stamina + '%'; $('hBt').style.width = P.battery + '%';
  ui.set('hHpN', String(Math.ceil(P.hp)));
  $('hHp').parentElement.parentElement.classList.toggle('low', P.hp < 35);
  $('hBt').parentElement.parentElement.classList.toggle('low', P.battery < 22);
  ui.set('hMed', `MEDKITS ${P.medkits} <small>[Q]</small>`, 'innerHTML');
  const a = P.ammo[P.weapon];
  ui.set('hWeap', P.weapon === 'pistol' ? 'PISTOL' + (P.hasShotgun ? '  ·  [2] SHOTGUN' : '') : 'SHOTGUN  ·  [1] PISTOL');
  ui.set('hMag', String(a.mag)); ui.set('hRes', String(a.reserve));
  $('hMag').parentElement.classList.toggle('empty', a.mag === 0);
  ui.set('hRel', P.reloadT > 0 ? 'RELOADING' : a.mag === 0 && a.reserve === 0 ? 'NO AMMO' : a.mag <= (P.weapon === 'pistol' ? 3 : 1) && a.reserve > 0 ? '[R] RELOAD' : P.flashDead ? 'LIGHT RECHARGING' : '');
  // crosshair spread
  const moving = Math.hypot(P.vel.x, P.vel.z);
  const gap = (P.weapon === 'shotgun' ? 16 : 5) * (1 - P.ads * 0.6) + moving * 1.4 + P.kickV * 8 + (P.onGround ? 0 : 8);
  $('cross').style.setProperty('--g', gap.toFixed(1) + 'px');
  $('cross').style.opacity = P.sprinting || P.reloadT > 0 || !P.alive ? 0.25 : 1;
  // prompt
  let pr = '', bad = false;
  const u = nearestUse();
  if (!$('hLog').hidden) pr = '';
  else if (u?.kind === 'note') pr = '[E] Play audio log';
  else if (u?.kind === 'power') { if (G.keys.has('y')) pr = '[E] Pull the main breaker'; else { pr = 'Breaker locked: YELLOW keycard'; bad = true; } }
  else if (u?.kind === 'lift') { pr = G.floor === 2 ? 'FREIGHT LIFT: NO POWER' : 'LIFT'; bad = true; }
  else if (G.lockedNear && G.lockedNear.locked) { pr = `${KEYNAME[G.lockedNear.key]} KEYCARD REQUIRED`; bad = true; }
  const pe = $('hPrompt'); ui.set('hPrompt', pr); pe.classList.toggle('show', !!pr); pe.classList.toggle('bad', bad);
  if (!G.finale) $('hTimer').hidden = true;
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
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let menuT = 0, fpsAvg = 60;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime;
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
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
    P.update(dt, I); G.enemies.update(dt);
  }
  I.dx = 0; I.dy = 0;
  if (G.state !== 'pause') { updateLights(dt, t); G.fx.update(dt, camera, P.flashOn); }
  A.trackListener(camera.position, P.fwd || new THREE.Vector3(0, 0, -1));
  updatePost(dt, t);
  renderer.info.reset();
  post.comp.render();
}

// ---------- menus ----------
let backTo = 'sTitle';
$('bNew').onclick = () => { A.initAudio(); show('sDiff'); backTo = 'sTitle'; };
$('bContinue').onclick = () => { const s = store.get('bz_save', null); if (s) startGame(s.diff, s); };
$('bSettings').onclick = () => { A.initAudio(); backTo = 'sTitle'; openSettings(); };
$('bControls').onclick = () => { backTo = 'sTitle'; show('sControls'); };
$('bPSettings').onclick = () => { backTo = 'sPause'; openSettings(); };
$('bPControls').onclick = () => { backTo = 'sPause'; show('sControls'); };
$('bResume').onclick = resume;
$('bRestartFloor').onclick = () => retryFloor();
$('bQuit').onclick = toTitle;
$('bRetry').onclick = retryFloor;
$('bDeadQuit').onclick = toTitle;
$('bWinMenu').onclick = toTitle;
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => show(backTo);
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { store.del('bz_save'); startGame(b.dataset.diff); };
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
  bind('sFov', 'fov', 'oFov', (v) => v + '°');
  bind('sBright', 'bright', 'oBright', (v) => Math.round(v * 100) + '%');
  bind('sVol', 'vol', 'oVol', (v) => Math.round(v * 100) + '%');
  bind('sAmb', 'amb', 'oAmb', (v) => Math.round(v * 100) + '%');
  const q = $('sQual'); q.value = settings.quality; q.onchange = () => { settings.quality = q.value; store.set('bz_settings', settings); applyQuality(); };
  for (const [id, key] of [['sInvert', 'invert'], ['sBob', 'bob'], ['sFlash', 'reduceFlash']]) {
    const c = $(id); c.checked = settings[key]; c.onchange = () => { settings[key] = c.checked; store.set('bz_settings', settings); };
  }
  show('sSettings');
}

// software-rendering warning (Chrome without GPU acceleration)
try {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  if (/swiftshader|llvmpipe|software/i.test(name) && !TEST) $('gpuWarn').hidden = false;
} catch {}

// ---------- boot ----------
applyQuality(); applySettings();
loadFloor(0, { menu: true });
G.state = 'menu';
refreshTitle(); show('sTitle');
$('loading').hidden = true; fadeIn();
document.addEventListener('pointerdown', () => { if (G.state === 'menu') { A.initAudio(); A.menuMusic(true); } }, { once: true });
frame();

// ---------- test hook ----------
if (TEST) {
  window.__bz = {
    G, I, A,
    start: (d = 'normal', floor = 0) => { startGame(d); if (floor) { const keep = G.player.save(); loadFloor(floor); G.player.load(keep); G.player.pos.set(G.world.start.x, 0, G.world.start.z); } },
    tp: (cx, cz) => { G.player.pos.set(cx * C + C / 2, 0, cz * C + C / 2); updateFlow(true); },
    look: (yaw, pitch = 0) => { G.player.yaw = yaw; G.player.pitch = pitch; },
    keys: (...k) => k.forEach((x) => G.keys.add(x)),
    info: () => ({ state: G.state, floor: G.floor, hp: G.player.hp, pos: [+G.player.pos.x.toFixed(2), +G.player.pos.y.toFixed(2), +G.player.pos.z.toFixed(2)], ammo: G.player.ammo, keys: [...G.keys],
      enemies: G.enemies.list.map((e) => [e.type, e.state, Math.round(e.hp)]), power: G.powerOn, lift: G.liftArrived, finale: G.finale && Math.round(G.finale.t), kills: G.stats?.kills, fps: Math.round(fpsAvg), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    fire: () => { I.lmbEdge = true; I.lmb = true; setTimeout(() => (I.lmb = false), 50); },
    use: () => interact(), pause, resume, toTitle, finishFloor, powerOn,
    nearest: (type) => { let b = null, bd = 1e9; for (const e of G.enemies.list) { if (e.state === 'dead' || e.state === 'dormant' || (type && e.type !== type)) continue; const d = e.pos.distanceTo(G.player.pos); if (d < bd) { bd = d; b = e; } } return b; },
  };
}
