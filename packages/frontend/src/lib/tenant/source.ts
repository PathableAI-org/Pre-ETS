import { CONFIG_UNAVAILABLE, parseTenantRecord, type TenantRecord } from "./types.ts"

export interface TenantSource {
  readTenantRecord(slug: string): Promise<TenantRecord | undefined>
}

export function createMismatchedTenantSource(record: TenantRecord): TenantSource {
  return {
    readTenantRecord(): Promise<TenantRecord | undefined> {
      return Promise.resolve(record)
    }
  }
}

export function createStaticTenantSource(
  records: unknown,
  options: { readonly allowLoopbackHttp?: boolean } = {}
): TenantSource {
  if (!Array.isArray(records)) {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  const parsed: TenantRecord[] = []
  const slugs = new Set<string>()

  for (const record of records) {
    const value = parseTenantRecord(record, options)
    if (value === undefined) {
      throw new Error(CONFIG_UNAVAILABLE)
    }

    if (slugs.has(value.slug)) {
      throw new Error(CONFIG_UNAVAILABLE)
    }

    slugs.add(value.slug)
    parsed.push(value)
  }

  const bySlug = new Map(parsed.map((record) => [record.slug, record]))

  return {
    readTenantRecord(slug: string): Promise<TenantRecord | undefined> {
      const record = bySlug.get(slug)
      if (record === undefined) {
        return Promise.resolve(undefined)
      }

      if (record.slug !== slug) {
        return Promise.reject(new Error(CONFIG_UNAVAILABLE))
      }

      return Promise.resolve(record)
    }
  }
}

export function createThrowingTenantSource(): TenantSource {
  return {
    readTenantRecord(): Promise<TenantRecord | undefined> {
      return Promise.reject(new Error(CONFIG_UNAVAILABLE))
    }
  }
}

export function parseRecordsJson(raw: string): TenantSource {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return createStaticTenantSource(parsed)
}
