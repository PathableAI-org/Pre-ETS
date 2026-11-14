import type { ReactElement, ReactNode } from "react"

import {
  PRIVATE_NO_STORE,
  type ProtectionResponses,
  type TenantFailureResponse
} from "@pathableai/pre-ets-frontend-services"
import { Alert, Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"
import { NextResponse } from "next/server"
import { renderToReadableStream } from "react-dom/server.edge"

import { ACTION_DENIAL_BODY } from "../../providers/action-denial.ts"
import { sessionEndCopy, SessionEndNotice } from "../../shared/session-recovery.ts"

/**
 * Streams a document rendered outside the root layout. Because the layout does not wrap it, it states the layout's
 * charset and viewport and its own title, which React hoists into `<head>`; app stylesheets are hashed build output and
 * are not linked (research D4). Every host-rendered HTML document in this module renders through it.
 */
const renderStandaloneDocument = (title: string, content: ReactNode) =>
  renderToReadableStream(
    <html lang="en">
      <body>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>{`${title} – Pre-ETS`}</title>
        {content}
      </body>
    </html>
  )

export const authenticationReturnBody = () =>
  renderStandaloneDocument(
    "Authentication return",
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>Authentication return</Heading>
          <Alert heading="Sign-in could not continue" status="info">
            The identity provider return could not be completed. Return home and try again.
          </Alert>
          <Text>
            <Link href="/">Return to the application entry</Link>
          </Text>
        </Stack>
      </Container>
    </Page>
  )

const missingPageBody = () =>
  renderStandaloneDocument(
    "Page not found",
    <Page>
      <Container>
        <Stack gap="lg">
          <Heading level={1}>404</Heading>
          <Text>This page could not be found.</Text>
        </Stack>
      </Container>
    </Page>
  )

export const tenantFailureResponse: TenantFailureResponse = async (status) =>
  new NextResponse(status === 404 ? await missingPageBody() : null, {
    headers: {
      "cache-control": PRIVATE_NO_STORE,
      ...(status === 404 ? { "content-type": "text/html; charset=utf-8" } : {})
    },
    status
  })

/** Heading, explanation, and a keyboard-reachable link to `/`; rendered by the proxy document and `forbidden.tsx`. */
export function ForbiddenNotice(): ReactElement {
  return (
    <Page>
      <Container>
        <Stack gap="md">
          <Heading level={1}>Access denied</Heading>
          <Text>This request is not allowed to continue.</Text>
          <Text>
            <Link href="/">Go to the application entry</Link>
          </Text>
        </Stack>
      </Container>
    </Page>
  )
}

/** Host-rendered, self-contained 403 document for `ProtectionResponses.forbiddenDocument`; `private, no-store`. */
export const forbiddenDocumentResponse = async (): Promise<NextResponse> =>
  new NextResponse(
    await renderStandaloneDocument("Access denied", <ForbiddenNotice />),
    {
      headers: { "cache-control": PRIVATE_NO_STORE, "content-type": "text/html; charset=utf-8" },
      status: 403
    }
  )

/**
 * Host-rendered recovery document for `ProtectionResponses.recoveryDocument`: the gate's answer to a denied no-script
 * Server Action submission. Like the 403 document it is self-contained; the gate sends it with HTTP 401 and `private, no-store` (#157 research D1).
 */
export const recoveryDocumentResponse: ProtectionResponses["recoveryDocument"] = async ({ cause }) =>
  new NextResponse(
    await renderStandaloneDocument(
      sessionEndCopy(cause).heading,
      <Page>
        <Container>
          <SessionEndNotice cause={cause} />
        </Container>
      </Page>
    ),
    {
      headers: { "cache-control": PRIVATE_NO_STORE, "content-type": "text/html; charset=utf-8" },
      status: 401
    }
  )

/**
 * `ProtectionResponses.actionDenial`: the closed-set cause token for a denied fetch Server Action. Exactly
 * `text/plain` with no charset, because Next's client reads the body as the rejection message only for that content
 * type (#157 research D3, F5). The gate sends it with HTTP 401 and `private, no-store`.
 */
export const actionDenialResponse: ProtectionResponses["actionDenial"] = ({ cause }) =>
  Promise.resolve(
    new NextResponse(ACTION_DENIAL_BODY[cause], {
      headers: { "cache-control": PRIVATE_NO_STORE, "content-type": "text/plain" },
      status: 401
    })
  )
