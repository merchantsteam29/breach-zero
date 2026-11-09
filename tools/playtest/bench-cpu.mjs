// game-logic cost per frame (no rendering): player, monsters, particles, on the busiest floor with everyone hunting
import { open } from './harness.mjs';
const { ev, sleep, done } = await open(import.meta.url);
await sleep(4000);
await ev(`__bz.G.settings.quality = 'medium'; __bz.start('normal', 2); __bz.G.god = true; return 1;`);
await sleep(1500);
console.log(await ev(`
  const G = __bz.G; __bz.pause(); G.state = 'play';
  for (const e of G.enemies.list) G.enemies.alert(e, true);
  const I = { keys: { KeyW: true }, dx: 3, dy: 0, locked: true };
  const t = (f) => { const t0 = performance.now(); for (let i = 0; i < 300; i++) f(); return ((performance.now() - t0) / 300).toFixed(3) + ' ms'; };
  const r = [];
  r.push('player ' + t(() => G.player.update(0.016, I)));
  r.push('enemies(' + G.enemies.list.length + ') ' + t(() => G.enemies.update(0.016)));
  r.push('fx ' + t(() => G.fx.update(0.016, G.camera, true)));
  G.state = 'pause';
  return r.join(' | ');`));
await done();
