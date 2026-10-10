"use client"

import { Button, CardGrid, Cluster, FormGroup, Heading, Input, Label, Stack, Surface, Text } from "@pathableai/react"
import { useEffect, useState } from "react"

import { Field, Narrative } from "./form-fields.tsx"
import { displayDuration, durationMs, localDateTime, visitClockMs } from "./visit-time.ts"

interface Visit {
  readonly date: string
  readonly end: string
  readonly id: number
  readonly running: boolean
  readonly start: string
}

const initialVisit: Visit = { date: "", end: "", id: 1, running: false, start: "" }

export function VisitLog() {
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
    <Surface aria-labelledby="onsite-log" as="section">
      <Stack gap="lg">
        <Heading id="onsite-log" level={2}>Service visit log</Heading>
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
      </Stack>
    </Surface>
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
    <Stack aria-labelledby={`${prefix}-heading`} as="section" gap="md">
      <Cluster gap="md">
        <Heading id={`${prefix}-heading`} level={3}>Visit {visit.id}</Heading>
        <Button onClick={onRemove} type="button" variant="low-emphasis">Remove visit</Button>
      </Cluster>
      <CardGrid gap="sm" variant="auto-fit">
        <VisitDate onChange={onChange} prefix={prefix} visit={visit} />
        <Field defaultValue="Example coach" id={`${prefix}-coach`} label="Job coach" />
        <VisitTimer now={now} onChange={onChange} visit={visit} />
      </CardGrid>
      <VisitTimes onChange={onChange} prefix={prefix} visit={visit} />
      <VisitNarratives prefix={prefix} />
    </Stack>
  )
}

function VisitNarratives({ prefix }: { prefix: string }) {
  return (
    <CardGrid gap="sm" variant="auto-fit">
      <Narrative id={`${prefix}-purpose`} label="Purpose of visit — what were you there to do?" />
      <Narrative id={`${prefix}-observations`} label="Observations — what did you observe?" />
      <Narrative id={`${prefix}-interventions`} label="Interventions — what did you contribute?" />
      <Narrative id={`${prefix}-next-steps`} label="Next steps — what will you do next?" />
    </CardGrid>
  )
}

function VisitTimer({ now, onChange, visit }: {
  now: number
  onChange: (change: Partial<Visit>) => void
  visit: Visit
}) {
  return (
    <Stack aria-label={`Visit ${String(visit.id)} timer`} as="div" gap="sm" role="group">
      <Text>Elapsed time (demo)</Text>
      <Text as="strong" className="onsite-timer-value">
        {displayDuration(visitClockMs(visit.start, visit.end, visit.running, now))}
      </Text>
      <Cluster gap="sm">
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
      </Cluster>
    </Stack>
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
      <CardGrid gap="sm" variant="auto-fit">
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
      </CardGrid>
      {invalid ? <Text role="status">End time is before start time. Check the recorded times.</Text> : null}
    </>
  )
}
