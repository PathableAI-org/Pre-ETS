import { cleanupKeys } from "./redis.ts"
import { cleanupTenantDirectory } from "./tenant-directory.ts"

export default async function cleanup(): Promise<void> {
  try {
    await cleanupKeys()
  } finally {
    cleanupTenantDirectory()
  }
}
