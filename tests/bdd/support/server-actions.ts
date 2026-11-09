import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

interface ServerReferenceManifest {
  readonly node: Readonly<Record<string, { readonly exportedName?: string; readonly filename?: string }>>
}

const manifestPath = fileURLToPath(
  new URL("../../../packages/frontend/.next/server/server-reference-manifest.json", import.meta.url)
)

/** The production build's Server Action ID for an exported action, read from Next's server-reference manifest. */
export async function serverActionId(exportedName: string): Promise<string> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ServerReferenceManifest
  const [id, ...others] = Object.entries(manifest.node)
    .filter(([, entry]) => entry.exportedName === exportedName)
    .map(([entryId]) => entryId)
  if (id === undefined || others.length > 0) throw new Error(`Expected one built Server Action named ${exportedName}`)
  return id
}
