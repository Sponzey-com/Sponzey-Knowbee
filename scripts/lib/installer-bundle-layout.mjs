import { execFile as execFileCallback } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { INSTALLER_NODE_RUNTIME, INSTALLER_PLATFORM_BY_TARGET } from "./installer-platforms.mjs"

const execFile = promisify(execFileCallback)
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

class BundleLayoutError extends Error {
  constructor(reasonCode) {
    super(reasonCode)
    this.reasonCode = reasonCode
  }
}

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function parsePlan(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.kind !== "knowbee.installer.bundle_plan" ||
    value.schemaVersion !== 1 ||
    typeof value.packageVersion !== "string" ||
    !VERSION.test(value.packageVersion) ||
    typeof value.target !== "string"
  ) {
    return undefined
  }
  const profile = INSTALLER_PLATFORM_BY_TARGET[value.target]
  const entrypoint = profile?.os === "win32" ? "bin/knowbee.cmd" : "bin/knowbee"
  if (
    !profile ||
    value.archive !== profile.archive ||
    value.outputName !== `knowbee-${value.packageVersion}-${profile.target}.${profile.archive}` ||
    value.entrypoint !== entrypoint ||
    typeof value.node !== "object" ||
    value.node === null ||
    value.node.version !== INSTALLER_NODE_RUNTIME.version ||
    value.node.moduleAbi !== INSTALLER_NODE_RUNTIME.moduleAbi ||
    !Array.isArray(value.inputs) ||
    value.inputs.length === 0 ||
    (value.yeonjang?.status === "included" &&
      value.yeonjang.packageName !== profile.yeonjangPackage)
  ) {
    return undefined
  }
  return { ...value, profile, entrypoint }
}

async function assertSafeDirectory(path, reasonCode) {
  const metadata = await lstat(path).catch(() => undefined)
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
    throw new BundleLayoutError(reasonCode)
  }
}

async function copyRegularTree(source, destination) {
  await assertSafeDirectory(source, "bundle_layout_source_unsafe")
  await mkdir(destination, { recursive: true, mode: 0o755 })
  const entries = await readdir(source, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  for (const entry of entries) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)
    const metadata = await lstat(sourcePath)
    if (metadata.isSymbolicLink()) throw new BundleLayoutError("bundle_layout_source_unsafe")
    if (metadata.isDirectory()) {
      await copyRegularTree(sourcePath, destinationPath)
      continue
    }
    if (!metadata.isFile()) throw new BundleLayoutError("bundle_layout_source_unsafe")
    await copyFile(sourcePath, destinationPath)
    await chmod(destinationPath, metadata.mode & 0o111 ? 0o755 : 0o644)
  }
}

async function readApplicationIdentity(applicationDirectory) {
  let bytes
  try {
    bytes = await readFile(join(applicationDirectory, "package.json"))
  } catch {
    throw new BundleLayoutError("bundle_application_identity_mismatch")
  }
  if (bytes.byteLength === 0 || bytes.byteLength > 1024 * 1024) {
    throw new BundleLayoutError("bundle_application_identity_mismatch")
  }
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new BundleLayoutError("bundle_application_identity_mismatch")
  }
}

async function verifyApplicationComponents(applicationDirectory, packageVersion) {
  for (const packageName of ["@sponzey/cli", "@sponzey/core", "@sponzey/webui"]) {
    const packagePath = join(
      applicationDirectory,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    )
    let identity
    try {
      const bytes = await readFile(packagePath)
      if (bytes.byteLength === 0 || bytes.byteLength > 1024 * 1024) throw new Error("invalid")
      identity = JSON.parse(bytes.toString("utf8"))
    } catch {
      throw new BundleLayoutError(`bundle_application_component_mismatch:${packageName}`)
    }
    if (identity.name !== packageName || identity.version !== packageVersion) {
      throw new BundleLayoutError(`bundle_application_component_mismatch:${packageName}`)
    }
  }
}

