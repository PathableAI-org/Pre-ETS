import { loadConfiguration, loadSources } from "@cucumber/cucumber/api"
import { spawnSync } from "node:child_process"
import fs from "node:fs"

import { validateFeatures } from "./metadata.mjs"
import { runPartitions } from "./partitions.mjs"

await validateFeatures()
const selected = process.argv[2] ?? "all"
const profiles = {
  all: ["application", "production", "development"],
  application: ["application"],
  browser: ["browser-production", "browser-development"],
  dry: ["dry"],
  http: ["http-production", "http-development"]
}[selected]
if (!profiles) throw new Error(`Unknown BDD suite: ${selected}`)

const nonempty = []
for (const profile of profiles) {
  const { runConfiguration } = await loadConfiguration({ file: "cucumber.mjs", profiles: [profile] })
  const { plan } = await loadSources(runConfiguration.sources)
  if (plan.length) nonempty.push(profile)
}
let reportedMissingBuild = false
function buildAvailable(profile) {
  if (profile.includes("production") && !fs.existsSync("packages/frontend/.next/BUILD_ID")) {
    if (!reportedMissingBuild) {
      console.error(
        "BDD production tests require a frontend build. Run pnpm --filter @pathableai/pre-ets-frontend build first."
      )
    }
    reportedMissingBuild = true
    return false
  }
  return true
}
function runProfile(profile) {
  if (!buildAvailable(profile)) return false
  const result = spawnSync("pnpm", ["exec", "cucumber-js", "--config", "cucumber.mjs", "--profile", profile], {
    env: process.env,
    stdio: "inherit"
  })
  if (result.error) console.error(result.error)
  return result.status === 0
}
const success = runPartitions(nonempty, runProfile)
process.exitCode = success ? 0 : 1
