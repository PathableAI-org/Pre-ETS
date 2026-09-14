import { Alert, Button, Card, Container, Heading, Page, Stack, Text } from "@pathableai/react"

import { getCurrentTenant, getCurrentTenantConfig } from "../../lib/tenant/index.ts"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const tenant = await getCurrentTenant()
  const config = await getCurrentTenantConfig(tenant)

  return (
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Welcome to the Pre-ETS workspace</Heading>
          <Text>{`Tenant: ${config.displayName}`}</Text>
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
