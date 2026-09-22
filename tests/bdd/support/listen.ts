import type { Server } from "node:net"

import assert from "node:assert/strict"

export async function listenOnLoopback(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  return address.port
}
