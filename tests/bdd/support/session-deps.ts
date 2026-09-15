import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const FRONTEND_ROOT = path.join(REPO_ROOT, "packages/frontend")
const require = createRequire(import.meta.url)

export interface MinimalRedisClient {
  connect(): Promise<void>
  del(...keys: string[]): Promise<number>
  get(key: string): Promise<null | string>
  keys(pattern: string): Promise<string[]>
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
  createClient(options: { disableOfflineQueue?: boolean; url: string }): MinimalRedisClient
}

const redisModule = require(path.join(FRONTEND_ROOT, "node_modules/redis")) as unknown as RedisModule
const joseModule = require(path.join(FRONTEND_ROOT, "node_modules/jose")) as unknown as JoseModule

export function createRedisClient(options: {
  disableOfflineQueue?: boolean
  url: string
}): MinimalRedisClient {
  return redisModule.createClient(options)
}

export function decodeJwt(token: string): SessionJwtPayload {
  return joseModule.decodeJwt(token)
}

export function jwtVerify(
  token: string,
  secret: Uint8Array,
  options: { algorithms: string[] }
): Promise<SessionJwtVerifyResult> {
  return joseModule.jwtVerify(token, secret, options)
}
