"use client"

import { Button, Modal } from "@pathableai/react"

export interface InactivityEndedModalProps {
  readonly onClose: () => void
  readonly open: boolean
}

/**
 * PathAble Modal for inactivity-ended messaging. Primary action accessible name
 * is "Log in again". In PR1 this only closes the modal (no OIDC / session rotation).
 */
export function InactivityEndedModal({ onClose, open }: InactivityEndedModalProps) {
  return (
    <Modal
      closeLabel="Close"
      data-testid="inactivity-ended-modal"
      description="Your session ended because of inactivity. Any unsaved temporary work on this page may have been lost."
      footer={
        <Button
          data-testid="inactivity-ended-login-again"
          onClick={onClose}
          type="button"
          variant="primary"
        >
          Log in again
        </Button>
      }
      onClose={onClose}
      open={open}
      title="Session ended due to inactivity"
    />
  )
}
