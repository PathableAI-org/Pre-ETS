import { type ChildProcess, spawn } from "node:child_process"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

import type { TenantWorld } from "./world.ts"

import { invalidEnvShape } from "./fixtures.ts"

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const FRONTEND_ROOT = path.join(REPO_ROOT, "packages/frontend")
const READY_TIMEOUT_MS = 120_000

export async function closeOwnedResources(world: TenantWorld): Promise<void> {
  await discardBrowserPages(world)
  await world.browser?.close().catch(() => undefined)
  await terminateProcess(world.ownedProcess)
  world.ownedProcess = undefined
  world.browser = undefined
}

export async function ensureBrowser(world: TenantWorld): Promise<void> {
  world.browser ??= await chromium.launch({
    args: [
      "--host-resolver-rules=MAP *.pathable.com 127.0.0.1,MAP *.localhost 127.0.0.1,MAP localhost 127.0.0.1,MAP pathable.com 127.0.0.1,MAP www.pathable.com 127.0.0.1"
    ]
  })
}

export async function ensureOwnedProcess(world: TenantWorld): Promise<void> {
  if (world.ownedProcess !== undefined) {
    return
  }

  await startOwnedProcess(world)
}

export async function restartOwnedProcess(world: TenantWorld): Promise<void> {
  await terminateProcess(world.ownedProcess)
  world.ownedProcess = undefined
  await discardBrowserPages(world)
  await startOwnedProcess(world)
}

export async function startOwnedProcess(world: TenantWorld): Promise<void> {
  await assertPortFree(world.port)
  const child = spawn(
    path.join(FRONTEND_ROOT, "node_modules/.bin/next"),
    [world.runtime === "production" ? "start" : "dev", "-H", "127.0.0.1", "-p", String(world.port)],
    {
      cwd: FRONTEND_ROOT,
      detached: true,
      env: buildProcessEnv(world),
      stdio: ["ignore", "pipe", "pipe"]
    }
  )
  world.ownedProcess = child
  const logs: string[] = []
  child.stdout.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"))
  })
  child.stderr.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"))
  })
  await waitForReady(world.port, child, logs)
}

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.once("error", (error) => {
      const code = "code" in error ? String(error.code) : "unknown"
      reject(new Error(`Test port ${String(port)} is occupied (${code}); refusing to reuse an existing server.`))
    })
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve()
      })
    })
  })
}

function buildProcessEnv(world: TenantWorld): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.TENANT_RESOLUTION
  delete env.TENANT_CONFIG_RECORDS_JSON
  delete env.TENANT_LOCAL_CONFIG_JSON
  env.NEXT_TELEMETRY_DISABLED = "1"
  env.NODE_ENV = world.runtime === "production" ? "production" : "development"

  if (world.unsupportedMode !== undefined) {
    env.TENANT_RESOLUTION = world.unsupportedMode
  } else if (world.resolutionMode !== undefined) {
    env.TENANT_RESOLUTION = world.resolutionMode
  }

  const records = world.tenants.map((tenant) => {
    if (tenant.slug === "springfield" && world.invalidDisplayName !== undefined) {
      return invalidEnvShape(world.invalidDisplayName)
    }

    return {
      config: { displayName: tenant.displayName },
      slug: tenant.slug
    }
  })
  env.TENANT_CONFIG_RECORDS_JSON = JSON.stringify(records)

  if (world.localConfigProblem !== undefined) {
    const payload = localConfigPayload(world.localConfigProblem)
    if (payload !== undefined) {
      env.TENANT_LOCAL_CONFIG_JSON = payload
    }
  } else if (world.localStaticRecord !== undefined) {
    env.TENANT_LOCAL_CONFIG_JSON = JSON.stringify({
      config: { displayName: world.localStaticRecord.displayName },
      slug: world.localStaticRecord.slug
    })
  }

  return env
}

async function discardBrowserPages(world: TenantWorld): Promise<void> {
  await world.springfieldPage?.context().close().catch(() => undefined)
  await world.shelbyvillePage?.context().close().catch(() => undefined)
  await world.page?.context().close().catch(() => undefined)
  await world.browserContext?.close().catch(() => undefined)
  world.browserContext = undefined
  world.page = undefined
  world.springfieldPage = undefined
  world.shelbyvillePage = undefined
}

function localConfigPayload(problem: string): string | undefined {
  switch (problem) {
    case "a missing tenant slug": {
      return JSON.stringify({ config: { displayName: "Local Demo" } })
    }
    case "inconsistent tenant identity": {
      return JSON.stringify({
        config: { displayName: "Local Demo" },
        identity: "shelbyville",
        slug: "springfield"
      })
    }
    case "no supplied record": {
      return undefined
    }
    default: {
      return JSON.stringify(invalidEnvShape(problem))
    }
  }
}

async function terminateProcess(child: ChildProcess | undefined): Promise<void> {
  if (child?.pid === undefined) {
    return
  }

  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const pid = child.pid

  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve()
    })
  })

  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }

  const first = await Promise.race([exited, delay(2000).then(() => "timeout" as const)])
  if (first !== "timeout") {
    return
  }

  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    child.kill("SIGKILL")
  }

  await Promise.race([exited, delay(2000)])
}

async function waitForReady(port: number, child: ChildProcess, logs: string[]): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(
        `Owned test process exited with ${String(child.exitCode)}\n${logs.join("")}`
      )
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get({ hostname: "127.0.0.1", path: "/", port }, (res) => {
          res.resume()
          resolve()
        })
        req.on("error", reject)
      })
      return
    } catch {
      await delay(200)
    }
  }

  throw new Error(`Owned test process on port ${String(port)} was not ready in time`)
}
