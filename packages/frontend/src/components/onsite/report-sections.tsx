import type { ReactNode } from "react"

import { CardGrid, Cluster, Fieldset, Heading, Radio, Stack, Surface, Text } from "@pathableai/react"

import { Field, Narrative } from "./form-fields.tsx"

function Choice({ label, name, options }: {
  label: string
  name: string
  options: readonly string[]
}) {
  return (
    <Fieldset>
      <legend>{label}</legend>
      <Cluster gap="sm">
        {options.map((option) => (
          <Radio id={`${name}-${option.toLowerCase().replaceAll(" ", "-")}`} key={option} name={name} value={option}>
            {option}
          </Radio>
        ))}
      </Cluster>
    </Fieldset>
  )
}

function ConsumerInformation() {
  return (
    <Section heading="Consumer information" id="onsite-consumer">
      <CardGrid gap="sm" variant="auto-fit">
        <Field id="consumer-name" label="Name of consumer" />
        <Field defaultValue="Example provider" id="provider" label="Provider" />
        <Field id="report-month" label="Month and year" type="month" />
        <Field id="job-coach" label="Job coach" />
        <Field id="coach-phone" label="Job coach phone" type="tel" />
        <Field id="coach-email" label="Job coach email" type="email" />
        <Field id="vocational-goal" label="IPE vocational goal" />
        <Field id="vendor" label="Vendor" />
        <Field id="dvrs-office" label="DVRS central office" />
        <Field id="vendor-phone" label="Vendor phone" type="tel" />
        <Field id="dvrs-manager" label="DVRS LTFA program manager" />
        <Field id="vendor-email" label="Vendor email" type="email" />
        <Field id="support-agency" label="Support coordination agency" />
        <Field id="support-coordinator" label="Support coordinator" />
        <Field id="support-phone" label="Support coordinator phone" type="tel" />
        <Field id="support-email" label="Support coordinator email" type="email" />
      </CardGrid>
      <CardGrid gap="sm" variant="auto-fit">
        <Choice label="Medicaid eligible" name="medicaid" options={["Yes", "No", "Unknown"]} />
        <Choice label="DDD enrolled" name="ddd" options={["Yes", "No", "Unknown"]} />
      </CardGrid>
    </Section>
  )
}

function EmploymentInformation() {
  return (
    <Section heading="Employment information" id="onsite-employment">
      <CardGrid gap="sm" variant="auto-fit">
        <Field id="job-title" label="Consumer's job title" />
        <Field id="hire-date" label="Hire date" type="date" />
        <Choice label="Employment type" name="employment-type" options={["Full time", "Part time", "Per diem"]} />
        <Field id="employer" label="Employer" />
        <Field id="employer-address" label="Employer address" />
        <Field id="employer-location" label="City, state, and ZIP" />
        <Field id="hours-per-week" label="Hours per week" min="0" step="0.25" type="number" />
        <Field id="days-per-week" label="Days per week" min="0" step="1" type="number" />
        <Field id="hourly-rate" label="Hourly rate ($)" min="0" step="0.01" type="number" />
      </CardGrid>
    </Section>
  )
}

function InterventionPlan() {
  return (
    <Section
      heading="Monthly intervention plan"
      id="onsite-plan"
      note="The paper form has five rows. Use these to discuss how plans should connect to visit notes."
    >
      {[1, 2, 3, 4, 5].map((row) => (
        <Stack gap="sm" key={row}>
          <Heading level={3} visualLevel={4}>Plan item {row}</Heading>
          <CardGrid gap="sm" variant="auto-fit">
            <Narrative id={`standard-${String(row)}`} label="Unmet employer standard" rows={2} />
            <Narrative id={`performance-${String(row)}`} label="Consumer performance" rows={2} />
            <Narrative id={`coach-plan-${String(row)}`} label="Job coach plan" rows={2} />
          </CardGrid>
        </Stack>
      ))}
      <Narrative id="plan-comments" label="Intervention plan comments" rows={4} />
    </Section>
  )
}

function Section({ children, heading, id, note }: {
  children: ReactNode
  heading: string
  id: string
  note?: string
}) {
  return (
    <Surface aria-labelledby={id} as="section">
      <Stack gap="md">
        <Heading id={id} level={2}>{heading}</Heading>
        {note === undefined ? null : <Text tone="muted">{note}</Text>}
        {children}
      </Stack>
    </Surface>
  )
}

function SignatureReview() {
  return (
    <Section
      heading="Signatures and review"
      id="onsite-signatures"
      note="Signature capture and approval are not part of this visual prototype."
    >
      <CardGrid gap="sm" variant="auto-fit">
        <Field id="coach-signature" label="Job coach signature (discussion placeholder)" />
        <Field id="coach-signature-date" label="Job coach signature date" type="date" />
        <Field id="supervisor-signature" label="Supervisor signature (discussion placeholder)" />
        <Field id="supervisor-signature-date" label="Supervisor signature date" type="date" />
      </CardGrid>
      <Text>
        On the paper form, the coach's signature confirms the activities and services occurred as indicated. Typing in a
        placeholder above does not sign or submit this report.
      </Text>
    </Section>
  )
}

export { ConsumerInformation, EmploymentInformation, InterventionPlan, SignatureReview }
