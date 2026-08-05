import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_MAINTENANCE_MARKERS = [
  "Record each cleanup candidate with artifact path or id, artifact kind, current owner, cleanup reason, replacement owner when duplicated, reference-scan evidence, retention class, migration need, rollback need, validation plan, and deletion decision.",
  "Reference-scan evidence must include code references, test references, generated artifact references, prompt registry references, documentation references, packaging references, and runtime data references when applicable.",
  "Prompt cleanup must verify prompt registry membership, prompt assembly order, prompt regression ownership, active locale handling, and generated prompt artifacts before deletion.",
  "Generated artifact cleanup must update the source generator or synchronization script first, then regenerate or verify generated outputs.",
  "Compatibility layers may remain only with an owner, active caller evidence, removal condition, and validation that the compatibility path still maps to the canonical implementation.",
  "Duplicate removal must keep the canonical owner and either delete the duplicate or replace it with a documented migration path.",
  "Separate cleanup-only changes from feature behavior changes whenever practical.",
  "Do not keep tombstone files, empty wrappers, stale prompt sources, or backup copies unless a retention rule or rollback plan names their expiry condition.",
] as const

describe("task0294 maintenance cleanup evidence prompt contract", () => {
  it("documents cleanup evidence, retention, duplicate removal, and tidy-first boundaries", () => {
    const maintenance = readFileSync(join(process.cwd(), "prompts", "maintenance_policy.md"), "utf-8")
    const system = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf-8")

    for (const marker of REQUIRED_MAINTENANCE_MARKERS) {
      expect(maintenance).toContain(marker)
    }

    expect(system).toContain("`maintenance_policy.md` owns unused artifact cleanup, duplicate removal, and structure simplification rules.")
    expect(system).not.toContain("Record each cleanup candidate with artifact path or id")
  })
})
