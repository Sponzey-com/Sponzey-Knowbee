import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import {
  PROTECTED_CLEANUP_CONSUMERS,
} from "../packages/core/src/maintenance/cleanup-ownership.js"

const root = "packages/core/src"

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : []
  })
}

describe("task1189 protected cleanup ownership", () => {
  it("keeps the protected cleanup consumer registry equal to actual canonical decision imports", () => {
    const actual = sourceFiles(root)
      .filter((path) => path !== `${root}/maintenance/cleanup-decision.ts`)
      .filter((path) => /decideCleanupCandidate\s*\(/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path))
      .sort()

    expect(actual).toEqual([...PROTECTED_CLEANUP_CONSUMERS].sort())
  })

  it("rejects duplicate protected-data deletion decisions outside the canonical owner", () => {
    const decisionTerms = [
      "retentionClass",
      "referenceScanComplete",
      "activeReferenceCount",
      "migrationReviewed",
      "rollbackReviewed",
      "deletionApproved",
    ]
    const violations = sourceFiles(root).flatMap((path) => {
      const source = readFileSync(path, "utf8")
      const isDeletionPath = /DELETE FROM|rmSync\s*\(|unlinkSync\s*\(/u.test(source)
      const ownsDecisionTerms = decisionTerms.some((term) => source.includes(term))
      if (!isDeletionPath || !ownsDecisionTerms) return []
      if (path === `${root}/maintenance/cleanup-decision.ts`) return []
      if (/decideCleanupCandidate\s*\(/u.test(source)) return []
      return [relative(root, path)]
    })

    expect(violations).toEqual([])
  })
})
