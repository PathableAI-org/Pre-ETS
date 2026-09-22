import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"

import {
  CONFIG_UNAVAILABLE,
  type FilesystemFailureCategory,
  isCanonicalTenantSlug,
  parseTenantRecord,
  resolveTenantConfigDir,
  type TenantRecord
} from "./types.ts"

export interface CreateFilesystemTenantSourceOptions {
  readonly allowLoopbackHttp?: boolean
  readonly cwd?: string
  readonly onFailure?: (category: FilesystemFailureCategory) => void
}

export interface TenantSource {
  readTenantRecord(slug: string): Promise<TenantRecord | undefined>
}

/**
 * Read-only filesystem tenant source. Validates the directory at construction
 * (fail-fast). Relative `directory` resolves against `options.cwd` / process CWD
 * at construction time.
 */
export function createFilesystemTenantSource(
  directory: string,
  options: CreateFilesystemTenantSourceOptions = {}
): TenantSource {
  const onFailure = options.onFailure ?? ((category) => {
    logFilesystemFailure(category)
  })
  const cwd = options.cwd ?? process.cwd()
  let resolvedDir: string
  try {
    resolvedDir = resolveTenantConfigDir(directory, cwd)
  } catch {
    onFailure("missing-dir")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  let realDir: string
  try {
    realDir = fs.realpathSync(resolvedDir)
  } catch {
    onFailure("missing-dir")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  let dirStat: fs.Stats
  try {
    dirStat = fs.statSync(realDir)
  } catch {
    onFailure("missing-dir")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  if (!dirStat.isDirectory()) {
    onFailure("missing-dir")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  const cache = new Map<string, TenantRecord>()
  const allowLoopbackHttp = options.allowLoopbackHttp

  return {
    async readTenantRecord(slug: string): Promise<TenantRecord | undefined> {
      const cached = cache.get(slug)
      if (cached !== undefined) {
        return cached
      }

      const realFile = await resolveTenantFilePath(slug, realDir, onFailure)
      if (realFile === undefined) {
        return undefined
      }

      const raw = await readTenantFile(realFile, onFailure)
      if (raw === undefined) {
        return undefined
      }

      const frozen = freezeTenantRecord(parseValidatedRecord(slug, raw, allowLoopbackHttp, onFailure))
      cache.set(slug, frozen)
      return frozen
    }
  }
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

/** Category-only structured failure log; never includes file bodies or secrets. */
export function logFilesystemFailure(
  category: FilesystemFailureCategory,
  sink: (line: string) => void = console.error
): void {
  try {
    sink(JSON.stringify({ category: "tenant-config-fs", reason: category }))
  } catch {
    // Logging failure must not change tenant selection.
  }
}

function freezeTenantRecord(record: TenantRecord): TenantRecord {
  Object.freeze(record.config.oidc)
  Object.freeze(record.config)
  return Object.freeze(record)
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function parseValidatedRecord(
  slug: string,
  raw: string,
  allowLoopbackHttp: boolean | undefined,
  onFailure: (category: FilesystemFailureCategory) => void
): TenantRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    onFailure("parse")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  const record = parseTenantRecord(
    parsed,
    allowLoopbackHttp === undefined ? {} : { allowLoopbackHttp }
  )
  if (record === undefined) {
    onFailure("parse")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  if (record.slug !== slug) {
    onFailure("mismatch")
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return record
}

async function readTenantFile(
  realFile: string,
  onFailure: (category: FilesystemFailureCategory) => void
): Promise<string | undefined> {
  try {
    return await fsp.readFile(realFile, "utf8")
  } catch (error) {
    if (isEnoent(error)) {
      return undefined
    }

    onFailure("io")
    throw new Error(CONFIG_UNAVAILABLE, { cause: error })
  }
}

function rejectEscape(onFailure: (category: FilesystemFailureCategory) => void): never {
  onFailure("escape")
  throw new Error(CONFIG_UNAVAILABLE)
}

async function resolveTenantFilePath(
  slug: string,
  realDir: string,
  onFailure: (category: FilesystemFailureCategory) => void
): Promise<string | undefined> {
  if (!isCanonicalTenantSlug(slug)) {
    rejectEscape(onFailure)
  }

  const fileName = `${slug}.json`
  const normalized = path.normalize(path.join(realDir, fileName))
  if (path.dirname(normalized) !== realDir || path.basename(normalized) !== fileName) {
    rejectEscape(onFailure)
  }

  let realFile: string
  try {
    realFile = await fsp.realpath(normalized)
  } catch (error) {
    if (isEnoent(error)) {
      return undefined
    }

    onFailure("io")
    throw new Error(CONFIG_UNAVAILABLE, { cause: error })
  }

  if (path.dirname(realFile) !== realDir || path.basename(realFile) !== fileName) {
    rejectEscape(onFailure)
  }

  return realFile
}
