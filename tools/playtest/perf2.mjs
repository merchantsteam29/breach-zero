// draw calls / triangles per frame on each floor, at medium quality, plus a crowded finale.
// (fps is meaningless in headless SwiftShader; calls + tris are the useful numbers)
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
const info = () => ev(`const i = __bz.info(); return JSON.stringify({ fps: i.fps, calls: i.calls, tris: i.tris, enemies: i.enemies.filter((e) => e[1] !== 'dormant').length })`);
for (const f of [0, 1, 2]) {
  await ev(`__bz.G.settings.quality = 'medium'; __bz.start('normal', ${f}); __bz.G.god = true; return 1;`);
  await sleep(6000);
  console.log('floor', f + 1, await info());
}
// finale: power on and let the waves pile up around the player
await ev(`__bz.keys('y'); __bz.powerOn(); return 1;`);
for (let i = 0; i < 60; i++) { const n = await ev(`return __bz.G.enemies.list.filter((e) => e.state === 'hunt').length`); if (n >= 8) break; await sleep(1000); }
console.log('finale', await info());
await done();
