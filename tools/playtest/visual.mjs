// Screenshots for eyeballing: viewmodels, a monster up close, each monster type, rooms.
import { open } from './harness.mjs';
const { ev, sleep, shot, done } = await open(import.meta.url);
await sleep(4000);
await ev(`__bz.G.settings.quality = 'medium'; __bz.start('normal'); __bz.G.god = true; return 1;`);
await sleep(2500);
await ev(`__bz.look(1.2, -0.05); return 1;`); await sleep(1200); await shot('01-cryo-pistol');
await ev(`__bz.I.rmb = true; return 1;`); await sleep(900); await shot('02-ads'); await ev(`__bz.I.rmb = false; return 1;`);
await ev(`__bz.G.player.reload(); __bz.G.player.ammo.pistol.mag = 3; __bz.G.player.reload(); return 1;`); await sleep(500); await shot('03-reload');
// a husk up close
await ev(`const e = __bz.nearest('husk'); __bz.G.enemies.passive = true; const P = __bz.G.player; P.pos.set(e.pos.x, 0, e.pos.z + 2.2); __bz.look(0, 0.05); e.state = 'idle'; e.yaw = 0; return 1;`);
await sleep(1500); await shot('04-husk-close');
// shotgun
await ev(`__bz.G.player.hasShotgun = true; __bz.G.player.switchTo('shotgun'); return 1;`); await sleep(1200); await shot('05-shotgun');
await ev(`__bz.fire(); return 1;`); await sleep(120); await shot('06-shotgun-fire');
// floor 2 monsters
for (const t of ['brute', 'spitter', 'crawler']) {
  await ev(`__bz.start('normal', 1); __bz.G.god = true; const e = __bz.nearest('${t}'); const P = __bz.G.player; P.pos.set(e.pos.x, 0, e.pos.z + 3.2); __bz.look(0, 0.1); return 1;`);
  await sleep(2500); await shot('07-' + t);
}
await done();
