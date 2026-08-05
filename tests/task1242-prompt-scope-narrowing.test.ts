import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { evaluatePromptScopeNarrowing, writeNarrowedPromptScope, type PromptSemanticScope } from "../packages/core/src/index.ts"

function scope(overrides: Partial<PromptSemanticScope> = {}): PromptSemanticScope {
  return {
    actorRefs: ["actor:main"], targetRefs: ["target:local", "target:remote"],
    permissionRefs: ["permission:read", "permission:write"], exceptionRefs: ["exception:approved"],
    dataAccessRefs: ["data:public", "data:private"], conditionStrictness: 2, parserConfidence: 0.98,
    fingerprint: "scope:baseline", ...overrides,
  }
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluatePromptScopeNarrowing({
    rules: [{ ruleKey: "identity.self_name", moduleId: "identity", kind: "policy", responsibilityId: "identity", moduleOwnedResponsibilityIds: ["identity"], canonicalOwnerModuleId: "identity" }],
    consolidations: [{ semanticRuleKey: "identity.self_name", canonicalOwnerModuleId: "identity", activeDefinitionModuleIds: ["identity"], removedDuplicateModuleIds: ["final_response"], updatedConsumerReferenceModuleIds: ["final_response"], unresolvedConflictModuleIds: [] }],
    baselineScope: scope(), proposedScope: scope({ targetRefs: ["target:local"], permissionRefs: ["permission:read"], dataAccessRefs: ["data:public"], conditionStrictness: 3, fingerprint: "scope:proposed" }),
    minimumParserConfidence: 0.9, ...overrides,
  })
}

function codes(result: ReturnType<typeof evaluatePromptScopeNarrowing>): string[] {
  return result.status === "blocked" ? result.issues.map((issue) => issue.code) : []
}

describe("task1242 prompt conflict consolidation and scope narrowing", () => {
  it("allows an owned rule, consolidated duplicates, and narrower semantic scope", () => {
    expect(evaluate()).toEqual({ status: "eligible", semanticScopeFingerprint: "scope:proposed" })
  })

  it.each(["policy", "exception", "procedure"] as const)("rejects out-of-scope %s definitions", (kind) => {
    expect(codes(evaluate({ rules: [{ ruleKey: `rule:${kind}`, moduleId: "identity", kind, responsibilityId: "tool", moduleOwnedResponsibilityIds: ["identity"], canonicalOwnerModuleId: "identity" }] }))).toContain("module_rule_out_of_scope")
  })

  it("rejects a definition outside its canonical owner module", () => {
    expect(codes(evaluate({ rules: [{ ruleKey: "rule:x", moduleId: "consumer", kind: "exception", responsibilityId: "identity", moduleOwnedResponsibilityIds: ["identity"], canonicalOwnerModuleId: "identity" }] }))).toContain("module_rule_owner_mismatch")
  })

  it.each([
    [{ activeDefinitionModuleIds: ["identity", "final_response"] }, "consolidation_definition_count_invalid"],
    [{ unresolvedConflictModuleIds: ["final_response"] }, "consolidation_conflict_unresolved"],
    [{ updatedConsumerReferenceModuleIds: [] }, "consolidation_reference_update_missing"],
  ] as const)("rejects incomplete rule consolidation %o", (change, code) => {
    const base = { semanticRuleKey: "identity.self_name", canonicalOwnerModuleId: "identity", activeDefinitionModuleIds: ["identity"], removedDuplicateModuleIds: ["final_response"], updatedConsumerReferenceModuleIds: ["final_response"], unresolvedConflictModuleIds: [] }
    expect(codes(evaluate({ consolidations: [{ ...base, ...change }] }))).toContain(code)
  })

  it.each([
    ["actorRefs", ["actor:main", "actor:sub"], "actor"],
    ["targetRefs", ["target:local", "target:remote", "target:external"], "target"],
    ["permissionRefs", ["permission:read", "permission:write", "permission:admin"], "permission"],
    ["exceptionRefs", ["exception:approved", "exception:auto"], "exception"],
    ["dataAccessRefs", ["data:public", "data:private", "data:secret"], "data_access"],
  ] as const)("rejects broadened %s", (field, values, dimension) => {
    const result = evaluate({ proposedScope: scope({ [field]: [...values], fingerprint: `scope:${dimension}` }) })
    expect(result).toMatchObject({ status: "blocked", issues: expect.arrayContaining([expect.objectContaining({ code: "semantic_scope_broadened", dimension })]) })
  })

  it("rejects weaker conditions and low-confidence semantic parsing", () => {
    expect(codes(evaluate({ proposedScope: scope({ conditionStrictness: 1, fingerprint: "scope:weak" }) }))).toContain("semantic_condition_weakened")
    expect(codes(evaluate({ proposedScope: scope({ parserConfidence: 0.7, fingerprint: "scope:uncertain" }) }))).toContain("semantic_parser_confidence_low")
  })

  it("rejects invalid parser confidence instead of comparing an untrusted receipt", () => {
    expect(() => evaluate({ proposedScope: scope({ parserConfidence: Number.NaN }) })).toThrow("Proposed parser confidence must be between 0 and 1.")
    expect(() => evaluate({ baselineScope: scope({ parserConfidence: 1.1 }) })).toThrow("Baseline parser confidence must be between 0 and 1.")
  })

  it("normalizes rule identity fields before ownership comparison", () => {
    const result = evaluate({
      rules: [{ ruleKey: " identity.self_name ", moduleId: " identity ", kind: "policy", responsibilityId: " identity ", moduleOwnedResponsibilityIds: ["identity"], canonicalOwnerModuleId: " identity " }],
    })
    expect(result.status).toBe("eligible")
  })

  it("never writes a broadened or unresolved prompt change", async () => {
    const write = vi.fn(async () => "saved")
    await expect(writeNarrowedPromptScope({ decision: evaluate({ proposedScope: scope({ actorRefs: ["actor:main", "actor:any"], fingerprint: "scope:broad" }) }), write })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeNarrowedPromptScope({ decision: evaluate(), write })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("keeps scope comparison independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/prompt-scope-narrowing.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
