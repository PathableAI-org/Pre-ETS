"use client"

import { Button, Stack, Text } from "@pathableai/react"

import { useIdleConfirmHarness } from "./idle-confirm-harness-context.tsx"

/**
 * TEMP harness — shrink leftover from PR4. Kept for manual confirm/debug until
 * PR6 removes it. Does not invent inactivity from timers alone.
 */
export function IdleConfirmHarness() {
  const harness = useIdleConfirmHarness()
  if (harness === null) {
    return null
  }

  const nextFireLabel = harness.nextTimerFireAtMs === null
    ? "none"
    : new Date(harness.nextTimerFireAtMs).toISOString()

  return (
    <Stack gap="sm">
      {/* TEMP — remove in PR6 */}
      <Text data-testid="temp-confirm-outcome">
        {`Confirm: ${harness.lastOutcomeLabel}`}
      </Text>
      <Text data-testid="temp-next-timer-fire">
        {`Next timer fire (client schedule): ${nextFireLabel}`}
      </Text>
      <Button
        data-testid="temp-run-confirm-now"
        onClick={() => {
          harness.runConfirmNow()
        }}
        type="button"
        variant="secondary"
      >
        Run confirm now
      </Button>
    </Stack>
  )
}
