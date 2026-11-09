import type { InPageSessionActivity } from "@pathableai/pre-ets-frontend-services"

/** The in-page kinds a tab may communicate, as `POST /session/activity` accepts them. */
export const IN_PAGE_ACTIVITIES: ReadonlySet<string> = new Set<InPageSessionActivity>([
  "intentional-control-activation",
  "keyboard-interaction",
  "text-entry",
  "touch-interaction",
  "user-driven-meaningful-input-focus"
])

/** The element facts the classifier reads; a DOM `Element` provides all of them. */
interface ElementFacts {
  getAttribute(name: string): null | string
  hasAttribute(name: string): boolean
  readonly isContentEditable?: boolean | undefined
  readonly parentElement: ElementFacts | null
  readonly tagName: string
}

const CONTROL_TAGS: ReadonlySet<string> = new Set(["BUTTON", "SELECT", "SUMMARY", "TEXTAREA"])
const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox"
])
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Alt", "AltGraph", "CapsLock", "Control", "Fn", "Meta", "Shift"])

const isElement = (target: EventTarget | null): target is ElementFacts & EventTarget =>
  target !== null && "tagName" in target && "getAttribute" in target && "parentElement" in target

const isEditable = (element: ElementFacts) => {
  if (element.isContentEditable === true) return true
  const editable = element.getAttribute("contenteditable")
  return editable !== null && editable !== "false"
}

const isInteractive = (element: ElementFacts) => {
  const tag = element.tagName.toUpperCase()
  if (tag === "INPUT") return element.getAttribute("type")?.toLowerCase() !== "hidden"
  if (tag === "A") return element.hasAttribute("href")
  return CONTROL_TAGS.has(tag) || isEditable(element) || INTERACTIVE_ROLES.has(element.getAttribute("role") ?? "")
}

const isUnavailable = (element: ElementFacts) =>
  element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true"

const isHiddenFromUse = (element: ElementFacts) =>
  element.hasAttribute("inert") || element.getAttribute("aria-hidden") === "true"

const ancestry = function*(start: ElementFacts) {
  for (let current: ElementFacts | null = start; current !== null; current = current.parentElement) yield current
}

/** The closest enabled meaningful input containing the target, unless it is inert or hidden from assistive technology. */
const meaningfulInput = (target: EventTarget | null) => {
  if (!isElement(target)) return undefined
  const elements = [...ancestry(target)]
  const input = elements.find(isInteractive)
  if (input === undefined || isUnavailable(input) || elements.some(isHiddenFromUse)) return undefined
  return input
}

type KindRule = (event: Event, gestureInCurrentTask: boolean) => InPageSessionActivity | undefined

/** The kind each listened event type yields on a meaningful input; any other event type never qualifies. */
const KIND_RULES: Readonly<Partial<Record<string, KindRule>>> = {
  beforeinput: () => "text-entry",
  click: () => "intentional-control-activation",
  focusin: (_event, gestureInCurrentTask) => gestureInCurrentTask ? "user-driven-meaningful-input-focus" : undefined,
  keydown: (event) => "key" in event && MODIFIER_KEYS.has(String(event.key)) ? undefined : "keyboard-interaction",
  pointerdown: (event) => "pointerType" in event && event.pointerType === "touch" ? "touch-interaction" : undefined
}

/**
 * Pure classification of one DOM event (research D4). Only trusted events on a meaningful input qualify; pointer
 * movement, scrolling, and focus without a user gesture in the same task (programmatic focus) never do.
 */
export function classifySessionActivity(
  event: Event,
  context: { readonly gestureInCurrentTask: boolean }
): InPageSessionActivity | undefined {
  if (!event.isTrusted || meaningfulInput(event.target) === undefined) return undefined
  return KIND_RULES[event.type]?.(event, context.gestureInCurrentTask)
}
