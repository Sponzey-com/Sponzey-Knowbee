const SCHEMA_VERSION = "knowbee.legacy-removal-proof:v1"

export function evaluateLegacyRemovalProof(proof) {
  const validationErrors = []
  if (!isRecord(proof)) return invalid(["proof_object_required"])
  if (proof.schemaVersion !== SCHEMA_VERSION) validationErrors.push("schema_version_unsupported")
  if (typeof proof.phase10Ready !== "boolean") validationErrors.push("phase10_gate_invalid")
  if (!Number.isInteger(proof.compatibilityObligations) || proof.compatibilityObligations < 0) {
    validationErrors.push("compatibility_obligations_invalid")
  }

  const units = validateUnits(proof.units, validationErrors)
  const operations = validateOperations(proof.operations, validationErrors)
  const rollback = validateRollback(proof.rollback, validationErrors)
  const valid = validationErrors.length === 0
  const evidenceReady = valid &&
    units.length > 0 &&
    operations.length > 0 &&
    units.every((unit) => unit.activeReferences === 0 && unit.unknownReferences === 0) &&
    operations.every((operation) => operation.evidenceComplete)
  const rollbackReady = rollback !== null && Object.values(rollback).every(Boolean)
  const mutationAuthorized = evidenceReady &&
    rollbackReady &&
    proof.phase10Ready === true &&
    proof.compatibilityObligations === 0
  const blockingReasons = []
  if (!valid) blockingReasons.push("proof_validation_failed")
  if (units.some((unit) => unit.activeReferences > 0)) blockingReasons.push("active_references_present")
  if (units.some((unit) => unit.unknownReferences > 0)) blockingReasons.push("unknown_references_present")
  if (operations.some((operation) => !operation.evidenceComplete)) blockingReasons.push("feature_equivalence_incomplete")
  if (!rollbackReady) blockingReasons.push("rollback_evidence_incomplete")
  if (proof.phase10Ready !== true) blockingReasons.push("phase10_gate_incomplete")
  if (proof.compatibilityObligations > 0) blockingReasons.push("compatibility_obligations_present")

  return {
    valid,
    evidenceReady,
    rollbackReady,
    mutationAuthorized,
    unitCount: units.length,
    operationCount: operations.length,
    validationErrors,
    blockingReasons,
  }
}

function validateUnits(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("units_invalid")
    return []
  }
  const ids = new Set()
  for (const [index, unit] of value.entries()) {
    const prefix = `units[${index}]`
    if (!isRecord(unit)) {
      errors.push(`${prefix}:invalid`)
      continue
    }
    if (typeof unit.unitId !== "string" || !unit.unitId.trim() || ids.has(unit.unitId)) {
      errors.push(`${prefix}:unit_id_invalid_or_duplicate`)
    } else ids.add(unit.unitId)
    if (!Array.isArray(unit.candidateIds) || unit.candidateIds.length === 0) {
      errors.push(`${prefix}:candidate_ids_invalid`)
    }
    for (const key of ["activeReferences", "testReferences", "generatedReferences", "unknownReferences"]) {
      if (!Number.isInteger(unit[key]) || unit[key] < 0) errors.push(`${prefix}:${key}_invalid`)
    }
    if (!Array.isArray(unit.evidence) || unit.evidence.some((entry) => !relativeEvidence(entry))) {
      errors.push(`${prefix}:evidence_invalid`)
    } else if (unit.evidence.length !== [
      unit.activeReferences,
      unit.testReferences,
      unit.generatedReferences,
      unit.unknownReferences,
    ].filter(Number.isInteger).reduce((sum, count) => sum + count, 0)) {
      errors.push(`${prefix}:reference_evidence_mismatch`)
    }
  }
  return value
}

function validateOperations(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("operations_invalid")
    return []
  }
  const ids = new Set()
  for (const [index, operation] of value.entries()) {
    const prefix = `operations[${index}]`
    if (!isRecord(operation)) {
      errors.push(`${prefix}:invalid`)
      continue
    }
    if (typeof operation.operationId !== "string" || !operation.operationId.trim() || ids.has(operation.operationId)) {
      errors.push(`${prefix}:operation_id_invalid_or_duplicate`)
    } else ids.add(operation.operationId)
    if (typeof operation.canonicalRoute !== "string" || !operation.canonicalRoute.startsWith("/")) {
      errors.push(`${prefix}:canonical_route_invalid`)
    }
    if (!relativePath(operation.source)) errors.push(`${prefix}:source_invalid`)
    for (const key of ["executionEvidence", "validationEvidence", "recoveryEvidence"]) {
      if (!Array.isArray(operation[key]) || operation[key].length === 0 ||
        operation[key].some((entry) => !relativeEvidence(entry))) {
        errors.push(`${prefix}:${key}_invalid`)
      }
    }
    if (typeof operation.evidenceComplete !== "boolean") errors.push(`${prefix}:evidence_complete_invalid`)
  }
  return value
}

function validateRollback(value, errors) {
  if (!isRecord(value)) {
    errors.push("rollback_invalid")
    return null
  }
  const result = {}
  for (const key of ["inventorySnapshot", "rollbackPackage", "deepLinkCompatibility", "artifactConsistency"]) {
    if (typeof value[key] !== "boolean") errors.push(`rollback:${key}_invalid`)
    result[key] = value[key] === true
  }
  return result
}

function relativeEvidence(value) {
  return isRecord(value) && relativePath(value.path) && Number.isInteger(value.line) && value.line > 0
}

function relativePath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("..") && !/^[a-zA-Z]:[\\/]/u.test(value)
}

function invalid(validationErrors) {
  return {
    valid: false,
    evidenceReady: false,
    rollbackReady: false,
    mutationAuthorized: false,
    unitCount: 0,
    operationCount: 0,
    validationErrors,
    blockingReasons: ["proof_validation_failed"],
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
