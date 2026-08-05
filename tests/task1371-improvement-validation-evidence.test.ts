import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS,
  activateValidatedImprovement,
  authorizeImprovementValidation,
  type ImprovementValidationEvidenceReceipt,
} from "../packages/core/src/contracts/improvement-validation-evidence.ts"

const now = 1_000

function receipt(kind: ImprovementValidationEvidenceReceipt["kind"], overrides: Partial<ImprovementValidationEvidenceReceipt> = {}): ImprovementValidationEvidenceReceipt {
  return {
    proposalFingerprint: "proposal:1371",
    kind,
    status: "passed",
    validatorId: `validator:${kind}`,
    evidenceRef: `validation:${kind}`,
    validatedAt: 900,
    ...overrides,
  }
}

describe("task1371 improvement validation evidence", () => {
  it.each(INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS)("authorizes independent %s evidence without a live model", async (kind) => {
    const activate = vi.fn(async () => kind)
    const decision = authorizeImprovementValidation({ proposalFingerprint: "proposal:1371", evidence: [receipt(kind)], now })
    await expect(activateValidatedImprovement({ decision, activate })).resolves.toEqual({ status: "activated", result: kind })
    expect(activate).toHaveBeenCalledOnce()
  })

  it("allows live model evidence only as supplemental evidence", () => {
    expect(authorizeImprovementValidation({
      proposalFingerprint: "proposal:1371",
      evidence: [receipt("contract_regression"), receipt("live_model")],
      now,
    })).toMatchObject({ status: "authorized", independentKinds: ["contract_regression"] })
  })

  it("blocks live-model-only validation before activation", async () => {
    const activate = vi.fn()
    const decision = authorizeImprovementValidation({ proposalFingerprint: "proposal:1371", evidence: [receipt("live_model")], now })
    expect(decision).toEqual({ status: "blocked", reasonCode: "independent_validation_missing" })
    await activateValidatedImprovement({ decision, activate })
    expect(activate).not.toHaveBeenCalled()
  })

  it("blocks failed, cross-proposal, duplicate, and future validation receipts", () => {
    expect(authorizeImprovementValidation({ proposalFingerprint: "proposal:1371", evidence: [receipt("static_validation", { status: "failed" })], now }))
      .toEqual({ status: "blocked", reasonCode: "validation_failed" })
    expect(authorizeImprovementValidation({ proposalFingerprint: "proposal:1371", evidence: [receipt("static_validation", { proposalFingerprint: "proposal:other" })], now }))
      .toEqual({ status: "blocked", reasonCode: "validation_evidence_invalid" })
    expect(authorizeImprovementValidation({ proposalFingerprint: "proposal:1371", evidence: [receipt("static_validation"), receipt("static_validation")], now }))
      .toEqual({ status: "blocked", reasonCode: "validation_evidence_invalid" })
    expect(authorizeImprovementValidation({ proposalFingerprint: "proposal:1371", evidence: [receipt("static_validation", { validatedAt: now + 1 })], now }))
      .toEqual({ status: "blocked", reasonCode: "validation_evidence_invalid" })
  })

  it("uses only injected validation receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/improvement-validation-evidence.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|openai|anthropic|globalThis/iu)
  })
})
