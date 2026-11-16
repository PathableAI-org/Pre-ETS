import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { type TestRun, testRunEnvironment } from "../../scripts/test-run.ts"

const generated = "00000000-0000-4000-8000-000000000000"
const run = (env: NodeJS.ProcessEnv): TestRun => testRunEnvironment(env, () => generated)

const on = (env: NodeJS.ProcessEnv) => {
  const result = run(env)
  assert.equal(result.telemetry, "on")
  return result
}

void describe("test run environment (#475 V-014)", () => {
  void it("fills the local defaults, a generated run identifier, and the marker when nothing is set", () => {
    const result = on({ PATH: "/usr/bin" })
    assert.equal(result.runId, generated)
    assert.deepEqual(result.env, {
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/",
      OTEL_RESOURCE_ATTRIBUTES: `service.instance.id=${generated}`,
      OTEL_SERVICE_NAME: "pre-ets-frontend",
      PATH: "/usr/bin",
      TELEMETRY_EXPORT_TIMING: "immediate",
      TEST_TELEMETRY: "true"
    })
  })

  void it("treats empty settings as absent", () => {
    const result = on({
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      OTEL_RESOURCE_ATTRIBUTES: "",
      OTEL_SERVICE_NAME: "",
      TELEMETRY_EXPORT_TIMING: ""
    })
    assert.equal(result.env.OTEL_EXPORTER_OTLP_ENDPOINT, "http://127.0.0.1:4318/")
    assert.equal(result.env.OTEL_SERVICE_NAME, "pre-ets-frontend")
    assert.equal(result.env.TELEMETRY_EXPORT_TIMING, "immediate")
    assert.equal(result.env.OTEL_RESOURCE_ATTRIBUTES, `service.instance.id=${generated}`)
  })

  for (
    const [name, value] of [
      ["OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector.example.test:4318/"],
      ["OTEL_SERVICE_NAME", "another-service"],
      ["OTEL_SERVICE_VERSION", "abc123"],
      ["TELEMETRY_EXPORT_TIMING", "batch"]
    ] as const
  ) {
    void it(`keeps a supplied ${name}`, () => {
      assert.equal(on({ [name]: value }).env[name], value)
    })
  }

  void it("appends a generated identifier and keeps every existing resource attribute", () => {
    const result = on({ OTEL_RESOURCE_ATTRIBUTES: "service.version=abc123,deployment.environment=local" })
    assert.equal(
      result.env.OTEL_RESOURCE_ATTRIBUTES,
      `service.version=abc123,deployment.environment=local,service.instance.id=${generated}`
    )
    assert.equal(result.runId, generated)
  })

  void it("keeps a supplied run identifier and reports it decoded, as the SDK reads it", () => {
    const attributes = "service.version=abc123, service.instance.id = run%2D1"
    const result = on({ OTEL_RESOURCE_ATTRIBUTES: attributes })
    assert.equal(result.env.OTEL_RESOURCE_ATTRIBUTES, attributes)
    assert.equal(result.runId, "run-1")
  })

  void it("generates an identifier when the supplied one is empty", () => {
    const result = on({ OTEL_RESOURCE_ATTRIBUTES: "service.instance.id=" })
    assert.equal(result.runId, generated)
  })

  for (const value of ["true", "yes", "on", "1", "y"]) {
    void it(`leaves the environment unchanged when OTEL_SDK_DISABLED is ${value}`, () => {
      const env = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:14318/", OTEL_SDK_DISABLED: value }
      assert.deepEqual(run(env), { env, telemetry: "off" })
    })
  }

  for (const value of ["false", "0", "", "TRUE"]) {
    void it(`turns telemetry on when OTEL_SDK_DISABLED is ${JSON.stringify(value)}`, () => {
      assert.equal(run({ OTEL_SDK_DISABLED: value }).telemetry, "on")
    })
  }

  void it("does not mutate its input", () => {
    const env = { OTEL_RESOURCE_ATTRIBUTES: "service.version=abc123" }
    on(env)
    assert.deepEqual(env, { OTEL_RESOURCE_ATTRIBUTES: "service.version=abc123" })
  })
})
