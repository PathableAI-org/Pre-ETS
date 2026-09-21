import { After, Before, setDefaultTimeout } from "@cucumber/cucumber"
import fs from "node:fs"
import net from "node:net"
import { chromium } from "playwright"

import type { TenantWorld } from "./world.ts"

import { ensureMockOidcIssuer } from "./oidc-mock.ts"
import { closeMockOidcServer } from "./oidc.ts"
import { closeOwnedResources } from "./server.ts"
import { cleanupScenarioSessionKeys } from "./session.ts"

setDefaultTimeout(60_000)

async function allocateFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close()
        reject(new Error("Unable to allocate a free test port."))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
    server.once("error", reject)
  })
}

function resetTenantWorld(world: TenantWorld): void {
  world.authoritativeHost = undefined
  world.binderInvocationCount = undefined
  world.browser = undefined
  world.browserContext = undefined
  world.competingSlug = undefined
  world.crossTenantSessionId = undefined
  world.configurationFailure = undefined
  world.consumerContexts = []
  world.contractResult = undefined
  world.establishedSlug = undefined
  world.hostCondition = undefined
  world.httpResponse = undefined
  world.invalidDisplayName = undefined
  world.lastVisitedUrl = undefined
  world.knownHostResult = undefined
  world.localStaticRecord = undefined
  world.modeDiagnostic = undefined
  world.forceDevelopmentRuntime = false
  world.oidcCallerOverride = undefined
  world.oidcClientSecretsJson = undefined
  world.oidcConcurrentResponses = undefined
  world.oidcDefect = undefined
  world.oidcFixtures = undefined
  world.oidcForcedFailure = undefined
  world.oidcLastRequestedUrl = undefined
  world.oidcMockBrokenAuthorize = false
  world.oidcMockIssuer = undefined
  world.oidcMockServer = undefined
  world.oidcNonDocumentRequest = false
  world.oidcRawSpringfieldOverride = undefined
  world.oidcSupportingCategory = undefined
  world.oidcTxKeyPrefix = undefined
  world.oidcUnreadableConfig = false
  world.ownedProcess = undefined
  world.page = undefined
  world.playwrightChromium = chromium
  world.port = 3000
  world.processSignature = undefined
  world.prefetchResponse = undefined
  world.requestedHost = undefined
  world.resolutionFailure = undefined
  world.resolutionMode = undefined
  world.runtime = undefined
  world.shelbyvilleIdentity = undefined
  world.shelbyvillePage = undefined
  world.springfieldIdentity = undefined
  world.springfieldPage = undefined
  world.tenantConfigDir = undefined
  world.tenantConfigDirProblem = undefined
  world.aliasFileProblems = undefined
  world.omitAliasFiles = undefined
  world.formerInlineRecordsJson = undefined
  world.formerLocalConfigJson = undefined
  world.craftedHostAlias = undefined
  world.openedTenantFiles = []
  world.staticTenantAlias = undefined
  world.tenants = []
  world.unknownHostResult = undefined
  world.unsupportedMode = undefined
  world.useBrowser = false
  world.useContract = false
  world.useHttp = false
  world.fixedNowSeconds = undefined
  world.foreignSessionRecord = undefined
  world.originalSessionId = undefined
  world.originalSessionTenantId = undefined
  world.previousSessionRecord = undefined
  world.redisStoppedViaDocker = false
  world.redisUrl = undefined
  world.sessionContract = undefined
  world.sessionCookieHostStyle = "pathable"
  world.sessionCookieJar = undefined
  world.sessionCookieTenant = undefined
  world.sessionCreatedAtSeconds = undefined
  world.sessionDoubleAccess = false
  world.sessionExpiresAtSeconds = undefined
  world.sessionId = undefined
  world.sessionIssuedSetCookie = undefined
  world.sessionKeyPrefix = undefined
  world.sessionRefusedCookie = false
  world.sessionHadCookieBeforeLastVisit = false
  world.sessionSigningSecret = undefined
  world.sessionStorageFailed = false
  world.sessionStorageFailureOperation = undefined
  world.sessionTenantId = undefined
  world.sessionTrackedIds = []
  world.sessionTtlSeconds = undefined
  world.sessionStoreTimeoutMs = undefined
  world.idleBrowserCause = undefined
  world.idleBrowserDurableRecords = undefined
  world.idleBrowserTemporaryWork = undefined
  world.idleContract = undefined
  world.idlePolicy = undefined
}

Before(async function(this: TenantWorld, { pickle }) {
  resetTenantWorld(this)
  this.port = await allocateFreePort()
  this.useBrowser = pickle.tags.some((tag) => tag.name === "@browser")
  this.useContract = pickle.tags.some((tag) => tag.name === "@contract")
  this.useHttp = this.useBrowser || pickle.tags.some((tag) => tag.name === "@http")
  if (pickle.tags.some((tag) => tag.name === "@production")) {
    this.runtime = "production"
    await ensureMockOidcIssuer(this)
  }
})

After({ timeout: 30_000 }, async function(this: TenantWorld) {
  await cleanupScenarioSessionKeys(this)
  await closeOwnedResources(this)
  await closeMockOidcServer(this)
  if (this.tenantConfigDir !== undefined && this.tenantConfigDir !== "") {
    await fs.promises.rm(this.tenantConfigDir, { force: true, recursive: true }).catch(() => undefined)
  }
})
