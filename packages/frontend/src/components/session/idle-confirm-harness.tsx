"use client"

import { Button, Stack, Text } from "@pathableai/react"

import { useIdleConfirmHarness } from "./idle-confirm-harness-context.tsx"

/**
 * TEMP harness — remove in PR5/PR6 once modal path + production recovery are visible.
 * Shows last confirm outcome and client schedule; does not invent inactivity from timers.
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
      {/* TEMP harness — remove in PR5/PR6 */}
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
