import { validateFeatures } from "./tests/bdd/metadata.mjs"

const base = {
  failFast: false,
  import: ["tests/bdd/support/world.ts", "tests/bdd/support/hooks.ts", "tests/bdd/steps/*.ts"],
  parallel: 0,
  paths: ["features/capabilities/**/*.feature"],
  strict: true
}
function profile(name, tags, dryRun = false) {
  return { ...base, dryRun, format: ["summary", ["json", `reports/cucumber-${name}.json`]], tags }
}
export default async () => {
  await validateFeatures()
  return {
    application: profile("application", "@application"),
    "browser-development": profile("browser-development", "@browser and @development"),
    "browser-production": profile("browser-production", "@browser and @production"),
    default: profile("all", ""),
    development: profile("development", "@development"),
    dry: profile("discovery", "", true),
    "http-development": profile("http-development", "@http and @development"),
    "http-production": profile("http-production", "@http and @production"),
    production: profile("production", "@production")
  }
}
