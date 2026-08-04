#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  auditGoalRequirementMatrix,
  createProjectRequirementSkeleton,
  extractProjectNormativeClauses,
  verifyGoalEvidenceOwners,
} from "../../packages/core/src/maintenance/goal-requirement-audit.js"
import { auditProjectEvidenceClaims } from "../../packages/core/src/maintenance/project-evidence-integrity.js"

export const DEFAULT_PROJECT_EVIDENCE_PATH = "docs/audit/project-requirement-evidence.json"

function repositoryPath(root, path) {
  return isAbsolute(path) ? path : join(root, path)
}

export function auditProjectRequirements(input) {
  const repositoryRoot = resolve(input.repositoryRoot)
  const document = readFileSync(repositoryPath(repositoryRoot, input.documentPath), "utf8")
  const catalog = JSON.parse(
    readFileSync(repositoryPath(repositoryRoot, input.evidencePath), "utf8"),
  )
  if (catalog?.schemaVersion !== 1 || catalog?.documentKind !== "project" || !catalog.entries) {
    throw new Error("PROJECT evidence catalog must use schemaVersion 1 and documentKind project")
  }
  const inventory = extractProjectNormativeClauses(document)
  const skeleton = createProjectRequirementSkeleton(inventory.clauses)
  const known = new Set(skeleton.map((record) => record.requirementId))
  const unknown = Object.keys(catalog.entries)
    .filter((id) => !known.has(id))
    .sort()
  if (unknown.length) throw new Error(`unknown PROJECT requirement IDs: ${unknown.join(", ")}`)
  const records = skeleton.map((record) => {
    const evidence = catalog.entries[record.requirementId]
    return evidence
      ? {
          ...record,
          requiredScopes: evidence.requiredScopes ?? [],
          evidence: evidence.evidence ?? [],
        }
      : record
  })
  const audit = auditGoalRequirementMatrix({
    normativeClauses: inventory.clauses.map((clause) => clause.clauseId),
    records,
  })
  const evidenceVerification = verifyGoalEvidenceOwners({
    records,
    readOwner(owner) {
      try {
        return readFileSync(repositoryPath(repositoryRoot, owner), "utf8")
      } catch {
        return undefined
      }
    },
  })
  const claimVerification = auditProjectEvidenceClaims({
    requirements: skeleton,
    entries: catalog.entries,
  })
  return {
    kind: "knowbee.requirements.project_audit",
    schemaVersion: 1,
    documentKind: "project",
    documentSha256: createHash("sha256").update(document).digest("hex"),
    inventory,
    records,
    audit,
    claimVerification,
    evidenceVerification,
  }
}

function parseArguments(argv) {
  const options = {
    repositoryRoot: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
    documentPath: "PROJECT.md",
    evidencePath: DEFAULT_PROJECT_EVIDENCE_PATH,
    outputPath: "",
  }
  const values = [...argv]
  while (values.length) {
    const option = values.shift()
    const value = values.shift()
    if (!value) throw new Error(`missing value for ${option ?? "argument"}`)
    if (option === "--repository") options.repositoryRoot = value
    else if (option === "--document") options.documentPath = value
    else if (option === "--evidence") options.evidencePath = value
    else if (option === "--output") options.outputPath = value
    else throw new Error(`unknown option: ${option}`)
  }
  return options
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const result = auditProjectRequirements(options)
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (options.outputPath)
      writeFileSync(repositoryPath(resolve(options.repositoryRoot), options.outputPath), serialized)
    else process.stdout.write(serialized)
    if (
      !result.inventory.complete ||
      !result.audit.complete ||
      !result.claimVerification.complete ||
      !result.evidenceVerification.complete
    )
      process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
