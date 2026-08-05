import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task080 runs timeline API redaction", () => {
  it("projects run timeline events through the common UI redaction adapter", () => {
    const source = readFileSync("packages/core/src/api/routes/runs.ts", "utf-8")

    expect(source).toContain('import { redactUiValue } from "../../ui/redaction.js"')
    expect(source).toContain("function projectPublicRunEvents")
    expect(source).toContain('redactUiValue(events, { audience: "advanced" })')
    expect(source).toContain("return { events: projectPublicRunEvents(run.recentEvents) }")
    expect(source).not.toContain("return { events: run.recentEvents }")
  })
})
