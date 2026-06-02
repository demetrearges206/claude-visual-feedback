// Deterministic E2E against the static fixture (no live re-render).
// Validates: hidden-until-summoned, triple-tap, glass sheet, layer stepper,
// pseudo (::before) chip, list + delete, send.
const { webkit, devices } = require('playwright');
const BASE = 'http://localhost:3100/fixture.html?comment=1';

(async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const hiddenBefore = await page.locator('.vf-bar.show').count();          // expect 0

  // 3 quick taps to summon
  for (let i = 0; i < 3; i++) { await page.touchscreen.tap(180, 60); await page.waitForTimeout(70); }
  await page.waitForTimeout(300);
  const shownAfter = await page.locator('.vf-bar.show').count();            // expect 1
  await page.screenshot({ path: '/tmp/vf-fx-bar.png' });

  // pick inside the card — lands on a child; step OUTER to reach #card (the eyebrow host)
  await page.click('.vf-pick');
  await page.click('#price', { force: true });
  await page.waitForTimeout(250);
  let chips = [];
  for (let i = 0; i < 5; i++) {
    chips = await page.locator('.vf-chip').allInnerTexts();
    if (chips.includes('::before')) break;
    await page.click('.vf-prev');          // "Outer"
    await page.waitForTimeout(120);
  }
  const stepN = await page.locator('.vf-stepn').innerText();
  await page.screenshot({ path: '/tmp/vf-fx-sheet.png' });

  // target ::before, add note
  await page.locator('.vf-chip', { hasText: '::before' }).click();
  const selAfterPseudo = await page.locator('.vf-sel').innerText();        // expect ends with ::before
  await page.fill('.vf-sheet textarea', 'Eyebrow ribbon: make it thicker.');
  await page.click('.vf-add');
  await page.waitForTimeout(200);

  // second comment (to delete)
  await page.click('.vf-pick');
  await page.click('#price', { force: true });
  await page.fill('.vf-sheet textarea', 'This price will be deleted.');
  await page.click('.vf-add');
  await page.waitForTimeout(200);

  // open list, screenshot, delete #2, send from list
  await page.click('.vf-listbtn');
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/vf-fx-list.png' });
  await page.locator('.vf-del').nth(1).click();
  await page.waitForTimeout(150);
  await page.click('.vf-sendlist');
  await page.waitForTimeout(700);

  await browser.close();
  console.log(JSON.stringify({ hiddenBefore, shownAfter, chips, stepN, selAfterPseudo }, null, 2));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
