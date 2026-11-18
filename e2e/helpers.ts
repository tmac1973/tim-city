import type { Page } from '@playwright/test';

/**
 * Lay out a small powered neighbourhood through the debug handle (?debug):
 * a coal plant, a power line, a road, homes and industry, on the first site
 * where every piece fits. Leaves the game running at fast speed.
 */
export async function buildStarter(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
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
}

export const money = (text: string | null): number => Number((text ?? '').replace(/[^0-9-]/g, ''));

/**
 * Place each landmark (airport, seaport, nuclear plant, …) on the first site
 * where a dry run succeeds, with plenty of funds. Returns the ones placed.
 */
export async function placeLandmarks(page: Page, tools: string[]): Promise<string[]> {
  return page.evaluate(async (tools) => {
    type Bridge = {
      onEvent(fn: (e: { type: string; requestId?: number; ok?: boolean }) => void): () => void;
      command(c: unknown): void;
      setSpeed(s: string): void;
    };
    const { sim, mirror } = (window as unknown as { __tim: { sim: Bridge; mirror: { size: number } } }).__tim;
    sim.setSpeed('paused');
    sim.command({ type: 'setFunds', amount: 1_000_000 });
    let rid = 50_000;
    const run = (tool: string, x: number, y: number, dryRun: boolean) =>
      new Promise<boolean>((resolve) => {
        const requestId = rid++;
        const off = sim.onEvent((e) => {
          if (e.type === 'toolResult' && e.requestId === requestId) {
            off();
            resolve(e.ok ?? false);
          }
        });
        sim.command({ type: 'tool', tool, x0: x, y0: y, x1: x, y1: y, brush: 1, tunnel: false, dryRun, requestId });
      });
    const placed: string[] = [];
    for (const tool of tools) {
      // Send every dry run at once: with software GL each round trip waits a
      // whole (slow) frame, so one at a time would take minutes.
      const spots: [number, number][] = [];
      for (let y = 8; y < mirror.size - 8; y += 5) for (let x = 8; x < mirror.size - 8; x += 5) spots.push([x, y]);
      const fits = await Promise.all(spots.map(([x, y]) => run(tool, x, y, true)));
      const at = spots[fits.indexOf(true)];
      if (at && (await run(tool, at[0], at[1], false))) placed.push(tool);
    }
    return placed;
  }, tools);
}

/** Open a toolbar category's flyout and pick one of its tools by name. */
export async function pickTool(page: Page, category: string, name: string): Promise<void> {
  await page.locator(`[data-category="${category}"]`).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
