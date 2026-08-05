import { describe, expect, it } from "vitest"
import {
  validateLlmRequestDiagnosisRecord,
  validateLlmResultDiagnosisRecord,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/work-record.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The user wants a focused implementation step.",
  intent: "implementation_request",
  goal: "Implement the requested change.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "The request needs a short plan before execution.",
}

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The result satisfies the requested output.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The evidence supports final reporting.",
}

describe("task0007 standalone LLM diagnosis validators", () => {
  it("validates request diagnosis records before work record construction", () => {
    const result = validateLlmRequestDiagnosisRecord(requestDiagnosis)

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("validates result diagnosis records before action decisions", () => {
    const result = validateLlmResultDiagnosisRecord(resultDiagnosis)

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects request diagnosis records with unsupported recommended actions", () => {
    const result = validateLlmRequestDiagnosisRecord({
      ...requestDiagnosis,
      recommended_action: "unknown_action" as never,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.recommended_action" }),
    ]))
  })

  it("rejects result diagnosis records with missing required fields", () => {
    const result = validateLlmResultDiagnosisRecord({
      ...resultDiagnosis,
      risks: undefined as never,
      reason: "" as never,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.risks" }),
      expect.objectContaining({ path: "$.reason" }),
    ]))
  })
})
