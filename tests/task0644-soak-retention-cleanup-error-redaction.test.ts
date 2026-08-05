import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runRetentionCleanup, type RetentionItem } from "../packages/core/src/runs/soak-retention.ts"

const soakRetentionSource = readFileSync(
  new URL("../packages/core/src/runs/soak-retention.ts", import.meta.url),
  "utf-8",
)

describe("task0644 soak retention cleanup error redaction", () => {
  it("summarizes retention cleanup delete failures through a redacted helper", () => {
    expect(soakRetentionSource).toContain("function retentionCleanupFailureSummary(error: unknown)")
    expect(soakRetentionSource).toContain("const sanitized = sanitizeUserFacingError(rawMessage)")
    expect(soakRetentionSource).toContain("userMessage: redactLogText(sanitized.userMessage)")
    expect(soakRetentionSource).toContain("reason: redactLogText(sanitized.reason)")
    expect(soakRetentionSource).toContain("const sanitized = retentionCleanupFailureSummary(error)")
    expect(soakRetentionSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
  })

  it("does not persist token, local path, or raw html in cleanup failure results", async () => {
    const now = 90 * 24 * 60 * 60 * 1000
    const secret = "sk-task0644-secret-1234567890"
    const localPath = "/Users/me/private/retention-cleanup.html"
    const items: RetentionItem[] = [{
      id: "artifact-secret-error",
      kind: "artifact",
      createdAt: 1,
      sizeBytes: 10,
      runId: "finished-run",
      cleanupProtection: {
        activeReferenceCount: 0,
        referenceScanCompleted: true,
        migrationRequired: false,
        rollbackRequired: false,
        deletionApproved: true,
      },
    }]

    const result = await runRetentionCleanup({
      items,
      activeRunIds: [],
      now,
      dryRun: false,
      policy: { artifact: { maxAgeMs: 30 * 24 * 60 * 60 * 1000 } },
      deleteCandidate: async () => {
        throw new Error(`screen_capture failed token=${secret} path=${localPath} <html><body>403</body></html>`)
      },
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({
      errorKind: "access_blocked",
      userMessage: "인증 또는 접근 차단 문제로 서버가 HTML 오류 페이지를 반환했습니다.",
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).not.toContain("<html>")
  })
})
