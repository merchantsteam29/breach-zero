// Monsters: code-built bodies with procedural animation, plus their AI.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as A from './audio.js';
import { fleshTex } from './textures.js';
import { C, H } from './world.js';

export const TYPES = {
  husk:    { hp: 100, walk: 1.0, run: 4.5, dmg: 14, reach: 1.8, windup: 0.4, cd: 0.95, r: 0.38 },
  crawler: { hp: 50,  walk: 1.5, run: 6.6, dmg: 9,  reach: 1.5, windup: 0.22, cd: 0.75, r: 0.36 },
  brute:   { hp: 650, walk: 0.9, run: 3.3, dmg: 32, reach: 2.4, windup: 0.75, cd: 1.5, r: 0.72 },
  spitter: { hp: 80,  walk: 1.0, run: 3.4, dmg: 12, reach: 1.6, windup: 0.5, cd: 2.2, r: 0.38 },
  // swollen with acid: walks up to you and bursts (or bursts when it dies); the blast hurts its own kind too
  burster: { hp: 70,  walk: 0.8, run: 2.9, dmg: 36, reach: 2.3, windup: 0.7, cd: 99, r: 0.5, burst: true },
  // set-piece hunter: cannot be killed, only staggered; leaves when its scene ends
  stalker: { hp: 1e9, walk: 1.4, run: 5.4, dmg: 34, reach: 2.1, windup: 0.32, cd: 0.9, r: 0.42, stalker: true },
  // THE HOST: reactor boss
  host:    { hp: 2600, walk: 1.2, run: 3.1, dmg: 30, reach: 3.0, windup: 0.75, cd: 1.6, r: 0.95, boss: true },
};

let MAT = null;
function mats() {
  if (MAT) return MAT;
  const skin = fleshTex([160, 150, 142]), skin2 = fleshTex([120, 104, 98]);
  MAT = {
    skin: new THREE.MeshStandardMaterial({ map: skin, color: 0x9a8a80, roughness: 0.85, metalness: 0 }),
    skinDark: new THREE.MeshStandardMaterial({ map: skin2, color: 0x7a6a64, roughness: 0.85, metalness: 0 }),
    raw: new THREE.MeshStandardMaterial({ color: 0x3a0809, roughness: 0.4, metalness: 0.05 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3d3f3a, roughness: 0.95 }),
    bone: new THREE.MeshStandardMaterial({ color: 0x7a7060, roughness: 0.7 }),
    mouth: new THREE.MeshBasicMaterial({ color: 0x050000 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 3 }),
    bloom: new THREE.MeshStandardMaterial({ color: 0x401008, emissive: 0xff4a1a, emissiveIntensity: 0.6, roughness: 0.4 }),
    sac: new THREE.MeshStandardMaterial({ color: 0x405010, emissive: 0x9dff2a, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.9 }),
    acid: new THREE.MeshBasicMaterial({ color: 0xb4ff3a }),
    pale: new THREE.MeshStandardMaterial({ map: skin, color: 0xcfc8c0, roughness: 0.5, metalness: 0 }),
    paleDark: new THREE.MeshStandardMaterial({ map: skin2, color: 0x6a6460, roughness: 0.55, metalness: 0 }),
    eyeRed: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a10, emissiveIntensity: 4 }),
  };
  return MAT;
}

const cap = (r, l, m) => { const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 8), m); g.castShadow = true; return g; };
const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const g = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m); g.scale.set(sx, sy, sz); g.castShadow = true; return g; };
// a limb segment hanging down from a pivot
function seg(parent, y, r, len, m) {
  const p = new THREE.Group(); p.position.y = y; parent.add(p);
  const c = cap(r, len, m); c.position.y = -len / 2; p.add(c);
  return p;
}

