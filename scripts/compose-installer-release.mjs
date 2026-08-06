#!/usr/bin/env node
import { constants as fsConstants } from "node:fs"
import { chmod, lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  finalizeInstallerReleaseCandidate,
  prepareInstallerReleaseCandidate,
  prepareInstallerReleaseRehearsal,
} from "./lib/installer-release-composition.mjs"

const JSON_LIMIT = 2 * 1024 * 1024
const TEMPLATE_LIMIT = 1024 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function parseArguments(argv) {
  if (
    !Array.isArray(argv) ||
    (argv[0] !== "prepare" && argv[0] !== "rehearsal" && argv[0] !== "finalize")
  ) {
    return reject("installer_release_arguments_invalid")
  }
  const values = new Map()
  for (let index = 1; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (
      typeof option !== "string" ||
      !option.startsWith("--") ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--") ||
      values.has(option)
    ) {
      return reject("installer_release_arguments_invalid")
    }
    values.set(option, value)
  }
  const allowed = new Set(
    argv[0] === "prepare"
      ? ["--release-version", "--artifact-receipts", "--output-dir"]
      : argv[0] === "rehearsal"
        ? [
            "--manifest",
            "--verifier-receipts",
            "--platform-evidence",
            "--posix-template",
            "--powershell-template",
            "--output-dir",
          ]
        : [
            "--manifest",
            "--verifier-receipts",
            "--platform-evidence",
            "--dry-run-receipts",
            "--rollback-receipt",
            "--posix-template",
            "--powershell-template",
            "--output-dir",
          ],
  )
  if ([...values.keys()].some((value) => !allowed.has(value))) {
    return reject("installer_release_arguments_invalid")
  }
  return { status: "parsed", command: argv[0], values }
}

