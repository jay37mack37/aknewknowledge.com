import { defineConfig, devices } from '@playwright/test'

// Optional: point at a locally installed Chromium when Playwright's bundled
// browser is not downloaded. Unset in CI, where the bundled browser is used.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
// WebGL in headless Chromium needs SwiftShader on machines without a GPU.
const launchOptions = { executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
})
