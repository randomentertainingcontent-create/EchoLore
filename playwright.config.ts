import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : { channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" }),
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --webpack -p 3100 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: resolve("tests/e2e/fonts.json"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
