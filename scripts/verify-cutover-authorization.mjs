#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { sha256 } from "./lib/legacy-rollback-bundle.mjs"

const [receiptPath, expectedStatus, expectedReason] = process.argv.slice(2)
if (!receiptPath || !["authorized", "denied"].includes(expectedStatus) || !expectedReason) {
  console.error("Usage: verify-cutover-authorization.mjs <receipt> <authorized|denied> <reason|none>")
  process.exit(2)
}

const receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), "utf8"))
const { receiptDigest, ...unsigned } = receipt
const expectedReasons = expectedReason === "none" ? [] : [expectedReason]
const errors = []
if (receipt.schemaVersion !== "knowbee.cutover-authorization:v1") errors.push("schema_invalid")
if (receipt.status !== expectedStatus) errors.push("status_expectation_mismatch")
if (JSON.stringify(receipt.reasons) !== JSON.stringify(expectedReasons)) errors.push("reason_expectation_mismatch")
if (receipt.authorized !== (expectedStatus === "authorized")) errors.push("authorized_value_mismatch")
if (receiptDigest !== sha256(JSON.stringify(unsigned))) errors.push("receipt_digest_mismatch")
const result = { valid: errors.length === 0, status: receipt.status, reasons: receipt.reasons, errors }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (!result.valid) process.exitCode = 1
