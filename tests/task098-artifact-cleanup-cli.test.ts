import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildArtifactCleanupCommandOutput,
  formatArtifactCleanupCommandText,
} from "../packages/cli/src/commands/artifact-cleanup.ts"
import type { ArtifactCleanupPreview } from "../packages/core/src/release/artifact-retention.ts"

function cleanupPreviewFixture(): ArtifactCleanupPreview {
  return {
    kind: "knowbee.artifact_cleanup.preview",
    generatedAt: 1,
    maxAgeMs: 86_400_000,
    confirmation: "CONFIRM ARTIFACT CLEANUP",
    targets: [
      {
        kind: "release_package_output",
        directoryName: "explicit-release-output",
        policy: {
          purpose: "explicit_release_package_output_cleanup",
          audience: "release_package",
          redaction: "sanitized",
          access: "filesystem_private_file",
          retention: "operator_cleanup",
          rawDataAllowed: false,
          route: "none",
        },
        scannedFiles: 4,
        deleteEligibleFiles: 2,
        skippedFiles: 1,
        deletedFiles: 0,
        verifiedDeletedFiles: 0,
        failedDeleteFiles: 0,
        reasonCounts: {
          unsafe_symlink: 1,
          package_path_invalid: 1,
        },
        eligibleBytes: 1234,
        oldestEligibleAgeMs: 99_999,
        privatePath: "/Users/dongwooshin/private/release/payload/app.tar.gz",
      } as ArtifactCleanupPreview["targets"][number],
    ],
  }
}

describe("task098 artifact cleanup CLI", () => {
  it("prints default cleanup output through display projection without reason codes or raw paths", () => {
    const output = buildArtifactCleanupCommandOutput(cleanupPreviewFixture(), false)
    const json = JSON.stringify(output)
    const text = formatArtifactCleanupCommandText(output)

    expect(json).toContain("릴리스 출력")
    expect(text).toContain("릴리스 출력")
    expect(text).toContain("eligible=2")
    expect(json).not.toContain("reasonCounts")
    expect(json).not.toContain("unsafe_symlink")
    expect(json).not.toContain("package_path_invalid")
    expect(json).not.toContain("private/release")
    expect(json).not.toContain("app.tar.gz")
    expect(text).not.toContain("reasonCounts")
    expect(text).not.toContain("unsafe_symlink")
    expect(text).not.toContain("package_path_invalid")
    expect(text).not.toContain("private/release")
    expect(text).not.toContain("app.tar.gz")
  })

  it("exposes reason aggregate only when audit output is requested", () => {
    const output = buildArtifactCleanupCommandOutput(cleanupPreviewFixture(), true)
    const json = JSON.stringify(output)
    const text = formatArtifactCleanupCommandText(output)

    expect(json).toContain("reasonCounts")
    expect(json).toContain("unsafe_symlink")
    expect(json).toContain("package_path_invalid")
    expect(text).toContain("Audit reason counts:")
    expect(text).toContain("unsafe_symlink=1")
    expect(text).not.toContain("private/release")
    expect(text).not.toContain("app.tar.gz")
  })

  it("registers the admin artifact cleanup command in the CLI entrypoint", () => {
    const indexSource = readFileSync("packages/cli/src/index.ts", "utf8")
    const commandSource = readFileSync("packages/cli/src/commands/artifact-cleanup.ts", "utf8")

    expect(indexSource).toContain('program.command("admin")')
    expect(indexSource).toContain('.command("artifact-cleanup")')
    expect(indexSource).toContain("artifactCleanupCommand(options)")
    expect(commandSource).toContain("previewArtifactCleanup(params)")
    expect(commandSource).toContain("executeArtifactCleanup({")
    expect(commandSource).toContain("projectArtifactCleanupForUser(result)")
  })
})
