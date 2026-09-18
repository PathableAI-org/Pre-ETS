"use client"

import { Alert, Button, Container, Page, Stack, Text } from "@pathableai/react"

import { InactivityEndedModal } from "./inactivity-ended-modal.tsx"

/** Generic auth-unavailable lock — never uses inactivity copy. */
export function AuthUnavailableLockView({
  lastOutcomeLabel,
  onRetry
}: {
  readonly lastOutcomeLabel: string
  readonly onRetry: () => void
}) {
  return (
    <Page>
      <Container>
        <Stack gap="md">
          <div data-testid="temp-confirm-lock-unavailable">
            <Alert heading="Authorization unavailable" status="warning">
              We could not verify your session. Protected content is locked until access is confirmed.
            </Alert>
          </div>
          {/* TEMP — remove in PR6 with confirm harness. */}
          <Text data-testid="temp-confirm-outcome">
            {`Confirm: ${lastOutcomeLabel}`}
          </Text>
          <Button
            data-testid="temp-confirm-retry"
            onClick={onRetry}
            type="button"
            variant="secondary"
          >
            Try again
          </Button>
          <Text>Or refresh the page / sign in again.</Text>
        </Stack>
      </Container>
    </Page>
  )
}

/**
 * Cleared protected UI + PathAble inactivity Modal after established cause.
 * "Log in again" remains close-only until PR6.
 */
export function InactivityClearedView({
  lastOutcomeLabel,
  modalOpen,
  onModalClose
}: {
  readonly lastOutcomeLabel: string
  readonly modalOpen: boolean
  readonly onModalClose: () => void
}) {
  return (
    <>
      <Page>
        <Container>
          <Stack gap="md">
            <Text>
              Protected content was cleared after confirmed inactivity.
            </Text>
            {/* TEMP — shrink leftover from PR4; remove in PR6 with confirm harness. */}
            <Text data-testid="temp-confirm-outcome">
              {`Confirm: ${lastOutcomeLabel}`}
            </Text>
          </Stack>
        </Container>
      </Page>
      <InactivityEndedModal onClose={onModalClose} open={modalOpen} />
    </>
  )
}
