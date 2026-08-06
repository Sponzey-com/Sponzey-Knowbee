#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { INSTALLER_PLATFORM_BY_TARGET } from "./lib/installer-platforms.mjs"

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const MAIN_PACKAGES = Object.freeze(["@sponzey/cli", "@sponzey/core", "@sponzey/webui"])

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function parseArguments(argv) {
  const names = new Set(["--package", "--input-dir", "--package-version", "--target"])
  if (!Array.isArray(argv) || argv.length !== names.size * 2) {
    return reject("installer_application_package_arguments_invalid")
  }
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (
      typeof name !== "string" ||
      !names.has(name) ||
      values.has(name) ||
      typeof value !== "string" ||
      value.length === 0
    ) {
      return reject("installer_application_package_arguments_invalid")
    }
    values.set(name, value)
  }
  const packageVersion = values.get("--package-version")
  const target = values.get("--target")
  if (!VERSION.test(packageVersion) || !INSTALLER_PLATFORM_BY_TARGET[target]) {
    return reject("installer_application_package_arguments_invalid")
  }
  return { status: "parsed", values, packageVersion, target }
}

function packageFileName(packageName, packageVersion) {
  return `${packageName.slice(1).replace("/", "-")}-${packageVersion}.tgz`
}

export async function runRewriteInstallerApplicationPackage(argv) {
  const parsed = parseArguments(argv)
  if (parsed.status !== "parsed") return parsed
  const packagePath = resolve(parsed.values.get("--package"))
  const inputDirectory = resolve(parsed.values.get("--input-dir"))
  const packageMetadata = await lstat(packagePath).catch(() => undefined)
  const inputMetadata = await lstat(inputDirectory).catch(() => undefined)
  if (
    !packageMetadata?.isFile() ||
    packageMetadata.isSymbolicLink() ||
    packageMetadata.size <= 0 ||
    packageMetadata.size > 1024 * 1024 ||
    !inputMetadata?.isDirectory() ||
    inputMetadata.isSymbolicLink()
  ) {
    return reject("installer_application_package_input_unsafe")
  }
  let packageJson
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"))
  } catch {
    return reject("installer_application_package_identity_invalid")
  }
  if (packageJson?.name !== "@sponzey/knowbee" || packageJson.version !== parsed.packageVersion) {
    return reject("installer_application_package_identity_invalid")
  }
  const profile = INSTALLER_PLATFORM_BY_TARGET[parsed.target]
  const required = [...MAIN_PACKAGES, profile.yeonjangPackage]
  const specs = new Map()
  for (const packageName of required) {
    const fileName = packageFileName(packageName, parsed.packageVersion)
    const path = resolve(inputDirectory, fileName)
    const metadata = await lstat(path).catch(() => undefined)
    if (!metadata?.isFile() || metadata.isSymbolicLink()) {
      return reject("installer_application_package_tarball_unsafe")
    }
    const pathFromPackage = relative(dirname(packagePath), path).split(sep).join("/")
    specs.set(
      packageName,
      `file:${pathFromPackage.startsWith(".") ? pathFromPackage : `./${pathFromPackage}`}`,
    )
  }
  const rewritten = {
    ...packageJson,
    dependencies: Object.fromEntries(MAIN_PACKAGES.map((name) => [name, specs.get(name)])),
    optionalDependencies: { [profile.yeonjangPackage]: specs.get(profile.yeonjangPackage) },
  }
  const temporaryPath = `${packagePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(rewritten, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    })
    const current = await lstat(packagePath)
    if (
      current.dev !== packageMetadata.dev ||
      current.ino !== packageMetadata.ino ||
      current.size !== packageMetadata.size ||
      current.mtimeMs !== packageMetadata.mtimeMs
    ) {
      return reject("installer_application_package_changed")
    }
    await rename(temporaryPath, packagePath)
    return { status: "ready", target: parsed.target, packageVersion: parsed.packageVersion }
  } catch {
    return reject("installer_application_package_write_failed")
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

async function main() {
  const result = await runRewriteInstallerApplicationPackage(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main()
