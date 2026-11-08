import { PRIVATE_NO_STORE, type TenantFailureResponse } from "@pathableai/pre-ets-frontend-services"
import { Alert, Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"
import { NextResponse } from "next/server"
import { renderToReadableStream } from "react-dom/server.edge"

export const authenticationReturnBody = () =>
  renderToReadableStream(
    <html lang="en">
      <body>
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
      </body>
    </html>
  )

const missingPageBody = () =>
  renderToReadableStream(
    <html lang="en">
      <body>
        <Page>
          <Container>
            <Stack gap="lg">
              <Heading level={1}>404</Heading>
              <Text>This page could not be found.</Text>
            </Stack>
          </Container>
        </Page>
      </body>
    </html>
  )

export const tenantFailureResponse: TenantFailureResponse = async (status) =>
  new NextResponse(status === 404 ? await missingPageBody() : null, {
    headers: {
      "cache-control": PRIVATE_NO_STORE,
      ...(status === 404 ? { "content-type": "text/html; charset=utf-8" } : {})
    },
    status
  })
