export type NonCanonicalArtifactDisposition =
  | { kind: "remove" }
  | { kind: "migrate"; targetArtifactId: string; migrationEvidenceRefs: string[] }
  | { kind: "retain_with_expiry"; owner: string; expiryCondition: string }

export interface ArtifactPurposeOwner {
  artifactId: string
  canonical: boolean
  activeConsumerIds: string[]
  disposition?: NonCanonicalArtifactDisposition
}

export interface ArtifactOwnerMigration {
  artifactId: string
  targetArtifactId: string
  migrationEvidenceRefs: string[]
}

export interface ArtifactOwnerRetention {
  artifactId: string
  owner: string
  expiryCondition: string
}

export interface ArtifactOwnerConsolidationDecision {
  status: "eligible"
  purposeId: string
  snapshotVersion: string
  canonicalArtifactId: string
  removals: string[]
  migrations: ArtifactOwnerMigration[]
  retentions: ArtifactOwnerRetention[]
}

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function unique(values: string[], field: string): string[] {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length)
    throw new Error(`${field} values must be unique.`)
  return normalized
}

export function evaluateArtifactOwnerConsolidation(input: {
  purposeId: string
  snapshotVersion: string
  owners: ArtifactPurposeOwner[]
}): ArtifactOwnerConsolidationDecision {
  const purposeId = required(input.purposeId, "Purpose ID")
  const snapshotVersion = required(input.snapshotVersion, "Snapshot version")
  const artifactIds = unique(
    input.owners.map((owner) => owner.artifactId),
    "Artifact ID",
  )
  const canonicalOwners = input.owners.filter((owner) => owner.canonical)
  if (canonicalOwners.length !== 1)
    throw new Error("A purpose must have exactly one canonical artifact owner.")
  const canonicalOwner = canonicalOwners[0]
  if (!canonicalOwner) throw new Error("A purpose must have exactly one canonical artifact owner.")
  const canonicalArtifactId = required(canonicalOwner.artifactId, "Canonical artifact ID")
  const removals: string[] = []
  const migrations: ArtifactOwnerMigration[] = []
  const retentions: ArtifactOwnerRetention[] = []

  for (const owner of input.owners) {
    const artifactId = required(owner.artifactId, "Artifact ID")
    const activeConsumerIds = unique(owner.activeConsumerIds, "Active consumer ID")
    if (owner.canonical) {
      if (owner.disposition)
        throw new Error("Canonical artifact owner cannot have a removal disposition.")
      continue
    }
    const disposition = owner.disposition
    if (!disposition)
      throw new Error(`Non-canonical artifact ${artifactId} requires a disposition.`)
    if (disposition.kind === "remove") {
      if (activeConsumerIds.length > 0)
        throw new Error("An artifact with an active consumer cannot be removed.")
      removals.push(artifactId)
      continue
    }
    if (disposition.kind === "migrate") {
      const targetArtifactId = required(
        disposition.targetArtifactId,
        "Migration target artifact ID",
      )
      if (targetArtifactId !== canonicalArtifactId || !artifactIds.includes(targetArtifactId)) {
        throw new Error("Migration target must be the canonical artifact owner.")
      }
      const migrationEvidenceRefs = unique(
        disposition.migrationEvidenceRefs,
        "Migration evidence reference",
      )
      if (migrationEvidenceRefs.length === 0) throw new Error("Migration evidence is required.")
      migrations.push({ artifactId, targetArtifactId, migrationEvidenceRefs })
      continue
    }
    retentions.push({
      artifactId,
      owner: required(disposition.owner, "Retention owner"),
      expiryCondition: required(disposition.expiryCondition, "Retention expiry condition"),
    })
  }

  return {
    status: "eligible",
    purposeId,
    snapshotVersion,
    canonicalArtifactId,
    removals,
    migrations,
    retentions,
  }
}

export async function applyArtifactOwnerConsolidation(input: {
  decision: ArtifactOwnerConsolidationDecision
  migrate: (migration: ArtifactOwnerMigration) => Promise<void>
  remove: (artifactId: string) => Promise<void>
}): Promise<{ status: "applied"; migrated: number; removed: number }> {
  for (const migration of input.decision.migrations) await input.migrate(migration)
  for (const artifactId of input.decision.removals) await input.remove(artifactId)
  return {
    status: "applied",
    migrated: input.decision.migrations.length,
    removed: input.decision.removals.length,
  }
}
