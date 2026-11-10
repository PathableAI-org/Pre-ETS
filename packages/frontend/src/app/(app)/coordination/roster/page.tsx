import { Container, Page } from "@pathableai/react"

import { RosterFixture } from "../../../../features/coordination-fixtures.ts"
import { recordFixtureOperation } from "../actions.ts"
export const dynamic = "force-dynamic"

export default function RosterPage() {
  return (
    <Page>
      <Container>
        <RosterFixture action={recordFixtureOperation} />
      </Container>
    </Page>
  )
}
