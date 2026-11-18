import { defineConfig, devices } from '@playwright/test';

const PORT = '4173';
// Playwright's WebKit build needs Ubuntu system libraries, so it always runs
// in CI but only runs locally when PW_WEBKIT=1 is set.
const runWebkit = !!process.env.CI || process.env.PW_WEBKIT === '1';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/tim-city/`,
    // CI uploads these from test-results/ when a run fails.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // CI runners have no GPU and headless Firefox finds no GL driver there,
        // so CI runs Firefox headed inside xvfb-run, where Mesa's software
        // renderer provides GL; the pref lifts Firefox's blocklist for it.
        headless: !process.env.CI,
        launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } },
      },
    },
    ...(runWebkit ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }] : []),
  ],
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/tim-city/`,
    reuseExistingServer: !process.env.CI,
  },
});
