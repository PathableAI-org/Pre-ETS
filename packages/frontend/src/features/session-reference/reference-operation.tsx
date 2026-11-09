"use client"

import { Button, Form, Text } from "@pathableai/react"
import { useActionState } from "react"

import { initialReferenceActionState, type ReferenceActionState } from "./action-state.ts"

/** A rejected invocation (gate 401, 403, 503, or a transport failure) is announced as a denial; nothing retries. */
const notPerformed: ReferenceActionState = { _tag: "Denied", message: "The operation was not performed." }

export function ReferenceOperation({
  action
}: {
  readonly action: (previousState: ReferenceActionState, formData: FormData) => Promise<ReferenceActionState>
}) {
  const [state, submit, pending] = useActionState(
    (previousState: ReferenceActionState, formData: FormData) =>
      action(previousState, formData).catch(() => notPerformed),
    initialReferenceActionState
  )
  return (
    <Form action={submit}>
      <Button disabled={pending} type="submit">Record reference operation</Button>
      <Text aria-live="polite" role="status">{state._tag === "Ready" ? "" : state.message}</Text>
    </Form>
  )
}
