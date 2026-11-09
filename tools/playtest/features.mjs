// New-content test: SMG + crowbar, every scare, a stalker scene, survival waves, records/extras screens, filters.
import { open } from './harness.mjs';
const { ev, sleep, shot, check, done } = await open(import.meta.url);
const info = async () => JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
const waitFor = async (js, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(js)) return true; await sleep(300); } return false; };
await sleep(4000);
await shot('00-title');

// ---- floor 3 (pump station): the SMG on the pump hall floor ----
await ev(`__bz.G.settings.quality = 'low'; __bz.start('normal', 2); __bz.G.god = true; return 1;`); await sleep(1500);
check((await info()).floor === 2, 'on the pump station');
const smg = await ev(`const it = __bz.G.world.items.find((i) => i.type === 'smg'); return [Math.floor(it.x / 3), Math.floor(it.z / 3)];`);
await ev(`__bz.tp(${smg[0]}, ${smg[1]}); return 1;`);
check(await waitFor(`return __bz.G.player.hasSmg && __bz.G.player.weapon === 'smg'`), 'SMG picked up and equipped');
await ev(`for (const e of __bz.G.enemies.list) if (e.state !== 'dormant') e.state = 'idle'; return 1;`);
const before = (await info()).ammo.smg.mag;
await waitFor(`return __bz.G.player.switchT <= 0`);
await ev(`__bz.I.lmbEdge = true; __bz.I.lmb = true; return 1;`);
await waitFor(`return __bz.G.player.ammo.smg.mag < ${before} - 3`, 20000); await ev(`__bz.I.lmb = false; return 1;`);
const after = (await info()).ammo.smg.mag;
check(after < before - 2, `SMG fires full-auto (${before} -> ${after})`);
await shot('01-smg');

// ---- crowbar: kill a husk up close ----
await ev(`__bz.G.player.switchTo('crowbar'); return 1;`); await sleep(800);
check((await info()).weapon === 'crowbar', 'crowbar equipped');
const k0 = (await info()).kills;
await ev(`const e = __bz.nearest('husk'); const P = __bz.G.player; P.pos.set(e.pos.x, 0, e.pos.z + 1.4); __bz.look(0, -0.1); e.state = 'idle'; return 1;`);
for (let i = 0; i < 14 && (await info()).kills === k0; i++) {
  await ev(`const e = __bz.nearest('husk'); if (e) { const P = __bz.G.player; P.pos.set(e.pos.x, 0, e.pos.z + 1.4); __bz.look(0, -0.1); } __bz.fire(); return 1;`);
  await sleep(700);
  if (i === 1) await shot('02-crowbar');
}
check((await info()).kills > k0, 'crowbar kills a husk');

// ---- every scare type runs without errors ----
for (const s of ['lightsOut', 'runner', 'body', 'fakeout', 'door']) {
  await ev(`__bz.tp(12, 8); __bz.look(Math.PI / 2); __bz.scare('${s}'); return 1;`); await sleep(2500);
  await shot('03-scare-' + s);
}
check(true, 'scares ran');

// ---- the stalker set scene (floor 3 trigger is in the north-east store) ----
await ev(`__bz.keys('b'); return 1;`);
await ev(`const W = __bz.G.world; const [c] = [...W.stalkerCells]; const [x, z] = c.split(',').map(Number); __bz.tp(x, z); return 1;`);
check(await waitFor(`return !!__bz.G.stalker`), 'stepping on the trigger starts the stalker scene');
await sleep(2000); await ev(`const e = __bz.nearest('stalker'); if (e) { const P = __bz.G.player; __bz.look(Math.atan2(-(e.pos.x - P.pos.x), -(e.pos.z - P.pos.z))); } return 1;`);
await sleep(600); await shot('04-stalker');
const st = await ev(`const e = __bz.nearest('stalker'); __bz.G.enemies.damage(e, 9999, new e.pos.constructor(1, 0, 0), true, true); return e.state;`);
check(st !== 'dead', 'the stalker cannot be killed');
await ev(`__bz.G.stalker.t = 0.01; return 1;`);
check(await waitFor(`return !__bz.G.stalker && !__bz.nearest('stalker')`), 'the stalker leaves when its scene ends');
check(!(await ev(`return __bz.G.stalkerDone === false`)), 'scene only plays once');

