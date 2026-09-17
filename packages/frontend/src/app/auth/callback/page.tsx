import { Alert, Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"

export const dynamic = "force-dynamic"

/**
 * Reserved authentication return path. Callback code exchange is out of scope;
 * Proxy pass-through must not re-enter login initiation.
 */
export default function AuthCallbackPage() {
  return (
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Authentication return</Heading>
          <Alert heading="Callback not completed" status="info">
            This path is reserved for the identity provider return. Sign-in completion is not available in this release.
          </Alert>
          <Text>
            <Link href="/">Return to the application entry</Link>
          </Text>
        </Stack>
      </Container>
    </Page>
  )
}
