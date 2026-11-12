"use client"

import { Button } from "@pathableai/react"

import { focusTargetProps } from "../../shared/browser-tracing.ts"

/** The explicit, keyboard-operable logout action on every protected page (FR-013). */
export function LogoutControl({ busy, onLogout }: { readonly busy: boolean; readonly onLogout: () => void }) {
  return (
    <Button
      aria-busy={busy}
      disabled={busy}
      onClick={onLogout}
      type="button"
      variant="outline"
      {...focusTargetProps("logout_control")}
    >
      {busy ? "Logging out…" : "Log out"}
    </Button>
  )
}
