const includeSession = process.env.CUCUMBER_SESSION === "1"
const includeOidc = process.env.CUCUMBER_OIDC === "1"
const includeIdle = process.env.CUCUMBER_IDLE === "1"

const tenantFeatures = [
  "features/tenant-landing-page.feature",
  "features/local-static-tenant-configuration.feature",
  "features/local-host-tenant-resolution.feature",
  "features/filesystem-host-tenant-configuration.feature",
  "features/filesystem-static-tenant-name.feature",
  "features/filesystem-tenant-source-cutover.feature"
]

const sessionFeatures = [
  "features/session-continuity.feature",
  "features/session-recovery.feature",
  "features/local-session-development.feature"
]

const oidcFeatures = [
  "features/tenant-oidc-login.feature",
  "features/tenant-oidc-configuration.feature",
  "features/local-oidc-development.feature"
]

const idleFeatures = [
  "features/idle-session-expiration.feature",
  "features/idle-session-recovery.feature",
  "features/tenant-idle-timeout-policy.feature"
]

const imports = [
  "tests/bdd/support/world.ts",
  "tests/bdd/support/server.ts",
  "tests/bdd/support/hooks.ts",
  "tests/bdd/steps/tenant.steps.ts",
  "tests/bdd/steps/tenant-fs.steps.ts"
]

if (includeSession) {
  imports.push("tests/bdd/steps/session.steps.ts")
}

if (includeOidc) {
  imports.push("tests/bdd/steps/oidc.steps.ts")
}

if (includeIdle) {
  imports.push("tests/bdd/steps/idle.steps.ts")
}

const paths = [
  ...tenantFeatures,
  ...(includeSession ? sessionFeatures : []),
  ...(includeOidc ? oidcFeatures : []),
  ...(includeIdle ? idleFeatures : [])
]

/** @type {Partial<import("@cucumber/cucumber").IConfiguration>} */
const configuration = {
  failFast: false,
  format: [
    "progress",
    ["json", `reports/${process.env.CUCUMBER_REPORT ?? "cucumber-all"}.json`]
  ],
  import: imports,
  parallel: 0,
  paths,
  strict: true
}

export default configuration
