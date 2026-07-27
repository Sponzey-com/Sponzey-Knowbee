import { describe, expect, it } from "vitest"
import {
  containsInternalEvidenceText,
  INTERNAL_EVIDENCE_REDACTION_MASK,
  isInternalEvidenceKey,
  redactInternalEvidenceText,
} from "../packages/core/src/security/internal-evidence-redaction.ts"

describe("task084 internal evidence redaction utility", () => {
  it("redacts every Yeonjang internal evidence text token with one shared mask", () => {
    const input = [
      "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient",
      "operationId=operation:task084",
      "operation:task084-direct",
      "receipt payload",
      "raw observed state",
      "structured diagnosis payload",
      "DB row",
    ].join(" | ")

    const redactedMatches: string[] = []
    const output = redactInternalEvidenceText(input, {
      onRedaction: (match) => redactedMatches.push(match),
    })

    expect(output).toContain(INTERNAL_EVIDENCE_REDACTION_MASK)
    expect(output).not.toContain("yeonjang-goal-validation")
    expect(output).not.toContain("operationId")
    expect(output).not.toContain("operation:task084")
    expect(output).not.toContain("receipt payload")
    expect(output).not.toContain("raw observed state")
    expect(output).not.toContain("structured diagnosis payload")
    expect(output).not.toContain("DB row")
    expect(redactedMatches.length).toBeGreaterThanOrEqual(7)
    expect(containsInternalEvidenceText(input)).toBe(true)
    expect(containsInternalEvidenceText(output)).toBe(false)
  })

  it("supports removal mode for user-facing prose without changing the token set", () => {
    const output = redactInternalEvidenceText(
      "확인 필요 operationId=operation:task084 receipt payload raw observed state",
      { replacement: "" },
    )
      .replace(/\s+/gu, " ")
      .trim()

    expect(output).toBe("확인 필요")
  })

  it("detects internal evidence structure keys without treating public keys as internal", () => {
    expect(isInternalEvidenceKey("operationId")).toBe(true)
    expect(isInternalEvidenceKey("operation_id")).toBe(true)
    expect(isInternalEvidenceKey("receiptPayload")).toBe(true)
    expect(isInternalEvidenceKey("rawObservedState")).toBe(true)
    expect(isInternalEvidenceKey("structuredDiagnosisPayload")).toBe(true)
    expect(isInternalEvidenceKey("publicReason")).toBe(false)
    expect(isInternalEvidenceKey("target")).toBe(false)
  })
})
