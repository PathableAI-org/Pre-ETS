import { After, Before, setDefaultTimeout } from "@cucumber/cucumber"
import { chromium } from "playwright"

import type { TenantWorld } from "./world.ts"

import { closeOwnedResources } from "./server.ts"

setDefaultTimeout(60_000)

function resetTenantWorld(world: TenantWorld): void {
  world.alternativeDisplayName = undefined
  world.authoritativeHost = undefined
  world.binderInvocationCount = undefined
  world.browser = undefined
  world.browserContext = undefined
  world.competingSlug = undefined
  world.configurationFailure = undefined
  world.consumerContexts = []
  world.contractResult = undefined
  world.establishedSlug = undefined
  world.hostCondition = undefined
  world.httpResponse = undefined
  world.invalidDisplayName = undefined
  world.knownHostResult = undefined
  world.localConfigProblem = undefined
  world.localStaticRecord = undefined
  world.mappedFailure = undefined
  world.modeDiagnostic = undefined
  world.ownedProcess = undefined
  world.page = undefined
  world.playwrightChromium = chromium
  world.port = 3000
  world.previousDisplayName = undefined
  world.prefetchResponse = undefined
  world.requestedHost = undefined
  world.resolutionFailure = undefined
  world.resolutionMode = undefined
  world.runtime = undefined
  world.shelbyvilleIdentity = undefined
  world.shelbyvillePage = undefined
  world.springfieldIdentity = undefined
  world.springfieldPage = undefined
  world.tenants = []
  world.unknownHostResult = undefined
  world.unsupportedMode = undefined
  world.useBrowser = false
  world.useContract = false
  world.useHttp = false
}

Before(function(this: TenantWorld, { pickle }) {
  resetTenantWorld(this)
  this.useBrowser = pickle.tags.some((tag) => tag.name === "@browser")
  this.useContract = pickle.tags.some((tag) => tag.name === "@contract")
  this.useHttp = this.useBrowser || pickle.tags.some((tag) => tag.name === "@http")
})

After({ timeout: 15_000 }, async function(this: TenantWorld) {
  await closeOwnedResources(this)
})
