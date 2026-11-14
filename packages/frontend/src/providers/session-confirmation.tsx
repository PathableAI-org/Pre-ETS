"use client"

import type { SessionEndCause } from "@pathableai/pre-ets-frontend-services"

import { Form } from "@pathableai/react"
import {
  Component,
  createContext,
  type ReactNode,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

import { readActionDenial } from "./action-denial.ts"
import { COORDINATION_TAG_FIELD } from "./coordination-tag-field.ts"

/** A protected Server Action as `useActionState` invokes it. */
export type ProtectedFormAction<State> = (previousState: State, formData: FormData) => Promise<State>

interface SessionConfirmationValue {
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string | undefined
  readonly deny: (cause: SessionEndCause | undefined) => Promise<boolean>
}

/** Outside a provider (public pages), confirmation resolves without effect, there is no tag, and nothing recovers. */
const SessionConfirmation = createContext<SessionConfirmationValue>({
  confirm: () => Promise.resolve(),
  coordinationTag: undefined,
  deny: () => Promise.resolve(false)
})

/** Catches the rejection React rethrows from a failed action; renders nothing until the form is started again. */
class RejectionBoundary extends Component<
  { readonly children: ReactNode; readonly onRejected: (error: unknown) => void },
  { readonly rejected: boolean }
> {
  override state = { rejected: false }

  static getDerivedStateFromError() {
    return { rejected: true }
  }

  override componentDidCatch(error: unknown) {
    this.props.onRejected(error)
  }

  override render() {
    return this.state.rejected ? null : this.props.children
  }
}

/**
 * A progressively enhanced protected action form (research D4). The Server Function goes to `useActionState`
 * unwrapped, so the server-rendered form submits without scripts as a navigation `POST` that Next decodes as the
 * action. A rejected invocation (gate 401, 403, 503, or a transport failure) reaches a private error boundary, which
 * offers it to the coordinator with the gate's cause token, if any (#157 research D3, D6). Unless the coordinator
 * replaced the tab with recovery, the form starts again from `notPerformed`; nothing retries. The tab confirms its
 * session after every settled action, because the gate's renewal is otherwise invisible to other tabs (research D6).
 */
export function ProtectedActionForm<State>({
  action,
  children,
  initialState,
  notPerformed
}: {
  readonly action: ProtectedFormAction<Awaited<State>>
  readonly children: (state: Awaited<State>, pending: boolean) => ReactNode
  readonly initialState: Awaited<State>
  readonly notPerformed: Awaited<State>
}): ReactNode {
  const { deny } = useContext(SessionConfirmation)
  const [rejections, setRejections] = useState(0)
  // `deny` reads the session status itself, so a rejection needs no separate confirmation.
  const settleRejection = useCallback((error: unknown) => {
    void deny(readActionDenial(error)).then((recovered) => {
      if (!recovered) setRejections((count) => count + 1)
    })
  }, [deny])
  return (
    <RejectionBoundary key={rejections} onRejected={settleRejection}>
      <ActionForm action={action} initialState={rejections === 0 ? initialState : notPerformed}>
        {children}
      </ActionForm>
    </RejectionBoundary>
  )
}

/**
 * Gives protected Server Action consumers the tab's observed coordination tag, which their forms submit so the action
 * can refuse a stale tab (research D2), a confirmation to run after the action settles (research D6), and `deny`,
 * which answers whether the coordinator replaced the tab with recovery after a rejection (#157 research D6).
 */
export function SessionConfirmationProvider({
  children,
  confirm,
  coordinationTag,
  deny
}: {
  readonly children: ReactNode
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string
  readonly deny: (cause: SessionEndCause | undefined) => Promise<boolean>
}): ReactNode {
  const value = useMemo(() => ({ confirm, coordinationTag, deny }), [confirm, coordinationTag, deny])
  return <SessionConfirmation value={value}>{children}</SessionConfirmation>
}

function ActionForm<State>({
  action,
  children,
  initialState
}: {
  readonly action: ProtectedFormAction<Awaited<State>>
  readonly children: (state: Awaited<State>, pending: boolean) => ReactNode
  readonly initialState: Awaited<State>
}): ReactNode {
  const { confirm } = useContext(SessionConfirmation)
  const [state, submit, pending] = useActionState(action, initialState)
  const mountedState = useRef(state)
  useEffect(() => {
    if (state !== mountedState.current) void confirm()
  }, [confirm, state])
  return (
    <Form action={submit}>
      <CoordinationTagField />
      {children(state, pending)}
    </Form>
  )
}

/** The hidden field carrying the tab's observed coordination tag in a protected Server Action form (research D2). */
function CoordinationTagField(): ReactNode {
  const { coordinationTag } = useContext(SessionConfirmation)
  return <input name={COORDINATION_TAG_FIELD} type="hidden" value={coordinationTag ?? ""} />
}
