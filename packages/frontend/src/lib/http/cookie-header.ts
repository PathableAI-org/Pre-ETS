export function readSingleNamedCookie(
  request: Request,
  name: string
): string | undefined {
  const header = request.headers.get("cookie")
  if (header === null || header === "") {
    return undefined
  }

  const parts = header.split(";")
  let found: string | undefined
  for (const part of parts) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf("=")
    if (separator <= 0) {
      continue
    }

    const cookieName = trimmed.slice(0, separator)
    if (cookieName !== name) {
      continue
    }

    if (found !== undefined) {
      return undefined
    }

    found = trimmed.slice(separator + 1)
  }

  return found
}
