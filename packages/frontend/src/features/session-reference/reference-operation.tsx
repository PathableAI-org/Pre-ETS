"use client"

import { Button, Text } from "@pathableai/react"

import { ProtectedActionForm, type ProtectedFormAction } from "../../providers/session-confirmation.tsx"
import { initialReferenceActionState, type ReferenceActionState } from "./action-state.ts"

/** A rejected invocation (gate 401, 403, 503, or a transport failure) is announced as a denial; nothing retries. */
const notPerformed: ReferenceActionState = { _tag: "Denied", message: "The operation was not performed." }

export function ReferenceOperation({ action }: { readonly action: ProtectedFormAction<ReferenceActionState> }) {
  return (
    <ProtectedActionForm action={action} initialState={initialReferenceActionState} notPerformed={notPerformed}>
      {(state, pending) => (
        <>
          <Button disabled={pending} type="submit">Record reference operation</Button>
          <Text aria-live="polite" role="status">{state._tag === "Ready" ? "" : state.message}</Text>
        </>
      )}
    </ProtectedActionForm>
  )
}
