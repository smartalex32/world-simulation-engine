import { defineConfig, devices } from '@playwright/test'

/** Allows local validation to avoid a user's already-running development server. */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 3,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'on-first-retry' },
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
