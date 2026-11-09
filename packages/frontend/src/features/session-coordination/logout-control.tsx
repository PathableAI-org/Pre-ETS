"use client"

import { Button } from "@pathableai/react"

/** The explicit, keyboard-operable logout action on every protected page (FR-013). */
export function LogoutControl({ busy, onLogout }: { readonly busy: boolean; readonly onLogout: () => void }) {
  return (
    <Button aria-busy={busy} disabled={busy} onClick={onLogout} type="button" variant="outline">
      {busy ? "Logging out…" : "Log out"}
    </Button>
  )
}
