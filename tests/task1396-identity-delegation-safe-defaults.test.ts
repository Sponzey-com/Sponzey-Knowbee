import { describe, expect, it } from "vitest"
import {
  DEFAULT_MAIN_AGENT_NAME_EN,
  DEFAULT_MAIN_AGENT_NAME_KO,
} from "../packages/core/src/contracts/product-identity.ts"
import {
  buildSafeProductParameterDefaults,
  validateProductParameterDefaults,
} from "../packages/core/src/contracts/product-parameters.ts"
import {
  REQUIRED_DELEGATION_HANDOFF_FIELDS,
  REQUIRED_PARENT_DELEGATION_ACTIONS,
  authorizePromptImprovementDelegationInvariant,
  projectDelegationRulesInvariantReview,
  type PromptImprovementDelegationInvariantInput,
} from "../packages/core/src/contracts/prompt-improvement-delegation-invariants.ts"
import { DEFAULT_CONFIG, type KnowbeeConfig } from "../packages/core/src/config/types.ts"
import {
  resolveMainAgentSelfName,
} from "../packages/core/src/agent/main-agent-identity.ts"
import {
  decideProductSubAgentDelegationPolicy,
  productParameterRuntimeChildSubAgentCreationAllowed,
} from "../packages/core/src/orchestration/product-parameter-policy.ts"

function config(agentName?: string): KnowbeeConfig {
  return {
    ...DEFAULT_CONFIG,
    profile: { ...DEFAULT_CONFIG.profile, language: "en" },
    orchestration: {
      ...DEFAULT_CONFIG.orchestration,
      ...(agentName === undefined
        ? { knowbee: undefined }
        : { knowbee: { agentId: "agent:main", agentName, status: "active", role: "main", modelProfile: {}, promptFragments: [], capabilities: [], memoryPolicy: { retentionPolicy: "session", isolationMode: "strict", shareableScopes: [] }, capabilityPolicy: { skillMcpAllowlist: { enabledSkillIds: [], enabledMcpServerIds: [], enabledToolNames: [], disabledToolNames: [] }, permissionProfile: { allow: [], deny: [], requireApproval: [] }, rateLimit: { maxCalls: 1, windowMs: 1000 } }, delegationPolicy: { canDelegate: true, allowedChildAgentIds: [], maxDepth: 1, maxChildrenPerTask: 1, maxParallelChildren: 1 }, lifecycle: { maxTurns: 1, maxRetries: 1, timeoutMs: 1000, stopConditions: [] } } }),
    },
  }
}

function input(): PromptImprovementDelegationInvariantInput {
  return {
    snapshot: {
      schemaVersion: 1,
      mainAgentDelegationScope: "configured_top_level_direct_children_only",
      subAgentDelegationScope: "configured_direct_children_only",
      runtimeChildCreationAllowed: false,
      handoffRequiredFields: [...REQUIRED_DELEGATION_HANDOFF_FIELDS],
      parentActions: [...REQUIRED_PARENT_DELEGATION_ACTIONS],
      retryLimitRequired: true,
      insufficientResultMayBeCorrectedAndRedelegated: true,
      evidenceRef: "evidence:delegation:snapshot:v4",
    },
    proposalFingerprint: "proposal:delegation:v5",
    baselineFingerprint: "delegation:v4",
    proposedFingerprint: "delegation:v5",
    goalSection3Fingerprint: "goal:section3:v7",
    reviewerRef: "reviewer:main-agent",
    reviewedAt: 100,
    expiresAt: 200,
  }
}

