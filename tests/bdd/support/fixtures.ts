import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { TenantConfig, TenantOidcConfig, TenantRecord } from "../../../packages/frontend/src/lib/tenant/types.ts"
import type { TenantWorld } from "./world.ts"

/** Local Keycloak issuer used for development / loopback BDD fixtures. */
export const SYNTHETIC_OIDC_ISSUER = "http://127.0.0.1:8080/realms/pre-ets"

/**
 * HTTPS issuer for production-runtime spawned frontends (`NODE_ENV=production`
 * rejects loopback HTTP issuers).
 */
export const SYNTHETIC_OIDC_ISSUER_PRODUCTION = "https://identity.example/realms/pre-ets"

export function invalidEnvShape(invalidName: string): unknown {
  switch (invalidName) {
    case "an empty Display Name": {
      return { config: { displayName: "" }, slug: "springfield" }
    }
    case "a numeric Display Name of 42": {
      return { config: { displayName: 42 }, slug: "springfield" }
    }
    case "a whitespace-only Display Name": {
      return { config: { displayName: "   " }, slug: "springfield" }
    }
    case "no Display Name field": {
      return { config: {}, slug: "springfield" }
    }
    default: {
      throw new Error(`Unknown invalid Display Name case: ${invalidName}`)
    }
  }
}

/**
 * Write `{alias}.json` files for the world into a fresh (or existing) directory and return it.
 * Used by the BDD owned Next process instead of injecting superseded JSON env documents.
 */
export function materializeTenantConfigDir(world: TenantWorld, production: boolean): string {
  const dir = world.tenantConfigDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "bdd-tenant-config-"))
  world.tenantConfigDir = dir
  fs.mkdirSync(dir, { recursive: true })

  // Clear prior scenario files when reusing a path.
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { force: true, recursive: true })
  }

  if (world.tenantConfigDirProblem === "a missing path") {
    fs.rmSync(dir, { force: true, recursive: true })
    world.tenantConfigDir = path.join(os.tmpdir(), `bdd-tenant-missing-${String(process.pid)}-${String(Date.now())}`)
    return world.tenantConfigDir
  }

  if (world.tenantConfigDirProblem === "a path that is not a directory") {
    fs.rmSync(dir, { force: true, recursive: true })
    const filePath = `${dir}.not-a-dir`
    fs.writeFileSync(filePath, "not-a-directory")
    world.tenantConfigDir = filePath
    return filePath
  }

  if (world.tenantConfigDirProblem === "an empty path") {
    world.tenantConfigDir = ""
    return ""
  }

  const records = recordsForWorldFiles(world, production)
  for (const record of records) {
    if (typeof record === "string") {
      // oidc unreadable: write raw broken content for springfield
      fs.writeFileSync(path.join(dir, "springfield.json"), record)
      continue
    }

    fs.writeFileSync(path.join(dir, `${record.slug}.json`), JSON.stringify(record))
  }

  if (world.aliasFileProblems !== undefined) {
    for (const [alias, problem] of Object.entries(world.aliasFileProblems)) {
      applyAliasFileProblem(dir, alias, problem, production, world.oidcMockIssuer)
    }
  }

  if (world.omitAliasFiles !== undefined) {
    for (const alias of world.omitAliasFiles) {
      fs.rmSync(path.join(dir, `${alias}.json`), { force: true })
    }
  }

  return dir
}

/** Serialize tenant JSON for a spawned frontend, including OIDC fixture overrides. */
export function recordsJsonForWorld(world: TenantWorld, production: boolean): string {
  if (world.oidcUnreadableConfig) {
    return "{not-json"
  }

  if (world.oidcFixtures === undefined || world.oidcFixtures.length === 0) {
    return JSON.stringify(
      world.tenants.map((tenant) => ({
        config: {
          displayName: tenant.displayName,
          oidc: {
            clientAuth: "public",
            clientId: `${tenant.slug}-web`,
            connection: `${tenant.slug}-idp`,
            issuer: world.oidcMockIssuer
              ?? (production ? SYNTHETIC_OIDC_ISSUER_PRODUCTION : SYNTHETIC_OIDC_ISSUER)
          }
        },
        slug: tenant.slug
      }))
    )
  }

  const records = world.oidcFixtures.map((fixture) => {
    if (fixture.slug === "springfield" && world.oidcRawSpringfieldOverride !== undefined) {
      return world.oidcRawSpringfieldOverride
    }

    return {
      config: {
        displayName: fixture.displayName,
        oidc: {
          clientAuth: fixture.clientAuth,
          clientId: fixture.clientId,
          issuer: fixture.issuer,
          ...(fixture.connection === undefined ? {} : { connection: fixture.connection })
        }
      },
      slug: fixture.slug
    }
  })

  return JSON.stringify(records)
}

