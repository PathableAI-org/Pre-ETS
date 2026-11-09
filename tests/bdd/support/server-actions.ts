import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

interface ServerReferenceManifest {
  readonly node: Readonly<Record<string, { readonly exportedName?: string; readonly filename?: string }>>
}

const manifestPath = fileURLToPath(
  new URL("../../../packages/frontend/.next/server/server-reference-manifest.json", import.meta.url)
)

/**
 * A `multipart/form-data` body as a browser's fetch serializes `FormData`; React's Server Action client sends its
 * encoded arguments this way.
 */
export async function multipartBody(
  fields: Readonly<Record<string, string>>
): Promise<{ readonly body: Buffer; readonly contentType: string }> {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  const encoded = new Request("http://multipart.invalid/", { body: form, method: "POST" })
  const contentType = encoded.headers.get("content-type")
  if (contentType === null) throw new Error("FormData serialization produced no content type")
  return { body: Buffer.from(await encoded.arrayBuffer()), contentType }
}

/** The production build's Server Action ID for an exported action, read from Next's server-reference manifest. */
export async function serverActionId(exportedName: string): Promise<string> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ServerReferenceManifest
  const [id, ...others] = Object.entries(manifest.node)
    .filter(([, entry]) => entry.exportedName === exportedName)
    .map(([entryId]) => entryId)
  if (id === undefined || others.length > 0) throw new Error(`Expected one built Server Action named ${exportedName}`)
  return id
}
