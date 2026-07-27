import {
  type LlmDiagnosisReceipt,
  authorizeDiagnosisActionRoute,
} from "./diagnosis-action-routing.js"
import type { LlmResultDiagnosisRecord } from "./work-record.js"

export type ResultReviewSourceKind = "sub_agent_result" | "tool_result" | "yeonjang_result"
export type ResultReviewRisk = "low" | "medium" | "high" | "critical" | "unknown"
export type ReviewedResultStatus = "completed" | "partial" | "failed" | "blocked"
export type ParentResultAction =
  | "accept"
  | "aggregate"
  | "redelegate"
  | "verify_more"
  | "report_partial"
  | "terminate"

export interface NormalizedResultReviewSubject {
  schemaVersion: 1
  sourceKind: ResultReviewSourceKind
  sourceRef: string
  sourceAgentName?: string
  status: ReviewedResultStatus
  risk: ResultReviewRisk
  evidenceRefs: string[]
  missingItems: string[]
  conflicts: string[]
  risks: string[]
  failureReasons: string[]
}

export interface MandatoryResultReviewDecision {
  reviewRequired: boolean
  reasonCodes: string[]
}

export interface ParentResultActionDecision {
  action: ParentResultAction
  diagnosisReceiptId: string
  sourceKind: ResultReviewSourceKind
  sourceRef: string
  reasonCodes: string[]
}

export interface EvidenceBackedClaim {
  text: string
  sourceRef: string
  evidenceRefs: string[]
}

export interface DiagnosedResultForAggregation {
  subject: NormalizedResultReviewSubject
  diagnosis: LlmResultDiagnosisRecord
  receipt: LlmDiagnosisReceipt
  parentDecision: ParentResultActionDecision
  confirmedClaims: EvidenceBackedClaim[]
}

export interface EvidencePreservingResultAggregate {
  schemaVersion: 1
  claims: EvidenceBackedClaim[]
  sourceRefs: string[]
  evidenceRefs: string[]
  conflicts: Array<{ text: string; sourceRef: string }>
  uncertainties: Array<{ text: string; sourceRef: string }>
  missingItems: Array<{ text: string; sourceRef: string }>
  risks: Array<{ text: string; sourceRef: string }>
  failureReasons: Array<{ text: string; sourceRef: string }>
  finalizationEligible: boolean
  nextAction: ParentResultAction
  reasonCodes: string[]
}

const TYPED_REFERENCE = /^(?:artifact|context|evidence|report|result|tool|work|yeonjang):\S+$/

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function unique(values: string[], field: string): string[] {
  return [...new Set(values.map((value) => required(value, field)))]
}

function typedRefs(values: string[], field: string): string[] {
  return unique(values, field).map((value) => {
    if (!TYPED_REFERENCE.test(value)) throw new Error(`${field} must use typed references.`)
    return value
  })
}

export function normalizeResultReviewSubject(
  input: Omit<NormalizedResultReviewSubject, "schemaVersion">,
): NormalizedResultReviewSubject {
  return {
    schemaVersion: 1,
    sourceKind: input.sourceKind,
    sourceRef: required(input.sourceRef, "Result source reference"),
    ...(input.sourceAgentName?.trim() ? { sourceAgentName: input.sourceAgentName.trim() } : {}),
    status: input.status,
    risk: input.risk,
    evidenceRefs: typedRefs(input.evidenceRefs, "Result evidence reference"),
    missingItems: unique(input.missingItems, "Missing item"),
    conflicts: unique(input.conflicts, "Conflict"),
    risks: unique(input.risks, "Risk"),
    failureReasons: unique(input.failureReasons, "Failure reason"),
  }
}

export function decideMandatoryResultReview(input: {
  subject: NormalizedResultReviewSubject
  reviewConfigured: boolean
}): MandatoryResultReviewDecision {
  const reasons = [
    ...(input.reviewConfigured ? ["review_configured"] : []),
    ...(input.subject.risk !== "low" ? [`risk_${input.subject.risk}`] : []),
    ...(input.subject.status !== "completed" ? [`status_${input.subject.status}`] : []),
    ...(input.subject.evidenceRefs.length === 0 ? ["evidence_missing"] : []),
    ...(input.subject.missingItems.length > 0 ? ["result_items_missing"] : []),
    ...(input.subject.conflicts.length > 0 ? ["result_conflict_present"] : []),
    ...(input.subject.risks.length > 0 ? ["result_risk_present"] : []),
    ...(input.subject.failureReasons.length > 0 ? ["result_failure_present"] : []),
  ]
  return { reviewRequired: reasons.length > 0, reasonCodes: reasons }
}

function parentActionFor(
  diagnosis: LlmResultDiagnosisRecord,
  aggregateRequested: boolean,
): ParentResultAction {
  switch (diagnosis.recommended_action) {
    case "final_report":
      return aggregateRequested ? "aggregate" : "accept"
    case "redelegate":
      return "redelegate"
    case "retry":
    case "use_tool":
    case "use_yeonjang":
      return "verify_more"
    case "partial_report":
      return "report_partial"
    case "stop_blocked":
      return "terminate"
    default:
      throw new Error(`Unsupported parent result action: ${diagnosis.recommended_action}.`)
  }
}

