export type RepositoryArtifactKind =
  | "source"
  | "prompt"
  | "data"
  | "configuration"
  | "document"
  | "test_fixture"
  | "generated_output"
  | "temporary"
  | "backup"
  | "ui_asset"

export type ArtifactReferenceBoundary =
  | "runtime"
  | "test"
  | "registry"
  | "migration"
  | "deployment"
  | "build"
  | "retention"
  | "ui"

export interface ArtifactReference {
  owner: string
  detail: string
}

export interface ArtifactReferenceScan {
  complete: boolean
  references: ArtifactReference[]
}

export interface RepositoryArtifactEvidence {
  artifactId: string
  kind: RepositoryArtifactKind
  referenceScans: Record<ArtifactReferenceBoundary, ArtifactReferenceScan>
  generatedFrom: string | null
  retentionReasons: string[]
}

export type RepositoryArtifactDescriptor = Pick<
  RepositoryArtifactEvidence,
  "artifactId" | "kind" | "generatedFrom" | "retentionReasons"
>

export type ArtifactReferenceAdapter = (
  artifact: RepositoryArtifactDescriptor,
) => Promise<ArtifactReference[]>

export type ArtifactReferenceAdapters = Record<ArtifactReferenceBoundary, ArtifactReferenceAdapter>

export type RepositoryArtifactStatus =
  | "referenced"
  | "generated"
  | "retained"
  | "candidate"
  | "unknown"

export interface ClassifiedArtifactReference extends ArtifactReference {
  boundary: ArtifactReferenceBoundary
}

export interface RepositoryArtifactClassification {
  artifactId: string
  kind: RepositoryArtifactKind
  status: RepositoryArtifactStatus
  reasonCodes: string[]
  references: ClassifiedArtifactReference[]
}

const REFERENCE_BOUNDARIES: readonly ArtifactReferenceBoundary[] = [
  "runtime",
  "test",
  "registry",
  "migration",
  "deployment",
  "build",
  "retention",
  "ui",
]

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|css|html|sh|bat|ps1)$/u
const UI_ASSET_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf)$/u

function repositoryRetentionReasons(artifactId: string): string[] {
  if (artifactId === "source.md" || artifactId.endsWith("/source.md")) {
    return ["architecture_source_of_truth"]
  }
  if (artifactId === "packages/webui/src/assets/orchestration/README.md") {
    return ["ui_asset_governance_source_of_truth"]
  }
  return []
}

function generatedSourcePath(artifactId: string): string | null {
  if (!artifactId.startsWith("packages/core/src/")) return null
  if (artifactId.endsWith(".d.ts.map")) return `${artifactId.slice(0, -9)}.ts`
  if (artifactId.endsWith(".js.map")) return `${artifactId.slice(0, -7)}.ts`
  if (artifactId.endsWith(".d.ts")) return `${artifactId.slice(0, -5)}.ts`
  if (artifactId.endsWith(".js")) return `${artifactId.slice(0, -3)}.ts`
  return null
}

