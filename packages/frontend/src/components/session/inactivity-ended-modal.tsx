"use client"

import { Button, Modal } from "@pathableai/react"
import { useRef } from "react"

import "./inactivity-ended-modal.css"
import { loginAgainAction } from "../../app/auth/login-again/action.ts"

export interface InactivityEndedModalProps {
  readonly open: boolean
}

/**
 * PathAble Modal for server-confirmed inactivity. Primary action accessible name
 * is "Log in again". Form submits the CSRF-protected login-again Server Action
 * (rotate sid + cookie, then OIDC). No countdown or extend control.
 * The PathAble close control is hidden; Escape is a no-op until login-again succeeds.
 */
export function InactivityEndedModal({ open }: InactivityEndedModalProps) {
  const loginAgainRef = useRef<HTMLElement | null>(null)

  return (
    <Modal
      aria-label="Session ended due to inactivity"
      className="inactivity-ended-modal"
      closeLabel="Close"
      data-testid="inactivity-ended-modal"
      description="Your session ended because of inactivity. Any unsaved temporary work on this page may have been lost."
      footer={
        <form
          action={loginAgainAction}
          ref={(node) => {
            loginAgainRef.current = node?.querySelector("button") ?? null
          }}
        >
          <Button
            data-testid="inactivity-ended-login-again"
            type="submit"
            variant="primary"
          >
            Log in again
          </Button>
        </form>
      }
      initialFocusRef={loginAgainRef}
      onClose={() => {
        // Expired access remains unusable; keep the modal until login-again succeeds.
      }}
      open={open}
      title="Session ended due to inactivity"
    />
  )
}
