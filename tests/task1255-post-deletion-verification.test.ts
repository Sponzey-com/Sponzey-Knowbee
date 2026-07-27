import { describe, expect, it } from "vitest"
import {
  evaluatePostDeletionVerification,
  type CleanupReferenceBoundary,
  type CleanupReferenceReceipts,
  type ProtectedCleanupPlan,
} from "../packages/core/src/index.ts"

const boundaries: CleanupReferenceBoundary[] = [
  "runtime",
  "test",
  "prompt_registry",
  "data_migration",
  "user_data_retention",
  "deployment_artifact",
]

function references(snapshot = "post:1"): CleanupReferenceReceipts {
  return Object.fromEntries(boundaries.map((boundary) => [boundary, {
    checked: true,
    checkerId: `checker:${boundary}`,
    snapshotId: `${snapshot}:${boundary}`,
    checkedAt: 120,
    activeReferenceCount: 0,
  }])) as CleanupReferenceReceipts
}

function plan(): ProtectedCleanupPlan {
  return {
    artifactId: "artifact:removed",
    canonicalOwner: "maintenance.cleanup-decision",
    referenceReceipts: references("pre:receipt"),
    protectionClass: "unprotected",
    legalOrAuditHold: false,
    affectedConsumers: [],
    recoveryStrategy: "restore_from_source",
    recoveryTarget: "git:revision",
    reproducible: true,
    postDeletionChecks: ["reference_index_zero", "focused_tests_pass"],
    policyVersion: "cleanup:v1",
    evaluatedAt: 90,
  }
}

const deletionReceipt = {
  decisionId: "cleanup-decision:1",
  artifactId: "artifact:removed",
  canonicalOwner: "maintenance.cleanup-decision",
  preDeletionSnapshotId: "pre:1",
  deletedAt: 100,
}

const validations = [
  { kind: "focused_test" as const, receiptId: "test:1", checkedAt: 121, passed: true },
  { kind: "static_reference" as const, receiptId: "static:1", checkedAt: 122, passed: true },
]

describe("task1255 post-deletion verification", () => {
  it("verifies only after fresh zero-reference scans and both validations", () => {
    expect(evaluatePostDeletionVerification({
      plan: plan(),
      deletionReceipt,
      postDeletionReferences: references(),
      validations,
    })).toEqual(expect.objectContaining({
      status: "verified",
      artifactId: "artifact:removed",
      reasonCodes: ["post_deletion_verification_complete"],
      trace: [
        expect.objectContaining({ event: "delete_applied", to: "deleted" }),
        expect.objectContaining({ event: "verification_started", to: "verifying" }),
        expect.objectContaining({ event: "verification_passed", to: "verified" }),
      ],
    }))
  })

  it.each(boundaries)("requires a fresh post-delete %s receipt", (boundary) => {
    const receipts = references()
    delete (receipts as Partial<CleanupReferenceReceipts>)[boundary]
    expect(evaluatePostDeletionVerification({
      plan: plan(), deletionReceipt, postDeletionReferences: receipts, validations,
    })).toEqual(expect.objectContaining({
      status: "recovery_required",
      reasonCodes: expect.arrayContaining(["post_delete_boundary_missing"]),
      recovery: expect.objectContaining({ failedBoundaries: expect.arrayContaining([boundary]) }),
    }))
  })

  it("rejects a reused pre-delete snapshot and a remaining reference", () => {
    const receipts = references()
    receipts.runtime.snapshotId = "pre:1"
    receipts.test.activeReferenceCount = 1
    expect(evaluatePostDeletionVerification({
      plan: plan(), deletionReceipt, postDeletionReferences: receipts, validations,
    })).toEqual(expect.objectContaining({
      status: "recovery_required",
      reasonCodes: expect.arrayContaining([
        "post_delete_snapshot_not_fresh",
        "post_delete_reference_present",
      ]),
    }))
  })

  it("requires focused test and static reference validation receipts", () => {
    expect(evaluatePostDeletionVerification({
      plan: plan(),
      deletionReceipt,
      postDeletionReferences: references(),
      validations: [validations[0]!],
    })).toEqual(expect.objectContaining({
      status: "recovery_required",
      reasonCodes: expect.arrayContaining(["validation_receipt_missing"]),
    }))
  })

  it("rejects a different owner or target without emitting an execution trace", () => {
    expect(evaluatePostDeletionVerification({
      plan: plan(),
      deletionReceipt: { ...deletionReceipt, canonicalOwner: "maintenance.other" },
      postDeletionReferences: references(),
      validations,
    })).toEqual(expect.objectContaining({
      status: "rejected",
      trace: [],
      reasonCodes: expect.arrayContaining(["deletion_receipt_owner_mismatch"]),
    }))
  })

  it("returns the original recovery target without requesting another deletion", () => {
    const receipts = references()
    receipts.deployment_artifact.checked = false
    const result = evaluatePostDeletionVerification({
      plan: plan(), deletionReceipt, postDeletionReferences: receipts, validations,
    })
    expect(result).toEqual(expect.objectContaining({
      status: "recovery_required",
      recovery: expect.objectContaining({
        artifactId: "artifact:removed",
        strategy: "restore_from_source",
        recoveryTarget: "git:revision",
      }),
    }))
    expect("deleteArtifact" in result).toBe(false)
  })
})
