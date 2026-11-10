"use client"

import { createContext, type ReactNode, useActionState, useContext, useMemo } from "react"

import { COORDINATION_TAG_FIELD } from "./coordination-tag-field.ts"

/** A protected Server Action as `useActionState` invokes it. */
export type ProtectedFormAction<State> = (previousState: State, formData: FormData) => Promise<State>

interface SessionConfirmationValue {
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string | undefined
}

/** Outside a provider (public pages), confirmation resolves without effect and there is no tag. */
const SessionConfirmation = createContext<SessionConfirmationValue>({
  confirm: () => Promise.resolve(),
  coordinationTag: undefined
})

/** The hidden field carrying the tab's observed coordination tag in a protected Server Action form (research D2). */
export function CoordinationTagField(): ReactNode {
  const { coordinationTag } = useContext(SessionConfirmation)
  return <input name={COORDINATION_TAG_FIELD} type="hidden" value={coordinationTag ?? ""} />
}

/**
 * Gives protected Server Action consumers the tab's observed coordination tag, which their forms submit so the action
 * can refuse a stale tab (research D2), and a confirmation to run after the action settles (research D6).
 */
export function SessionConfirmationProvider({
  children,
  confirm,
  coordinationTag
}: {
  readonly children: ReactNode
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string
}): ReactNode {
  const value = useMemo(() => ({ confirm, coordinationTag }), [confirm, coordinationTag])
  return <SessionConfirmation value={value}>{children}</SessionConfirmation>
}

/**
 * `useActionState` for a protected Server Action whose form renders {@link CoordinationTagField}. A rejected invocation settles as `notPerformed`; either way the tab then confirms its
 * session, because the gate's renewal is otherwise invisible to other tabs (research D6).
 */
export function useSessionConfirmedActionState<State>(
  action: ProtectedFormAction<Awaited<State>>,
  initialState: Awaited<State>,
  notPerformed: Awaited<State>
) {
  const { confirm } = useContext(SessionConfirmation)
  return useActionState(async (previousState: Awaited<State>, formData: FormData) => {
    const settled = await action(previousState, formData).catch(() => notPerformed)
    await confirm()
    return settled
  }, initialState)
}
