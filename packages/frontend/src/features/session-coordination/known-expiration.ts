/**
 * Known expiration (#157 research D7): the tab observed no logout of its session, and the session's held deadline is
 * at or before the best server-time estimate, both on the server clock. Undefined estimates are ignored.
 */
export const knownExpiration = (input: {
  readonly deadline: number | undefined
  readonly logoutObserved: boolean
  readonly serverTimes: readonly (number | undefined)[]
}): boolean => {
  if (input.logoutObserved || input.deadline === undefined) return false
  const deadline = input.deadline
  return input.serverTimes.some((time) => time !== undefined && deadline <= time)
}
