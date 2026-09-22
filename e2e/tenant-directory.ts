import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function prepareTenantDirectory(): string {
  if (process.env.E2E_TENANT_DIRECTORY) return process.env.E2E_TENANT_DIRECTORY
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "preets-e2e-tenants-"))
  process.env.E2E_TENANT_DIRECTORY = directory
  // Also clean up when webServer or global setup fails before global teardown.
  process.once("exit", () => {
    fs.rmSync(directory, { force: true, recursive: true })
  })
  fs.writeFileSync(
    path.join(directory, "springfield.json"),
    JSON.stringify({
      config: {
        displayName: "Local Demo",
        idleTimeoutMinutes: 5,
        oidc: { clientAuth: "public", clientId: "springfield-web", issuer: "http://127.0.0.1:8080/realms/pre-ets" }
      },
      slug: "springfield"
    })
  )
  return directory
}
