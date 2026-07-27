import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  type LlmRequestDiagnosisRecord,
  authorizeDiagnosisActionRoute,
  createLlmDiagnosisReceipt,
} from "../packages/core/src/contracts/index.ts"

const subject = { requestId: "request:semantic-boundary", text: "Perform the approved action." }

function route(diagnosis: LlmRequestDiagnosisRecord) {
  const receipt = createLlmDiagnosisReceipt({
    receiptId: "receipt:semantic-boundary",
    target: "request_diagnosis",
    subjectKind: "user_request",
    subjectPayload: subject,
    diagnosis,
  })
  return authorizeDiagnosisActionRoute({ receipt, subjectPayload: subject, diagnosis })
}

describe("task011 no semantic regex routing", () => {
  it("does not reinterpret free-form risk or confidence text inside the deterministic harness", () => {
    const base: LlmRequestDiagnosisRecord = {
      diagnosis_summary: "The LLM selected an execution route.",
      intent: "execute",
      goal: "Perform the approved action.",
      constraints: [],
      missing_information: [],
      risk: "high and uncertain wording that policy code must not parse",
      confidence: "low according to the model narrative",
      recommended_action: "use_yeonjang",
      reason: "The structured LLM decision selected Yeonjang.",
    }

    expect(route(base)).toMatchObject({ routeKind: "yeonjang", recommendedAction: "use_yeonjang" })
    expect(route({ ...base, risk: "none", confidence: "high" })).toMatchObject({
      routeKind: "yeonjang",
      recommendedAction: "use_yeonjang",
    })
  })

  it("contains no free-form semantic risk or confidence regex helpers", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/diagnosis-action-routing.ts", import.meta.url),
      "utf8",
    )

    expect(source).not.toContain("includesRisk")
    expect(source).not.toContain("includesLowConfidence")
    expect(source).not.toContain("riskApproved")
  })
})
