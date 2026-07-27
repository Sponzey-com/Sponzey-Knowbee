import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0603 artifact cleanup error redaction", () => {
  it("redacts file deletion errors before cleanup failure messages", () => {
    const source = readFileSync("packages/core/src/artifacts/lifecycle.ts", "utf-8")
    const cleanup = source.slice(
      source.indexOf("export function cleanupArtifactStorageQuota"),
      source.indexOf("export function runArtifactCleanupCycle"),
    )

    expect(cleanup).not.toBe("")

    expect(source).toContain("function artifactLifecycleErrorMessage(error: unknown): string")
    expect(cleanup).toContain("const message = artifactLifecycleErrorMessage(error)")
    expect(cleanup).toContain("message,")
    expect(cleanup).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(cleanup).not.toContain("message: error instanceof Error ? error.message : String(error)")
  })
})
