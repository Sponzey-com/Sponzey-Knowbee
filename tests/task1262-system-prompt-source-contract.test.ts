import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  GOAL_OWNERSHIP_CATALOG,
  auditGoalOwnership,
} from "../packages/core/src/maintenance/goal-ownership.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"
import { auditAgentPromptSourceComposition } from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const repositoryRoot = process.cwd()
const goalMarkdown = readFileSync(join(repositoryRoot, ".tasks/phase001/goal.md"), "utf8")

describe("task1262 system prompt source contract acceptance", () => {
  it("keeps behavior, composition, and module-boundary chapters under distinct owners", () => {
    const entries = GOAL_OWNERSHIP_CATALOG.filter((entry) => ["3", "4", "5"].includes(entry.chapter))

    expect(entries.map((entry) => entry.responsibilityKind)).toEqual([
      "product_behavior",
      "prompt_authoring_contract",
      "prompt_module_boundaries",
    ])
    expect(new Set(entries.map((entry) => `${entry.chapter}:${entry.responsibilityId}`)).size).toBe(3)
    expect(auditGoalOwnership({
      goalMarkdown,
      artifactExists: (artifact) => existsSync(join(repositoryRoot, artifact)),
    })).toEqual({ complete: true, state: "proven", diagnostics: [] })
  })

  it("accepts the repository prompt sources and complete main-agent canonical composition", () => {
    const sources = loadPromptSourceRegistry(repositoryRoot)
    const regression = runPromptSourceRegression(repositoryRoot)
    const composition = auditAgentPromptSourceComposition({
      sources,
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    })

    expect(regression.ok, JSON.stringify(regression.issues, null, 2)).toBe(true)
    expect(composition.status, composition.issueCodes.join(", ")).toBe("eligible")
  })

  it("rejects a duplicate chapter owner and a missing canonical source", () => {
    const chapterFour = GOAL_OWNERSHIP_CATALOG.find((entry) => entry.chapter === "4")!
    const ownership = auditGoalOwnership({
      goalMarkdown,
      catalog: [...GOAL_OWNERSHIP_CATALOG, { ...chapterFour, canonicalArtifact: "prompts/system.md" }],
    })
    const sources = loadPromptSourceRegistry(repositoryRoot)
      .filter((source) => source.sourceId !== "identity")
    const composition = auditAgentPromptSourceComposition({
      sources,
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    })

    expect(ownership.state).toBe("contradicted")
    expect(ownership.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "ownership_responsibility_duplicate",
      "ownership_chapter_duplicate",
    ]))
    expect(composition).toMatchObject({ status: "ineligible" })
    expect(composition.issueCodes).toContain("source_missing:identity")
  })
})
