import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  assessAuthorizedSolutionPathExhaustion,
  buildPartialCompletionPayload,
  buildTerminalFailurePayload,
  createLlmDiagnosisReceipt,
  type AuthorizedSolutionPathReview,
  type LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/index.ts"

const subjectPayload = { workId: "work-1", failedStepId: "step-2" }
const blockedDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "All safe recovery paths are exhausted.",
  sufficiency: "insufficient",
  missing_information: [],
  conflicts: [],
  risk: "low",
  risks: [],
  confidence: "high",
  recommended_action: "stop_blocked",
  reason: "No justified recovery path remains.",
}

function receipt(diagnosis = blockedDiagnosis) {
  return createLlmDiagnosisReceipt({
    receiptId: "receipt-exhaustion-1",
    target: "result_diagnosis",
    subjectKind: "error",
    subjectPayload,
    diagnosis,
  })
}

const reviews: AuthorizedSolutionPathReview[] = [
  { path: "direct_answer", applicable: false, disposition: "reviewed_unavailable", reasonCode: "external_action_required", evidenceRefs: ["capability:local-write"] },
  { path: "plan", applicable: true, disposition: "attempted", reasonCode: "plan_executed", evidenceRefs: ["run:plan-1"], attemptSignature: "plan:scope-a" },
  { path: "tool", applicable: true, disposition: "attempted", reasonCode: "tool_failed", evidenceRefs: ["tool-run:1"], attemptSignature: "tool:file-write:scope-a" },
  { path: "sub_agent", applicable: false, disposition: "reviewed_unavailable", reasonCode: "no_eligible_agent", evidenceRefs: ["registry:snapshot-1"] },
  { path: "yeonjang", applicable: false, disposition: "reviewed_unavailable", reasonCode: "not_connected", evidenceRefs: ["capability:yeonjang-offline"] },
  { path: "ask_clarification", applicable: false, disposition: "reviewed_unavailable", reasonCode: "input_complete", evidenceRefs: ["diagnosis:missing-none"] },
  { path: "partial_completion", applicable: true, disposition: "completed_partial", reasonCode: "read_only_part_completed", evidenceRefs: ["test:read-1"], resultRefs: ["artifact:partial-1"] },
  { path: "workaround_guidance", applicable: true, disposition: "guidance_ready", reasonCode: "manual_write_available", evidenceRefs: ["runbook:file-write"], guidance: "Grant file-write permission and retry the remaining step." },
]

