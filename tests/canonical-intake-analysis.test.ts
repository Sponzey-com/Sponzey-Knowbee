import { describe, expect, it, vi } from "vitest"
import type { CanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { recordCanonicalIntakeAnalysis } from "../packages/core/src/runs/canonical-intake-analysis.ts"
import type { CanonicalIntakeDiagnosisDescriptor } from "../packages/core/src/runs/canonical-intake-diagnosis.ts"

const previousFingerprint = `sha256:${"a".repeat(64)}` as const
const revisedFingerprint = `sha256:${"b".repeat(64)}` as const
const descriptor: CanonicalIntakeDiagnosisDescriptor = {
  runId: "run-1",
  workId: "work:root:run-1",
  receiptId: "receipt:intake:run-1:revised",
  kind: "diagnosis",
  evidenceFingerprint: revisedFingerprint,
  evidenceRefs: ["llm-intake-result:run-1:revised"],
}

function aggregate(
  state: CanonicalWorkAggregate["state"],
  revision: number,
): CanonicalWorkAggregate {
  return {
    workId: descriptor.workId,
    rootRunId: descriptor.runId,
    state,
    revision,
    transitions: [],
  }
}

describe("canonical intake analysis recorder", () => {
  it("records an initial diagnosis in REQUEST_RECEIVED", () => {
    const recordDiagnosis = vi.fn(() => ({ ok: true as const }))
    const recordRevision = vi.fn()

    expect(
      recordCanonicalIntakeAnalysis(descriptor, {
        loadAggregate: () => aggregate("REQUEST_RECEIVED", 0),
        findLatestConsumedReceipt: vi.fn(),
        recordDiagnosis,
        recordRevision,
      }),
    ).toEqual({ ok: true })
    expect(recordDiagnosis).toHaveBeenCalledWith(descriptor)
    expect(recordRevision).not.toHaveBeenCalled()
  })

  it("records changed analysis at the current SOLUTION_ANALYZED revision", () => {
    const recordRevision = vi.fn(() => ({ ok: true as const }))

    expect(
      recordCanonicalIntakeAnalysis(descriptor, {
        loadAggregate: () => aggregate("SOLUTION_ANALYZED", 7),
        findLatestConsumedReceipt: (kind) =>
          kind === "analysis_revision"
            ? undefined
            : {
                kind: "diagnosis",
                evidenceFingerprint: previousFingerprint,
              },
        recordDiagnosis: vi.fn(),
        recordRevision,
      }),
    ).toEqual({ ok: true })
    expect(recordRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "analysis_revision",
        previousAnalysisFingerprint: previousFingerprint,
        revisedAnalysisFingerprint: revisedFingerprint,
      }),
      7,
    )
  })

  it("rejects the same analysis fingerprint without recording another revision", () => {
    const recordRevision = vi.fn()

    expect(
      recordCanonicalIntakeAnalysis(descriptor, {
        loadAggregate: () => aggregate("SOLUTION_ANALYZED", 8),
        findLatestConsumedReceipt: () => ({
          kind: "analysis_revision",
          evidenceFingerprint: revisedFingerprint,
        }),
        recordDiagnosis: vi.fn(),
        recordRevision,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "analysis_revision_unchanged",
    })
    expect(recordRevision).not.toHaveBeenCalled()
  })
})
