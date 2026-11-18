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
