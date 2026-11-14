"use client"

import { Alert, Button, Modal, Text } from "@pathableai/react"
import { type ReactNode, useLayoutEffect, useRef } from "react"

import { focusTargetProps, moveFocus } from "../../shared/browser-tracing.ts"
import { blockBackground } from "./blocking.ts"

/** The warning's copy (#156 research D9); no remaining time is shown. */
const COPY = {
  action: "Continue",
  explanation: "For your security, your session will end soon because of inactivity. Select Continue to keep working.",
  failure: "We could not continue your session. Try again.",
  heading: "Your session is about to expire"
}

const continueProps = focusTargetProps("warning_continue")

/** Only a renewal or the session's end closes the warning (FR-009); Escape closes nothing. */
const stayOpen = () => undefined

/** Elements that can take focus or be operated; only Continue may remain in the warning (workaround 2). */
const CONTROLS = "a[href], button, input, select, textarea, [tabindex]"

/**
 * Workaround 2 (research D8): every control the library renders in the dialog other than Continue is disabled and
 * removed from rendering and from the accessibility tree. In 0.3.0 that is the close button. Found by structure, so a
 * renamed library class cannot bring it back.
 */
const removeOtherControls = (dialog: Element, action: HTMLElement) => {
  for (const control of dialog.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (control === action) continue
    control.setAttribute("disabled", "")
    control.setAttribute("aria-hidden", "true")
    control.hidden = true
    control.style.display = "none"
  }
}

/**
 * Workaround 4 (research D8): a pointer press outside the dialog moves no focus, and focus found outside it, after a
 * blur or when the window is focused again, returns to Continue as the application's move (FR-015, T-004). Answers the
 * undo.
 */
const containFocus = (dialog: HTMLElement, action: HTMLElement): () => void => {
  let containing = true
  const outside = (target: EventTarget | null) => !(target instanceof Node && dialog.contains(target))
  const returnFocus = () => {
    if (containing && outside(document.activeElement)) moveFocus(action, "warning_continue")
  }
  const holdFocus = (event: MouseEvent) => {
    if (outside(event.target)) event.preventDefault()
  }
  const afterBlur = (event: FocusEvent) => {
    if (outside(event.relatedTarget)) setTimeout(returnFocus, 0)
  }
  document.addEventListener("mousedown", holdFocus, true)
  dialog.addEventListener("focusout", afterBlur)
  window.addEventListener("focus", returnFocus)
  return () => {
    containing = false
    document.removeEventListener("mousedown", holdFocus, true)
    dialog.removeEventListener("focusout", afterBlur)
    window.removeEventListener("focus", returnFocus)
  }
}

/**
 * The pre-expiration warning (#156 research D8): the library `Modal` with the warning's copy as its title and
 * description and Continue as its action, focused on entry (T-004). After a Continue that neither renewed nor ended
 * the session, an alert inside the dialog says so and Continue stays available (research D6).
 *
 * Library gap (#400, styles#264): `Modal` has no non-dismissible mode and no inert background. The no-op `onClose`
 * keeps the warning open on Escape (workaround 1); while it is open, its close control is removed, everything behind
 * it is inert, and focus stays inside (workarounds 2 to 4). The coordinator restores focus when it closes. Remove
 * workarounds 1 to 4 when the library ships that mode.
 */
export function WarningModal({
  continuation,
  onContinue
}: {
  readonly continuation: "failed" | "idle" | "sending"
  readonly onContinue: () => void
}): ReactNode {
  // The library `Button` takes no ref, so Continue is found inside its wrapper.
  const footer = useRef<HTMLSpanElement>(null)
  const action = useRef<HTMLElement>(null)
  // Layout effects run before the library's own focus effect: `initialFocusRef` is set by then, and this move is
  // recorded as the application's (T-004). The coordinator has already noted where focus was.
  useLayoutEffect(() => {
    const button = footer.current?.querySelector("button") ?? null
    const dialog = footer.current?.closest<HTMLElement>("[role=dialog]") ?? null
    action.current = button
    if (button === null || dialog === null) return undefined
    removeOtherControls(dialog, button)
    const unblock = blockBackground(dialog)
    moveFocus(button, "warning_continue")
    const release = containFocus(dialog, button)
    return () => {
      release()
      unblock()
    }
  }, [])
  return (
    <Modal
      description={COPY.explanation}
      footer={
        <span ref={footer}>
          <Button onClick={onContinue} type="button" {...continueProps}>{COPY.action}</Button>
        </span>
      }
      initialFocusRef={action}
      onClose={stayOpen}
      open
      title={COPY.heading}
    >
      {continuation === "failed" ?
        (
          <Alert role="alert" slim status="error">
            <Text>{COPY.failure}</Text>
          </Alert>
        ) :
        null}
    </Modal>
  )
}
