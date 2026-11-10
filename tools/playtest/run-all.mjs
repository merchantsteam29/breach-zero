// Starts serve.js on a free port and runs the playtests in order: node tools/playtest/run-all.mjs [names]
// Must run from a normal terminal (headless Chrome), e.g. PowerShell on Windows.
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['smoke', 'gameplay', 'features', 'visual', 'install'];
const port = 8100 + Math.floor(Math.random() * 400);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
let failed = 0;
for (const n of names) {
  console.log(`\n=== ${n}`);
  const r = spawnSync(process.execPath, [path.join(here, n + '.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, BZ_URL: `http://localhost:${port}/`, BZ_QUERY: '&noaudio' } });
  if (r.status) failed++;
}
srv.kill();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);
