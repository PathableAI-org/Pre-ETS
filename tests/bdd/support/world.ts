import type { ChildProcess } from "node:child_process"
import type { APIRequestContext, Browser, BrowserContext, BrowserType, Page, Response } from "playwright"

import { setWorldConstructor, World } from "@cucumber/cucumber"

export type ApplicationRuntime = "development" | "production"

export interface ContractTenantContext {
  readonly displayName: string
  readonly origin: TenantOrigin
  readonly slug: string
}

export interface SyntheticTenantRecord {
  readonly displayName: string
  readonly slug: string
}

export type TenantOrigin = "host-associated" | "local-static"

export type TenantResolutionMode = "host" | "static"

export class TenantWorld extends World {
  authoritativeHost: string | undefined = undefined
  binderInvocationCount: number | undefined = undefined
  browser: Browser | undefined = undefined
  browserContext: BrowserContext | undefined = undefined
  competingSlug: string | undefined = undefined
  configurationFailure: string | undefined = undefined
  contractResult: ContractTenantContext | undefined = undefined
  hostCondition: string | undefined = undefined
  httpResponse: Response | undefined = undefined
  localConfigProblem: string | undefined = undefined
  ownedProcess: ChildProcess | undefined = undefined
  page: Page | undefined = undefined
  playwrightChromium: BrowserType | undefined = undefined
  requestContext: APIRequestContext | undefined = undefined
  requestedHost: string | undefined = undefined
  resolutionMode: TenantResolutionMode | undefined = undefined
  runtime: ApplicationRuntime | undefined = undefined
  tenants: SyntheticTenantRecord[] = []
  unsupportedMode: string | undefined = undefined
}

setWorldConstructor(TenantWorld)
