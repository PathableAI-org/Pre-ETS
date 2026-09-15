const includeSession = process.env.CUCUMBER_SESSION === "1"

const tenantFeatures = [
  "features/tenant-landing-page.feature",
  "features/local-static-tenant-configuration.feature",
  "features/local-host-tenant-resolution.feature"
]

const sessionFeatures = [
  "features/session-continuity.feature",
  "features/session-recovery.feature",
  "features/local-session-development.feature"
]

const imports = [
  "tests/bdd/support/world.ts",
  "tests/bdd/support/server.ts",
  "tests/bdd/support/hooks.ts",
  "tests/bdd/steps/tenant.steps.ts"
]

if (includeSession) {
  imports.push("tests/bdd/steps/session.steps.ts")
}

/** @type {Partial<import("@cucumber/cucumber").IConfiguration>} */
const configuration = {
  failFast: false,
  format: [
    "progress",
    ["json", `reports/${process.env.CUCUMBER_REPORT ?? "cucumber-all"}.json`]
  ],
  import: imports,
  parallel: 0,
  paths: includeSession ? [...tenantFeatures, ...sessionFeatures] : tenantFeatures,
  strict: true
}

export default configuration
