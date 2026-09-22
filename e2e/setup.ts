import assert from "node:assert/strict"

import { connectRedis } from "./redis.ts"

export default async function setup(): Promise<void> {
  try {
    const client = await connectRedis()
    try {
      assert.equal(await client.ping(), "PONG")
    } finally {
      client.destroy()
    }
    const response = await fetch("http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(5000)
    })
    assert.equal(response.status, 200)
    const metadata: unknown = await response.json()
    assert.ok(typeof metadata === "object" && metadata !== null && "issuer" in metadata)
    assert.equal(metadata.issuer, "http://127.0.0.1:8080/realms/pre-ets")
  } catch (cause) {
    throw new Error(
      "E2E requires the existing Compose Redis and Keycloak stack. Start it manually with docker compose up -d --wait redis keycloak, then retry.",
      { cause }
    )
  }
}
