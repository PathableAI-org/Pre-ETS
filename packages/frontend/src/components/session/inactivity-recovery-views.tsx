"use client"

import { Alert, Button, Container, Page, Stack, Text } from "@pathableai/react"

import { InactivityEndedModal } from "./inactivity-ended-modal.tsx"

/** Generic auth-unavailable lock — never uses inactivity copy. */
export function AuthUnavailableLockView({
  onRetry
}: {
  readonly onRetry: () => void
}) {
  return (
    <Page>
      <Container>
        <Stack gap="md">
          <Alert heading="Authorization unavailable" status="warning">
            We could not verify your session. Protected content is locked until access is confirmed.
          </Alert>
          <Button
            data-testid="auth-unavailable-retry"
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
 * "Log in again" submits the dedicated CSRF login-again Server Action.
 */
export function InactivityClearedView({
  modalOpen
}: {
  readonly modalOpen: boolean
}) {
  return (
    <>
      <Page>
        <Container>
          <Stack gap="md">
            <Text>
              Protected content was cleared after confirmed inactivity.
            </Text>
          </Stack>
        </Container>
      </Page>
      <InactivityEndedModal open={modalOpen} />
    </>
  )
}
