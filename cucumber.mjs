/** @type {Partial<import("@cucumber/cucumber").IConfiguration>} */
const configuration = {
  failFast: false,
  format: [
    "progress",
    ["json", `reports/${process.env.CUCUMBER_REPORT ?? "cucumber-all"}.json`]
  ],
  import: [
    "tests/bdd/support/world.ts",
    "tests/bdd/support/server.ts",
    "tests/bdd/support/hooks.ts",
    "tests/bdd/steps/tenant.steps.ts",
    "tests/bdd/steps/session.steps.ts"
  ],
  parallel: 0,
  paths: ["features/*.feature"],
  strict: true
}

export default configuration
