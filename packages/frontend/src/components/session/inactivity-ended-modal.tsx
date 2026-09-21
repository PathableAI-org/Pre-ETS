"use client"

import { Button, Modal } from "@pathableai/react"
import { useRef } from "react"

import "./inactivity-ended-modal.css"

export interface InactivityEndedModalProps {
  readonly onClose: () => void
  readonly open: boolean
}

/**
 * PathAble Modal for inactivity-ended messaging. Primary action accessible name
 * is "Log in again". Until PR6, the CTA only closes the modal — it does not
 * rotate the session id or start OIDC (stub; does not pretend to authenticate).
 * The PathAble close control is hidden; Escape and "Log in again" dismiss.
 */
export function InactivityEndedModal({ onClose, open }: InactivityEndedModalProps) {
  const loginAgainRef = useRef<HTMLElement | null>(null)

  return (
    <Modal
      className="inactivity-ended-modal"
      closeLabel="Close"
      data-testid="inactivity-ended-modal"
      description="Your session ended because of inactivity. Any unsaved temporary work on this page may have been lost."
      footer={
        <span
          ref={(node) => {
            loginAgainRef.current = node?.querySelector("button") ?? null
          }}
        >
          <Button
            data-testid="inactivity-ended-login-again"
            onClick={onClose}
            type="button"
            variant="primary"
          >
            Log in again
          </Button>
        </span>
      }
      initialFocusRef={loginAgainRef}
      onClose={onClose}
      open={open}
      title="Session ended due to inactivity"
    />
  )
}
