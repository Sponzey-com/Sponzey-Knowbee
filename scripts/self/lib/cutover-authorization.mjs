export function evaluateCutoverAuthorization(input) {
  const validationErrors = []
  if (!isRecord(input)) return invalid(["input_object_required"])
  for (const key of [
    "phase10Valid",
    "phase10Ready",
    "inventoryValid",
    "inventoryReady",
    "removalProofValid",
    "removalEvidenceReady",
    "rollbackReady",
    "bundleValid",
    "sourceExact",
    "proofInventoryLineage",
    "bundleProofLineage",
  ]) if (typeof input[key] !== "boolean") validationErrors.push(`${key}_invalid`)

  const valid = validationErrors.length === 0
  const reasons = []
  if (!valid) reasons.push("authorization_input_invalid")
  if (input.phase10Valid === false) reasons.push("phase10_evidence_invalid")
  else if (input.phase10Ready === false) reasons.push("phase10_gate_incomplete")
  if (input.inventoryValid === false || input.inventoryReady === false) reasons.push("inventory_not_ready")
  if (input.removalProofValid === false || input.removalEvidenceReady === false) reasons.push("removal_evidence_not_ready")
  if (input.rollbackReady === false || input.bundleValid === false) reasons.push("rollback_not_ready")
  if (input.sourceExact === false) reasons.push("source_drift_detected")
  if (input.proofInventoryLineage === false) reasons.push("inventory_proof_lineage_mismatch")
  if (input.bundleProofLineage === false) reasons.push("proof_bundle_lineage_mismatch")
  const authorized = valid && reasons.length === 0
  return { valid, authorized, status: authorized ? "authorized" : "denied", reasons, validationErrors }
}

function invalid(validationErrors) {
  return { valid: false, authorized: false, status: "denied", reasons: ["authorization_input_invalid"], validationErrors }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
