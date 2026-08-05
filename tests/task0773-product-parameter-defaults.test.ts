import { describe, expect, it } from "vitest"
import {
  buildSafeProductParameterDefaults,
  validateProductParameterDefaults,
  YEONJANG_SENSITIVE_OPERATIONS,
  type ProductParameterDefaults,
} from "../packages/core/src/contracts/product-parameters.ts"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  validateGoalReviewGateReport,
  type GoalReviewGateReport,
} from "../packages/core/src/contracts/goal-review-gate.ts"

describe("task0773 product parameter safe defaults", () => {
  it("builds the GOAL 11 safe default policy before product decisions are finalized", () => {
    const defaults = buildSafeProductParameterDefaults()

    expect(validateProductParameterDefaults(defaults)).toEqual({
      ok: true,
      issues: [],
    })
    expect(defaults.mainAgentName).toEqual({
      setupRequirement: "optional",
      defaultAgentName: {
        en: "Knowbee",
        ko: "노비",
      },
      userFacingNameSource: "configured_agent_name_or_default",
    })
    expect(defaults.subAgentDelegation).toEqual({
      childSubAgentPolicy: "preconfigured_direct_children_only",
      canCreateChildSubAgentsAtRuntime: false,
    })
    expect(defaults.agentMemory).toEqual({
      shortTermMemory: "enabled",
      shortTermCompactionThresholdSource: "runtime_configuration_only",
      longTermMemoryWhenRuntimeConfigMissing: "disabled",
      longTermRetentionSource: "runtime_configuration_only",
    })
    expect(defaults.generalChatMemory).toEqual({
      longTermWritePolicy: "explicit_user_save_request_only",
    })
  })

  it("requires prompt improvement approval gates by risk level", () => {
    const defaults = buildSafeProductParameterDefaults()

    expect(defaults.promptImprovementApproval).toEqual([
      {
        riskLevel: "low",
        approval: "not_required",
        approvers: [],
        requiresExplicitApproval: false,
        requiresPassingTests: true,
        requiresRollbackPath: true,
      },
      {
        riskLevel: "medium",
        approval: "required",
        approvers: ["user", "admin"],
        requiresExplicitApproval: false,
        requiresPassingTests: true,
        requiresRollbackPath: true,
      },
      {
        riskLevel: "high",
        approval: "required",
        approvers: ["user", "admin"],
        requiresExplicitApproval: true,
        requiresPassingTests: true,
        requiresRollbackPath: true,
      },
    ])
  })

  it("requires approval for every sensitive Yeonjang operation by default", () => {
    const defaults = buildSafeProductParameterDefaults()

    expect(defaults.yeonjangPermissions).toHaveLength(YEONJANG_SENSITIVE_OPERATIONS.length)
    for (const operation of YEONJANG_SENSITIVE_OPERATIONS) {
      expect(defaults.yeonjangPermissions).toContainEqual({
        operation,
        approval: "approval_required",
      })
    }
  })

  it("rejects unsafe product parameter overrides", () => {
    const unsafe: ProductParameterDefaults = {
      ...buildSafeProductParameterDefaults(),
      promptImprovementApproval: [
        {
          riskLevel: "low",
          approval: "not_required",
          approvers: [],
          requiresExplicitApproval: false,
          requiresPassingTests: false,
          requiresRollbackPath: false,
        },
        {
          riskLevel: "medium",
          approval: "not_required",
          approvers: [],
          requiresExplicitApproval: false,
          requiresPassingTests: true,
          requiresRollbackPath: true,
        },
        {
          riskLevel: "high",
          approval: "required",
          approvers: ["user", "admin"],
          requiresExplicitApproval: false,
          requiresPassingTests: true,
          requiresRollbackPath: true,
        },
      ],
      yeonjangPermissions: [],
      subAgentDelegation: {
        childSubAgentPolicy: "preconfigured_direct_children_only",
        canCreateChildSubAgentsAtRuntime: true as unknown as false,
      },
      agentMemory: {
        shortTermMemory: "enabled",
        shortTermCompactionThresholdSource: "runtime_configuration_only",
        longTermMemoryWhenRuntimeConfigMissing: "enabled" as unknown as "disabled",
        longTermRetentionSource: "runtime_configuration_only",
      },
      generalChatMemory: {
        longTermWritePolicy: "auto_store_all_chat" as unknown as "explicit_user_save_request_only",
      },
    }

    const result = validateProductParameterDefaults(unsafe)

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "prompt_low_risk_guard_missing" }),
      expect.objectContaining({ code: "prompt_medium_risk_approval_missing" }),
      expect.objectContaining({ code: "prompt_high_risk_explicit_approval_missing" }),
      expect.objectContaining({ code: "yeonjang_sensitive_operation_missing" }),
      expect.objectContaining({ code: "sub_agent_runtime_child_creation_allowed" }),
      expect.objectContaining({ code: "memory_long_term_enabled_without_runtime_config" }),
      expect.objectContaining({ code: "general_chat_auto_long_term_memory_enabled" }),
    ]))
  })

  it("adds product parameter defaults to the GOAL acceptance review gate", () => {
    const report: GoalReviewGateReport = {
      documentStructure: GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure.map((key) => item(key)),
      behaviorInvariants: GOAL_REVIEW_GATE_REQUIRED_KEYS.behaviorInvariants.map((key) => item(key)),
      promptSources: GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources.map((key) => item(key)),
      harness: GOAL_REVIEW_GATE_REQUIRED_KEYS.harness.map((key) => item(key)),
      operations: GOAL_REVIEW_GATE_REQUIRED_KEYS.operations.map((key) => item(key)),
    }

    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.operations).toContain("product_parameter_defaults")
    expect(validateGoalReviewGateReport(report)).toEqual({
      ok: true,
      issues: [],
    })
  })
})

function item(key: string): GoalReviewGateReport["operations"][number] {
  return {
    key,
    passed: true,
    evidenceRefs: [`evidence:${key}`],
  }
}
