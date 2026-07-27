import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"

type Sha256Fingerprint = `sha256:${string}`

export interface CanonicalAnalysisRevisionDescriptor {
  runId: string
  workId: string
  receiptId: string
  kind: "analysis_revision"
  evidenceFingerprint: Sha256Fingerprint
  evidenceRefs: string[]
  previousAnalysisFingerprint: Sha256Fingerprint
  revisedAnalysisFingerprint: Sha256Fingerprint
}

interface PersistedAnalysisRevisionReceipt {
  receiptId: string
  workId: string
  kind: string
  evidenceFingerprint: string
  evidenceRefs: string[]
  consumedRevision?: number | undefined
}

interface CanonicalAnalysisRevisionRecorderDependencies {
  issueReceipt: (
    receipt: Pick<
      CanonicalAnalysisRevisionDescriptor,
      "receiptId" | "workId" | "kind" | "evidenceFingerprint" | "evidenceRefs"
    >,
  ) => { issued: true } | { issued: false; reasonCode: string }
  loadReceipt: (receiptId: string) => PersistedAnalysisRevisionReceipt | undefined
  applyRevisionTransition: (input: {
    runId: string
    workId: string
    expectedRevision: number
    receiptRef: string
  }) => { status: string; reasonCode?: string | undefined }
}

function validFingerprint(value: string): value is Sha256Fingerprint {
  return /^sha256:[a-f0-9]{64}$/u.test(value)
}

function safeEvidenceReference(value: string): boolean {
  if (value.length < 1 || value.length > 160) return false
  for (const character of value) {
    const isLetter =
      (character >= "a" && character <= "z") || (character >= "A" && character <= "Z")
    const isDigit = character >= "0" && character <= "9"
    if (
      !isLetter &&
      !isDigit &&
      character !== ":" &&
      character !== "." &&
      character !== "_" &&
      character !== "-"
    ) {
      return false
    }
  }
  return true
}

function sameReceipt(
  receipt: PersistedAnalysisRevisionReceipt,
  descriptor: CanonicalAnalysisRevisionDescriptor,
): boolean {
  return (
    receipt.receiptId === descriptor.receiptId &&
    receipt.workId === descriptor.workId &&
    receipt.kind === descriptor.kind &&
    receipt.evidenceFingerprint === descriptor.evidenceFingerprint &&
    receipt.evidenceRefs.length === descriptor.evidenceRefs.length &&
    receipt.evidenceRefs.every((reference, index) => reference === descriptor.evidenceRefs[index])
  )
}

export function buildCanonicalAnalysisRevisionDescriptor(input: {
  runId: string
  previousAnalysisFingerprint: Sha256Fingerprint
  revisedAnalysisFingerprint: Sha256Fingerprint
  safeEvidenceRefs?: readonly string[]
}):
  | { ok: true; descriptor: CanonicalAnalysisRevisionDescriptor }
  | {
      ok: false
      reasonCode:
        | "analysis_revision_run_id_required"
        | "analysis_revision_fingerprint_invalid"
        | "analysis_revision_unchanged"
    } {
  const runId = input.runId.trim()
  if (!runId) return { ok: false, reasonCode: "analysis_revision_run_id_required" }
  if (
    !validFingerprint(input.previousAnalysisFingerprint) ||
    !validFingerprint(input.revisedAnalysisFingerprint)
  ) {
    return { ok: false, reasonCode: "analysis_revision_fingerprint_invalid" }
  }
  if (input.previousAnalysisFingerprint === input.revisedAnalysisFingerprint) {
    return { ok: false, reasonCode: "analysis_revision_unchanged" }
  }
  const safeEvidenceRefs = [
    ...new Set(
      (input.safeEvidenceRefs ?? [])
        .map((reference) => reference.trim())
        .filter(safeEvidenceReference),
    ),
  ].sort()
  const digest = createHash("sha256")
    .update(
      [
        input.previousAnalysisFingerprint,
        input.revisedAnalysisFingerprint,
        ...safeEvidenceRefs,
      ].join("\n"),
    )
    .digest("hex")
  const evidenceRefs = [
    `analysis:previous:${input.previousAnalysisFingerprint.slice(7)}`,
    `analysis:revised:${input.revisedAnalysisFingerprint.slice(7)}`,
    ...safeEvidenceRefs,
  ]
  return {
    ok: true,
    descriptor: {
      runId,
      workId: canonicalWorkIdForRootRun(runId),
      receiptId: `receipt:analysis-revision:${runId}:${digest.slice(0, 24)}`,
      kind: "analysis_revision",
      evidenceFingerprint: input.revisedAnalysisFingerprint,
      evidenceRefs,
      previousAnalysisFingerprint: input.previousAnalysisFingerprint,
      revisedAnalysisFingerprint: input.revisedAnalysisFingerprint,
    },
  }
}

export function recordCanonicalAnalysisRevision(
  descriptor: CanonicalAnalysisRevisionDescriptor,
  expectedRevision: number,
  dependencies: CanonicalAnalysisRevisionRecorderDependencies,
): { ok: true } | { ok: false; reasonCode: string } {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, reasonCode: "analysis_revision_expected_revision_invalid" }
  }
  const issuance = dependencies.issueReceipt({
    receiptId: descriptor.receiptId,
    workId: descriptor.workId,
    kind: descriptor.kind,
    evidenceFingerprint: descriptor.evidenceFingerprint,
    evidenceRefs: descriptor.evidenceRefs,
  })
  if (!issuance.issued) {
    const existing = dependencies.loadReceipt(descriptor.receiptId)
    if (!existing || !sameReceipt(existing, descriptor)) {
      return { ok: false, reasonCode: issuance.reasonCode }
    }
    if (existing.consumedRevision !== undefined) {
      return existing.consumedRevision === expectedRevision + 1
        ? { ok: true }
        : { ok: false, reasonCode: "analysis_revision_receipt_revision_mismatch" }
    }
  }

  const transition = dependencies.applyRevisionTransition({
    runId: descriptor.runId,
    workId: descriptor.workId,
    expectedRevision,
    receiptRef: descriptor.receiptId,
  })
  return transition.status === "applied"
    ? { ok: true }
    : {
        ok: false,
        reasonCode: transition.reasonCode ?? "analysis_revision_transition_rejected",
      }
}
