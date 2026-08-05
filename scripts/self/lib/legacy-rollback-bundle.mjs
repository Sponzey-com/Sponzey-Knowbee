import { createHash } from "node:crypto"

const SCHEMA_VERSION = "knowbee.legacy-rollback-bundle:v1"

export function createLegacyRollbackBundle({ sourceProofDigest, units, files }) {
  const normalizedFiles = [...files]
    .map((file) => ({
      path: file.path,
      encoding: "utf8",
      sha256: sha256(file.content),
      content: file.content,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const normalizedUnits = [...units]
    .map((unit) => ({ unitId: unit.unitId, paths: [...new Set(unit.paths)].sort() }))
    .sort((left, right) => left.unitId.localeCompare(right.unitId))
  const unsigned = {
    schemaVersion: SCHEMA_VERSION,
    sourceProofDigest,
    units: normalizedUnits,
    files: normalizedFiles,
  }
  return { ...unsigned, bundleDigest: digestBundle(unsigned) }
}

export function deriveLegacyRollbackCoverage(inventory, proof) {
  const candidates = new Map(
    (inventory?.decision?.candidates ?? []).map((candidate) => [candidate.candidateId, candidate]),
  )
  const units = (proof?.units ?? []).map((unit) => {
    const paths = new Set((unit.evidence ?? []).map((entry) => entry.path))
    for (const candidateId of unit.candidateIds ?? []) {
      const candidate = candidates.get(candidateId)
      if (candidate?.source) paths.add(candidate.source)
    }
    return { unitId: unit.unitId, paths: [...paths].sort() }
  })
  return {
    units,
    unitIds: units.map((unit) => unit.unitId),
    evidencePaths: [...new Set(units.flatMap((unit) => unit.paths))].sort(),
  }
}

export function validateLegacyRollbackBundle(bundle, expected) {
  const errors = []
  if (!isRecord(bundle)) return invalid(["bundle_object_required"])
  if (bundle.schemaVersion !== SCHEMA_VERSION) errors.push("schema_version_unsupported")
  if (!/^[a-f0-9]{64}$/u.test(bundle.sourceProofDigest ?? "")) errors.push("source_proof_digest_invalid")
  if (expected?.sourceProofDigest && bundle.sourceProofDigest !== expected.sourceProofDigest) {
    errors.push("source_proof_digest_mismatch")
  }
  if (!Array.isArray(bundle.units)) errors.push("units_invalid")
  if (!Array.isArray(bundle.files)) errors.push("files_invalid")

  const files = Array.isArray(bundle.files) ? bundle.files : []
  const filePaths = new Set()
  for (const [index, file] of files.entries()) {
    const prefix = `files[${index}]`
    if (!isRecord(file) || !relativePath(file.path)) {
      errors.push(`${prefix}:path_invalid`)
      continue
    }
    if (filePaths.has(file.path)) errors.push(`${prefix}:path_duplicate`)
    filePaths.add(file.path)
    if (file.encoding !== "utf8") errors.push(`${prefix}:encoding_unsupported`)
    if (typeof file.content !== "string" || file.sha256 !== sha256(file.content ?? "")) {
      errors.push(`${prefix}:content_hash_mismatch`)
    }
  }

  const units = Array.isArray(bundle.units) ? bundle.units : []
  const unitIds = new Set()
  for (const [index, unit] of units.entries()) {
    const prefix = `units[${index}]`
    if (!isRecord(unit) || typeof unit.unitId !== "string" || !unit.unitId.trim() || unitIds.has(unit.unitId)) {
      errors.push(`${prefix}:unit_id_invalid_or_duplicate`)
      continue
    }
    unitIds.add(unit.unitId)
    if (!Array.isArray(unit.paths) || unit.paths.length === 0 ||
      unit.paths.some((filePath) => !filePaths.has(filePath))) {
      errors.push(`${prefix}:unit_paths_invalid`)
    }
  }

  const expectedUnitIds = new Set(expected?.unitIds ?? [])
  const expectedPaths = new Set(expected?.evidencePaths ?? [])
  for (const unitId of expectedUnitIds) if (!unitIds.has(unitId)) errors.push(`expected_unit_missing:${unitId}`)
  for (const filePath of expectedPaths) if (!filePaths.has(filePath)) errors.push(`expected_evidence_path_missing:${filePath}`)
  if (unitIds.size !== expectedUnitIds.size) errors.push("unexpected_unit_count")
  if (typeof bundle.bundleDigest !== "string" || bundle.bundleDigest !== digestBundle({
    schemaVersion: bundle.schemaVersion,
    sourceProofDigest: bundle.sourceProofDigest,
    units: bundle.units,
    files: bundle.files,
  })) errors.push("bundle_digest_mismatch")

  return {
    valid: errors.length === 0,
    unitCount: units.length,
    fileCount: files.length,
    bundleDigest: typeof bundle.bundleDigest === "string" ? bundle.bundleDigest : null,
    errors,
  }
}

export function compareLegacyRollbackBundle(bundle, currentFiles) {
  const current = new Map(currentFiles.map((file) => [file.path, file.content]))
  const result = { same: [], missing: [], drifted: [] }
  for (const file of Array.isArray(bundle?.files) ? bundle.files : []) {
    if (!current.has(file.path)) result.missing.push(file.path)
    else if (current.get(file.path) !== file.content) result.drifted.push(file.path)
    else result.same.push(file.path)
  }
  return {
    exact: result.missing.length === 0 && result.drifted.length === 0,
    ...result,
  }
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function legacyRemovalProofSourceDigest(proof) {
  return sha256(JSON.stringify({
    schemaVersion: proof?.schemaVersion,
    sourceInventoryDigest: proof?.sourceInventoryDigest,
    compatibilityObligations: proof?.compatibilityObligations,
    units: proof?.units,
    operations: proof?.operations,
  }))
}

function digestBundle(unsigned) {
  return sha256(JSON.stringify(unsigned))
}

function relativePath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("..") && !/^[a-zA-Z]:[\\/]/u.test(value)
}

function invalid(errors) {
  return { valid: false, unitCount: 0, fileCount: 0, bundleDigest: null, errors }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
