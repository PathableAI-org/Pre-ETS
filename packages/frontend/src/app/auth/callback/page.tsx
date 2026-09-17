import { Alert, Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"

export const dynamic = "force-dynamic"

/**
 * Fallback only: Proxy handles `/auth/callback` document navigations via
 * `completeLogin` and redirects away before this page renders on the happy path.
 */
export default function AuthCallbackPage() {
  return (
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Authentication return</Heading>
          <Alert heading="Sign-in could not continue" status="info">
            The identity provider return was not completed by the request boundary. Return home and try again.
          </Alert>
          <Text>
            <Link href="/">Return to the application entry</Link>
          </Text>
        </Stack>
      </Container>
    </Page>
  )
}
