// Sanity check for the floor maps: equal row widths, closed outer walls, doors between two floor cells,
// and that every floor can be finished (keys reachable in order, lift reachable). Run: node tools/check-maps.mjs
import { FLOORS } from '../js/levels.js';

let bad = 0;
const err = (f, m) => { bad++; console.log(`floor ${f + 1}: ${m}`); };
const SOLID = new Set(['#', 'c', 't', 'o']);
const DOOR_KEY = { 1: 'b', 2: 'r', 3: 'y' };

FLOORS.forEach((F, fi) => {
  const m = F.map, H = m.length, W = m[0].length;
  m.forEach((r, y) => { if (r.length !== W) err(fi, `row ${y} is ${r.length} wide, expected ${W}`); });
  const at = (x, y) => (m[y] && m[y][x]) || '#';
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!'#X'.includes(at(x, y))) err(fi, `outer wall open at ${x},${y}`);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (at(x, y) !== '#') err(fi, `outer wall open at ${x},${y}`);
  let start, exit; const counts = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y); counts[c] = (counts[c] || 0) + 1;
    if (c === 'P') start = [x, y];
    if (c === 'X') exit = [x, y];
    if ('d123'.includes(c)) {
      const ew = !SOLID.has(at(x - 1, y)) && !SOLID.has(at(x + 1, y)) && at(x, y - 1) === '#' && at(x, y + 1) === '#';
      const ns = !SOLID.has(at(x, y - 1)) && !SOLID.has(at(x, y + 1)) && at(x - 1, y) === '#' && at(x + 1, y) === '#';
      if (!ew && !ns) err(fi, `door at ${x},${y} is not between two walls`);
    }
  }
  if (!start || !exit) err(fi, 'missing P or X');
  if ((counts.n || 0) !== F.notes.length) err(fi, `${counts.n || 0} logs on map but ${F.notes.length} texts`);
  // progressive flood fill
  const keys = new Set();
  let reach;
  for (let pass = 0; pass < 6; pass++) {
    reach = new Set([start.join()]); const q = [start];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, c = at(nx, ny), k = nx + ',' + ny;
        if (reach.has(k) || SOLID.has(c)) continue;
        if (DOOR_KEY[c] && !keys.has(DOOR_KEY[c])) continue;
        reach.add(k); q.push([nx, ny]);
      }
    }
    for (const k of reach) { const [x, y] = k.split(',').map(Number); if ('bry'.includes(at(x, y))) keys.add(at(x, y)); }
  }
  if (!reach.has(exit.join())) err(fi, 'lift not reachable');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (!SOLID.has(c) && !reach.has(x + ',' + y)) err(fi, `cell ${x},${y} '${c}' unreachable`);
  }
  console.log(`floor ${fi + 1} ${W}x${H}: keys ${[...keys].join('') || '-'}; ` + Object.entries(counts).filter(([c]) => !'#.'.includes(c)).map(([c, n]) => c + n).join(' '));
});
process.exit(bad ? 1 : 0);
