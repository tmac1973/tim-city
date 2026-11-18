import { expect, test } from '@playwright/test';
import { placeLandmarks } from './helpers';

test('every disaster can be triggered from the menu and the page keeps rendering', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => {
    localStorage.setItem('timcity.autoBudget', 'off');
  });

  await page.goto('./?seed=disasters&water=60&hills=10&forest=40&debug&quality=low');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });
  const landmarks = await placeLandmarks(page, ['nuclear', 'airport', 'seaport']);
  console.log('landmarks placed:', landmarks.join(', '));
  await page.getByRole('button', { name: 'Normal' }).click();

  const frames = () => page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame((t) => { resolve(t); })));
  const dialog = page.getByRole('dialog', { name: 'Disasters' });
  const names = ['Fire', 'Flood', 'Tornado', 'Earthquake', 'Plane crash', 'Shipwreck', 'Meltdown', 'Mirebeast'];
  let triggered = 0;
  for (const name of names) {
    await page.getByRole('button', { name: 'Disasters', exact: true }).click();
    const row = dialog.locator('.disaster', { has: page.getByText(name, { exact: true }) });
    const button = row.getByRole('button', { name: 'Trigger' });
    if (await button.isDisabled()) {
      await dialog.getByRole('button', { name: 'Close' }).click();
      continue;
    }
    await button.click();
    await expect(dialog).toHaveCount(0);
    triggered++;
    // Let the effect play for a moment; frames must keep coming.
    const before = await frames();
    await page.waitForTimeout(1500);
    expect(await frames()).toBeGreaterThan(before);
  }
  // The landmark-free disasters are always available, plus whichever landmarks fit.
  expect(triggered).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});
