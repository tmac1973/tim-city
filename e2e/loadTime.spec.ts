import { expect, test } from '@playwright/test';

test('the title screen is ready within 5 s on a fast 4G connection', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'network throttling uses the Chrome DevTools Protocol');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // Roughly "fast 4G": 9 Mbit/s down, 1.5 Mbit/s up, 60 ms round trips.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });
  const started = Date.now();
  await page.goto('./?quality=low');
  await expect(page.getByRole('button', { name: 'New City' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('html[data-sim="ready"]')).toHaveCount(1, { timeout: 10_000 });
  const seconds = (Date.now() - started) / 1000;
  console.log(`title ready in ${seconds.toFixed(2)} s`);
  expect(seconds).toBeLessThan(5);
});
