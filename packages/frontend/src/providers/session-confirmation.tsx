"use client"

import { createContext, type ReactNode, useActionState, useContext } from "react"

/** A protected Server Action as `useActionState` invokes it. */
export type ProtectedFormAction<State> = (previousState: State, formData: FormData) => Promise<State>

const withoutEffect = (): Promise<void> => Promise.resolve()

/** Outside a provider (public pages), confirmation resolves without effect. */
const SessionConfirmation = createContext<() => Promise<void>>(withoutEffect)

/** Lets a protected Server Action consumer ask the tab to confirm and share its session after the action settles. */
export function SessionConfirmationProvider({
  children,
  confirm
}: {
  readonly children: ReactNode
  readonly confirm: () => Promise<void>
}): ReactNode {
  return <SessionConfirmation value={confirm}>{children}</SessionConfirmation>
}

/**
 * `useActionState` for a protected Server Action. A rejected invocation settles as `notPerformed`; either way the tab
 * then confirms its session, because the gate's renewal is otherwise invisible to other tabs (research D6).
 */
export function useSessionConfirmedActionState<State>(
  action: ProtectedFormAction<Awaited<State>>,
  initialState: Awaited<State>,
  notPerformed: Awaited<State>
) {
  const confirm = useContext(SessionConfirmation)
  return useActionState(async (previousState: Awaited<State>, formData: FormData) => {
    const settled = await action(previousState, formData).catch(() => notPerformed)
    await confirm()
    return settled
  }, initialState)
}
