import type { SessionEndCause } from "@pathableai/pre-ets-frontend-services"
import type { ReactElement, Ref } from "react"

import { Heading, Link, Stack, Text } from "@pathableai/react"

/** The session-end explanation and the accessible name of its Log in action (#157 research D12). */
export interface SessionEndCopy {
  readonly explanation: string
  readonly heading: string
  /** Accessible name of the Log in action; identifies signing in again (FR-007). */
  readonly logIn: string
}

/**
 * One copy per cause. `unknown` claims no cause (FR-004). No copy names an identity, tenant, or session value
 * (FR-025).
 */
const COPY: Readonly<Record<SessionEndCause, SessionEndCopy>> = {
  expired: {
    explanation: "For your security, your session ended after a period of inactivity.",
    heading: "Your session expired",
    logIn: "Log in again"
  },
  unknown: {
    explanation: "To continue, log in again.",
    heading: "Your session is no longer available",
    logIn: "Log in again"
  }
}

export const sessionEndCopy = (cause: SessionEndCause): SessionEndCopy => COPY[cause]

/** The fresh-entry boundary every Log in uses: it reuses a valid session or starts a fresh login (research D11). */
const LOG_IN_HREF = "/"

/**
 * Server-renderable heading, explanation, and Log in link. Log in is a plain navigation; nothing starts login. A
 * running tab passes heading props and a ref to move focus to the heading, and `onLogIn` to observe activation for
 * telemetry; it never prevents or replaces the navigation.
 */
export function SessionEndNotice({
  cause,
  headingProps,
  headingRef,
  onLogIn
}: {
  readonly cause: SessionEndCause
  readonly headingProps?:
    | Readonly<{ "data-preets-focus"?: string | undefined; tabIndex?: number | undefined }>
    | undefined
  readonly headingRef?: Ref<HTMLHeadingElement> | undefined
  readonly onLogIn?: (() => void) | undefined
}): ReactElement {
  const copy = sessionEndCopy(cause)
  return (
    <Stack gap="md">
      <Heading level={1} ref={headingRef} {...headingProps}>{copy.heading}</Heading>
      <Text>{copy.explanation}</Text>
      <Text>
        <Link href={LOG_IN_HREF} onClick={onLogIn}>{copy.logIn}</Link>
      </Text>
    </Stack>
  )
}
