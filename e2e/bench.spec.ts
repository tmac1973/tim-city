import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Frame budget per map size: 60 fps on 128, 30 fps on 256. */
const BUDGET: Record<string, number> = { 'bench-128': 16.7, 'bench-256': 33.3 };
const SECONDS = Number(process.env.BENCH_SECONDS ?? 60);
const results: Record<string, unknown> = {};

for (const name of Object.keys(BUDGET)) {
  test(`${name} holds its frame budget at night in the rain`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('timcity.autoBudget', 'off');
      localStorage.setItem('timcity.settings', JSON.stringify({ quality: 'high', tips: false }));
    });
    await page.goto(`./?bench=${name}&debug`);
    await expect(page.locator('html[data-rendered="true"]')).toHaveCount(1, { timeout: 60_000 });
    const startPopulation = await page.getByTestId('population').textContent();
    // Let traffic, agents and shaders warm up.
    await page.waitForTimeout(8_000);
    const stats = await page.evaluate(async (seconds) => {
      const frames: number[] = [];
      let last = performance.now();
      const end = last + seconds * 1000;
      await new Promise<void>((resolve) => {
        const step = (t: number) => {
          frames.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      const sorted = [...frames].sort((a, b) => a - b);
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
      const tim = (window as unknown as { __tim: { renderer: { agents: { cars: { cars: { alive: boolean }[] } } } } }).__tim;
      return {
        frames: frames.length,
        median: at(0.5),
        p95: at(0.95),
        p99: at(0.99),
        cars: tim.renderer.agents.cars.cars.filter((c) => c.alive).length,
        gpu: (() => {
          const gl = document.createElement('canvas').getContext('webgl2');
          const info = gl?.getExtension('WEBGL_debug_renderer_info');
          return info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
        })(),
      };
    }, SECONDS);
    const population = await page.getByTestId('population').textContent();
    // The bench cities are packed with homes beyond what their jobs support,
    // so they shrink at fast speed; both ends are recorded.
    results[name] = { ...stats, startPopulation, population, budget: BUDGET[name], seconds: SECONDS };
    writeFileSync('bench-results.json', `${JSON.stringify(results, null, 2)}\n`);
    expect(stats.median).toBeLessThanOrEqual(BUDGET[name] ?? 0);
  });
}
