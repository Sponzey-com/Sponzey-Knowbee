import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_PROJECT_EVIDENCE_PATH,
  auditProjectRequirements,
} from "../scripts/audit-project-requirements.mjs"

describe("task009 tracked PROJECT section 1 evidence", () => {
  it("uses a tracked canonical evidence catalog and proves every catalog entry", () => {
    expect(DEFAULT_PROJECT_EVIDENCE_PATH).toBe("docs/audit/project-requirement-evidence.json")
    const result = auditProjectRequirements({
      repositoryRoot: ".",
      documentPath: "PROJECT.md",
      evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    })

    expect(result.claimVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
    const provenIds = result.audit.requirements
      .filter((item) => item.status === "proven")
      .map((item) => item.requirementId)
    const catalog = JSON.parse(readFileSync(DEFAULT_PROJECT_EVIDENCE_PATH, "utf8")) as {
      entries: Record<string, unknown>
    }
    const catalogIds = Object.keys(catalog.entries).sort()
    expect(provenIds).toEqual(catalogIds)
    expect(result.audit.counts).toEqual({
      proven: catalogIds.length,
      partial: 0,
      missing: result.inventory.clauses.length - catalogIds.length,
      contradicted: 0,
    })
  })

  it("keeps the package current audit away from the ignored task evidence file", () => {
    const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8")
    expect(packageJson).toContain(DEFAULT_PROJECT_EVIDENCE_PATH)
    expect(packageJson).not.toContain("--evidence .tasks/project-requirement-evidence.json")
  })
})
