import { expect, test } from '@playwright/test';
import { buildStarter } from './helpers';

/**
 * The playable slice: a powered, zoned neighbourhood beside a road grows a
 * population. The city is laid out through the debug handle (?debug) so the
 * test does not depend on where terrain lets the mouse build.
 */
test('a powered, zoned neighbourhood grows a population', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?seed=e2e&water=10&forest=10&hills=10&debug&quality=low');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });

  const built = await buildStarter(page);
  expect(built, 'no buildable site found').toBe(true);

  const population = page.getByTestId('population');
  await expect.poll(async () => Number((await population.textContent())?.replace(/\D/g, '') ?? 0), { timeout: 90_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
