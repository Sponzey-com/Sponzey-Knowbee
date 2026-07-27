import { describe, expect, it } from "vitest"

import {
  type ArtifactReferenceBoundary,
  describeRepositoryArtifact,
  inspectRepositoryArtifact,
} from "../packages/core/src/maintenance/artifact-inventory.js"
import {
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

describe("task1252 complete artifact and reference coverage", () => {
  it("classifies durable data separately from source and configuration", () => {
    expect(describeRepositoryArtifact("packages/core/data/catalog.json")?.kind).toBe("data")
    expect(describeRepositoryArtifact("runtime/knowbee.sqlite")?.kind).toBe("data")
  })

  it.each(boundaries)("fails closed when the %s boundary is incomplete", async (incomplete) => {
    const scanStatus = Object.fromEntries(
      boundaries.map((boundary) => [boundary, boundary === incomplete ? "incomplete" : "complete"]),
    ) as Record<ArtifactReferenceBoundary, "complete" | "incomplete">
    const result = await inspectRepositoryArtifact({
      artifact: {
        artifactId: "packages/core/data/catalog.json",
        kind: "data",
        generatedFrom: null,
        retentionReasons: [],
      },
      adapters: createIndexedReferenceAdapters(
        buildRepositoryReferenceIndex({ records: [], scanStatus }),
      ),
    })
    expect(result).toMatchObject({
      status: "unknown",
      reasonCodes: [`${incomplete}_scan_incomplete`],
    })
  })

  it.each(["retention", "ui"] as const)(
    "protects a candidate referenced by the %s boundary",
    async (boundary) => {
      const scanStatus = Object.fromEntries(boundaries.map((item) => [item, "complete"])) as Record<
        ArtifactReferenceBoundary,
        "complete"
      >
      const result = await inspectRepositoryArtifact({
        artifact: {
          artifactId: "packages/webui/src/assets/legacy.png",
          kind: "ui_asset",
          generatedFrom: null,
          retentionReasons: [],
        },
        adapters: createIndexedReferenceAdapters(
          buildRepositoryReferenceIndex({
            scanStatus,
            records: [
              {
                boundary,
                targetArtifactId: "packages/webui/src/assets/legacy.png",
                owner: `${boundary}:owner`,
                detail: "active",
              },
            ],
          }),
        ),
      })
      expect(result).toMatchObject({
        status: "referenced",
        reasonCodes: [`${boundary}_reference_present`],
      })
    },
  )
})