export function decideParentResultAction(input: {
  subject: NormalizedResultReviewSubject
  diagnosis: LlmResultDiagnosisRecord
  receipt: LlmDiagnosisReceipt | undefined
  aggregateRequested?: boolean
}): ParentResultActionDecision {
  const route = authorizeDiagnosisActionRoute({
    receipt: input.receipt,
    subjectPayload: input.subject,
    diagnosis: input.diagnosis,
  })
  if (route.subjectKind !== input.subject.sourceKind) {
    throw new Error("Diagnosis receipt source kind does not match the normalized result.")
  }
  const action = parentActionFor(input.diagnosis, input.aggregateRequested === true)
  return {
    action,
    diagnosisReceiptId: route.receiptId,
    sourceKind: input.subject.sourceKind,
    sourceRef: input.subject.sourceRef,
    reasonCodes: [`diagnosis_action:${action}`, `sufficiency:${input.diagnosis.sufficiency}`],
  }
}

function referenced(
  values: string[],
  sourceRef: string,
): Array<{ text: string; sourceRef: string }> {
  return values.map((text) => ({ text, sourceRef }))
}

export function aggregateDiagnosedResults(
  inputs: DiagnosedResultForAggregation[],
): EvidencePreservingResultAggregate {
  if (inputs.length === 0)
    throw new Error("At least one diagnosed result is required for aggregation.")
  const claims: EvidenceBackedClaim[] = []
  const sourceRefs: string[] = []
  const evidenceRefs: string[] = []
  const conflicts: EvidencePreservingResultAggregate["conflicts"] = []
  const uncertainties: EvidencePreservingResultAggregate["uncertainties"] = []
  const missingItems: EvidencePreservingResultAggregate["missingItems"] = []
  const risks: EvidencePreservingResultAggregate["risks"] = []
  const failureReasons: EvidencePreservingResultAggregate["failureReasons"] = []

  for (const input of inputs) {
    const expectedDecision = decideParentResultAction({
      subject: input.subject,
      diagnosis: input.diagnosis,
      receipt: input.receipt,
      aggregateRequested: inputs.length > 1,
    })
    if (
      expectedDecision.diagnosisReceiptId !== input.parentDecision.diagnosisReceiptId ||
      expectedDecision.action !== input.parentDecision.action
    ) {
      throw new Error("Parent result decision does not match the diagnosed source.")
    }
    sourceRefs.push(input.subject.sourceRef)
    evidenceRefs.push(...input.subject.evidenceRefs)
    for (const claim of input.confirmedClaims) {
      if (claim.sourceRef !== input.subject.sourceRef)
        throw new Error("Aggregate claim source does not match its diagnosed result.")
      if (claim.evidenceRefs.length === 0)
        throw new Error("Aggregate claims require evidence references.")
      claims.push({
        ...claim,
        text: required(claim.text, "Aggregate claim"),
        evidenceRefs: typedRefs(claim.evidenceRefs, "Claim evidence reference"),
      })
    }
    conflicts.push(
      ...referenced(
        [...input.subject.conflicts, ...input.diagnosis.conflicts],
        input.subject.sourceRef,
      ),
    )
    uncertainties.push(
      ...referenced(
        input.diagnosis.confidence.toLowerCase().includes("high")
          ? []
          : [input.diagnosis.confidence],
        input.subject.sourceRef,
      ),
    )
    missingItems.push(
      ...referenced(
        [...input.subject.missingItems, ...input.diagnosis.missing_information],
        input.subject.sourceRef,
      ),
    )
    risks.push(
      ...referenced(
        [...input.subject.risks, input.diagnosis.risk, ...input.diagnosis.risks],
        input.subject.sourceRef,
      ),
    )
    failureReasons.push(...referenced(input.subject.failureReasons, input.subject.sourceRef))
  }

  const hasLimit =
    conflicts.length +
      uncertainties.length +
      missingItems.length +
      risks.length +
      failureReasons.length >
    0
  const allFinal = inputs.every(
    (item) => item.parentDecision.action === "accept" || item.parentDecision.action === "aggregate",
  )
  const finalizationEligible = allFinal && !hasLimit
  const nextAction: ParentResultAction = finalizationEligible
    ? inputs.length > 1
      ? "aggregate"
      : "accept"
    : inputs.some((item) => item.parentDecision.action === "redelegate")
      ? "redelegate"
      : inputs.some((item) => item.parentDecision.action === "verify_more")
        ? "verify_more"
        : inputs.some((item) => item.parentDecision.action === "terminate")
          ? "terminate"
          : "report_partial"
  return {
    schemaVersion: 1,
    claims,
    sourceRefs: [...new Set(sourceRefs)],
    evidenceRefs: [...new Set(evidenceRefs)],
    conflicts,
    uncertainties,
    missingItems,
    risks,
    failureReasons,
    finalizationEligible,
    nextAction,
    reasonCodes: [
      `parent_action:${nextAction}`,
      ...(conflicts.length > 0 ? ["conflicts_preserved"] : []),
      ...(uncertainties.length > 0 ? ["uncertainty_preserved"] : []),
      ...(missingItems.length > 0 ? ["missing_items_preserved"] : []),
      ...(failureReasons.length > 0 ? ["failure_reasons_preserved"] : []),
    ],
  }
}
