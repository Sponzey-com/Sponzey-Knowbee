import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const adminInspectorSource = readFileSync(
  new URL("../packages/core/src/runs/admin-platform-inspectors.ts", import.meta.url),
  "utf-8",
)
const journalingSource = readFileSync(
  new URL("../packages/core/src/runs/journaling.ts", import.meta.url),
  "utf-8",
)

describe("task0615 admin inspector and journal error redaction", () => {
  it("routes admin inspector degraded errors through redaction", () => {
    expect(adminInspectorSource).toContain("import { redactLogText }")
    expect(adminInspectorSource).toContain("function adminInspectorErrorMessage")
    expect(adminInspectorSource).toContain("migration_status_failed:${adminInspectorErrorMessage(error)}")
    expect(adminInspectorSource).toContain("migration_verification_failed:${adminInspectorErrorMessage(error)}")
    expect(adminInspectorSource).not.toContain(
      "migration_status_failed:${error instanceof Error ? error.message : String(error)}",
    )
    expect(adminInspectorSource).not.toContain(
      "migration_verification_failed:${error instanceof Error ? error.message : String(error)}",
    )
  })

  it("routes journaling callback errors through redaction", () => {
    expect(journalingSource).toContain("import { redactLogText }")
    expect(journalingSource).toContain("redactLogText(raw)")
    expect(journalingSource).not.toContain(
      "memory journal insert failed: ${error instanceof Error ? error.message : String(error)}",
    )
  })
})
