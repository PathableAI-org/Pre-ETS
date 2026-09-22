import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createFilesystemTenantSource, logFilesystemFailure } from "../../src/lib/tenant/source.ts"
import { CONFIG_UNAVAILABLE } from "../../src/lib/tenant/types.ts"
import { shelbyvilleRecord, springfieldRecord, writeTempTenantConfigDir } from "./tenant-fixtures.ts"

describe("filesystem tenant source", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it("throws CONFIG_UNAVAILABLE when the directory is missing, empty, or not a directory", () => {
    const missing = path.join(os.tmpdir(), `tenant-config-missing-${String(process.pid)}`)
    expect(() => createFilesystemTenantSource(missing)).toThrow(CONFIG_UNAVAILABLE)
    expect(() => createFilesystemTenantSource("")).toThrow(CONFIG_UNAVAILABLE)
    expect(() => createFilesystemTenantSource("   ")).toThrow(CONFIG_UNAVAILABLE)

    const filePath = path.join(os.tmpdir(), `tenant-config-file-${String(process.pid)}`)
    fs.writeFileSync(filePath, "not-a-dir")
    tempDirs.push(filePath)
    expect(() => createFilesystemTenantSource(filePath)).toThrow(CONFIG_UNAVAILABLE)
  })

  it("resolves a relative directory against cwd at construction", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-config-rel-"))
    tempDirs.push(parent)
    const childName = "tenants"
    const child = path.join(parent, childName)
    fs.mkdirSync(child)
    fs.writeFileSync(path.join(child, "springfield.json"), JSON.stringify(springfieldRecord))

    const source = createFilesystemTenantSource(childName, { cwd: parent })
    await expect(source.readTenantRecord("springfield")).resolves.toEqual(springfieldRecord)
  })

  it("reads an absolute directory and returns undefined for ENOENT", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    const source = createFilesystemTenantSource(dir)
    await expect(source.readTenantRecord("springfield")).resolves.toEqual(springfieldRecord)
    await expect(source.readTenantRecord("unknown")).resolves.toBeUndefined()
  })

  it("throws for malformed JSON, invalid config, slug mismatch, and path escape", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "broken.json"), "{not-json")
    fs.writeFileSync(
      path.join(dir, "empty-name.json"),
      JSON.stringify({ config: { displayName: "", oidc: springfieldRecord.config.oidc }, slug: "empty-name" })
    )
    fs.writeFileSync(
      path.join(dir, "mismatch.json"),
      JSON.stringify({ ...shelbyvilleRecord, slug: "shelbyville" })
    )

    const source = createFilesystemTenantSource(dir)
    await expect(source.readTenantRecord("broken")).rejects.toThrow(CONFIG_UNAVAILABLE)
    await expect(source.readTenantRecord("empty-name")).rejects.toThrow(CONFIG_UNAVAILABLE)
    await expect(source.readTenantRecord("mismatch")).rejects.toThrow(CONFIG_UNAVAILABLE)
    await expect(source.readTenantRecord("../outside")).rejects.toThrow(CONFIG_UNAVAILABLE)
    await expect(source.readTenantRecord("springfield/../secret")).rejects.toThrow(CONFIG_UNAVAILABLE)
    await expect(source.readTenantRecord("nested/springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
  })

  it("rejects a symlink that escapes the configured directory", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-config-out-"))
    tempDirs.push(outside)
    fs.writeFileSync(path.join(outside, "secret.json"), JSON.stringify(springfieldRecord))

    const dir = writeTempTenantConfigDir([])
    tempDirs.push(dir)
    fs.symlinkSync(path.join(outside, "secret.json"), path.join(dir, "springfield.json"))

    const source = createFilesystemTenantSource(dir)
    await expect(source.readTenantRecord("springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
  })

  it("returns a frozen immutable record and does not re-open after cache", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord])
    tempDirs.push(dir)
    const source = createFilesystemTenantSource(dir)
    const readSpy = vi.spyOn(fsp, "readFile")

    const first = await source.readTenantRecord("springfield")
    expect(first).toEqual(springfieldRecord)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first?.config)).toBe(true)
    expect(Object.isFrozen(first?.config.oidc)).toBe(true)

    const second = await source.readTenantRecord("springfield")
    expect(second).toBe(first)
    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it("does not readdir the directory for a host read", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord, shelbyvilleRecord])
    tempDirs.push(dir)
    const readdirSpy = vi.spyOn(fsp, "readdir")
    const readdirSyncSpy = vi.spyOn(fs, "readdirSync")

    const source = createFilesystemTenantSource(dir)
    await source.readTenantRecord("springfield")

    expect(readdirSpy).not.toHaveBeenCalled()
    expect(readdirSyncSpy).not.toHaveBeenCalled()
  })

  it("logs category-only failures without file bodies", async () => {
    const sink = vi.fn()
    logFilesystemFailure("parse", sink)
    expect(sink).toHaveBeenCalledWith(JSON.stringify({ category: "tenant-config-fs", reason: "parse" }))

    const dir = writeTempTenantConfigDir([])
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "springfield.json"), "{\"secret\":\"must-not-log\",\"slug\":\"x\"}")
    const onFailure = vi.fn()
    const source = createFilesystemTenantSource(dir, { onFailure })
    await expect(source.readTenantRecord("springfield")).rejects.toThrow(CONFIG_UNAVAILABLE)
    expect(onFailure).toHaveBeenCalledWith("parse")
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain("must-not-log")
  })
  it("opens only the selected tenant file without reading another tenant", async () => {
    const dir = writeTempTenantConfigDir([springfieldRecord, shelbyvilleRecord])
    tempDirs.push(dir)
    const read = vi.spyOn(fsp, "readFile")
    const source = createFilesystemTenantSource(dir)
    await source.readTenantRecord("springfield")
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0]?.[0]).toBe(fs.realpathSync(path.join(dir, "springfield.json")))
  })

  it("source substitution preserves the selected identity and observes replacement configuration", async () => {
    const first = writeTempTenantConfigDir([springfieldRecord])
    const second = writeTempTenantConfigDir([{
      ...springfieldRecord,
      config: { ...springfieldRecord.config, displayName: "Springfield Training" }
    }])
    tempDirs.push(first, second)
    await expect(createFilesystemTenantSource(first).readTenantRecord("springfield")).resolves.toEqual(
      springfieldRecord
    )
    await expect(createFilesystemTenantSource(second).readTenantRecord("springfield")).resolves.toMatchObject({
      config: { displayName: "Springfield Training" },
      slug: "springfield"
    })
  })
})
