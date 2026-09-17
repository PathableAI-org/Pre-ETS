import { Alert, Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"

export const dynamic = "force-dynamic"

/**
 * App-owned provider / transaction failure page (outside `(app)`).
 * Works without a session cookie. Distinct from HTTP 403 config refusal.
 */
export default function LoginUnavailablePage() {
  return (
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Login cannot start</Heading>
          <Alert heading="Provider unavailable" status="warning">
            The identity provider could not be reached or login could not be prepared. No application access was
            granted.
          </Alert>
          <Text>
            Confirm the local provider is running, then try again from the application entry.
          </Text>
          <Text>
            <Link href="/">Try again</Link>
          </Text>
        </Stack>
      </Container>
    </Page>
  )
}
