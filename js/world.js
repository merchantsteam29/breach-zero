// Builds one floor from its ASCII map: geometry, doors, lamps, props, items and spawn points,
// plus the collision / line-of-sight / bullet queries everything else uses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { mergeChildren } from './merge.js';

export const C = 3;      // cell size (m)
export const H = 3.2;    // ceiling height (m)
const KEYCOL = { b: 0x2f7bff, r: 0xff2a2a, y: 0xffc21a };
const DOORKEY = { 1: 'b', 2: 'r', 3: 'y' };
export const KEYNAME = { b: 'BLUE', r: 'RED', y: 'YELLOW' };
const ENEMY = { w: 'husk', f: 'crawler', B: 'brute', S: 'spitter', W: 'husk', F: 'crawler', U: 'brute', Z: 'spitter' };

let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = { floor: T.floorTex(), wall: T.wallTex(), ceil: T.ceilTex(), crate: T.crateTex(), blood: T.bloodTex(),
    doorD: T.doorTex('#6d7a3a'), door1: T.doorTex('#1f4ea8'), door2: T.doorTex('#8a1c1c'), door3: T.doorTex('#a5800f'), lift: T.doorTex('#9a7a10') };
  return TEX;
}

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function buildWorld(scene, fi, F) {
  const tx = textures();
  seed = 1234 + fi * 777;
  const grid = F.map.map((r) => r.split(''));
  const W = grid[0].length, D = grid.length;
  const group = new THREE.Group(); group.name = 'level'; scene.add(group);
  const at = (x, z) => (grid[z] && grid[z][x]) || '#';
  const cx = (x) => x * C + C / 2;

  const world = {
    fi, F, grid, W, D, group, doors: [], items: [], fixtures: [], spawns: [], waveSpots: [], obst: new Map(),
    start: null, exit: null, power: null, liftOpen: fi < 2, notesTaken: 0, dynamic: [],
  };

  // ---------- materials ----------
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: tx.wall, bumpMap: tx.wall, bumpScale: 1.5, roughness: 0.8, metalness: 0.05 }),
    floor: new THREE.MeshStandardMaterial({ map: tx.floor, bumpMap: tx.floor, bumpScale: 1, roughness: 0.55, metalness: 0 }),
    ceil: new THREE.MeshStandardMaterial({ map: tx.ceil, roughness: 0.95, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3f42, roughness: 0.45, metalness: 0.8 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1d2022, roughness: 0.6, metalness: 0.7 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x5b4a32, roughness: 0.55, metalness: 0.7 }),
    crate: new THREE.MeshStandardMaterial({ map: tx.crate, roughness: 0.8, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd8e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
    fluid: (() => { const t = T.fluidTex(); return new THREE.MeshStandardMaterial({ color: 0x2a6a6a, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.15, transparent: true, opacity: 0.6, depthWrite: false }); })(),
    body: new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.9 }),
    screen: (() => { const t = T.screenTex('#3be07a'); return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.8, roughness: 0.2 }); })(),
    screenRed: (() => { const t = T.screenTex('#e04a3b'); return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.8, roughness: 0.2 }); })(),
    paper: new THREE.MeshStandardMaterial({ color: 0xb8b2a2, roughness: 0.95 }),
    beaker: new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x44ff66, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }),
    blood: new THREE.MeshStandardMaterial({ map: tx.blood, transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  world.materials = M;
  for (const m of [M.wall, M.floor]) m.userData.bump = m.bumpMap;

  // static geometry batches, merged per material and per map chunk at the end. Chunks let
  // three.js frustum-cull (and depth-sort) the parts of the floor you cannot see.
  const batches = new Map(), CHUNK = C * 10;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  function add(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s);
    const g = geo.clone().applyMatrix4(_m);
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let byChunk = batches.get(mat); if (!byChunk) batches.set(mat, byChunk = new Map());
    if (!byChunk.has(k)) byChunk.set(k, []);
    byChunk.get(k).push(g.index ? g.toNonIndexed() : g);
  }
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cyl6: new THREE.CylinderGeometry(1, 1, 1, 8),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  // strip uv2/normals mismatch: all of these have position/normal/uv, so merges are compatible

  // ---------- walls ----------
  const wallCells = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (at(x, z) !== '#') continue;
    let edge = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const c = at(x + dx, z + dz); if (c !== '#' && !(x + dx < 0 || z + dz < 0 || x + dx >= W || z + dz >= D)) edge = true; }
    if (edge) wallCells.push([x, z]);
  }
  // only the wall faces that border open floor (no tops, no faces buried between blocks)
  const wallFace = new THREE.PlaneGeometry(C, H);
  for (const [x, z] of wallCells) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D || at(nx, nz) === '#') continue;
      add(wallFace, M.wall, cx(x) + dx * C / 2, H / 2, cx(z) + dz * C / 2, Math.atan2(dx, dz));
    }
  }

  // floor + ceiling
  tx.floor.repeat.set(W / 2, D / 2); tx.ceil.repeat.set(W, D);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W * C, D * C), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(W * C / 2, 0, D * C / 2); fl.receiveShadow = true; group.add(fl);
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(W * C, D * C), M.ceil); cl.rotation.x = Math.PI / 2; cl.position.set(W * C / 2, H, D * C / 2); cl.receiveShadow = true; group.add(cl);

  // skirting trim along walls, wall pipes, terminals
  const floorAt = (x, z) => !'#'.includes(at(x, z)) && at(x, z) !== 'X';
  for (const [x, z] of wallCells) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!floorAt(x + dx, z + dz) || '123d'.includes(at(x + dx, z + dz))) continue;
      const fx = cx(x) + dx * C / 2, fz = cx(z) + dz * C / 2, ry = Math.atan2(dx, dz);
      const r = rnd();
      if (r < 0.16) { // pipe pair
        const off = (rnd() - 0.5) * 1.6;
        const px = fx + dx * 0.15 + (dz !== 0 ? off : 0), pz = fz + dz * 0.15 + (dx !== 0 ? off : 0);
        add(G.cyl6, M.pipe, px, H / 2, pz, 0, 0, 0, 0.07, H, 0.07);
        add(G.cyl6, M.pipe, px + (dz !== 0 ? 0.22 : 0), H / 2, pz + (dx !== 0 ? 0.22 : 0), 0, 0, 0, 0.05, H, 0.05);
      } else if (r < 0.24) { // terminal with a glowing screen
        add(G.box, M.darkMetal, fx + dx * 0.08, 1.35, fz + dz * 0.08, ry, 0, 0, 0.9, 0.6, 0.16);
        add(G.plane, rnd() < 0.3 ? M.screenRed : M.screen, fx + dx * 0.165, 1.37, fz + dz * 0.165, ry, 0, 0, 0.72, 0.42, 1);
      } else if (r < 0.32) { // fuse box
        add(G.box, M.metal, fx + dx * 0.1, 1.6, fz + dz * 0.1, ry, 0, 0, 0.5, 0.7, 0.2);
      }
      // cable tray near the ceiling
      if (rnd() < 0.5) add(G.box, M.darkMetal, fx + dx * 0.2, H - 0.25, fz + dz * 0.2, ry, 0, 0, C, 0.08, 0.35);
    }
  }

  // ---------- cells ----------
  const lampGeo = new THREE.BoxGeometry(1.3, 0.07, 0.32);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const c = at(x, z), X = cx(x), Z = cx(z);
    if (c === 'P') world.start = { x: X, z: Z };
    else if (c === '*') world.waveSpots.push({ x: X, z: Z });
    else if (c === 'c') {
      const h = 0.95, s = 1.7, ry = (rnd() - 0.5) * 0.3;
      add(G.box, M.crate, X, h / 2, Z, ry, 0, 0, s, h, s);
      world.obst.set(x + ',' + z, { x0: X - s / 2, x1: X + s / 2, z0: Z - s / 2, z1: Z + s / 2, h });
    } else if (c === 't') {
      const along = floorAt(x - 1, z) && floorAt(x + 1, z) ? 0 : Math.PI / 2;
      const lx = along ? 1.0 : 2.4, lz = along ? 2.4 : 1.0;
      add(G.box, M.metal, X, 0.9, Z, 0, 0, 0, lx, 0.06, lz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(G.box, M.darkMetal, X + sx * (lx / 2 - 0.08), 0.45, Z + sz * (lz / 2 - 0.08), 0, 0, 0, 0.06, 0.9, 0.06);
      for (let i = 0; i < 3; i++) if (rnd() < 0.6) add(G.cyl, M.beaker, X + (rnd() - 0.5) * lx * 0.7, 1.0, Z + (rnd() - 0.5) * lz * 0.7, 0, 0, 0, 0.05, 0.16, 0.05);
      if (rnd() < 0.7) add(G.plane, M.paper, X + (rnd() - 0.5) * 0.5, 0.935, Z + (rnd() - 0.5) * 0.5, rnd() * 3, -Math.PI / 2, 0, 0.22, 0.3, 1);
      world.obst.set(x + ',' + z, { x0: X - lx / 2, x1: X + lx / 2, z0: Z - lz / 2, z1: Z + lz / 2, h: 0.95 });
    } else if (c === 'o') {
      add(G.cyl, M.metal, X, 0.15, Z, 0, 0, 0, 0.85, 0.3, 0.85);
      add(G.cyl, M.metal, X, H - 0.2, Z, 0, 0, 0, 0.85, 0.4, 0.85);
      const broken = rnd() < 0.35;
      if (!broken) { add(G.cyl, M.glass, X, H / 2, Z, 0, 0, 0, 0.72, H - 0.7, 0.72); add(G.cyl, M.fluid, X, H / 2 - 0.2, Z, 0, 0, 0, 0.66, H - 1.2, 0.66); }
      if (!broken && rnd() < 0.7) { // something floating inside
        add(G.cyl6, M.body, X, 1.4, Z, 0, 0, 0.1, 0.18, 1.0, 0.14);
        add(G.cyl6, M.body, X, 2.05, Z, 0, 0, 0, 0.12, 0.25, 0.12);
      }
      if (broken) for (let i = 0; i < 6; i++) add(G.box, M.glass, X + (rnd() - 0.5) * 2, 0.02, Z + (rnd() - 0.5) * 2, rnd() * 3, 0, 0, 0.2 + rnd() * 0.3, 0.02, 0.1 + rnd() * 0.2);
      world.obst.set(x + ',' + z, { x0: X - 0.85, x1: X + 0.85, z0: Z - 0.85, z1: Z + 0.85, h: 99 });
    } else if (c === '~') {
      add(G.plane, M.blood, X + (rnd() - 0.5), 0.012, Z + (rnd() - 0.5), rnd() * 6, -Math.PI / 2, 0, 1.8 + rnd(), 1.8 + rnd(), 1);
      add(G.plane, M.blood, X + (rnd() - 0.5) * 2, 0.013, Z + (rnd() - 0.5) * 2, rnd() * 6, -Math.PI / 2, 0, 0.7, 0.7, 1);
    }
    if ('LEk'.includes(c)) {
      const kind = c;
      const color = kind === 'E' ? 0xff2614 : kind === 'k' ? 0xbfd8ff : 0xd6e4ff;
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.2 });
      const lamp = new THREE.Mesh(lampGeo, mat); lamp.position.set(X, H - 0.05, Z);
      lamp.rotation.y = floorAt(x - 1, z) && floorAt(x + 1, z) ? 0 : Math.PI / 2; group.add(lamp);
      add(G.box, M.darkMetal, X, H - 0.02, Z, lamp.rotation.y, 0, 0, 1.45, 0.05, 0.42);
      world.fixtures.push({ pos: new THREE.Vector3(X, H - 0.2, Z), color, kind, mat, base: kind === 'E' ? 9 : kind === 'k' ? 12 : 15, ph: rnd() * 100, on: 1, dark: 0 });
    }
    if (ENEMY[c]) world.spawns.push({ type: ENEMY[c], x: X, z: Z, dormant: c === c.toUpperCase() && c !== 'B' && c !== 'S' });
    if ('bry'.includes(c)) addItem(world, 'key', X, Z, c);
    if (c === 'a') addItem(world, 'ammo', X, Z);
    if (c === 's') addItem(world, 'shells', X, Z);
    if (c === 'h') addItem(world, 'medkit', X, Z);
    if (c === 'g') addItem(world, 'shotgun', X, Z);
    if (c === 'n') addItem(world, 'note', X, Z, world.items.filter((i) => i.type === 'note').length);
    if (c === 'V') { world.power = buildSwitch(world, X, Z); world.obst.set(x + ',' + z, { x0: X - 0.45, x1: X + 0.45, z0: Z - 0.45, z1: Z + 0.45, h: 99 }); }
    if ('d123'.includes(c)) world.doors.push(buildDoor(world, x, z, c));
    if (c === 'X') world.exit = buildLift(world, x, z);
    // scattered paper + floor grates
    if (c === '.' && rnd() < 0.08) add(G.plane, M.paper, X + (rnd() - 0.5) * 2, 0.01, Z + (rnd() - 0.5) * 2, rnd() * 6, -Math.PI / 2, 0, 0.22, 0.3, 1);
    if (c === '.' && rnd() < 0.05) add(G.box, M.darkMetal, X, 0.005, Z, 0, 0, 0, 1, 0.01, 1);
  }

  // wall-mounted signs
  const signs = [[`${F.name}`, '#c9d2cf'], ['BIOHAZARD', '#d8b23a'], ['NO ENTRY', '#d04a3a'], ['EVAC ROUTE', '#4ad08a']];
  for (let i = 0; i < 5; i++) {
    const [x, z] = wallCells[Math.floor(rnd() * wallCells.length)];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!floorAt(x + dx, z + dz) || '123dX'.includes(at(x + dx, z + dz))) continue;
      const [t, col] = signs[i % signs.length];
      const st = T.signTex(t, col);
      const s = new THREE.Mesh(G.plane, new THREE.MeshStandardMaterial({ map: st, roughness: 0.6, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.06 }));
      s.scale.set(1.4, 0.35, 1); s.position.set(cx(x) + dx * (C / 2 + 0.01), 2.1, cx(z) + dz * (C / 2 + 0.01)); s.rotation.y = Math.atan2(dx, dz); group.add(s); break;
    }
  }

  // merge batches
  // (wall faces are one-sided quads seen from the lit side, so they would add nothing to the
  // flashlight's shadow map: skip them there)
  for (const [mat, byChunk] of batches) for (const list of byChunk.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
    mesh.castShadow = !mat.transparent && mat !== M.wall; mesh.receiveShadow = true; group.add(mesh);
  }

  // ---------- queries ----------
  world.cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];
  world.doorAt = (x, z) => world.doorMap.get(x + ',' + z);
  world.doorMap = new Map(world.doors.map((d) => [d.cx + ',' + d.cz, d]));
  world.isWall = (x, z) => { const c = at(x, z); if (c === '#') return true; if (c === 'X') return !world.exit.open; return false; };
  // enemy pathing: not walls, not locked doors, not props
  world.walkable = (x, z) => {
    const c = at(x, z);
    if (c === '#' || c === 'X' || c === 'c' || c === 't' || c === 'o' || c === 'V') return false;
    const d = world.doorAt(x, z); if (d && d.locked) return false;
    return x >= 0 && z >= 0 && x < W && z < D;
  };
  // boxes that block a circle at this cell
  world.boxesAt = (x, z, out) => {
    const c = at(x, z);
    if (c === '#' || (c === 'X' && !world.exit.open)) { out.push({ x0: x * C, x1: x * C + C, z0: z * C, z1: z * C + C, h: 99 }); return; }
    const o = world.obst.get(x + ',' + z); if (o) out.push(o);
    const d = world.doorAt(x, z);
    if (d && d.open < 0.85) out.push(d.slab);
  };
  const boxes = [];
  // push a circle out of everything it overlaps; returns ground height under it
  world.collide = (pos, r, feet) => {
    let ground = 0;
    const [gx, gz] = world.cellOf(pos.x, pos.z);
    for (let k = 0; k < 2; k++) {
      boxes.length = 0;
      for (let z = gz - 1; z <= gz + 1; z++) for (let x = gx - 1; x <= gx + 1; x++) world.boxesAt(x, z, boxes);
      for (const b of boxes) {
        const nx = Math.max(b.x0, Math.min(pos.x, b.x1)), nz = Math.max(b.z0, Math.min(pos.z, b.z1));
        const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (feet >= b.h - 0.05) { ground = Math.max(ground, b.h); continue; }
        if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (r - d) / d; pos.x += dx * p; pos.z += dz * p; }
        else { // centre inside the box: push out along the shortest axis
          const l = pos.x - b.x0, rr = b.x1 - pos.x, u = pos.z - b.z0, dd = b.z1 - pos.z, m = Math.min(l, rr, u, dd);
          if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === u) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        }
      }
    }
    return ground;
  };
  // sight line: walls and closed doors block, props do not
  world.los = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.ceil(len / 0.3);
    for (let i = 1; i < n; i++) {
      const x = ax + dx * i / n, z = az + dz * i / n, gx = Math.floor(x / C), gz = Math.floor(z / C), c = at(gx, gz);
      if (c === '#' || c === 'X') return false;
      const d = world.doorAt(gx, gz); if (d && d.open < 0.5) {
        const s = d.slab; if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return false;
      }
    }
    return true;
  };
  // bullet ray: returns { dist, normal } of the first wall / prop / floor / ceiling / door hit
  const solidPoint = (x, y, z) => {
    if (y <= 0) return 1; if (y >= H) return 2;
    const gx = Math.floor(x / C), gz = Math.floor(z / C), c = at(gx, gz);
    if (c === '#' || (c === 'X' && !world.exit.open)) return 3;
    const o = world.obst.get(gx + ',' + gz); if (o && y < Math.min(o.h, H) && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return 4;
    const d = world.doorAt(gx, gz); if (d && d.open < 0.85) { const s = d.slab; if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return 5; }
    return 0;
  };
  world.raycast = (o, dir, max = 80) => {
    const step = 0.12; let t = 0, px = o.x, py = o.y, pz = o.z;
    while (t < max) {
      t += step; const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
      const s = solidPoint(x, y, z);
      if (s) {
        // refine
        let a = t - step, b = t;
        for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (solidPoint(o.x + dir.x * m, o.y + dir.y * m, o.z + dir.z * m)) b = m; else a = m; }
        const hx = o.x + dir.x * a, hy = o.y + dir.y * a, hz = o.z + dir.z * a;
        let normal;
        if (s === 1) normal = new THREE.Vector3(0, 1, 0);
        else if (s === 2) normal = new THREE.Vector3(0, -1, 0);
        else {
          // which axis did we cross?
          const e = 0.02;
          if (solidPoint(hx + dir.x * 0.08, hy, hz) && !solidPoint(hx, hy, hz + dir.z * 0.08)) normal = new THREE.Vector3(-Math.sign(dir.x), 0, 0);
          else if (solidPoint(hx, hy, hz + dir.z * 0.08)) normal = new THREE.Vector3(0, 0, -Math.sign(dir.z));
          else if (s === 4 && solidPoint(hx, hy + dir.y * 0.08 - e, hz)) normal = new THREE.Vector3(0, 1, 0);
          else normal = new THREE.Vector3(-Math.sign(dir.x), 0, 0);
        }
        return { dist: a, point: new THREE.Vector3(hx, hy, hz), normal, kind: s };
      }
      px = x; py = y; pz = z;
    }
    return { dist: max, point: null, normal: null, kind: 0 };
  };

  return world;
}

