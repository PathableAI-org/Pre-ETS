import { fail, ok, parseTenantRecord, type TenantRecord, type TenantResult } from "./model.ts"

export interface TenantSource {
  readTenantRecord(slug: string): Promise<TenantResult<TenantRecord>>
}

export function createMismatchedTenantSource(record: TenantRecord): TenantSource {
  return {
    readTenantRecord(): Promise<TenantResult<TenantRecord>> {
      return Promise.resolve(ok(record))
    }
  }
}

export function createStaticTenantSource(records: unknown): TenantResult<TenantSource> {
  if (!Array.isArray(records)) {
    return fail("invalid-config")
  }

  const parsed: TenantRecord[] = []
  const slugs = new Set<string>()

  for (const record of records) {
    const result = parseTenantRecord(record)
    if (!result.ok) {
      return result
    }

    if (slugs.has(result.value.slug)) {
      return fail("invalid-config")
    }

    slugs.add(result.value.slug)
    parsed.push(result.value)
  }

  const bySlug = new Map(parsed.map((record) => [record.slug, record]))

  return ok({
    readTenantRecord(slug: string): Promise<TenantResult<TenantRecord>> {
      const record = bySlug.get(slug)
      if (record === undefined) {
        return Promise.resolve(fail("unknown-tenant"))
      }

      if (record.slug !== slug) {
        return Promise.resolve(fail("invalid-config"))
      }

      return Promise.resolve(ok(record))
    }
  })
}

export function createUnavailableTenantSource(): TenantSource {
  return {
    readTenantRecord(): Promise<TenantResult<TenantRecord>> {
      return Promise.resolve(fail("config-unavailable"))
    }
  }
}
