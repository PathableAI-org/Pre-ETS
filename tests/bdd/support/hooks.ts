import { After, Before, setDefaultTimeout, Status } from "@cucumber/cucumber"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { AppWorld } from "./world.ts"

import { stopSite } from "./server.ts"

setDefaultTimeout(120000)
Before(async function(this: AppWorld, { pickle }) {
  this.directory = await fs.mkdtemp(path.join(os.tmpdir(), "preets-bdd-"))
  this.runtime = pickle.tags.some((tag) => tag.name === "@development") ? "development" : "production"
})
After({ timeout: 30000 }, async function(this: AppWorld, { result }) {
  const errors: unknown[] = []
  const attempt = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
    } catch (error) {
      errors.push(error)
    }
  }
  if (result?.status === Status.FAILED) this.attach(this.logs, "text/plain")
  await attempt(async () => {
    await stopSite(this)
  })
  await attempt(async () => {
    if (this.directory) await fs.rm(this.directory, { force: true, recursive: true })
  })
  if (errors.length) throw new AggregateError(errors, "BDD cleanup failed")
})
