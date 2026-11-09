// what costs the most per frame? switch one thing off at a time and time the same view
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
await ev(`__bz.G.settings.quality = 'medium'; __bz.start('normal', 1); __bz.G.god = true; return 1;`);
await sleep(1500);
console.log(await ev(`
  const G = __bz.G, T = G.scene; __bz.pause();
  const P = G.player; P.yaw = 0; P.update(0.016, { keys: {}, dx: 0, dy: 0, locked: false });
  const r = G.renderer, gl = r.getContext(), px = new Uint8Array(4);
  const time = () => { r.render(T, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < 6; i++) { r.render(T, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return ((performance.now() - t0) / 6).toFixed(1); };
  const lines = [];
  lines.push('baseline ' + time());
  const pts = []; T.traverse((o) => { if (o.isPointLight) pts.push(o); });
  lines.push('point lights in scene: ' + pts.length);
  r.shadowMap.enabled = false; T.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  lines.push('no shadows ' + time());
  r.shadowMap.enabled = true; T.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  r.shadowMap.type = 1; T.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); // PCFShadowMap
  lines.push('PCF (not soft) shadows ' + time());
  r.shadowMap.type = 2; T.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  const keep = pts.slice(0, 4); for (const l of pts.slice(4)) l.visible = false;
  lines.push('only 4 point lights ' + time());
  for (const l of pts) l.visible = true;
  const bumps = []; T.traverse((o) => { if (o.material && o.material.bumpMap) { bumps.push([o.material, o.material.bumpMap]); o.material.bumpMap = null; o.material.needsUpdate = true; } });
  lines.push('no bump maps ' + time());
  for (const [m, b] of bumps) { m.bumpMap = b; m.needsUpdate = true; }
  G.player.light.map = null; lines.push('no cookie ' + time());
  r.setPixelRatio(0.5); lines.push('half res ' + time()); r.setPixelRatio(1);
  return lines.join(' | ');`));
await done();
