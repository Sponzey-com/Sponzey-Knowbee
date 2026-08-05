export const DUPLICATE_ARTIFACT_CATEGORIES = ["implementation", "prompt", "schema", "documentation"] as const
export const TEMPORARY_ARTIFACT_KINDS = ["compatibility_code", "temporary_prompt", "experiment", "backup"] as const
export const TEMPORARY_REMOVAL_CONDITIONS = ["date_reached", "replacement_verified", "experiment_closed", "backup_retention_elapsed"] as const
export const INDIRECT_IMPLEMENTATION_KINDS = ["wrapper", "duplicate_adapter", "hidden_global_state"] as const

export type DuplicateArtifactCategory = typeof DUPLICATE_ARTIFACT_CATEGORIES[number]
export type MaintenanceTemporaryArtifactKind = typeof TEMPORARY_ARTIFACT_KINDS[number]
export type TemporaryRemovalCondition = typeof TEMPORARY_REMOVAL_CONDITIONS[number]
export type IndirectImplementationKind = typeof INDIRECT_IMPLEMENTATION_KINDS[number]

export interface DuplicateArtifactEntry {
  artifactId: string
  role: "canonical" | "duplicate"
  disposition: "retain" | "remove" | "migrate"
  migrationTargetArtifactId?: string
  evidenceRef: string
}

export interface CanonicalArtifactGroupReceipt {
  responsibilityId: string
  category: DuplicateArtifactCategory
  canonicalArtifactId: string
  owner: string
  artifacts: readonly DuplicateArtifactEntry[]
}

export interface TemporaryArtifactLifecycleReceipt {
  artifactId: string
  kind: MaintenanceTemporaryArtifactKind
  owner: string
  createdAt: number
  expiresAt: number
  removalCondition: TemporaryRemovalCondition
  removalConditionSatisfied: boolean
  disposition: "retain" | "remove"
  evidenceRef: string
}

export interface IndirectImplementationAssessment {
  assessmentId: string
  kind: IndirectImplementationKind
  directImplementationSufficient: boolean
  complexityRemoved: number
  duplicationRemoved: number
  standardBoundaryId?: string
  justification: string
  proposedDisposition: "use_direct" | "add_indirection"
  evidenceRef: string
}

export type MaintenanceSimplificationDecision =
  | { status: "authorized"; action: "consolidate" | "remove_temporary" | "retain_temporary" | "use_direct" | "add_indirection"; subjectId: string }
  | { status: "blocked"; reasonCode:
      | "canonical_group_invalid"
      | "canonical_owner_ambiguous"
      | "duplicate_disposition_invalid"
      | "migration_target_invalid"
      | "temporary_lifecycle_invalid"
      | "temporary_expired_but_retained"
      | "temporary_removal_premature"
      | "indirection_assessment_invalid"
      | "hidden_global_state_forbidden"
      | "unnecessary_indirection"; subjectId?: string }

function exact(value: string | undefined): string {
  return value?.trim() ?? ""
}

function blocked(reasonCode: Extract<MaintenanceSimplificationDecision, { status: "blocked" }>["reasonCode"], subjectId?: string): Extract<MaintenanceSimplificationDecision, { status: "blocked" }> {
  return subjectId ? { status: "blocked", reasonCode, subjectId } : { status: "blocked", reasonCode }
}

