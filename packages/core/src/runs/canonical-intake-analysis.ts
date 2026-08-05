import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js"
import {
  type CanonicalAnalysisRevisionDescriptor,
  buildCanonicalAnalysisRevisionDescriptor,
} from "./canonical-analysis-revision.js"
import type { CanonicalIntakeDiagnosisDescriptor } from "./canonical-intake-diagnosis.js"

interface ConsumedAnalysisReceipt {
  kind: CanonicalWorkReceiptKind
  evidenceFingerprint: string
}

interface CanonicalIntakeAnalysisDependencies {
  loadAggregate: (workId: string) => CanonicalWorkAggregate | undefined
  findLatestConsumedReceipt: (
    kind: "analysis_revision" | "diagnosis",
  ) => ConsumedAnalysisReceipt | undefined
  recordDiagnosis: (
    descriptor: CanonicalIntakeDiagnosisDescriptor,
  ) => { ok: true } | { ok: false; reasonCode: string }
  recordRevision: (
    descriptor: CanonicalAnalysisRevisionDescriptor,
    expectedRevision: number,
  ) => { ok: true } | { ok: false; reasonCode: string }
}

export function recordCanonicalIntakeAnalysis(
  descriptor: CanonicalIntakeDiagnosisDescriptor,
  dependencies: CanonicalIntakeAnalysisDependencies,
): { ok: true } | { ok: false; reasonCode: string } {
  const aggregate = dependencies.loadAggregate(descriptor.workId)
  if (!aggregate) {
    return { ok: false, reasonCode: "canonical_transition_aggregate_not_found" }
  }
  if (aggregate.state === "REQUEST_RECEIVED") {
    return dependencies.recordDiagnosis(descriptor)
  }
  if (aggregate.state !== "SOLUTION_ANALYZED") {
    return { ok: false, reasonCode: "canonical_transition_state_mismatch" }
  }

  const previousReceipt =
    dependencies.findLatestConsumedReceipt("analysis_revision") ??
    dependencies.findLatestConsumedReceipt("diagnosis")
  if (!previousReceipt) {
    return { ok: false, reasonCode: "analysis_revision_previous_receipt_not_found" }
  }
  const built = buildCanonicalAnalysisRevisionDescriptor({
    runId: descriptor.runId,
    previousAnalysisFingerprint: previousReceipt.evidenceFingerprint as `sha256:${string}`,
    revisedAnalysisFingerprint: descriptor.evidenceFingerprint,
    safeEvidenceRefs: descriptor.evidenceRefs,
  })
  if (!built.ok) return built
  return dependencies.recordRevision(built.descriptor, aggregate.revision)
}
