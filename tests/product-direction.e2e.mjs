import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Local application only. No production sessions, accounts, data or writes.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
await mkdir('.artifacts/product-direction', { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [320, 375, 768, 1440]) {
    const height = width < 400 ? 700 : 960;
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await page.goto(`${base}/prototype/personality`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Understand your personality.');
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
    const cta = page.getByRole('link', { name: 'See an example result' });
    const box = await cta.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= height, `CTA below fold at ${width}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    await page.screenshot({ path: `.artifacts/product-direction/${width}-preview.png`, fullPage: true });

    await cta.click();
    const friendship = page.getByRole('button', { name: 'Friendships', exact: true });
    await friendship.click();
    await page.getByRole('heading', { name: 'Say what you mean. Make room for how it lands.' }).waitFor();
    assert.equal(await friendship.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('heading', { name: 'Protect thinking time. Keep others in the loop.' }).waitFor();

    // Opening, focus containment, Escape, focus restoration and link navigation.
    const trigger = page.locator('button[aria-controls="sehyo-menu"]');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Sehyo' });
    await dialog.waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), `Focus escaped modal on Tab ${i}: ${await page.evaluate(() => document.activeElement?.outerHTML)}`);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), `Focus escaped modal on Shift+Tab ${i}`);
    }
    await page.screenshot({ path: `.artifacts/product-direction/${width}-menu.png` });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await trigger.evaluate(el => el === document.activeElement), 'Focus not restored');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    await trigger.click();
    await dialog.getByRole('button', { name: 'Close menu' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await trigger.click();
    await dialog.getByRole('link', { name: 'About How Sehyo works' }).click();
    await page.waitForURL('**/about');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'About', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    assert.deepEqual(writes, [], 'Preview must not send answer/profile writes');
    results.push({ width, height, checks: 'CTA, overflow, example contexts, modal focus/Escape/close/navigation, no writes', passed: true });
    await context.close();
  }
  await writeFile('.artifacts/product-direction/results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
