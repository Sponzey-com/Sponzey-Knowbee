import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task102 artifact cleanup release runbook", () => {
  it("documents release artifact cleanup responsibilities and smoke selection", () => {
    const runbook = readFileSync("docs/release-runbook.md", "utf8")

    expect(runbook).toContain("Release Artifact Cleanup Operation")
    expect(runbook).toContain("Preview does not delete files.")
    expect(runbook).toContain('knowbee admin artifact-cleanup --execute --confirm "CONFIRM ARTIFACT CLEANUP"')
    expect(runbook).toContain("releaseOutputDir is an explicit action argument")
    expect(runbook).toContain("release package output cleanup")
    expect(runbook).toContain("sanitized diagnostic export cleanup")
    expect(runbook).toContain("live acceptance signing request cleanup")
    expect(runbook).toContain("audit raw data retention")
    expect(runbook).toContain("Audit raw data is not an artifact-cleanup target")
    expect(runbook).toContain("post-delete verification")
    expect(runbook).toContain("deletedFiles")
    expect(runbook).toContain("verifiedDeletedFiles")
    expect(runbook).toContain("failedDeleteFiles")
    expect(runbook).toContain("pnpm run smoke:artifact-cleanup-cli")
    expect(runbook).toContain("node scripts/self/smoke-artifact-cleanup-cli.mjs --destructive-fixture")
    expect(runbook).toContain("must not target a real release output or user state")
    expect(runbook).not.toContain("delete audit raw data with artifact-cleanup")
  })
})
