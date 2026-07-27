import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

describe("task0975 comparison prompt context labels source", () => {
  it("registers comparison prompt context labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "comparison_prompt_context_labels_user" && item.locale === "en",
    )

    expect(source).toMatchObject({ sourceId: "comparison_prompt_context_labels_user", usageScope: "internal", enabled: true })
    expect(source?.content).toContain("incoming_schedule_contract_label=Incoming schedule contract:")
    expect(source?.content).toContain("active_run_contract_candidates_label=Active run contract candidates:")
  })

  it("removes comparison prompt labels from TypeScript", () => {
    const scheduleSource = readFileSync(join(repoRoot, "packages/core/src/schedules/comparison.ts"), "utf8")
    const entrySource = readFileSync(join(repoRoot, "packages/core/src/runs/entry-comparison.ts"), "utf8")

    expect(scheduleSource).not.toContain("\"Incoming schedule contract:\"")
    expect(scheduleSource).not.toContain("\"Candidate schedule contracts:\"")
    expect(entrySource).not.toContain("\"Incoming intent contract projection:\"")
    expect(entrySource).not.toContain("\"Active run contract candidates:\"")
  })
})
