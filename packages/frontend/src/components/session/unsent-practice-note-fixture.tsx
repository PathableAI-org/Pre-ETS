"use client"

import { useState } from "react"

/** Mark client-only temporary UI cleared (same-tab; survives login-again remount). */
export function markTemporaryWorkCleared(): void {
  try {
    sessionStorage.setItem(TEMPORARY_WORK_CLEARED_STORAGE_KEY, "1")
  } catch {
    // Private mode / blocked storage — fixture may remount; prefer fail-open for demo.
  }
}

/**
 * Client-only protected UI fixture for Gherkin "Unsent practice note".
 * Seeded in DOM/client state — not Redis. Cleared when the recovery island
 * removes protected content on confirmed inactivity; not restored after login-again.
 */
export function UnsentPracticeNoteFixture() {
  const [visible] = useState(() => !isTemporaryWorkCleared())

  if (!visible) {
    return null
  }

  return (
    <p data-testid="unsent-practice-note">
      Unsent practice note
    </p>
  )
}

/**
 * sessionStorage flag set when confirmed inactivity clears protected UI.
 * Survives the OIDC round-trip so login-again does not restore the fixture.
 */
const TEMPORARY_WORK_CLEARED_STORAGE_KEY = "preets:temporary-work-cleared"

function isTemporaryWorkCleared(): boolean {
  try {
    return sessionStorage.getItem(TEMPORARY_WORK_CLEARED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}
