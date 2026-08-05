import { describe, expect, it } from "vitest"
import {
  WORK_HANDOFF_TEXT_LIMITS,
  buildRuntimeWorkHandoffPackage,
  validateWorkHandoffPackage,
  type LlmRequestDiagnosisRecord,
  type RuntimeWorkHandoffProjectionInput,
  type WorkHandoffPackage,
} from "../packages/core/src/contracts/index.ts"

const diagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "Delegate a bounded implementation step.",
  intent: "implementation",
  goal: "Implement and verify the bounded change.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate",
  reason: "The child has the required capability.",
}

function projection(overrides: Partial<RuntimeWorkHandoffProjectionInput> = {}): RuntimeWorkHandoffProjectionInput {
  return {
    command: {
      commandRequestId: "command:bounded",
      subSessionId: "sub:bounded",
      targetAgentId: "agent:developer",
      targetAgentNameSnapshot: "개발자",
      contextPackageIds: ["repo-snapshot"],
      taskScope: {
        goal: "Implement and verify the bounded change.",
        intentType: "implementation",
        actionType: "code_change",
        constraints: ["Do not edit unrelated files."],
        reasonCodes: ["capability_match"],
        expectedOutputs: [{
          outputId: "patch",
          kind: "text",
          description: "Patch and test result.",
          required: true,
          acceptance: { requiredEvidenceKinds: ["test_result"], artifactRequired: false, reasonCodes: ["tests_passed"] },
        }],
      },
    },
    parentWorkId: "work:parent",
    parentStepId: "step:delegate",
    parentAgentName: "마당쇠",
    targetAgentName: "개발자",
    userRequestSummary: "사용자가 제한된 변경을 요청했습니다.",
    requestDiagnosis: diagnosis,
    context: ["artifact:repo-snapshot"],
    allowedTools: ["filesystem", "tests"],
    disallowedActions: ["secret exposure"],
    qualityCriteria: ["Focused change", "Tests pass"],
    validationMethod: "Run the targeted contract test.",
    retryLimit: 1,
    stopCondition: "Stop when the patch is verified or the retry limit is reached.",
    failureRecoveryPolicy: "Change strategy or validation method before retry.",
    deadlineOrBudget: "One implementation and validation cycle.",
    ...overrides,
  }
}

function validHandoff(): WorkHandoffPackage {
  const result = buildRuntimeWorkHandoffPackage(projection())
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.value
}

describe("task1271 handoff specificity and text bounds", () => {
  it.each([
    ["task_goal", "tbd"],
    ["expected_output", "todo"],
    ["validation_method", "as needed"],
    ["deadline_or_budget", "unknown"],
  ] as const)("rejects non-executable placeholder in %s", (field, value) => {
    const result = validateWorkHandoffPackage({ ...validHandoff(), [field]: value })
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ path: `$.${field}`, code: "handoff_text_not_executable" }))
  })

  it("rejects oversized scalar text without truncating projection input", () => {
    const oversized = "x".repeat(WORK_HANDOFF_TEXT_LIMITS.scalarCharacters + 1)
    const input = projection({ userRequestSummary: oversized })
    const result = buildRuntimeWorkHandoffPackage(input)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "$.user_request_summary", code: "handoff_text_limit_exceeded" }))
    expect(input.userRequestSummary).toBe(oversized)
  })

  it("rejects oversized array items, counts, and aggregate text", () => {
    const itemResult = validateWorkHandoffPackage({
      ...validHandoff(),
      context: ["x".repeat(WORK_HANDOFF_TEXT_LIMITS.arrayItemCharacters + 1)],
    })
    expect(itemResult.ok).toBe(false)
    expect(itemResult.issues).toContainEqual(expect.objectContaining({ path: "$.context[0]", code: "handoff_text_limit_exceeded" }))

    const countResult = validateWorkHandoffPackage({
      ...validHandoff(),
      constraints: Array.from({ length: WORK_HANDOFF_TEXT_LIMITS.arrayItems + 1 }, (_, index) => `constraint-${index}`),
    })
    expect(countResult.ok).toBe(false)
    expect(countResult.issues).toContainEqual(expect.objectContaining({ path: "$.constraints", code: "handoff_array_limit_exceeded" }))

    const aggregateResult = validateWorkHandoffPackage({
      ...validHandoff(),
      quality_criteria: Array.from({ length: 9 }, (_, index) => `${index}:${"q".repeat(1_000)}`),
    })
    expect(aggregateResult.ok).toBe(false)
    expect(aggregateResult.issues).toContainEqual(expect.objectContaining({ path: "$.quality_criteria", code: "handoff_array_limit_exceeded" }))
  })

  it("accepts a concrete package at the explicit text boundaries", () => {
    const handoff = validHandoff()
    const result = validateWorkHandoffPackage({
      ...handoff,
      user_request_summary: "u".repeat(WORK_HANDOFF_TEXT_LIMITS.scalarCharacters),
      context: ["c".repeat(WORK_HANDOFF_TEXT_LIMITS.arrayItemCharacters)],
    })
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })
})
