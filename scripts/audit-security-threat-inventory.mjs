#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  DEFAULT_SECURITY_THREAT_SURFACES,
  REQUIRED_SECURITY_THREAT_CLASSES,
  auditSecurityThreatInventory,
} from "../packages/core/src/maintenance/security-threat-inventory.js"

function defaultReadArtifact({ repositoryRoot, artifactId }) {
  try {
    return readFileSync(join(repositoryRoot, artifactId), "utf8")
  } catch {
    return undefined
  }
}

export function createSecurityThreatBaseline(input) {
  const readArtifact = input.readArtifact ?? defaultReadArtifact
  return auditSecurityThreatInventory({
    surfaces: input.surfaces ?? DEFAULT_SECURITY_THREAT_SURFACES,
    requiredThreatClasses: input.requiredThreatClasses ?? REQUIRED_SECURITY_THREAT_CLASSES,
    readArtifact: (artifactId) =>
      readArtifact({ repositoryRoot: input.repositoryRoot, artifactId }),
  })
}

function parseArguments(argv) {
  const values = [...argv]
  const repositoryRoot = resolve(
    values[0] && values[0] !== "--output"
      ? values.shift()
      : join(dirname(fileURLToPath(import.meta.url)), ".."),
  )
  let outputPath = ""
  if (values[0] === "--output") {
    values.shift()
    outputPath = values.shift() ?? ""
  }
  if (values.length > 0 || (argv.includes("--output") && !outputPath)) {
    throw new Error(
      "usage: audit-security-threat-inventory.mjs [repository-root] [--output output-path]",
    )
  }
  return { repositoryRoot, outputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { repositoryRoot, outputPath } = parseArguments(process.argv.slice(2))
    const result = createSecurityThreatBaseline({ repositoryRoot })
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (outputPath) {
      const absolute = isAbsolute(outputPath) ? outputPath : join(repositoryRoot, outputPath)
      writeFileSync(absolute, serialized, "utf8")
    } else {
      process.stdout.write(serialized)
    }
    if (!result.complete) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
