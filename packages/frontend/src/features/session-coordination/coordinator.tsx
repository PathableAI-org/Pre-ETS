"use client"

import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { Alert, Inline, Text } from "@pathableai/react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"

import { SessionConfirmationProvider } from "../../providers/session-confirmation.tsx"
import { LogoutControl } from "./logout-control.tsx"
import { SignedOutNotice } from "./signed-out-notice.tsx"
import { TabCoordination, type TabViewState } from "./tab-coordination.ts"

const initialState: TabViewState = { endedHere: false, view: "active" }

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

  useEffect(() => {
    const coordination = new TabCoordination(snapshot, setState, () => content.current)
    controller.current = coordination
    const stop = coordination.start()
    const element = content.current
    const stopObserving = element === null ? undefined : coordination.observe(element)
    return () => {
      stopObserving?.()
      stop()
      controller.current = undefined
    }
  }, [snapshot])

  const confirm = useCallback(async () => {
    await controller.current?.confirm()
  }, [])
  const logout = useCallback(() => {
    void controller.current?.logout()
  }, [])

  const concealed = state.view === "concealed" || state.view === "logout-failed"
  return (
    <SessionConfirmationProvider confirm={confirm}>
      <div aria-live="polite" role="status">
        <SessionAnnouncement state={state} />
      </div>
      {state.view === "ended" ? null : (
        <>
          <Inline as="header" justify="end">
            <LogoutControl busy={state.view === "logging-out"} onLogout={logout} />
          </Inline>
          {state.view === "logout-failed" ?
            (
              <Alert heading="Logout was not completed" role="alert" status="error">
                <Text>Protected content is hidden. Try Log out again.</Text>
              </Alert>
            ) :
            null}
          <div hidden={concealed} inert={concealed} ref={content}>{children}</div>
        </>
      )}
    </SessionConfirmationProvider>
  )
}

function SessionAnnouncement({ state }: { readonly state: TabViewState }) {
  if (state.view === "ended") return <SignedOutNotice initiating={state.endedHere} />
  if (state.view === "concealed") return <Text>Checking your session…</Text>
  return null
}
