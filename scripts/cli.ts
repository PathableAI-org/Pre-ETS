/** Shared plumbing for the agent workflow command scripts: problem output and command dispatch. */

/** Writes a heading and one line per problem to stderr, and returns exit code 1. */
export const failed = (heading: string, problems: readonly string[]): number => {
  process.stderr.write(`${heading}\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`)
  return 1
}

/** Runs the named command and sets its exit code, or prints the usage line and exits 2 for an unknown one. */
export const runCommand = (
  commands: Readonly<Record<string, () => number>>,
  command: string | undefined,
  usage: string
): void => {
  const run = commands[command ?? ""]
  if (run === undefined) {
    process.stderr.write(`${usage}\n`)
    process.exitCode = 2
  } else process.exitCode = run()
}
