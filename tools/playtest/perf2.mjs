// draw calls per frame on each floor (fps is meaningless in headless SwiftShader)
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
for (const f of [0, 1, 2]) {
  await ev(`__bz.G.settings.quality = 'low'; __bz.start('normal', ${f}); __bz.G.god = true; return 1;`);
  await sleep(2500);
  console.log('floor', f + 1, await ev(`const i = __bz.info(); return JSON.stringify({ calls: i.calls, tris: i.tris, enemies: i.enemies.length })`));
}
await done();
