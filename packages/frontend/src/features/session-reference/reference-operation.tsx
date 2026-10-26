"use client"

import { Button, Form, Text } from "@pathableai/react"
import { useActionState } from "react"

import { initialReferenceActionState, type ReferenceActionState } from "./action-state.ts"

export function ReferenceOperation({
  action
}: {
  readonly action: (previousState: ReferenceActionState, formData: FormData) => Promise<ReferenceActionState>
}) {
  const [state, submit, pending] = useActionState(action, initialReferenceActionState)
  return (
    <Form action={submit}>
      <Button disabled={pending} type="submit">Record reference operation</Button>
      <Text aria-live="polite" role="status">{state._tag === "Ready" ? "" : state.message}</Text>
    </Form>
  )
}
