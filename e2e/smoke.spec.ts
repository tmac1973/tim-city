import { expect, test } from '@playwright/test';

test('loads the canvas and title without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');

  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tim City' })).toBeVisible();
  expect(errors).toEqual([]);
});
