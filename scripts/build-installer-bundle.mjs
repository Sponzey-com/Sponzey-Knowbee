#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, open, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { writeInstallerFilesystemBundle } from "./lib/installer-archive.mjs"
import { assembleInstallerBundleLayout } from "./lib/installer-bundle-layout.mjs"

const PLAN_LIMIT = 2 * 1024 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function parseArguments(argv) {
  const allowed = new Set(["--plan", "--node-runtime-dir", "--application-dir", "--output-dir"])
  if (!Array.isArray(argv) || argv.length !== allowed.size * 2) {
    return reject("installer_bundle_arguments_invalid")
  }
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (
      typeof option !== "string" ||
      !allowed.has(option) ||
      values.has(option) ||
      typeof value !== "string" ||
      value.length === 0
    ) {
      return reject("installer_bundle_arguments_invalid")
    }
    values.set(option, value)
  }
  return { status: "parsed", values }
}

async function readPlan(path) {
  const resolved = resolve(path)
  let file
  try {
    const metadata = await lstat(resolved, { bigint: true })
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size <= 0n ||
      metadata.size > BigInt(PLAN_LIMIT)
    ) {
      return reject("installer_bundle_plan_unsafe")
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(resolved, fsConstants.O_RDONLY | noFollow)
    const before = await file.stat({ bigint: true })
    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      return reject("installer_bundle_plan_changed")
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { status: "ready", plan: JSON.parse(text) }
  } catch {
    return reject("installer_bundle_plan_unsafe")
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function outputPath(value) {
  const outputDirectory = resolve(value)
  if (await lstat(outputDirectory).catch(() => undefined)) {
    return reject("installer_bundle_output_exists")
  }
  const parentMetadata = await lstat(dirname(outputDirectory)).catch(() => undefined)
  if (!parentMetadata?.isDirectory() || parentMetadata.isSymbolicLink()) {
    return reject("installer_bundle_output_parent_unsafe")
  }
  return { status: "ready", outputDirectory }
}

export async function runInstallerBundleCli(argv) {
  const parsed = parseArguments(argv)
  if (parsed.status !== "parsed") return parsed
  const destination = await outputPath(parsed.values.get("--output-dir"))
  if (destination.status !== "ready") return destination
  const loaded = await readPlan(parsed.values.get("--plan"))
  if (loaded.status !== "ready") return loaded

  const suffix = `${process.pid}-${randomUUID()}`
  const workDirectory = `${destination.outputDirectory}.work-${suffix}`
  const publishDirectory = `${destination.outputDirectory}.publish-${suffix}`
  try {
    const layout = await assembleInstallerBundleLayout({
      plan: loaded.plan,
      nodeRuntimeDirectory: parsed.values.get("--node-runtime-dir"),
      applicationDirectory: parsed.values.get("--application-dir"),
      outputDirectory: workDirectory,
    })
    if (layout.status !== "ready") return layout
    const archived = await writeInstallerFilesystemBundle({
      plan: loaded.plan,
      layoutDirectory: workDirectory,
      outputDirectory: publishDirectory,
    })
    if (archived.status !== "ready") return archived
    await writeFile(
      `${publishDirectory}/artifact-receipt.json`,
      `${JSON.stringify(archived.artifact)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    )
    if (await lstat(destination.outputDirectory).catch(() => undefined)) {
      return reject("installer_bundle_output_exists")
    }
    await rename(publishDirectory, destination.outputDirectory)
    return { status: "ready", target: archived.artifact.target, artifact: archived.artifact }
  } catch {
    return reject("installer_bundle_build_failed")
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rm(publishDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  const result = await runInstallerBundleCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main()
}
