"use client"

import {
  Button,
  Container,
  Fieldset,
  FormGroup,
  FormStack,
  Heading,
  Input,
  Label,
  Page,
  Radio,
  Text,
  Textarea
} from "@pathableai/react"
import { useEffect, useState } from "react"

import { displayDuration, durationMs, localDateTime, visitClockMs } from "./visit-time.ts"
import "./onsite.css"

interface Visit {
  readonly date: string
  readonly end: string
  readonly id: number
  readonly running: boolean
  readonly start: string
}

const initialVisit: Visit = { date: "", end: "", id: 1, running: false, start: "" }

function Choice({ label, name, options }: {
  label: string
  name: string
  options: readonly string[]
}) {
  return (
    <Fieldset className="onsite-choice">
      <legend>{label}</legend>
      <div className="onsite-choice-options">
        {options.map((option) => (
          <Radio id={`${name}-${option.toLowerCase().replaceAll(" ", "-")}`} key={option} name={name} value={option}>
            {option}
          </Radio>
        ))}
      </div>
    </Fieldset>
  )
}

function Field({ id, label, type = "text", ...props }: {
  defaultValue?: string
  id: string
  label: string
  min?: string
  step?: string
  type?: string
}) {
  return (
    <FormGroup>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} {...props} />
    </FormGroup>
  )
}

function Narrative({ id, label, rows = 3 }: { id: string; label: string; rows?: number }) {
  return (
    <FormGroup>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={id} rows={rows} />
    </FormGroup>
  )
}

function OnsitePrototype() {
  const [visits, setVisits] = useState<Visit[]>([initialVisit])
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!visits.some((visit) => visit.running)) {
      return
    }
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(interval)
    }
  }, [visits])

  function updateVisit(id: number, change: Partial<Visit>) {
    setVisits((current) => current.map((visit) => visit.id === id ? { ...visit, ...change } : visit))
  }

  const recordedMs = visits.reduce((total, visit) => total + (durationMs(visit.start, visit.end) ?? 0), 0)
  const hasInvalidTime = visits.some((visit) =>
    visit.start !== "" && visit.end !== "" && durationMs(visit.start, visit.end) === undefined
  )

  return (
    <Page>
      <Container size="wide">
        <div className="onsite-prototype">
          <header className="onsite-header">
            <Text className="onsite-eyebrow">Local feedback prototype</Text>
            <Heading level={1}>Job Coaching Progress Report &amp; Service Log</Heading>
            <Text>
              Explore how the paper form might work on screen. Use sample information only; changes disappear when the
              page reloads.
            </Text>
          </header>
          <FormStack
            aria-label="On-site progress report prototype"
            gap="xl"
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            <Section heading="Consumer information" id="onsite-consumer">
              <div className="onsite-field-grid onsite-field-grid--two">
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
              </div>
              <div className="onsite-field-grid onsite-field-grid--two">
                <Choice label="Medicaid eligible" name="medicaid" options={["Yes", "No", "Unknown"]} />
                <Choice label="DDD enrolled" name="ddd" options={["Yes", "No", "Unknown"]} />
              </div>
            </Section>

            <Section heading="Employment information" id="onsite-employment">
              <div className="onsite-field-grid onsite-field-grid--three">
                <Field id="job-title" label="Consumer's job title" />
                <Field id="hire-date" label="Hire date" type="date" />
                <Choice
                  label="Employment type"
                  name="employment-type"
                  options={["Full time", "Part time", "Per diem"]}
                />
                <Field id="employer" label="Employer" />
                <Field id="employer-address" label="Employer address" />
                <Field id="employer-location" label="City, state, and ZIP" />
                <Field id="hours-per-week" label="Hours per week" min="0" step="0.25" type="number" />
                <Field id="days-per-week" label="Days per week" min="0" step="1" type="number" />
                <Field id="hourly-rate" label="Hourly rate ($)" min="0" step="0.01" type="number" />
              </div>
            </Section>

            <Section
              heading="Monthly intervention plan"
              id="onsite-plan"
              note="The paper form has five rows. Use these to discuss how plans should connect to visit notes."
            >
              {[1, 2, 3, 4, 5].map((row) => (
                <div className="onsite-plan-row" key={row}>
                  <Heading level={3} visualLevel={4}>Plan item {row}</Heading>
                  <div className="onsite-field-grid onsite-field-grid--three">
                    <Narrative id={`standard-${String(row)}`} label="Unmet employer standard" rows={2} />
                    <Narrative id={`performance-${String(row)}`} label="Consumer performance" rows={2} />
                    <Narrative id={`coach-plan-${String(row)}`} label="Job coach plan" rows={2} />
                  </div>
                </div>
              ))}
              <Narrative id="plan-comments" label="Intervention plan comments" rows={4} />
            </Section>

            <Section
              heading="Service visit log"
              id="onsite-log"
              note="Narratives are optional. Timer values can be corrected before discussing the report with Daniela."
            >
              {visits.map((visit) => (
                <VisitEntry
                  key={visit.id}
                  now={now}
                  onChange={(change) => {
                    updateVisit(visit.id, change)
                  }}
                  onRemove={() => {
                    setVisits((current) => current.filter((item) => item.id !== visit.id))
                  }}
                  visit={visit}
                />
              ))}
              <Button
                onClick={() => {
                  setVisits((current) => [...current, {
                    date: "",
                    end: "",
                    id: Math.max(0, ...current.map((visit) => visit.id)) + 1,
                    running: false,
                    start: ""
                  }])
                }}
                type="button"
                variant="outline"
              >
                Add another visit
              </Button>
              <Text>
                Recorded visit time (demo estimate): <strong>{displayDuration(recordedMs)}</strong>
                {hasInvalidTime ? " — visits with invalid times are excluded." : ""}
              </Text>
            </Section>

            <Section
              heading="Signatures and review"
              id="onsite-signatures"
              note="Signature capture and approval are not part of this visual prototype."
            >
              <div className="onsite-field-grid onsite-field-grid--two">
                <Field id="coach-signature" label="Job coach signature (discussion placeholder)" />
                <Field id="coach-signature-date" label="Date" type="date" />
                <Field id="supervisor-signature" label="Supervisor signature (discussion placeholder)" />
                <Field id="supervisor-signature-date" label="Date" type="date" />
              </div>
              <Text>
                On the paper form, the coach's signature confirms the activities and services occurred as indicated.
                Typing in a placeholder above does not sign or submit this report.
              </Text>
            </Section>
          </FormStack>
        </div>
      </Container>
    </Page>
  )
}

