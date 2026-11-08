import { Context } from "effect"

import type { TrustedIdentity } from "../authentication.js"

/**
 * Fail-closed stand-in until B6/#158 supplies the authentication-time comparison.
 * The default leaves every trusted identity unconfirmed. Adapter tests provide a
 * different value to exercise establishment without choosing that policy.
 */
export const CallbackFreshness = Context.Reference<{
  readonly confirmed: (identity: TrustedIdentity) => boolean
}>("CallbackFreshness", { defaultValue: () => ({ confirmed: () => false }) })
