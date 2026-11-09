/**
 * Next.js host adapters: route handlers, server-component reads, and the HTTP mapping of service failures.
 * This module and its children under `next/` are the only code that imports `next/server` or `next/navigation`.
 */
export { type CallbackResponses, createCallbackHandler } from "./next/callback.js"
export { requestCookieOptions, SESSION_COOKIE } from "./next/cookies.js"
export {
  createLogoutHandler,
  createSessionActivityHandler,
  createSessionStatusHandler,
  type InPageSessionActivity,
  type LogoutRequestBody,
  type SessionActivityRequestBody,
  type SessionCoordinationSnapshot
} from "./next/coordination.js"
export { CallbackFreshness } from "./next/freshness.js"
export { PRIVATE_NO_STORE } from "./next/handler.js"
export { createLoginHandler } from "./next/login.js"
export { createProtectionProxy, type ProtectionResponses } from "./next/protection.js"
export { readSessionRequest, type ReadSessionRequestInput, type ResolvedSessionRequest } from "./next/session.js"
export { type TenantFailureResponse, tenantFailureStatus } from "./next/tenant-failure.js"
export { loadTenantConfig, tenantConfigResponse } from "./next/tenant.js"
