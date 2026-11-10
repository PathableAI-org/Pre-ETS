"use client"

import { Button, Form, Text } from "@pathableai/react"

import {
  CoordinationTagField,
  type ProtectedFormAction,
  useSessionConfirmedActionState
} from "../../providers/session-confirmation.tsx"
import { initialReferenceActionState, type ReferenceActionState } from "./action-state.ts"

/** A rejected invocation (gate 401, 403, 503, or a transport failure) is announced as a denial; nothing retries. */
const notPerformed: ReferenceActionState = { _tag: "Denied", message: "The operation was not performed." }

export function ReferenceOperation({ action }: { readonly action: ProtectedFormAction<ReferenceActionState> }) {
  const [state, submit, pending] = useSessionConfirmedActionState(
    action,
    initialReferenceActionState,
    notPerformed
  )
  return (
    <Form action={submit}>
      <CoordinationTagField />
      <Button disabled={pending} type="submit">Record reference operation</Button>
      <Text aria-live="polite" role="status">{state._tag === "Ready" ? "" : state.message}</Text>
    </Form>
  )
}
