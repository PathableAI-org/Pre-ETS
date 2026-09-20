"use client"

import { Alert, Container, Page, Stack, Text } from "@pathableai/react"

import { InactivityEndedModal } from "./inactivity-ended-modal.tsx"

/** Generic auth-unavailable lock — never uses inactivity copy. */
export function AuthUnavailableLockView() {
  return (
    <Page>
      <Container>
        <Stack gap="md">
          <Alert heading="Authorization unavailable" status="warning">
            We could not verify your session. Protected content is locked until access is confirmed.
          </Alert>
          <Text>Try refreshing the page or signing in again.</Text>
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
