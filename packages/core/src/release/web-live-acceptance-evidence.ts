import type { WebRetrievalLiveSmokeSummary } from "../runs/web-retrieval-smoke.js"
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js"

export type WebLiveEvidenceRejectionCode =
  | "web_smoke_not_live"
  | "web_smoke_run_not_passed"
  | "web_smoke_scenario_duplicate"
  | "web_smoke_result_not_passed"
  | "web_smoke_answer_missing"
  | "web_smoke_llm_diagnosis_missing"
  | "web_smoke_llm_diagnosis_invalid"
  | "web_smoke_source_provenance_missing"
  | "web_smoke_source_timestamp_invalid"
  | "web_smoke_source_stale"
  | "web_smoke_target_binding_invalid"
  | "web_smoke_audit_missing"
  | "web_smoke_unredacted"

export interface WebLiveEvidenceRejection {
  scenarioId: string
  reasonCode: WebLiveEvidenceRejectionCode
}

export interface WebLiveEvidenceProductionResult {
  accepted: LiveAcceptanceEvidence[]
  rejected: WebLiveEvidenceRejection[]
}

export interface WebLiveEvidenceProductionInput {
  run: WebRetrievalLiveSmokeSummary
  now: number
  maxSourceAgeMs: number
}

const REQUIRED_DIAGNOSIS_CRITERIA = ["existence", "accuracy", "freshness", "target_match"]
const SHA256_FINGERPRINT = /^sha256:[a-f0-9]{64}$/u

export function produceWebLiveAcceptanceEvidence(
  input: WebLiveEvidenceProductionInput,
): WebLiveEvidenceProductionResult {
  const accepted: LiveAcceptanceEvidence[] = []
  const rejected: WebLiveEvidenceRejection[] = []
  const seen = new Set<string>()

  for (const result of input.run.results) {
    const scenarioId = result.scenario.id
    const trace = result.trace
    const diagnosis = trace?.resultDiagnosis
    const receipt = trace?.liveAcceptance
    let reasonCode: WebLiveEvidenceRejectionCode | undefined

    if (input.run.mode !== "live-run") reasonCode = "web_smoke_not_live"
    else if (input.run.status !== "passed") reasonCode = "web_smoke_run_not_passed"
    else if (seen.has(scenarioId)) reasonCode = "web_smoke_scenario_duplicate"
    else if (result.status !== "passed") reasonCode = "web_smoke_result_not_passed"
    else if (trace?.answerProduced !== true) reasonCode = "web_smoke_answer_missing"
    else if (!diagnosis) reasonCode = "web_smoke_llm_diagnosis_missing"
    else if (
      diagnosis.diagnosedBy !== "llm" ||
      diagnosis.status !== "complete" ||
      !SHA256_FINGERPRINT.test(diagnosis.contextFingerprint) ||
      diagnosis.conditionCount !== result.scenario.completionConditions.length ||
      diagnosis.evidenceRefs.length === 0 ||
      REQUIRED_DIAGNOSIS_CRITERIA.some((criterion) => !diagnosis.criterionKeys.includes(criterion))
    ) {
      reasonCode = "web_smoke_llm_diagnosis_invalid"
    } else if (
      !receipt?.sourceEvidence.length ||
      receipt.sourceEvidence.some(
        (source) =>
          !source.evidenceRef.trim() ||
          !source.sourceDomain.trim() ||
          !diagnosis.evidenceRefs.includes(source.evidenceRef),
      ) ||
      diagnosis.evidenceRefs.some(
        (evidenceRef) =>
          !receipt.sourceEvidence.some((source) => source.evidenceRef === evidenceRef),
      )
    ) {
      reasonCode = "web_smoke_source_provenance_missing"
    } else {
      const sourceTimes = receipt.sourceEvidence.map((source) => Date.parse(source.sourceTimestamp))
      const fetchedTimes = receipt.sourceEvidence.map((source) => Date.parse(source.fetchedAt))
      const finishedAt = Date.parse(result.finishedAt)
      if (
        !Number.isFinite(finishedAt) ||
        sourceTimes.some((timestamp) => !Number.isFinite(timestamp) || timestamp > input.now) ||
        fetchedTimes.some((timestamp) => !Number.isFinite(timestamp) || timestamp > input.now)
      ) {
        reasonCode = "web_smoke_source_timestamp_invalid"
      } else if (
        input.maxSourceAgeMs <= 0 ||
        sourceTimes.some((timestamp) => input.now - timestamp > input.maxSourceAgeMs)
      ) {
        reasonCode = "web_smoke_source_stale"
      } else if (
        receipt.targetBinding.status !== "verified" ||
        !SHA256_FINGERPRINT.test(receipt.targetBinding.requestedTargetFingerprint) ||
        receipt.targetBinding.requestedTargetFingerprint !==
          receipt.targetBinding.evidenceTargetFingerprint
      ) {
        reasonCode = "web_smoke_target_binding_invalid"
      } else if (!receipt.auditEventId.trim()) reasonCode = "web_smoke_audit_missing"
      else if (receipt.redactionStatus !== "verified") reasonCode = "web_smoke_unredacted"
      else {
        accepted.push({
          evidenceRef: `web-smoke:${input.run.smokeId}:${scenarioId}`,
          capability: "web",
          scenarioId,
          terminalStatus: "passed",
          auditEventId: receipt.auditEventId,
          executedAt: finishedAt,
          redactionStatus: "verified",
        })
      }
    }

    seen.add(scenarioId)
    if (reasonCode) rejected.push({ scenarioId, reasonCode })
  }

  if (rejected.length > 0) return { accepted: [], rejected }

  // The signed bundle allows one evidence item per capability. The first item
  // represents the web suite only after every scenario has passed validation.
  return { accepted: accepted.slice(0, 1), rejected }
}
