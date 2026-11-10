// Installable-app check: the manifest parses, the service worker controls the page, and Chrome
// reports no installability errors. (?test skips the worker, so register it here by hand.)
import { open } from './harness.mjs';
const { ev, send, sleep, check, done } = await open(import.meta.url);
await sleep(3000);
check(await ev(`await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return true;`), 'service worker registers');
const m = await send('Page.getAppManifest');
console.log('manifest errors', JSON.stringify(m.result?.errors || []));
check(!(m.result?.errors || []).length, 'manifest has no errors');
const r = await send('Page.getInstallabilityErrors');
const errs = (r.result?.installabilityErrors || []).map((e) => e.errorId);
console.log('installability errors', JSON.stringify(errs));
check(!errs.filter((e) => e !== 'in-incognito').length, 'Chrome sees the game as installable');
check(await ev(`return (await caches.keys()).includes('bz-v1')`), 'offline cache filled');
await done();