function humanoid(o) {
  const M0 = mats(), M = { ...M0, skin: o.skin || M0.skin, skinDark: o.skinDark || M0.skinDark, eye: o.eye || M0.eye };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const s = o.scale || 1; body.scale.setScalar(s);
  const hipY = o.leg * 2 + 0.05;
  const hips = new THREE.Group(); hips.position.y = hipY; body.add(hips);
  const legs = [];
  for (const sd of [-1, 1]) {
    const th = seg(hips, 0, o.limbR * 1.25, o.leg, o.legMat || M.cloth); th.position.x = sd * o.tw * 0.32;
    const sh = seg(th, -o.leg, o.limbR, o.leg, M.skinDark);
    legs.push({ th, sh });
  }
  const torso = new THREE.Group(); hips.add(torso);
  // gaunt build: pelvis, a starved waist, a ribcage with the ribs showing through
  const pelvis = ball(o.tw * 0.36, o.legMat || M.cloth, 1.1, 0.7, 0.8); pelvis.position.y = 0.04; torso.add(pelvis);
  const waist = cap(o.tw * (o.bulk ? 0.4 : 0.22), o.th * 0.35, M.skinDark); waist.scale.z = 0.8; waist.position.y = o.th * 0.32; torso.add(waist);
  const cr = o.tw * (o.bulk ? 0.52 : 0.36);
  const chest = cap(cr, o.th * 0.42, M.skin); chest.scale.z = 0.72; chest.position.y = o.th * 0.78; torso.add(chest);
  for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(cr * (1.02 - i * 0.06), 0.011, 4, 14, Math.PI), M.bone); rib.rotation.x = Math.PI / 2 + 0.25; rib.scale.y = 0.74; rib.position.set(0, o.th * (0.6 + i * 0.09), 0); torso.add(rib); }
  for (const sd of [-1, 1]) { const sh = ball(o.limbR * 1.6, M.skin); sh.position.set(sd * (cr + o.limbR * 0.6), o.th + 0.08, 0); torso.add(sh); }
  const wound = ball(o.tw * 0.16, M.raw, 1, 1.3, 0.35); wound.position.set(o.tw * 0.1, o.th * 0.36, o.tw * 0.18); torso.add(wound);
  for (let i = 0; i < (o.growths || 3); i++) { const b = ball(0.022 + Math.random() * 0.03, M.bloom); b.position.set((Math.random() - 0.5) * cr * 1.6, o.th * (0.3 + Math.random() * 0.7), (Math.random() - 0.2) * cr * 0.8); torso.add(b); }
  const neck = new THREE.Group(); neck.position.y = o.th + 0.3; torso.add(neck);
  const nk = cap(o.limbR * 0.9, o.neck || 0.12, M.skinDark); nk.position.y = (o.neck || 0.12) / 2; neck.add(nk);
  const head = new THREE.Group(); head.position.y = (o.neck || 0.12) + o.headR * 0.6; neck.add(head);
  const skull = ball(o.headR, M.skin, 0.78, 1.22, 0.95); head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0, -o.headR * 0.3, o.headR * 0.3); head.add(jaw);
  const mouth = ball(o.headR * 0.5, M.mouth, 0.85, 1.7, 0.45); mouth.position.set(0, -o.headR * 0.35, o.headR * 0.5); jaw.add(mouth);
  for (let i = 0; i < 5; i++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.045, 4), M.bone); tth.position.set((i - 2) * o.headR * 0.17, -o.headR * 0.02, o.headR * 0.62); tth.rotation.x = Math.PI; jaw.add(tth); }
  for (const sd of [-1, 1]) {
    const sock = ball(o.headR * 0.2, M.mouth, 1, 0.8, 0.5); sock.position.set(sd * o.headR * 0.3, o.headR * 0.2, o.headR * 0.72); head.add(sock);
    const e = ball(o.headR * 0.075, M.eye); e.position.set(sd * o.headR * 0.3, o.headR * 0.2, o.headR * 0.8); head.add(e);
  }
  const arms = [];
  for (const sd of [-1, 1]) {
    const big = o.bigBoth || (o.bigArm && sd === 1) ? 1.7 : 1;
    const up = seg(torso, o.th + 0.12, o.limbR * big, o.arm, M.skin); up.position.x = sd * (o.tw * 0.55 + o.limbR); up.rotation.z = sd * 0.15;
    const lo = seg(up, -o.arm, o.limbR * 0.85 * big, o.arm * 1.15, M.skinDark);
    // claws
    for (let i = 0; i < 3; i++) { const cl = new THREE.Mesh(new THREE.ConeGeometry(0.018 * big, 0.2 * big, 5), M.bone); cl.position.set((i - 1) * 0.035 * big, -o.arm * 1.15 - 0.12 * big, 0.02); cl.rotation.x = Math.PI; lo.add(cl); }
    if (big > 1) { const club = ball(0.13, M.raw, 1, 1.4, 1); club.position.y = -o.arm * 1.15 - 0.06; lo.add(club); for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.18, 5), M.bone); sp.position.set(Math.cos(i * 1.3) * 0.1, -o.arm * 1.15 - 0.1 + Math.sin(i * 2) * 0.06, Math.sin(i * 1.3) * 0.1); sp.lookAt(sp.position.clone().multiplyScalar(3)); sp.rotateX(Math.PI / 2); lo.add(sp); } }
    arms.push({ up, lo, sd });
  }
  let sac = null;
  if (o.sac) { sac = ball(0.17, M.sac, 1.2, 1, 1.1); sac.position.set(0, (o.neck || 0.12) * 0.4, 0.14); neck.add(sac); }
  const weak = [];
  for (let i = 0; i < (o.backSacs || 0); i++) { const b = ball(0.13 + (i % 2) * 0.04, M.sac); b.position.set((i % 3 - 1) * cr * 0.7, o.th * (0.55 + (i % 2) * 0.35), -cr * 0.75); torso.add(b); weak.push(b); }
  const legMark = new THREE.Object3D(); legMark.position.y = -o.leg * 0.9; hips.add(legMark);
  const hits = [{ o: chest, r: cr * 1.3 * s }, { o: waist, r: cr * 1.1 * s }, { o: legMark, r: o.tw * 0.6 * s }, { o: skull, r: o.headR * 1.3 * s, head: true }, ...weak.map((b) => ({ o: b, r: 0.22 * s, head: true }))];
  return { root, body, hips, torso, neck, head, jaw, legs, arms, sac, s, hipY, hits };
}

