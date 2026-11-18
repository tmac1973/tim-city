import { expect, test } from '@playwright/test';
import { buildStarter } from './helpers';

test('first run: title, new city with preview, tips, and a city that grows', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => {
    localStorage.setItem('timcity.autoBudget', 'off');
  });

  await page.goto('./?debug&quality=low');
  await expect(page.getByRole('heading', { name: 'Tim City' })).toBeVisible();
  await expect(page.locator('html[data-sim="ready"]')).toHaveCount(1, { timeout: 30_000 });

  await page.getByRole('button', { name: 'New City' }).click();
  const dialog = page.getByRole('dialog', { name: 'New city' });
  await dialog.getByLabel('City name').fill('E2E Town');
  await dialog.getByLabel('Seed', { exact: true }).fill('e2e');
  for (const slider of ['Water', 'Forest', 'Hills']) await dialog.getByLabel(slider).fill('10');
  await dialog.getByRole('button', { name: 'Start' }).click();

  await page.waitForURL(/new=1/);
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.city-name')).toHaveText('E2E Town');

  // The tips lead the way: camera controls first, then the coal plant.
  const tip = page.getByRole('note', { name: 'Tip' });
  await expect(tip).toContainText('Pan with W A S D');
  await tip.getByRole('button', { name: 'Got it' }).click();
  await expect(tip).toContainText('coal plant');

  expect(await buildStarter(page), 'no buildable site found').toBe(true);
  const population = page.getByTestId('population');
  await expect
    .poll(async () => Number((await population.textContent())?.replace(/\D/g, '') ?? 0), { timeout: 180_000 })
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('settings persist across a reload', async ({ page }) => {
  // The title screen compiles its shaders first, which is slow when every browser runs at once.
  test.setTimeout(90_000);
  await page.goto('./?quality=low');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('button', { name: 'Medium' }).click();
  await dialog.getByLabel('Show tips').uncheck();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(dialog.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Show tips')).not.toBeChecked();
});

test('the game still runs when storage is blocked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await page.goto('./?seed=e2e&quality=low');
  await expect(page.locator('html[data-sim="ready"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId('population')).toBeVisible();
  expect(errors).toEqual([]);
});
