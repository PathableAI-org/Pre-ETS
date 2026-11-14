"use client"

import { Alert, Button, Modal, Text } from "@pathableai/react"
import { type ReactNode, useLayoutEffect, useRef } from "react"

import { focusTargetProps, moveFocus } from "../../shared/browser-tracing.ts"

/** The warning's copy (#156 research D9); no remaining time is shown. */
const COPY = {
  action: "Continue",
  explanation: "For your security, your session will end soon because of inactivity. Select Continue to keep working.",
  failure: "We could not continue your session. Try again.",
  heading: "Your session is about to expire"
}

const continueProps = focusTargetProps("warning_continue")

/** Only a renewal or the session's end closes the warning (FR-009); Escape and the close control close nothing. */
const stayOpen = () => undefined

/**
 * The pre-expiration warning (#156 research D8): the library `Modal` with the warning's copy as its title and
 * description and Continue as its action, focused on entry (T-004). After a Continue that neither renewed nor ended
 * the session, an alert inside the dialog says so and Continue stays available (research D6).
 *
 * Library gap (#400, styles#264): `Modal` always renders a close button and calls `onClose` on Escape. The no-op
 * `onClose` keeps the warning open; until slice B removes that control and makes the background inert, the close
 * button stays visible and does nothing.
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
  // recorded as the application's (T-004).
  useLayoutEffect(() => {
    action.current = footer.current?.querySelector("button") ?? null
    moveFocus(action.current, "warning_continue")
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
