"use client"

import type { SessionCoordinationSnapshot, SessionEndCause } from "@pathableai/pre-ets-frontend-services"

import { Alert, Inline, Text } from "@pathableai/react"
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { flushSync } from "react-dom"

import { SessionConfirmationProvider } from "../../providers/session-confirmation.tsx"
import { focusTargetProps, moveFocus, recordLoginActivation } from "../../shared/browser-tracing.ts"
import { SessionEndNotice } from "../../shared/session-recovery.ts"
import { restoreFocus } from "./blocking.ts"
import { ExpirationModal } from "./expiration-modal.tsx"
import { LogoutControl } from "./logout-control.tsx"
import { SignedOutNotice } from "./signed-out-notice.tsx"
import { TabCoordination, type TabView, type TabViewState } from "./tab-coordination.ts"
import { WarningModal } from "./warning-modal.tsx"

const initialState: TabViewState = { concealed: false, endedHere: false, view: "active" }

const logoutFailedAlert = (
  <Alert heading="Logout was not completed" role="alert" status="error">
    <Text>Protected content is hidden. Try Log out again.</Text>
  </Alert>
)

/** How each running view presents the header and content; `ended`, `expired`, and `recovery` unmount both. */
const VIEW_PRESENTATION: Readonly<
  Record<Exclude<TabView, "ended" | "expired" | "recovery">, { readonly alert: ReactNode; readonly busy: boolean }>
> = {
  active: { alert: null, busy: false },
  "logging-out": { alert: null, busy: true },
  "logout-failed": { alert: logoutFailedAlert, busy: false }
}

/**
 * Renders the header with Log out, then the protected content. Temporary concealment hides the content from view,
 * keyboard, and assistive technology while keeping its state; after the session ends the content is unmounted. A
 * denied action in this tab replaces both with recovery content (#157 research D6), and confirmed expiry with the
 * expiration modal (D8).
 */
export function SessionCoordinator({
  children,
  snapshot
}: {
  readonly children: ReactNode
  readonly snapshot: SessionCoordinationSnapshot
}): ReactNode {
  const [state, setState] = useState(initialState)
  const controller = useRef<TabCoordination | undefined>(undefined)
  const content = useRef<HTMLDivElement>(null)

  const latest = useRef(snapshot)
  const tag = snapshot.coordinationTag
  const noteFocus = useFocusRestoration(state, content)

  // Runs before the controller effect, so a controller for a new session starts from the latest snapshot.
  useEffect(() => {
    latest.current = snapshot
    controller.current?.update(snapshot)
  }, [snapshot])

  // One controller per session: a route refresh of the same session updates it instead of replacing it.
  useEffect(() => {
    // Hiding the modal on `pagehide` commits at once, before the page enters the back/forward cache (#157 FR-018).
    const notify = (next: TabViewState) => {
      noteFocus(next)
      if (next.pageHidden === true) {
        flushSync(() => {
          setState(next)
        })
      } else setState(next)
    }
    const coordination = new TabCoordination(latest.current, notify, () => content.current)
    controller.current = coordination
    const stop = coordination.start()
    return () => {
      stop()
      controller.current = undefined
    }
  }, [noteFocus, tag])

  const actions = useMemo(() => ({
    confirm: async () => {
      await controller.current?.confirm()
    },
    continueSession: () => {
      void controller.current?.continueSession()
    },
    deny: async (cause: SessionEndCause | undefined) => await controller.current?.deny(cause) ?? false,
    logout: () => {
      void controller.current?.logout()
    }
  }), [])

  return (
    <SessionConfirmationProvider
      confirm={actions.confirm}
      coordinationTag={snapshot.coordinationTag}
      deny={actions.deny}
    >
      <div aria-live="polite" role="status">
        <SessionAnnouncement state={state} />
      </div>
      <SessionBody content={content} onContinue={actions.continueSession} onLogout={actions.logout} state={state}>
        {children}
      </SessionBody>
    </SessionConfirmationProvider>
  )
}

function SessionAnnouncement({ state }: { readonly state: TabViewState }) {
  if (state.view === "ended") return <SignedOutNotice initiating={state.endedHere} />
  // Recovery is announced by moving focus to its heading, and expiry by the modal taking focus.
  if (state.view === "recovery" || state.view === "expired") return null
  if (state.concealed && state.view !== "logout-failed") return <Text>Checking your session…</Text>
  return null
}

/**
 * The header and protected content of a running view, with the expiration warning over them while it is open (#156);
 * recovery content instead after a denial; the expiration modal alone after confirmed expiry; nothing once ended.
 */
function SessionBody({
  children,
  content,
  onContinue,
  onLogout,
  state
}: {
  readonly children: ReactNode
  readonly content: Ref<HTMLDivElement>
  readonly onContinue: () => void
  readonly onLogout: () => void
  readonly state: TabViewState
}) {
  if (state.view === "recovery") return <RecoveryNotice cause={state.recovery ?? "unknown"} />
  if (state.view === "expired") return <ExpirationModal hidden={state.pageHidden === true} />
  if (state.view === "ended") return null
  const presentation = VIEW_PRESENTATION[state.view]
  // One element around the header and content, so the warning can make all of it inert without touching the content's
  // own `inert`, which concealment sets.
  return (
    <div>
      <Inline
        as="header"
        data-session-deadline={state.deadline}
        data-session-warning-lead={state.warningLeadMinutes}
        justify="end"
      >
        <LogoutControl busy={presentation.busy} onLogout={onLogout} />
      </Inline>
      {presentation.alert}
      <div hidden={state.concealed} inert={state.concealed} ref={content}>
        {children}
      </div>
      {state.warning === undefined ?
        null :
        <WarningModal continuation={state.warning.continuation} onContinue={onContinue} />}
    </div>
  )
}

/**
 * Gives focus back when the warning closes while the tab stays active (#156 FR-017): to the element that had it when
 * the warning opened, or to the main content. Answers the note of where focus was, which the controller's notification
 * calls before React renders, while the focused element is still the one the user left. When the restoration runs, the
 * warning's own cleanup has lifted the inert background; an ended session places focus in its own view instead.
 */
function useFocusRestoration(state: TabViewState, content: RefObject<HTMLDivElement | null>) {
  const before = useRef<Element | null>(null)
  const noted = useRef(false)
  const note = useCallback((next: TabViewState) => {
    if (next.warning !== undefined && !noted.current) before.current = document.activeElement
    noted.current = next.warning !== undefined
  }, [])
  const open = state.warning !== undefined
  const wasOpen = useRef(false)
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed || state.view !== "active") return
    const container = content.current
    restoreFocus(before.current, container?.querySelector("main") ?? container)
  }, [content, open, state.view])
  return note
}

const recoveryHeadingProps = { ...focusTargetProps("recovery_heading"), tabIndex: -1 }

const recordRecoveryLogIn = () => {
  recordLoginActivation("action_recovery")
}

/**
 * Shown in place of the header and protected content after a denied action in this tab (#157 FR-003, FR-007). Focus
 * moves to the heading so assistive technology announces the explanation; Log in is the shared fresh-entry link.
 */
function RecoveryNotice({ cause }: { readonly cause: SessionEndCause }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    moveFocus(heading.current, "recovery_heading")
  }, [])
  return (
    <SessionEndNotice
      cause={cause}
      headingProps={recoveryHeadingProps}
      headingRef={heading}
      onLogIn={recordRecoveryLogIn}
    />
  )
}
