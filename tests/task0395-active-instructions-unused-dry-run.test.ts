import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "ActiveInstructionsPanel.tsx"),
  "utf-8",
)

describe("task0395 active instructions removes unused dry-run fetch", () => {
  it("does not keep unused dry-run state or API calls in the panel", () => {
    expect(source).not.toContain("PromptSourceDryRunResult")
    expect(source).not.toContain("promptDryRun")
    expect(source).not.toContain("setPromptDryRun")
    expect(source).not.toContain("promptSourcesDryRun()")
    expect(source).not.toContain("promptDryRunResponse")
  })

  it("loads only the data that the panel renders or uses for editing", () => {
    expect(source).toContain("api.instructionsActive()")
    expect(source).toContain("api.promptSources()")
    expect(source).toContain("api.promptSourcesParity()")
    expect(source).toContain("api.promptSourcesRegression()")
    expect(source).toContain("api.promptSourceRaw(")
  })
})
