import { Container, FormStack, Heading, Page, Stack, Text } from "@pathableai/react"
import { notFound } from "next/navigation"

import {
  ConsumerInformation,
  EmploymentInformation,
  InterventionPlan,
  SignatureReview
} from "../../components/onsite/report-sections.tsx"
import { VisitLog } from "../../components/onsite/visit-log.tsx"
import "../../components/onsite/onsite.css"

export const dynamic = "force-dynamic"

export default function OnsitePage() {
  if (process.env.NODE_ENV !== "development") {
    notFound()
  }

  return (
    <Page>
      <Container size="wide">
        <Stack gap="xl">
          <Stack as="header" gap="sm">
            <Text variant="small">Local feedback prototype</Text>
            <Heading level={1}>Job Coaching Progress Report &amp; Service Log</Heading>
            <Text>
              Explore how the paper form might work on screen. Use sample information only; changes disappear when the
              page reloads.
            </Text>
          </Stack>
          <FormStack as="div" gap="xl">
            <ConsumerInformation />
            <EmploymentInformation />
            <InterventionPlan />
            <VisitLog />
            <SignatureReview />
          </FormStack>
        </Stack>
      </Container>
    </Page>
  )
}
