import { Container, Heading, Page, Stack, Text } from "@pathableai/react"
import { redirect } from "next/navigation"

import { ReferenceOperation } from "../../features/session-reference.ts"
import { runReferenceOperation } from "./actions.ts"
import { readRequestSession } from "./session-request.ts"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const resolved = await readRequestSession()
  if (resolved.session._tag === "NoUsableSession") redirect("/auth/login")
  const { session } = resolved
  return (
    <Page>
      <Container>
        <Stack gap="md">
          <Heading level={1}>Reference session</Heading>
          <Text>{session.identity.subject}</Text>
          <Text>{session.identity.issuer}</Text>
          <Text>{session.tenantAlias}</Text>
          <Text>{String(session.idleDeadlineEpochMilliseconds)}</Text>
          <Text>{String(session.warningLeadMinutes)}</Text>
          <ReferenceOperation action={runReferenceOperation} />
        </Stack>
      </Container>
    </Page>
  )
}
