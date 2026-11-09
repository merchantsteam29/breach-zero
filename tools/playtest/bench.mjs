// deterministic render benchmark: fixed pose per floor, time N scene renders (GPU-synced)
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
const res = [];
for (const f of [0, 1, 2]) {
  await ev(`__bz.G.settings.quality = ${JSON.stringify(process.env.BZ_Q || 'medium')}; __bz.start('normal', ${f}); __bz.G.god = true; return 1;`);
  await sleep(1500);
  res.push(await ev(`
    const G = __bz.G; __bz.pause();
    const P = G.player; P.pos.set(G.world.start.x, 0, G.world.start.z); P.update(0.016, { keys: {}, dx: 0, dy: 0, locked: false });
    const r = G.renderer, gl = r.getContext(), px = new Uint8Array(4), out = [];
    for (const yaw of [0, 1.57, 3.14, 4.71]) {
      P.yaw = yaw; P.update(0.016, { keys: {}, dx: 0, dy: 0, locked: false });
      r.render(G.scene, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < 8; i++) { r.render(G.scene, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      out.push((performance.now() - t0) / 8);
    }
    return 'floor ${f + 1}: ' + out.map((x) => x.toFixed(1)).join(' / ') + ' ms  (avg ' + (out.reduce((a, b) => a + b) / 4).toFixed(1) + ')';`));
}
console.log(res.join('\n'));
await done();
