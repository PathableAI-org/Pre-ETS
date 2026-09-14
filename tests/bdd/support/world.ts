import type { ChildProcess } from "node:child_process"
import type { Browser, BrowserContext, BrowserType, Page } from "playwright"

import { setWorldConstructor, World } from "@cucumber/cucumber"

import type {
  CurrentTenantContext,
  ModeDiagnostic,
  TenantFailureReason,
  TenantResult
} from "../../../packages/frontend/src/tenant/model.ts"
import type { MappedTenantResponse } from "../../../packages/frontend/src/tenant/response.ts"

export type ApplicationRuntime = "development" | "production"

export interface HttpExchange {
  readonly body: string
  readonly headers: Record<string, string>
  readonly status: number
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
  consumerContexts: CurrentTenantContext[] = []
  contractResult: TenantResult<CurrentTenantContext> | undefined = undefined
  establishedSlug: string | undefined = undefined
  hostCondition: string | undefined = undefined
  httpResponse: HttpExchange | undefined = undefined
  invalidDisplayName: string | undefined = undefined
  knownHostResult: TenantResult<CurrentTenantContext> | undefined = undefined
  localConfigProblem: string | undefined = undefined
  localStaticRecord: SyntheticTenantRecord | undefined = undefined
  mappedFailure: MappedTenantResponse | undefined = undefined
  modeDiagnostic: ModeDiagnostic | undefined = undefined
  ownedProcess: ChildProcess | undefined = undefined
  page: Page | undefined = undefined
  playwrightChromium: BrowserType | undefined = undefined
  port = 3000
  prefetchResponse: HttpExchange | undefined = undefined
  previousDisplayName: string | undefined = undefined
  requestedHost: string | undefined = undefined
  resolutionFailure: TenantFailureReason | undefined = undefined
  resolutionMode: TenantResolutionMode | undefined = undefined
  runtime: ApplicationRuntime | undefined = undefined
  shelbyvilleIdentity: CurrentTenantContext | undefined = undefined
  shelbyvillePage: Page | undefined = undefined
  springfieldIdentity: CurrentTenantContext | undefined = undefined
  springfieldPage: Page | undefined = undefined
  tenants: SyntheticTenantRecord[] = []
  unknownHostResult: TenantResult<CurrentTenantContext> | undefined = undefined
  unsupportedMode: string | undefined = undefined
  useBrowser = false
  useContract = false
  useHttp = false
}

setWorldConstructor(TenantWorld)
