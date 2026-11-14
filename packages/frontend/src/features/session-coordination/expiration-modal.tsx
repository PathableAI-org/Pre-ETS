"use client"

import { Link, Modal } from "@pathableai/react"
import { useLayoutEffect, useRef } from "react"

import { focusTargetProps, moveFocus, recordLoginActivation } from "../../shared/browser-tracing.ts"
import { LOG_IN_HREF, sessionEndCopy } from "../../shared/session-recovery.ts"

const copy = sessionEndCopy("expired")
const logInProps = focusTargetProps("expiration_log_in")

/** Nothing closes the modal: confirmed expiry is terminal for this document (#157 FR-012). */
const stayOpen = () => undefined

const recordModalLogIn = () => {
  recordLoginActivation("expiration_modal")
}

/**
 * The expiration modal (#157 research D8): the shared expired copy as its title and description, and Log in as the
 * only action, focused on entry. The coordinator has already unmounted the header and protected content, so nothing
 * behind it is protected or navigable.
 *
 * Library gap (L-1, #400, styles#264): `Modal` always renders a close button and calls `onClose` on Escape. The no-op
 * `onClose` keeps it open; the close button stays visible and does nothing until the library ships a
 * non-dismissible mode. `hidden` hides it while the page enters the back/forward cache (FR-018).
 */
export function ExpirationModal({ hidden }: { readonly hidden: boolean }) {
  // The library `Link` takes no ref, so the link is found inside its wrapper.
  const footer = useRef<HTMLSpanElement>(null)
  const logIn = useRef<HTMLElement>(null)
  // Layout effects run before the library's own focus effect: `initialFocusRef` is set by then, and this move is
  // recorded as the application's (T-004).
  useLayoutEffect(() => {
    logIn.current = footer.current?.querySelector("a") ?? null
    if (!hidden) moveFocus(logIn.current, "expiration_log_in")
  }, [hidden])
  return (
    <Modal
      description={copy.explanation}
      footer={
        <span ref={footer}>
          <Link href={LOG_IN_HREF} onClick={recordModalLogIn} {...logInProps}>{copy.logIn}</Link>
        </span>
      }
      initialFocusRef={logIn}
      onClose={stayOpen}
      open={!hidden}
      title={copy.heading}
    />
  )
}
