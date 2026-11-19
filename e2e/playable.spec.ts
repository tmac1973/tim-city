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

test('a 2.0 city: rezoned lots and bus stops survive a save and load, and a bus runs', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => {
    localStorage.setItem('timcity.autoBudget', 'off');
    localStorage.setItem('timcity.settings', JSON.stringify({ tips: false }));
  });
  await page.goto('./?seed=e2e&water=10&forest=10&hills=10&debug&quality=low');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  expect(await buildStarter(page), 'no buildable site found').toBe(true);

  // Rezone the first home lot to low density and put two stops beside the road, through the debug handle.
  const placed = await page.evaluate(async () => {
    type Tim = {
      sim: { command(c: unknown): void; onEvent(fn: (e: { type: string; requestId?: number; ok?: boolean }) => void): () => void };
      mirror: { size: number; tiles: Uint16Array; parts: Uint8Array };
    };
    const { sim, mirror } = (window as unknown as { __tim: Tim }).__tim;
    let rid = 9000;
    const run = (tool: string, x: number, y: number, extra: object = {}) =>
      new Promise<boolean>((resolve) => {
        const requestId = rid++;
        const off = sim.onEvent((e) => {
          if (e.type === 'toolResult' && e.requestId === requestId) {
            off();
            resolve(e.ok ?? false);
          }
        });
        sim.command({ type: 'tool', tool, x0: x, y0: y, x1: x, y1: y, brush: 1, tunnel: false, dryRun: false, requestId, ...extra });
      });
    const n = mirror.size;
    // Residential kinds are 80–115; the lot's centre is one tile in from its top-left.
    const lot = [...mirror.tiles.keys()].find((i) => mirror.parts[i] === 1 && (mirror.tiles[i] ?? 0) >= 80 && (mirror.tiles[i] ?? 0) < 116) ?? -1;
    const rezoned = await run('residential', (lot % n) + 1, Math.floor(lot / n) + 1, { tier: 0 });
    // Two free tiles on one row beside the road, 6–10 tiles apart (stops link within 12 road tiles).
    const besideRoad = (i: number) => mirror.tiles[i] === 0 && (mirror.tiles[i - n] === 16 || mirror.tiles[i + n] === 16);
    const stops: number[] = [];
    for (let i = n; i < n * n - n && stops.length < 2; i++) {
      if (!besideRoad(i)) continue;
      const partner = [6, 7, 8, 9, 10].map((d) => i + d).find((j) => Math.floor(j / n) === Math.floor(i / n) && besideRoad(j));
      if (partner === undefined) continue;
      if ((await run('busStop', i % n, Math.floor(i / n))) && (await run('busStop', partner % n, Math.floor(partner / n)))) stops.push(i, partner);
    }
    return { rezoned, lot, stops };
  });
  expect(placed.rezoned).toBe(true);
  expect(placed.stops).toHaveLength(2);

  // A bus appears once the routes are found.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __tim: { renderer: { agents: { buses: { buses: unknown[] } } } } }).__tim.renderer.agents.buses.buses.length), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Save / Load' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save and load' });
  await dialog.getByLabel('Save name').fill('v2 city');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.locator('.save-item', { hasText: 'v2 city' }).getByRole('button', { name: 'Load' }).click();
  await page.waitForURL(/load=v2/);
  await expect(page.locator('html[data-sim="ready"]')).toHaveCount(1, { timeout: 20_000 });
  const after = await page.evaluate(
    ({ lot, stops }) => {
      const { mirror } = (window as unknown as { __tim: { mirror: { tiles: Uint16Array; zoneTier: Uint8Array } } }).__tim;
      return { tier: mirror.zoneTier[lot], stops: stops.map((i) => mirror.tiles[i]) };
    },
    { lot: placed.lot, stops: placed.stops },
  );
  expect(after.tier).toBe(0);
  expect(after.stops).toEqual([27, 27]);
  expect(errors).toEqual([]);
});
