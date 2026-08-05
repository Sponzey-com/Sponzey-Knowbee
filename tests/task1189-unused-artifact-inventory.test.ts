import { readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  type ArtifactReferenceAdapter,
  type RepositoryArtifactEvidence,
  classifyRepositoryArtifact,
  describeRepositoryArtifact,
  inspectRepositoryArtifact,
} from "../packages/core/src/maintenance/artifact-inventory.js"
import { listPromptSourceDefinitions } from "../packages/core/src/memory/knowbee-md.js"

const completeEvidence = (
  overrides: Partial<RepositoryArtifactEvidence> = {},
): RepositoryArtifactEvidence => ({
  artifactId: "packages/core/src/unused.ts",
  kind: "source",
  referenceScans: {
    runtime: { complete: true, references: [] },
    test: { complete: true, references: [] },
    registry: { complete: true, references: [] },
    migration: { complete: true, references: [] },
    deployment: { complete: true, references: [] },
    build: { complete: true, references: [] },
    retention: { complete: true, references: [] },
    ui: { complete: true, references: [] },
  },
  generatedFrom: null,
  retentionReasons: [],
  ...overrides,
})

describe("task1189 unused artifact inventory", () => {
  it("classifies an unreferenced artifact as a review candidate only after every scan completes", () => {
    expect(classifyRepositoryArtifact(completeEvidence())).toEqual({
      artifactId: "packages/core/src/unused.ts",
      kind: "source",
      status: "candidate",
      reasonCodes: ["all_reference_scans_clear"],
      references: [],
    })
  })

  it.each([
    "runtime",
    "test",
    "registry",
    "migration",
    "deployment",
    "build",
    "retention",
    "ui",
  ] as const)("fails closed when the %s reference scan is incomplete", (scan) => {
    const evidence = completeEvidence()
    evidence.referenceScans[scan] = { complete: false, references: [] }

    expect(classifyRepositoryArtifact(evidence)).toMatchObject({
      status: "unknown",
      reasonCodes: [`${scan}_scan_incomplete`],
    })
  })

  it.each([
    "runtime",
    "test",
    "registry",
    "migration",
    "deployment",
    "build",
    "retention",
    "ui",
  ] as const)("protects an artifact referenced by the %s boundary", (scan) => {
    const evidence = completeEvidence()
    evidence.referenceScans[scan] = {
      complete: true,
      references: [{ owner: `${scan}:owner`, detail: "direct" }],
    }

    expect(classifyRepositoryArtifact(evidence)).toMatchObject({
      status: "referenced",
      reasonCodes: [`${scan}_reference_present`],
      references: [{ boundary: scan, owner: `${scan}:owner`, detail: "direct" }],
    })
  })

  it("separates generated and retained artifacts from deletion candidates", () => {
    expect(
      classifyRepositoryArtifact(
        completeEvidence({
          kind: "generated_output",
          generatedFrom: "packages/core/src/owned.ts",
        }),
      ),
    ).toMatchObject({
      status: "generated",
      reasonCodes: ["generated_source_present"],
    })

    expect(
      classifyRepositoryArtifact(
        completeEvidence({
          kind: "backup",
          retentionReasons: ["rollback window is active"],
        }),
      ),
    ).toMatchObject({
      status: "retained",
      reasonCodes: ["retention_reason_present"],
    })
  })

  it("collects all reference boundaries through explicit adapters", async () => {
    const calls: string[] = []
    const adapter =
      (boundary: string): ArtifactReferenceAdapter =>
      async (artifact) => {
        calls.push(`${boundary}:${artifact.artifactId}`)
        return boundary === "registry"
          ? [{ owner: "prompts/registry.json", detail: "sourceId=identity" }]
          : []
      }

    const result = await inspectRepositoryArtifact({
      artifact: {
        artifactId: "prompts/identity.md",
        kind: "prompt",
        generatedFrom: null,
        retentionReasons: [],
      },
      adapters: {
        runtime: adapter("runtime"),
        test: adapter("test"),
        registry: adapter("registry"),
        migration: adapter("migration"),
        deployment: adapter("deployment"),
        build: adapter("build"),
        retention: adapter("retention"),
        ui: adapter("ui"),
      },
    })

    expect(calls).toEqual([
      "runtime:prompts/identity.md",
      "test:prompts/identity.md",
      "registry:prompts/identity.md",
      "migration:prompts/identity.md",
      "deployment:prompts/identity.md",
      "build:prompts/identity.md",
      "retention:prompts/identity.md",
      "ui:prompts/identity.md",
    ])
    expect(result).toMatchObject({
      status: "referenced",
      reasonCodes: ["registry_reference_present"],
    })
  })

  it("marks only the failed adapter incomplete and does not produce a deletion candidate", async () => {
    const empty: ArtifactReferenceAdapter = async () => []
    const result = await inspectRepositoryArtifact({
      artifact: {
        artifactId: "assets/unknown.bin",
        kind: "ui_asset",
        generatedFrom: null,
        retentionReasons: [],
      },
      adapters: {
        runtime: empty,
        test: empty,
        registry: async () => {
          throw new Error("registry unavailable")
        },
        migration: empty,
        deployment: empty,
        build: empty,
        retention: empty,
        ui: empty,
      },
    })

    expect(result).toEqual({
      artifactId: "assets/unknown.bin",
      kind: "ui_asset",
      status: "unknown",
      reasonCodes: ["registry_scan_incomplete"],
      references: [],
    })
  })

  it("keeps every prompt file registered and every English definition file-backed", () => {
    const definitions = listPromptSourceDefinitions()
    const registered = new Set(
      definitions.flatMap((definition) => [definition.filenames.en, definition.filenames.ko]),
    )
    const promptFiles = readdirSync("prompts").filter((file) => file.endsWith(".md"))

    expect(promptFiles.filter((file) => !registered.has(file))).toEqual([])
    expect(
      definitions
        .map((definition) => definition.filenames.en)
        .filter((file) => !promptFiles.includes(file)),
    ).toEqual([])
  })

  it.each([
    ["packages/core/src/api/server.ts", "source", null, []],
    ["prompts/identity.md", "prompt", null, []],
    ["packages/core/data/defaults.json", "data", null, []],
    ["runtime/state.sqlite", "data", null, []],
    ["package.json", "configuration", null, []],
    ["docs/release-runbook.md", "document", null, []],
    ["packages/core/src/source.md", "document", null, ["architecture_source_of_truth"]],
    [
      "packages/webui/src/assets/orchestration/README.md",
      "document",
      null,
      ["ui_asset_governance_source_of_truth"],
    ],
    ["tests/fixtures/sample.json", "test_fixture", null, []],
    ["packages/core/src/api/server.js", "generated_output", "packages/core/src/api/server.ts", []],
    ["packages/core/src/.tsbuildinfo", "generated_output", "packages/core/tsconfig.json", []],
    [".temp/scan.json", "temporary", null, []],
    ["backups/config.json", "backup", null, []],
    ["packages/webui/src/assets/logo.png", "ui_asset", null, []],
    ["packages/webui/index.html", "source", null, []],
    ["packages/webui/src/index.css", "source", null, []],
  ] as const)("classifies %s as %s", (artifactId, kind, generatedFrom, retentionReasons) => {
    expect(describeRepositoryArtifact(artifactId)).toEqual({
      artifactId,
      kind,
      generatedFrom,
      retentionReasons,
    })
  })

  it("returns no descriptor for paths outside the governed inventory", () => {
    expect(describeRepositoryArtifact("node_modules/pkg/index.js")).toBeUndefined()
    expect(describeRepositoryArtifact(".git/objects/00/abc")).toBeUndefined()
  })
})
