import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  assembleAssistantFinalLlmInput,
  authorizeAssistantFinalDelivery,
  buildAssistantFinalReviewReceipt,
  selectCanonicalAssistantFlow,
  type AssistantFlowKind,
} from "../packages/core/src/runs/assistant-flow-finalization.ts"
import {
  createLlmDiagnosisReceipt,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type RecommendedAction,
} from "../packages/core/src/contracts/index.ts"

const requestPayload = { requestId: "request-1", summaryRef: "request:summary-1" }

function requestDiagnosis(action: RecommendedAction): LlmRequestDiagnosisRecord {
  return {
    diagnosis_summary: `The request requires ${action}.`,
    intent: "execute_request",
    goal: "Complete the request.",
    constraints: [],
    missing_information: [],
    risk: "low",
    confidence: "high",
    recommended_action: action,
    reason: `The canonical action is ${action}.`,
  }
}

function requestReceipt(diagnosis: LlmRequestDiagnosisRecord) {
  return createLlmDiagnosisReceipt({
    receiptId: `receipt-${diagnosis.recommended_action}`,
    target: "request_diagnosis",
    subjectKind: "user_request",
    subjectPayload: requestPayload,
    diagnosis,
  })
}

const resultPayload = { workId: "work-1", resultRefs: ["result:1"] }
const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The result satisfies the request.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The evidence satisfies all completion criteria.",
}

describe("task1221 canonical assistant flow and final LLM boundary", () => {
  it.each([
    ["direct_answer", "standard", "direct_answer"],
    ["plan", "standard", "planning"],
    ["delegate", "standard", "delegation"],
    ["use_tool", "standard", "tool"],
    ["use_yeonjang", "standard", "yeonjang"],
    ["plan", "prompt_improvement", "prompt_improvement"],
  ] as Array<[RecommendedAction, "standard" | "prompt_improvement", AssistantFlowKind]>)
  ("maps %s with %s hint to the %s flow", (action, requestedFlow, expected) => {
    const diagnosis = requestDiagnosis(action)
    expect(selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis,
      receipt: requestReceipt(diagnosis),
      requestedFlow,
    })).toMatchObject({ flow: expected, diagnosisReceiptId: `receipt-${action}` })
  })

  it("maps a sufficient final result to final reporting", () => {
    const receipt = createLlmDiagnosisReceipt({
      receiptId: "receipt-final",
      target: "result_diagnosis",
      subjectKind: "validation_result",
      subjectPayload: resultPayload,
      diagnosis: resultDiagnosis,
    })
    expect(selectCanonicalAssistantFlow({
      subjectPayload: resultPayload,
      diagnosis: resultDiagnosis,
      receipt,
      requestedFlow: "standard",
    })).toMatchObject({ flow: "final_reporting", diagnosisReceiptId: "receipt-final" })
  })

  it("does not infer prompt improvement from an ordinary plan", () => {
    const diagnosis = requestDiagnosis("plan")
    expect(selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis,
      receipt: requestReceipt(diagnosis),
      requestedFlow: "standard",
    }).flow).toBe("planning")
    expect(() => selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis("use_tool"),
      receipt: requestReceipt(requestDiagnosis("use_tool")),
      requestedFlow: "prompt_improvement",
    })).toThrow(/requires the canonical plan action/i)
  })

  it("assembles only typed refs and diagnosed summaries into the final LLM input", () => {
    const diagnosis = requestDiagnosis("use_tool")
    const flow = selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis,
      receipt: requestReceipt(diagnosis),
      requestedFlow: "standard",
    })
    expect(assembleAssistantFinalLlmInput({
      flow,
      diagnosis,
      sourceRefs: ["tool-result:1", "evidence:test-1"],
      safetyOrAuditRefs: [],
      expectedLanguage: "ko",
    })).toEqual({
      schemaVersion: 1,
      flow: "tool",
      diagnosisReceiptId: "receipt-use_tool",
      diagnosisSummary: "The request requires use_tool.",
      diagnosisReason: "The canonical action is use_tool.",
      sourceRefs: ["tool-result:1", "evidence:test-1"],
      safetyOrAuditRefs: [],
      expectedLanguage: "ko",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("rejects raw internal payloads and secret-bearing refs before final rendering", () => {
    const diagnosis = requestDiagnosis("use_tool")
    const flow = selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis,
      receipt: requestReceipt(diagnosis),
      requestedFlow: "standard",
    })
    for (const unsafe of ["raw tool output", "memory:private preference", "secret:token=abc", "untyped value"]) {
      expect(() => assembleAssistantFinalLlmInput({
        flow,
        diagnosis,
        sourceRefs: [unsafe],
        safetyOrAuditRefs: [],
        expectedLanguage: "ko",
      })).toThrow(/typed redacted reference|sensitive content/i)
    }
  })

  it("authorizes delivery only when the final LLM receipt binds the exact input and response", () => {
    const diagnosis = requestDiagnosis("direct_answer")
    const flow = selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis,
      receipt: requestReceipt(diagnosis),
      requestedFlow: "standard",
    })
    const finalInput = assembleAssistantFinalLlmInput({
      flow,
      diagnosis,
      sourceRefs: ["request:summary-1"],
      safetyOrAuditRefs: [],
      expectedLanguage: "ko",
    })
    const responseText = "요청하신 내용을 확인했습니다."
    expect(() => buildAssistantFinalReviewReceipt({ finalInput, responseText })).toThrow(
      /provider provenance/i,
    )
    const receipt = buildAssistantFinalReviewReceipt({
      finalInput,
      responseText,
      directProvenance: {
        taskIntakePromptSha256: "a".repeat(64),
        finalResponsePromptSha256: "b".repeat(64),
        providerInvocationRef: "provider-invocation:test-1221",
      },
    })
    expect(authorizeAssistantFinalDelivery({ finalInput, responseText, receipt })).toEqual({
      ok: true,
      flow: "direct_answer",
      reviewReceiptId: receipt.receiptId,
    })
    expect(authorizeAssistantFinalDelivery({ finalInput, responseText })).toMatchObject({ ok: false, reasonCode: "review_receipt_missing" })
    expect(authorizeAssistantFinalDelivery({
      finalInput: { ...finalInput, sourceRefs: ["request:changed"] },
      responseText,
      receipt,
    })).toMatchObject({ ok: false, reasonCode: "review_content_mismatch" })
  })

  it("routes safety and audit notices through the same final LLM receipt boundary", () => {
    const diagnosis = requestDiagnosis("direct_answer")
    const flow = selectCanonicalAssistantFlow({
      subjectPayload: requestPayload,
      diagnosis,
      receipt: requestReceipt(diagnosis),
      requestedFlow: "standard",
    })
    const finalInput = assembleAssistantFinalLlmInput({
      flow,
      diagnosis,
      sourceRefs: ["request:summary-1"],
      safetyOrAuditRefs: ["safety-notice:permission-required"],
      expectedLanguage: "ko",
    })
    const responseText = "권한이 필요하여 현재 작업을 진행할 수 없습니다."
    expect(authorizeAssistantFinalDelivery({ finalInput, responseText })).toMatchObject({ ok: false })
    const receipt = buildAssistantFinalReviewReceipt({ finalInput, responseText })
    expect(authorizeAssistantFinalDelivery({ finalInput, responseText, receipt }).ok).toBe(true)
  })

  it("keeps flow and final-input orchestration independent from providers and external state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/runs/assistant-flow-finalization.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/)
    expect(source).not.toMatch(/process\.env|readFile|fetch\(|globalThis/)
  })
})
