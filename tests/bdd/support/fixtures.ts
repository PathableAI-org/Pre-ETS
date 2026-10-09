import type { AppWorld } from "./world.ts"

import { SESSION_COOKIE_NAME } from "../../../packages/frontend/src/lib/session/types.ts"

export function sessionCookieHeader(world: AppWorld): Record<string, string> {
  return world.cookie === undefined ? {} : { Cookie: `${SESSION_COOKIE_NAME}=${world.cookie}` }
}
