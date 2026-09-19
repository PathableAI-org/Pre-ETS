/**
 * Atomic session CAS fenced by the per-session idle lock token.
 * KEYS[1]=session key, KEYS[2]=lock key
 * ARGV[1]=lock token, ARGV[2]=expected serialized, ARGV[3]=next serialized, ARGV[4]=EXAT unix seconds
 * Returns: "ok" | "missing" | "mismatch" | "stolen"
 */
export const SESSION_CAS_UNDER_LOCK_SCRIPT = `
if redis.call("GET", KEYS[2]) ~= ARGV[1] then
  return "stolen"
end
local current = redis.call("GET", KEYS[1])
if current == false then
  return "missing"
end
if current ~= ARGV[2] then
  return "mismatch"
end
redis.call("SET", KEYS[1], ARGV[3], "EXAT", tonumber(ARGV[4]))
return "ok"
`.trim()

/**
 * Blind XX replace under the idle lock (OIDC authenticate overwrite).
 * KEYS[1]=session key, KEYS[2]=lock key
 * ARGV[1]=lock token, ARGV[2]=next serialized, ARGV[3]=EXAT unix seconds
 * Returns: "ok" | "missing" | "stolen"
 */
export const SESSION_SET_UNDER_LOCK_SCRIPT = `
if redis.call("GET", KEYS[2]) ~= ARGV[1] then
  return "stolen"
end
if redis.call("GET", KEYS[1]) == false then
  return "missing"
end
redis.call("SET", KEYS[1], ARGV[2], "EXAT", tonumber(ARGV[3]))
return "ok"
`.trim()

/**
 * Token-conditional lock delete (compare-and-delete).
 * KEYS[1]=lock key, ARGV[1]=owner token
 * Returns: 1 if deleted, 0 otherwise
 */
export const RELEASE_IDLE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`.trim()
