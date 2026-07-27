import { describe, expect, it, vi } from "vitest"
import {
  applyCanonicalWorkEvent,
  createCanonicalWorkAggregate,
} from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import {
  CANONICAL_EVENT_RECEIPT_KINDS,
  validateCanonicalWorkReceiptForEvent,
} from "../packages/core/src/contracts/canonical-work-receipt.ts"
import {
  buildCanonicalAnalysisRevisionDescriptor,
  recordCanonicalAnalysisRevision,
} from "../packages/core/src/runs/canonical-analysis-revision.ts"

const previousFingerprint = `sha256:${"a".repeat(64)}` as const
const revisedFingerprint = `sha256:${"b".repeat(64)}` as const

describe("canonical analysis revision", () => {
  it("keeps the analyzed state and advances the current revision once", () => {
    const initial = createCanonicalWorkAggregate({
      workId: "work:root:run-1",
      rootRunId: "run-1",
    })
    const diagnosed = applyCanonicalWorkEvent({
      aggregate: initial,
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:diagnosis",
    })
    if (!diagnosed.applied) throw new Error(diagnosed.reasonCode)

    const revised = applyCanonicalWorkEvent({
      aggregate: diagnosed.aggregate,
      expectedRevision: diagnosed.aggregate.revision,
      event: "ANALYSIS_REVISED",
      receiptRef: "receipt:analysis-revision",
    })

    expect(revised).toMatchObject({
      applied: true,
      aggregate: {
        state: "SOLUTION_ANALYZED",
        revision: 2,
      },
      receipt: {
        event: "ANALYSIS_REVISED",
        previousState: "SOLUTION_ANALYZED",
        nextState: "SOLUTION_ANALYZED",
        revision: 2,
      },
    })
  })

  it("maps analysis revision to its own receipt kind", () => {
    expect(CANONICAL_EVENT_RECEIPT_KINDS.ANALYSIS_REVISED).toBe("analysis_revision")
    expect(
      validateCanonicalWorkReceiptForEvent({
        receipt: {
          receiptId: "receipt:analysis-revision:1",
          workId: "work:root:run-1",
          kind: "analysis_revision",
          evidenceFingerprint: revisedFingerprint,
          evidenceRefs: ["analysis:previous:sha256-a", "analysis:revised:sha256-b"],
          issuedAt: 1,
        },
        workId: "work:root:run-1",
        event: "ANALYSIS_REVISED",
      }),
    ).toEqual({ ok: true })
  })

  it("builds a raw-free descriptor and records the same receipt idempotently", () => {
    const built = buildCanonicalAnalysisRevisionDescriptor({
      runId: "run-1",
      previousAnalysisFingerprint: previousFingerprint,
      revisedAnalysisFingerprint: revisedFingerprint,
      safeEvidenceRefs: ["failure:llm_output_schema_invalid"],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(JSON.stringify(built.descriptor)).not.toContain("original prompt")
    expect(
      buildCanonicalAnalysisRevisionDescriptor({
        runId: "run-1",
        previousAnalysisFingerprint: previousFingerprint,
        revisedAnalysisFingerprint: revisedFingerprint,
        safeEvidenceRefs: ["failure:llm_output_schema_invalid"],
      }),
    ).toEqual(built)

    let consumedRevision: number | undefined
    const issueReceipt = vi.fn(() =>
      consumedRevision === undefined
        ? { issued: true as const }
        : { issued: false as const, reasonCode: "receipt_already_exists" },
    )
    const loadReceipt = vi.fn(() => ({
      ...built.descriptor,
      consumedRevision,
    }))
    const applyRevisionTransition = vi.fn(() => {
      consumedRevision = 6
      return { status: "applied" }
    })
    const dependencies = {
      issueReceipt,
      loadReceipt,
      applyRevisionTransition,
    }

    expect(recordCanonicalAnalysisRevision(built.descriptor, 5, dependencies)).toEqual({ ok: true })
    expect(recordCanonicalAnalysisRevision(built.descriptor, 5, dependencies)).toEqual({ ok: true })
    expect(applyRevisionTransition).toHaveBeenCalledTimes(1)
    expect(applyRevisionTransition).toHaveBeenCalledWith({
      runId: "run-1",
      workId: "work:root:run-1",
      expectedRevision: 5,
      receiptRef: built.descriptor.receiptId,
    })
  })
})