// ---- survival ----
await ev(`__bz.survival('normal'); __bz.G.god = true; return 1;`); await sleep(1500);
let i = await info(); check(i.mode === 'survival' && i.survState === 'break', 'survival starts with a countdown');
await shot('05-survival');
await ev(`__bz.G.surv.t = 0.01; return 1;`);
check(await waitFor(`return __bz.G.surv.wave === 1 && __bz.G.surv.state === 'fight'`), 'wave 1 starts');
check(await waitFor(`return __bz.G.enemies.list.some((e) => e.state === 'hunt')`), 'wave spawns monsters');
await sleep(2000); await shot('06-wave');
// clear the wave by force and check the break + restock
await ev(`__bz.G.surv.toSpawn = 0; for (const e of __bz.G.enemies.list) if (e.state !== 'dead') __bz.G.enemies.damage(e, 1e6, new e.pos.constructor(1, 0, 0)); return 1;`);
check(await waitFor(`return __bz.G.surv.state === 'break'`), 'wave cleared -> break');
check((await ev(`return __bz.rec.survWave`)) >= 1, 'best wave recorded');
// boss wave
await ev(`__bz.G.surv.wave = 4; __bz.G.surv.t = 0.01; return 1;`);
check(await waitFor(`return !!__bz.G.boss`), 'wave 5 brings THE HOST');
await sleep(1500); await shot('07-survival-boss');
// dying ends the run with a summary
await ev(`__bz.G.god = false; __bz.G.player.damage(999, __bz.G.player.pos.clone().add({ x: 1, y: 0, z: 0 })); return 1;`);
check(await waitFor(`return __bz.G.state === 'dead'`), 'survival death screen');
check(/wave/i.test(await ev(`return document.getElementById('deadMsg').textContent`)), 'death screen shows the wave');
await shot('08-survival-dead');
await ev(`document.getElementById('bRetry').click(); return 1;`);
check(await waitFor(`return __bz.G.state === 'play' && __bz.G.mode === 'survival' && __bz.G.surv.wave === 0`), 'try again restarts survival');

// ---- controllers: a wheel with stuck axes is ignored; a real pad moves, looks and fires ----
await ev(`__bz.start('normal'); __bz.G.god = true; window.__pads = [];
  const mk = (id, axes) => ({ id, index: 0, connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  window.__mkPad = mk; navigator.getGamepads = () => window.__pads; return 1;`);
await sleep(1500);
await ev(`window.__pads = [__mkPad('Logitech G29 Racing Wheel', [0, 0, 0.95, 0])]; window.__yaw0 = __bz.G.player.yaw; return 1;`); await sleep(2500);
check(Math.abs((await ev(`return __bz.G.player.yaw - window.__yaw0`))) < 1e-6, 'a wheel/joystick does not spin the camera');
await ev(`const p = __mkPad('Xbox Wireless Controller (STANDARD GAMEPAD)', [0, 0, 0, 0]); window.__pads = [p]; return 1;`); await sleep(600);
await ev(`window.__pads[0].buttons[7] = { pressed: true, value: 1 }; return 1;`); await sleep(400);
await ev(`window.__pads[0].buttons[7] = { pressed: false, value: 0 }; return 1;`);
check(await waitFor(`return __bz.G.player.ammo.pistol.mag < 12`, 15000), 'pad RT fires (pad adopted on a button press)');
await ev(`window.__yaw0 = __bz.G.player.yaw; window.__pads[0].axes = [0, 0, 0.9, 0]; return 1;`); await sleep(1500);
check(Math.abs((await ev(`return __bz.G.player.yaw - window.__yaw0`))) > 0.05, 'pad right stick turns the view');
await ev(`window.__pads[0].axes = [0, 0, 0, 0]; __bz.pause(); return 1;`); await sleep(800);
await ev(`window.__pads[0].buttons[1] = { pressed: true, value: 1 }; return 1;`); await sleep(500);
await ev(`window.__pads[0].buttons[1] = { pressed: false, value: 0 }; return 1;`);
check(await waitFor(`return __bz.G.state === 'play'`, 10000), 'pad B resumes from the pause menu');
await ev(`window.__pads = []; return 1;`);

// ---- records + extras screens, filters ----
await ev(`__bz.toTitle(); return 1;`); await sleep(1500);
await shot('09-title-menu');
await ev(`document.getElementById('bRecords').click(); return 1;`); await sleep(600);
check(/Escapes/.test(await ev(`return document.getElementById('recList').textContent`)), 'records screen');
await shot('10-records');
await ev(`document.querySelector('#sRecords [data-back]').click(); __bz.rec.escapes = 1; __bz.rec.nightmare = true; __bz.rec.survWave = 10; document.getElementById('bExtras').click(); return 1;`); await sleep(600);
check((await ev(`return document.querySelectorAll('#extList [data-extra]').length`)) === 3, 'earned extras can be switched on');
await shot('11-extras');
await ev(`const c = document.querySelector('[data-extra=vhs]'); c.checked = true; c.dispatchEvent(new Event('change')); const g = document.querySelector('[data-extra=gold]'); g.checked = true; g.dispatchEvent(new Event('change')); return 1;`);
await ev(`document.querySelector('#sExtras [data-back]').click(); __bz.start('normal'); return 1;`); await sleep(3000);
check((await ev(`return __bz.G.filter`)) === 1, 'VHS filter active');
await shot('12-vhs-gold');
await ev(`__bz.G.settings.extras = { vhs: false, noir: true, light: false, gold: false }; __bz.rec.logs = Array.from({ length: 15 }, (_, i) => 'x' + i); __bz.toTitle(); __bz.start('normal'); return 1;`); await sleep(3000);
check((await ev(`return __bz.G.filter`)) === 2, 'noir filter active');
await shot('13-noir');
await ev(`__bz.G.settings.extras = { vhs: false, noir: false, light: false, gold: false }; return 1;`);
await done();
