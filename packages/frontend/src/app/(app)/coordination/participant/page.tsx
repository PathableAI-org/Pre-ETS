import { Container, Page } from "@pathableai/react"

import { ParticipantFixture } from "../../../../features/coordination-fixtures.ts"

export const dynamic = "force-dynamic"

export default function ParticipantPage() {
  return (
    <Page>
      <Container>
        <ParticipantFixture />
      </Container>
    </Page>
  )
}
