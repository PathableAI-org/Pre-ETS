import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const FRONTEND_ROOT = path.join(REPO_ROOT, "packages/frontend")
const JOSE_ENTRY = path.join(FRONTEND_ROOT, "node_modules/jose/dist/webapi/index.js")
const REDIS_ENTRY = path.join(FRONTEND_ROOT, "node_modules/redis")
const require = createRequire(import.meta.url)

export interface MinimalRedisClient {
  connect(): Promise<void>
  del(...keys: string[]): Promise<number>
  get(key: string): Promise<null | string>
  keys(pattern: string): Promise<string[]>
  on?(event: "error", listener: () => void): void
  ping(): Promise<string>
  quit(): Promise<string>
  scanIterator(options: { COUNT: number; MATCH: string }): AsyncIterable<string>
  set(
    key: string,
    value: string,
    options?: {
      expiration: {
        type: "EXAT"
        value: number
      }
    }
  ): Promise<null | string>
}

export interface SessionJwtHeader {
  alg?: string
  typ?: string
}

export interface SessionJwtPayload {
  exp?: number
  sid?: string
  tenant?: string
}

export interface SessionJwtVerifyResult {
  payload: SessionJwtPayload
  protectedHeader: SessionJwtHeader
}

interface JoseModule {
  decodeJwt(token: string): SessionJwtPayload
  jwtVerify(
    token: string,
    secret: Uint8Array,
    options: { algorithms: string[] }
  ): Promise<SessionJwtVerifyResult>
}

interface RedisModule {
  createClient(options: {
    disableOfflineQueue?: boolean
    socket?: {
      connectTimeout?: number
      reconnectStrategy?: (() => Error | false) | false
    }
    url: string
  }): MinimalRedisClient
}

let josePromise: Promise<JoseModule> | undefined
let redisPromise: Promise<RedisModule> | undefined

export async function createRedisClient(options: {
  disableOfflineQueue?: boolean
  socket?: {
    connectTimeout?: number
    reconnectStrategy?: (() => Error | false) | false
  }
  url: string
}): Promise<MinimalRedisClient> {
  const redisModule = await loadRedis()
  const client = redisModule.createClient(options)
  client.on?.("error", () => {
    // Swallow connection errors during BDD teardown and outage probes.
  })
  return client
}

export async function decodeJwt(token: string): Promise<SessionJwtPayload> {
  const joseModule = await loadJose()
  return joseModule.decodeJwt(token)
}

export async function jwtVerify(
  token: string,
  secret: Uint8Array,
  options: { algorithms: string[] }
): Promise<SessionJwtVerifyResult> {
  const joseModule = await loadJose()
  return joseModule.jwtVerify(token, secret, options)
}

async function loadJose(): Promise<JoseModule> {
  josePromise ??= import(pathToFileURL(JOSE_ENTRY).href).then((module) => module as unknown as JoseModule)
  return josePromise
}

async function loadRedis(): Promise<RedisModule> {
  redisPromise ??= Promise.resolve(require(REDIS_ENTRY) as unknown as RedisModule)
  return redisPromise
}
