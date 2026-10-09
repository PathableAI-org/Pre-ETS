import { Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"

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
