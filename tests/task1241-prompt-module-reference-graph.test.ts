import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { evaluatePromptModuleReferenceGraph, writeReferenceEligiblePromptModules } from "../packages/core/src/index.ts"

const manifests = [
  { moduleId: "identity", version: "v2", ownedResponsibilityIds: ["identity"], allowedReferenceResponsibilityIds: [] },
  { moduleId: "final_response", version: "v3", ownedResponsibilityIds: ["final_response"], allowedReferenceResponsibilityIds: ["identity"] },
]
const owners = [{ ruleKey: "identity.self_name", moduleId: "identity", ruleId: "rule:identity:self-name", responsibilityId: "identity", version: "v2", definitionFingerprint: "sha:identity" }]
const references = [{
  sourceModuleId: "final_response", targetModuleId: "identity", ruleKey: "identity.self_name",
  targetRuleId: "rule:identity:self-name", targetResponsibilityId: "identity", expectedVersion: "v2",
  expectedDefinitionFingerprint: "sha:identity", repeatsDefinitionBody: false,
}]

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluatePromptModuleReferenceGraph({ manifests, owners, references, ...overrides })
}

function codes(result: ReturnType<typeof evaluatePromptModuleReferenceGraph>): string[] {
  return result.status === "blocked" ? result.issues.map((issue) => issue.code) : []
}

describe("task1241 canonical prompt module reference graph", () => {
  it("accepts one canonical owner and a versioned reference-only consumer", () => {
    expect(evaluate()).toEqual({ status: "eligible", moduleIds: ["identity", "final_response"], ruleKeys: ["identity.self_name"] })
  })

  it("rejects duplicate canonical owners", () => {
    expect(codes(evaluate({ owners: [...owners, { ...owners[0]!, moduleId: "final_response" }] }))).toContain("canonical_owner_duplicate")
  })

  it.each([
    [{ ruleKey: "unknown" }, "canonical_owner_missing"],
    [{ targetModuleId: "final_response" }, "reference_target_mismatch"],
    [{ expectedVersion: "v1" }, "reference_version_stale"],
    [{ expectedDefinitionFingerprint: "sha:old" }, "reference_fingerprint_stale"],
    [{ repeatsDefinitionBody: true }, "reference_repeats_definition"],
  ] as const)("rejects invalid canonical reference %o", (change, code) => {
    expect(codes(evaluate({ references: [{ ...references[0]!, ...change }] }))).toContain(code)
  })

  it("rejects definitions outside the owning module responsibility", () => {
    expect(codes(evaluate({ owners: [{ ...owners[0]!, responsibilityId: "tool_policy" }] }))).toContain("definition_responsibility_out_of_scope")
  })

  it("rejects references outside the consumer allowlist", () => {
    const restricted = manifests.map((item) => item.moduleId === "final_response" ? { ...item, allowedReferenceResponsibilityIds: [] } : item)
    expect(codes(evaluate({ manifests: restricted }))).toContain("reference_responsibility_out_of_scope")
  })

  it("rejects indirect module reference cycles", () => {
    const cycleManifests = [
      ...manifests,
      { moduleId: "output_policy", version: "v1", ownedResponsibilityIds: ["output"], allowedReferenceResponsibilityIds: ["final_response"] },
    ].map((item) => item.moduleId === "identity" ? { ...item, allowedReferenceResponsibilityIds: ["output"] } : item)
    const cycleOwners = [
      ...owners,
      { ruleKey: "output.shape", moduleId: "output_policy", ruleId: "rule:output", responsibilityId: "output", version: "v1", definitionFingerprint: "sha:output" },
      { ruleKey: "final.delivery", moduleId: "final_response", ruleId: "rule:final", responsibilityId: "final_response", version: "v3", definitionFingerprint: "sha:final" },
    ]
    const cycleRefs = [
      ...references,
      { sourceModuleId: "identity", targetModuleId: "output_policy", ruleKey: "output.shape", targetRuleId: "rule:output", targetResponsibilityId: "output", expectedVersion: "v1", expectedDefinitionFingerprint: "sha:output", repeatsDefinitionBody: false },
      { sourceModuleId: "output_policy", targetModuleId: "final_response", ruleKey: "final.delivery", targetRuleId: "rule:final", targetResponsibilityId: "final_response", expectedVersion: "v3", expectedDefinitionFingerprint: "sha:final", repeatsDefinitionBody: false },
    ]
    expect(codes(evaluate({ manifests: cycleManifests, owners: cycleOwners, references: cycleRefs }))).toContain("reference_cycle")
  })

  it("never writes a module graph rejected by ownership or scope", async () => {
    const write = vi.fn(async () => "saved")
    await expect(writeReferenceEligiblePromptModules({ decision: evaluate({ references: [{ ...references[0]!, repeatsDefinitionBody: true }] }), write })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeReferenceEligiblePromptModules({ decision: evaluate(), write })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("keeps module graph policy independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/prompt-module-reference-graph.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
