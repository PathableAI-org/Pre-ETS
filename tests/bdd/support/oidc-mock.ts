import type { AddressInfo } from "node:net"

import assert from "node:assert/strict"
import http from "node:http"

import type { MockOidcServerHandle, TenantWorld } from "./world.ts"

/** Start an in-process discovery + authorize stub so production HTTP initiation works. */
export async function ensureMockOidcIssuer(world: TenantWorld): Promise<string> {
  if (world.oidcMockIssuer !== undefined && world.oidcMockServer !== undefined) {
    return world.oidcMockIssuer
  }

  const server = await startMockOidcServer()
  world.oidcMockServer = server
  world.oidcMockIssuer = server.issuer
  return server.issuer
}

async function startMockOidcServer(): Promise<MockOidcServerHandle> {
  const state: { brokenAuthorize: boolean } = { brokenAuthorize: false }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname.endsWith("/.well-known/openid-configuration")) {
      const issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/realms/pre-ets`
      const authorize = state.brokenAuthorize
        ? "urn:invalid:authorize"
        : `${issuer}/protocol/openid-connect/auth`
      const body = JSON.stringify({
        authorization_endpoint: authorize,
        code_challenge_methods_supported: ["S256"],
        id_token_signing_alg_values_supported: ["RS256"],
        issuer,
        jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        token_endpoint: `${issuer}/protocol/openid-connect/token`
      })
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(body)
      return
    }

    if (url.pathname.endsWith("/protocol/openid-connect/auth")) {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "/"
      const oauthState = url.searchParams.get("state") ?? ""
      const cancelTarget = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}error=access_denied&state=${
        encodeURIComponent(oauthState)
      }`
      const failTarget = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}error=login_required&state=${
        encodeURIComponent(oauthState)
      }`
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(
        [
          "<html><body>",
          "<h1>Mock IdP Login</h1>",
          "<form><button type=\"submit\">Sign in</button></form>",
          `<p><a href="${cancelTarget}">Cancel</a></p>`,
          `<p><a href="${failTarget}">Fail authentication</a></p>`,
          "</body></html>"
        ].join("")
      )
      return
    }

    res.writeHead(404)
    res.end("not found")
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      resolve()
    })
  })

  const address = server.address()
  assert.ok(address !== null && typeof address !== "string")
  const baseUrl = `http://127.0.0.1:${String(address.port)}`
  const issuer = `${baseUrl}/realms/pre-ets`

  return {
    baseUrl,
    get brokenAuthorize() {
      return state.brokenAuthorize
    },
    set brokenAuthorize(value: boolean) {
      state.brokenAuthorize = value
    },
    async close() {
      state.brokenAuthorize = false
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
    issuer
  }
}
