import { After, Before, setDefaultTimeout, Status } from "@cucumber/cucumber"

import type { AppWorld } from "./world.ts"

import { cleanupTenantFixtures } from "./fixtures.ts"
import { stopSite } from "./server.ts"

setDefaultTimeout(120000)
Before(function(this: AppWorld, { pickle }) {
  this.runtime = pickle.tags.some((tag) => tag.name === "@development") ? "development" : "production"
})
After({ timeout: 30000 }, async function(this: AppWorld, { result }) {
  if (result?.status === Status.FAILED) this.attach(this.logs, "text/plain")
  try {
    await stopSite(this)
  } finally {
    await cleanupTenantFixtures(this)
  }
})
