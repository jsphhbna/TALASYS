import { defineConfig, devices } from "@playwright/test"

const testPort = process.env.PLAYWRIGHT_PORT || process.env.PORT || "3000"
const baseURL = `http://127.0.0.1:${testPort}`

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER ? undefined : {
    command: process.env.PLAYWRIGHT_USE_START
      ? `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${testPort}`
      : `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${testPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "edge", use: { ...devices["Desktop Chrome"], channel: "msedge" } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
})
