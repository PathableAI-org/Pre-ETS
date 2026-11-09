import fs from "node:fs/promises"
import path from "node:path"

interface ServerReferenceManifest {
  readonly node: Readonly<Record<string, { readonly exportedName?: string; readonly filename?: string }>>
}

/** The production build's Server Action ID for an exported action, read from Next's server-reference manifest. */
export async function serverActionId(exportedName: string): Promise<string> {
  const manifestPath = path.resolve("packages/frontend/.next/server/server-reference-manifest.json")
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ServerReferenceManifest
  const ids = Object.entries(manifest.node)
    .filter(([, entry]) => entry.exportedName === exportedName)
    .map(([id]) => id)
  if (ids.length !== 1) throw new Error(`Expected one built Server Action named ${exportedName}`)
  return ids[0] ?? ""
}
