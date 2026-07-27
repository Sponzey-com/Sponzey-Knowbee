#!/usr/bin/env node

import { lstatSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { verifyReleaseActiveTabInfoAuditArtifactPayload } from "../packages/core/src/release/package.js"

const MAX_INPUT_BYTES = 1024 * 1024

function parseArguments(argv) {
  const values = {
    manifestPath: "",
    payloadPath: "",
  }
  const optionKeys = new Map([
    ["--manifest", "manifestPath"],
    ["--payload", "payloadPath"],
  ])
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    const key = optionKeys.get(option)
    if (!key || !value || value.startsWith("--")) {
      throw new Error("active_tab_info_audit_verifier_argument_invalid")
    }
    values[key] = value
  }
  if (!values.manifestPath || !values.payloadPath) {
    throw new Error("active_tab_info_audit_verifier_argument_required")
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

function readText(path, reasonCode) {
  const resolved = resolve(path)
  assertSafeRegularFile(resolved, `${reasonCode}_path_unsafe`)
  try {
    return readFileSync(resolved, "utf8")
  } catch {
    throw new Error(`${reasonCode}_load_failed`)
  }
}

function readJson(path, reasonCode) {
  try {
    return JSON.parse(readText(path, reasonCode))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${reasonCode}_`)) throw error
    throw new Error(`${reasonCode}_load_failed`)
  }
}

function objectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function activeTabInfoArtifactFromManifest(manifest) {
  if (!objectRecord(manifest)) throw new Error("active_tab_info_audit_manifest_invalid")
  const artifact = manifest.yeonjangBrowserActiveTabInfoAuditArtifact
  if (!objectRecord(artifact)) throw new Error("active_tab_info_audit_manifest_invalid")
  return artifact
}

function describeVerified(summary) {
  const counts = summary.evidenceCountSummary
  return [
    "Active tab info audit artifact verified:",
    `artifact=${summary.artifactId}`,
    `checksum=${summary.checksum}`,
    `packagePath=${summary.packagePath}`,
    `counts=missingSources=${counts.missingSourceCount},missingTests=${counts.missingTestCount},staleTests=${counts.staleTestCount},rejectedSkipped=${counts.rejectedSkippedTestCount},rejectedUnknown=${counts.rejectedUnknownTestCount},rejectedPublicRawReports=${counts.rejectedPublicRawReportCount},failingTests=${counts.failingTestCount}`,
  ].join(" ")
}

function run() {
  const command = parseArguments(process.argv.slice(2))
  const manifest = readJson(command.manifestPath, "active_tab_info_audit_manifest")
  const payloadContent = readText(command.payloadPath, "active_tab_info_audit_payload")
  const result = verifyReleaseActiveTabInfoAuditArtifactPayload({
    artifact: activeTabInfoArtifactFromManifest(manifest),
    payloadContent,
  })
  if (result.status === "rejected") throw new Error(result.reasonCode)
  process.stdout.write(`${describeVerified(result.summary)}\n`)
}

try {
  run()
} catch (error) {
  const reasonCode =
    error instanceof Error && /^[a-z0-9_:.-]+$/u.test(error.message)
      ? error.message
      : "active_tab_info_audit_artifact_verification_failed"
  process.stderr.write(`${reasonCode}\n`)
  process.exitCode = 1
}
