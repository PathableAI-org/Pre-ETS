"use client"

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

/** Catches the rejection React rethrows from a failed action; renders nothing until the form is started again. */
class RejectionBoundary extends Component<
  { readonly children: ReactNode; readonly onRejected: () => void },
  { readonly rejected: boolean }
> {
  override state = { rejected: false }

  static getDerivedStateFromError() {
    return { rejected: true }
  }

  override componentDidCatch() {
    this.props.onRejected()
  }

  override render() {
    return this.state.rejected ? null : this.props.children
  }
}

/**
 * A progressively enhanced protected action form (research D4). The Server Function goes to `useActionState`
 * unwrapped, so the server-rendered form submits without scripts as a navigation `POST` that Next decodes as the
 * action. A rejected invocation (gate 401, 403, 503, or a transport failure) reaches a private error boundary and the
 * form starts again from `notPerformed`; nothing retries. The tab confirms its session after every settled action,
 * because the gate's renewal is otherwise invisible to other tabs (research D6).
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
  const { confirm } = useContext(SessionConfirmation)
  const [rejections, setRejections] = useState(0)
  const settleRejection = useCallback(() => {
    setRejections((count) => count + 1)
    void confirm()
  }, [confirm])
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
