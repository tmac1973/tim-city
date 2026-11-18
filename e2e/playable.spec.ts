import { expect, test } from '@playwright/test';

/**
 * The playable slice: a powered, zoned neighbourhood beside a road grows a
 * population. The city is laid out through the debug handle (?debug) so the
 * test does not depend on where terrain lets the mouse build.
 */
test('a powered, zoned neighbourhood grows a population', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?seed=e2e&water=10&forest=10&hills=10&debug');
  await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 20_000 });

  const built = await page.evaluate(async () => {
    type Bridge = {
      onEvent(fn: (e: { type: string; requestId?: number; ok?: boolean; bad?: number[] }) => void): () => void;
      command(c: unknown): void;
      setSpeed(s: string): void;
    };
    const { sim, mirror } = (window as unknown as { __tim: { sim: Bridge; mirror: { size: number } } }).__tim;
    sim.setSpeed('paused');
    let rid = 1;
    const run = (c: { requestId: number; dryRun: boolean }) =>
      new Promise<{ ok: boolean; bad: number[] }>((resolve) => {
        const off = sim.onEvent((e) => {
          if (e.type === 'toolResult' && e.requestId === c.requestId) {
            off();
            resolve({ ok: e.ok ?? false, bad: e.bad ?? [] });
          }
        });
        sim.command(c);
      });
    const mk = (tool: string, x0: number, y0: number, x1 = x0, y1 = y0, dryRun = true) => ({
      type: 'tool', tool, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun, requestId: rid++,
    });
    const plan = (ox: number, oy: number) => [
      mk('coal', ox + 2, oy + 2),
      // Down the side of the road to touch the first home lot (tiles ox+7…ox+9).
      mk('power', ox + 5, oy + 3, ox + 6, oy + 8),
      mk('road', ox + 6, oy + 6, ox + 24, oy + 6),
      mk('residential', ox + 8, oy + 8, ox + 14, oy + 8),
      mk('industrial', ox + 17, oy + 8, ox + 20, oy + 8),
    ];
    for (let oy = 8; oy < mirror.size - 20; oy += 3) {
      for (let ox = 6; ox < mirror.size - 30; ox += 3) {
        let ok = true;
        for (const c of plan(ox, oy)) {
          const r = await run({ ...c, requestId: rid++ });
          if (!r.ok || r.bad.length > 0) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        for (const c of plan(ox, oy)) await run({ ...c, dryRun: false, requestId: rid++ });
        sim.setSpeed('fast');
        return true;
      }
    }
    return false;
  });
  expect(built, 'no buildable site found').toBe(true);

  const population = page.getByTestId('population');
  await expect.poll(async () => Number((await population.textContent())?.replace(/\D/g, '') ?? 0), { timeout: 90_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
