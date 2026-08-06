#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { parseExactOptions, readBoundedJson } from "./lib/installer-native-cli.mjs"
import { buildInstallerNativePlatformEvidence } from "./lib/installer-native-evidence.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "./lib/installer-platforms.mjs"

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

async function isSafeDirectory(path) {
  const metadata = await lstat(path).catch(() => undefined)
  return metadata?.isDirectory() === true && !metadata.isSymbolicLink()
}

export async function runInstallerNativeEvidenceCli(argv) {
  const values = parseExactOptions(argv, [
    "--candidate-id",
    "--artifact-receipts",
    "--verifier-receipts",
    "--attestation-root",
    "--output-dir",
  ])
  if (!values) return reject("installer_native_evidence_arguments_invalid")
  const attestationRoot = resolve(values.get("--attestation-root"))
  const outputDirectory = resolve(values.get("--output-dir"))
  if (
    !(await isSafeDirectory(attestationRoot)) ||
    !(await isSafeDirectory(dirname(outputDirectory))) ||
    (await lstat(outputDirectory).catch(() => undefined))
  ) {
    return reject("installer_native_evidence_path_unsafe")
  }
  const [artifacts, verifiers, ...attestations] = await Promise.all([
    readBoundedJson(values.get("--artifact-receipts")),
    readBoundedJson(values.get("--verifier-receipts")),
    ...INSTALLER_PLATFORM_PROFILES.map((profile) =>
      readBoundedJson(join(attestationRoot, `native-attestation-${profile.target}.json`)),
    ),
  ])
  if (!artifacts || !verifiers || attestations.some((value) => !value)) {
    return reject("installer_native_evidence_input_unsafe")
  }
  const built = buildInstallerNativePlatformEvidence({
    candidateId: values.get("--candidate-id"),
    artifacts,
    verifiers,
    attestations,
  })
  if (built.status !== "ready") return built

  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`
  try {
    await mkdir(temporaryDirectory, { mode: 0o700 })
    await writeFile(
      join(temporaryDirectory, "platform-evidence.json"),
      `${JSON.stringify(built.evidence)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    )
    if (await lstat(outputDirectory).catch(() => undefined)) {
      return reject("installer_native_evidence_output_exists")
    }
    await rename(temporaryDirectory, outputDirectory)
    return {
      status: "ready",
      candidateId: values.get("--candidate-id"),
      targetCount: built.evidence.length,
    }
  } catch {
    return reject("installer_native_evidence_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await runInstallerNativeEvidenceCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}
