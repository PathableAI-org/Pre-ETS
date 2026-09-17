"use client"

/**
 * Client-only protected UI fixture for Gherkin "Unsent practice note".
 * Seeded in DOM/client state — not Redis. Cleared when the recovery island
 * removes protected content on confirmed inactivity.
 */
export function UnsentPracticeNoteFixture() {
  return (
    <p data-testid="unsent-practice-note">
      Unsent practice note
    </p>
  )
}
