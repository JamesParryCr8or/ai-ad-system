import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:4173/google-ads/calculator/');
  await page.getByRole('heading', { name: 'Google Ads growth calculator', exact: true }).waitFor();
  await page.screenshot({ path: '.vercel/calculator-desktop.png', fullPage: true });
  assert.equal(await page.locator('.metric.revenue strong').textContent(), '\u00a32,160');
  await page.getByRole('button', { name: 'Lead generation', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Lead-to-sale close rate' }).fill('25');
  assert.equal(await page.locator('.metric.revenue strong').textContent(), '\u00a3540');
  await page.getByRole('button', { name: 'Ambitious', exact: true }).click();
  assert.notEqual(await page.locator('.metric.revenue strong').textContent(), '\u00a3540');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download forecast CSV' }).click();
  assert.equal((await download).suggestedFilename(), 'cr8or-google-ads-forecast.csv');
  await page.route('**/api/growth-research*', route => route.fulfill({ json: route.request().method() === 'POST' ? { job: 'test-job' } : { status: 'complete', geo: 'gb', fetchedAt: new Date().toISOString(), rows: [{ keyword: 'laser hair growth', volume: 1000, cpc: 2, competition: 'HIGH', monthly: [] }, { keyword: 'unknown metric', volume: null, cpc: null, competition: 'Unknown', monthly: [] }] } }));
  await page.getByRole('textbox', { name: /Keywords/ }).fill('laser hair growth');
  await page.getByRole('button', { name: 'Research keywords', exact: true }).click();
  await page.getByText('2 keyword results ready.').waitFor();
  assert.equal(await page.getByRole('spinbutton', { name: 'Monthly searches', exact: true }).inputValue(), '1000');
  assert.equal(await page.getByRole('spinbutton', { name: 'Average CPC', exact: true }).inputValue(), '1.5');
  await page.getByRole('checkbox', { name: 'Select all keywords' }).uncheck();
  assert.equal(await page.getByRole('spinbutton', { name: 'Monthly searches', exact: true }).inputValue(), '0');
  await page.getByRole('checkbox', { name: 'Select all keywords' }).check();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}`);
    await page.screenshot({ path: `.vercel/calculator-${width}.png`, fullPage: true });
  }
  await page.goto('http://localhost:4173/google-ads/');
  assert.equal(await page.locator('.website-tile').count(), 8);
  assert.ok(await page.locator('.website-tile img').evaluateAll(imgs => imgs.every(img => img.getAttribute('src').startsWith('/') || img.getAttribute('src').startsWith('https://'))));
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: forecast, lead mode, scenarios, CSV, research, keyword selection, responsive widths, eight restored websites.');
} finally { await browser.close(); }