describe("task1396 identity and delegation safe defaults", () => {
  it("uses optional configured main-agent name first and localized product defaults second", () => {
    const defaults = buildSafeProductParameterDefaults()
    expect(defaults.mainAgentName).toEqual({
      setupRequirement: "optional",
      defaultAgentName: { en: DEFAULT_MAIN_AGENT_NAME_EN, ko: DEFAULT_MAIN_AGENT_NAME_KO },
      userFacingNameSource: "configured_agent_name_or_default",
    })
    expect(resolveMainAgentSelfName(config("마당쇠"), "ko")).toBe("마당쇠")
    expect(resolveMainAgentSelfName(config(), "ko")).toBe(DEFAULT_MAIN_AGENT_NAME_KO)
    expect(resolveMainAgentSelfName(config(), "en")).toBe(DEFAULT_MAIN_AGENT_NAME_EN)
  })

  it("rejects a product policy that makes the default main-agent name mandatory or changes its aliases", () => {
    const defaults = buildSafeProductParameterDefaults()
    defaults.mainAgentName = {
      setupRequirement: "required",
      defaultAgentName: { en: "Assistant" as "Knowbee", ko: "도우미" as "노비" },
      userFacingNameSource: "configured_agent_name_or_default",
    }
    expect(validateProductParameterDefaults(defaults).issues).toContainEqual(expect.objectContaining({
      code: "main_agent_name_default_invalid",
    }))
  })

  it("allows only a preconfigured direct child and never runtime child creation by default", () => {
    expect(productParameterRuntimeChildSubAgentCreationAllowed()).toBe(false)
    expect(decideProductSubAgentDelegationPolicy({
      action: "use_preconfigured_direct_child",
      selectedExecutorIsPreconfiguredDirectChild: true,
    })).toMatchObject({ ok: true, status: "allowed" })
    expect(decideProductSubAgentDelegationPolicy({
      action: "use_preconfigured_direct_child",
      selectedExecutorIsPreconfiguredDirectChild: false,
    })).toMatchObject({ ok: false, status: "selected_executor_not_direct_child" })
    expect(decideProductSubAgentDelegationPolicy({
      action: "create_runtime_child_sub_agent",
    })).toMatchObject({ ok: false, status: "runtime_child_creation_disallowed" })
  })

  it("recovers to the safe delegation default after an unsafe product override", () => {
    const unsafe = buildSafeProductParameterDefaults({
      subAgentDelegation: {
        childSubAgentPolicy: "preconfigured_direct_children_only",
        canCreateChildSubAgentsAtRuntime: true as false,
      },
    })
    expect(productParameterRuntimeChildSubAgentCreationAllowed(unsafe)).toBe(false)
    expect(decideProductSubAgentDelegationPolicy({
      action: "create_runtime_child_sub_agent",
      defaults: unsafe,
    })).toMatchObject({ ok: false, status: "runtime_child_creation_disallowed" })
  })

  it("authorizes an exact GOAL section 3 delegation invariant snapshot", () => {
    const decision = authorizePromptImprovementDelegationInvariant(input())
    expect(decision).toMatchObject({
      status: "authorized",
      receipt: {
        invariant: "delegation_rules",
        decision: "preserved",
        goalSection3Fingerprint: "goal:section3:v7",
      },
    })
    if (decision.status !== "authorized") throw new Error(decision.reasonCode)
    expect(projectDelegationRulesInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:delegation:v5",
      currentGoalSection3Fingerprint: "goal:section3:v7",
      now: 150,
    })).toMatchObject({ status: "authorized", review: { invariant: "delegation_rules" } })
  })

  it.each([
    ["main scope", (value: PromptImprovementDelegationInvariantInput) => { value.snapshot.mainAgentDelegationScope = "any_descendant" as never }, "main_delegation_scope_weakened"],
    ["sub-agent scope", (value: PromptImprovementDelegationInvariantInput) => { value.snapshot.subAgentDelegationScope = "any_agent" as never }, "sub_agent_delegation_scope_weakened"],
    ["runtime creation", (value: PromptImprovementDelegationInvariantInput) => { value.snapshot.runtimeChildCreationAllowed = true as false }, "runtime_child_creation_enabled"],
  ])("blocks weakened delegation targeting: %s", (_name, mutate, reasonCode) => {
    const value = input()
    mutate(value)
    expect(authorizePromptImprovementDelegationInvariant(value)).toEqual({ status: "blocked", reasonCode })
  })

  it.each(REQUIRED_DELEGATION_HANDOFF_FIELDS)("blocks a handoff missing %s", (field) => {
    const value = input()
    value.snapshot.handoffRequiredFields = value.snapshot.handoffRequiredFields.filter((item) => item !== field)
    expect(authorizePromptImprovementDelegationInvariant(value)).toEqual({
      status: "blocked", reasonCode: "handoff_contract_incomplete",
    })
  })

  it.each(REQUIRED_PARENT_DELEGATION_ACTIONS)("blocks removal of parent action %s", (action) => {
    const value = input()
    value.snapshot.parentActions = value.snapshot.parentActions.filter((item) => item !== action)
    expect(authorizePromptImprovementDelegationInvariant(value)).toEqual({
      status: "blocked", reasonCode: "parent_review_capability_weakened",
    })
  })

  it.each([
    ["retry limit", (value: PromptImprovementDelegationInvariantInput) => { value.snapshot.retryLimitRequired = false }],
    ["corrected redelegation", (value: PromptImprovementDelegationInvariantInput) => { value.snapshot.insufficientResultMayBeCorrectedAndRedelegated = false }],
  ])("blocks weakened retry behavior: %s", (_name, mutate) => {
    const value = input()
    mutate(value)
    expect(authorizePromptImprovementDelegationInvariant(value)).toEqual({
      status: "blocked", reasonCode: "retry_boundary_weakened",
    })
  })

  it.each([
    ["expired", { now: 200 }, "delegation_review_expired"],
    ["wrong proposal", { expectedProposalFingerprint: "proposal:other" }, "delegation_review_scope_mismatch"],
    ["stale GOAL", { currentGoalSection3Fingerprint: "goal:section3:v8" }, "goal_section3_lineage_mismatch"],
  ])("rejects an unusable projected review: %s", (_name, override, reasonCode) => {
    const decision = authorizePromptImprovementDelegationInvariant(input())
    if (decision.status !== "authorized") throw new Error(decision.reasonCode)
    expect(projectDelegationRulesInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:delegation:v5",
      currentGoalSection3Fingerprint: "goal:section3:v7",
      now: 150,
      ...override,
    })).toEqual({ status: "blocked", reasonCode })
  })
})
