import { expect, test } from '@playwright/test';

test('sound starts on the first click, plays, and M mutes it', async ({ page, browserName }) => {
  // Headless Firefox and WebKit have no audio output to measure.
  test.skip(browserName !== 'chromium', 'audio level is measured in Chromium only');
  // CI renders in software, so timers wait on slow frames.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?seed=e2e&debug&quality=low');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });

  type Audio = { engine: { ctx: { state: string } | null } };
  // Audio loads after the first frame, and makes no context until a gesture.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tim: { audio?: Audio } }).__tim.audio !== undefined)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __tim: { audio: Audio } }).__tim.audio.engine.ctx)).toBeNull();

  // A click on the map is the gesture that lets audio start.
  await page.mouse.click(640, 400);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tim: { audio: Audio } }).__tim.audio.engine.ctx?.state)).toBe('running');

  const loudest = async () =>
    page.evaluate(async () => {
      const a = (window as unknown as { __tim: { audio: { level(): number; play(n: string): void } } }).__tim.audio;
      a.play('milestone');
      let peak = 0;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 40));
        peak = Math.max(peak, a.level());
      }
      return peak;
    });
  expect(await loudest()).toBeGreaterThan(0.005);

  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  expect(await loudest()).toBeLessThan(0.002);
  expect(errors).toEqual([]);
});
