"use client"

import { Button, Modal } from "@pathableai/react"

import { loginAgainAction } from "../../app/auth/login-again/action.ts"

export interface InactivityEndedModalProps {
  readonly open: boolean
}

/**
 * PathAble Modal for server-confirmed inactivity. Primary action accessible name
 * is "Log in again". No countdown or extend control.
 */
export function InactivityEndedModal({ open }: InactivityEndedModalProps) {
  return (
    <Modal
      aria-label="Session ended due to inactivity"
      closeLabel="Close"
      description="Your session ended because of inactivity. Any unsaved temporary work on this page may have been lost."
      footer={
        <form action={loginAgainAction}>
          <Button type="submit" variant="primary">
            Log in again
          </Button>
        </form>
      }
      onClose={() => {
        // Expired access remains unusable; keep the modal until login-again succeeds.
      }}
      open={open}
      title="Session ended due to inactivity"
    />
  )
}
