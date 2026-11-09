// Smoke test: title, start, look around each floor, shoot a monster, keycard ambush, finale, win.
// Run with the server up:  node serve.js  (port 8080)  then  node tools/playtest/smoke.mjs
import { open } from './harness.mjs';
const { ev, shot, sleep, check, done } = await open(import.meta.url);

await sleep(5000);
await shot('01-title');
await ev(`__bz.G.settings.quality = 'low';`);
await ev(`__bz.start('normal'); return 1;`);
await sleep(2500);
await shot('02-start');
let info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
console.log('start', JSON.stringify(info));
check(info.state === 'play', 'playing after start');

// walk forward, then fire
await ev(`__bz.I.keys.KeyW = true;`); await sleep(1200); await ev(`__bz.I.keys.KeyW = false;`);
await ev(`__bz.fire()`); await sleep(300); await shot('03-fire');

// corridor husk: face it and shoot it to death
await ev(`__bz.tp(4, 8); return 1;`); await sleep(400);
for (let i = 0; i < 12; i++) {
  await ev(`const e = __bz.nearest(); if (e) { const P = __bz.G.player; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z; __bz.look(Math.atan2(-dx, -dz), -0.05); } __bz.fire();`);
  await sleep(280);
  if (i === 3) await shot('04-combat');
}
info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
console.log('after combat', JSON.stringify(info));

// keycard ambush in the hall
await ev(`__bz.G.god = true; __bz.tp(22, 12); return 1;`); await sleep(1500);
await shot('05-ambush');
info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
check(info.keys.includes('b'), 'blue key taken');
console.log('ambush', JSON.stringify(info.enemies));

// blue door + lift
await ev(`__bz.tp(19, 12); __bz.look(Math.PI); return 1;`); await sleep(1500);
await shot('06-bluedoor');
await ev(`__bz.tp(18, 15); __bz.look(Math.PI); return 1;`); await sleep(1500);
await shot('07-lift');
await ev(`__bz.tp(18, 16); return 1;`); await sleep(4500);
info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
console.log('floor2', JSON.stringify(info));
check(info.floor === 1, 'reached floor 2');
await shot('08-floor2');
await ev(`__bz.tp(19, 12); __bz.look(-Math.PI/2); return 1;`); await sleep(1200);
await shot('09-brute-room');

// floor 3 + finale
await ev(`__bz.finishFloor(); return 1;`); await sleep(4000);
info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
check(info.floor === 2, 'reached floor 3');
await shot('10-floor3');
await ev(`__bz.keys('b','y'); __bz.tp(20, 13); __bz.look(Math.PI); return 1;`); await sleep(800);
await ev(`__bz.powerOn(); return 1;`); await sleep(4000);
await shot('11-finale');
await ev(`__bz.G.finale.t = 0.01; return 1;`); await sleep(2500);
info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
console.log('finale', JSON.stringify(info));
check(info.lift === true, 'lift arrived');
await ev(`__bz.tp(7, 19); __bz.look(Math.PI); return 1;`); await sleep(2000);
await ev(`__bz.tp(7, 20); return 1;`); await sleep(4000);
info = JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
check(info.state === 'win', 'won');
await shot('12-win');
await done();