// ---------- doors ----------
function buildDoor(world, x, z, c) {
  const tx = textures(), X = x * C + C / 2, Z = z * C + C / 2;
  const at = (a, b) => (world.grid[b] && world.grid[b][a]) || '#';
  const ns = at(x - 1, z) === '#' && at(x + 1, z) === '#'; // passage runs north-south -> panel spans x
  const g = new THREE.Group(); g.position.set(X, 0, Z); if (!ns) g.rotation.y = Math.PI / 2; world.group.add(g);
  const mat = new THREE.MeshStandardMaterial({ map: tx['door' + (c === 'd' ? 'D' : c)], roughness: 0.55, metalness: 0.6 });
  const halves = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(C / 2, H, 0.22), mat); p.position.set(s * C / 4, H / 2, 0); p.castShadow = p.receiveShadow = true; g.add(p); halves.push(p);
  }
  // frame + status light
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.5, metalness: 0.8 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(C, 0.3, 0.5), frameMat); top.position.y = H - 0.15; g.add(top);
  const keyed = DOORKEY[c];
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: keyed ? KEYCOL[keyed] : 0x33ff66, emissiveIntensity: 2 });
  for (const sd of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), lightMat); l.position.set(0, H - 0.42, sd * 0.27); g.add(l); }
  // keypad panel beside the door (on the wall)
  const padMat = keyed && new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: KEYCOL[keyed], emissiveIntensity: 0.5 });
  if (keyed) for (const sd of [-1, 1]) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.06), padMat);
    k.position.set(C / 2 + 0.35, 1.3, sd * (C / 2 + 0.035)); g.add(k);
  }
  mergeChildren(g, new Set(halves));
  const t = 0.3;
  const slab = ns ? { x0: X - C / 2, x1: X + C / 2, z0: Z - t, z1: Z + t, h: 99 } : { x0: X - t, x1: X + t, z0: Z - C / 2, z1: Z + C / 2, h: 99 };
  return { cx: x, cz: z, x: X, z: Z, key: keyed || null, locked: !!keyed, open: 0, target: 0, halves, lightMat, slab, g, ns, denyT: 0 };
}