export function describeRepositoryArtifact(
  rawArtifactId: string,
): RepositoryArtifactDescriptor | undefined {
  const artifactId = rawArtifactId.replaceAll("\\", "/").replace(/^\.\//u, "")
  if (!artifactId || artifactId.startsWith("/") || artifactId.split("/").includes(".."))
    return undefined
  if (
    artifactId === ".git" ||
    artifactId.startsWith(".git/") ||
    artifactId === "node_modules" ||
    artifactId.includes("/node_modules/")
  )
    return undefined

  let kind: RepositoryArtifactKind | undefined
  let generatedFrom: string | null = null
  const generatedSource = generatedSourcePath(artifactId)
  if (artifactId === ".temp" || artifactId.startsWith(".temp/") || artifactId.includes("/.temp/")) {
    kind = "temporary"
  } else if (
    artifactId === "backups" ||
    artifactId.startsWith("backups/") ||
    artifactId.includes("/backups/")
  ) {
    kind = "backup"
  } else if (artifactId.startsWith("prompts/") && artifactId.endsWith(".md")) {
    kind = "prompt"
  } else if (
    /\.(?:db|sqlite|sqlite3)$/u.test(artifactId) ||
    /(?:^|\/)(?:data|datasets)\/[^/]+\.(?:json|jsonl|csv|tsv)$/u.test(artifactId)
  ) {
    kind = "data"
  } else if (
    /(?:^|\/)(?:package\.json|tsconfig(?:\.[^/]+)?\.json|biome\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/u.test(
      artifactId,
    )
  ) {
    kind = "configuration"
  } else if (
    (artifactId.startsWith("docs/") && /\.(?:md|json)$/u.test(artifactId)) ||
    (artifactId.startsWith("packages/") && artifactId.endsWith(".md")) ||
    (artifactId.startsWith("scripts/") && artifactId.endsWith(".md")) ||
    (artifactId.startsWith("tests/") && artifactId.endsWith(".md")) ||
    /^(?:README(?:\.[^.]+)?|AGENTS|PROJECT|CHANGELOG|CONTRIBUTING|LICENSE)\.md$/u.test(artifactId)
  ) {
    kind = "document"
  } else if (artifactId.startsWith("tests/fixtures/")) {
    kind = "test_fixture"
  } else if (artifactId === "packages/core/src/.tsbuildinfo") {
    kind = "generated_output"
    generatedFrom = "packages/core/tsconfig.json"
  } else if (generatedSource !== null) {
    kind = "generated_output"
    generatedFrom = generatedSource
  } else if (artifactId.startsWith("packages/webui/") && UI_ASSET_EXTENSIONS.test(artifactId)) {
    kind = "ui_asset"
  } else if (
    SOURCE_EXTENSIONS.test(artifactId) &&
    (artifactId.startsWith("packages/") ||
      artifactId.startsWith("scripts/") ||
      artifactId.startsWith("tests/"))
  ) {
    kind = "source"
  }

  if (!kind) return undefined
  return {
    artifactId,
    kind,
    generatedFrom,
    retentionReasons: repositoryRetentionReasons(artifactId),
  }
}

export function classifyRepositoryArtifact(
  evidence: RepositoryArtifactEvidence,
): RepositoryArtifactClassification {
  const incomplete = REFERENCE_BOUNDARIES.filter(
    (boundary) => !evidence.referenceScans[boundary].complete,
  )
  if (incomplete.length > 0) {
    return {
      artifactId: evidence.artifactId,
      kind: evidence.kind,
      status: "unknown",
      reasonCodes: incomplete.map((boundary) => `${boundary}_scan_incomplete`),
      references: [],
    }
  }

  const references = REFERENCE_BOUNDARIES.flatMap((boundary) =>
    evidence.referenceScans[boundary].references.map((reference) => ({
      boundary,
      ...reference,
    })),
  )
  if (references.length > 0) {
    const referencedBoundaries = REFERENCE_BOUNDARIES.filter(
      (boundary) => evidence.referenceScans[boundary].references.length > 0,
    )
    return {
      artifactId: evidence.artifactId,
      kind: evidence.kind,
      status: "referenced",
      reasonCodes: referencedBoundaries.map((boundary) => `${boundary}_reference_present`),
      references,
    }
  }

  if (evidence.generatedFrom) {
    return {
      artifactId: evidence.artifactId,
      kind: evidence.kind,
      status: "generated",
      reasonCodes: ["generated_source_present"],
      references: [],
    }
  }

  if (evidence.retentionReasons.length > 0) {
    return {
      artifactId: evidence.artifactId,
      kind: evidence.kind,
      status: "retained",
      reasonCodes: ["retention_reason_present"],
      references: [],
    }
  }

  return {
    artifactId: evidence.artifactId,
    kind: evidence.kind,
    status: "candidate",
    reasonCodes: ["all_reference_scans_clear"],
    references: [],
  }
}

export async function inspectRepositoryArtifact(input: {
  artifact: RepositoryArtifactDescriptor
  adapters: ArtifactReferenceAdapters
}): Promise<RepositoryArtifactClassification> {
  const referenceScans = {} as Record<ArtifactReferenceBoundary, ArtifactReferenceScan>
  for (const boundary of REFERENCE_BOUNDARIES) {
    try {
      referenceScans[boundary] = {
        complete: true,
        references: await input.adapters[boundary](input.artifact),
      }
    } catch {
      referenceScans[boundary] = { complete: false, references: [] }
    }
  }

  return classifyRepositoryArtifact({
    ...input.artifact,
    referenceScans,
  })
}