async function verifyYeonjangComponent(applicationDirectory, plan) {
  if (plan.yeonjang.status !== "included") return
  const packageDirectory = join(
    applicationDirectory,
    "node_modules",
    ...plan.yeonjang.packageName.split("/"),
  )
  let packageIdentity
  let releaseIdentity
  try {
    packageIdentity = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"))
    releaseIdentity = JSON.parse(
      await readFile(join(packageDirectory, "release-identity.json"), "utf8"),
    )
  } catch {
    throw new BundleLayoutError("bundle_yeonjang_identity_mismatch")
  }
  const profile = plan.profile
  const appBundle = releaseIdentity.applicationBundle
  const expectedBinaryRelativePath =
    profile.os === "darwin" && appBundle?.relativePath === "app/Yeonjang.app"
      ? "app/Yeonjang.app/Contents/MacOS/Yeonjang"
      : `bin/${profile.binaryName}`
  const observedBinaryRelativePath =
    releaseIdentity.binary?.relativePath ?? `bin/${profile.binaryName}`
  if (
    packageIdentity.name !== profile.yeonjangPackage ||
    packageIdentity.version !== plan.packageVersion ||
    packageIdentity.os?.length !== 1 ||
    packageIdentity.os[0] !== profile.os ||
    packageIdentity.cpu?.length !== 1 ||
    packageIdentity.cpu[0] !== profile.cpu ||
    (profile.libc &&
      (packageIdentity.libc?.length !== 1 || packageIdentity.libc[0] !== profile.libc)) ||
    releaseIdentity.schemaId !== "yeonjang.package-identity.v1" ||
    releaseIdentity.schemaVersion !== 1 ||
    releaseIdentity.packageVersion !== plan.packageVersion ||
    releaseIdentity.target?.key !== profile.target ||
    releaseIdentity.target?.os !== profile.os ||
    releaseIdentity.target?.cpu !== profile.cpu ||
    (profile.libc && releaseIdentity.target?.libc !== profile.libc) ||
    (appBundle !== undefined &&
      (profile.os !== "darwin" || appBundle?.relativePath !== "app/Yeonjang.app")) ||
    observedBinaryRelativePath !== expectedBinaryRelativePath ||
    releaseIdentity.binary?.name !== expectedBinaryRelativePath.split("/").at(-1) ||
    releaseIdentity.binary?.targetKey !== profile.target ||
    typeof releaseIdentity.binary?.sha256 !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(releaseIdentity.binary.sha256) ||
    !Number.isSafeInteger(releaseIdentity.binary?.sizeBytes) ||
    releaseIdentity.binary.sizeBytes <= 0
  ) {
    throw new BundleLayoutError("bundle_yeonjang_identity_mismatch")
  }
  const binaryPath = join(packageDirectory, ...expectedBinaryRelativePath.split("/"))
  const metadata = await lstat(binaryPath).catch(() => undefined)
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new BundleLayoutError("bundle_yeonjang_identity_mismatch")
  }
  const observed = await sha256File(binaryPath)
  if (
    observed.sizeBytes !== releaseIdentity.binary.sizeBytes ||
    `sha256:${observed.sha256}` !== releaseIdentity.binary.sha256
  ) {
    throw new BundleLayoutError("bundle_yeonjang_identity_mismatch")
  }
}

function nodeExecutable(profile, nodeRoot) {
  return profile.os === "win32" ? join(nodeRoot, "node.exe") : join(nodeRoot, "bin", "node")
}

async function verifyPrivateNode(profile, nodeRuntimeDirectory) {
  const executable = nodeExecutable(profile, nodeRuntimeDirectory)
  const metadata = await lstat(executable).catch(() => undefined)
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new BundleLayoutError("bundle_private_node_invalid")
  }
  try {
    const result = await execFile(executable, ["--version"], {
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      env: {},
      windowsHide: true,
    })
    if (result.stdout.trim() !== `v${INSTALLER_NODE_RUNTIME.version}` || result.stderr !== "") {
      throw new BundleLayoutError("bundle_private_node_version_mismatch")
    }
    const abi = await execFile(executable, ["--print", "process.versions.modules"], {
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      env: {},
      windowsHide: true,
    })
    if (abi.stdout.trim() !== String(INSTALLER_NODE_RUNTIME.moduleAbi) || abi.stderr !== "") {
      throw new BundleLayoutError("bundle_private_node_abi_mismatch")
    }
  } catch (error) {
    if (error instanceof BundleLayoutError) throw error
    throw new BundleLayoutError("bundle_private_node_invalid")
  }
}

