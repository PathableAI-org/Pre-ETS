/**
 * Next.js host adapters: route handlers, server-component reads, and the HTTP mapping of service failures.
 * This module and its children under `next/` are the only code that imports `next/server` or `next/navigation`.
 */
export { type BrowserTracingConfig, type BrowserTracingDocument, readBrowserTracing } from "./next/browser-tracing.js"
export { type CallbackResponses, createCallbackHandler } from "./next/callback.js"
export { requestCookieOptions } from "./next/cookies.js"
export { type SessionCoordinationSnapshot } from "./next/coordination-snapshot.js"
export {
  type AuthorizedSessionAction,
  authorizeSessionAction,
  type AuthorizeSessionActionInput,
  createLogoutHandler,
  createSessionActivityHandler,
  createSessionStatusHandler,
  type InPageSessionActivity,
  type LogoutRequestBody,
  type SessionActivityRequestBody
} from "./next/coordination.js"
export { PRIVATE_NO_STORE } from "./next/handler.js"
export { createLoginHandler } from "./next/login.js"
export { createProtectionProxy, type ProtectionResponses } from "./next/protection.js"
export {
  readSessionRequest,
  type ReadSessionRequestInput,
  type ResolvedSessionRequest,
  SESSION_COOKIE
} from "./next/session.js"
export { type TenantFailureResponse, tenantFailureStatus } from "./next/tenant-failure.js"
export { loadTenantConfig, tenantConfigResponse } from "./next/tenant.js"
