import { describe, expect, it } from "vitest"
import {
  type ConversationDecision,
  validateConversationDecision,
} from "../packages/core/src/agent/conversation-decision.ts"
import {
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"

const registry = {
  generatedAt: 1,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

function conversation(overrides: Partial<ConversationDecision> = {}): ConversationDecision {
  return {
    requestKind: "general_conversation",
    goal: "Answer the user through conversation.",
    constraints: [],
    availableContext: [],
    requiredTools: [],
    ambiguity: { impact: "none", missingFields: [], assumptions: [] },
    selectedAction: "direct_answer",
    ...overrides,
  }
}

function tool(availableSources?: AnyTool["availableSources"]): AnyTool {
  return {
    name: "current_agent_tool",
    description: "A tool connected to the current agent.",
    parameters: { type: "object", properties: {} },
    riskLevel: "safe",
    requiresApproval: false,
    availableSources,
    execute: async () => ({ success: true, output: "done" }),
  }
}

const fingerprint = `sha256:${"c".repeat(64)}` as const

function subAgentDecision(roleFit: "fit" | "unfit"): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run:96",
    capabilitySnapshotId: "snapshot:96",
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [{ capabilityId: "research.current_fact", targetId: "agent:research" }],
    bindingAssessments: [
      {
        capabilityId: "research.current_fact",
        targetId: "agent:research",
        roleFit,
        permission: "allowed",
        sideEffect: "read",
        evidenceQuality: "direct",
        dataExposure: "public",
        externalTransfer: false,
        cost: "low",
        strategyFingerprint: "strategy:research-agent:v1",
        changedFromFailedStrategies: true,
        reason: "The research sub-agent has the role and current-fact capability required.",
      },
    ],
    selectedBinding: {
      capabilityId: "research.current_fact",
      targetId: "agent:research",
    },
    reason: "Delegate only to the role-fit research sub-agent.",
  }
}

function admitSubAgent(roleFit: "fit" | "unfit") {
  const decision = subAgentDecision(roleFit)
  return admitLlmCapabilitySelection({
    runId: "run:96",
    userMethodSpecified: false,
    externalTransferAllowed: true,
    maxCost: "low",
    failedStrategyFingerprints: [],
    capabilitySnapshot: {
      snapshotId: "snapshot:96",
      fingerprint,
      bindings: [
        {
          capabilityId: "research.current_fact",
          targetId: "agent:research",
          risk: "safe",
        },
      ],
    },
    decision,
    receipt: createLlmCapabilitySelectionReceipt({
      receiptId: "selection:96",
      decision,
    }),
  })
}

describe("Task 096 primary execution means", () => {
  it("uses Knowbee LLM direct conversation only when external execution is unnecessary", () => {
    expect(validateConversationDecision(conversation())).toEqual({ ok: true, issues: [] })
    expect(
      validateConversationDecision(
        conversation({ requiredTools: ["filesystem"], selectedAction: "plan_work" }),
      ).issues,
    ).toEqual(
      expect.arrayContaining([
        "direct_answer_action_required",
        "direct_answer_execution_forbidden",
      ]),
    )
  })

  it("projects only source-compatible tools as connected to the current agent", () => {
    expect(
      projectCanonicalCapabilitySnapshot({
        actionCapabilityIds: [],
        registry,
        tools: [tool()],
        source: "telegram",
      }).bindings,
    ).toContainEqual({
      capabilityId: "current_agent_tool",
      targetId: "agent:knowbee",
      risk: "safe",
    })
    expect(
      projectCanonicalCapabilitySnapshot({
        actionCapabilityIds: [],
        registry,
        tools: [tool(["webui"])],
        source: "telegram",
      }).exclusions,
    ).toContainEqual({
      capabilityId: "current_agent_tool",
      targetId: "agent:knowbee",
      reasonCodes: ["tool_source_unsupported"],
    })
  })

  it("admits a sub-agent capability only when the LLM assessment proves role fit", () => {
    expect(admitSubAgent("fit")).toMatchObject({
      status: "allowed",
      selectedBinding: {
        capabilityId: "research.current_fact",
        targetId: "agent:research",
      },
    })
    expect(admitSubAgent("unfit")).toMatchObject({
      status: "rejected",
      reasonCodes: ["selected_binding_role_unfit"],
    })
  })
})
