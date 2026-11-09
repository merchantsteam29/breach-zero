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
// new weapons up close
await ev(`__bz.start('normal'); __bz.G.god = true; const P = __bz.G.player; P.hasSmg = true; P.switchTo('smg'); __bz.tp(3, 3); __bz.look(Math.PI); return 1;`); await sleep(2500); await shot('08-smg');
await ev(`__bz.G.player.switchTo('crowbar'); return 1;`); await sleep(2500); await shot('09-crowbar');
await ev(`__bz.melee(); return 1;`); await sleep(500); await shot('10-crowbar-swing');
// the stalker and THE HOST, lit by the flashlight from a few metres away
for (const [t, d, pitch] of [['stalker', 3.6, 0.25], ['host', 5.5, 0.3]]) {
  await ev(`__bz.start('normal', 4); __bz.G.god = true; for (const e of __bz.G.enemies.list) __bz.G.enemies.vanish(e);
    const P = __bz.G.player; __bz.tp(20, 12); const e = __bz.G.enemies.spawn('${t}', P.pos.x, P.pos.z - ${d}); __bz.G.enemies.passive = true; e.state = 'idle'; e.T = { ...e.T, walk: 0, run: 0 };
    __bz.look(0, ${pitch}); return 1;`);
  await sleep(2500); await shot('11-' + t);
}
await done();
