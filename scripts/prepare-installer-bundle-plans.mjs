#!/usr/bin/env node
import { constants as fsConstants } from "node:fs"
import { lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildInstallerPlatformBundlePlans } from "./lib/installer-bundle-plan.mjs"

const INPUT_LIMIT = 2 * 1024 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function parseArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 4 ||
    argv[0] !== "--input" ||
    argv[2] !== "--output-dir" ||
    typeof argv[1] !== "string" ||
    typeof argv[3] !== "string"
  ) {
    return reject("installer_bundle_plan_arguments_invalid")
  }
  return { status: "parsed", inputPath: argv[1], outputDirectory: resolve(argv[3]) }
}

async function readInput(path) {
  let file
  try {
    const resolved = resolve(path)
    const metadata = await lstat(resolved, { bigint: true })
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size <= 0n ||
      metadata.size > BigInt(INPUT_LIMIT)
    ) {
      return reject("installer_bundle_plan_input_unsafe")
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
      return reject("installer_bundle_plan_input_changed")
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { status: "ready", value: JSON.parse(text) }
  } catch {
    return reject("installer_bundle_plan_input_unsafe")
  } finally {
    await file?.close().catch(() => undefined)
  }
}

export async function runInstallerBundlePlanCli(argv) {
  const parsed = parseArguments(argv)
  if (parsed.status !== "parsed") return parsed
  if (await lstat(parsed.outputDirectory).catch(() => undefined)) {
    return reject("installer_bundle_plan_output_exists")
  }
  const parent = await lstat(dirname(parsed.outputDirectory)).catch(() => undefined)
  if (!parent?.isDirectory() || parent.isSymbolicLink()) {
    return reject("installer_bundle_plan_output_parent_unsafe")
  }
  const input = await readInput(parsed.inputPath)
  if (input.status !== "ready") return input
  const built = buildInstallerPlatformBundlePlans(input.value)
  if (built.status !== "ready") return built

  const temporaryDirectory = `${parsed.outputDirectory}.tmp-${process.pid}`
  try {
    await mkdir(temporaryDirectory, { mode: 0o700 })
    for (const plan of built.plans) {
      await writeFile(`${temporaryDirectory}/${plan.target}.json`, `${JSON.stringify(plan)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
    }
    if (await lstat(parsed.outputDirectory).catch(() => undefined)) {
      return reject("installer_bundle_plan_output_exists")
    }
    await rename(temporaryDirectory, parsed.outputDirectory)
    return {
      status: "ready",
      packageVersion: input.value.packageVersion,
      targets: built.plans.map((plan) => plan.target),
    }
  } catch {
    return reject("installer_bundle_plan_output_failed")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  const result = await runInstallerBundlePlanCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main()
