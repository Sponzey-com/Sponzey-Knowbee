import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditRepositoryArtifacts } from "../scripts/audit-repository-artifacts.mjs"

describe("Task 060 artifact candidate cleanup", () => {
  it("removes the obsolete migration tool while preserving current PROJECT audit owners", async () => {
    expect(existsSync("scripts/audit-project-evidence-migration.mjs")).toBe(false)
    expect(existsSync("scripts/create-project-requirement-skeleton.mjs")).toBe(true)
    expect(existsSync("scripts/audit-project-requirements.mjs")).toBe(true)
    expect(existsSync("docs/audit/project-requirement-evidence.json")).toBe(true)

    const audit = await auditRepositoryArtifacts(process.cwd())

    expect(audit.complete).toBe(true)
    expect(audit.counts.unknown).toBe(0)
    expect(audit.counts.candidate).toBe(0)
    expect(audit.candidates).toEqual([])
    expect(audit.diagnostics).toEqual([])
  }, 30_000)
})
