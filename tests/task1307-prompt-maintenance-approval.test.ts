import { describe, expect, it } from "vitest"
import {
  authorizePromptImprovementApplyPrerequisites,
  validatePromptImprovementHarnessInput,
  REQUIRED_HARNESS_GUARDRAILS,
  type PromptImprovementHarnessInput,
  type PromptImprovementMaintenanceApprovalReceipt,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const now = Date.UTC(2026, 6, 14, 12, 0, 0)

function receipt(overrides: Partial<PromptImprovementMaintenanceApprovalReceipt> = {}): PromptImprovementMaintenanceApprovalReceipt {
  return {
    schemaVersion: 1,
    proposalFingerprint: "proposal:v1",
    scope: "apply_change",
    approvedBy: "admin:maintenance",
    decision: "approved",
    approvedAt: now - 1_000,
    expiresAt: now + 60_000,
    ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizePromptImprovementApplyPrerequisites({
    risk: "medium",
    tests: ["tests/prompt-source-regression.test.ts"],
    rollbackTarget: "prompt-version:v1",
    rollbackVerified: true,
    approvalMode: "none",
    approvalGranted: false,
    proposalFingerprint: "proposal:v1",
    now,
    ...overrides,
  })
}

function harnessInput(improvementKind: PromptImprovementHarnessInput["improvementKind"]): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Improve harness validation.",
    improvementKind,
    riskLevel: "low",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    triggerSource: "user_request",
    targetPromptSources: [],
    activeHarnessVersion: "harness:version:v1",
    targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
    agentOwnedPromptScope: ["prompt_improvement"],
    currentBehavior: "Uses the current harness rule.",
    desiredBehavior: "Uses the reviewed harness rule.",
    userReactionEvidence: ["User requested this harness change."],
    responseStrategyTarget: "prompt_improvement",
    harnessChangeScope: ["input_schema"],
    harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
    nonGoals: ["Do not change runtime identity."],
    allowedChangeScope: ["packages/core/src/memory/prompt-improvement-harness.ts"],
    requiredInvariants: ["safety", "harness_integrity", "audit", "activation_boundary", "rollback"],
    requiredTests: ["tests/task1307-prompt-maintenance-approval.test.ts"],
    approvalMode: "admin_required",
    approvalRecord: {
      approvedBy: "admin:owner",
      approvedAt: "2026-07-14T12:00:00.000Z",
      approvalScope: ["apply_change", "activation"],
      targetPromptSources: [],
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      riskAccepted: "high",
    },
    rollbackPlan: "Restore packages/core/src/memory/prompt-improvement-harness.ts from git:abc123.",
  }
}

describe("task1307 prompt maintenance approval", () => {
  it("allows medium apply with explicit approval or a scoped maintenance receipt", () => {
    expect(authorize({ approvalMode: "user_required", approvalGranted: true })).toMatchObject({ status: "authorized" })
    expect(authorize({ maintenanceApproval: receipt() })).toMatchObject({ status: "authorized", risk: "medium" })
  })

  it.each([
    receipt({ decision: "denied" }),
    receipt({ proposalFingerprint: "proposal:other" }),
    receipt({ expiresAt: now }),
    receipt({ approvedAt: now + 1 }),
  ])("rejects invalid maintenance receipt %#", (maintenanceApproval) => {
    expect(authorize({ maintenanceApproval })).toEqual({
      status: "blocked",
      reasonCode: "apply_maintenance_approval_invalid",
    })
  })

  it("never lets a maintenance receipt replace explicit high-risk approval", () => {
    expect(authorize({ risk: "high", maintenanceApproval: receipt() })).toEqual({
      status: "blocked",
      reasonCode: "apply_approval_mode_invalid",
    })
    expect(authorize({ risk: "high", approvalMode: "admin_required", approvalGranted: true })).toMatchObject({
      status: "authorized",
      risk: "high",
    })
  })

  it.each(["harness_rule", "harness_state_machine", "harness_test_fixture"] as const)(
    "forces %s to high risk regardless of requested low risk",
    (improvementKind) => {
      const result = validatePromptImprovementHarnessInput(harnessInput(improvementKind))
      expect(result.ok, JSON.stringify(result.issues)).toBe(true)
      expect(result.risk).toBe("high")
    },
  )
})
