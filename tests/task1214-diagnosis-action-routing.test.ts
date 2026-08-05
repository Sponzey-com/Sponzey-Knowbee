import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type DiagnosisRouteKind,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type RecommendedAction,
  authorizeDiagnosisActionRoute,
  createLlmDiagnosisReceipt,
  runResultDiagnosisProvider,
  transitionDiagnosisRouting,
} from "../packages/core/src/contracts/index.ts"

const requestPayload = { text: "Implement the requested feature.", requestId: "request-1" }
const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "Implementation work is requested.",
  intent: "implementation_request",
  goal: "Implement the feature.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "Planning is required before execution.",
}
const resultPayload = { resultRef: "artifact-1", evidenceRefs: ["test-1"] }
const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The result satisfies the request.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The evidence proves completion.",
}

function requestReceipt(diagnosis = requestDiagnosis) {
  return createLlmDiagnosisReceipt({
    receiptId: "diagnosis-receipt-1",
    target: "request_diagnosis",
    subjectKind: "user_request",
    subjectPayload: requestPayload,
    diagnosis,
  })
}

function resultReceipt(diagnosis = resultDiagnosis) {
  return createLlmDiagnosisReceipt({
    receiptId: "diagnosis-receipt-2",
    target: "result_diagnosis",
    subjectKind: "tool_result",
    subjectPayload: resultPayload,
    diagnosis,
  })
}

