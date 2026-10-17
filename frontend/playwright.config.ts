import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: "msedge" } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: "msedge" } }],
  webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
