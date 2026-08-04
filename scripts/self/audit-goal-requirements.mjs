#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  auditGoalRequirementMatrix,
  createGoalRequirementSkeleton,
  extractGoalNormativeClauses,
  verifyGoalEvidenceOwners,
} from "../../packages/core/src/maintenance/goal-requirement-audit.js"
import {
  auditGoalOwnership,
} from "../../packages/core/src/maintenance/goal-ownership.js"

function resolveRepositoryPath(repositoryRoot, path) {
  return isAbsolute(path) ? path : join(repositoryRoot, path)
}

function readEvidenceCatalog(repositoryRoot, evidencePath) {
  const parsed = JSON.parse(
    readFileSync(resolveRepositoryPath(repositoryRoot, evidencePath), "utf8"),
  )
  if (parsed?.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
    throw new Error("goal evidence catalog must use schemaVersion 1 and contain entries")
  }
  return parsed
}

export function auditGoalRequirements(input) {
  const repositoryRoot = resolve(input.repositoryRoot)
  const goal = readFileSync(resolveRepositoryPath(repositoryRoot, input.goalPath), "utf8")
  const catalog = readEvidenceCatalog(repositoryRoot, input.evidencePath)
  const inventory = extractGoalNormativeClauses(goal)
  const ownership = auditGoalOwnership({
    goalMarkdown: goal,
    artifactExists: (artifact) => {
      try {
        readFileSync(resolveRepositoryPath(repositoryRoot, artifact), "utf8")
        return true
      } catch {
        return false
      }
    },
  })
  const recordsById = new Map(
    createGoalRequirementSkeleton(inventory.clauses).map((record) => [
      record.requirementId,
      record,
    ]),
  )
  const unknownRequirementIds = Object.keys(catalog.entries)
    .filter((requirementId) => !recordsById.has(requirementId))
    .sort()
  if (unknownRequirementIds.length > 0) {
    throw new Error(`unknown requirement IDs: ${unknownRequirementIds.join(", ")}`)
  }

  const records = [...recordsById.values()].map((record) => {
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
        return readFileSync(resolveRepositoryPath(repositoryRoot, owner), "utf8")
      } catch {
        return undefined
      }
    },
  })

  return {
    schemaVersion: 1,
    goalSha256: createHash("sha256").update(goal).digest("hex"),
    inventory,
    ownership,
    records,
    audit,
    evidenceVerification,
  }
}

function parseCliArguments(argv) {
  const values = [...argv]
  const repositoryRoot = resolve(
    values.shift() ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
  )
  let outputPath = ""
  if (values[0] === "--output") {
    values.shift()
    outputPath = values.shift() ?? ""
  }
  if (values.length > 0 || (argv.includes("--output") && !outputPath)) {
    throw new Error("usage: audit-goal-requirements.mjs [repository-root] [--output output-path]")
  }
  return { repositoryRoot, outputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { repositoryRoot, outputPath } = parseCliArguments(process.argv.slice(2))
    const result = auditGoalRequirements({
      repositoryRoot,
      goalPath: ".tasks/phase001/goal.md",
      evidencePath: ".tasks/phase001/goal-requirement-evidence.json",
    })
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (outputPath) writeFileSync(resolveRepositoryPath(repositoryRoot, outputPath), serialized)
    else process.stdout.write(serialized)
    if (
      !result.inventory.complete ||
      !result.ownership.complete ||
      !result.evidenceVerification.complete ||
      result.audit.diagnostics.length > 0
    ) {
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