export function unlockDoor(d) { d.locked = false; d.lightMat.emissive.setHex(0x33ff66); }

function buildLift(world, x, z) {
  const tx = textures(), X = x * C + C / 2, Z = z * C + C / 2;
  // which side faces the floor?
  const at = (a, b) => (world.grid[b] && world.grid[b][a]) || '#';
  let fx = 0, fz = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!'#X'.includes(at(x + dx, z + dz))) { fx = dx; fz = dz; }
  const g = new THREE.Group(); g.position.set(X, 0, Z); g.rotation.y = Math.atan2(fx, fz); world.group.add(g);
  // car interior (back + sides), lit
  const inner = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.4, metalness: 0.8 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(C, H, 0.1), inner); back.position.set(0, H / 2, -C / 2 + 0.05); g.add(back);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, C), inner); w.position.set(s * (C / 2 - 0.05), H / 2, 0); g.add(w); }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.6), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe9c0, emissiveIntensity: 0.7 })); lamp.position.y = H - 0.05; g.add(lamp);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(C, 0.05, C), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.7 })); fl.position.y = 0.02; g.add(fl);
  const mat = new THREE.MeshStandardMaterial({ map: tx.lift, roughness: 0.45, metalness: 0.7 });
  const halves = [];
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(C / 2, H, 0.2), mat); p.position.set(s * C / 4, H / 2, C / 2 - 0.1); p.castShadow = true; g.add(p); halves.push(p); }
  const ind = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3322, emissiveIntensity: 2 });
  const il = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.05), ind); il.position.set(0, H - 0.25, C / 2 + 0.03); g.add(il);
  mergeChildren(g, new Set(halves));
  world.fixtures.push({ pos: new THREE.Vector3(X, H - 0.6, Z), color: 0xffe0b0, kind: 'lift', mat: lamp.material, base: 4, ph: 0, on: 1, dark: 0 });
  return { cx: x, cz: z, x: X, z: Z, fx, fz, front: { x: X + fx * C, z: Z + fz * C }, open: false, amt: 0, halves, ind };
}

