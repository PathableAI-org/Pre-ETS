export interface Visit {
  readonly date: string
  readonly end: string
  readonly id: number
  readonly running: boolean
  readonly start: string
}

export type VisitAction =
  | { readonly at: string; readonly type: "end" }
  | { readonly at: string; readonly type: "start" }
  | { readonly type: "edit-date"; readonly value: string }
  | { readonly type: "edit-end"; readonly value: string }
  | { readonly type: "edit-start"; readonly value: string }

/** Apply an explicit UI action without reading the clock or mutating the prior visit. */
export function transitionVisit(visit: Visit, action: VisitAction): Visit {
  switch (action.type) {
    case "edit-date":
      return { ...visit, date: action.value }
    case "edit-end":
      return { ...visit, end: action.value, running: false }
    case "edit-start":
      return { ...visit, running: action.value !== "" && visit.running, start: action.value }
    case "end":
      return visit.running && visit.start !== "" && action.at !== ""
        ? { ...visit, end: action.at, running: false }
        : visit
    case "start":
      return !visit.running && visit.start === "" && action.at !== ""
        ? { ...visit, date: action.at.slice(0, 10), end: "", running: true, start: action.at }
        : visit
  }
}
