import { describe, expect, it } from "vitest"
import { evaluateLegacyRemovalProof } from "../scripts/lib/legacy-removal-proof.mjs"

const evidence = [{ path: "packages/webui/src/pages/Owner.tsx", line: 10 }]
const complete = {
  schemaVersion: "knowbee.legacy-removal-proof:v1",
  phase10Ready: true,
  compatibilityObligations: 0,
  units: [{
    unitId: "component:legacy",
    candidateIds: ["component:legacy"],
    activeReferences: 0,
    testReferences: 1,
    generatedReferences: 0,
    unknownReferences: 0,
    evidence,
  }],
  operations: [{
    operationId: "skill:list",
    canonicalRoute: "/capabilities/skills",
    source: "packages/webui/src/pages/SkillCatalogPage.tsx",
    executionEvidence: evidence,
    validationEvidence: evidence,
    recoveryEvidence: evidence,
    evidenceComplete: true,
  }],
  rollback: {
    inventorySnapshot: true,
    rollbackPackage: true,
    deepLinkCompatibility: true,
    artifactConsistency: true,
  },
}

describe("Task062 legacy removal proof", () => {
  it("authorizes only complete evidence with rollback, compatibility and Phase 10 gates", () => {
    expect(evaluateLegacyRemovalProof(complete)).toMatchObject({
      valid: true,
      evidenceReady: true,
      rollbackReady: true,
      mutationAuthorized: true,
    })
  })

  it.each([
    [{ phase10Ready: false }, "phase10_gate_incomplete"],
    [{ compatibilityObligations: 1 }, "compatibility_obligations_present"],
    [{ rollback: { ...complete.rollback, rollbackPackage: false } }, "rollback_evidence_incomplete"],
    [{ units: [{ ...complete.units[0], activeReferences: 1 }] }, "active_references_present"],
    [{ units: [{ ...complete.units[0], unknownReferences: 1 }] }, "unknown_references_present"],
    [{ operations: [{ ...complete.operations[0], evidenceComplete: false }] }, "feature_equivalence_incomplete"],
  ])("rejects mutation for %s", (patch, reason) => {
    const result = evaluateLegacyRemovalProof({ ...complete, ...patch })
    expect(result.mutationAuthorized).toBe(false)
    expect(result.blockingReasons).toContain(reason)
  })

  it("rejects absolute evidence paths and missing recovery evidence", () => {
    const result = evaluateLegacyRemovalProof({
      ...complete,
      operations: [{
        ...complete.operations[0],
        executionEvidence: [{ path: "/private/source.ts", line: 1 }],
        recoveryEvidence: [],
      }],
    })
    expect(result.valid).toBe(false)
    expect(result.validationErrors).toEqual(expect.arrayContaining([
      "operations[0]:executionEvidence_invalid",
      "operations[0]:recoveryEvidence_invalid",
    ]))
  })

  it("rejects a unit reference count without matching evidence", () => {
    const result = evaluateLegacyRemovalProof({
      ...complete,
      units: [{ ...complete.units[0], generatedReferences: 1 }],
    })
    expect(result.valid).toBe(false)
    expect(result.validationErrors).toContain("units[0]:reference_evidence_mismatch")
  })
})
