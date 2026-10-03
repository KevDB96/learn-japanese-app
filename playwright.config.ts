import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/learn-japanese-app/'

export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: false,
  reporter: 'list',
  use: { ...devices['iPhone 13'], browserName: 'chromium', headless: true, baseURL },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --base=/learn-japanese-app/',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
