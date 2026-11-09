// Shared headless-Chrome harness for the BREACH: ZERO playtests.
// Each test does:  const { ev, shot, sleep, ... } = await open(import.meta.url[, { mobile: true }]);
// and ends with:   await done();
// The game is loaded with ?test so it exposes window.__bz (see the end of main.js).
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open(metaUrl, { mobile = false, size = null } = {}) {
  if (!CHROME) throw new Error('Chrome not found: set the CHROME environment variable');
  const name = path.basename(fileURLToPath(metaUrl), '.mjs');
  const url = (process.env.BZ_URL || 'http://localhost:8080/') + '?test' + (process.env.BZ_QUERY || '');
  const outDir = path.join(process.env.BZ_SHOTS || path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots'), name);
  fs.mkdirSync(outDir, { recursive: true });

  const [w, h] = size || (mobile ? [844, 390] : [1280, 720]);
  const port = 9400 + Math.floor(Math.random() * 500);
  const prof = path.join(os.tmpdir(), 'bz-test-' + port);
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--window-size=${w},${h}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

  let targets;
  for (let i = 0; i < 150; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0; const pending = new Map(); const errs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push(`EXC ${d.exception?.description || d.text}`); }
    const kinds = mobile ? ['error'] : ['error', 'warning'];
    if (m.method === 'Runtime.consoleAPICalled' && kinds.includes(m.params.type)) errs.push(`console.${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true, timeout: 300000 }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, n + '.png'), Buffer.from(r.result.data, 'base64')); };
  const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 5, radiusY: 5, force: 1 })) });
  const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(60); await touch('touchEnd', []); };
  const tapEl = async (sel) => { const r = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2];`); await tapAt(r[0], r[1]); return r; };

  await send('Runtime.enable'); await send('Page.enable');
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  }
  await send('Page.navigate', { url });

  // a failed check counts as an error, so the test fails
  const check = (ok, what) => { if (!ok) errs.push('CHECK FAILED: ' + what); };

  // prints the console errors, closes Chrome; exit code 1 when anything went wrong
  const done = async () => {
    console.log('ERRORS (' + errs.length + '):'); for (const l of errs) console.log('  ' + l);
    ws.close(); ch.kill(); await sleep(800);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
    process.exit(errs.length ? 1 : 0);
  };
  return { ev, shot, sleep, send, errs, touch, tapAt, tapEl, check, done, url, outDir };
}
