/** The feature artifacts a verification request is built from, read at a SHA. */
import type { FeatureArtifacts } from "./request.ts"

import { readAtSha } from "../git-access.ts"

/** The artifacts the request is built from, read at `sha` rather than from the working tree. */
export const featureArtifactsAt = (cwd: string, sha: string, featureDir: string): FeatureArtifacts | string => {
  const read = (name: string): string | undefined => readAtSha(cwd, sha, `${featureDir}/${name}`)
  const plan = read("plan.md")
  const verification = read("verification.md")
  const quickstart = read("quickstart.md")
  if (plan === undefined || verification === undefined || quickstart === undefined) {
    return `${featureDir} at ${sha.slice(0, 12)} lacks plan.md, verification.md, or quickstart.md`
  }
  return { plan, quickstart, research: read("research.md"), verification }
}
