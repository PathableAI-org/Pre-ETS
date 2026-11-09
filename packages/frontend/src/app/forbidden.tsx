import { Container, Heading, Link, Page, Stack, Text } from "@pathableai/react"

export default function Forbidden() {
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
