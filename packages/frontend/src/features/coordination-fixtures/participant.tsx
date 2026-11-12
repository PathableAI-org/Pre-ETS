"use client"

import {
  Button,
  Checkbox,
  FormGroup,
  Heading,
  Input,
  Label,
  Link,
  Select,
  Stack,
  Text,
  Textarea
} from "@pathableai/react"

import { focusTargetProps, moveFocus } from "../../shared/browser-tracing.ts"

const PROGRAMMATIC_FOCUS_DELAY_MILLISECONDS = 2_000
const GOAL_INPUT = "participant-goal"

/**
 * Synthetic protected page with semantic controls. "Focus later" moves focus to the text input after a delay, so the
 * focus change is programmatic and must not count as activity on its own.
 */
export function ParticipantFixture() {
  const focusLater = () => {
    setTimeout(() => {
      moveFocus(document.getElementById(GOAL_INPUT), "participant_goal")
    }, PROGRAMMATIC_FOCUS_DELAY_MILLISECONDS)
  }
  return (
    <Stack gap="md">
      <Heading level={1}>Coordination participant</Heading>
      <Text>Synthetic participant page for session coordination checks.</Text>
      <Link href="/coordination/roster">Open roster page</Link>
      <FormGroup>
        <Label htmlFor={GOAL_INPUT}>Goal</Label>
        <Input id={GOAL_INPUT} type="text" {...focusTargetProps("participant_goal")} />
      </FormGroup>
      <FormGroup>
        <Label htmlFor="participant-setting">Setting</Label>
        <Select id="participant-setting">
          <option value="classroom">Classroom</option>
          <option value="workplace">Workplace</option>
        </Select>
      </FormGroup>
      <Checkbox id="participant-consent">Synthetic acknowledgement</Checkbox>
      <FormGroup>
        <Label htmlFor="participant-notes">Notes</Label>
        <Textarea id="participant-notes" />
      </FormGroup>
      <Button onClick={focusLater} type="button" variant="outline">Focus later</Button>
    </Stack>
  )
}
