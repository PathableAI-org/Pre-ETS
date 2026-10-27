import { readSessionRequest, SESSION_COOKIE, type TenantAlias } from "@pathableai/pre-ets-frontend-services"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { runReferenceOperation } from "../../src/app/(app)/actions.ts"
import HomePage from "../../src/app/(app)/page.tsx"
import { initialReferenceActionState } from "../../src/features/session-reference.ts"
import {
  cookieWriteCount,
  cookieWriteOptions,
  resetRequestCookies,
  setRequestCookie,
  setRequestHost
} from "./next-headers-stub.ts"
import { ForbiddenError, NotFoundError, RedirectError } from "./next-navigation-stub.ts"

const operationProps = vi.hoisted(() => [] as unknown[])

vi.mock("../../src/features/session-reference.ts", () => ({
  initialReferenceActionState: { _tag: "Ready" },
  ReferenceOperation: (props: unknown) => {
    operationProps.push(props)
    return null
  }
}))

vi.mock("@pathableai/pre-ets-frontend-services", () => ({
  readSessionRequest: vi.fn(),
  SESSION_COOKIE: "pathable-session"
}))

const springfield = "springfield" as TenantAlias

const usableSession = {
  _tag: "UsableSession" as const,
  identity: { issuer: "https://provider.test/", subject: "subject-1" },
  idleDeadlineEpochMilliseconds: 1_800_000_000_000,
  tenantAlias: springfield,
  warningLeadMinutes: 5
}

describe("reference session enforcement", () => {
  beforeEach(() => {
    operationProps.length = 0
    vi.mocked(readSessionRequest).mockReset()
    resetRequestCookies()
    setRequestHost("springfield.localhost:3000")
    setRequestCookie(SESSION_COOKIE, "opaque-reference")
  })

  it("renders the admitted session and passes only the action into the feature client", async () => {
    vi.mocked(readSessionRequest).mockResolvedValue({
      session: usableSession,
      tenantAlias: usableSession.tenantAlias
    })

    const html = renderToStaticMarkup(await HomePage())
    expect(html).toContain("subject-1")
    expect(html).toContain("https://provider.test/")
    expect(html).toContain("springfield")
    expect(html).toContain(String(usableSession.idleDeadlineEpochMilliseconds))
    expect(html).toContain(String(usableSession.warningLeadMinutes))
    expect(operationProps).toEqual([{ action: runReferenceOperation }])
    expect(cookieWriteCount()).toBe(0)
    expect(readSessionRequest).toHaveBeenCalledWith({
      host: "springfield.localhost:3000",
      reference: "opaque-reference"
    })
  })

  it("returns one protected result and emits one receipt for a matching action", async () => {
    vi.mocked(readSessionRequest).mockResolvedValue({
      session: usableSession,
      tenantAlias: usableSession.tenantAlias
    })

    const result = await runReferenceOperation(initialReferenceActionState, new FormData())

    expect(result._tag).toBe("Succeeded")
    if (result._tag === "Succeeded") {
      expect(result.message.length).toBeGreaterThan(0)
      expect(result.message).not.toContain("subject-1")
      expect(result.message).not.toContain("springfield")
      expect(result.message).not.toContain("opaque-reference")
    }
    expect(cookieWriteCount()).toBe(1)
    const options = cookieWriteOptions()[0]
    expect(options).toMatchObject({ httpOnly: true, path: "/", sameSite: "lax", secure: false })
    expect(options).not.toHaveProperty("domain")
    expect(readSessionRequest).toHaveBeenCalledTimes(1)
  })

  it("redirects a page without a usable session and does not emit a receipt", async () => {
    vi.mocked(readSessionRequest).mockResolvedValue({
      session: { _tag: "NoUsableSession" },
      tenantAlias: springfield
    })

    await expect(HomePage()).rejects.toEqual(new RedirectError("/auth/login"))
    expect(cookieWriteCount()).toBe(0)
  })

  it("denies an action without a usable session and does not start login or emit a receipt", async () => {
    vi.mocked(readSessionRequest).mockResolvedValue({
      session: { _tag: "NoUsableSession" },
      tenantAlias: springfield
    })

    const result = await runReferenceOperation({ _tag: "Succeeded", message: "previous" }, new FormData())

    expect(result._tag).toBe("Denied")
    if (result._tag === "Denied") {
      expect(result.message).not.toContain("subject-1")
      expect(result.message).not.toContain("springfield")
      expect(result.message).not.toContain("previous")
    }
    expect(cookieWriteCount()).toBe(0)
    expect(readSessionRequest).toHaveBeenCalledTimes(1)
  })

  it("lets a tenant mismatch forbid the page and action before a receipt", async () => {
    vi.mocked(readSessionRequest).mockRejectedValue(new ForbiddenError())

    await expect(HomePage()).rejects.toBeInstanceOf(ForbiddenError)
    await expect(runReferenceOperation(initialReferenceActionState, new FormData())).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect(cookieWriteCount()).toBe(0)
  })

  it("propagates service and tenant failures without a protected result or receipt", async () => {
    vi.mocked(readSessionRequest).mockRejectedValue(new Error("The session service is unavailable"))
    await expect(HomePage()).rejects.toThrow("The session service is unavailable")
    await expect(runReferenceOperation(initialReferenceActionState, new FormData())).rejects.toThrow(
      "The session service is unavailable"
    )

    vi.mocked(readSessionRequest).mockRejectedValue(new NotFoundError())
    await expect(HomePage()).rejects.toBeInstanceOf(NotFoundError)
    expect(cookieWriteCount()).toBe(0)
  })

  it("does not apply session admission to public routes or raw tenant diagnostics", () => {
    const frontendRoot = fileURLToPath(new URL("../..", import.meta.url))
    const files = [
      join(frontendRoot, "src/app/auth/callback/route.ts"),
      join(frontendRoot, "src/app/auth/login/route.ts"),
      join(frontendRoot, "src/app/login-unavailable/page.tsx"),
      ...sourceFiles(join(frontendRoot, "src/app/%5Ftest")),
      join(frontendRoot, "../frontend-services/src/tenant-request.ts")
    ]
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toContain("readSessionRequest")
    }
  })
})

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : []
  })
