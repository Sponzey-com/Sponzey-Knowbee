import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { auditRepositoryArtifacts } from "../scripts/self/audit-repository-artifacts.mjs"

describe("Task 060 artifact candidate cleanup", () => {
  it("removes the obsolete migration tool while preserving current PROJECT audit owners", async () => {
    expect(existsSync("scripts/audit-project-evidence-migration.mjs")).toBe(false)
    expect(existsSync("scripts/self/create-project-requirement-skeleton.mjs")).toBe(true)
    expect(existsSync("scripts/self/audit-project-requirements.mjs")).toBe(true)
    expect(existsSync("docs/audit/project-requirement-evidence.json")).toBe(true)

    const audit = await auditRepositoryArtifacts(fileURLToPath(new URL("../", import.meta.url)))

    expect(audit.counts.unknown).toBe(0)
    expect(audit.diagnostics).toEqual([])
    expect(audit.candidates).not.toContainEqual(
      expect.objectContaining({ artifactId: "scripts/audit-project-evidence-migration.mjs" }),
    )
  }, 30_000)
})
