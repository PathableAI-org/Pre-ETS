import fs from "node:fs/promises"

import { cleanupKeys } from "./redis.ts"

export default async function cleanup(): Promise<void> {
  try {
    await cleanupKeys()
  } finally {
    if (process.env.E2E_TENANT_DIRECTORY) {
      await fs.rm(process.env.E2E_TENANT_DIRECTORY, { force: true, recursive: true })
    }
  }
}
