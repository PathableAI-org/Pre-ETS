/**
 * The inputs a verification report records: what the verified SHA's behavior and its verification depend on, so a
 * later commit with the same inputs can be recognized without the verified commit. See
 * docs/engineering/verification-harness.md#report.
 */
import { createHash } from "node:crypto"

import type { ReportInputs } from "./report.ts"

import { blobsAt, codeTree, readAtSha } from "../git-access.ts"
import { executionResults } from "./gate.ts"
import { withoutSection } from "./markdown.ts"

/**
 * A digest of every file in the feature directory at `sha`, with `quickstart.md` read without its execution
 * results, so recording results, which is an evidence-only change, leaves it unchanged.
 */
const featureInputs = (cwd: string, sha: string, featureDir: string): string => {
  const quickstart = `${featureDir}/quickstart.md`
  const hash = createHash("sha256")
  for (const blob of blobsAt(cwd, sha, featureDir)) {
    const content = blob.path === quickstart
      ? withoutSection(readAtSha(cwd, sha, quickstart) ?? "", executionResults)
      : blob.id
    hash.update(`${blob.path}\0${content}\0`)
  }
  return hash.digest("hex")
}

/** The inputs of the commit `sha`, for a report on the feature in `featureDir`, or a High fix without one. */
export const reportInputs = (cwd: string, sha: string, featureDir: string | undefined): ReportInputs => ({
  codeTree: codeTree(cwd, sha),
  featureInputs: featureDir === undefined ? undefined : featureInputs(cwd, sha, featureDir)
})
