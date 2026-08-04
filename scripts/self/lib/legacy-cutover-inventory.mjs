import { createHash } from "node:crypto"

const CANDIDATE_KINDS = new Set(["route", "component", "api", "persisted_field"])
const EXTERNAL_COMPATIBILITY = new Set(["verified_absent", "verified_required", "unknown"])
const CLASSIFICATIONS = [
  "active",
  "compatibility_only",
  "migration_blocked",
  "removable",
  "unknown",
]

export function classifyLegacyCandidate(candidate) {
  if (!isCandidateShape(candidate) || !candidate.evidenceComplete) return "unknown"
  if (candidate.activeReferences > 0) return "active"
  if (candidate.compatibilityReferences > 0 || candidate.externalCompatibility === "verified_required") {
    return "compatibility_only"
  }
  if (candidate.migrationReferences > 0) return "migration_blocked"
  if (candidate.externalCompatibility !== "verified_absent") return "unknown"
  return "removable"
}

export function evaluateLegacyCutoverInventory(inventory) {
  const validationErrors = []
  if (!isRecord(inventory)) return invalidReport(["inventory_object_required"])
  if (inventory.schemaVersion !== "knowbee.legacy-cutover-inventory:v1") {
    validationErrors.push("schema_version_unsupported")
  }
  if (typeof inventory.phase10Ready !== "boolean") validationErrors.push("phase10_gate_invalid")
  if (!Array.isArray(inventory.candidates)) validationErrors.push("candidates_invalid")

  const candidates = Array.isArray(inventory.candidates) ? inventory.candidates : []
  const ids = new Set()
  const classified = []
  for (const [index, candidate] of candidates.entries()) {
    const prefix = `candidates[${index}]`
    if (!isRecord(candidate)) {
      validationErrors.push(`${prefix}:candidate_invalid`)
      continue
    }
    if (typeof candidate.candidateId !== "string" || !/^[a-z_]+:.{1,180}$/u.test(candidate.candidateId)) {
      validationErrors.push(`${prefix}:candidate_id_invalid`)
    } else if (ids.has(candidate.candidateId)) {
      validationErrors.push(`${prefix}:candidate_id_duplicate`)
    } else {
      ids.add(candidate.candidateId)
    }
    if (!CANDIDATE_KINDS.has(candidate.kind)) validationErrors.push(`${prefix}:candidate_kind_invalid`)
    if (!isRelativeRepositoryPath(candidate.source)) validationErrors.push(`${prefix}:candidate_source_invalid`)
    if (typeof candidate.canonicalReplacement !== "string" || !candidate.canonicalReplacement.trim()) {
      validationErrors.push(`${prefix}:canonical_replacement_invalid`)
    }
    for (const key of ["activeReferences", "compatibilityReferences", "migrationReferences"]) {
      if (!Number.isInteger(candidate[key]) || candidate[key] < 0) {
        validationErrors.push(`${prefix}:${key}:reference_count_invalid`)
      }
    }
    if (typeof candidate.evidenceComplete !== "boolean") {
      validationErrors.push(`${prefix}:evidence_complete_invalid`)
    }
    if (!EXTERNAL_COMPATIBILITY.has(candidate.externalCompatibility)) {
      validationErrors.push(`${prefix}:external_compatibility_invalid`)
    }
    const expectedEvidenceCount = [
      candidate.activeReferences,
      candidate.compatibilityReferences,
      candidate.migrationReferences,
    ].every((value) => Number.isInteger(value) && value >= 0)
      ? candidate.activeReferences + candidate.compatibilityReferences + candidate.migrationReferences
      : null
    if (!Array.isArray(candidate.evidence) ||
      (expectedEvidenceCount !== null && candidate.evidence.length !== expectedEvidenceCount)) {
      validationErrors.push(`${prefix}:reference_evidence_mismatch`)
    } else if (candidate.evidence.some((entry) =>
      !isRecord(entry) || !isRelativeRepositoryPath(entry.path))) {
      validationErrors.push(`${prefix}:reference_evidence_path_invalid`)
    }
    classified.push({ ...candidate, classification: classifyLegacyCandidate(candidate) })
  }

  const counts = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0]))
  for (const candidate of classified) counts[candidate.classification] += 1
  const valid = validationErrors.length === 0
  const inventoryReady = valid && candidates.length > 0 && counts.unknown === 0
  const deletionAuthorized =
    inventoryReady && inventory.phase10Ready === true && counts.removable === candidates.length
  const blockingReasons = []
  if (!valid) blockingReasons.push("inventory_validation_failed")
  if (counts.unknown > 0) blockingReasons.push("unknown_candidate_evidence")
  if (!inventory.phase10Ready) blockingReasons.push("phase10_gate_incomplete")
  if (counts.active > 0) blockingReasons.push("active_owner_references_present")
  if (counts.compatibility_only > 0) blockingReasons.push("compatibility_obligations_present")
  if (counts.migration_blocked > 0) blockingReasons.push("migration_obligations_present")

  return {
    valid,
    inventoryReady,
    deletionAuthorized,
    counts,
    candidates: classified,
    validationErrors,
    blockingReasons,
  }
}

export function legacyCutoverInventoryDigest(inventory) {
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: inventory?.schemaVersion,
    repositoryPathPolicy: inventory?.repositoryPathPolicy,
    candidates: inventory?.candidates,
  }), "utf8").digest("hex")
}

function isCandidateShape(candidate) {
  return isRecord(candidate) &&
    CANDIDATE_KINDS.has(candidate.kind) &&
    [candidate.activeReferences, candidate.compatibilityReferences, candidate.migrationReferences]
      .every((value) => Number.isInteger(value) && value >= 0) &&
    EXTERNAL_COMPATIBILITY.has(candidate.externalCompatibility)
}

function isRelativeRepositoryPath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.includes("..") &&
    !/^[a-zA-Z]:[\\/]/u.test(value)
}

function invalidReport(validationErrors) {
  return {
    valid: false,
    inventoryReady: false,
    deletionAuthorized: false,
    counts: Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0])),
    candidates: [],
    validationErrors,
    blockingReasons: ["inventory_validation_failed"],
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
