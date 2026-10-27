import { readSessionRequest, SESSION_COOKIE } from "@pathableai/pre-ets-frontend-services"
import { Container, Heading, Page, Stack, Text } from "@pathableai/react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { ReferenceOperation } from "../../features/session-reference.ts"
import { runReferenceOperation } from "./actions.ts"

export const dynamic = "force-dynamic"

const requestReference = async () => {
  const host = (await headers()).get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  return readSessionRequest(reference === undefined ? { host } : { host, reference })
}

export default async function HomePage() {
  const resolved = await requestReference()
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
