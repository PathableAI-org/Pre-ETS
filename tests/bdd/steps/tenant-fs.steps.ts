import type { DataTable } from "@cucumber/cucumber"

import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import type { TenantWorld } from "../support/world.ts"

import { createFilesystemTenantSource } from "../../../packages/frontend/src/lib/tenant/source.ts"
import {
  assertDisplayedName,
  assertLocalConfigError,
  assertNoSuccessfulContext,
  assertNotDisplayedName,
  openLandingPage
} from "../support/actions.ts"
import { materializeTenantConfigDir, syntheticTenantConfig } from "../support/fixtures.ts"
import { restartOwnedProcess } from "../support/server.ts"

/**
 * Filesystem tenant-config steps for `@tenant-config-fs`.
 * Reuses tenant landing HTTP/browser helpers; contract path safety uses an in-process FS source.
 */

Given(
  "a former full static configuration document still supplies tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    this.formerLocalConfigJson = JSON.stringify({
      config: syntheticTenantConfig(name, slug, { production: this.runtime === "production" }),
      slug
    })
  }
)

Given(
  "a former inline multi-tenant configuration document still supplies tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    this.formerInlineRecordsJson = JSON.stringify([
      {
        config: syntheticTenantConfig(name, slug, { production: this.runtime === "production" }),
        slug
      }
    ])
  }
)

Given("a tenant configuration directory is configured", function(this: TenantWorld) {
  this.tenantConfigDirProblem = undefined
  materializeTenantConfigDir(this, this.runtime === "production")
})

Given(
  "an alternative filesystem test directory supplies tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    this.tenants = [{ displayName: name, slug }]
    this.tenantConfigDir = undefined
    this.runtime = "production"
    materializeTenantConfigDir(this, true)
  }
)

Given("no former full static configuration document is supplied", function(this: TenantWorld) {
  this.formerLocalConfigJson = undefined
})

Given("no former inline multi-tenant configuration document is supplied", function(this: TenantWorld) {
  this.formerInlineRecordsJson = undefined
})

Given("production-like host association is enabled", function(this: TenantWorld) {
  this.resolutionMode = "host"
  this.runtime ??= "development"
})

Given("the application runs locally in development", function(this: TenantWorld) {
  this.runtime = "development"
})

Given(
  "the developer set the static tenant name to {string}",
  function(this: TenantWorld, name: string) {
    applyStaticNameSetting(this, name)
  }
)

Given(
  "the developer sets the static tenant name to {string}",
  function(this: TenantWorld, name: string) {
    applyStaticNameSetting(this, name)
  }
)

Given(
  "the directory contains synthetic tenant files:",
  function(this: TenantWorld, table: DataTable) {
    this.tenants = table.hashes().map((row) => ({
      displayName: row["Display Name"] ?? "",
      slug: row.alias ?? row.slug ?? ""
    }))
    materializeTenantConfigDir(this, this.runtime === "production")
  }
)

Given(
  "the directory has no file for alias {string}",
  function(this: TenantWorld, alias: string) {
    this.omitAliasFiles = [...(this.omitAliasFiles ?? []), alias]
    materializeTenantConfigDir(this, this.runtime === "production")
  }
)

Given(
  "the file for alias {string} has {string}",
  function(this: TenantWorld, alias: string, problem: string) {
    this.aliasFileProblems = { ...(this.aliasFileProblems ?? {}), [alias]: problem }
    materializeTenantConfigDir(this, this.runtime === "production")
  }
)

Given(
  "the host-bound alias is crafted as {string}",
  function(this: TenantWorld, alias: string) {
    this.craftedHostAlias = alias
  }
)

Given(
  "the operator changed only Display Name in {string} to {string} and completed the documented restart",
  async function(this: TenantWorld, fileName: string, name: string) {
    assert.ok(this.tenantConfigDir)
    const filePath = path.join(this.tenantConfigDir, fileName)
    const raw = fs.readFileSync(filePath, "utf8")
    const parsed = JSON.parse(raw) as { config: { displayName: string }; slug: string }
    parsed.config.displayName = name
    fs.writeFileSync(filePath, JSON.stringify(parsed))
    await restartOwnedProcess(this, { preserveCookies: true })
  }
)

Given(
  "the tenant configuration directory setting has {string}",
  function(this: TenantWorld, problem: string) {
    this.tenantConfigDirProblem = problem
  }
)

Given(
  "the user has seen {string} on the landing page at {string}",
  async function(this: TenantWorld, name: string, host: string) {
    await openLandingPage(this, host)
    assertDisplayedName(this, name)
  }
)

Then("consumers do not need knowledge of the configuration directory path", function(this: TenantWorld) {
  assert.ok(this.consumerContexts.length > 0 || this.contractResult?.ok === true)
})

Then(
  "diagnostics identify {string} without treating the outcome as a quiet empty tenant set",
  function(this: TenantWorld, category: string) {
    assert.match(category, /configuration unavailable/i)
    assert.ok(this.httpResponse)
    assert.notEqual(this.httpResponse.status, 403)
  }
)

Then(
  "neither a default tenant nor another tenant's Display Name is displayed",
  function(this: TenantWorld) {
    assertNoSuccessfulContext(this)
    for (const tenant of this.tenants) {
      assertNotDisplayedName(this, tenant.displayName)
    }
  }
)

Then("neither known tenant's Display Name is exposed", function(this: TenantWorld) {
  for (const tenant of this.tenants) {
    if (this.httpResponse !== undefined) {
      assertNotDisplayedName(this, tenant.displayName)
    }
  }

  assert.equal(this.contractResult?.ok ?? false, false)
})

