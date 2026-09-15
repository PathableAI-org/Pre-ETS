import type { ChildProcess } from "node:child_process"
import type { Browser, BrowserContext, BrowserType, Page } from "playwright"

import { setWorldConstructor, World } from "@cucumber/cucumber"

import type { SetupSessionResult } from "../../../packages/frontend/src/lib/session/setup.ts"
import type { SessionRecord } from "../../../packages/frontend/src/lib/session/types.ts"
import type { ModeDiagnostic, TenantConfig } from "../../../packages/frontend/src/lib/tenant/types.ts"

export type ApplicationRuntime = "development" | "production"

export type ContractFailureReason = "invalid-config" | "invalid-host" | "unknown-tenant" | "unreadable-config"

export type ContractResult =
  | {
    readonly ok: false
    readonly reason: ContractFailureReason
  }
  | {
    readonly ok: true
    readonly value: {
      readonly config: TenantConfig
      readonly slug: string
    }
  }

export interface HttpExchange {
  readonly body: string
  readonly headers: Record<string, string>
  readonly status: number
}

export interface SessionContractEvidence {
  readonly events: readonly string[]
  readonly result: SetupSessionResult
}

export interface SyntheticTenantRecord {
  readonly displayName: string
  readonly slug: string
}

export type TenantResolutionMode = "host" | "static"

export class TenantWorld extends World {
  alternativeDisplayName: string | undefined = undefined
  authoritativeHost: string | undefined = undefined
  binderInvocationCount: number | undefined = undefined
  browser: Browser | undefined = undefined
  browserContext: BrowserContext | undefined = undefined
  competingSlug: string | undefined = undefined
  configurationFailure: string | undefined = undefined
  consumerContexts: { readonly config: TenantConfig; readonly slug: string }[] = []
  contractResult: ContractResult | undefined = undefined
  crossTenantSessionId: string | undefined = undefined
  establishedSlug: string | undefined = undefined
  fixedNowSeconds: number | undefined = undefined
  foreignSessionRecord: SessionRecord | undefined = undefined
  hostCondition: string | undefined = undefined
  httpResponse: HttpExchange | undefined = undefined
  invalidDisplayName: string | undefined = undefined
  knownHostResult: ContractResult | undefined = undefined
  lastVisitedUrl: string | undefined = undefined
  localConfigProblem: string | undefined = undefined
  localStaticRecord: SyntheticTenantRecord | undefined = undefined
  modeDiagnostic: ModeDiagnostic | undefined = undefined
  originalSessionId: string | undefined = undefined
  originalSessionTenantId: string | undefined = undefined
  ownedProcess: ChildProcess | undefined = undefined
  page: Page | undefined = undefined
  playwrightChromium: BrowserType | undefined = undefined
  port = 3000
  prefetchResponse: HttpExchange | undefined = undefined
  previousDisplayName: string | undefined = undefined
  previousSessionRecord: SessionRecord | undefined = undefined
  processSignature: string | undefined = undefined
  redisStoppedViaDocker = false
  redisUrl: string | undefined = undefined
  requestedHost: string | undefined = undefined
  resolutionFailure: ContractFailureReason | undefined = undefined
  resolutionMode: TenantResolutionMode | undefined = undefined
  runtime: ApplicationRuntime | undefined = undefined
  sessionContract: SessionContractEvidence | undefined = undefined
  sessionCookieHostStyle: "localhost" | "pathable" = "pathable"
  sessionCookieJar: Map<string, string> | undefined = undefined
  sessionCookieTenant: string | undefined = undefined
  sessionCreatedAtSeconds: number | undefined = undefined
  sessionDoubleAccess = false
  sessionExpiresAtSeconds: number | undefined = undefined
  sessionId: string | undefined = undefined
  sessionKeyPrefix: string | undefined = undefined
  sessionRefusedCookie = false
  sessionSigningSecret: string | undefined = undefined
  sessionStorageFailed = false
  sessionStorageFailureOperation: string | undefined = undefined
  sessionStoreTimeoutMs: number | undefined = undefined
  sessionTenantId: string | undefined = undefined
  sessionTrackedIds: string[] = []
  sessionTtlSeconds: number | undefined = undefined
  shelbyvilleIdentity: undefined | { readonly slug: string } = undefined
  shelbyvillePage: Page | undefined = undefined
  springfieldIdentity: undefined | { readonly slug: string } = undefined
  springfieldPage: Page | undefined = undefined
  tenants: SyntheticTenantRecord[] = []
  unknownHostResult: ContractResult | undefined = undefined
  unsupportedMode: string | undefined = undefined
  useBrowser = false
  useContract = false
  useHttp = false
}

setWorldConstructor(TenantWorld)
