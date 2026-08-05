import { describe, expect, it } from "vitest"

import {
  type ArtifactReferenceBoundary,
  inspectRepositoryArtifact,
} from "../packages/core/src/maintenance/artifact-inventory.js"
import {
  type RepositoryReferenceRecord,
  buildRepositoryReferenceIndex,
  createIndexedReferenceAdapters,
} from "../packages/core/src/maintenance/repository-reference-index.js"

const boundaries: ArtifactReferenceBoundary[] = [
  "runtime",
  "test",
  "registry",
  "migration",
  "deployment",
  "build",
  "retention",
  "ui",
]

describe("task1189 repository reference index", () => {
  it("indexes and deduplicates structured references by target and boundary", async () => {
    const records: RepositoryReferenceRecord[] = boundaries.flatMap((boundary) => [
      {
        boundary,
        targetArtifactId: "packages/core/src/owned.ts",
        owner: `${boundary}:owner`,
        detail: "direct",
      },
      {
        boundary,
        targetArtifactId: "packages/core/src/owned.ts",
        owner: `${boundary}:owner`,
        detail: "direct",
      },
    ])
    const index = buildRepositoryReferenceIndex({
      records,
      scanStatus: Object.fromEntries(
        boundaries.map((boundary) => [boundary, "complete"]),
      ) as Record<ArtifactReferenceBoundary, "complete">,
    })

    const result = await inspectRepositoryArtifact({
      artifact: {
        artifactId: "packages/core/src/owned.ts",
        kind: "source",
        generatedFrom: null,
        retentionReasons: [],
      },
      adapters: createIndexedReferenceAdapters(index),
    })

    expect(result.status).toBe("referenced")
    expect(result.references).toHaveLength(8)
    expect(result.reasonCodes).toEqual(
      boundaries.map((boundary) => `${boundary}_reference_present`),
    )
  })

  it("fails closed when one boundary index is incomplete", async () => {
    const scanStatus = Object.fromEntries(
      boundaries.map((boundary) => [
        boundary,
        boundary === "deployment" ? "incomplete" : "complete",
      ]),
    ) as Record<ArtifactReferenceBoundary, "complete" | "incomplete">
    const index = buildRepositoryReferenceIndex({ records: [], scanStatus })

    const result = await inspectRepositoryArtifact({
      artifact: {
        artifactId: "scripts/unreferenced.mjs",
        kind: "source",
        generatedFrom: null,
        retentionReasons: [],
      },
      adapters: createIndexedReferenceAdapters(index),
    })

    expect(result).toMatchObject({
      status: "unknown",
      reasonCodes: ["deployment_scan_incomplete"],
    })
  })

  it("rejects malformed and out-of-repository reference records", () => {
    expect(() =>
      buildRepositoryReferenceIndex({
        records: [
          {
            boundary: "runtime",
            targetArtifactId: "../secret.txt",
            owner: "packages/core/src/index.ts",
            detail: "import",
          },
        ],
        scanStatus: Object.fromEntries(
          boundaries.map((boundary) => [boundary, "complete"]),
        ) as Record<ArtifactReferenceBoundary, "complete">,
      }),
    ).toThrow("Invalid repository reference record")
  })
})
