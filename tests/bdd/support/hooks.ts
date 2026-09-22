import { After, Before, setDefaultTimeout, Status } from "@cucumber/cucumber"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { CapabilityWorld } from "./world.ts"

import { startProvider } from "./provider.ts"
import { stopSite } from "./server.ts"

setDefaultTimeout(120000)
Before(async function(this: CapabilityWorld, { pickle }) {
  this.directory = await fs.mkdtemp(path.join(os.tmpdir(), "preets-bdd-"))
  this.runtime = pickle.tags.some((tag) => tag.name === "@development") ? "development" : "production"
  this.client.on("error", () => undefined)
  if (pickle.tags.some((tag) => tag.name === "@redis")) await this.client.connect()
  if (pickle.tags.some((tag) => tag.name === "@mock-idp")) await startProvider(this)
})
After({ timeout: 30000 }, async function(this: CapabilityWorld, { result }) {
  const errors: unknown[] = []
  const attempt = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
    } catch (error) {
      errors.push(error)
    }
  }
  if (result?.status === Status.FAILED) {
    this.attach(this.logs, "text/plain")
    if (this.page) {
      await attempt(async () => {
        if (this.page) this.attach(await this.page.screenshot(), "image/png")
      })
    }
  }
  await attempt(async () => {
    await this.browser?.close()
  })
  await attempt(async () => {
    await stopSite(this)
  })
  await attempt(async () => {
    if (this.provider) {
      this.provider.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        this.provider?.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      )
    }
  })
  await attempt(async () => {
    if (!this.client.isOpen) return
    for await (const keys of this.client.scanIterator({ MATCH: `${this.config.keyPrefix}*` })) {
      if (keys.length) await this.client.del(keys)
    }
  })
  if (this.client.isOpen) this.client.destroy()
  await attempt(async () => {
    if (this.directory) await fs.rm(this.directory, { force: true, recursive: true })
  })
  if (errors.length) throw new AggregateError(errors, "BDD cleanup failed")
})
