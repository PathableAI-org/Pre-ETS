import { defineConfig } from "@playwright/test"
import { randomBytes, randomUUID } from "node:crypto"

process.env.E2E_RUN_ID ??= randomUUID()
process.env.E2E_SESSION_SECRET ??= randomBytes(32).toString("base64url")
process.env.E2E_OIDC_SECRET ??= randomBytes(32).toString("base64url")
process.env.SESSION_SIGNING_SECRET = process.env.E2E_SESSION_SECRET
process.env.OIDC_TX_SIGNING_SECRET = process.env.E2E_OIDC_SECRET
process.env.SESSION_KEY_PREFIX = `e2e:${process.env.E2E_RUN_ID}:session:`
process.env.OIDC_TX_KEY_PREFIX = `e2e:${process.env.E2E_RUN_ID}:oidc:`
process.env.REDIS_URL = "redis://127.0.0.1:6379"

export default defineConfig({
  expect: { timeout: 15_000 },
  globalSetup: "./setup.ts",
  globalTeardown: "./cleanup.ts",
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
      OIDC_CLIENT_SECRETS_JSON: "{}",
      OIDC_TX_TTL_SECONDS: "600",
      SESSION_STORE_TIMEOUT_MS: "2000",
      SESSION_TTL_SECONDS: "86400",
      TENANT_LOCAL_CONFIG_JSON: JSON.stringify({
        config: {
          displayName: "Local Demo",
          idleTimeoutMinutes: 5,
          oidc: {
            clientAuth: "public",
            clientId: "springfield-web",
            issuer: "http://127.0.0.1:8080/realms/pre-ets"
          }
        },
        slug: "springfield"
      }),
      TENANT_RESOLUTION: "static"
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://localhost:3000/login-unavailable"
  },
  workers: 1
})
