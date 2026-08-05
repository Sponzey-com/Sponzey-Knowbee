import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  GOAL_OWNERSHIP_CATALOG,
  auditGoalOwnership,
  validateGoalOwnershipCatalog,
  type GoalOwnershipEntry,
} from "../packages/core/src/maintenance/goal-ownership.ts"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

const repositoryRoot = process.cwd()
const goalMarkdown = readFileSync(join(repositoryRoot, ".tasks/phase001/goal.md"), "utf8")

function catalogWith(...entries: GoalOwnershipEntry[]): GoalOwnershipEntry[] {
  return [...GOAL_OWNERSHIP_CATALOG.map((entry) => ({
    ...entry,
    allowedReferenceArtifacts: [...entry.allowedReferenceArtifacts],
  })), ...entries]
}

describe("task1211 GOAL ownership catalog", () => {
  it("assigns every required GOAL chapter to one existing canonical artifact", () => {
    const result = auditGoalOwnership({
      goalMarkdown,
      artifactExists: (artifact) => existsSync(join(repositoryRoot, artifact)),
    })

    expect(result).toEqual({ complete: true, state: "proven", diagnostics: [] })
  })

  it("rejects duplicate semantic responsibility and duplicate chapter ownership", () => {
    const duplicate = {
      ...GOAL_OWNERSHIP_CATALOG[1]!,
      canonicalArtifact: "prompts/system.md",
    }
    const result = auditGoalOwnership({
      goalMarkdown,
      catalog: catalogWith(duplicate),
    })

    expect(result.state).toBe("contradicted")
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "ownership_responsibility_duplicate",
      "ownership_chapter_duplicate",
    ]))
  })

  it("rejects a missing chapter owner and a responsibility assigned to the wrong chapter kind", () => {
    const catalog = GOAL_OWNERSHIP_CATALOG
      .filter((entry) => entry.chapter !== "6")
      .map((entry) => entry.chapter === "10"
        ? { ...entry, responsibilityKind: "open_decisions" as const }
        : entry)
    const result = auditGoalOwnership({ goalMarkdown, catalog })

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ownership_chapter_missing", chapter: "6" }),
      expect.objectContaining({ code: "ownership_chapter_kind_mismatch", chapter: "10" }),
    ]))
  })

  it("rejects missing canonical artifacts and a canonical definition repeated as a reference", () => {
    const catalog = GOAL_OWNERSHIP_CATALOG.map((entry) => entry.chapter === "8"
      ? {
          ...entry,
          canonicalArtifact: "prompts/missing-owner.md",
          allowedReferenceArtifacts: ["prompts/missing-owner.md"],
        }
      : entry)
    const result = auditGoalOwnership({
      goalMarkdown,
      catalog,
      artifactExists: (artifact) => existsSync(join(repositoryRoot, artifact)),
    })

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ownership_artifact_missing", chapter: "8" }),
      expect.objectContaining({ code: "ownership_canonical_artifact_repeated_as_reference", chapter: "8" }),
    ]))
  })

  it("makes prompt responsibility regression consume the same valid ownership catalog", () => {
    expect(validateGoalOwnershipCatalog()).toMatchObject({ complete: true, state: "proven" })
    const regression = runPromptSourceRegression(repositoryRoot)
    const ownership = regression.responsibility.find((item) => item.id === "goal_chapter_prompt_ownership_catalog")

    expect(ownership).toMatchObject({ ok: true, issues: [] })
  })
})
