import fs from "node:fs/promises"

import type { AppWorld } from "./world.ts"

export async function cleanupTenantFixtures(world: AppWorld): Promise<void> {
  for (const restrictedPath of world.restrictedPaths) await fs.chmod(restrictedPath, 0o700)
  if (world.ownedDirectory) await fs.rm(world.ownedDirectory, { force: true, recursive: true })
}

export function sessionCookieHeader(world: AppWorld): Record<string, string> {
  return world.cookie === undefined ? {} : { Cookie: `pathable-session=${world.cookie}` }
}
