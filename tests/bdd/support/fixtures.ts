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
            issuer: production
              ? SYNTHETIC_OIDC_ISSUER_PRODUCTION
              : world.oidcMockIssuer ?? SYNTHETIC_OIDC_ISSUER
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
  options: { readonly production?: boolean } = {}
): TenantOidcConfig {
  return {
    clientAuth: "public",
    clientId: `${slug}-web`,
    connection: `${slug}-idp`,
    issuer: options.production === true
      ? SYNTHETIC_OIDC_ISSUER_PRODUCTION
      : SYNTHETIC_OIDC_ISSUER
  }
}

export function syntheticTenantConfig(
  displayName: string,
  slug: string,
  options: { readonly production?: boolean } = {}
): TenantConfig {
  return {
    displayName,
    oidc: syntheticOidcForSlug(slug, options)
  }
}

export function syntheticTenantRecord(
  slug: string,
  displayName: string,
  options: { readonly production?: boolean } = {}
): TenantRecord {
  return {
    config: syntheticTenantConfig(displayName, slug, options),
    slug
  }
}