export function authorizeCanonicalArtifactConsolidation(group: CanonicalArtifactGroupReceipt): MaintenanceSimplificationDecision {
  if (!exact(group.responsibilityId) || !DUPLICATE_ARTIFACT_CATEGORIES.includes(group.category)
    || !exact(group.canonicalArtifactId) || !exact(group.owner) || group.artifacts.length < 2) {
    return blocked("canonical_group_invalid", exact(group.responsibilityId))
  }
  const ids = new Set<string>()
  for (const artifact of group.artifacts) {
    if (!exact(artifact.artifactId) || ids.has(artifact.artifactId) || !exact(artifact.evidenceRef)) {
      return blocked("canonical_group_invalid", artifact.artifactId)
    }
    ids.add(artifact.artifactId)
  }
  const canonical = group.artifacts.filter((artifact) => artifact.role === "canonical")
  if (canonical.length !== 1 || canonical[0]?.artifactId !== group.canonicalArtifactId
    || canonical[0].disposition !== "retain") {
    return blocked("canonical_owner_ambiguous", group.responsibilityId)
  }
  for (const artifact of group.artifacts.filter((entry) => entry.role === "duplicate")) {
    if (artifact.disposition === "retain") return blocked("duplicate_disposition_invalid", artifact.artifactId)
    if (artifact.disposition === "migrate" && artifact.migrationTargetArtifactId !== group.canonicalArtifactId) {
      return blocked("migration_target_invalid", artifact.artifactId)
    }
    if (artifact.disposition === "remove" && exact(artifact.migrationTargetArtifactId)) {
      return blocked("migration_target_invalid", artifact.artifactId)
    }
  }
  return { status: "authorized", action: "consolidate", subjectId: group.responsibilityId }
}

export function authorizeTemporaryArtifactDisposition(input: {
  receipt: TemporaryArtifactLifecycleReceipt
  now: number
}): MaintenanceSimplificationDecision {
  const receipt = input.receipt
  if (!exact(receipt.artifactId) || !TEMPORARY_ARTIFACT_KINDS.includes(receipt.kind) || !exact(receipt.owner)
    || !Number.isSafeInteger(receipt.createdAt) || !Number.isSafeInteger(receipt.expiresAt)
    || receipt.createdAt < 0 || receipt.expiresAt <= receipt.createdAt
    || !TEMPORARY_REMOVAL_CONDITIONS.includes(receipt.removalCondition) || !exact(receipt.evidenceRef)) {
    return blocked("temporary_lifecycle_invalid", exact(receipt.artifactId))
  }
  const removalDue = input.now >= receipt.expiresAt || receipt.removalConditionSatisfied
  if (removalDue && receipt.disposition !== "remove") return blocked("temporary_expired_but_retained", receipt.artifactId)
  if (!removalDue && receipt.disposition === "remove") return blocked("temporary_removal_premature", receipt.artifactId)
  return { status: "authorized", action: removalDue ? "remove_temporary" : "retain_temporary", subjectId: receipt.artifactId }
}

export function authorizeIndirectImplementation(assessment: IndirectImplementationAssessment): MaintenanceSimplificationDecision {
  if (!exact(assessment.assessmentId) || !INDIRECT_IMPLEMENTATION_KINDS.includes(assessment.kind)
    || !Number.isSafeInteger(assessment.complexityRemoved) || assessment.complexityRemoved < 0
    || !Number.isSafeInteger(assessment.duplicationRemoved) || assessment.duplicationRemoved < 0
    || !exact(assessment.justification) || !exact(assessment.evidenceRef)) {
    return blocked("indirection_assessment_invalid", exact(assessment.assessmentId))
  }
  if (assessment.kind === "hidden_global_state" && assessment.proposedDisposition === "add_indirection") {
    return blocked("hidden_global_state_forbidden", assessment.assessmentId)
  }
  if (assessment.proposedDisposition === "use_direct") {
    return { status: "authorized", action: "use_direct", subjectId: assessment.assessmentId }
  }
  const meaningfulBenefit = assessment.complexityRemoved > 0 || assessment.duplicationRemoved > 0 || Boolean(exact(assessment.standardBoundaryId))
  if (assessment.directImplementationSufficient || !meaningfulBenefit) {
    return blocked("unnecessary_indirection", assessment.assessmentId)
  }
  return { status: "authorized", action: "add_indirection", subjectId: assessment.assessmentId }
}

export async function applyMaintenanceSimplification<T>(input: {
  decision: MaintenanceSimplificationDecision
  apply: (authorization: Extract<MaintenanceSimplificationDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "applied"; result: T } | Extract<MaintenanceSimplificationDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "applied", result: await input.apply(input.decision) }
}
