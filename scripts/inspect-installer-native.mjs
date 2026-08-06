#!/usr/bin/env node
import { lstat } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  emitNativeInspectionResult,
  parseExactOptions,
  readBoundedJson,
} from "./lib/installer-native-cli.mjs"
import {
  collectSafeTree,
  hashNativeFile,
  inspectNativeHeader,
  selectNativeFiles,
} from "./lib/installer-native-files.mjs"

const SHA256 = /^[a-f0-9]{64}$/u
const CANDIDATE_ID = /^sha256:[a-f0-9]{64}$/u

const TARGET_NATIVE = Object.freeze({
  "darwin-arm64": { format: "mach_o_64", cpu: "arm64" },
  "darwin-x64": { format: "mach_o_64", cpu: "x64" },
  "win32-arm64": { format: "pe_32_plus", cpu: "arm64" },
  "win32-x64": { format: "pe_32_plus", cpu: "x64" },
})

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function blocked(reasonCode) {
  return { status: "blocked", reasonCode }
}

export async function inspectUnsignedInstallerNative(input) {
  const expected = TARGET_NATIVE[input?.target]
  if (
    !expected ||
    typeof input.stageRoot !== "string" ||
    input.verifiedReceipt?.status !== "verified" ||
    input.verifiedReceipt.target !== input.target ||
    input.verifiedReceipt.originTrust !== "unsigned_origin_unverified" ||
    typeof input.verifiedReceipt.manifestSha256 !== "string" ||
    !CANDIDATE_ID.test(input.verifiedReceipt.manifestSha256) ||
    typeof input.verifiedReceipt.sha256 !== "string" ||
    !SHA256.test(input.verifiedReceipt.sha256) ||
    typeof input.verifierPath !== "string" ||
    input.verifierReceipt?.target !== input.target ||
    typeof input.verifierReceipt.sha256 !== "string" ||
    !SHA256.test(input.verifierReceipt.sha256)
  ) {
    return reject("installer_unsigned_native_input_invalid")
  }
  const stageRoot = resolve(input.stageRoot)
  const metadata = await lstat(stageRoot).catch(() => undefined)
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) return reject("installer_native_stage_unsafe")
  let files
  try {
    const tree = await collectSafeTree(stageRoot)
    files = await selectNativeFiles(tree.files, expected.format, expected.cpu)
  } catch {
    return blocked("installer_native_target_mismatch")
  }
  if (files.length === 0) return blocked("installer_native_files_missing")
  const verifierIdentity = await hashNativeFile(resolve(input.verifierPath))
  const verifierHeader = await inspectNativeHeader(resolve(input.verifierPath))
  if (
    !verifierIdentity ||
    verifierIdentity.sha256 !== input.verifierReceipt.sha256 ||
    verifierHeader?.format !== expected.format ||
    verifierHeader.cpu !== expected.cpu
  ) {
    return blocked("installer_native_verifier_identity_mismatch")
  }
  return {
    status: "ready",
    attestation: {
      kind: "knowbee.installer.native_attestation",
      schemaVersion: 1,
      target: input.target,
      candidateId: input.verifiedReceipt.manifestSha256,
      artifactSha256: input.verifiedReceipt.sha256,
      verifierSha256: verifierIdentity.sha256,
      status: "passed",
      originTrust: "unsigned_origin_unverified",
      nativeFileCount: files.length,
    },
  }
}

export async function runUnsignedInstallerNativeCli(argv) {
  const values = parseExactOptions(argv, [
    "--target",
    "--stage",
    "--verified-receipt",
    "--verifier",
    "--verifier-receipt",
  ])
  if (!values) return reject("installer_unsigned_native_arguments_invalid")
  const [verifiedReceipt, verifierReceipt] = await Promise.all([
    readBoundedJson(values.get("--verified-receipt")),
    readBoundedJson(values.get("--verifier-receipt")),
  ])
  if (!verifiedReceipt || !verifierReceipt) return reject("installer_unsigned_native_receipt_invalid")
  return inspectUnsignedInstallerNative({
    target: values.get("--target"),
    stageRoot: values.get("--stage"),
    verifiedReceipt,
    verifierPath: values.get("--verifier"),
    verifierReceipt,
  })
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  emitNativeInspectionResult(await runUnsignedInstallerNativeCli(process.argv.slice(2)))
}
