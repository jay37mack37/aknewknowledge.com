import { defineConfig, devices } from '@playwright/test'

// Optional: point at a locally installed Chromium when Playwright's bundled
// browser is not downloaded. Unset in CI, where the bundled browser is used.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
// WebGL in headless Chromium needs SwiftShader on machines without a GPU.
const launchOptions = { executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
// Optional: run a second suite side by side (e.g. a load test) on another port.
const port = Number(process.env.PLAYWRIGHT_PORT || 4173)

export default defineConfig({
  testDir: './tests',
  // The game renders WebGL in software (SwiftShader), which crawls on a busy host.
  // Generous limits keep the suite load-tolerant; tests poll on game progress, not sleeps.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
})
