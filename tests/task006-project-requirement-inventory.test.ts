import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  createProjectRequirementSkeleton,
  extractGoalNormativeClauses,
  extractProjectNormativeClauses,
} from "../packages/core/src/maintenance/goal-requirement-audit.js"

describe("task006 stable PROJECT requirement inventory", () => {
  it("keeps IDs stable across reorder, insertion, and numbered-section moves", () => {
    const first = extractProjectNormativeClauses(`
## 1. Goal
- Execute the requested work.
- Verify the actual result.
`)
    const moved = extractProjectNormativeClauses(`
## 1. Goal
- A newly inserted rule.
## 9. Review
- Verify the actual result.
- Execute the requested work.
`)

    const firstByText = new Map(first.clauses.map((clause) => [clause.text, clause.clauseId]))
    const movedByText = new Map(moved.clauses.map((clause) => [clause.text, clause.clauseId]))
    expect(movedByText.get("Execute the requested work.")).toBe(
      firstByText.get("Execute the requested work."),
    )
    expect(movedByText.get("Verify the actual result.")).toBe(
      firstByText.get("Verify the actual result."),
    )
  })

  it("fails closed for duplicate normalized clauses and creates PRJ skeleton IDs", () => {
    const inventory = extractProjectNormativeClauses(`
## 1. Goal
- Execute the requested work.
## 2. Runtime
1. Execute   the requested work.
`)

    expect(inventory.complete).toBe(false)
    expect(inventory.diagnostics).toEqual([
      expect.objectContaining({ code: "clause_id_collision", sourceLines: [3, 5] }),
    ])
    expect(createProjectRequirementSkeleton(inventory.clauses)[0]?.requirementId).toMatch(
      /^PRJ-[a-f0-9]{8}$/u,
    )
  })

  it("extracts the current PROJECT without changing historical GOAL IDs", () => {
    const project = readFileSync(new URL("../PROJECT.md", import.meta.url), "utf8")
    const inventory = extractProjectNormativeClauses(project)
    const historical = extractGoalNormativeClauses("## 1. Goal\n- Execute the requested work.\n")

    expect(inventory.complete).toBe(true)
    expect(inventory.clauses.length).toBeGreaterThan(100)
    expect(
      createProjectRequirementSkeleton(inventory.clauses).every((item) =>
        item.requirementId.startsWith("PRJ-"),
      ),
    ).toBe(true)
    expect(historical.clauses[0]?.clauseId).toMatch(/^1:/u)
  })
})
