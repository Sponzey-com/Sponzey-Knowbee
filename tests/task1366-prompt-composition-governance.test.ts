import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  AMBIGUOUS_PROMPT_PHRASES,
  authorizePromptComposition,
  composeAuthorizedPrompts,
  validateCanonicalPromptUses,
  validatePromptRuleClarity,
  type PromptCompositionModule,
  type PromptRuleDescriptor,
} from "../packages/core/src/contracts/prompt-composition-governance.ts"

function rule(overrides: Partial<PromptRuleDescriptor> = {}): PromptRuleDescriptor {
  return {
    ruleId: "identity:self-name",
    moduleId: "identity",
    actor: "The responding agent",
    condition: "When the user asks for the agent's name",
    allowedActions: ["Return the configured agent name"],
    prohibitedActions: ["Return the product name when a configured name exists"],
    completionCriteria: ["The response contains the configured agent name"],
    ...overrides,
  }
}

const owners = [
  { responsibilityId: "agent_identity", ownerModuleId: "identity" },
  { responsibilityId: "memory_isolation", ownerModuleId: "memory_policy" },
] as const

function modules(): PromptCompositionModule[] {
  return [
    {
      moduleId: "identity",
      rules: [rule()],
      responsibilities: [{ responsibilityId: "agent_identity", moduleId: "identity", mode: "definition" }],
    },
    {
      moduleId: "workflow",
      rules: [rule({ ruleId: "workflow:handoff", moduleId: "workflow" })],
      responsibilities: [{ responsibilityId: "agent_identity", moduleId: "workflow", mode: "reference", referencedOwnerModuleId: "identity" }],
    },
    {
      moduleId: "memory_policy",
      rules: [rule({ ruleId: "memory:isolation", moduleId: "memory_policy" })],
      responsibilities: [{ responsibilityId: "memory_isolation", moduleId: "memory_policy", mode: "definition" }],
    },
  ]
}

describe("task1366 prompt composition governance", () => {
  it("accepts a prompt rule with an explicit actor, condition, actions, prohibitions, and completion criteria", () => {
    expect(validatePromptRuleClarity(rule())).toMatchObject({ status: "authorized", moduleIds: ["identity"] })
  })

  it.each([
    ["actor", ""],
    ["condition", ""],
    ["allowedActions", []],
    ["prohibitedActions", []],
    ["completionCriteria", []],
  ] as const)("rejects a prompt rule missing %s", (field, value) => {
    expect(validatePromptRuleClarity(rule({ [field]: value }))).toMatchObject({ status: "blocked", reasonCode: "prompt_rule_invalid" })
  })

  it.each(AMBIGUOUS_PROMPT_PHRASES)("rejects ambiguous prompt phrase %s", (phrase) => {
    expect(validatePromptRuleClarity(rule({ condition: `Act ${phrase}.` }))).toMatchObject({ status: "blocked", reasonCode: "prompt_rule_ambiguous" })
  })

  it("allows an owner definition and a cross-module canonical reference", () => {
    expect(validateCanonicalPromptUses({ owners, uses: modules().flatMap((module) => module.responsibilities) }))
      .toMatchObject({ status: "authorized", responsibilityIds: ["agent_identity", "memory_isolation"] })
  })

  it("rejects unknown references, cross-owner definitions, and references without the exact owner", () => {
    expect(validateCanonicalPromptUses({ owners, uses: [{ responsibilityId: "unknown", moduleId: "workflow", mode: "reference", referencedOwnerModuleId: "identity" }] }))
      .toMatchObject({ status: "blocked", reasonCode: "canonical_responsibility_unknown" })
    expect(validateCanonicalPromptUses({ owners, uses: [{ responsibilityId: "agent_identity", moduleId: "workflow", mode: "definition" }] }))
      .toMatchObject({ status: "blocked", reasonCode: "canonical_definition_owner_mismatch" })
    expect(validateCanonicalPromptUses({ owners, uses: [{ responsibilityId: "agent_identity", moduleId: "workflow", mode: "reference", referencedOwnerModuleId: "memory_policy" }] }))
      .toMatchObject({ status: "blocked", reasonCode: "canonical_reference_owner_mismatch" })
  })

  it("composes unique modules and canonical definitions", async () => {
    const compose = vi.fn(async () => "prompt-bundle")
    const decision = authorizePromptComposition({ owners, modules: modules() })
    await expect(composeAuthorizedPrompts({ decision, compose })).resolves.toEqual({ status: "composed", result: "prompt-bundle" })
    expect(compose).toHaveBeenCalledOnce()
  })

  it.each([
    ["duplicate module", [...modules(), modules()[0]], "prompt_module_duplicate"],
    ["duplicate rule", modules().map((module, index) => index === 1 ? { ...module, rules: [rule({ moduleId: "workflow" })] } : module), "prompt_rule_duplicate"],
    ["duplicate definition", modules().map((module, index) => index === 1 ? { ...module, responsibilities: [{ responsibilityId: "agent_identity", moduleId: "workflow", mode: "definition" as const }] } : module), "canonical_definition_duplicate"],
  ] as const)("blocks %s before composition", async (_label, invalidModules, reasonCode) => {
    const compose = vi.fn()
    const decision = authorizePromptComposition({ owners, modules: invalidModules })
    expect(decision).toMatchObject({ status: "blocked", reasonCode })
    await composeAuthorizedPrompts({ decision, compose })
    expect(compose).not.toHaveBeenCalled()
  })

  it("uses only injected prompt descriptors", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-composition-governance.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
