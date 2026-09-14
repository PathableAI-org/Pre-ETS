import type { TenantSource } from "./source.ts"

import { bindHost as defaultBindHost } from "./host.ts"
import {
  type BoundTenant,
  type CurrentTenantContext,
  fail,
  type HostSuffix,
  ok,
  type TenantMode,
  type TenantOrigin,
  type TenantRecord,
  type TenantResult
} from "./model.ts"

export type HostBinder = (host: string | undefined, suffix: HostSuffix) => TenantResult<string>

export interface ResolveTenantInput {
  readonly bindHost?: HostBinder
  readonly host: string | undefined
  readonly hostSuffix: HostSuffix
  readonly localRecord?: TenantRecord | undefined
  readonly mode: TenantMode
  readonly source: TenantSource
}

export async function readBoundTenant(input: {
  readonly origin: TenantOrigin
  readonly slug: string
  readonly source: TenantSource
}): Promise<TenantResult<CurrentTenantContext>> {
  const record = await input.source.readTenantRecord(input.slug)
  if (!record.ok) {
    return record
  }

  if (record.value.slug !== input.slug) {
    return fail("invalid-config")
  }

  const identity: BoundTenant = {
    origin: input.origin,
    slug: input.slug
  }

  return ok({
    ...identity,
    config: record.value.config
  })
}

export async function resolveTenant(input: ResolveTenantInput): Promise<TenantResult<CurrentTenantContext>> {
  const binder = input.bindHost ?? defaultBindHost

  if (input.mode === "static") {
    if (input.localRecord === undefined) {
      return fail("invalid-config")
    }

    return ok({
      config: input.localRecord.config,
      origin: "local-static",
      slug: input.localRecord.slug
    })
  }

  const bound = binder(input.host, input.hostSuffix)
  if (!bound.ok) {
    return bound
  }

  return readBoundTenant({
    origin: "host-associated",
    slug: bound.value,
    source: input.source
  })
}
