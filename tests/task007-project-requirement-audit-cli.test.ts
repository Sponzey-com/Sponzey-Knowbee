import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { auditProjectRequirements } from "../scripts/self/audit-project-requirements.mjs"
import { createProjectRequirementEvidenceSkeleton } from "../scripts/self/create-project-requirement-skeleton.mjs"

describe("task007 PROJECT requirement audit CLI", () => {
  it("audits explicit PROJECT inputs with PRJ IDs", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "knowbee-project-audit-"))
    mkdirSync(join(repositoryRoot, "evidence"), { recursive: true })
    writeFileSync(join(repositoryRoot, "PROJECT.md"), "## 1. Goal\n- Execute the requested work.\n")
    const skeleton = createProjectRequirementEvidenceSkeleton({
      repositoryRoot,
      documentPath: "PROJECT.md",
    })
    writeFileSync(join(repositoryRoot, "evidence", "project.json"), JSON.stringify(skeleton))

    const result = auditProjectRequirements({
      repositoryRoot,
      documentPath: "PROJECT.md",
      evidencePath: "evidence/project.json",
    })

    expect(result).toMatchObject({
      kind: "knowbee.requirements.project_audit",
      documentKind: "project",
      audit: { counts: { missing: 1 } },
    })
    expect(result.records[0]?.requirementId).toMatch(/^PRJ-/u)
    expect(result.documentSha256).toMatch(/^[a-f0-9]{64}$/u)
  })

  it("creates an empty-evidence skeleton without claiming completion", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "knowbee-project-skeleton-"))
    writeFileSync(
      join(repositoryRoot, "PROJECT.md"),
      "## 1. Goal\n- First requirement.\n- Second requirement.\n",
    )
    const skeleton = createProjectRequirementEvidenceSkeleton({
      repositoryRoot,
      documentPath: "PROJECT.md",
    })

    expect(Object.keys(skeleton.entries)).toHaveLength(2)
    expect(Object.values(skeleton.entries)).toEqual([
      expect.objectContaining({
        obligationChecksum: expect.stringMatching(/^fnv1a:/u),
        requiredScopes: [],
        evidence: [],
      }),
      expect.objectContaining({
        obligationChecksum: expect.stringMatching(/^fnv1a:/u),
        requiredScopes: [],
        evidence: [],
      }),
    ])
  })
})