function crawlerModel() {
  const M = mats();
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.45; body.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const t = cap(0.2, 0.7, M.skin); t.rotation.x = Math.PI / 2; t.scale.x = 1.3; torso.add(t);
  const spine = []; for (let i = 0; i < 5; i++) { const v = ball(0.05, M.bone); v.position.set(0, 0.2, -0.35 + i * 0.17); torso.add(v); spine.push(v); }
  for (let i = 0; i < 4; i++) { const b = ball(0.05 + Math.random() * 0.04, M.bloom); b.position.set((Math.random() - 0.5) * 0.4, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.6); torso.add(b); }
  const neck = new THREE.Group(); neck.position.set(0, 0.05, 0.5); torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const skull = ball(0.17, M.skin, 0.9, 0.8, 1.2); head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.06, 0.08); head.add(jaw);
  const mouth = ball(0.12, M.mouth, 1.1, 0.8, 0.7); mouth.position.set(0, -0.04, 0.1); jaw.add(mouth);
  for (let i = 0; i < 6; i++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 4), M.bone); tth.position.set((i - 2.5) * 0.03, 0.01, 0.17); tth.rotation.x = Math.PI; jaw.add(tth); }
  for (const sd of [-1, 1]) for (const k of [0, 1]) { const e = ball(0.022, M.eye); e.position.set(sd * (0.05 + k * 0.05), 0.06 - k * 0.02, 0.17); head.add(e); }
  const legs = [];
  for (const fz of [0.3, -0.3]) for (const sd of [-1, 1]) {
    const up = new THREE.Group(); up.position.set(sd * 0.22, 0.02, fz); torso.add(up);
    const u = cap(0.05, 0.45, M.skin); u.position.y = 0.22; up.add(u); up.rotation.z = -sd * 1.1;
    const lo = new THREE.Group(); lo.position.y = 0.45; up.add(lo);
    const l = cap(0.04, 0.6, M.skinDark); l.position.y = -0.3; lo.add(l); lo.rotation.z = sd * 2.1;
    legs.push({ up, lo, sd, fz });
  }
  const hits = [{ o: t, r: 0.42 }, { o: skull, r: 0.22, head: true }];
  return { root, body, hips, torso, neck, head, jaw, legs, arms: [], crawler: true, s: 1, hipY: 0.45, hits };
}

