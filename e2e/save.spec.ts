import { expect, test } from '@playwright/test';
import { buildStarter } from './helpers';

test('a saved city loads back with the same date and population', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  // Keep the year-end budget window from interrupting the run.
  await page.addInitScript(() => {
    localStorage.setItem('timcity.autoBudget', 'off');
  });

  await page.goto('./?seed=e2e&water=10&forest=10&hills=10&debug');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  expect(await buildStarter(page), 'no buildable site found').toBe(true);

  const population = page.getByTestId('population');
  await expect.poll(async () => Number((await population.textContent())?.replace(/\D/g, '') ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  // Read the date and population once the pause has landed.
  await page.waitForTimeout(300);
  const date = await page.locator('.topbar .stat').first().textContent();
  const pop = await population.textContent();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save and load' });
  await dialog.getByLabel('Save name').fill('e2e city');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText('e2e city', { exact: true })).toBeVisible();

  await dialog.locator('.save-item', { hasText: 'e2e city' }).getByRole('button', { name: 'Load' }).click();
  await page.waitForURL(/load=e2e/);
  await expect(page.locator('html[data-sim="ready"]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.topbar .stat').first()).toHaveText(date ?? '');
  await expect(population).toHaveText(pop ?? '');
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
