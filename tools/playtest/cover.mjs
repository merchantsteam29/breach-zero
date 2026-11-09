// Renders the title screen to cover.png (used by the Game Library). Run from the repo root with the server up.
import fs from 'fs';
import { open } from './harness.mjs';
const { ev, sleep, shot, done, outDir } = await open(import.meta.url);
await sleep(9000);
await ev(`document.querySelector('.foot').hidden = true; return 1;`);
await sleep(500);
await shot('cover');
fs.copyFileSync(outDir + '/cover.png', 'cover.png');
await done();
