import { defineConfig, devices } from '@playwright/test';

const PORT = '4174';

/**
 * `pnpm bench`: the frame-time benchmark, run by hand on the reference
 * laptop (headed Chromium with the GPU on), never in CI.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'bench.spec.ts',
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/tim-city/`,
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        // Headed so the browser uses the real GPU. BENCH_HEADLESS=1 and
        // BENCH_CHROME_ARGS (space separated) suit machines where headless
        // can still reach the GPU, e.g. Linux with '--use-angle=vulkan'.
        headless: process.env.BENCH_HEADLESS === '1',
        launchOptions: { args: ['--ignore-gpu-blocklist', ...(process.env.BENCH_CHROME_ARGS ?? '').split(' ').filter(Boolean)] },
      },
    },
  ],
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/tim-city/`,
    reuseExistingServer: true,
  },
});
