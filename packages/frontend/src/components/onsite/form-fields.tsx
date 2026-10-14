import { FormGroup, Input, Label, Textarea } from "@pathableai/react"

export function Field({ id, label, type = "text", ...props }: {
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

export function Narrative({ id, label, rows = 3 }: { id: string; label: string; rows?: number }) {
  return (
    <FormGroup>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={id} rows={rows} />
    </FormGroup>
  )
}
