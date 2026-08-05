#!/usr/bin/env node

import { lstatSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { userInfo } from "node:os"
import { resolve } from "node:path"

import { authorizePerformanceAcceptanceMatrix } from "../packages/core/src/release/performance-acceptance-authorization.js"
import { validateReleaseApprovalEvidenceProjection } from "../packages/core/src/release/package.js"
import { authorizeSubAgentRolloutThresholdPolicy } from "../packages/core/src/release/release-policy-authorization.js"
import { SqlitePerformanceAcceptanceAuthorizationRepository } from "../packages/core/src/release/sqlite-performance-acceptance-authorization-repository.js"
import { SqliteReleasePolicyAuthorizationRepository } from "../packages/core/src/release/sqlite-release-policy-authorization-repository.js"

const requireFromCore = createRequire(new URL("../packages/core/package.json", import.meta.url))
const BetterSqlite3 = requireFromCore("better-sqlite3")
const MAX_CANDIDATE_BYTES = 1024 * 1024

function parseArguments(argv) {
  const values = {
    databasePath: "",
    candidatePath: "",
    scope: "",
    decision: "",
    authorizationId: "",
  }
  const optionKeys = new Map([
    ["--database", "databasePath"],
    ["--candidate", "candidatePath"],
    ["--scope", "scope"],
    ["--decision", "decision"],
    ["--authorization-id", "authorizationId"],
  ])
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    const key = optionKeys.get(option)
    if (!key || !value || value.startsWith("--")) throw new Error("authorization_argument_invalid")
    values[key] = value
  }
  if (!values.databasePath || !values.candidatePath || !values.authorizationId.trim()) {
    throw new Error("authorization_argument_required")
  }
  if (values.scope !== "performance" && values.scope !== "rollout") {
    throw new Error("authorization_scope_invalid")
  }
  if (
    values.decision !== "approved" &&
    values.decision !== "denied" &&
    values.decision !== "revoked"
  ) {
    throw new Error("authorization_decision_invalid")
  }
  return Object.freeze(values)
}

function assertSafeRegularFile(path, reasonCode, maximumBytes) {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    throw new Error(reasonCode)
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > maximumBytes) {
    throw new Error(reasonCode)
  }
  return stat
}

function loadCandidate(path) {
  const resolvedPath = resolve(path)
  assertSafeRegularFile(resolvedPath, "authorization_candidate_path_unsafe", MAX_CANDIDATE_BYTES)
  try {
    return JSON.parse(readFileSync(resolvedPath, "utf8"))
  } catch {
    throw new Error("authorization_candidate_load_failed")
  }
}

function summarizeReleaseApprovalEvidence(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("authorization_candidate_load_failed")
  }
  const validation = validateReleaseApprovalEvidenceProjection(candidate.releaseApprovalEvidence)
  if (validation.status === "rejected") {
    throw new Error(`authorization_${validation.reasonCode}`)
  }
  const evidence = validation.evidence
  return Object.freeze({
    readinessStatus: evidence.readiness.status,
    blockerCodes: evidence.readiness.blockerCodes,
    artifact: evidence.activeTabInfoAuditArtifact,
    counts: evidence.activeTabInfoEvidenceCompleteness,
  })
}

function captureLocalPrincipal() {
  const localUser = userInfo()
  const identity =
    Number.isSafeInteger(localUser.uid) && localUser.uid >= 0 ? localUser.uid : localUser.username
  return Object.freeze({
    principalType: "authenticated_user",
    principalId: `local-os-user:${identity}`,
    authenticationId: `local-os:${process.platform}:${identity}`,
    roles: Object.freeze(["release_administrator"]),
  })
}

function assertAuthorizationTable(database, scope) {
  const table =
    scope === "performance"
      ? "performance_acceptance_authorizations"
      : "release_policy_authorizations"
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  if (!row) throw new Error("authorization_database_schema_unavailable")
}

function describeRecorded(scope, record) {
  return scope === "performance"
    ? `Authorization recorded: performance v${record.matrixVersion} (${record.decision})\n`
    : `Authorization recorded: rollout v${record.policyVersion} (${record.decision})\n`
}

function describeReleaseApprovalEvidence(summary) {
  const countSummary = [
    `missingSources=${summary.counts.missingSourceCount}`,
    `missingTests=${summary.counts.missingTestCount}`,
    `staleTests=${summary.counts.staleTestCount}`,
    `rejectedSkipped=${summary.counts.rejectedSkippedTestCount}`,
    `rejectedUnknown=${summary.counts.rejectedUnknownTestCount}`,
    `rejectedPublicRawReports=${summary.counts.rejectedPublicRawReportCount}`,
    `failingTests=${summary.counts.failingTestCount}`,
  ].join(",")
  const blockerSummary =
    summary.blockerCodes.length > 0 ? summary.blockerCodes.join(",") : "none"
  return [
    "Release approval evidence:",
    `activeTabInfoArtifact=${summary.artifact.id}`,
    `checksum=${summary.artifact.checksum}`,
    `packagePath=${summary.artifact.packagePath}`,
    `counts=${countSummary}`,
    `readiness=${summary.readinessStatus}`,
    `blockers=${blockerSummary}`,
  ].join(" ")
}

function run() {
  const command = parseArguments(process.argv.slice(2))
  const databasePath = resolve(command.databasePath)
  const databaseStat = assertSafeRegularFile(
    databasePath,
    "authorization_database_path_unsafe",
    Number.MAX_SAFE_INTEGER,
  )
  if (typeof process.getuid === "function" && databaseStat.uid !== process.getuid()) {
    throw new Error("authorization_database_owner_mismatch")
  }
  const candidate = loadCandidate(command.candidatePath)
  const releaseApprovalEvidence = summarizeReleaseApprovalEvidence(candidate)
  const principal = captureLocalPrincipal()
  const database = new BetterSqlite3(databasePath, { fileMustExist: true })
  try {
    assertAuthorizationTable(database, command.scope)
    const common = {
      candidate,
      decision: command.decision,
      principal,
      authorizationId: command.authorizationId.trim(),
      decidedAt: Date.now(),
    }
    const result =
      command.scope === "performance"
        ? authorizePerformanceAcceptanceMatrix({
            ...common,
            repository: new SqlitePerformanceAcceptanceAuthorizationRepository(database),
          })
        : authorizeSubAgentRolloutThresholdPolicy({
            ...common,
            repository: new SqliteReleasePolicyAuthorizationRepository(database),
          })
    if (result.status === "rejected") throw new Error(result.reasonCode)
    process.stdout.write(describeRecorded(command.scope, result.record))
    process.stdout.write(`${describeReleaseApprovalEvidence(releaseApprovalEvidence)}\n`)
  } finally {
    database.close()
  }
}

try {
  run()
} catch (error) {
  const reasonCode =
    error instanceof Error && /^[a-z0-9_:.-]+$/.test(error.message)
      ? error.message
      : "release_authorization_failed"
  process.stderr.write(`${reasonCode}\n`)
  process.exitCode = 1
}
