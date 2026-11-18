import { expect, test } from '@playwright/test';

const money = (text: string | null) => Number((text ?? '').replace(/[^0-9-]/g, ''));

test('building a road through the toolbar charges for it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // The welcome tip sits over the middle of the map, where this test hovers.
  await page.addInitScript(() => {
    localStorage.setItem('timcity.settings', JSON.stringify({ tips: false }));
  });
  await page.goto('./?seed=e2e&water=0&forest=0&hills=0&quality=low');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId('funds')).not.toHaveText('$0');
  const before = money(await page.getByTestId('funds').textContent());

  await page.getByRole('button', { name: 'Road' }).click();
  await expect(page.getByRole('button', { name: 'Road' })).toHaveAttribute('aria-pressed', 'true');

  // Terrain decides where a road fits; hover until the preview turns green.
  const tag = page.getByTestId('cost-tag');
  let spot: { x: number; y: number } | null = null;
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  search: for (let y = 0.35; y <= 0.75; y += 0.08) {
    for (let x = 0.3; x <= 0.7; x += 0.08) {
      const point = { x: viewport.width * x, y: viewport.height * y };
      await page.mouse.move(point.x, point.y);
      // The first dry run waits on shader compiles; later ones are quick.
      await expect(tag).toBeVisible({ timeout: x === 0.3 && y === 0.35 ? 20_000 : 5_000 });
      if ((await tag.getAttribute('class'))?.includes('ok')) {
        spot = point;
        break search;
      }
    }
  }
  expect(spot, 'no buildable tile found near the centre').not.toBeNull();
  await expect(tag).toHaveText('$10');

  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => money(await page.getByTestId('funds').textContent())).toBe(before - 10);
  expect(errors).toEqual([]);
});

test('the interface size setting zooms the UI and keeps the cost tag by the mouse', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('timcity.settings', JSON.stringify({ tips: false, uiScale: 1.5 }));
  });
  await page.goto('./?seed=e2e&water=0&forest=0&hills=0&quality=low');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const road = page.getByRole('button', { name: 'Road' });
  const budget = await page.getByRole('button', { name: 'Budget' }).boundingBox();
  // About 30 px tall at 100%.
  expect(budget?.height ?? 0).toBeGreaterThan(40);
  // The toolbar shrinks to fit the 720 px window instead of running off it.
  const toolbar = await page.getByRole('navigation', { name: 'Tools' }).boundingBox();
  expect((toolbar?.y ?? 0) + (toolbar?.height ?? 0)).toBeLessThanOrEqual(viewport.height);

  await road.click();
  const point = { x: viewport.width * 0.5, y: viewport.height * 0.5 };
  await page.mouse.move(point.x, point.y);
  const tag = page.getByTestId('cost-tag');
  await expect(tag).toBeVisible({ timeout: 20_000 });
  const box = await tag.boundingBox();
  // 18 interface pixels right of and below the mouse, at 1.5× scale.
  expect(Math.abs((box?.x ?? 0) - (point.x + 27))).toBeLessThan(3);
  expect(Math.abs((box?.y ?? 0) - (point.y + 27))).toBeLessThan(3);
});
