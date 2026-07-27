import { describe, expect, it } from "vitest"
import {
  buildRuntimeWorkHandoffPackage,
  validateWorkHandoffPackage,
  type LlmRequestDiagnosisRecord,
  type RuntimeWorkHandoffProjectionInput,
} from "../packages/core/src/contracts/index.ts"

const GOAL_HANDOFF_FIELDS = [
  "handoff_id",
  "work_id",
  "parent_work_id",
  "parent_step_id",
  "parent_agent_name",
  "target_agent_name",
  "task_goal",
  "user_request_summary",
  "request_diagnosis",
  "step_plan",
  "current_step",
  "context",
  "constraints",
  "allowed_tools",
  "disallowed_actions",
  "expected_output",
  "quality_criteria",
  "validation_method",
  "retry_limit",
  "stop_condition",
  "failure_recovery_policy",
  "deadline_or_budget",
  "memory_visibility",
  "return_format",
] as const

const diagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "Delegate one bounded verification step.",
  intent: "delegated_verification",
  goal: "Verify the structured handoff contract.",
  constraints: ["Keep exchange explicit."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate",
  reason: "The direct child owns contract verification.",
}

function input(): RuntimeWorkHandoffProjectionInput {
  return {
    command: {
      commandRequestId: "command:handoff-contract",
      subSessionId: "sub:handoff-contract",
      targetAgentId: "agent:verifier",
      targetAgentNameSnapshot: "검증자",
      contextPackageIds: ["contract-snapshot"],
      taskScope: {
        goal: "Verify the structured handoff contract.",
        intentType: "verification",
        actionType: "contract_test",
        constraints: ["Do not expose raw conversation text."],
        reasonCodes: ["direct_child_verification"],
        expectedOutputs: [{
          outputId: "verification-result",
          kind: "text",
          description: "Structured verification result.",
          required: true,
          acceptance: { requiredEvidenceKinds: ["test_result"], artifactRequired: false, reasonCodes: ["contract_valid"] },
        }],
      },
    },
    parentWorkId: "work:parent",
    parentStepId: "step:delegate",
    parentAgentName: "마당쇠",
    targetAgentName: "검증자",
    userRequestSummary: "구조화 핸드오프 계약을 검증합니다.",
    requestDiagnosis: diagnosis,
    context: ["artifact:contract-snapshot"],
    allowedTools: ["tests"],
    disallowedActions: ["raw memory export"],
    qualityCriteria: ["Every required field is validated."],
    validationMethod: "Run the handoff contract test.",
    retryLimit: 1,
    stopCondition: "Stop when the delegated verification is proven or the retry limit is reached.",
    failureRecoveryPolicy: "Change validation method before retry.",
    deadlineOrBudget: "One validation cycle.",
  }
}

describe("task1270 structured handoff foundation", () => {
  it("projects exactly the GOAL handoff fields plus schemaVersion", () => {
    const result = buildRuntimeWorkHandoffPackage(input())
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return

    expect(Object.keys(result.value).sort()).toEqual(["schemaVersion", ...GOAL_HANDOFF_FIELDS].sort())
  })

  it.each(GOAL_HANDOFF_FIELDS)("rejects a handoff missing required field %s", (field) => {
    const built = buildRuntimeWorkHandoffPackage(input())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const invalid = { ...built.value } as Record<string, unknown>
    delete invalid[field]

    const result = validateWorkHandoffPackage(invalid)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path === `$.${field}` || issue.path.startsWith(`$.${field}.`))).toBe(true)
  })

  it("rejects raw transcript, raw memory, and raw prompt payload extensions", () => {
    const built = buildRuntimeWorkHandoffPackage(input())
    expect(built.ok).toBe(true)
    if (!built.ok) return

    for (const field of ["raw_transcript", "raw_memory", "raw_prompt"]) {
      const result = validateWorkHandoffPackage({ ...built.value, [field]: "raw private narrative" })
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({ path: `$.${field}` }))
    }
  })
})
