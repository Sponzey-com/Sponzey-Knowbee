import { describe, expect, it } from "vitest"
import { buildArtifactCleanupAuditLogInput } from "../packages/cli/src/commands/artifact-cleanup.ts"
import type { ArtifactCleanupExecution } from "../packages/core/src/release/artifact-retention.ts"

function cleanupExecutionFixture(confirmed: boolean): ArtifactCleanupExecution {
  return {
    kind: "knowbee.artifact_cleanup.execution",
    generatedAt: 1,
    maxAgeMs: 86_400_000,
    confirmed,
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
        scannedFiles: 3,
        deleteEligibleFiles: 2,
        skippedFiles: 1,
        deletedFiles: confirmed ? 1 : 0,
        verifiedDeletedFiles: confirmed ? 1 : 0,
        failedDeleteFiles: 0,
        reasonCounts: {
          unsafe_symlink: 1,
          package_path_invalid: 1,
        },
        eligibleBytes: 777,
        oldestEligibleAgeMs: 99_999,
        privatePath: "/Users/dongwooshin/private/release/payload/app.tar.gz",
      } as ArtifactCleanupExecution["targets"][number],
    ],
  }
}

describe("task099 artifact cleanup CLI audit", () => {
  it("records successful CLI cleanup execution with public summary only", () => {
    const record = buildArtifactCleanupAuditLogInput({
      result: cleanupExecutionFixture(true),
      maxAgeMs: 86_400_000,
      releaseOutputDir: "/Users/dongwooshin/private/release",
      timestamp: 123,
    })
    const serialized = JSON.stringify(record)

    expect(record.source).toBe("cli.admin")
    expect(record.tool_name).toBe("admin.artifact_cleanup")
    expect(record.result).toBe("succeeded")
    expect(record.approval_required).toBe(1)
    expect(record.approved_by).toBe("cli_confirmation")
    expect(record.params).toContain("[explicit-release-output]")
    expect(record.output).toContain("verifiedDeletedFiles")
    expect(serialized).not.toContain("private/release")
    expect(serialized).not.toContain("app.tar.gz")
    expect(serialized).not.toContain("reasonCounts")
    expect(serialized).not.toContain("unsafe_symlink")
    expect(serialized).not.toContain("package_path_invalid")
    expect(serialized).not.toContain("CONFIRM ARTIFACT CLEANUP")
  })

  it("records confirmation failure without storing the provided confirmation phrase", () => {
    const record = buildArtifactCleanupAuditLogInput({
      result: cleanupExecutionFixture(false),
      maxAgeMs: 86_400_000,
      timestamp: 123,
    })
    const serialized = JSON.stringify(record)

    expect(record.result).toBe("blocked")
    expect(record.approved_by).toBeNull()
    expect(record.error_code).toBe("artifact_cleanup_confirmation_required")
    expect(record.stop_reason).toBe("missing_explicit_confirmation")
    expect(serialized).not.toContain("CONFIRM ARTIFACT CLEANUP")
    expect(serialized).not.toContain("reasonCounts")
    expect(serialized).not.toContain("private/release")
  })
})
