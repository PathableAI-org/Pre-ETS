import type { TrustedIdentity } from "../authentication.js"

/**
 * Fail-closed stand-in until B6/#158 supplies the authentication-time comparison.
 * Production leaves every trusted identity unconfirmed. Adapter tests replace
 * `confirmed` to exercise establishment without choosing that policy.
 */
export const callbackFreshnessPolicy = {
  confirmed(_identity: TrustedIdentity): boolean {
    return false
  }
}
