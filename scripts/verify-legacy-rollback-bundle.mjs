#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import {
  compareLegacyRollbackBundle,
  deriveLegacyRollbackCoverage,
  legacyRemovalProofSourceDigest,
  validateLegacyRollbackBundle,
} from "./lib/legacy-rollback-bundle.mjs"

const [repositoryRoot, inventoryPath, proofPath, bundlePath] = process.argv.slice(2)
if (!repositoryRoot || !inventoryPath || !proofPath || !bundlePath) {
  console.error("Usage: verify-legacy-rollback-bundle.mjs <repository-root> <inventory> <proof> <bundle>")
  process.exit(2)
}

const root = path.resolve(repositoryRoot)
const inventory = JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"))
const proofText = fs.readFileSync(path.resolve(proofPath), "utf8")
const proof = JSON.parse(proofText)
const bundle = JSON.parse(fs.readFileSync(path.resolve(bundlePath), "utf8"))
const coverage = deriveLegacyRollbackCoverage(inventory, proof)
const validation = validateLegacyRollbackBundle(bundle, {
  ...coverage,
  sourceProofDigest: legacyRemovalProofSourceDigest(proof),
})
const currentFiles = validation.valid
  ? bundle.files.flatMap((file) => {
      const absolute = path.resolve(root, file.path)
      const relative = path.relative(root, absolute)
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) return []
      return [{ path: file.path, content: fs.readFileSync(absolute, "utf8") }]
    })
  : []
const comparison = compareLegacyRollbackBundle(bundle, currentFiles)
const result = {
  valid: validation.valid && comparison.exact,
  unitCount: validation.unitCount,
  fileCount: validation.fileCount,
  bundleDigest: validation.bundleDigest,
  same: comparison.same.length,
  missing: comparison.missing,
  drifted: comparison.drifted,
  errors: validation.errors,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (!result.valid) process.exitCode = 1
