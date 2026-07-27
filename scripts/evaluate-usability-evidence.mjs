import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { evaluateUsabilityEvidence } from "./lib/usability-evidence.mjs"

const inputPath = process.argv[2] ? resolve(process.argv[2]) : null
const outputPath = process.argv[3] ? resolve(process.argv[3]) : null
if (!inputPath || !outputPath) {
  throw new Error("usage: node scripts/evaluate-usability-evidence.mjs <input.json> <output.json>")
}

const evidence = JSON.parse(readFileSync(inputPath, "utf8"))
const report = evaluateUsabilityEvidence(evidence)
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.valid) process.exitCode = 2
else if (!report.phase10Ready) process.exitCode = 1
