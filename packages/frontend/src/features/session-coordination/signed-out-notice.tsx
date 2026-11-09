"use client"

import { Alert, Heading, Link, Text } from "@pathableai/react"
import { useEffect, useRef } from "react"

/**
 * Shown in every sharing tab after logout (FR-015, FR-023). Log in is a deliberate navigation through the fresh-entry
 * boundary; nothing starts authentication automatically. Only the tab that logged out moves focus here.
 */
export function SignedOutNotice({ initiating }: { readonly initiating: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (initiating) heading.current?.focus()
  }, [initiating])
  return (
    <Alert status="info">
      <Heading level={1} ref={heading} tabIndex={-1}>You are signed out</Heading>
      <Text>Your session in this browser has ended. To continue, log in again.</Text>
      <Link href="/">Log in</Link>
    </Alert>
  )
}
