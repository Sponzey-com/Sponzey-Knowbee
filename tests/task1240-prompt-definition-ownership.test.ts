import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  evaluatePromptDefinitionOwnership,
  writeOwnershipEligiblePrompt,
  type PromptAbstractCriterionBinding,
  type PromptSentenceResponsibility,
} from "../packages/core/src/index.ts"

function binding(overrides: Partial<PromptAbstractCriterionBinding> = {}): PromptAbstractCriterionBinding {
  return {
    term: "sufficient evidence", ruleId: "rule:evidence", termSegmentIndex: 2,
    criterionRuleId: "rule:evidence", criterionSegmentIndex: 3, criterionKind: "test_criterion",
    criterionText: "Require two independent verified evidence references.", testOrFixtureRef: "test:evidence-threshold", ...overrides,
  }
}

function sentence(overrides: Partial<PromptSentenceResponsibility> = {}): PromptSentenceResponsibility {
  return {
    sentenceId: "sentence:1", ruleId: "rule:evidence", primaryResponsibilityIds: ["responsibility:evidence"],
    actorRefs: ["actor:reviewer"], conditionRefs: ["condition:before-completion"],
    completionCriterionRefs: ["criterion:two-evidence-refs"], parserConfidence: 0.98, ...overrides,
  }
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluatePromptDefinitionOwnership({
    abstractBindings: [binding()], sentences: [sentence()], minimumParserConfidence: 0.9,
    owners: [{ definitionKey: "identity.self_name", canonicalSourceId: "identity", canonicalRuleId: "rule:identity:self-name" }],
    occurrences: [
      { definitionKey: "identity.self_name", sourceId: "identity", occurrenceKind: "definition", bodyFingerprint: "sha:identity" },
      { definitionKey: "identity.self_name", sourceId: "final_response", occurrenceKind: "reference", referencedRuleId: "rule:identity:self-name" },
    ], ...overrides,
  })
}

function codes(result: ReturnType<typeof evaluatePromptDefinitionOwnership>): string[] {
  return result.status === "blocked" ? result.issues.map((issue) => issue.code) : []
}

describe("task1240 prompt abstraction and canonical ownership", () => {
  it("accepts an immediate criterion, one responsibility, one canonical definition, and a reference", () => {
    expect(evaluate()).toEqual({ status: "eligible", definitionKeys: ["identity.self_name"] })
  })

  it.each([
    [{ criterionText: "" }, "abstract_criterion_missing"],
    [{ testOrFixtureRef: "" }, "abstract_criterion_missing"],
    [{ criterionSegmentIndex: 5 }, "abstract_criterion_not_immediate"],
    [{ criterionRuleId: "rule:other" }, "abstract_criterion_rule_mismatch"],
  ] as const)("rejects invalid abstract criterion binding %o", (change, code) => {
    expect(codes(evaluate({ abstractBindings: [binding(change)] }))).toContain(code)
  })

  it("rejects multiple sentence responsibilities and execution contexts", () => {
    const result = evaluate({ sentences: [sentence({
      primaryResponsibilityIds: ["responsibility:a", "responsibility:b"],
      actorRefs: ["actor:a", "actor:b"], conditionRefs: ["condition:a", "condition:b"],
    })] })
    expect(codes(result)).toEqual(expect.arrayContaining(["sentence_multiple_responsibilities", "sentence_multiple_execution_contexts"]))
  })

  it("rejects low-confidence sentence parsing", () => {
    expect(codes(evaluate({ sentences: [sentence({ parserConfidence: 0.7 })] }))).toContain("sentence_parser_confidence_low")
  })

  it.each([
    [[{ definitionKey: "identity.self_name", sourceId: "final_response", occurrenceKind: "definition", bodyFingerprint: "sha:copy" }], "definition_owner_mismatch"],
    [[{ definitionKey: "unknown", sourceId: "identity", occurrenceKind: "definition", bodyFingerprint: "sha:x" }], "definition_key_unknown"],
    [[{ definitionKey: "identity.self_name", sourceId: "final_response", occurrenceKind: "reference", referencedRuleId: "rule:other" }], "canonical_reference_invalid"],
  ] as const)("rejects invalid definition occurrence %o", (occurrences, code) => {
    expect(codes(evaluate({ occurrences }))).toContain(code)
  })

  it("rejects duplicate canonical definitions", () => {
    const occurrences = [
      { definitionKey: "identity.self_name", sourceId: "identity", occurrenceKind: "definition", bodyFingerprint: "sha:a" },
      { definitionKey: "identity.self_name", sourceId: "identity", occurrenceKind: "definition", bodyFingerprint: "sha:b" },
    ]
    expect(codes(evaluate({ occurrences }))).toContain("definition_duplicate")
  })

  it("never writes a prompt with invalid ownership", async () => {
    const write = vi.fn(async () => "saved")
    await expect(writeOwnershipEligiblePrompt({ decision: evaluate({ abstractBindings: [binding({ criterionText: "" })] }), write })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeOwnershipEligiblePrompt({ decision: evaluate(), write })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("keeps ownership decisions independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/prompt-definition-ownership.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
