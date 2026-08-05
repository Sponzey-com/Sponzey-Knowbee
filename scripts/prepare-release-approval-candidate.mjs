#!/usr/bin/env node

import { lstatSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"

import { validateReleaseApprovalEvidenceProjection } from "../packages/core/src/release/package.js"

const MAX_INPUT_BYTES = 1024 * 1024

function parseArguments(argv) {
  const values = {
    candidatePath: "",
    releaseDryRunPath: "",
    outputPath: "",
  }
  const optionKeys = new Map([
    ["--candidate", "candidatePath"],
    ["--release-dry-run", "releaseDryRunPath"],
    ["--output", "outputPath"],
  ])
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    const key = optionKeys.get(option)
    if (!key || !value || value.startsWith("--")) {
      throw new Error("approval_candidate_argument_invalid")
    }
    values[key] = value
  }
  if (!values.candidatePath || !values.releaseDryRunPath || !values.outputPath) {
    throw new Error("approval_candidate_argument_required")
  }
  return Object.freeze(values)
}

function assertSafeRegularFile(path, reasonCode) {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    throw new Error(reasonCode)
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > MAX_INPUT_BYTES) {
    throw new Error(reasonCode)
  }
}

function readJson(path, reasonCode) {
  const resolved = resolve(path)
  assertSafeRegularFile(resolved, `${reasonCode}_path_unsafe`)
  try {
    return JSON.parse(readFileSync(resolved, "utf8"))
  } catch {
    throw new Error(`${reasonCode}_load_failed`)
  }
}

function objectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function validateReleaseApprovalEvidence(evidence) {
  const validation = validateReleaseApprovalEvidenceProjection(evidence)
  if (validation.status === "rejected") throw new Error(validation.reasonCode)
  return validation.evidence
}

function assertOutputPathAvailable(path) {
  const resolved = resolve(path)
  if (resolved === dirname(resolved)) throw new Error("approval_candidate_output_path_invalid")
  try {
    lstatSync(resolved)
    throw new Error("approval_candidate_output_exists")
  } catch (error) {
    if (error instanceof Error && error.message === "approval_candidate_output_exists") throw error
  }
  return resolved
}

function writePreparedCandidate(path, candidate) {
  const serialized = `${JSON.stringify(candidate, null, 2)}\n`
  writeFileSync(path, serialized, { encoding: "utf8", flag: "wx" })
}

function describePrepared(evidence, outputPath) {
  const counts = evidence.activeTabInfoEvidenceCompleteness
  return [
    "Approval candidate prepared:",
    `output=${basename(outputPath)}`,
    `activeTabInfoArtifact=${evidence.activeTabInfoAuditArtifact.id}`,
    `checksum=${evidence.activeTabInfoAuditArtifact.checksum}`,
    `packagePath=${evidence.activeTabInfoAuditArtifact.packagePath}`,
    `counts=missingSources=${counts.missingSourceCount},missingTests=${counts.missingTestCount},staleTests=${counts.staleTestCount},rejectedSkipped=${counts.rejectedSkippedTestCount},rejectedUnknown=${counts.rejectedUnknownTestCount},rejectedPublicRawReports=${counts.rejectedPublicRawReportCount},failingTests=${counts.failingTestCount}`,
    `readiness=${evidence.readiness.status}`,
    `blockers=${evidence.readiness.blockerCodes.length > 0 ? evidence.readiness.blockerCodes.join(",") : "none"}`,
  ].join(" ")
}

function run() {
  const command = parseArguments(process.argv.slice(2))
  const candidate = readJson(command.candidatePath, "approval_candidate")
  if (!objectRecord(candidate)) throw new Error("approval_candidate_invalid")
  const dryRun = readJson(command.releaseDryRunPath, "release_dry_run")
  if (!objectRecord(dryRun)) throw new Error("release_dry_run_invalid")
  const evidence = validateReleaseApprovalEvidence(dryRun.releaseApprovalEvidence)
  const outputPath = assertOutputPathAvailable(command.outputPath)
  writePreparedCandidate(outputPath, {
    ...candidate,
    releaseApprovalEvidence: evidence,
  })
  process.stdout.write(`${describePrepared(evidence, outputPath)}\n`)
}

try {
  run()
} catch (error) {
  const reasonCode =
    error instanceof Error && /^[a-z0-9_:.-]+$/u.test(error.message)
      ? error.message
      : "approval_candidate_prepare_failed"
  process.stderr.write(`${reasonCode}\n`)
  process.exitCode = 1
}
