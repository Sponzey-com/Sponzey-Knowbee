#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { inspectRepositoryArtifact } from "../packages/core/src/maintenance/artifact-inventory.js"
import { collectRepositoryArtifactInventory } from "../packages/core/src/maintenance/repository-filesystem-inventory.js"
import {
  buildRepositoryReferenceIndex,
  createIndexedReferenceAdapters,
} from "../packages/core/src/maintenance/repository-reference-index.js"
import { listPromptSourceDefinitions } from "../packages/core/src/memory/knowbee-md.js"
import {
  scanDirectoryDiscoveryReferences,
  scanExactRepositoryLiteralReferences,
  scanFilesystemLiteralReferences,
  scanHtmlReferences,
  scanMarkdownReferences,
  scanPackageManifestReferences,
  scanPromptRegistryReferences,
  scanShellReferences,
  scanTsConfigReferences,
  scanTypeScriptReferences,
  scanWorkspaceOwnershipReferences,
} from "./lib/repository-reference-scanner.mjs"

const BOUNDARIES = [
  "runtime",
  "test",
  "registry",
  "migration",
  "deployment",
  "build",
  "retention",
  "ui",
]

export function decideRepositoryArtifactAuditCompletion(input) {
  return (
    input.inventoryComplete &&
    input.scansComplete &&
    input.counts.unknown === 0 &&
    input.counts.candidate === 0
  )
}

export async function auditRepositoryArtifacts(repositoryRoot) {
  const inventory = collectRepositoryArtifactInventory({ repositoryRoot })
  const artifactIds = inventory.artifacts.map((artifact) => artifact.artifactId)
  const documents = artifactIds
    .filter((artifactId) => artifactId.endsWith(".html"))
    .map((owner) => ({ owner, content: readFileSync(join(repositoryRoot, owner), "utf8") }))
  const scans = [
    ["typescript", scanTypeScriptReferences({ repositoryRoot, artifactIds })],
    ["package_manifest", scanPackageManifestReferences({ repositoryRoot, artifactIds })],
    [
      "prompt_registry",
      scanPromptRegistryReferences({ artifactIds, definitions: listPromptSourceDefinitions() }),
    ],
    ["tsconfig", scanTsConfigReferences({ repositoryRoot, artifactIds })],
    ["filesystem_literal", scanFilesystemLiteralReferences({ repositoryRoot, artifactIds })],
    ["markdown", scanMarkdownReferences({ repositoryRoot, artifactIds })],
    ["shell", scanShellReferences({ repositoryRoot, artifactIds })],
    ["html", scanHtmlReferences({ artifactIds, documents })],
    ["exact_literal", scanExactRepositoryLiteralReferences({ repositoryRoot, artifactIds })],
    ["directory_discovery", scanDirectoryDiscoveryReferences({ repositoryRoot, artifactIds })],
    ["workspace", scanWorkspaceOwnershipReferences({ repositoryRoot, artifactIds })],
  ]
  const scansComplete = scans.every(([, scan]) => scan.complete)
  const scannedRecords = scans.flatMap(([, scan]) => scan.records)
  const retentionRecords = inventory.artifacts.flatMap((artifact) =>
    artifact.retentionReasons.map((reason) => ({
      boundary: "retention",
      targetArtifactId: artifact.artifactId,
      owner: "repository-retention-policy",
      detail: reason,
    })),
  )
  const uiRecords = scannedRecords
    .filter(
      (record) => record.owner.startsWith("packages/webui/") || record.owner.endsWith(".html"),
    )
    .map((record) => ({ ...record, boundary: "ui", detail: `ui:${record.detail}` }))
  const scanStatus = Object.fromEntries(
    BOUNDARIES.map((boundary) => [
      boundary,
      inventory.complete && scansComplete ? "complete" : "incomplete",
    ]),
  )
  const index = buildRepositoryReferenceIndex({
    records: [...scannedRecords, ...retentionRecords, ...uiRecords],
    scanStatus,
  })
  const adapters = createIndexedReferenceAdapters(index)
  const classifications = await Promise.all(
    inventory.artifacts.map((artifact) => inspectRepositoryArtifact({ artifact, adapters })),
  )
  const counts = Object.fromEntries(
    ["referenced", "generated", "retained", "candidate", "unknown"].map((status) => [
      status,
      classifications.filter((item) => item.status === status).length,
    ]),
  )
  const complete = decideRepositoryArtifactAuditCompletion({
    inventoryComplete: inventory.complete,
    scansComplete,
    counts,
  })

  return {
    complete,
    artifactCount: inventory.artifacts.length,
    referenceCount: index.records.length,
    counts,
    candidates: classifications
      .filter((item) => item.status === "candidate")
      .map((item) => ({ artifactId: item.artifactId, kind: item.kind })),
    diagnostics: [
      ...inventory.diagnostics.map((diagnostic) => ({ scanner: "inventory", ...diagnostic })),
      ...scans.flatMap(([scanner, scan]) =>
        scan.diagnostics.map((diagnostic) => ({ scanner, ...diagnostic })),
      ),
    ],
    scanners: Object.fromEntries(
      scans.map(([name, scan]) => [
        name,
        {
          complete: scan.complete,
          referenceCount: scan.records.length,
          diagnosticCount: scan.diagnostics.length,
        },
      ]),
    ),
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  )
  const result = await auditRepositoryArtifacts(repositoryRoot)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.complete) process.exitCode = 1
}
