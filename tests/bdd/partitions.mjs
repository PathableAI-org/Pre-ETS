/** Execute every independent partition in order, retaining failure for the final exit code. */
export function runPartitions(profiles, run, reportError = console.error) {
  let success = true
  for (const profile of profiles) {
    try {
      if (!run(profile)) success = false
    } catch (error) {
      reportError(error)
      success = false
    }
  }
  return success
}