// A freshly built body is ~50 tiny meshes (each its own draw call, twice over with the
// flashlight shadow). Merge every pivot's direct mesh children by material into one mesh:
// the pivots stay, so the procedural animation is untouched. The merged geometry is cached
// per type, so later spawns of that type reuse it instead of uploading new buffers.
const GEO = new Map();
const NO_SHADOW = new Set(['eye', 'eyeRed', 'mouth', 'bloom', 'sac', 'acid']);
function compact(m, type) {
  const M = mats(), matName = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  const refs = new Map(m.hits.map((h) => [h.o, null]));
  const keep = new Set([m.sac].filter(Boolean));
  const nodes = []; m.root.traverse((o) => { if (!o.isMesh) nodes.push(o); });
  nodes.forEach((node, ni) => {
    const byMat = new Map();
    for (const c of node.children) {
      if (!c.isMesh || keep.has(c)) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      const key = type + '/' + ni + '/' + matName.get(mat);
      let geo = GEO.get(key);
      if (!geo) {
        geo = mergeGeometries(list.map((c) => { c.updateMatrix(); return c.geometry.clone().applyMatrix4(c.matrix); }), false);
        geo.computeBoundingSphere(); GEO.set(key, geo);
      }
      for (const c of list) {
        node.remove(c);
        // hit spheres follow these parts, so leave an empty marker where they were
        if (refs.has(c)) { const k = new THREE.Object3D(); k.position.copy(c.position); k.quaternion.copy(c.quaternion); k.scale.copy(c.scale); node.add(k); refs.set(c, k); }
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !NO_SHADOW.has(matName.get(mat));
      node.add(mesh);
    }
  });
  if (m.sac) { const key = type + '/sac', g = GEO.get(key); if (g) m.sac.geometry = g; else GEO.set(key, m.sac.geometry); m.sac.castShadow = false; }
  for (const h of m.hits) h.o = refs.get(h.o) || h.o;
  return m;
}

function build(type) { return compact(buildRaw(type), type); }
function buildRaw(type) {
  if (type === 'crawler') return crawlerModel();
  if (type === 'brute') return humanoid({ scale: 1.4, leg: 0.42, limbR: 0.1, tw: 0.7, th: 0.62, arm: 0.48, headR: 0.14, neck: 0.04, bigArm: true, bulk: true, growths: 10, legMat: mats().skinDark });
  if (type === 'stalker') { const M = mats(); return humanoid({ scale: 1.22, leg: 0.6, limbR: 0.042, tw: 0.34, th: 0.62, arm: 0.66, headR: 0.12, neck: 0.32, growths: 0, skin: M.pale, skinDark: M.paleDark, eye: M.eyeRed, legMat: M.paleDark }); }
  if (type === 'host') return humanoid({ scale: 1.5, leg: 0.42, limbR: 0.12, tw: 0.8, th: 0.7, arm: 0.52, headR: 0.15, neck: 0.05, bigBoth: true, bulk: true, growths: 22, sac: true, backSacs: 4, legMat: mats().skinDark });
  if (type === 'burster') {
    const M = mats(), m = humanoid({ scale: 1.05, leg: 0.4, limbR: 0.05, tw: 0.62, th: 0.5, arm: 0.34, headR: 0.11, neck: 0.06, bulk: true, growths: 9 });
    const belly = ball(0.34, M.sac, 1.15, 1, 1.05); belly.position.set(0, 0.42 * 0.5, 0.2); m.torso.add(belly);
    m.sac = belly; m.belly = belly;
    m.hits.push({ o: belly, r: 0.38 * m.s, head: true }); // the sac is the weak spot
    return m;
  }
  if (type === 'spitter') return humanoid({ leg: 0.46, limbR: 0.048, tw: 0.38, th: 0.48, arm: 0.38, headR: 0.13, neck: 0.3, sac: true, growths: 2 });
  return humanoid({ leg: 0.45, limbR: 0.05, tw: 0.42, th: 0.52, arm: 0.4, headR: 0.13, neck: 0.12, growths: 4 });
}

// ---------------------------------------------------------------------------
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
let SPIT_GEO = null;

export class Enemies {
  constructor(G) { this.G = G; this.list = []; this.shots = []; this.shriekT = 0; this.group = new THREE.Group(); G.scene.add(this.group); }

  clear() {
    for (const e of this.list) this.group.remove(e.m.root);
    for (const s of this.shots) this.group.remove(s.mesh);
    this.list = []; this.shots = [];
  }

  spawn(type, x, z, { dormant = false, alert = false, drop = false, decoy = null } = {}) {
    const T = TYPES[type], D = this.G.diff, m = build(type);
    m.root.position.set(x, 0, z); m.root.rotation.y = Math.random() * 6.28;
    this.group.add(m.root);
    const e = {
      type, T, m, pos: m.root.position, vel: new THREE.Vector3(), yaw: m.root.rotation.y, hp: T.hp * D.hp, maxHp: T.hp * D.hp,
      state: dormant ? 'dormant' : 'idle', home: new THREE.Vector3(x, 0, z), wander: null, wanderT: Math.random() * 3,
      ph: Math.random() * 6, atk: 0, cd: 0, lost: 0, think: Math.random() * 0.2, see: false, flinch: 0, stagger: 0, deadT: 0,
      growlT: 2 + Math.random() * 6, stepPh: 0, special: 0, specialCd: 2 + Math.random() * 3, mode: null, vy: 0, y: 0, twitch: 0, stuck: 0,
    };
    if (dormant) m.root.visible = false;
    if (decoy) { e.state = 'decoy'; e.decoy = decoy; e.yaw = m.root.rotation.y = Math.atan2(decoy.dir.x, decoy.dir.z); }
    if (drop) { e.y = H - 0.4; e.vy = 0; }
    this.list.push(e);
    if (alert) this.alert(e, true);
    return e;
  }

  // dormant ambushers near this point drop from the ceiling vents
  wake(x, z, radius = 16) {
    let n = 0;
    for (const e of this.list) {
      if (e.state !== 'dormant' || Math.hypot(e.pos.x - x, e.pos.z - z) > radius) continue;
      e.state = 'idle'; e.m.root.visible = true; e.y = H - 0.3; e.vy = 0; n++;
      setTimeout(() => this.alert(e, true), 350 + n * 150);
    }
    return n;
  }

  alert(e, force) {
    if (e.state === 'dead' || e.state === 'dormant' || e.state === 'decoy') return;
    if (e.state !== 'hunt') {
      e.state = 'hunt'; e.lost = 0;
      if (this.shriekT <= 0 || force) { A.shriek(e.type, e.pos.clone().setY(1.5)); this.shriekT = 0.6; }
      e.twitch = 0.5;
    }
    e.lost = 0;
  }

  // a body on the floor that was not there a moment ago
  corpse(x, z) {
    const e = this.spawn('husk', x, z); e.state = 'dead'; e.deadT = 0.6; e.keep = true; e.fallDir = Math.random() * 6.28; e.pooled = false;
    return e;
  }
  // take something out of the world without a death (stalker leaving, decoys)
  vanish(e) { e.state = 'dead'; e.gone = true; e.m.root.visible = false; this.group.remove(e.m.root); }

  // noise travels along corridors: alert enemies within this many cells of path distance
  noise(cells) {
    const G = this.G;
    for (const e of this.list) {
      if (e.state === 'dead' || e.state === 'dormant') continue;
      const d = G.flowAt(e.pos.x, e.pos.z);
      if (d >= 0 && d <= cells) this.alert(e);
    }
  }

  // hitscan against hit spheres; returns nearest
  hitTest(o, dir, max) {
    let best = null;
    for (const e of this.list) {
      if (e.state === 'dead' || e.state === 'dormant' || e.state === 'decoy') continue;
      for (const h of e.m.hits) {
        h.o.getWorldPosition(_v);
        _w.subVectors(_v, o); const b = _w.dot(dir); if (b < 0) continue;
        const c = _w.lengthSq() - b * b, rr = h.r * h.r; if (c > rr) continue;
        const t = b - Math.sqrt(rr - c);
        if (t < max && (!best || t < best.dist)) best = { e, dist: t, head: !!h.head, point: o.clone().addScaledVector(dir, t) };
      }
    }
    return best;
  }

  damage(e, amount, dir, head, heavy, kind) {
    if (e.state === 'dead' || e.state === 'decoy') return false;
    if (e.T.stalker) {
      // it does not die. Hurting it only buys you a moment.
      e.flinch = 1; e.stagger = Math.max(e.stagger, kind === 'melee' ? 0.9 : heavy ? 0.5 : 0.16);
      e.vel.addScaledVector(dir, heavy ? 2.5 : 0.6);
      if (Math.random() < 0.25) A.pain('stalker', e.pos.clone().setY(2));
      return false;
    }
    e.hp -= amount; e.flinch = 1; this.alert(e); e.lastKind = kind;
    if (heavy && e.type !== 'brute' && !e.T.boss) { e.stagger = 0.35; e.vel.addScaledVector(dir, 3); }
    if (e.T.boss) this.G.onBossHit?.(e);
    if (e.hp <= 0) { this.kill(e, dir); return true; }
    if (Math.random() < 0.5) A.pain(e.type, e.pos.clone().setY(1.4));
    return false;
  }

  // a Burster pops: acid on everything around it (you, and its own kind)
  explode(e) {
    if (e.exploded) return; e.exploded = true;
    const G = this.G, P = G.player, D = G.diff, R = 3.6, at = e.pos.clone().setY(e.y + 1.0);
    A.burst(at); G.shake(0.55);
    for (let i = 0; i < 4; i++) G.fx.splash(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.2)), 0x9dff2a);
    G.fx.blood(at, new THREE.Vector3(0, 1, 0), 24);
    const pd = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    if (P.alive && pd < R && G.world.los(e.pos.x, e.pos.z, P.pos.x, P.pos.z)) P.damage(e.T.dmg * D.dmg * (1 - pd / R * 0.7), e.pos, 6, 'acid');
    for (const o of this.list) {
      if (o === e || o.state === 'dead' || o.state === 'dormant' || o.decoy || o.gone || o.T.stalker) continue;
      const d = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z); if (d > R) continue;
      const dir = new THREE.Vector3(o.pos.x - e.pos.x, 0, o.pos.z - e.pos.z).normalize();
      this.damage(o, 130 * (1 - d / R * 0.6), dir, false, true, 'burst');
    }
    if (e.state !== 'dead') { e.hp = 0; this.kill(e, new THREE.Vector3(0, 0, 1)); }
    this.vanish(e); // nothing left to fall over
  }

  kill(e, dir) {
    e.state = 'dead'; e.deadT = 0; e.fallDir = Math.atan2(dir.x, dir.z) - e.yaw; A.death(e.type, e.pos.clone().setY(1.2));
    this.G.onKill(e);
    if (e.T.boss) this.G.onBossDead?.(e);
    if (e.T.burst && !e.exploded) setTimeout(() => this.explode(e), 120);
  }

  update(dt) {
    const G = this.G, P = G.player, W = G.world, D = G.diff;
    this.shriekT -= dt;
    const pp = P.pos;
    for (const e of this.list) {
      const m = e.m;
      if (e.state === 'dormant') continue;
      // falling (ceiling drops / pounces)
      if (e.y > 0 || e.vy > 0) { e.vy -= 20 * dt; e.y = Math.max(0, e.y + e.vy * dt); if (e.y === 0) { e.vy = 0; A.step('brute', e.pos.clone()); } }
      if (e.gone) continue;
      if (e.state === 'dead') { this.animDead(e, dt); continue; }
      if (e.state === 'decoy') { this.updateDecoy(e, dt); continue; }
      const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z, dist = Math.hypot(dx, dz);
      if (e.burnT > 0) { // on fire: keeps hurting, flames on the body, panics a little
        e.burnT -= dt; e.burnTick = (e.burnTick || 0) - dt;
        if (Math.random() < dt * 30) G.fx.emit(G.fx.glow, e.pos.clone().setY(e.y + 0.4 + Math.random() * 1.3), 1, { col: [1, 0.4 + Math.random() * 0.3, 0.05], speed: 0.8, spread: 1, life: 0.5, grav: -3 });
        if (e.burnTick <= 0) { e.burnTick = 0.25; if (this.damage(e, 4.5, new THREE.Vector3(0, 0, 1), false, false, 'fire')) continue; }
      }
      e.cd -= dt; e.specialCd -= dt; e.flinch = Math.max(0, e.flinch - dt * 4); e.stagger -= dt; e.twitch = Math.max(0, e.twitch - dt);

      // --- perception (5x a second) ---
      e.think -= dt;
      if (e.T.stalker && P.alive) { e.state = 'hunt'; e.lost = 0; }
      if (e.think <= 0) {
        e.think = 0.2;
        e.see = dist < 40 && W.los(e.pos.x, e.pos.z, pp.x, pp.z);
        if (e.state !== 'hunt' && e.see && P.alive && !this.passive) {
          const range = (P.flashOn ? 19 : 8.5) * D.sight * (P.crouch ? 0.65 : 1);
          const fwd = Math.atan2(dx, dz), da = Math.abs(((fwd - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          // your beam on them gives you away too
          const lit = P.flashOn && P.aimingAt(e.pos, 24);
          if ((dist < range && da < 1.3) || dist < 3 || lit) this.alert(e);
        }
      }
      if (e.state === 'hunt') { if (e.see) e.lost = 0; else e.lost += dt; if (e.lost > 14 || !P.alive) { e.state = 'idle'; e.home.copy(e.pos); } }

      // --- decide movement ---
      let tx = 0, tz = 0, speed = 0, face = null;
      const T = e.T;
      if (e.stagger > 0) speed = 0;
      else if (e.mode === 'pounce' || e.mode === 'charge') { /* handled below */ }
      else if (e.state === 'hunt') {
        face = Math.atan2(dx, dz);
        if (e.see && dist < 14) { tx = dx / dist; tz = dz / dist; }
        else { const s = this.flowStep(e); if (s) { tx = s[0]; tz = s[1]; } else if (e.see) { tx = dx / dist; tz = dz / dist; } }
        speed = T.run * D.speed * (T.boss && e.hp < e.maxHp * 0.25 ? 1.35 : 1);
        if (e.type === 'spitter' && e.see) {
          if (dist < 5) { tx = -tx; tz = -tz; speed *= 0.6; } else if (dist < 11) speed = 0;
        }
        if (dist < T.reach * 0.8) speed = 0;
        if (e.atk > 0) speed *= 0.25;
      } else {
        // idle: amble about home
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 3 + Math.random() * 5;
          if (Math.random() < 0.4) e.wander = null;
          else {
            const a = Math.random() * 6.28, r = Math.random() * 5;
            const wx = e.home.x + Math.cos(a) * r, wz = e.home.z + Math.sin(a) * r;
            if (W.los(e.pos.x, e.pos.z, wx, wz)) e.wander = new THREE.Vector3(wx, 0, wz);
          }
        }
        if (e.wander) {
          const wx = e.wander.x - e.pos.x, wz = e.wander.z - e.pos.z, wd = Math.hypot(wx, wz);
          if (wd < 0.4) e.wander = null; else { tx = wx / wd; tz = wz / wd; speed = T.walk; }
        }
      }

      // --- specials ---
      if (e.state === 'hunt' && e.see && e.stagger <= 0 && !e.mode && (e.specialCd <= 0 || e.T.burst) && P.alive) {
        if (e.type === 'crawler' && dist > 2.5 && dist < 7) {
          e.mode = 'pounce'; e.modeT = 0.75; e.vy = 4.2; e.y = 0.01; e.specialCd = 2.5 + Math.random() * 2;
          e.vel.set(dx / dist * 9.5, 0, dz / dist * 9.5); A.attack('crawler', e.pos.clone()); e.hitDone = false;
        } else if (e.type === 'brute' && dist > 5 && dist < 16) {
          e.mode = 'windcharge'; e.modeT = 0.8; e.specialCd = 6 + Math.random() * 3; A.shriek('brute', e.pos.clone().setY(2));
          G.shake(0.3);
        } else if (e.T.burst && dist < T.reach) {
          e.mode = 'swell'; e.modeT = T.windup; e.specialCd = 99; A.swell(e.pos.clone().setY(1.2));
        } else if (e.type === 'spitter' && dist > 3 && dist < 20) {
          e.mode = 'spit'; e.modeT = 0.6; e.specialCd = T.cd + Math.random();
        } else if (T.boss && dist < 22) {
          // THE HOST: charge, acid volley, or call its brood; faster and nastier as it weakens
          const hpF = e.hp / e.maxHp, r = Math.random(), adds = this.list.filter((o) => o !== e && o.state !== 'dead' && o.state !== 'dormant' && o.state !== 'decoy').length;
          if (r < 0.35 && dist > 4.5) { e.mode = 'windcharge'; e.modeT = 0.9; A.shriek('host', e.pos.clone().setY(3)); G.shake(0.45); }
          else if (r < 0.72 || adds >= 5) { e.mode = 'volley'; e.modeT = 0.9; }
          else { e.mode = 'summon'; e.modeT = 1.3; A.shriek('host', e.pos.clone().setY(3)); G.shake(0.6); }
          e.specialCd = (hpF < 0.5 ? 2.0 : 3.4) + Math.random() * 1.5;
        }
      }
      if (e.mode) {
        e.modeT -= dt;
        if (e.mode === 'pounce') {
          if (!e.hitDone && dist < 1.3 && Math.abs((e.y + 0.4) - (P.pos.y + 0.8)) < 1.2) { e.hitDone = true; P.damage(T.dmg * 1.3 * D.dmg, e.pos, 4); }
          if (e.modeT <= 0 && e.y <= 0) { e.mode = null; e.vel.multiplyScalar(0.2); }
        } else if (e.mode === 'windcharge') {
          face = Math.atan2(dx, dz); speed = 0;
          if (e.modeT <= 0) { e.mode = 'charge'; e.modeT = 1.6; e.chargeDir = new THREE.Vector3(dx / dist, 0, dz / dist); e.hitDone = false; }
        } else if (e.mode === 'charge') {
          // steer slightly toward player
          const want = new THREE.Vector3(dx / dist, 0, dz / dist); e.chargeDir.lerp(want, dt * 1.2).normalize();
          e.vel.set(e.chargeDir.x * 8 * D.speed, 0, e.chargeDir.z * 8 * D.speed); face = Math.atan2(e.chargeDir.x, e.chargeDir.z);
          if (!e.hitDone && dist < 1.6) { e.hitDone = true; P.damage(T.dmg * 1.2 * D.dmg, e.pos, 9); G.shake(0.8); }
          if (e.modeT <= 0) { e.mode = null; }
          if (e.bonk) { e.mode = null; e.stagger = T.boss ? 0.8 : 1.4; G.shake(0.5); A.land(2.5); e.bonk = false; }
          if (Math.random() < dt * 8) A.step('brute', e.pos.clone());
        } else if (e.mode === 'volley') {
          face = Math.atan2(dx, dz); speed = 0;
          if (e.modeT <= 0) { e.mode = null; const n = e.hp < e.maxHp * 0.5 ? 5 : 3; for (let i = 0; i < n; i++) this.spit(e, (i - (n - 1) / 2) * 0.22); }
        } else if (e.mode === 'summon') {
          face = Math.atan2(dx, dz); speed = 0;
          if (e.modeT <= 0) { e.mode = null; G.onBossSummon?.(e); }
        } else if (e.mode === 'swell') {
          face = Math.atan2(dx, dz); speed = 0;
          if (m.belly) m.belly.scale.setScalar(1 + (1 - e.modeT / T.windup) * 0.6 + Math.sin(e.modeT * 60) * 0.04);
          if (e.modeT <= 0) { e.mode = null; this.explode(e); continue; }
        } else if (e.mode === 'spit') {
          face = Math.atan2(dx, dz); speed = 0;
          if (m.sac) m.sac.scale.setScalar(1.2 + (0.6 - e.modeT) * 1.2);
          if (e.modeT <= 0) { e.mode = null; this.spit(e); if (m.sac) m.sac.scale.set(1.2, 1, 1.1); }
        }
      }

      // --- melee ---
      if (e.state === 'hunt' && !e.mode && e.stagger <= 0 && P.alive && !T.burst) {
        if (e.atk > 0) {
          e.atk -= dt;
          if (e.atk <= 0) {
            e.cd = T.cd;
            const facing = Math.abs(((Math.atan2(dx, dz) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.1;
            if (dist < T.reach + 0.45 && facing && Math.abs(P.pos.y) < 1.4) P.damage(T.dmg * D.dmg, e.pos, e.type === 'brute' || T.boss ? 7 : T.stalker ? 4 : 2.5);
          }
        } else if (dist < T.reach && e.cd <= 0 && e.see) { e.atk = T.windup; A.attack(e.type, e.pos.clone().setY(1.5)); }
      }

      // --- integrate ---
      if (e.mode !== 'pounce' && e.mode !== 'charge') {
        const k = Math.min(1, dt * (e.state === 'hunt' ? 7 : 3));
        e.vel.x += (tx * speed - e.vel.x) * k; e.vel.z += (tz * speed - e.vel.z) * k;
      }
      // separation
      for (const o of this.list) {
        if (o === e || o.state === 'dead' || o.state === 'dormant' || o.state === 'decoy') continue;
        const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, d2 = sx * sx + sz * sz, rr = e.T.r + o.T.r;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), p = (rr - d) / d * 0.5; e.pos.x += sx * p; e.pos.z += sz * p; }
      }
      // keep out of the player
      if (dist < T.r + 0.35 && dist > 1e-4) { const p = (T.r + 0.35 - dist) / dist; e.pos.x -= dx * p; e.pos.z -= dz * p; }
      const bx = e.pos.x, bz = e.pos.z;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
      const wx = e.pos.x, wz = e.pos.z;
      W.collide(e.pos, T.r, e.y);
      if (e.mode === 'charge' && Math.hypot(e.pos.x - wx, e.pos.z - wz) > 0.05) e.bonk = true;
      // stuck nudging
      const moved = Math.hypot(e.pos.x - bx, e.pos.z - bz);
      if (speed > 0.5 && moved < speed * dt * 0.2) { e.stuck += dt; if (e.stuck > 0.6) { e.vel.x += (Math.random() - 0.5) * 6; e.vel.z += (Math.random() - 0.5) * 6; e.stuck = 0; } } else e.stuck = 0;

      // --- facing ---
      const hv = Math.hypot(e.vel.x, e.vel.z);
      const wantYaw = face !== null ? face : hv > 0.2 ? Math.atan2(e.vel.x, e.vel.z) : e.yaw;
      let dy = ((wantYaw - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      e.yaw += dy * Math.min(1, dt * (e.state === 'hunt' ? 9 : 3));
      m.root.rotation.y = e.yaw; m.root.position.y = e.y;

      // --- sounds ---
      e.growlT -= dt;
      if (e.growlT <= 0 && dist < 28) { A.growl(e.type, e.pos.clone().setY(1.5)); e.growlT = e.state === 'hunt' ? 1.8 + Math.random() * 2.5 : 5 + Math.random() * 7; }
      this.animate(e, dt, hv, dist);
    }

    // acid
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.vel.y -= 6 * dt; s.mesh.position.addScaledVector(s.vel, dt); s.life -= dt;
      const p = s.mesh.position;
      const hitP = Math.hypot(p.x - pp.x, p.z - pp.z) < 0.55 && p.y > pp.y && p.y < pp.y + 1.9;
      const [gx, gz] = W.cellOf(p.x, p.z), cell = W.grid[gz]?.[gx];
      const wall = cell === '#' || p.y < 0.05 || p.y > H || s.life <= 0;
      if (hitP && P.alive) { P.damage(TYPES.spitter.dmg * D.dmg, s.from, 1.5, 'acid'); }
      if (hitP || wall) { G.fx.splash(p, 0x9dff2a); A.splat(p.clone()); this.group.remove(s.mesh); this.shots.splice(i, 1); }
    }
  }

  // one throwaway mesh per monster material, for shader warm-up
  warmGroup() {
    const g = new THREE.Group(), geo = SPIT_GEO || (SPIT_GEO = new THREE.SphereGeometry(0.12, 8, 6));
    for (const m of Object.values(mats())) { const o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); }
    return g;
  }

  spit(e, yawOff = 0) {
    const P = this.G.player, M = mats();
    const o = e.pos.clone(); o.y = e.y + (e.T.boss ? 2.6 : 1.75);
    const target = P.pos.clone(); target.y += 1.2; target.addScaledVector(P.vel, 0.35);
    const d = target.sub(o); const t = d.length() / 15;
    const vel = d.divideScalar(t); vel.y += 3 * t;
    if (yawOff) vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOff);
    const mesh = new THREE.Mesh(SPIT_GEO || (SPIT_GEO = new THREE.SphereGeometry(0.12, 8, 6)), M.acid); mesh.position.copy(o); this.group.add(mesh);
    this.shots.push({ mesh, vel, life: 3, from: e.pos.clone() });
    A.spit(o);
  }

  flowStep(e) {
    const G = this.G, W = G.world;
    const [gx, gz] = W.cellOf(e.pos.x, e.pos.z);
    const here = G.flowAt(e.pos.x, e.pos.z);
    if (here < 0) return null;
    let best = here, bx = null, bz = null;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = gx + ox, nz = gz + oz;
      if (ox && oz && (!W.walkable(gx + ox, gz) || !W.walkable(gx, gz + oz))) continue;
      const d = G.flow[nz * W.W + nx];
      if (d >= 0 && d < best) { best = d; bx = nx; bz = nz; }
    }
    if (bx === null) return null;
    // steer to the neighbour centre, but keep away from corners
    const tx = bx * C + C / 2 - e.pos.x, tz = bz * C + C / 2 - e.pos.z, l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  }

  animate(e, dt, hv, dist) {
    const m = e.m, t = performance.now() / 1000;
    const hunting = e.state === 'hunt';
    const sp = hv / (e.T.run || 1);
    e.ph += dt * (2 + hv * (m.crawler ? 3.2 : 2.3));
    const s = Math.sin(e.ph), c = Math.cos(e.ph);
    // footsteps
    const stepNow = Math.floor(e.ph / Math.PI);
    if (stepNow !== e.stepPh) { e.stepPh = stepNow; if (hv > 0.5 && dist < 16) A.step(e.type, e.pos.clone()); }
    const tw = e.twitch > 0 || Math.random() < dt * 1.5 ? (Math.random() - 0.5) * 0.6 : 0;
    if (m.crawler) {
      m.legs.forEach((L, i) => {
        const p = e.ph + (i % 2 === (i >> 1) ? 0 : Math.PI);
        L.up.rotation.x = Math.sin(p) * 0.6 * Math.min(1, sp * 2 + 0.1);
        L.up.rotation.z = -L.sd * (1.1 + Math.max(0, Math.cos(p)) * 0.3);
      });
      m.torso.rotation.z = s * 0.08; m.hips.position.y = 0.45 + Math.abs(c) * 0.05;
      m.head.rotation.y = tw * 1.5; m.head.rotation.z = Math.sin(t * 13) * 0.08 * (hunting ? 1 : 0.3);
      m.jaw.rotation.x = hunting ? 0.25 + Math.sin(t * 20) * 0.15 : 0.05;
      if (e.mode === 'pounce') { m.torso.rotation.x = -0.4; } else m.torso.rotation.x *= 0.9;
      if (e.atk > 0) m.head.position.z = 0.15 * Math.sin((1 - e.atk / e.T.windup) * Math.PI);
      return;
    }
    const amp = Math.min(1, sp * 1.4 + (hv > 0.1 ? 0.25 : 0));
    m.legs.forEach((L, i) => {
      const p = i ? Math.PI : 0;
      L.th.rotation.x = Math.sin(e.ph + p) * 0.7 * amp;
      L.sh.rotation.x = Math.max(0, Math.sin(e.ph + p + 1.2)) * 0.9 * amp + 0.05;
    });
    m.hips.position.y = m.hipY + Math.abs(c) * 0.06 * amp - (e.type === 'brute' ? 0.1 : 0);
    const lean = hunting ? 0.35 + (e.type === 'brute' ? 0.25 : 0) : 0.12;
    m.torso.rotation.x = lean + e.flinch * -0.4 + (e.mode === 'windcharge' ? 0.5 : 0);
    m.torso.rotation.y = s * 0.12 * amp;
    m.torso.rotation.z = Math.sin(t * 0.7 + e.ph * 0.1) * 0.06 + (e.type === 'husk' ? 0.1 : 0);
    m.head.rotation.x = -lean * 0.8 + tw * 0.4; m.head.rotation.z = 0.25 * Math.sin(t * 0.9) + tw;
    m.jaw.rotation.x = hunting ? 0.35 + Math.sin(t * 14) * 0.15 : 0.12 + Math.sin(t * 2) * 0.05;
    const atkT = e.atk > 0 ? 1 - e.atk / e.T.windup : 0;
    m.arms.forEach((a, i) => {
      if (atkT > 0) { a.up.rotation.x = -2.4 * Math.sin(atkT * Math.PI * 0.5) - (atkT > 0.85 ? -2 : 0); a.lo.rotation.x = -0.4; }
      else if (hunting) { a.up.rotation.x = -1.1 + Math.sin(e.ph * 2 + i * 2) * 0.4; a.lo.rotation.x = -0.5 + Math.sin(t * 9 + i) * 0.2; }
      else { a.up.rotation.x = -Math.sin(e.ph + i * Math.PI) * 0.4 * amp + 0.1; a.lo.rotation.x = -0.25; }
      a.up.rotation.z = a.sd * (0.15 + (e.type === 'brute' ? 0.2 : 0));
    });
    if (m.sac && !e.mode) m.sac.scale.set(1.2 + Math.sin(t * 3) * 0.06, 1, 1.1);
  }

  // a scare runner: sprints off into the dark ahead of you and is gone
  updateDecoy(e, dt) {
    const d = e.decoy; d.life -= dt;
    e.pos.x += d.dir.x * d.speed * dt; e.pos.z += d.dir.z * d.speed * dt;
    this.animate(e, dt, d.speed, 99);
    if (d.life <= 0 || !this.G.world.walkable(Math.floor(e.pos.x / C), Math.floor(e.pos.z / C))) this.vanish(e);
  }

  animDead(e, dt) {
    const m = e.m; e.deadT += dt;
    const k = Math.min(1, e.deadT / 0.55), ease = 1 - (1 - k) * (1 - k);
    const back = Math.cos(e.fallDir) > 0 ? 1 : -1;
    if (m.crawler) { m.body.rotation.z = ease * Math.PI * 0.9; m.legs.forEach((L) => (L.up.rotation.x = Math.sin(e.deadT * 30) * 0.3 * (1 - k))); }
    else {
      m.body.rotation.x = back * ease * Math.PI / 2 * 0.96;
      m.body.position.y = -ease * 0.05;
      m.legs.forEach((L) => (L.th.rotation.x *= 0.9));
      m.arms.forEach((a) => { a.up.rotation.x += (-0.5 - a.up.rotation.x) * 0.1; });
    }
    if (e.deadT > 0.55 && !e.pooled) { e.pooled = true; this.G.fx.bloodPool(e.pos, e.type === 'brute' ? 1.6 : 1); }
    if (e.keep) return;
    if (e.deadT > 9) { m.root.position.y -= dt * 0.15; }
    if (e.deadT > 13 && !e.gone) { m.root.visible = false; e.gone = true; this.group.remove(m.root); }
  }
}
