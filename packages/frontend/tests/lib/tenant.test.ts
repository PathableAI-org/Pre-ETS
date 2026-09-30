import { describe, it } from "vitest"

describe("TenantConfigService", () => {
  describe(".getAlias", () => {
    describe("when tenant resolution is host-based", () => {
      it.todo("returns the lowercase first host label as the tenant alias")
      it.todo("accepts tenant labels containing lowercase letters and hyphens")
      it.todo(
        "fails with TenantConfigError when the first label is empty or contains characters other than letters and hyphens"
      )
    })

    describe("when tenant resolution is static", () => {
      it.todo("returns the configured alias regardless of the supplied host, including an empty host")
      it.todo(
        "fails with TenantConfigError when the configured alias is empty or contains characters other than lowercase letters and hyphens"
      )
    })
  })

  describe(".getConfigFromAlias", () => {
    describe("when the alias has a valid JSON file in the configured tenant directory", () => {
      it.todo("returns that alias's display name and OIDC configuration")
      it.todo("uses the explicitly requested alias even when static resolution selects another tenant")
    })

    describe("when the tenant file cannot be read", () => {
      it.todo("fails with TenantConfigError for a missing file")
      it.todo("fails with TenantConfigError for an inaccessible file")
      it.todo("identifies the read failure and affected file in its message and retains the underlying cause")
    })

    describe("when the tenant file cannot be decoded", () => {
      it.todo("fails with TenantConfigError for malformed JSON")
      it.todo(
        "fails with TenantConfigError when required display name or OIDC fields are missing or have the wrong type"
      )
      it.todo("identifies the parse failure and affected file in its message and retains the underlying cause")
    })

    describe("idle timeout policy", () => {
      it.todo("defaults idleTimeoutMinutes to 30 when the field is omitted")
      it.todo("preserves integer idleTimeoutMinutes values from 5 through 30, including both limits")
      it.todo("fails with TenantConfigError for out-of-range, fractional, or nonnumeric idleTimeoutMinutes values")
    })

    describe("OIDC configuration", () => {
      it.todo("accepts both public and confidential client authentication modes")
      it.todo("fails with TenantConfigError for any other client authentication mode")
      it.todo("accepts an omitted connection and preserves a supplied string connection")
    })
  })

  describe(".getConfigFromHost", () => {
    describe("when tenant resolution is host-based", () => {
      it.todo("returns the configuration belonging to the alias resolved from the supplied host")
      it.todo("fails with TenantConfigError when the host cannot resolve to a valid alias")
    })

    describe("when tenant resolution is static", () => {
      it.todo("returns the configured tenant's configuration regardless of the supplied host")
      it.todo("fails with TenantConfigError when the configured static alias is invalid")
    })

    describe("when the resolved tenant's configuration is unavailable or invalid", () => {
      it.todo(
        "propagates the configuration failure as TenantConfigError without substituting another tenant's configuration"
      )
    })
  })
})
