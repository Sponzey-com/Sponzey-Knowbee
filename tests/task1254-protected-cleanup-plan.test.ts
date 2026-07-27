import { describe, expect, it } from "vitest"
import {
  applyProtectedCleanupPlan,
  evaluateProtectedCleanupPlan,
  type CleanupReferenceBoundary,
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

function validPlan(overrides: Partial<ProtectedCleanupPlan> = {}): ProtectedCleanupPlan {
  return {
    artifactId: "artifact:unused",
    canonicalOwner: "maintenance.cleanup-decision",
    referenceReceipts: Object.fromEntries(boundaries.map((boundary) => [boundary, {
      checked: true,
      checkerId: `checker:${boundary}`,
      snapshotId: "snapshot:1",
      checkedAt: 100,
      activeReferenceCount: 0,
    }])) as ProtectedCleanupPlan["referenceReceipts"],
    protectionClass: "unprotected",
    legalOrAuditHold: false,
    affectedConsumers: [],
    recoveryStrategy: "restore_from_source",
    recoveryTarget: "git:source-revision",
    reproducible: true,
    postDeletionChecks: ["reference_index_zero", "focused_tests_pass"],
    policyVersion: "cleanup:v1",
    evaluatedAt: 100,
    ...overrides,
  }
}

describe("task1254 protected cleanup plan", () => {
  it("allows an exact unreferenced artifact with impact, recovery, and validation evidence", () => {
    expect(evaluateProtectedCleanupPlan(validPlan())).toEqual({
      decision: "deletion_eligible",
      artifactId: "artifact:unused",
      reasonCodes: ["protected_cleanup_evidence_complete"],
    })
  })

  it.each(boundaries)("fails closed when the %s reference boundary is absent", (boundary) => {
    const plan = validPlan()
    delete (plan.referenceReceipts as Partial<typeof plan.referenceReceipts>)[boundary]
    expect(evaluateProtectedCleanupPlan(plan)).toEqual(expect.objectContaining({
      decision: "retain",
      reasonCodes: expect.arrayContaining(["reference_boundary_missing"]),
    }))
  })

  it("retains an artifact when a reference check is incomplete, invalid, or active", () => {
    const plan = validPlan()
    plan.referenceReceipts.runtime.checked = false
    plan.referenceReceipts.test.checkerId = ""
    plan.referenceReceipts.prompt_registry.activeReferenceCount = 1
    expect(evaluateProtectedCleanupPlan(plan)).toEqual(expect.objectContaining({
      decision: "retain",
      reasonCodes: expect.arrayContaining([
        "reference_check_incomplete",
        "reference_receipt_invalid",
        "active_reference_present",
      ]),
    }))
  })

  it.each([
    "active_user_data",
    "audit_log",
    "migration_required",
    "rollback_required",
  ] as const)("requires retention or exact approval for protected %s", (protectionClass) => {
    expect(evaluateProtectedCleanupPlan(validPlan({ protectionClass }))).toEqual(expect.objectContaining({
      decision: "retain",
      reasonCodes: expect.arrayContaining(["retention_or_approval_missing"]),
    }))
  })

  it("accepts a current retention disposition for protected data", () => {
    expect(evaluateProtectedCleanupPlan(validPlan({
      protectionClass: "audit_log",
      retentionDisposition: {
        policyVersion: "cleanup:v1",
        evidence: "retention period elapsed",
        disposition: "deletion_allowed",
        validUntil: 120,
      },
    })).decision).toBe("deletion_eligible")
  })

  it("fails closed for unknown classification, active hold, or active retention period", () => {
    expect(evaluateProtectedCleanupPlan(validPlan({
      protectionClass: "classification_unknown",
      legalOrAuditHold: true,
      retentionUntil: 101,
    }))).toEqual(expect.objectContaining({
      decision: "retain",
      reasonCodes: expect.arrayContaining([
        "protection_class_unknown",
        "hold_active",
        "retention_period_active",
      ]),
    }))
  })

  it("requires an exact recovery target and post-deletion validation", () => {
    expect(evaluateProtectedCleanupPlan(validPlan({
      recoveryTarget: "",
      postDeletionChecks: [],
    }))).toEqual(expect.objectContaining({
      decision: "retain",
      reasonCodes: expect.arrayContaining([
        "recovery_target_missing",
        "post_deletion_checks_missing",
      ]),
    }))
  })

  it("allows not-recoverable only for approved reproducible unprotected artifacts", () => {
    const approval = {
      approvalId: "approval:1",
      artifactId: "artifact:unused",
      scope: "delete" as const,
      policyVersion: "cleanup:v1",
      approvedAt: 90,
      expiresAt: 110,
    }
    expect(evaluateProtectedCleanupPlan(validPlan({
      recoveryStrategy: "not_recoverable",
      recoveryTarget: undefined,
      approval,
    })).decision).toBe("deletion_eligible")
    expect(evaluateProtectedCleanupPlan(validPlan({
      recoveryStrategy: "not_recoverable",
      recoveryTarget: undefined,
      reproducible: false,
      approval,
    }))).toEqual(expect.objectContaining({
      decision: "retain",
      reasonCodes: expect.arrayContaining(["irrecoverable_artifact_not_approved"]),
    }))
  })

  it("deletes only the exact target from a currently valid plan", async () => {
    const plan = validPlan()
    const decision = evaluateProtectedCleanupPlan(plan)
    const deleted: string[] = []
    expect(await applyProtectedCleanupPlan({
      plan,
      decision,
      deleteArtifact: async (artifactId) => { deleted.push(artifactId) },
    })).toEqual({ status: "deleted", artifactId: "artifact:unused" })
    expect(deleted).toEqual(["artifact:unused"])
  })

  it("never invokes deletion for a stale or mismatched decision", async () => {
    const plan = validPlan()
    const deleted: string[] = []
    const result = await applyProtectedCleanupPlan({
      plan: { ...plan, legalOrAuditHold: true },
      decision: evaluateProtectedCleanupPlan(plan),
      deleteArtifact: async (artifactId) => { deleted.push(artifactId) },
    })
    expect(result).toEqual({ status: "retained", artifactId: "artifact:unused" })
    expect(deleted).toEqual([])
  })
})
