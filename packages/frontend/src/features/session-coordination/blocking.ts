/**
 * What the library `Modal` does not do for the expiration warning (#156 research D8, workarounds 3 and 5). Removed
 * when the library ships a modal with an inert background (#400, styles#264); restoration stays only if the library's
 * own restoration lacks the main-content fallback.
 */

/** The child of `document.body` that contains `element`, or `undefined` when it is not in the body. */
const bodyChildOf = (element: Element): Element | undefined => {
  let current: Element | null = element
  while (current !== null && current.parentElement !== document.body) current = current.parentElement
  return current ?? undefined
}

/**
 * Makes every child of `document.body` except `surface`'s own body-level ancestor inert (FR-016). Answers the undo,
 * which gives each child back the `inert` value it had, so a child that was already inert stays inert.
 */
export const blockBackground = (surface: Element): () => void => {
  const own = bodyChildOf(surface)
  const blocked = [...document.body.children]
    .filter((child): child is HTMLElement => child !== own && "inert" in child)
    .map((child) => ({ child, inert: child.inert }))
  for (const { child } of blocked) child.inert = true
  return () => {
    for (const { child, inert } of blocked) child.inert = inert
  }
}

/** An element that can be focused from script: an HTML element, or an SVG element, which has the same `focus`. */
const isFocusable = (element: Element | null): element is HTMLElement => element !== null && "focus" in element

/** Focuses `element` and answers whether it took focus; an element that cannot take focus leaves focus where it was. */
const takesFocus = (element: HTMLElement): boolean => {
  element.focus()
  return document.activeElement === element
}

/**
 * Focuses `previous` if it is connected and takes focus, otherwise `fallback` (FR-017). The body is where focus rests
 * when nothing has it, so it counts as nothing. The fallback, the page's main content, is made focusable from script
 * only when it is not focusable already, as a skip-link target is.
 */
export const restoreFocus = (previous: Element | null, fallback: HTMLElement | null): void => {
  const earlier = previous === document.body ? null : previous
  if (isFocusable(earlier) && earlier.isConnected && takesFocus(earlier)) return
  if (!fallback?.isConnected) return
  if (!fallback.hasAttribute("tabindex")) fallback.tabIndex = -1
  fallback.focus()
}