export function syntheticOidcForSlug(
  slug: string,
  options: { readonly issuer?: string; readonly production?: boolean } = {}
): TenantOidcConfig {
  return {
    clientAuth: "public",
    clientId: `${slug}-web`,
    connection: `${slug}-idp`,
    issuer: options.issuer
      ?? (options.production === true
        ? SYNTHETIC_OIDC_ISSUER_PRODUCTION
        : SYNTHETIC_OIDC_ISSUER)
  }
}

export function syntheticTenantConfig(
  displayName: string,
  slug: string,
  options: { readonly issuer?: string; readonly production?: boolean } = {}
): TenantConfig {
  return {
    displayName,
    oidc: syntheticOidcForSlug(slug, options)
  }
}

export function syntheticTenantRecord(
  slug: string,
  displayName: string,
  options: { readonly issuer?: string; readonly production?: boolean } = {}
): TenantRecord {
  return {
    config: syntheticTenantConfig(displayName, slug, options),
    slug
  }
}

function applyAliasFileProblem(
  dir: string,
  alias: string,
  problem: string,
  production: boolean,
  issuer: string | undefined
): void {
  const oidcOptions = issuer === undefined ? { production } : { issuer, production }
  const filePath = path.join(dir, `${alias}.json`)
  switch (problem) {
    case "a declared tenant identity of shelbyville": {
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          config: syntheticTenantConfig("Shelbyville Demo", "shelbyville", oidcOptions),
          slug: "shelbyville"
        })
      )
      return
    }
    case "an empty Display Name": {
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          config: { displayName: "", oidc: syntheticOidcForSlug(alias, oidcOptions) },
          slug: alias
        })
      )
      return
    }
    case "an unreadable file": {
      fs.writeFileSync(filePath, JSON.stringify(syntheticTenantRecord(alias, "Unreadable", oidcOptions)))
      fs.chmodSync(filePath, 0)
      return
    }
    case "malformed JSON": {
      fs.writeFileSync(filePath, "{not-json")
      return
    }
    case "missing required configuration fields": {
      fs.writeFileSync(filePath, JSON.stringify({ config: {}, slug: alias }))
      return
    }
    default: {
      throw new Error(`Unknown alias file problem: ${problem}`)
    }
  }
}

function recordsForWorldFiles(
  world: TenantWorld,
  production: boolean
): (string | TenantRecord)[] {
  const oidcOptions = world.oidcMockIssuer === undefined
    ? { production }
    : { issuer: world.oidcMockIssuer, production }

  if (world.oidcUnreadableConfig) {
    return ["{not-json"]
  }

  if (world.oidcFixtures !== undefined && world.oidcFixtures.length > 0) {
    return world.oidcFixtures.map((fixture) => {
      if (fixture.slug === "springfield" && world.oidcRawSpringfieldOverride !== undefined) {
        return world.oidcRawSpringfieldOverride as TenantRecord
      }

      return {
        config: {
          displayName: fixture.displayName,
          oidc: {
            clientAuth: fixture.clientAuth,
            clientId: fixture.clientId,
            issuer: fixture.issuer,
            ...(fixture.connection === undefined ? {} : { connection: fixture.connection })
          }
        },
        slug: fixture.slug
      }
    })
  }

  const fromTenants = world.tenants.map((tenant) => {
    if (tenant.slug === "springfield" && world.invalidDisplayName !== undefined) {
      return invalidEnvShape(world.invalidDisplayName) as TenantRecord
    }

    return syntheticTenantRecord(tenant.slug, tenant.displayName, oidcOptions)
  })

  if (
    world.localStaticRecord !== undefined
    && !fromTenants.some((record) => typeof record !== "string" && record.slug === world.localStaticRecord?.slug)
  ) {
    fromTenants.push(
      syntheticTenantRecord(
        world.localStaticRecord.slug,
        world.localStaticRecord.displayName,
        oidcOptions
      )
    )
  }

  return fromTenants
}
