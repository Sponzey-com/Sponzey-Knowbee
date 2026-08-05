#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { evaluateCutoverAuthorization } from "./lib/cutover-authorization.mjs"
import {
  evaluateLegacyCutoverInventory,
  legacyCutoverInventoryDigest,
} from "./lib/legacy-cutover-inventory.mjs"
import { evaluateLegacyRemovalProof } from "./lib/legacy-removal-proof.mjs"
import {
  compareLegacyRollbackBundle,
  deriveLegacyRollbackCoverage,
  legacyRemovalProofSourceDigest,
  sha256,
  validateLegacyRollbackBundle,
} from "./lib/legacy-rollback-bundle.mjs"
import { evaluateUsabilityEvidence } from "./lib/usability-evidence.mjs"

const [repositoryRoot, humanEvidencePath, humanReportPath, inventoryPath, proofPath, bundlePath, outputPath] = process.argv.slice(2)
if (!repositoryRoot || !humanEvidencePath || !humanReportPath || !inventoryPath || !proofPath || !bundlePath || !outputPath) {
  console.error("Usage: collect-cutover-authorization.mjs <root> <human-evidence> <human-report> <inventory> <proof> <bundle> <output>")
  process.exit(2)
}

const root = path.resolve(repositoryRoot)
const humanEvidenceText = fs.readFileSync(path.resolve(humanEvidencePath), "utf8")
const humanEvidence = JSON.parse(humanEvidenceText)
const humanReport = JSON.parse(fs.readFileSync(path.resolve(humanReportPath), "utf8"))
const inventory = JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"))
const proof = JSON.parse(fs.readFileSync(path.resolve(proofPath), "utf8"))
const bundle = JSON.parse(fs.readFileSync(path.resolve(bundlePath), "utf8"))

const phase10Decision = evaluateUsabilityEvidence(humanEvidence)
const inventoryDecision = evaluateLegacyCutoverInventory(inventory)
const removalDecision = evaluateLegacyRemovalProof(proof)
const inventoryDigest = legacyCutoverInventoryDigest(inventory)
const proofDigest = legacyRemovalProofSourceDigest(proof)
const coverage = deriveLegacyRollbackCoverage(inventory, proof)
const bundleDecision = validateLegacyRollbackBundle(bundle, {
  ...coverage,
  sourceProofDigest: proofDigest,
})
const currentFiles = bundleDecision.valid
  ? bundle.files.flatMap((file) => {
      const absolute = path.resolve(root, file.path)
      const relative = path.relative(root, absolute)
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) return []
      return [{ path: file.path, content: fs.readFileSync(absolute, "utf8") }]
    })
  : []
const sourceComparison = compareLegacyRollbackBundle(bundle, currentFiles)
const storedPhaseMatches = JSON.stringify(humanReport) === JSON.stringify(phase10Decision)
const storedInventoryMatches = JSON.stringify(inventory.decision) === JSON.stringify(inventoryDecision)
const storedRemovalMatches = JSON.stringify(proof.decision) === JSON.stringify(removalDecision)
const checks = {
  phase10Valid: phase10Decision.valid && storedPhaseMatches,
  phase10Ready: phase10Decision.phase10Ready,
  inventoryValid: inventoryDecision.valid && storedInventoryMatches,
  inventoryReady: inventoryDecision.inventoryReady,
  removalProofValid: removalDecision.valid && storedRemovalMatches,
  removalEvidenceReady: removalDecision.evidenceReady,
  rollbackReady: removalDecision.rollbackReady,
  bundleValid: bundleDecision.valid,
  sourceExact: sourceComparison.exact,
  proofInventoryLineage: proof.sourceInventoryDigest === inventoryDigest,
  bundleProofLineage: bundle.sourceProofDigest === proofDigest,
}
const decision = evaluateCutoverAuthorization(checks)
const unsigned = {
  schemaVersion: "knowbee.cutover-authorization:v1",
  generatedAt: new Date().toISOString(),
  status: decision.status,
  authorized: decision.authorized,
  reasons: decision.reasons,
  checks,
  digests: {
    humanEvidence: sha256(humanEvidenceText),
    inventory: inventoryDigest,
    removalProof: proofDigest,
    rollbackBundle: bundle.bundleDigest,
  },
}
const receipt = { ...unsigned, receiptDigest: sha256(JSON.stringify(unsigned)) }
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
console.log(JSON.stringify({
  output: path.relative(root, path.resolve(outputPath)),
  status: receipt.status,
  reasons: receipt.reasons,
  receiptDigest: receipt.receiptDigest,
}))
