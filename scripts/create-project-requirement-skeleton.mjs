#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  createProjectRequirementSkeleton,
  extractProjectNormativeClauses,
} from "../packages/core/src/maintenance/goal-requirement-audit.js"
import { projectObligationChecksum } from "../packages/core/src/maintenance/project-evidence-integrity.js"

function repositoryPath(root, path) {
  return isAbsolute(path) ? path : join(root, path)
}

export function createProjectRequirementEvidenceSkeleton(input) {
  const root = resolve(input.repositoryRoot)
  const document = readFileSync(repositoryPath(root, input.documentPath), "utf8")
  const inventory = extractProjectNormativeClauses(document)
  if (!inventory.complete) throw new Error("PROJECT inventory is incomplete")
  const records = createProjectRequirementSkeleton(inventory.clauses)
  return {
    schemaVersion: 1,
    documentKind: "project",
    entries: Object.fromEntries(
      records.map((record) => [
        record.requirementId,
        {
          obligationChecksum: projectObligationChecksum(record.obligation),
          requiredScopes: [],
          evidence: [],
        },
      ]),
    ),
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const values = [...process.argv.slice(2)]
    const repositoryRoot = resolve(
      values.shift() ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
    )
    const documentPath = values.shift() ?? "PROJECT.md"
    const outputPath = values.shift() ?? ".tasks/project-requirement-evidence.json"
    if (values.length)
      throw new Error(
        "usage: create-project-requirement-skeleton.mjs [repository] [document] [output]",
      )
    const result = createProjectRequirementEvidenceSkeleton({ repositoryRoot, documentPath })
    writeFileSync(
      repositoryPath(repositoryRoot, outputPath),
      `${JSON.stringify(result, null, 2)}\n`,
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
