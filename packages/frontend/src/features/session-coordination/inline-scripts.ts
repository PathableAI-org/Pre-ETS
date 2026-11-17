/**
 * Removes every inline script from the document. Next serializes the page as the server rendered it into inline
 * scripts, protected text included, and leaves them in the document after they run; once the session ends in this tab
 * no earlier protected text may remain there (PREETS-SESSION-012 AC1, PREETS-SESSION-007 AC3, #498).
 *
 * Every inline script in the document has already run, and nothing reads one again: Next takes its render data from
 * the global the scripts fill, not from the nodes. The application renders no inline script of its own, so React owns
 * none of them. While the document is still loading the server can stream more, so those are removed once it has
 * loaded. What the page's script memory holds stays until a new document loads, a recorded limitation.
 */
export const removeInlineScripts = (): void => {
  const remove = () => {
    for (const script of document.querySelectorAll("script:not([src])")) script.remove()
  }
  remove()
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", remove, { once: true })
}
