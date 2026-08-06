#!/usr/bin/env node
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  collectInstallerFinalizedAssets,
  verifyInstallerFinalizedAssets,
} from "./lib/installer-finalized-assets.mjs"
import { parseExactOptions, readBoundedJson } from "./lib/installer-native-cli.mjs"

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

async function collect(values) {
  const [artifacts, verifiers] = await Promise.all([
    readBoundedJson(values.get("--artifact-receipts")),
    readBoundedJson(values.get("--verifier-receipts")),
  ])
  if (!artifacts || !verifiers) return reject("installer_finalized_input_unsafe")
  const result = await collectInstallerFinalizedAssets({
    candidateId: values.get("--candidate-id"),
    releaseTag: values.get("--release-tag"),
    assetRoot: values.get("--asset-root"),
    artifacts,
    verifiers,
  })
  if (result.status !== "ready") return result
  const outputDirectory = resolve(values.get("--output-dir"))
  const parent = await lstat(dirname(outputDirectory)).catch(() => undefined)
  if (
    !parent?.isDirectory() ||
    parent.isSymbolicLink() ||
    (await lstat(outputDirectory).catch(() => undefined))
  ) {
    return reject("installer_finalized_output_unsafe")
  }
  const temporaryDirectory = `${outputDirectory}.tmp-${process.pid}`
  try {
    await mkdir(temporaryDirectory, { mode: 0o700 })
    await writeFile(
      join(temporaryDirectory, "installer-finalized-assets.json"),
      `${JSON.stringify(result.inventory)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    )
    await rename(temporaryDirectory, outputDirectory)
    return {
      status: "ready",
      candidateId: result.inventory.candidateId,
      assetCount: result.inventory.assetCount,
    }
  } catch {
    return reject("installer_finalized_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function runInstallerFinalizedAssetsCli(argv) {
  if (argv[0] === "collect") {
    const values = parseExactOptions(argv.slice(1), [
      "--candidate-id",
      "--release-tag",
      "--asset-root",
      "--artifact-receipts",
      "--verifier-receipts",
      "--output-dir",
    ])
    return values ? collect(values) : reject("installer_finalized_arguments_invalid")
  }
  if (argv[0] === "verify") {
    const values = parseExactOptions(argv.slice(1), ["--inventory", "--asset-root"])
    if (!values) return reject("installer_finalized_arguments_invalid")
    const inventory = await readBoundedJson(values.get("--inventory"))
    return inventory
      ? verifyInstallerFinalizedAssets({ inventory, assetRoot: values.get("--asset-root") })
      : reject("installer_finalized_input_unsafe")
  }
  return reject("installer_finalized_arguments_invalid")
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await runInstallerFinalizedAssetsCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready" && result.status !== "verified") process.exitCode = 1
}
