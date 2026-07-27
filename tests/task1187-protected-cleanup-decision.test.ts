import { describe, expect, it } from "vitest"
import {
  decideCleanupCandidate,
  type CleanupCandidateEvidence,
  runRetentionCleanup,
} from "../packages/core/src/index.ts"

const deletable: CleanupCandidateEvidence = {
  candidateId: "artifact:expired",
  dataKind: "artifact",
  retentionClass: "expired",
  activeReferenceCount: 0,
  referenceScanCompleted: true,
  migrationRequired: false,
  rollbackRequired: false,
  deletionApproved: true,
}

describe("task1187 protected cleanup decision", () => {
  it("allows deletion only when all required evidence proves the candidate is disposable", () => {
    expect(decideCleanupCandidate(deletable)).toEqual({
      decision: "delete",
      candidateId: "artifact:expired",
      reasonCodes: ["cleanup_evidence_complete"],
    })
  })

  it.each([
    [{ ...deletable, referenceScanCompleted: false }, "reference_scan_incomplete"],
    [{ ...deletable, activeReferenceCount: 1 }, "active_reference_present"],
    [{ ...deletable, retentionClass: "permanent" as const }, "permanent_retention"],
    [{ ...deletable, migrationRequired: true }, "migration_required"],
    [{ ...deletable, rollbackRequired: true }, "rollback_required"],
    [{ ...deletable, deletionApproved: false }, "deletion_approval_missing"],
  ])("protects a candidate when %s", (candidate, reasonCode) => {
    expect(decideCleanupCandidate(candidate)).toEqual({
      decision: "retain",
      candidateId: "artifact:expired",
      reasonCodes: expect.arrayContaining([reasonCode]),
    })
  })

  it("fails closed when required evidence is missing", () => {
    expect(decideCleanupCandidate({
      candidateId: "audit:old",
      dataKind: "audit_log",
      retentionClass: "expired",
    })).toEqual({
      decision: "retain",
      candidateId: "audit:old",
      reasonCodes: expect.arrayContaining([
        "reference_scan_incomplete",
        "active_reference_count_unknown",
        "migration_review_missing",
        "rollback_review_missing",
        "deletion_approval_missing",
      ]),
    })
  })

  it("does not invoke the retention delete adapter without cleanup evidence", async () => {
    let deleteCalls = 0
    const result = await runRetentionCleanup({
      items: [{ id: "artifact:unreviewed", kind: "artifact", createdAt: 0, sizeBytes: 10 }],
      now: 100,
      dryRun: false,
      policy: { artifact: { maxAgeMs: 1 } },
      deleteCandidate: () => { deleteCalls += 1 },
    })

    expect(deleteCalls).toBe(0)
    expect(result.deleted).toEqual([])
    expect(result.retained[0]?.decision.reasonCodes).toContain("reference_scan_incomplete")
  })

  it("invokes the retention delete adapter after explicit safe evidence", async () => {
    let deleteCalls = 0
    const result = await runRetentionCleanup({
      items: [{
        id: "artifact:reviewed",
        kind: "artifact",
        createdAt: 0,
        sizeBytes: 10,
        cleanupProtection: {
          activeReferenceCount: 0,
          referenceScanCompleted: true,
          migrationRequired: false,
          rollbackRequired: false,
          deletionApproved: true,
        },
      }],
      now: 100,
      dryRun: false,
      policy: { artifact: { maxAgeMs: 1 } },
      deleteCandidate: () => { deleteCalls += 1 },
    })

    expect(deleteCalls).toBe(1)
    expect(result.deleted.map((candidate) => candidate.id)).toEqual(["artifact:reviewed"])
    expect(result.retained).toEqual([])
  })
})
