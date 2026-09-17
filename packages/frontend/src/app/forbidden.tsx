import { Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"

/**
 * Extended forbidden surface for OIDC-config refusal (and Next `forbidden()`).
 * Proxy also returns matching HTML for config 403. Unknown-host refusals from
 * Proxy setup remain plain-text "Access denied."
 */
export default function Forbidden() {
  return (
    <Page>
      <Container>
        <Stack gap="md">
          <Heading level={1}>Login cannot start</Heading>
          <Text>
            Required login configuration is missing or invalid for this tenant. Contact your administrator to fix the
            configuration, then try again.
          </Text>
          <Link href="/">Return home</Link>
        </Stack>
      </Container>
    </Page>
  )
}
