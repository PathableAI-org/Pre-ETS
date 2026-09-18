import { describe, expect, it } from "vitest"

import {
  createMismatchedTenantSource,
  createStaticTenantSource,
  createThrowingTenantSource
} from "../../src/lib/tenant/source.ts"
import { CONFIG_UNAVAILABLE, parseTenantRecord } from "../../src/lib/tenant/types.ts"
import {
  shelbyvilleConfig,
  shelbyvilleRecord,
  springfieldConfig,
  springfieldOidc,
  springfieldRecord
} from "./tenant-fixtures.ts"

describe("static tenant source", () => {
  it("accepts an empty known set", async () => {
    const source = createStaticTenantSource([])
    await expect(source.readTenantRecord("springfield")).resolves.toBeUndefined()
  })

  it("rejects duplicate slugs and allows duplicate display names", () => {
    expect(() => createStaticTenantSource([springfieldRecord, springfieldRecord])).toThrow(
      CONFIG_UNAVAILABLE
    )
    expect(() =>
      createStaticTenantSource([
        springfieldRecord,
        {
          config: { displayName: "Springfield Demo", oidc: shelbyvilleConfig.oidc },
          slug: "shelbyville"
        }
      ])
    ).not.toThrow()
  })

  it("returns the matching record and rejects a lookup mismatch", async () => {
    const source = createStaticTenantSource([springfieldRecord, shelbyvilleRecord])
    await expect(source.readTenantRecord("springfield")).resolves.toEqual(springfieldRecord)

    const mismatched = createMismatchedTenantSource(shelbyvilleRecord)
    await expect(mismatched.readTenantRecord("springfield")).resolves.toEqual(shelbyvilleRecord)
  })

  it("throws when the source cannot complete a read", async () => {
    await expect(createThrowingTenantSource().readTenantRecord("springfield")).rejects.toThrow(
      CONFIG_UNAVAILABLE
    )
  })

  it("accepts loopback HTTP issuers when allowLoopbackHttp is enabled", async () => {
    const loopbackRecord = {
      config: {
        displayName: "Springfield Demo",
        oidc: {
          ...springfieldOidc,
          issuer: "http://127.0.0.1:8080/realms/pre-ets"
        }
      },
      slug: "springfield"
    }

    expect(() => createStaticTenantSource([loopbackRecord])).toThrow(CONFIG_UNAVAILABLE)

    const source = createStaticTenantSource([loopbackRecord], { allowLoopbackHttp: true })
    await expect(source.readTenantRecord("springfield")).resolves.toEqual(loopbackRecord)
  })

  it("rejects missing, numeric, empty, whitespace, and unknown configuration fields", () => {
    expect(parseTenantRecord({ config: {}, slug: "springfield" })).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: 42 }, slug: "springfield" })).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: "" }, slug: "springfield" })).toBeUndefined()
    expect(parseTenantRecord({ config: { displayName: "   " }, slug: "springfield" })).toBeUndefined()
    expect(
      parseTenantRecord({
        config: { displayName: "Springfield Demo", extra: true, oidc: springfieldOidc },
        slug: "springfield"
      })
    ).toBeUndefined()
    expect(
      parseTenantRecord({
        config: { displayName: "Nope", oidc: springfieldOidc },
        slug: "www"
      })
    ).toBeUndefined()
    expect(
      parseTenantRecord({
        config: springfieldConfig,
        slug: "springfield"
      })
    ).toEqual(springfieldRecord)
  })
})
