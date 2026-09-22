import assert from "node:assert/strict"
import { createClient } from "redis"

export async function cleanupKeys(): Promise<void> {
  const runId = process.env.E2E_RUN_ID
  assert.ok(runId)
  const client = await connectRedis()
  try {
    for await (const keys of client.scanIterator({ COUNT: 100, MATCH: `e2e:${runId}:*` })) {
      if (keys.length > 0) await client.del(keys)
    }
  } finally {
    client.destroy()
  }
}

export async function connectRedis() {
  const client = createClient({
    socket: { connectTimeout: 2000, reconnectStrategy: false },
    url: "redis://127.0.0.1:6379"
  })
  client.on("error", () => undefined)
  await client.connect()
  return client
}
