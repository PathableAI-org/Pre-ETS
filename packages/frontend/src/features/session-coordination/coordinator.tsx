"use client"

import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { Alert, Inline, Text } from "@pathableai/react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

import { SessionConfirmationProvider } from "../../providers/session-confirmation.tsx"
import { LogoutControl } from "./logout-control.tsx"
import { SignedOutNotice } from "./signed-out-notice.tsx"
import { TabCoordination, type TabView, type TabViewState } from "./tab-coordination.ts"

const initialState: TabViewState = { concealed: false, endedHere: false, view: "active" }

const logoutFailedAlert = (
  <Alert heading="Logout was not completed" role="alert" status="error">
    <Text>Protected content is hidden. Try Log out again.</Text>
  </Alert>
)

/** How each running view presents the header and content; `ended` unmounts both. */
const VIEW_PRESENTATION: Readonly<
  Record<Exclude<TabView, "ended">, { readonly alert: ReactNode; readonly busy: boolean }>
> = {
  active: { alert: null, busy: false },
  "logging-out": { alert: null, busy: true },
  "logout-failed": { alert: logoutFailedAlert, busy: false }
}

/**
 * Renders the header with Log out, then the protected content. Temporary concealment hides the content from view,
 * keyboard, and assistive technology while keeping its state; after the session ends the content is unmounted.
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
    logout: () => {
      void controller.current?.logout()
    }
  }), [])

  return (
    <SessionConfirmationProvider confirm={actions.confirm} coordinationTag={snapshot.coordinationTag}>
      <div aria-live="polite" role="status">
        <SessionAnnouncement state={state} />
      </div>
      {state.view === "ended" ? null : (
        <>
          <Inline
            as="header"
            data-session-deadline={state.deadline}
            data-session-warning-lead={state.warningLeadMinutes}
            justify="end"
          >
            <LogoutControl busy={VIEW_PRESENTATION[state.view].busy} onLogout={actions.logout} />
          </Inline>
          {VIEW_PRESENTATION[state.view].alert}
          <div
            hidden={state.concealed}
            inert={state.concealed}
            ref={content}
          >
            {children}
          </div>
        </>
      )}
    </SessionConfirmationProvider>
  )
}

function SessionAnnouncement({ state }: { readonly state: TabViewState }) {
  if (state.view === "ended") return <SignedOutNotice initiating={state.endedHere} />
  if (state.concealed && state.view !== "logout-failed") return <Text>Checking your session…</Text>
  return null
}
