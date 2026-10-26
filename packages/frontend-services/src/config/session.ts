import { Config } from "effect"

/** Versioned prefix for frontend-owned session keys. Tests supply an owned prefix. */
export const SessionKeyPrefix = Config.String("SESSION_KEY_PREFIX").pipe(
  Config.withDefault("preets:session:v1")
)