async function readRegularFile(path, limit) {
  const resolved = resolve(path)
  let file
  try {
    const pathMetadata = await lstat(resolved, { bigint: true })
    if (
      !pathMetadata.isFile() ||
      pathMetadata.isSymbolicLink() ||
      pathMetadata.size <= 0n ||
      pathMetadata.size > BigInt(limit)
    ) {
      return reject("installer_release_input_unsafe")
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(resolved, fsConstants.O_RDONLY | noFollow)
    const before = await file.stat({ bigint: true })
    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    if (
      !after.isFile() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      return reject("installer_release_input_changed")
    }
    return { status: "ready", bytes }
  } catch {
    return reject("installer_release_input_unsafe")
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function readJsonInput(path) {
  const loaded = await readRegularFile(path, JSON_LIMIT)
  if (loaded.status !== "ready") return loaded
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(loaded.bytes)
    return { status: "ready", value: JSON.parse(text) }
  } catch {
    return reject("installer_release_json_invalid")
  }
}

async function checkOutputAvailable(value) {
  if (typeof value !== "string" || value.length === 0) {
    return reject("installer_release_arguments_invalid")
  }
  const outputDirectory = resolve(value)
  if (await lstat(outputDirectory).catch(() => undefined)) {
    return reject("installer_release_output_exists")
  }
  const parent = dirname(outputDirectory)
  const parentMetadata = await lstat(parent).catch(() => undefined)
  if (!parentMetadata?.isDirectory() || parentMetadata.isSymbolicLink()) {
    return reject("installer_release_output_parent_unsafe")
  }
  return { status: "ready", outputDirectory }
}

async function publishDirectory(outputDirectory, entries) {
  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}`
  if (await lstat(temporaryDirectory).catch(() => undefined)) {
    return reject("installer_release_temporary_output_exists")
  }
  try {
    await mkdir(temporaryDirectory, { mode: 0o700 })
    for (const entry of entries) {
      await writeFile(`${temporaryDirectory}/${entry.name}`, entry.bytes, {
        flag: "wx",
        mode: entry.mode ?? 0o600,
      })
    }
    if (await lstat(outputDirectory).catch(() => undefined)) {
      return reject("installer_release_output_exists")
    }
    await rename(temporaryDirectory, outputDirectory)
    return { status: "ready" }
  } catch {
    return reject("installer_release_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function requireOptions(values, names) {
  return names.every((name) => typeof values.get(name) === "string")
}

async function prepare(values, outputDirectory) {
  if (!requireOptions(values, ["--release-version", "--artifact-receipts"])) {
    return reject("installer_release_arguments_invalid")
  }
  const artifacts = await readJsonInput(values.get("--artifact-receipts"))
  if (artifacts.status !== "ready") return artifacts
  const prepared = prepareInstallerReleaseCandidate({
    releaseVersion: values.get("--release-version"),
    artifactReceipts: artifacts.value,
  })
  if (prepared.status !== "ready") return prepared
  const published = await publishDirectory(outputDirectory, [
    { name: "installer-manifest.json", bytes: prepared.rawManifestBytes },
  ])
  return published.status === "ready"
    ? { status: "ready", candidateId: prepared.candidateId }
    : published
}

async function rehearsal(values, outputDirectory) {
  const required = [
    "--manifest",
    "--verifier-receipts",
    "--platform-evidence",
    "--posix-template",
    "--powershell-template",
  ]
  if (!requireOptions(values, required)) return reject("installer_release_arguments_invalid")
  const [manifest, verifiers, platforms, posix, ps] = await Promise.all([
    readRegularFile(values.get("--manifest"), JSON_LIMIT),
    readJsonInput(values.get("--verifier-receipts")),
    readJsonInput(values.get("--platform-evidence")),
    readRegularFile(values.get("--posix-template"), TEMPLATE_LIMIT),
    readRegularFile(values.get("--powershell-template"), TEMPLATE_LIMIT),
  ])
  const invalid = [manifest, verifiers, platforms, posix, ps].find(
    (value) => value.status !== "ready",
  )
  if (invalid) return invalid
  const prepared = prepareInstallerReleaseRehearsal({
    rawManifestBytes: manifest.bytes,
    verifierReceipts: verifiers.value,
    platformEvidence: platforms.value,
    posixTemplate: new TextDecoder("utf-8", { fatal: true }).decode(posix.bytes),
    powershellTemplate: new TextDecoder("utf-8", { fatal: true }).decode(ps.bytes),
  })
  if (prepared.status !== "ready") return prepared
  const published = await publishDirectory(outputDirectory, [
    { name: "installer-manifest.json", bytes: prepared.rawManifestBytes },
    { name: "install.sh", bytes: prepared.installSh, mode: 0o755 },
    { name: "install.ps1", bytes: prepared.installPs1 },
    {
      name: "installer-rehearsal-gate.json",
      bytes: Buffer.from(`${JSON.stringify(prepared.rehearsalGate)}\n`, "utf8"),
    },
  ])
  if (published.status !== "ready") return published
  await chmod(`${outputDirectory}/install.sh`, 0o755)
  return { status: "ready", candidateId: prepared.candidateId }
}

async function finalize(values, outputDirectory) {
  const required = [
    "--manifest",
    "--verifier-receipts",
    "--platform-evidence",
    "--dry-run-receipts",
    "--rollback-receipt",
    "--posix-template",
    "--powershell-template",
  ]
  if (!requireOptions(values, required)) return reject("installer_release_arguments_invalid")
  const [manifest, verifiers, platforms, dryRuns, rollback, posix, ps] = await Promise.all([
    readRegularFile(values.get("--manifest"), JSON_LIMIT),
    readJsonInput(values.get("--verifier-receipts")),
    readJsonInput(values.get("--platform-evidence")),
    readJsonInput(values.get("--dry-run-receipts")),
    readJsonInput(values.get("--rollback-receipt")),
    readRegularFile(values.get("--posix-template"), TEMPLATE_LIMIT),
    readRegularFile(values.get("--powershell-template"), TEMPLATE_LIMIT),
  ])
  const inputs = [manifest, verifiers, platforms, dryRuns, rollback, posix, ps]
  const invalid = inputs.find((value) => value.status !== "ready")
  if (invalid) return invalid
  const finalized = finalizeInstallerReleaseCandidate({
    rawManifestBytes: manifest.bytes,
    verifierReceipts: verifiers.value,
    platformEvidence: platforms.value,
    dryRunReceipts: dryRuns.value,
    rollbackReceipt: rollback.value,
    posixTemplate: new TextDecoder("utf-8", { fatal: true }).decode(posix.bytes),
    powershellTemplate: new TextDecoder("utf-8", { fatal: true }).decode(ps.bytes),
  })
  if (finalized.status !== "ready") return finalized
  const published = await publishDirectory(outputDirectory, [
    { name: "installer-manifest.json", bytes: finalized.rawManifestBytes },
    { name: "install.sh", bytes: finalized.installSh, mode: 0o755 },
    { name: "install.ps1", bytes: finalized.installPs1 },
    {
      name: "installer-release-gate.json",
      bytes: Buffer.from(`${JSON.stringify(finalized.releaseGate)}\n`, "utf8"),
    },
  ])
  if (published.status !== "ready") return published
  await chmod(`${outputDirectory}/install.sh`, 0o755)
  return { status: "ready", candidateId: finalized.candidateId }
}

export async function runInstallerReleaseCli(argv) {
  const parsed = parseArguments(argv)
  if (parsed.status !== "parsed") return parsed
  const output = await checkOutputAvailable(parsed.values.get("--output-dir"))
  if (output.status !== "ready") return output
  if (parsed.command === "prepare") return prepare(parsed.values, output.outputDirectory)
  if (parsed.command === "rehearsal") return rehearsal(parsed.values, output.outputDirectory)
  return finalize(parsed.values, output.outputDirectory)
}

async function main() {
  const result = await runInstallerReleaseCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main()
}
