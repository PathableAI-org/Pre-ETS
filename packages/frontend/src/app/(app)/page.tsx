import { Alert, Button, Card, Container, Heading, Page, Stack, Text } from "@pathableai/react"

import { IdleConfirmHarness } from "../../components/session/idle-confirm-harness.tsx"
import { InactivityModalHarness } from "../../components/session/inactivity-modal-harness.tsx"
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
          <Text>
            This Next.js App Router landing page is server-rendered with PathAble React components.
          </Text>
          <Alert heading="PathAble React is connected" status="info">
            Server-safe PathAble components are available for upcoming Pre-ETS screens.
          </Alert>
          {/* TEMP harness — remove in PR5 when modal opens from confirmed inactivity. */}
          <InactivityModalHarness />
          {/* TEMP harness — remove in PR5/PR6 once confirm+modal path is visible. */}
          {authenticated ? <IdleConfirmHarness /> : null}
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
