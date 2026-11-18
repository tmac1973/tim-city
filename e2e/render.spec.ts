import { expect, test } from '@playwright/test';

test('renders generated terrain without WebGL errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?seed=e2e');

  // First frame with terrain meshes built from the sim's chunks.
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
