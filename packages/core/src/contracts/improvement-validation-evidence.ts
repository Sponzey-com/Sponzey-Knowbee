export const IMPROVEMENT_VALIDATION_EVIDENCE_KINDS = [
  "deterministic_test",
  "static_validation",
  "contract_regression",
  "live_model",
] as const

export const INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS = [
  "deterministic_test",
  "static_validation",
  "contract_regression",
] as const

export type ImprovementValidationEvidenceKind = typeof IMPROVEMENT_VALIDATION_EVIDENCE_KINDS[number]
export type IndependentImprovementValidationKind = typeof INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS[number]

export interface ImprovementValidationEvidenceReceipt {
  proposalFingerprint: string
  kind: ImprovementValidationEvidenceKind
  status: "passed" | "failed"
  validatorId: string
  evidenceRef: string
  validatedAt: number
}

export type ImprovementValidationDecision =
  | { status: "authorized"; proposalFingerprint: string; independentKinds: IndependentImprovementValidationKind[]; evidenceRefs: string[] }
  | { status: "blocked"; reasonCode: "validation_evidence_invalid" | "validation_failed" | "independent_validation_missing" }

export function authorizeImprovementValidation(input: {
  proposalFingerprint: string
  evidence: readonly ImprovementValidationEvidenceReceipt[]
  now: number
}): ImprovementValidationDecision {
  const proposalFingerprint = input.proposalFingerprint.trim()
  if (!proposalFingerprint || input.evidence.length === 0 || !Number.isSafeInteger(input.now) || input.now < 0) {
    return { status: "blocked", reasonCode: "validation_evidence_invalid" }
  }
  const refs = new Set<string>()
  const independentKinds = new Set<IndependentImprovementValidationKind>()
  for (const receipt of input.evidence) {
    const evidenceRef = receipt.evidenceRef.trim()
    if (receipt.proposalFingerprint !== proposalFingerprint
      || !IMPROVEMENT_VALIDATION_EVIDENCE_KINDS.includes(receipt.kind)
      || !receipt.validatorId.trim() || !evidenceRef || refs.has(evidenceRef)
      || !Number.isSafeInteger(receipt.validatedAt) || receipt.validatedAt < 0 || receipt.validatedAt > input.now) {
      return { status: "blocked", reasonCode: "validation_evidence_invalid" }
    }
    refs.add(evidenceRef)
    if (receipt.status !== "passed") return { status: "blocked", reasonCode: "validation_failed" }
    if (INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS.includes(receipt.kind as IndependentImprovementValidationKind)) {
      independentKinds.add(receipt.kind as IndependentImprovementValidationKind)
    }
  }
  if (independentKinds.size === 0) return { status: "blocked", reasonCode: "independent_validation_missing" }
  return { status: "authorized", proposalFingerprint, independentKinds: [...independentKinds], evidenceRefs: [...refs] }
}

export async function activateValidatedImprovement<T>(input: {
  decision: ImprovementValidationDecision
  activate: (authorization: Extract<ImprovementValidationDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "activated"; result: T } | Extract<ImprovementValidationDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "activated", result: await input.activate(input.decision) }
}