function buildSwitch(world, X, Z) {
  const g = new THREE.Group(); g.position.set(X, 0, Z); world.group.add(g);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), world.materials.darkMetal); base.position.y = 0.6; base.castShadow = true; g.add(base);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x100505, emissive: 0xff2b1a, emissiveIntensity: 1.2 }));
  panel.position.set(0, 1.0, 0.46); g.add(panel);
  const lever = new THREE.Group(); lever.position.set(0, 1.25, 0); g.add(lever);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), world.materials.metal); arm.position.y = 0.3; lever.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x881111, roughness: 0.4 })); knob.position.y = 0.6; lever.add(knob);
  lever.rotation.x = -0.7;
  // conduit up to ceiling
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H - 1.2, 8), world.materials.pipe); c.position.y = 1.2 + (H - 1.2) / 2; g.add(c);
  return { x: X, z: Z, on: false, lever, panel };
}

// ---------- items ----------
const itemGeo = {};
function addItem(world, type, X, Z, extra) {
  const g = new THREE.Group(); g.position.set(X, 0, Z);
  let bob = true, y = 0.35;
  if (type === 'key') {
    const col = KEYCOL[extra];
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.19, 0.015), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.3 }));
    g.add(card);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.32; g.add(halo);
    y = 1.0;
  } else if (type === 'ammo' || type === 'shells') {
    const col = type === 'ammo' ? 0xb89a2a : 0xa52a1a;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: 0x2d332a, roughness: 0.7, metalness: 0.4 })); g.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.06, 0.27), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5 })); g.add(s);
    y = 0.12; bob = false;
  } else if (type === 'medkit') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0xdedad0, roughness: 0.5, emissive: 0x222222 })); g.add(b);
    const cross = new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0xff1a1a, emissiveIntensity: 0.9 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.06), cross), c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.2), cross);
    g.add(c1, c2); y = 0.13; bob = false;
  } else if (type === 'shotgun') {
    const m = new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.4, metalness: 0.8 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), m); b.rotation.z = Math.PI / 2; g.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.7 })); s.position.set(-0.55, -0.03, 0); g.add(s);
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.5; g.add(glow);
    y = 0.6;
  } else if (type === 'note') {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), world.materials.darkMetal); stand.position.y = -0.55 + 0.4 - 0.15; g.add(stand);
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.13), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 })); g.add(rec);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1100, emissiveIntensity: 3 })); led.position.set(0.07, 0.035, 0.03); g.add(led);
    g.userData.led = led; y = 0.68; bob = false;
    world.obst.set(Math.floor(X / C) + ',' + Math.floor(Z / C), { x0: X - 0.25, x1: X + 0.25, z0: Z - 0.25, z1: Z + 0.25, h: 0.65 });
  }
  g.position.y = y; g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  world.group.add(g);
  world.items.push({ type, x: X, z: Z, y, mesh: g, taken: false, bob, extra });
}
