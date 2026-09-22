import http from "node:http"

import type { CapabilityWorld } from "./world.ts"

import { listenOnLoopback } from "./listen.ts"

/** Discovery and arrival only; successful authentication belongs to real Keycloak E2E. */
export async function startProvider(world: CapabilityWorld): Promise<void> {
  const server = http.createServer((request, response) => {
    if (request.url?.endsWith("/.well-known/openid-configuration")) {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({
        authorization_endpoint: `${world.issuer}/protocol/openid-connect/auth`,
        code_challenge_methods_supported: ["S256"],
        id_token_signing_alg_values_supported: ["RS256"],
        issuer: world.issuer,
        jwks_uri: `${world.issuer}/certs`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        token_endpoint: `${world.issuer}/token`
      }))
    } else {
      response.writeHead(200, { "Content-Type": "text/html" })
      response.end(
        "<html lang=\"en\"><title>Test provider</title><h1>Mock provider login</h1><button>Sign in</button></html>"
      )
    }
  })
  world.provider = server
  const port = await listenOnLoopback(server)
  world.issuer = `http://127.0.0.1:${String(port)}/realms/pre-ets`
}
