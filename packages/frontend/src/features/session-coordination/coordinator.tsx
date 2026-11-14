"use client"

import type { SessionCoordinationSnapshot, SessionEndCause } from "@pathableai/pre-ets-frontend-services"

import { Alert, Inline, Text } from "@pathableai/react"
import { type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react"

import { SessionConfirmationProvider } from "../../providers/session-confirmation.tsx"
import { focusTargetProps, moveFocus, recordLoginActivation } from "../../shared/browser-tracing.ts"
import { SessionEndNotice } from "../../shared/session-recovery.ts"
import { LogoutControl } from "./logout-control.tsx"
import { SignedOutNotice } from "./signed-out-notice.tsx"
import { TabCoordination, type TabView, type TabViewState } from "./tab-coordination.ts"

const initialState: TabViewState = { concealed: false, endedHere: false, view: "active" }

const logoutFailedAlert = (
  <Alert heading="Logout was not completed" role="alert" status="error">
    <Text>Protected content is hidden. Try Log out again.</Text>
  </Alert>
)

/** How each running view presents the header and content; `ended` and `recovery` unmount both. */
const VIEW_PRESENTATION: Readonly<
  Record<Exclude<TabView, "ended" | "recovery">, { readonly alert: ReactNode; readonly busy: boolean }>
> = {
  active: { alert: null, busy: false },
  "logging-out": { alert: null, busy: true },
  "logout-failed": { alert: logoutFailedAlert, busy: false }
}

/**
 * Renders the header with Log out, then the protected content. Temporary concealment hides the content from view,
 * keyboard, and assistive technology while keeping its state; after the session ends the content is unmounted. A
 * denied action in this tab replaces both with recovery content (#157 research D6).
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

  // Runs before the controller effect, so a controller for a new session starts from the latest snapshot.
  useEffect(() => {
    latest.current = snapshot
    controller.current?.update(snapshot)
  }, [snapshot])

  // One controller per session: a route refresh of the same session updates it instead of replacing it.
  useEffect(() => {
    const coordination = new TabCoordination(latest.current, setState, () => content.current)
    controller.current = coordination
    const stop = coordination.start()
    return () => {
      stop()
      controller.current = undefined
    }
  }, [tag])

  const actions = useMemo(() => ({
    confirm: async () => {
      await controller.current?.confirm()
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
      <SessionBody content={content} onLogout={actions.logout} state={state}>{children}</SessionBody>
    </SessionConfirmationProvider>
  )
}

function SessionAnnouncement({ state }: { readonly state: TabViewState }) {
  if (state.view === "ended") return <SignedOutNotice initiating={state.endedHere} />
  // Recovery is announced by moving focus to its heading.
  if (state.view === "recovery") return null
  if (state.concealed && state.view !== "logout-failed") return <Text>Checking your session…</Text>
  return null
}

/** The header and protected content of a running view; recovery content instead after a denial; nothing once ended. */
function SessionBody({
  children,
  content,
  onLogout,
  state
}: {
  readonly children: ReactNode
  readonly content: Ref<HTMLDivElement>
  readonly onLogout: () => void
  readonly state: TabViewState
}) {
  if (state.view === "recovery") return <RecoveryNotice cause={state.recovery ?? "unknown"} />
  if (state.view === "ended") return null
  const presentation = VIEW_PRESENTATION[state.view]
  return (
    <>
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
    </>
  )
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
