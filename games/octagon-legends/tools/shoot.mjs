// Screenshot harness: node tools/shoot.mjs <outfile.png> "<query string>" [waitMs]
// Serves the project with Vite, opens index.html?<query> in headless Chromium (SwiftShader WebGL)
// and waits for window.__READY__ (set by main.js once the requested scenario is posed).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || 'shots/shot.png';
const query = process.argv[3] || '';
const extraWait = Number(process.argv[4] || 500);
const [w, h] = (process.env.SIZE || '1280x720').split('x').map(Number);

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
// PAGE env selects the HTML entry (default index.html), e.g. PAGE=tools/preview-ui.html
const pagePath = (process.env.PAGE || 'index.html').replace(/^\/+/, '');
await page.goto(`http://localhost:${port}/${pagePath}?${query}`);
try {
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 180000 });
} catch (e) {
  logs.push('[harness] timed out waiting for __READY__');
}
await page.waitForTimeout(extraWait);
await page.screenshot({ path: path.resolve(root, out) });
const errs = logs.filter((l) => /error|warn/i.test(l));
if (errs.length) console.log(errs.slice(0, 30).join('\n'));
console.log('saved', out);
await browser.close();
await server.close();