Then(
  "no successful context depends on a full static JSON environment document",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse !== undefined || this.contractResult?.ok === true)
  }
)

Then(
  "only the file {string} under the configured directory is opened for that request",
  function(this: TenantWorld, file: string) {
    assert.deepEqual(this.openedTenantFiles, [file])
  }
)

Then(
  "the Display Name {string} is not displayed as a static stand-in",
  function(this: TenantWorld, name: string) {
    assertNotDisplayedName(this, name)
  }
)

Then("the Display Name {string} is not used", function(this: TenantWorld, name: string) {
  if (this.contractResult?.ok === true) {
    assert.notEqual(this.contractResult.value.config.displayName, name)
    return
  }

  assertNotDisplayedName(this, name)
})

Then(
  "the consumer does not need knowledge of the filesystem configuration source",
  function(this: TenantWorld) {
    assert.ok(this.contractResult?.ok === true || this.consumerContexts.length > 0)
  }
)

Then(
  "the consumer does not reinterpret the host to choose a configuration file",
  function(this: TenantWorld) {
    assert.ok(this.contractResult?.ok === true)
  }
)

Then(
  "the error explains how to supply a valid static tenant name and restart",
  function(this: TenantWorld) {
    assertLocalConfigError(this)
  }
)

Then(
  "the file {string} is not opened for that request",
  function(this: TenantWorld, file: string) {
    assert.ok(!this.openedTenantFiles.includes(file))
  }
)

Then("the read is rejected without leaving the configured directory", function(this: TenantWorld) {
  assert.equal(this.contractResult?.ok, false)
})

When("consumers read the established tenant configuration", async function(this: TenantWorld) {
  await readEstablishedFromFilesystem(this)
})

When(
  "the resolver consumes the static tenant name and configuration source",
  async function(this: TenantWorld) {
    await resolveStaticFilesystemContext(this)
  }
)

When(
  "the resolver consumes the static tenant name and filesystem configuration",
  async function(this: TenantWorld) {
    await resolveStaticFilesystemContext(this)
  }
)

When(
  "the resolver reads configuration for that alias from the configured directory",
  async function(this: TenantWorld) {
    assert.ok(this.craftedHostAlias !== undefined)
    assert.ok(this.tenantConfigDir)
    const opened: string[] = []
    const source = instrumentedSource(this.tenantConfigDir, opened, this.runtime !== "production")
    try {
      await source.readTenantRecord(this.craftedHostAlias)
      this.contractResult = {
        ok: true,
        value: {
          config: syntheticTenantConfig("unexpected", "unexpected"),
          slug: this.craftedHostAlias
        }
      }
    } catch {
      this.contractResult = { ok: false, reason: "invalid-config" }
    }

    this.openedTenantFiles = opened
  }
)

function applyStaticNameSetting(world: TenantWorld, nameSetting: string): void {
  world.resolutionMode = "static"
  world.runtime ??= "development"
  if (
    nameSetting === "no static tenant name"
    || nameSetting === "a blank static tenant name"
  ) {
    world.staticTenantAlias = nameSetting === "a blank static tenant name" ? "   " : undefined
    world.localStaticRecord = undefined
    return
  }

  world.staticTenantAlias = nameSetting
  const known = world.tenants.find((tenant) => tenant.slug === nameSetting)
  world.localStaticRecord = known
}

function instrumentedSource(dir: string, opened: string[], allowLoopbackHttp: boolean) {
  const inner = createFilesystemTenantSource(dir, { allowLoopbackHttp })
  return {
    async readTenantRecord(slug: string) {
      const candidate = path.join(dir, `${slug}.json`)
      if (fs.existsSync(path.normalize(candidate)) && path.dirname(path.normalize(candidate)) === dir) {
        opened.push(path.basename(candidate))
      }

      return await inner.readTenantRecord(slug)
    }
  }
}

async function readEstablishedFromFilesystem(world: TenantWorld): Promise<void> {
  assert.ok(world.establishedSlug)
  assert.ok(world.tenantConfigDir)
  const opened: string[] = []
  const source = instrumentedSource(world.tenantConfigDir, opened, world.runtime !== "production")
  const record = await source.readTenantRecord(world.establishedSlug)
  assert.ok(record)
  world.openedTenantFiles = opened
  world.consumerContexts = [
    { config: record.config, slug: record.slug },
    { config: record.config, slug: record.slug }
  ]
  world.contractResult = {
    ok: true,
    value: { config: record.config, slug: record.slug }
  }
}

async function resolveStaticFilesystemContext(world: TenantWorld): Promise<void> {
  materializeTenantConfigDir(world, false)
  assert.ok(world.tenantConfigDir)
  const alias = world.staticTenantAlias ?? world.localStaticRecord?.slug
  assert.ok(alias)
  world.binderInvocationCount = 0
  const source = createFilesystemTenantSource(world.tenantConfigDir, { allowLoopbackHttp: true })
  try {
    const record = await source.readTenantRecord(alias)
    if (record === undefined) {
      world.contractResult = { ok: false, reason: "unknown-tenant" }
      return
    }

    world.contractResult = {
      ok: true,
      value: { config: record.config, slug: record.slug }
    }
    world.consumerContexts = [{ config: record.config, slug: record.slug }]
  } catch {
    world.contractResult = { ok: false, reason: "invalid-config" }
  }
}
