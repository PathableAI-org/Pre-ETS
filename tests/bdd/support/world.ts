import type { ChildProcess } from "node:child_process"
import type { Browser, BrowserContext, BrowserType, Page } from "playwright"

import { setWorldConstructor, World } from "@cucumber/cucumber"

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
  establishedSlug: string | undefined = undefined
  hostCondition: string | undefined = undefined
  httpResponse: HttpExchange | undefined = undefined
  invalidDisplayName: string | undefined = undefined
  knownHostResult: ContractResult | undefined = undefined
  localConfigProblem: string | undefined = undefined
  localStaticRecord: SyntheticTenantRecord | undefined = undefined
  modeDiagnostic: ModeDiagnostic | undefined = undefined
  ownedProcess: ChildProcess | undefined = undefined
  page: Page | undefined = undefined
  playwrightChromium: BrowserType | undefined = undefined
  port = 3000
  prefetchResponse: HttpExchange | undefined = undefined
  previousDisplayName: string | undefined = undefined
  requestedHost: string | undefined = undefined
  resolutionFailure: ContractFailureReason | undefined = undefined
  resolutionMode: TenantResolutionMode | undefined = undefined
  runtime: ApplicationRuntime | undefined = undefined
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
