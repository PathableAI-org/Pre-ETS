import { defineConfig } from "@playwright/test"

import { prepareTenantDirectory } from "./tenant-directory.ts"

export default defineConfig({
  expect: { timeout: 15_000 },
  outputDir: "../test-results/e2e",
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report/e2e" }]],
  retries: 0,
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm dev:frontend",
    cwd: "..",
    env: {
      NODE_ENV: "development",
      TENANT_CONFIG_DIR: prepareTenantDirectory(),
      TENANT_RESOLUTION: "static",
      TENANT_STATIC_ALIAS: "springfield"
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://localhost:3000/login-unavailable"
  },
  workers: 1
})
