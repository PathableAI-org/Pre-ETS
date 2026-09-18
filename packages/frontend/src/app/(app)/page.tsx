import { Alert, Button, Card, Container, Heading, Page, Stack, Text } from "@pathableai/react"

import { UnsentPracticeNoteFixture } from "../../components/session/unsent-practice-note-fixture.tsx"
import { getRequestSession } from "../../lib/session/index.ts"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const { context, tenantConfig } = await getRequestSession()
  const authenticated = context.userId !== undefined

  return (
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Welcome to the Pre-ETS workspace</Heading>
          <Text>{`Tenant: ${tenantConfig.displayName}`}</Text>
          {context.userName !== undefined
            ? <Text>{`Signed in as: ${context.userName}`}</Text>
            : null}
          {authenticated ? <UnsentPracticeNoteFixture /> : null}
          <Text>
            This Next.js App Router landing page is server-rendered with PathAble React components.
          </Text>
          <Alert heading="PathAble React is connected" status="info">
            Server-safe PathAble components are available for upcoming Pre-ETS screens.
          </Alert>
          <Card title="Pre-ETS operations">
            <Stack gap="md">
              <Text>
                Use this application to support Pre-ETS operations. Additional workflows will land here.
              </Text>
              <Button type="button" variant="primary">
                Continue to Pre-ETS
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </Page>
  )
}
