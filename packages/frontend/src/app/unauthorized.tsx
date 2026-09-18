import { Alert, Container, Heading, Page, Stack, Text } from "@pathableai/react"
import Link from "next/link"

/**
 * Auth-interrupt surface when an authenticated session header fails Redis re-validation
 * (stale cookie / missing idle shape / store miss). Prefer a clean re-entry over crashing SSR.
 */
export default function UnauthorizedPage() {
  return (
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Sign-in required</Heading>
          <Alert heading="Your session is no longer valid" status="warning">
            Clear site cookies for this host if this keeps happening, then open the home page again to sign in.
          </Alert>
          <Text>
            <Link href="/">Return home</Link> to start a new session.
          </Text>
        </Stack>
      </Container>
    </Page>
  )
}
