// temporary: the Download for PC button exists, is shown on desktop, and the page has no errors
import { open } from './harness.mjs';
const { ev, sleep, check, done } = await open(import.meta.url);
await sleep(5000);
const r = await ev(`const b = document.getElementById('pcDownload'); if (!b) return 'missing'; return getComputedStyle(b).display + ' / ' + b.textContent.trim().slice(0, 30);`);
console.log('button:', r);
check(r !== 'missing' && !r.startsWith('none'), 'download button shown on desktop');
await done();
