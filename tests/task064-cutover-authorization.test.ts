import { describe, expect, it } from "vitest"
import { evaluateCutoverAuthorization } from "../scripts/self/lib/cutover-authorization.mjs"
import { legacyCutoverInventoryDigest } from "../scripts/self/lib/legacy-cutover-inventory.mjs"
import { legacyRemovalProofSourceDigest } from "../scripts/self/lib/legacy-rollback-bundle.mjs"

const ready = {
  phase10Valid: true,
  phase10Ready: true,
  inventoryValid: true,
  inventoryReady: true,
  removalProofValid: true,
  removalEvidenceReady: true,
  rollbackReady: true,
  bundleValid: true,
  sourceExact: true,
  proofInventoryLineage: true,
  bundleProofLineage: true,
}

describe("Task064 cutover authorization", () => {
  it("authorizes only a fully ready and linked evidence set", () => {
    expect(evaluateCutoverAuthorization(ready)).toEqual({
      valid: true,
      authorized: true,
      status: "authorized",
      reasons: [],
      validationErrors: [],
    })
  })

  it.each([
    ["phase10Ready", "phase10_gate_incomplete"],
    ["inventoryReady", "inventory_not_ready"],
    ["removalEvidenceReady", "removal_evidence_not_ready"],
    ["rollbackReady", "rollback_not_ready"],
    ["sourceExact", "source_drift_detected"],
    ["proofInventoryLineage", "inventory_proof_lineage_mismatch"],
    ["bundleProofLineage", "proof_bundle_lineage_mismatch"],
  ] as const)("denies when %s is false", (key, reason) => {
    const result = evaluateCutoverAuthorization({ ...ready, [key]: false })
    expect(result.authorized).toBe(false)
    expect(result.reasons).toContain(reason)
  })

  it("rejects missing and non-boolean input closed", () => {
    expect(evaluateCutoverAuthorization({ ...ready, phase10Ready: "true" })).toMatchObject({
      valid: false,
      authorized: false,
      reasons: ["authorization_input_invalid"],
    })
  })

  it("keeps normalized parent digests stable across timestamps and derived decisions", () => {
    const inventory = { schemaVersion: "v1", repositoryPathPolicy: "relative_only", candidates: [{ candidateId: "a" }] }
    expect(legacyCutoverInventoryDigest({ ...inventory, generatedAt: "one", decision: { valid: false } }))
      .toBe(legacyCutoverInventoryDigest({ ...inventory, generatedAt: "two", decision: { valid: true } }))
    const proof = { schemaVersion: "v1", sourceInventoryDigest: "a", compatibilityObligations: 0, units: [], operations: [] }
    expect(legacyRemovalProofSourceDigest({ ...proof, generatedAt: "one", decision: { valid: false } }))
      .toBe(legacyRemovalProofSourceDigest({ ...proof, generatedAt: "two", decision: { valid: true } }))
  })
})
