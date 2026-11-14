"use client"

import { Button, FormGroup, Heading, Input, Label, Link, Stack, Text } from "@pathableai/react"
import { useRouter } from "next/navigation"

import { ProtectedActionForm, type ProtectedFormAction } from "../../providers/session-confirmation.tsx"
import { type FixtureActionState, initialFixtureActionState } from "./action-state.ts"

const SYNTHETIC_ROSTER = ["Participant A", "Participant B", "Participant C"] as const
const notRecorded: FixtureActionState = { _tag: "Denied", message: "The attendance note was not recorded." }

/**
 * Synthetic protected roster for multi-tab evidence; no real participant data. Its Server Action form confirms and
 * shares the session after it settles (research D6). "Open participant page in place" navigates through the App
 * Router, the fixture's RSC request; the `Link` stays a document navigation. The design-system `Link` has no router
 * composition yet (PathableAI-org/styles#262).
 */
export function RosterFixture({ action }: { readonly action: ProtectedFormAction<FixtureActionState> }) {
  const router = useRouter()
  return (
    <Stack gap="md">
      <Heading level={1}>Coordination roster</Heading>
      <Text>Synthetic roster for session coordination checks.</Text>
      <ul>
        {SYNTHETIC_ROSTER.map((name) => <li key={name}>{name}</li>)}
      </ul>
      <Link href="/coordination/participant">Open participant page</Link>
      <Button
        onClick={() => {
          router.push("/coordination/participant")
        }}
        type="button"
      >
        Open participant page in place
      </Button>
      <ProtectedActionForm action={action} initialState={initialFixtureActionState} notPerformed={notRecorded}>
        {(outcome, recording) => (
          <>
            <FormGroup>
              <Label htmlFor="roster-attendance-note">Attendance note</Label>
              <Input id="roster-attendance-note" name="note" type="text" />
            </FormGroup>
            <Button disabled={recording} type="submit">Record attendance note</Button>
            <Text aria-live="polite" role="status">{outcome._tag === "Ready" ? "" : outcome.message}</Text>
          </>
        )}
      </ProtectedActionForm>
    </Stack>
  )
}