function Section({ children, heading, id, note }: {
  children: React.ReactNode
  heading: string
  id: string
  note?: string
}) {
  return (
    <section aria-labelledby={id} className="onsite-section">
      <div className="onsite-section-heading">
        <Heading id={id} level={2}>{heading}</Heading>
        {note === undefined ? null : <Text tone="muted">{note}</Text>}
      </div>
      {children}
    </section>
  )
}

function VisitDate({ onChange, prefix, visit }: {
  onChange: (change: Partial<Visit>) => void
  prefix: string
  visit: Visit
}) {
  return (
    <FormGroup>
      <Label htmlFor={`${prefix}-date`}>Date of service</Label>
      <Input
        id={`${prefix}-date`}
        name={`${prefix}-date`}
        onChange={(event) => {
          onChange({ date: event.currentTarget.value })
        }}
        type="date"
        value={visit.date}
      />
    </FormGroup>
  )
}

function VisitEntry({ now, onChange, onRemove, visit }: {
  now: number
  onChange: (change: Partial<Visit>) => void
  onRemove: () => void
  visit: Visit
}) {
  const prefix = `visit-${String(visit.id)}`
  return (
    <section aria-labelledby={`${prefix}-heading`} className="onsite-visit">
      <div className="onsite-visit-heading">
        <Heading id={`${prefix}-heading`} level={3}>Visit {visit.id}</Heading>
        <Button onClick={onRemove} type="button" variant="low-emphasis">Remove visit</Button>
      </div>
      <div className="onsite-field-grid onsite-field-grid--three">
        <VisitDate onChange={onChange} prefix={prefix} visit={visit} />
        <Field defaultValue="Example coach" id={`${prefix}-coach`} label="Job coach" />
        <VisitTimer now={now} onChange={onChange} visit={visit} />
      </div>
      <VisitTimes onChange={onChange} prefix={prefix} visit={visit} />
      <VisitNarratives prefix={prefix} />
    </section>
  )
}

function VisitNarratives({ prefix }: { prefix: string }) {
  return (
    <div className="onsite-field-grid onsite-field-grid--two">
      <Narrative id={`${prefix}-purpose`} label="Purpose of visit — what were you there to do?" />
      <Narrative id={`${prefix}-observations`} label="Observations — what did you observe?" />
      <Narrative id={`${prefix}-interventions`} label="Interventions — what did you contribute?" />
      <Narrative id={`${prefix}-next-steps`} label="Next steps — what will you do next?" />
    </div>
  )
}

function VisitTimer({ now, onChange, visit }: {
  now: number
  onChange: (change: Partial<Visit>) => void
  visit: Visit
}) {
  return (
    <div aria-label={`Visit ${String(visit.id)} timer`} className="onsite-timer" role="group">
      <span>Elapsed time (demo)</span>
      <strong>{displayDuration(visitClockMs(visit.start, visit.end, visit.running, now))}</strong>
      <div className="onsite-timer-actions">
        <Button
          disabled={visit.running || visit.start !== ""}
          onClick={() => {
            const start = localDateTime(new Date())
            onChange({ date: start.slice(0, 10), end: "", running: true, start })
          }}
          type="button"
          variant="primary"
        >
          Start visit
        </Button>
        <Button
          disabled={!visit.running}
          onClick={() => {
            onChange({ end: localDateTime(new Date()), running: false })
          }}
          type="button"
          variant="outline"
        >
          End visit
        </Button>
      </div>
    </div>
  )
}

function VisitTimes({ onChange, prefix, visit }: {
  onChange: (change: Partial<Visit>) => void
  prefix: string
  visit: Visit
}) {
  const invalid = visit.start !== "" && visit.end !== "" && durationMs(visit.start, visit.end) === undefined
  return (
    <>
      <div className="onsite-field-grid onsite-field-grid--two">
        <FormGroup>
          <Label htmlFor={`${prefix}-start`}>Start time (editable)</Label>
          <Input
            id={`${prefix}-start`}
            name={`${prefix}-start`}
            onChange={(event) => {
              onChange({ start: event.currentTarget.value })
            }}
            step={1}
            type="datetime-local"
            value={visit.start}
          />
        </FormGroup>
        <FormGroup>
          <Label htmlFor={`${prefix}-end`}>End time (editable)</Label>
          <Input
            id={`${prefix}-end`}
            name={`${prefix}-end`}
            onChange={(event) => {
              onChange({ end: event.currentTarget.value, running: false })
            }}
            step={1}
            type="datetime-local"
            value={visit.end}
          />
        </FormGroup>
      </div>
      {invalid ? <Text role="status">End time is before start time. Check the recorded times.</Text> : null}
    </>
  )
}

export { OnsitePrototype }
