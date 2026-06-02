#!/usr/bin/env node
/*
 * claude-visual-feedback — WebKit screenshotter (Safari-family engine)
 *
 * Usage:
 *   node shot.js --url http://localhost:3000/ferry.html [options]
 *
 * Options:
 *   --device "iPhone 13"   Playwright device preset (default: iPhone 13)
 *   --desktop              Use a 1280x900 desktop viewport instead of a device
 *   --selector "<css>"     Screenshot only this element (great for commented bits)
 *   --out <path>           Output PNG (default: shot.png in this dir)
 *   --wait <ms>            Extra settle time after load (default: 2500)
 *   --full                 Full-page capture (default true unless --selector)
 *
 * Engine is WebKit — closer to iOS Safari than Chromium.
 */
const { webkit, devices } = require('playwright');
const path = require('path');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function has(flag) { return process.argv.includes(flag); }

(async () => {
  const url = arg('--url', 'http://localhost:3000/index.html');
  const out = path.resolve(arg('--out', 'shot.png'));
  const wait = parseInt(arg('--wait', '2500'), 10);
  const selector = arg('--selector', null);
  const useDesktop = has('--desktop');
  const deviceName = arg('--device', 'iPhone 13');

  const browser = await webkit.launch();
  const ctxOpts = useDesktop
    ? { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }
    : { ...devices[deviceName] };
  const context = await browser.newContext(ctxOpts);

  // CORS bypass for headless verification: intercept third-party API calls that the
  // browser would block (no Access-Control-Allow-Origin), perform them server-side
  // (Node — no CORS), and re-inject with permissive headers. Dev/test only; never
  // touches the real app or production. Disable with --no-cors-bypass.
  if (!has('--no-cors-bypass')) {
    await context.route('**/*', async (route) => {
      const req = route.request();
      const u = req.url();
      const sameOrigin = u.startsWith(new URL(url).origin) || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1');
      if (sameOrigin) return route.continue();
      try {
        const resp = await route.fetch();              // server-side fetch, no CORS
        const headers = { ...resp.headers(), 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        return route.fulfill({ response: resp, headers });
      } catch (e) {
        return route.continue();
      }
    });
  }
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(wait);

  if (selector) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.screenshot({ path: out });
    console.log('element shot →', out, '(' + selector + ')');
  } else {
    await page.screenshot({ path: out, fullPage: !has('--no-full') });
    console.log((useDesktop ? 'desktop' : deviceName) + ' shot →', out);
  }
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
