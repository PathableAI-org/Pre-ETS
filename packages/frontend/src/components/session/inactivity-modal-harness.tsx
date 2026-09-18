"use client"

import { Button } from "@pathableai/react"
import { useState } from "react"

import { InactivityEndedModal } from "./inactivity-ended-modal.tsx"

/**
 * TEMP harness — remove in PR5 when the inactivity modal opens from a confirmed cause.
 * Owns the Modal client boundary and open state for presentational review only.
 */
export function InactivityModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        data-testid="temp-show-inactivity-modal"
        onClick={() => {
          setOpen(true)
        }}
        type="button"
        variant="secondary"
      >
        Show inactivity modal
      </Button>
      <InactivityEndedModal
        onClose={() => {
          setOpen(false)
        }}
        open={open}
      />
    </>
  )
}
