#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { evaluateLegacyCutoverInventory } from "./lib/legacy-cutover-inventory.mjs"

const [reportPath, expectedPhase10Value] = process.argv.slice(2)
if (!reportPath || !["true", "false"].includes(expectedPhase10Value)) {
  console.error("Usage: verify-legacy-cutover-inventory.mjs <report> <expected-phase10-ready:true|false>")
  process.exit(2)
}

const report = JSON.parse(fs.readFileSync(path.resolve(reportPath), "utf8"))
const expectedPhase10Ready = expectedPhase10Value === "true"
const recalculated = evaluateLegacyCutoverInventory(report)
const errors = []
if (report.phase10Ready !== expectedPhase10Ready) errors.push("phase10_expectation_mismatch")
if (JSON.stringify(report.decision) !== JSON.stringify(recalculated)) errors.push("stored_decision_mismatch")
if (!recalculated.valid) errors.push(...recalculated.validationErrors)
if (!recalculated.inventoryReady) errors.push("inventory_not_ready")
if (!expectedPhase10Ready && recalculated.deletionAuthorized) {
  errors.push("deletion_authorized_before_phase10")
}

const result = {
  valid: errors.length === 0,
  report: path.basename(reportPath),
  inventoryReady: recalculated.inventoryReady,
  deletionAuthorized: recalculated.deletionAuthorized,
  counts: recalculated.counts,
  errors,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (!result.valid) process.exitCode = 1
