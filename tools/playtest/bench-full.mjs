// full-frame benchmark (scene + viewmodel + bloom + post), fixed poses on each floor.
// BZ_URL picks the build (e.g. an older checkout served on another port) so two builds can be compared.
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
const res = [];
for (const f of [0, 1, 2]) {
  await ev(`__bz.G.settings.quality = 'medium'; __bz.start('normal', ${f}); __bz.G.god = true; return 1;`);
  await sleep(1500);
  res.push(await ev(`
    const G = __bz.G; __bz.pause(); const post = __bz.post();
    const P = G.player, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4), out = [];
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (const yaw of [0, 1.57, 3.14, 4.71]) {
      P.yaw = yaw; P.update(0.016, { keys: {}, dx: 0, dy: 0, locked: false });
      post.comp.render(); sync();
      const t0 = performance.now(); for (let i = 0; i < 5; i++) { post.comp.render(); sync(); } out.push((performance.now() - t0) / 5);
    }
    return out.reduce((a, b) => a + b) / 4;`));
}
console.log('avg ms/frame by floor:', res.map((x) => x.toFixed(0)).join(' / '), ' overall', (res.reduce((a, b) => a + b) / 3).toFixed(0));
await done();
