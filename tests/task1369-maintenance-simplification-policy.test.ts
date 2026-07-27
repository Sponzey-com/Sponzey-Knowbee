import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  DUPLICATE_ARTIFACT_CATEGORIES,
  INDIRECT_IMPLEMENTATION_KINDS,
  TEMPORARY_ARTIFACT_KINDS,
  applyMaintenanceSimplification,
  authorizeCanonicalArtifactConsolidation,
  authorizeIndirectImplementation,
  authorizeTemporaryArtifactDisposition,
  type CanonicalArtifactGroupReceipt,
  type IndirectImplementationAssessment,
  type TemporaryArtifactLifecycleReceipt,
} from "../packages/core/src/contracts/maintenance-simplification-policy.ts"

function group(overrides: Partial<CanonicalArtifactGroupReceipt> = {}): CanonicalArtifactGroupReceipt {
  return {
    responsibilityId: "identity-policy",
    category: "implementation",
    canonicalArtifactId: "artifact:canonical",
    owner: "identity-domain",
    artifacts: [
      { artifactId: "artifact:canonical", role: "canonical", disposition: "retain", evidenceRef: "owner:canonical" },
      { artifactId: "artifact:legacy", role: "duplicate", disposition: "migrate", migrationTargetArtifactId: "artifact:canonical", evidenceRef: "duplicate:legacy" },
    ],
    ...overrides,
  }
}

function temporary(overrides: Partial<TemporaryArtifactLifecycleReceipt> = {}): TemporaryArtifactLifecycleReceipt {
  return {
    artifactId: "artifact:temporary",
    kind: "compatibility_code",
    owner: "runtime-maintenance",
    createdAt: 100,
    expiresAt: 200,
    removalCondition: "replacement_verified",
    removalConditionSatisfied: false,
    disposition: "retain",
    evidenceRef: "temporary:lifecycle",
    ...overrides,
  }
}

function assessment(overrides: Partial<IndirectImplementationAssessment> = {}): IndirectImplementationAssessment {
  return {
    assessmentId: "assessment:boundary",
    kind: "wrapper",
    directImplementationSufficient: false,
    complexityRemoved: 2,
    duplicationRemoved: 0,
    justification: "The boundary removes two independent branching paths.",
    proposedDisposition: "add_indirection",
    evidenceRef: "architecture:review",
    ...overrides,
  }
}

describe("task1369 maintenance simplification policy", () => {
  it.each(DUPLICATE_ARTIFACT_CATEGORIES)("consolidates duplicate %s artifacts into one canonical owner", (category) => {
    expect(authorizeCanonicalArtifactConsolidation(group({ category }))).toEqual({ status: "authorized", action: "consolidate", subjectId: "identity-policy" })
  })

  it("rejects multiple canonical owners, retained duplicates, and wrong migration targets", () => {
    expect(authorizeCanonicalArtifactConsolidation(group({ artifacts: [
      ...group().artifacts,
      { artifactId: "artifact:second", role: "canonical", disposition: "retain", evidenceRef: "owner:second" },
    ] }))).toMatchObject({ status: "blocked", reasonCode: "canonical_owner_ambiguous" })
    expect(authorizeCanonicalArtifactConsolidation(group({ artifacts: group().artifacts.map((artifact) => artifact.role === "duplicate" ? { ...artifact, disposition: "retain" } : artifact) })))
      .toMatchObject({ status: "blocked", reasonCode: "duplicate_disposition_invalid" })
    expect(authorizeCanonicalArtifactConsolidation(group({ artifacts: group().artifacts.map((artifact) => artifact.role === "duplicate" ? { ...artifact, migrationTargetArtifactId: "artifact:other" } : artifact) })))
      .toMatchObject({ status: "blocked", reasonCode: "migration_target_invalid" })
  })

  it.each(TEMPORARY_ARTIFACT_KINDS)("removes expired temporary %s artifacts", (kind) => {
    expect(authorizeTemporaryArtifactDisposition({ receipt: temporary({ kind, disposition: "remove" }), now: 200 }))
      .toEqual({ status: "authorized", action: "remove_temporary", subjectId: "artifact:temporary" })
  })

  it.each(TEMPORARY_ARTIFACT_KINDS)("blocks expired retention and premature removal for %s", (kind) => {
    expect(authorizeTemporaryArtifactDisposition({ receipt: temporary({ kind }), now: 200 }))
      .toMatchObject({ status: "blocked", reasonCode: "temporary_expired_but_retained" })
    expect(authorizeTemporaryArtifactDisposition({ receipt: temporary({ kind, disposition: "remove" }), now: 150 }))
      .toMatchObject({ status: "blocked", reasonCode: "temporary_removal_premature" })
    expect(authorizeTemporaryArtifactDisposition({ receipt: temporary({ kind, owner: "" }), now: 150 }))
      .toMatchObject({ status: "blocked", reasonCode: "temporary_lifecycle_invalid" })
  })

  it.each(INDIRECT_IMPLEMENTATION_KINDS)("keeps direct implementation for %s when it is sufficient", (kind) => {
    expect(authorizeIndirectImplementation(assessment({ kind, directImplementationSufficient: true, proposedDisposition: "use_direct" })))
      .toEqual({ status: "authorized", action: "use_direct", subjectId: "assessment:boundary" })
  })

  it("permits indirection only for measured benefit or an established standard boundary", () => {
    expect(authorizeIndirectImplementation(assessment())).toMatchObject({ status: "authorized", action: "add_indirection" })
    expect(authorizeIndirectImplementation(assessment({ complexityRemoved: 0, standardBoundaryId: "boundary:tool-adapter" })))
      .toMatchObject({ status: "authorized", action: "add_indirection" })
  })

  it.each(["wrapper", "duplicate_adapter"] as const)("blocks unnecessary %s before applying it", async (kind) => {
    const apply = vi.fn()
    const decision = authorizeIndirectImplementation(assessment({ kind, directImplementationSufficient: true, complexityRemoved: 0, proposedDisposition: "add_indirection" }))
    expect(decision).toMatchObject({ status: "blocked", reasonCode: "unnecessary_indirection" })
    await applyMaintenanceSimplification({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("always blocks adding hidden global state", async () => {
    const apply = vi.fn()
    const decision = authorizeIndirectImplementation(assessment({ kind: "hidden_global_state" }))
    expect(decision).toMatchObject({ status: "blocked", reasonCode: "hidden_global_state_forbidden" })
    await applyMaintenanceSimplification({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("uses only injected ownership, lifecycle, and architecture receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/maintenance-simplification-policy.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|unlink|rmSync|fetch\(|globalThis/u)
  })
})
