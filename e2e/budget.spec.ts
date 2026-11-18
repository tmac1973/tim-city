import { expect, test } from '@playwright/test';
import { buildStarter, money } from './helpers';

test('the budget window opens at year end and tax changes update the estimate', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?seed=e2e&water=10&forest=10&hills=10&debug');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  expect(await buildStarter(page), 'no buildable site found').toBe(true);

  // A year at fast speed is 18 seconds.
  const dialog = page.getByRole('dialog', { name: 'Budget' });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');

  const estimate = dialog.locator('tr[data-row="residentialTax"] td').nth(2);
  await expect.poll(async () => money(await estimate.textContent())).toBeGreaterThan(0);
  const before = money(await estimate.textContent());
  await dialog.getByLabel('Tax rate').fill('14');
  // The estimate rounds the total, so it can differ from an exact double by $1.
  await expect.poll(async () => Math.abs(money(await estimate.textContent()) - before * 2)).toBeLessThanOrEqual(1);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
