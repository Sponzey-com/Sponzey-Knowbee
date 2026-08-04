#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { evaluateLegacyRemovalProof } from "./lib/legacy-removal-proof.mjs"

const [reportPath, expectedPhase10Value, expectedMutationValue] = process.argv.slice(2)
if (!reportPath || !["true", "false"].includes(expectedPhase10Value) ||
  !["true", "false"].includes(expectedMutationValue)) {
  console.error("Usage: verify-legacy-removal-proof.mjs <report> <expected-phase10> <expected-mutation>")
  process.exit(2)
}

const report = JSON.parse(fs.readFileSync(path.resolve(reportPath), "utf8"))
const recalculated = evaluateLegacyRemovalProof(report)
const errors = []
if (report.phase10Ready !== (expectedPhase10Value === "true")) errors.push("phase10_expectation_mismatch")
if (recalculated.mutationAuthorized !== (expectedMutationValue === "true")) errors.push("mutation_expectation_mismatch")
if (JSON.stringify(report.decision) !== JSON.stringify(recalculated)) errors.push("stored_decision_mismatch")
if (!recalculated.valid) errors.push(...recalculated.validationErrors)
if (!recalculated.evidenceReady) errors.push("equivalence_evidence_not_ready")

const result = {
  valid: errors.length === 0,
  report: path.basename(reportPath),
  evidenceReady: recalculated.evidenceReady,
  rollbackReady: recalculated.rollbackReady,
  mutationAuthorized: recalculated.mutationAuthorized,
  unitCount: recalculated.unitCount,
  operationCount: recalculated.operationCount,
  blockingReasons: recalculated.blockingReasons,
  errors,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (!result.valid) process.exitCode = 1
