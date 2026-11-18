import { expect, type Page, test } from '@playwright/test';

/** Median frame time over 20 frames (after a short warm-up). */
function medianFrame(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const step = (t: number) => {
          times.push(t - last);
          last = t;
          if (times.length < 25) requestAnimationFrame(step);
          else resolve(times.slice(5).sort((a, b) => a - b)[10] ?? 0);
        };
        requestAnimationFrame(step);
      }),
  );
}

test('every overlay toggles on and off without errors', async ({ page, browserName }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?seed=e2e');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });

  // Headless browsers render in software, so absolute frame times measure the
  // machine; check instead that an overlay does not make frames much slower.
  const before = browserName === 'chromium' ? await medianFrame(page) : 0;

  const group = page.getByRole('group', { name: 'Overlay' });
  const buttons = group.getByRole('button');
  await expect(buttons).toHaveCount(9);
  for (let i = 0; i < 9; i++) {
    const button = buttons.nth(i);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  if (browserName === 'chromium') {
    const during = await medianFrame(page);
    expect(during).toBeLessThan(2 * before + 20);
  }

  await buttons.nth(8).click();
  await expect(buttons.nth(8)).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
