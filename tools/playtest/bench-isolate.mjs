// what costs the most per frame? switch one thing off at a time and time the same view.
// Times are ms per frame in headless SwiftShader: compare them with each other, not with real GPUs.
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
await ev(`__bz.G.settings.quality = 'medium'; __bz.start('normal', 1); __bz.G.god = true; return 1;`);
await sleep(1500);
console.log(await ev(`
  const G = __bz.G, T = G.scene, THREE_ = null; __bz.pause();
  const P = G.player; P.yaw = 0; P.update(0.016, { keys: {}, dx: 0, dy: 0, locked: false });
  const r = G.renderer, gl = r.getContext(), px = new Uint8Array(4), post = __bz.post();
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const time = (f) => { f(); sync(); const t0 = performance.now(); for (let i = 0; i < 6; i++) { f(); sync(); } return ((performance.now() - t0) / 6).toFixed(1); };
  const scene = () => r.render(T, G.camera), full = () => post.comp.render();
  const L = [];
  L.push('full frame ' + time(full));
  L.push('scene only ' + time(scene));
  if (post.bloom) { post.bloom.enabled = false; L.push('full, no bloom ' + time(full)); post.bloom.enabled = true; }
  for (const l of __bz.pool()) l.visible = false; L.push('scene, no lamp lights ' + time(scene)); for (const l of __bz.pool()) l.visible = true;
  G.player.fill.visible = false; G.player.muzzle.visible = false; L.push('scene, no fill/muzzle ' + time(scene)); G.player.fill.visible = true; G.player.muzzle.visible = true;
  const saved = [];
  T.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) { const m = o.material; if (!m._lam) { m._lam = new m.constructor.prototype.constructor === null ? null : null; } } });
  return L.join(' | ');`));
await done();
