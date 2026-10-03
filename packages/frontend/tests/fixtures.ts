import type { Types } from "effect"

import { fileURLToPath } from "node:url"

import type * as ServerConfig from "../src/lib/config/index.ts"

const configDir = fileURLToPath(new URL("../fixtures/tenant-config", import.meta.url))

const BaseServerConfig = {
  baseHostname: "localhost",
  env: "test",
  tenant: {
    configDir,
    resolution: "host"
  }
} satisfies ServerConfig.ServerConfig

export type ServerConfigOverride = ConfigOverride<ServerConfig.ServerConfig>

type AllKeys<T> = T extends unknown ? keyof T : never

type ConfigOverride<T> = [T] extends [Primitive] ? T
  : Types.Simplify<Distribute<T, SharedKeys<T>, ExclusiveKeys<T>, LiteralDiscriminants<T>>>

type Distribute<T, Shared extends PropertyKey, Exclusive extends PropertyKey, Discs extends PropertyKey> = T extends
  unknown ? Member<T, Shared, Exclusive, Discs>
  : never

type Equal<X, Y> = [X] extends [Y] ? [Y] extends [X] ? true : false : false

type ExclusiveKeys<T> = Exclude<AllKeys<T>, SharedKeys<T>>

type IntersectProps<T, K extends PropertyKey> = (
  T extends unknown ? (x: K extends keyof T ? T[K] : never) => void : never
) extends (x: infer I) => void ? I : never

type IsNarrowLiteral<T> = [T] extends [boolean | null | number | string] ? [string] extends [T] ? false
  : [number] extends [T] ? false
  : [boolean] extends [T] ? false
  : true
  : false

// `keyof T` distributes over the union, so each member would be compared with itself.
type LiteralDiscriminants<T> = keyof {
  [
    K in AllKeys<T> as MembersDiffer<T, K> extends true ? IsNarrowLiteral<PropOf<T, K>> extends true ? K
      : never
      : never
  ]: true
}

type Member<T, Shared extends PropertyKey, Exclusive extends PropertyKey, Discs extends PropertyKey> =
  Extract<keyof T, Exclusive> extends never ? { readonly [K in Extract<keyof T, Shared>]?: ConfigOverride<T[K]> }
    :
      & { readonly [K in Extract<keyof T, Discs>]: ConfigOverride<T[K]> }
      & { readonly [K in Extract<keyof T, Exclusive>]: ConfigOverride<T[K]> }
      & { readonly [K in Extract<keyof T, Shared>]?: ConfigOverride<T[K]> }

type MembersDiffer<T, K extends PropertyKey> = Equal<IntersectProps<T, K>, PropOf<T, K>> extends true ? false : true

type Primitive = bigint | boolean | null | number | string | undefined

type PropOf<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never

type SharedKeys<T> = keyof T

export const buildServerConfig = (overrides: ServerConfigOverride = {}): ServerConfig.ServerConfig => {
  const env = overrides.env ?? BaseServerConfig.env

  if (env === "production") {
    return {
      ...BaseServerConfig,
      ...overrides,
      env,
      tenant: {
        ...BaseServerConfig.tenant,
        ...overrides.tenant,
        resolution: "host"
      }
    }
  }

  if (overrides.tenant?.resolution === "static") {
    return {
      ...BaseServerConfig,
      ...overrides,
      env,
      tenant: {
        ...BaseServerConfig.tenant,
        ...overrides.tenant,
        resolution: "static",
        staticAlias: overrides.tenant.staticAlias
      }
    }
  }

  return {
    ...BaseServerConfig,
    ...overrides,
    env,
    tenant: {
      ...BaseServerConfig.tenant,
      ...overrides.tenant,
      resolution: "host"
    }
  }
}
