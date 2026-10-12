import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./benchmarks",
  testMatch: "bench.spec.ts",
  timeout: 600_000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