function posixLauncher() {
  return `#!/bin/sh
set -eu
SCRIPT_PATH=$0
LINK_COUNT=0
while [ -L "$SCRIPT_PATH" ]; do
  LINK_COUNT=$((LINK_COUNT + 1))
  [ "$LINK_COUNT" -le 32 ] || exit 1
  LINK_TARGET=$(readlink "$SCRIPT_PATH") || exit 1
  case "$LINK_TARGET" in
    /*) SCRIPT_PATH=$LINK_TARGET ;;
    *) SCRIPT_PATH=$(dirname -- "$SCRIPT_PATH")/$LINK_TARGET ;;
  esac
done
SCRIPT_DIRECTORY=$(CDPATH= cd -P -- "$(dirname -- "$SCRIPT_PATH")" && pwd) || exit 1
ROOT=$(CDPATH= cd -P -- "$SCRIPT_DIRECTORY/.." && pwd) || exit 1
if [ "\${1:-}" = "installer" ] && [ "\${2:-}" = "apply" ]; then
  exec "$ROOT/runtime/node/bin/node" "$ROOT/app/installer/apply.mjs" "$@"
fi
if [ "\${1:-}" = "uninstall" ]; then
  exec "$ROOT/runtime/node/bin/node" "$ROOT/app/installer/uninstall.mjs" "$@"
fi
exec "$ROOT/runtime/node/bin/node" "$ROOT/app/bin/knowbee.js" "$@"
`
}

function windowsLauncher() {
  return `@echo off\r
setlocal\r
set "ROOT=%~dp0.."\r
if "%~1"=="installer" if "%~2"=="apply" (\r
  "%ROOT%\\runtime\\node\\node.exe" "%ROOT%\\app\\installer\\apply.mjs" %*\r
  exit /b %ERRORLEVEL%\r
)\r
if "%~1"=="uninstall" (\r
  set "UNINSTALL_TMP=%TEMP%\\knowbee-uninstall-%RANDOM%-%RANDOM%"\r
  mkdir "%UNINSTALL_TMP%" || exit /b 1\r
  copy /y "%ROOT%\\runtime\\node\\node.exe" "%UNINSTALL_TMP%\\node.exe" >nul || exit /b 1\r
  copy /y "%ROOT%\\app\\installer\\uninstall.mjs" "%UNINSTALL_TMP%\\uninstall.mjs" >nul || exit /b 1\r
  copy /y "%ROOT%\\app\\installer\\lifecycle.mjs" "%UNINSTALL_TMP%\\lifecycle.mjs" >nul || exit /b 1\r
  copy /y "%ROOT%\\app\\installer\\windows-scheduled-task.ps1" "%UNINSTALL_TMP%\\windows-scheduled-task.ps1" >nul || exit /b 1\r
  "%UNINSTALL_TMP%\\node.exe" "%UNINSTALL_TMP%\\uninstall.mjs" %*\r
  set "UNINSTALL_RESULT=%ERRORLEVEL%"\r
  del /q "%UNINSTALL_TMP%\\node.exe" "%UNINSTALL_TMP%\\uninstall.mjs" "%UNINSTALL_TMP%\\lifecycle.mjs" "%UNINSTALL_TMP%\\windows-scheduled-task.ps1" >nul 2>&1\r
  rmdir "%UNINSTALL_TMP%" >nul 2>&1\r
  exit /b %UNINSTALL_RESULT%\r
)\r
"%ROOT%\\runtime\\node\\node.exe" "%ROOT%\\app\\bin\\knowbee.js" %*\r
exit /b %ERRORLEVEL%\r
`
}

async function sha256File(path) {
  const hash = createHash("sha256")
  let sizeBytes = 0
  for await (const chunk of createReadStream(path)) {
    sizeBytes += chunk.byteLength
    hash.update(chunk)
  }
  return { sizeBytes, sha256: hash.digest("hex") }
}