describe("task1215 authorized solution-path exhaustion", () => {
  it("allows terminal failure only after a bound LLM diagnosis and evidence for every path", () => {
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(), subjectPayload, diagnosis: blockedDiagnosis, reviews,
    })
    expect(assessment.canFinalizeFailure).toBe(true)
    expect(assessment.partialResultRefs).toEqual(["artifact:partial-1"])
    expect(assessment.workaroundGuidance).toEqual(["Grant file-write permission and retry the remaining step."])
  })

  it("rejects missing evidence and duplicate unchanged attempts", () => {
    expect(() => assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(), subjectPayload, diagnosis: blockedDiagnosis,
      reviews: reviews.map((review) => review.path === "yeonjang" ? { ...review, evidenceRefs: [] } : review),
    })).toThrow(/evidence/i)

    expect(() => assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(), subjectPayload, diagnosis: blockedDiagnosis,
      reviews: reviews.map((review) => review.path === "tool" ? { ...review, attemptSignature: "plan:scope-a" } : review),
    })).toThrow(/duplicate unchanged attempt/i)
  })

  it("rejects terminal failure while a path is missing or the LLM selects partial reporting", () => {
    expect(() => assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(), subjectPayload, diagnosis: blockedDiagnosis,
      reviews: reviews.filter((review) => review.path !== "yeonjang"),
    })).toThrow(/unreviewed solution paths/i)

    const partialDiagnosis = { ...blockedDiagnosis, sufficiency: "partial" as const, recommended_action: "partial_report" as const }
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(partialDiagnosis), subjectPayload, diagnosis: partialDiagnosis, reviews,
    })
    expect(assessment.canFinalizeFailure).toBe(false)
    expect(assessment.nextAction).toBe("partial_report")
  })

  it("does not authorize terminal failure while direct answering remains available", () => {
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(),
      subjectPayload,
      diagnosis: blockedDiagnosis,
      reviews: reviews.map((review) => review.path === "direct_answer"
        ? { ...review, applicable: true, disposition: "available" as const, reasonCode: "answer_ready" }
        : review),
    })
    expect(assessment.complete).toBe(true)
    expect(assessment.canFinalizeFailure).toBe(false)
  })

  it("builds a structured terminal payload with partial work, unresolved scope, alternatives, and user actions", () => {
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(), subjectPayload, diagnosis: blockedDiagnosis, reviews,
    })
    expect(buildTerminalFailurePayload({
      assessment,
      conciseReason: "File-write permission is unavailable.",
      unresolvedScope: ["Write the generated file."],
      userActions: ["Grant file-write permission and retry."],
    })).toMatchObject({
      status: "blocked",
      partialResultRefs: ["artifact:partial-1"],
      unresolvedScope: ["Write the generated file."],
      userActions: ["Grant file-write permission and retry."],
    })
  })

  it("builds partial completion before terminal failure when the LLM selects partial reporting", () => {
    const partialDiagnosis = { ...blockedDiagnosis, sufficiency: "partial" as const, recommended_action: "partial_report" as const }
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(partialDiagnosis), subjectPayload, diagnosis: partialDiagnosis, reviews,
    })
    expect(buildPartialCompletionPayload({
      assessment,
      unresolvedScope: ["Write the generated file."],
      nextActions: ["Grant file-write permission."],
    })).toEqual({
      status: "partial",
      partialResultRefs: ["artifact:partial-1"],
      unresolvedScope: ["Write the generated file."],
      nextActions: ["Grant file-write permission."],
      diagnosisReceiptId: "receipt-exhaustion-1",
    })
  })

  it("preserves every completed result while reporting only the unresolved remainder", () => {
    const partialDiagnosis = { ...blockedDiagnosis, sufficiency: "partial" as const, recommended_action: "partial_report" as const }
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(partialDiagnosis),
      subjectPayload,
      diagnosis: partialDiagnosis,
      reviews: reviews.map((review) => review.path === "partial_completion"
        ? { ...review, resultRefs: ["artifact:analysis", "artifact:plan"] }
        : review),
    })

    expect(buildPartialCompletionPayload({
      assessment,
      unresolvedScope: ["Apply the plan on the unavailable computer."],
      nextActions: ["Connect Yeonjang and retry only the application step."],
    })).toEqual({
      status: "partial",
      partialResultRefs: ["artifact:analysis", "artifact:plan"],
      unresolvedScope: ["Apply the plan on the unavailable computer."],
      nextActions: ["Connect Yeonjang and retry only the application step."],
      diagnosisReceiptId: "receipt-exhaustion-1",
    })
  })

  it("rejects a terminal payload that hides partial work or omits a recovery action", () => {
    const assessment = assessAuthorizedSolutionPathExhaustion({
      receipt: receipt(), subjectPayload, diagnosis: blockedDiagnosis, reviews,
    })
    expect(() => buildTerminalFailurePayload({
      assessment: { ...assessment, partialResultRefs: [] },
      conciseReason: "Blocked.",
      unresolvedScope: ["Write file."],
      userActions: ["Grant permission."],
    })).toThrow(/preserve every partial result/i)
  })

  it("keeps canonical solution-path semantics in the framework-free contracts boundary", () => {
    const domain = readFileSync(
      new URL("../packages/core/src/contracts/solution-path-exhaustion.ts", import.meta.url),
      "utf8",
    )
    const compatibility = readFileSync(
      new URL("../packages/core/src/topology-runtime/solution-path-exhaustion.ts", import.meta.url),
      "utf8",
    )
    expect(domain).not.toMatch(/from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/)
    expect(compatibility).toContain('export * from "../contracts/solution-path-exhaustion.js"')
    expect(compatibility).not.toContain("REQUIRED_SOLUTION_PATHS =")
  })
})
