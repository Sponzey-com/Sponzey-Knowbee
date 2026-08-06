#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildInstallerCleanMachineEvidence } from "./lib/installer-clean-machine-evidence.mjs"
import { parseExactOptions, readBoundedJson } from "./lib/installer-native-cli.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "./lib/installer-platforms.mjs"

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

async function safeDirectory(path) {
  const metadata = await lstat(path).catch(() => undefined)
  return metadata?.isDirectory() === true && !metadata.isSymbolicLink()
}

export async function runInstallerCleanMachineEvidenceCli(argv) {
  const values = parseExactOptions(argv, [
    "--candidate-id",
    "--artifact-receipts",
    "--platform-evidence",
    "--receipt-root",
    "--output-dir",
  ])
  if (!values) return reject("installer_clean_arguments_invalid")
  const receiptRoot = resolve(values.get("--receipt-root"))
  const outputDirectory = resolve(values.get("--output-dir"))
  if (
    !(await safeDirectory(receiptRoot)) ||
    !(await safeDirectory(dirname(outputDirectory))) ||
    (await lstat(outputDirectory).catch(() => undefined))
  ) {
    return reject("installer_clean_path_unsafe")
  }
  const [artifacts, platformEvidence, ...receipts] = await Promise.all([
    readBoundedJson(values.get("--artifact-receipts")),
    readBoundedJson(values.get("--platform-evidence")),
    ...INSTALLER_PLATFORM_PROFILES.map((profile) =>
      readBoundedJson(join(receiptRoot, `clean-machine-receipt-${profile.target}.json`)),
    ),
  ])
  if (!artifacts || !platformEvidence || receipts.some((value) => !value)) {
    return reject("installer_clean_input_unsafe")
  }
  const built = buildInstallerCleanMachineEvidence({
    candidateId: values.get("--candidate-id"),
    artifacts,
    platformEvidence,
    receipts,
  })
  if (built.status !== "ready") return built

  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`
  try {
    await mkdir(temporaryDirectory, { mode: 0o700 })
    for (const [name, value] of [
      ["platform-evidence.json", built.platformEvidence],
      ["clean-machine-receipts.json", built.cleanMachineReceipts],
      ["dry-run-receipts.json", built.dryRunReceipts],
      ["rollback-receipt.json", built.rollbackReceipt],
    ]) {
      await writeFile(join(temporaryDirectory, name), `${JSON.stringify(value)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
    }
    if (await lstat(outputDirectory).catch(() => undefined)) {
      return reject("installer_clean_output_exists")
    }
    await rename(temporaryDirectory, outputDirectory)
    return {
      status: "ready",
      candidateId: values.get("--candidate-id"),
      targetCount: INSTALLER_PLATFORM_PROFILES.length,
    }
  } catch {
    return reject("installer_clean_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await runInstallerCleanMachineEvidenceCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}
