/**
 * E4 (Next 16.3.5): Treat as document navigation when `Sec-Fetch-Dest: document`,
 * or when `Accept` includes `text/html` and RSC / Next-Router prefetch headers are
 * absent. Chosen over `Sec-Fetch-Mode: navigate` alone because Dest is more specific
 * for top-level document loads while Accept+missing RSC headers covers browsers that
 * omit Fetch Metadata.
 */
export function isDocumentNavigation(request: Request): boolean {
  if (request.headers.get("sec-fetch-dest") === "document") {
    return true
  }

  const accept = request.headers.get("accept") ?? ""
  if (!accept.includes("text/html")) {
    return false
  }

  if (
    request.headers.has("rsc")
    || request.headers.has("next-router-state-tree")
    || request.headers.has("next-router-prefetch")
  ) {
    return false
  }

  return true
}