async function collectInventory(root, current = root, output = []) {
  const entries = await readdir(current, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  for (const entry of entries) {
    const path = join(current, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) throw new BundleLayoutError("bundle_layout_output_unsafe")
    if (metadata.isDirectory()) {
      await collectInventory(root, path, output)
      continue
    }
    if (!metadata.isFile()) throw new BundleLayoutError("bundle_layout_output_unsafe")
    const relativePath = relative(root, path).split(sep).join("/")
    if (relativePath === "bundle-inventory.json") continue
    const identity = await sha256File(path)
    output.push({ path: relativePath, ...identity, executable: (metadata.mode & 0o111) !== 0 })
  }
  return output
}

async function copyInstallerApplication(outputDirectory) {
  const destination = join(outputDirectory, "app", "installer")
  await mkdir(destination, { recursive: true, mode: 0o755 })
  for (const name of [
    "apply.mjs",
    "browser.mjs",
    "install-application.mjs",
    "lifecycle.mjs",
    "optional-components.mjs",
    "posix-service.mjs",
    "uninstall.mjs",
    "user-environment.mjs",
    "windows-service.mjs",
    "windows-scheduled-task.ps1",
    "windows-open-browser.ps1",
    "windows-user-path.ps1",
  ]) {
    await copyFile(join(repositoryRoot, "installer", "application", name), join(destination, name))
    await chmod(join(destination, name), name === "apply.mjs" ? 0o755 : 0o644)
  }
  await copyFile(
    join(repositoryRoot, "scripts", "lib", "installer-transaction-store.mjs"),
    join(destination, "transaction-store.mjs"),
  )
  await chmod(join(destination, "transaction-store.mjs"), 0o644)

  const domainDestination = join(outputDirectory, "packages", "core", "src", "release")
  await mkdir(domainDestination, { recursive: true, mode: 0o755 })
  await copyFile(
    join(repositoryRoot, "packages", "core", "src", "release", "installer-transaction.js"),
    join(domainDestination, "installer-transaction.js"),
  )
  await chmod(join(domainDestination, "installer-transaction.js"), 0o644)
}

export async function assembleInstallerBundleLayout(input) {
  const plan = parsePlan(input?.plan)
  if (
    !plan ||
    typeof input.nodeRuntimeDirectory !== "string" ||
    typeof input.applicationDirectory !== "string" ||
    typeof input.outputDirectory !== "string"
  ) {
    return reject("bundle_layout_input_invalid")
  }
  const nodeRuntimeDirectory = resolve(input.nodeRuntimeDirectory)
  const applicationDirectory = resolve(input.applicationDirectory)
  const outputDirectory = resolve(input.outputDirectory)
  if (await lstat(outputDirectory).catch(() => undefined))
    return reject("bundle_layout_output_exists")

  try {
    await assertSafeDirectory(nodeRuntimeDirectory, "bundle_private_node_invalid")
    await assertSafeDirectory(applicationDirectory, "bundle_application_invalid")
    const identity = await readApplicationIdentity(applicationDirectory)
    if (identity.name !== "@sponzey/knowbee" || identity.version !== plan.packageVersion) {
      return reject("bundle_application_identity_mismatch")
    }
    await verifyApplicationComponents(applicationDirectory, plan.packageVersion)
    await verifyYeonjangComponent(applicationDirectory, plan)
    await verifyPrivateNode(plan.profile, nodeRuntimeDirectory)

    await mkdir(outputDirectory, { mode: 0o755 })
    await copyRegularTree(nodeRuntimeDirectory, join(outputDirectory, "runtime", "node"))
    await copyRegularTree(applicationDirectory, join(outputDirectory, "app"))
    await copyInstallerApplication(outputDirectory)
    await mkdir(join(outputDirectory, "bin"), { recursive: true, mode: 0o755 })
    const launcherPath = join(outputDirectory, plan.entrypoint)
    await writeFile(
      launcherPath,
      plan.profile.os === "win32" ? windowsLauncher() : posixLauncher(),
      { encoding: "utf8", mode: plan.profile.os === "win32" ? 0o644 : 0o755, flag: "wx" },
    )

    const files = await collectInventory(outputDirectory)
    const inventory = {
      kind: "knowbee.installer.bundle_inventory",
      schemaVersion: 1,
      packageVersion: plan.packageVersion,
      target: plan.target,
      node: INSTALLER_NODE_RUNTIME,
      yeonjang:
        plan.yeonjang.status === "included"
          ? { ...plan.yeonjang, target: plan.target }
          : { status: "absent" },
      entrypoint: plan.entrypoint,
      files,
    }
    await writeFile(
      join(outputDirectory, "bundle-inventory.json"),
      `${JSON.stringify(inventory)}\n`,
      { encoding: "utf8", mode: 0o644, flag: "wx" },
    )
    return {
      status: "ready",
      layoutDirectory: outputDirectory,
      entrypoint: plan.entrypoint,
      fileCount: files.length,
    }
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true })
    return error instanceof BundleLayoutError
      ? reject(error.reasonCode)
      : reject("bundle_layout_build_failed")
  }
}
