export type TemporaryArtifactKind = "stable" | "temporary_compatibility" | "experiment" | "backup"

export interface LifecycleConditionReceipt {
  conditionId: string
  satisfied: boolean
  evidenceRefs: string[]
}

export type ExpiryDisposition =
  | { kind: "remove" }
  | { kind: "renew"; nextLifecycleVersion: string; approvalEvidenceRefs: string[] }

export interface TemporaryArtifactLifecycleManifest {
  artifactId: string
  kind: TemporaryArtifactKind
  ownerId?: string
  createdVersion?: string
  expiryCondition?: LifecycleConditionReceipt
  removalCondition?: LifecycleConditionReceipt
  activeConsumerIds: string[]
  expiryDisposition?: ExpiryDisposition
}

export type TemporaryArtifactLifecycleDecision =
  | { status: "stable"; artifactId: string }
  | { status: "active"; artifactId: string; ownerId: string }
  | { status: "renewed"; artifactId: string; ownerId: string; nextLifecycleVersion: string }
  | { status: "removal_eligible"; artifactId: string; ownerId: string }

function required(value: string | undefined, field: string): string {
  const normalized = value?.trim() ?? ""
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function unique(values: string[], field: string): string[] {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length)
    throw new Error(`${field} values must be unique.`)
  return normalized
}

function condition(
  input: LifecycleConditionReceipt | undefined,
  field: string,
): LifecycleConditionReceipt {
  if (!input) throw new Error(`${field} is required.`)
  const conditionId = required(input.conditionId, `${field} ID`)
  const evidenceRefs = unique(input.evidenceRefs, `${field} evidence`)
  if (evidenceRefs.length === 0) throw new Error(`${field} evidence is required.`)
  return { conditionId, satisfied: input.satisfied, evidenceRefs }
}

export function evaluateTemporaryArtifactLifecycle(
  input: TemporaryArtifactLifecycleManifest,
): TemporaryArtifactLifecycleDecision {
  const artifactId = required(input.artifactId, "Artifact ID")
  unique(input.activeConsumerIds, "Active consumer ID")
  if (input.kind === "stable") return { status: "stable", artifactId }

  const ownerId = required(input.ownerId, "Owner ID")
  required(input.createdVersion, "Created version")
  const expiry = condition(input.expiryCondition, "Expiry condition")
  const removal = condition(input.removalCondition, "Removal condition")
  if (!expiry.satisfied) return { status: "active", artifactId, ownerId }

  const disposition = input.expiryDisposition
  if (!disposition) throw new Error("An expired artifact requires an expiry disposition.")
  if (disposition.kind === "renew") {
    const nextLifecycleVersion = required(
      disposition.nextLifecycleVersion,
      "Next lifecycle version",
    )
    const approval = unique(disposition.approvalEvidenceRefs, "Renewal approval evidence")
    if (approval.length === 0) throw new Error("Renewal approval evidence is required.")
    return { status: "renewed", artifactId, ownerId, nextLifecycleVersion }
  }
  if (!removal.satisfied) throw new Error("Expired artifact removal condition is not satisfied.")
  if (input.activeConsumerIds.length > 0)
    throw new Error("Expired artifact still has an active consumer.")
  return { status: "removal_eligible", artifactId, ownerId }
}

export async function applyTemporaryArtifactLifecycleDecision(input: {
  decision: TemporaryArtifactLifecycleDecision
  remove: (artifactId: string) => Promise<void>
}): Promise<TemporaryArtifactLifecycleDecision | { status: "removed"; artifactId: string }> {
  if (input.decision.status !== "removal_eligible") return input.decision
  await input.remove(input.decision.artifactId)
  return { status: "removed", artifactId: input.decision.artifactId }
}
