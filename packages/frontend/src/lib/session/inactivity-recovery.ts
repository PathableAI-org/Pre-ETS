import { parseSessionContextJson, type SessionContext } from "./types.ts"

export interface InactivityRecoveryLatch {
  readonly generation: number
  readonly sessionId: string
}

/**
 * Parse Proxy-forwarded inactivity recovery headers into a generation latch.
 */
export function parseInactivityRecoveryLatch(
  rawContext: null | string,
  rawGeneration: null | string
): InactivityRecoveryLatch | undefined {
  const context = parseRecoveryContext(rawContext)
  const generation = parseRecoveryGeneration(rawGeneration)
  if (context === undefined || generation === undefined) {
    return undefined
  }
  if (context.userId !== undefined) {
    return undefined
  }
  return { generation, sessionId: context.sessionId }
}

function parseRecoveryContext(rawContext: null | string): SessionContext | undefined {
  if (rawContext === null || rawContext === "") {
    return undefined
  }
  return parseSessionContextJson(rawContext)
}

function parseRecoveryGeneration(rawGeneration: null | string): number | undefined {
  if (rawGeneration === null || rawGeneration === "") {
    return undefined
  }
  const generation = Number(rawGeneration)
  if (!Number.isSafeInteger(generation) || generation < 1) {
    return undefined
  }
  return generation
}
