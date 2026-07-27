import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { auditGoalRequirements } from "../scripts/audit-goal-requirements.mjs"

describe("task1190 GOAL requirement audit CLI", () => {
  it("builds a reproducible matrix from explicit repository inputs", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "knowbee-goal-audit-"))
    mkdirSync(join(repositoryRoot, ".tasks", "phase001"), { recursive: true })
    mkdirSync(join(repositoryRoot, "src"), { recursive: true })
    mkdirSync(join(repositoryRoot, "tests"), { recursive: true })
    writeFileSync(
      join(repositoryRoot, ".tasks", "phase001", "goal.md"),
      "## 1. Goal\n\n- The behavior is enforced.\n",
    )
    writeFileSync(
      join(repositoryRoot, "src", "behavior.ts"),
      "export const behavior = 'enforced'\n",
    )
    writeFileSync(
      join(repositoryRoot, "tests", "behavior.test.ts"),
      "positive marker\nrejection marker\n",
    )
    writeFileSync(
      join(repositoryRoot, ".tasks", "phase001", "goal-requirement-evidence.json"),
      JSON.stringify({
        schemaVersion: 1,
        entries: {
          "REQ-1:b72f6486": {
            requiredScopes: ["runtime"],
            evidence: [
              {
                kind: "authoritative_source",
                owner: "src/behavior.ts",
                assertions: ["The source owns the behavior."],
                coveredScopes: ["runtime"],
                markers: ["behavior = 'enforced'"],
              },
              {
                kind: "positive_test",
                owner: "tests/behavior.test.ts",
                assertions: ["The positive path is tested."],
                coveredScopes: ["runtime"],
                markers: ["positive marker"],
              },
              {
                kind: "rejection_test",
                owner: "tests/behavior.test.ts",
                assertions: ["The rejection path is tested."],
                coveredScopes: ["runtime"],
                markers: ["rejection marker"],
              },
            ],
          },
        },
      }),
    )

    const result = auditGoalRequirements({
      repositoryRoot,
      goalPath: ".tasks/phase001/goal.md",
      evidencePath: ".tasks/phase001/goal-requirement-evidence.json",
    })

    expect(result.inventory.complete).toBe(true)
    expect(result.audit.counts).toEqual({ proven: 1, partial: 0, missing: 0, contradicted: 0 })
    expect(result.evidenceVerification).toEqual({ complete: true, diagnostics: [] })
    expect(result.goalSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(result).not.toHaveProperty("generatedAt")
  })

  it("fails closed when an evidence catalog references an unknown requirement", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "knowbee-goal-audit-"))
    mkdirSync(join(repositoryRoot, ".tasks", "phase001"), { recursive: true })
    writeFileSync(
      join(repositoryRoot, ".tasks", "phase001", "goal.md"),
      "## 1. Goal\n\n- The behavior is enforced.\n",
    )
    writeFileSync(
      join(repositoryRoot, ".tasks", "phase001", "goal-requirement-evidence.json"),
      JSON.stringify({
        schemaVersion: 1,
        entries: { "REQ-unknown": { requiredScopes: [], evidence: [] } },
      }),
    )

    expect(() =>
      auditGoalRequirements({
        repositoryRoot,
        goalPath: ".tasks/phase001/goal.md",
        evidencePath: ".tasks/phase001/goal-requirement-evidence.json",
      }),
    ).toThrow("unknown requirement IDs: REQ-unknown")
  })
})
