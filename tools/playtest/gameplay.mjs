// Systems test: audio log, reload, medkit, getting hurt, dying, retry, pause, settings, quality switch, continue.
import { open } from './harness.mjs';
const { ev, sleep, shot, check, done } = await open(import.meta.url);
const info = async () => JSON.parse(await ev(`return JSON.stringify(__bz.info())`));
const key = (code, ms = 80) => ev(`dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' })), ${ms}); return 1;`);
const waitFor = async (js, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(js)) return true; await sleep(300); } return false; };
await sleep(4000);
await ev(`__bz.G.settings.quality = 'low'; __bz.start('normal'); return 1;`); await sleep(1500);

// audio log in the cryo room (3,5)
await ev(`__bz.tp(3, 4); __bz.G.player.pos.z += 1.6; __bz.look(Math.PI); return 1;`); await sleep(600);
await key('KeyE'); await sleep(1500);
check(await ev(`return !document.getElementById('hLog').hidden`), 'audio log opens');
await shot('01-log');
await key('KeyE'); await sleep(300);
check(await ev(`return document.getElementById('hLog').hidden`), 'audio log closes');
check((await ev(`return __bz.G.stats.found.length`)) === 1, 'log counted');

// reload
await ev(`__bz.G.player.ammo.pistol.mag = 2; return 1;`); await key('KeyR'); await waitFor(`return __bz.G.player.ammo.pistol.mag === 12`);
let i = await info(); check(i.ammo.pistol.mag === 12 && i.ammo.pistol.reserve === 26, 'reload fills mag from reserve ' + JSON.stringify(i.ammo.pistol));

// flashlight toggle
await key('KeyF'); await sleep(300); check((await ev(`return __bz.G.player.flashOn`)) === false, 'flashlight off');
await key('KeyF'); await sleep(300); check((await ev(`return __bz.G.player.flashOn`)) === true, 'flashlight on');

// get hurt by the corridor husk, then heal
await ev(`const e = __bz.nearest('husk'); const P = __bz.G.player; P.pos.set(e.pos.x + 1.2, 0, e.pos.z); __bz.G.enemies.alert(e, true); return 1;`);
for (let k = 0; k < 30 && (await info()).hp === 100; k++) await sleep(300);
i = await info(); check(i.hp < 100, 'husk hurts the player'); await shot('02-hurt');
const hpBefore = i.hp;
await ev(`__bz.G.god = true; __bz.tp(3, 3); return 1;`); await sleep(500);
await key('KeyQ'); await waitFor(`return __bz.G.player.healT <= 0 && __bz.G.player.hp > ${hpBefore}`);
i = await info(); check(i.hp > hpBefore, `medkit heals (${hpBefore} -> ${i.hp})`);
await ev(`__bz.G.god = false; return 1;`);

// death + retry
await ev(`__bz.G.player.damage(500, __bz.G.player.pos.clone().add({x:1,y:0,z:0})); return 1;`);
await waitFor(`return __bz.G.state === 'dead'`);
i = await info(); check(i.state === 'dead', 'death screen'); await shot('03-dead');
await ev(`document.getElementById('bRetry').click(); return 1;`); await sleep(1500);
i = await info(); check(i.state === 'play' && i.hp === 100, 'retry restores the checkpoint');

// pause + settings + quality swap
await ev(`__bz.pause(); return 1;`); await sleep(400);
check((await info()).state === 'pause', 'paused');
await ev(`document.getElementById('bPSettings').click(); const q = document.getElementById('sQual'); q.value = 'medium'; q.dispatchEvent(new Event('change')); return 1;`); await sleep(2000);
await shot('04-settings');
await ev(`document.querySelector('#sSettings [data-back]').click(); return 1;`); await sleep(300);
check(await ev(`return !document.getElementById('sPause').hidden`), 'back to pause menu');
await ev(`document.getElementById('bResume').click(); return 1;`); await sleep(800);
check((await info()).state === 'play', 'resumed');
await ev(`const q = __bz.G.settings; q.quality = 'low'; return 1;`);

// quit + continue
await ev(`document.getElementById('bQuit').click(); return 1;`); await sleep(1500);
await ev(`__bz.toTitle(); return 1;`); await sleep(1000);
check(await ev(`return !document.getElementById('bContinue').hidden`), 'continue offered');
await ev(`document.getElementById('bContinue').click(); return 1;`); await sleep(1500);
i = await info(); check(i.state === 'play' && i.floor === 0, 'continue works');
await done();