describe("task1214 diagnosis action routing", () => {
  it("maps every canonical recommended action to exactly one route", () => {
    const expected: Record<RecommendedAction, DiagnosisRouteKind> = {
      direct_answer: "direct_answer",
      ask_clarification: "clarification",
      plan: "planning",
      delegate: "delegation",
      use_tool: "tool",
      use_yeonjang: "yeonjang",
      retry: "retry",
      redelegate: "redelegation",
      partial_report: "partial_report",
      final_report: "final_report",
      stop_blocked: "blocked",
    }

    for (const [action, routeKind] of Object.entries(expected) as Array<
      [RecommendedAction, DiagnosisRouteKind]
    >) {
      const diagnosis: LlmRequestDiagnosisRecord = {
        ...requestDiagnosis,
        recommended_action: action,
        missing_information: action === "ask_clarification" ? ["target"] : [],
        risk: action === "use_tool" || action === "use_yeonjang" ? "low" : "none",
      }
      const decision = authorizeDiagnosisActionRoute({
        receipt: requestReceipt(diagnosis),
        subjectPayload: requestPayload,
        diagnosis,
      })
      expect(decision.routeKind).toBe(routeKind)
      expect(decision.recommendedAction).toBe(action)
    }
  })

  it("uses an explicit prompt-improvement flow hint without adding a duplicate action", () => {
    const receipt = requestReceipt(requestDiagnosis)
    expect(
      authorizeDiagnosisActionRoute({
        receipt,
        subjectPayload: requestPayload,
        diagnosis: requestDiagnosis,
        requestedFlow: "prompt_improvement",
      }).routeKind,
    ).toBe("prompt_improvement")
  })

  it("rejects missing, mismatched subject, and mismatched diagnosis receipts", () => {
    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: undefined,
        subjectPayload: requestPayload,
        diagnosis: requestDiagnosis,
      }),
    ).toThrow(/receipt is required/i)

    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: requestReceipt(),
        subjectPayload: { ...requestPayload, text: "Changed raw request." },
        diagnosis: requestDiagnosis,
      }),
    ).toThrow(/subject fingerprint/i)

    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: requestReceipt(),
        subjectPayload: requestPayload,
        diagnosis: { ...requestDiagnosis, reason: "Changed after review." },
      }),
    ).toThrow(/diagnosis fingerprint/i)
  })

  it("rejects request actions that contradict structured missing information", () => {
    const missing = {
      ...requestDiagnosis,
      missing_information: ["repository"],
      recommended_action: "plan" as const,
    }
    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: requestReceipt(missing),
        subjectPayload: requestPayload,
        diagnosis: missing,
      }),
    ).toThrow(/missing information/i)
  })

  it("rejects result actions that contradict sufficiency", () => {
    const insufficient = { ...resultDiagnosis, sufficiency: "insufficient" as const }
    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: resultReceipt(insufficient),
        subjectPayload: resultPayload,
        diagnosis: insufficient,
      }),
    ).toThrow(/insufficient result cannot select final_report/i)

    const retry = { ...resultDiagnosis, recommended_action: "retry" as const }
    expect(() =>
      authorizeDiagnosisActionRoute({
        receipt: resultReceipt(retry),
        subjectPayload: resultPayload,
        diagnosis: retry,
      }),
    ).toThrow(/sufficient result cannot select retry/i)
  })

  it.each([
    "tool_result",
    "sub_agent_result",
    "yeonjang_result",
    "error",
    "validation_result",
  ] as const)("binds and routes %s through the same result diagnosis receipt", (subjectKind) => {
    const receipt = createLlmDiagnosisReceipt({
      receiptId: `receipt-${subjectKind}`,
      target: "result_diagnosis",
      subjectKind,
      subjectPayload: resultPayload,
      diagnosis: resultDiagnosis,
    })
    expect(
      authorizeDiagnosisActionRoute({
        receipt,
        subjectPayload: resultPayload,
        diagnosis: resultDiagnosis,
      }),
    ).toMatchObject({ subjectKind, routeKind: "final_report" })
  })

  it("issues a bound receipt at the real result diagnosis provider boundary", async () => {
    const result = await runResultDiagnosisProvider({
      provider: {
        diagnoseRequest: () => requestDiagnosis,
        diagnoseResult: () => resultDiagnosis,
      },
      repairAttempted: false,
      diagnosisSubjectKind: "yeonjang_result",
      ownerAgentName: "마당쇠",
      resultSummary: "Command completed.",
      expectedOutput: "A completed command.",
      evidence: ["event-1"],
      risks: [],
      workId: "work-1",
      stepId: "result-1",
    })

    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.receipt).toMatchObject({
      target: "result_diagnosis",
      subjectKind: "yeonjang_result",
      recommendedAction: "final_report",
    })
  })

  it.each([
    "tool_result",
    "sub_agent_result",
    "yeonjang_result",
    "error",
    "validation_result",
  ] as const)(
    "diagnoses %s through the LLM provider before selecting a result action",
    async (subjectKind) => {
      const providerCalls: unknown[] = []
      const result = await runResultDiagnosisProvider({
        provider: {
          diagnoseRequest: () => requestDiagnosis,
          diagnoseResult: (input) => {
            providerCalls.push(input)
            return resultDiagnosis
          },
        },
        repairAttempted: false,
        diagnosisSubjectKind: subjectKind,
        ownerAgentName: "마당쇠",
        resultSummary: `${subjectKind} completed.`,
        expectedOutput: "A sufficient result with evidence.",
        evidence: [`evidence:${subjectKind}`],
        risks: [],
        workId: "work-result-kinds",
        stepId: subjectKind,
      })

      expect(providerCalls).toHaveLength(1)
      expect(result).toMatchObject({
        status: "valid",
        target: "result_diagnosis",
        diagnosis: {
          sufficiency: "sufficient",
          missing_information: [],
          conflicts: [],
          risk: "none",
          risks: [],
          recommended_action: "final_report",
        },
        receipt: { subjectKind, recommendedAction: "final_report" },
      })
    },
  )

  it("allows only explicit routing state transitions", () => {
    expect(transitionDiagnosisRouting("received", "diagnosis_requested")).toBe("diagnosis_pending")
    expect(transitionDiagnosisRouting("diagnosis_pending", "request_diagnosed")).toBe("diagnosed")
    expect(transitionDiagnosisRouting("diagnosed", "route_selected")).toBe("route_selected")
    expect(() => transitionDiagnosisRouting("received", "route_selected")).toThrow(
      /invalid diagnosis routing transition/i,
    )
    expect(() => transitionDiagnosisRouting("completed", "diagnosis_requested")).toThrow(
      /terminal/i,
    )
  })

  it("keeps the routing domain independent from provider, database, filesystem, and network adapters", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/diagnosis-action-routing.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(
      /from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/,
    )
  })
})
