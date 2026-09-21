"use client"

import { useSyncExternalStore } from "react"

/** Mark client-only temporary UI cleared (same-tab; survives login-again remount). */
export function markTemporaryWorkCleared(): void {
  try {
    sessionStorage.setItem(TEMPORARY_WORK_CLEARED_STORAGE_KEY, "1")
  } catch {
    // Storage blocked — remount stays hidden via fail-closed read below.
  }
}

/**
 * Client-only protected UI fixture for Gherkin "Unsent practice note".
 * Seeded in DOM/client state — not Redis. Cleared when the recovery island
 * removes protected content on confirmed inactivity; not restored after login-again.
 *
 * Visibility uses `useSyncExternalStore` so SSR/hydration stay hidden (stable)
 * and the browser snapshot can reveal the fixture without a hydration mismatch.
 */
export function UnsentPracticeNoteFixture() {
  const visible = useSyncExternalStore(
    subscribeTemporaryWorkVisibility,
    getTemporaryWorkVisible,
    getTemporaryWorkHiddenServer
  )

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

function getTemporaryWorkHiddenServer(): boolean {
  return false
}

function getTemporaryWorkVisible(): boolean {
  return !isTemporaryWorkCleared()
}

/**
 * True when the fixture must stay hidden. Fail closed if storage is unavailable
 * so a blocked sessionStorage cannot restore temporary UI after login-again.
 */
function isTemporaryWorkCleared(): boolean {
  try {
    return sessionStorage.getItem(TEMPORARY_WORK_CLEARED_STORAGE_KEY) === "1"
  } catch {
    return true
  }
}

/** sessionStorage has no change events for same-tab writes; remount re-reads. */
function subscribeTemporaryWorkVisibility(_onStoreChange: () => void): () => void {
  return () => {
    // No-op unsubscribe: visibility is fixed for a given mount.
  }
}
