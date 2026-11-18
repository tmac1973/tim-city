import { expect, test } from '@playwright/test';

const money = (text: string | null) => Number((text ?? '').replace(/[^0-9-]/g, ''));

test('building a road through the toolbar charges for it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

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
      await expect(tag).toBeVisible();
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
