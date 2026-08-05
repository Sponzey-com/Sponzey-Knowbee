#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import {
  createLegacyRollbackBundle,
  deriveLegacyRollbackCoverage,
  legacyRemovalProofSourceDigest,
  validateLegacyRollbackBundle,
} from "./lib/legacy-rollback-bundle.mjs"

const [repositoryRoot, inventoryPath, proofPath, outputPath] = process.argv.slice(2)
if (!repositoryRoot || !inventoryPath || !proofPath || !outputPath) {
  console.error("Usage: collect-legacy-rollback-bundle.mjs <repository-root> <inventory> <proof> <output>")
  process.exit(2)
}

const root = path.resolve(repositoryRoot)
const inventory = JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"))
const proofText = fs.readFileSync(path.resolve(proofPath), "utf8")
const proof = JSON.parse(proofText)
const coverage = deriveLegacyRollbackCoverage(inventory, proof)
const files = coverage.evidencePaths.map((relativePath) => ({
  path: relativePath,
  content: readRepositoryText(root, relativePath),
}))
const sourceProofDigest = legacyRemovalProofSourceDigest(proof)
const bundle = createLegacyRollbackBundle({ sourceProofDigest, units: coverage.units, files })
const validation = validateLegacyRollbackBundle(bundle, { ...coverage, sourceProofDigest })
if (!validation.valid) {
  console.error(JSON.stringify(validation))
  process.exit(1)
}
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(bundle, null, 2)}\n`, "utf8")
console.log(JSON.stringify({
  output: path.relative(root, path.resolve(outputPath)),
  unitCount: validation.unitCount,
  fileCount: validation.fileCount,
  bundleDigest: validation.bundleDigest,
}))

function readRepositoryText(repositoryRoot, relativePath) {
  const absolute = path.resolve(repositoryRoot, relativePath)
  const relative = path.relative(repositoryRoot, absolute)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("bundle_path_outside_repository")
  return fs.readFileSync(absolute, "utf8")
}
