import { existsSync, readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

const semanticModules = [
  "packages/core/src/runs/current-fact-retrieval.ts",
  "packages/core/src/runs/web-retrieval-verification.ts",
  "packages/core/src/runs/web-conflict-resolver.ts",
  "packages/core/src/runs/retrieval-finalizer.ts",
  "packages/core/src/runs/web-source-adapters/finance.ts",
  "packages/core/src/runs/web-source-adapters/weather.ts",
  "packages/core/src/runs/web-retrieval-session.ts",
  "packages/core/src/runs/web-retrieval-planner.ts",
]

const semanticPrompts = [
  "prompts/web_retrieval_latest_search_directive_user.md",
  "prompts/web_retrieval_latest_source_directive_user.md",
  "prompts/web_retrieval_strict_timestamp_directive_user.md",
  "prompts/web_retrieval_normal_directive_user.md",
  "prompts/web_retrieval_limited_completion_directive_user.md",
  "prompts/web_retrieval_planner.md",
]

describe("Task 028 provenance-only retrieval boundary", () => {
  it("removes deterministic semantic verdict owners after consumer migration", () => {
    expect(semanticModules.filter((path) => existsSync(path))).toEqual([])
    expect(semanticPrompts.filter((path) => existsSync(path))).toEqual([])
  })

  it("keeps active, admin, release and public exports free of semantic retrieval imports", () => {
    const owners = [
      "packages/core/src/runs/admin-tool-lab.ts",
      "packages/core/src/release/package.ts",
      "packages/core/src/index.ts",
      "packages/core/src/runs/web-retrieval-policy.ts",
      "packages/core/src/tools/builtin/web-fetch.ts",
      "prompts/web_access_policy_runtime.md",
    ]
    const source = owners.map((path) => readFileSync(path, "utf8")).join("\n")

    expect(source).not.toMatch(
      /current-fact-retrieval|web-retrieval-verification|web-conflict-resolver|retrieval-finalizer|web-source-adapters\/(?:finance|weather)/u,
    )
    expect(source).not.toMatch(
      /answerDirective|sourceGuard|evaluateSourceReliabilityGuard|buildAnswerDirective|canAnswer|acceptedValue|evidenceSufficiency|numeric candidates/u,
    )
  })

  it("uses provenance and LLM-diagnosis expectations instead of semantic answer fixtures", () => {
    const fixtures = readdirSync("tests/fixtures/web-retrieval")
      .filter((name) => name.endsWith(".json"))
      .map((name) => readFileSync(`tests/fixtures/web-retrieval/${name}`, "utf8"))
      .join("\n")

    expect(fixtures).not.toMatch(/"canAnswer"|"acceptedValue"|"evidenceSufficiency"/u)
    expect(fixtures).toContain('"llmDiagnosisExpectation"')
    expect(fixtures).toContain('"requiredEvidenceSourceIds"')
  })
})
