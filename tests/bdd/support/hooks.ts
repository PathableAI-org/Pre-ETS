import { After, Before } from "@cucumber/cucumber"
import { chromium } from "playwright"

import type { TenantWorld } from "./world.ts"

import { closeOwnedResources } from "./server.ts"

function resetTenantWorld(world: TenantWorld): void {
  world.authoritativeHost = undefined
  world.binderInvocationCount = undefined
  world.browser = undefined
  world.browserContext = undefined
  world.competingSlug = undefined
  world.configurationFailure = undefined
  world.contractResult = undefined
  world.hostCondition = undefined
  world.httpResponse = undefined
  world.localConfigProblem = undefined
  world.ownedProcess = undefined
  world.page = undefined
  world.playwrightChromium = chromium
  world.requestContext = undefined
  world.requestedHost = undefined
  world.resolutionMode = undefined
  world.runtime = undefined
  world.tenants = []
  world.unsupportedMode = undefined
}

Before(function(this: TenantWorld) {
  resetTenantWorld(this)
})

After(function(this: TenantWorld) {
  closeOwnedResources(this)
})
