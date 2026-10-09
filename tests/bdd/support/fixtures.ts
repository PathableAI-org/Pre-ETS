import type { AppWorld } from "./world.ts"

export function sessionCookieHeader(world: AppWorld): Record<string, string> {
  return world.cookie === undefined ? {} : { Cookie: `pathable-session=${world.cookie}` }
}
