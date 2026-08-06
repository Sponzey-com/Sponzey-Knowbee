import { createHash, randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
} from "node:fs/promises"
import { basename, join, resolve, sep } from "node:path"

import {
  reduceInstallerTransaction,
  startInstallerTransaction,
} from "../../packages/core/src/release/installer-transaction.js"

import {
  acquireInstallerLifecycleLock,
  ensureInstallRootMarker,
  releaseInstallerLifecycleLock,
} from "./lifecycle.mjs"
import { acquireInstallerTransactionStore } from "./transaction-store.mjs"

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const TARGET = /^(?:darwin-(?:arm64|x64)|linux-x64|win32-(?:arm64|x64))$/u
const SHA256_ID = /^sha256:[a-f0-9]{64}$/u
const PROFILE_KEY = /^[a-z0-9_-]{1,160}$/u
export const ACTIVE_PROFILE_RECEIPT = ".knowbee-active-profile"

class InstallApplicationError extends Error {
  constructor(reasonCode) {
    super(reasonCode)
    this.reasonCode = reasonCode
  }
}

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

async function safeDirectory(path, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 })
  const metadata = await lstat(path).catch(() => undefined)
  return Boolean(metadata?.isDirectory() && !metadata.isSymbolicLink())
}

async function copyRegularTree(source, destination) {
  if (!(await safeDirectory(source))) throw new InstallApplicationError("install_source_unsafe")
  await mkdir(destination, { recursive: true, mode: 0o755 })
  const entries = await readdir(source, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  for (const entry of entries) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)
    const metadata = await lstat(sourcePath)
    if (metadata.isSymbolicLink()) throw new InstallApplicationError("install_source_unsafe")
    if (metadata.isDirectory()) {
      await copyRegularTree(sourcePath, destinationPath)
    } else if (metadata.isFile()) {
      await copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL)
      await chmod(destinationPath, metadata.mode & 0o111 ? 0o755 : 0o644)
    } else {
      throw new InstallApplicationError("install_source_unsafe")
    }
  }
}

async function readBoundedRegularFile(path, maximumBytes) {
  const metadata = await lstat(path).catch(() => undefined)
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size === 0 ||
    metadata.size > maximumBytes
  ) {
    throw new InstallApplicationError("install_receipt_invalid")
  }
  return readFile(path)
}

async function matchingInventory(leftPath, rightPath) {
  try {
    const [left, right] = await Promise.all([
      readBoundedRegularFile(leftPath, 16 * 1024 * 1024),
      readBoundedRegularFile(rightPath, 16 * 1024 * 1024),
    ])
    return left.equals(right)
  } catch {
    return false
  }
}

function operationKey(candidate, profileKey) {
  return createHash("sha256")
    .update(
      `${candidate.target}\0${candidate.releaseVersion}\0${candidate.manifestSha256}\0${profileKey}`,
    )
    .digest("hex")
}

function eventFor(state, candidate, index, type, receiptRef, extra = {}) {
  return {
    eventId: `install-${index}-${type}`,
    operationId: state.operationId,
    targetFingerprint: candidate.manifestSha256,
    expectedRevision: state.revision,
    type,
    ...(receiptRef === undefined ? {} : { receiptRef }),
    ...extra,
  }
}

async function saveTransition(store, state, event) {
  const reduced = reduceInstallerTransaction(state, event)
  if (reduced.status !== "applied") throw new InstallApplicationError(reduced.reasonCode)
  const saved = await store.save(reduced.state)
  if (saved.status !== "saved" && saved.status !== "unchanged") {
    throw new InstallApplicationError(saved.reasonCode)
  }
  return reduced.state
}

async function readCurrentVersion(installRoot, windowsPointer = false) {
  if (windowsPointer) {
    try {
      const value = (await readFile(join(installRoot, "current-version"), "utf8")).trim()
      return VERSION.test(value) ? value : null
    } catch {
      return null
    }
  }
  try {
    const value = await readlink(join(installRoot, "current"))
    const prefix = `versions${sep}`
    return value.startsWith(prefix) && basename(value) === value.slice(prefix.length)
      ? basename(value)
      : null
  } catch {
    return null
  }
}

async function writeAtomicText(path, content, token, mode = 0o600) {
  const temporaryPath = `${path}.tmp.${token}`
  await rm(temporaryPath, { force: true })
  const file = await open(temporaryPath, "wx", mode)
  try {
    await file.writeFile(content, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(temporaryPath, path)
}

function windowsStableLauncher() {
  return `@echo off\r
setlocal EnableExtensions DisableDelayedExpansion\r
set "KNOWBEE_VERSION="\r
for /f "usebackq delims=" %%V in ("%~dp0..\\current-version") do set "KNOWBEE_VERSION=%%V"\r
if not defined KNOWBEE_VERSION exit /b 1\r
set "KNOWBEE_INVALID="\r
for /f "delims=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-" %%C in ("%KNOWBEE_VERSION%") do set "KNOWBEE_INVALID=%%C"\r
if defined KNOWBEE_INVALID exit /b 1\r
call "%~dp0..\\versions\\%KNOWBEE_VERSION%\\bin\\knowbee.cmd" %*\r
exit /b %ERRORLEVEL%\r
`
}

async function replaceSymlink(linkPath, target, token) {
  const temporaryPath = `${linkPath}.tmp.${token}`
  await rm(temporaryPath, { force: true })
  await symlink(target, temporaryPath)
  await rename(temporaryPath, linkPath)
}

async function restorePosixPointers({
  installRoot,
  launcherDirectory,
  launcherName,
  previousReleaseVersion,
  token,
}) {
  if (launcherName === "knowbee.cmd") {
    if (previousReleaseVersion) {
      await writeAtomicText(
        join(installRoot, "current-version"),
        `${previousReleaseVersion}\n`,
        token,
      )
    } else {
      await rm(join(installRoot, "current-version"), { force: true })
      await rm(join(launcherDirectory, launcherName), { force: true })
    }
    return { status: "rolled_back" }
  }
  if (previousReleaseVersion) {
    await replaceSymlink(
      join(installRoot, "current"),
      join("versions", previousReleaseVersion),
      token,
    )
    await replaceSymlink(
      join(launcherDirectory, launcherName),
      join(installRoot, "current", "bin", launcherName),
      token,
    )
  } else {
    await rm(join(installRoot, "current"), { force: true })
    await rm(join(launcherDirectory, launcherName), { force: true })
  }
  return { status: "rolled_back" }
}

function validateInput(input) {
  return (
    typeof input?.sourceBundleRoot === "string" &&
    typeof input.installRoot === "string" &&
    typeof input.installerStateRoot === "string" &&
    typeof input.launcherDirectory === "string" &&
    typeof input.applicationStateRoot === "string" &&
    typeof input.candidate === "object" &&
    input.candidate !== null &&
    VERSION.test(input.candidate.releaseVersion) &&
    TARGET.test(input.candidate.target) &&
    SHA256_ID.test(input.candidate.manifestSha256) &&
    input.candidate.entrypoint ===
      (input.candidate.target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee") &&
    Number.isSafeInteger(input.owner?.pid) &&
    typeof input.owner?.token === "string" &&
    Number.isSafeInteger(input.owner?.startedAt) &&
    typeof input.isProcessAlive === "function" &&
    (input.profileKey === undefined || PROFILE_KEY.test(input.profileKey)) &&
    (input.complete === undefined || typeof input.complete === "function")
  )
}

export async function applyInstallerCandidate(input) {
  if (!validateInput(input)) return reject("install_application_input_invalid")
  const sourceBundleRoot = resolve(input.sourceBundleRoot)
  const installRoot = resolve(input.installRoot)
  const installerStateRoot = resolve(input.installerStateRoot)
  const launcherDirectory = resolve(input.launcherDirectory)
  const candidate = Object.freeze({ ...input.candidate })
  const profileKey = input.profileKey ?? "legacy"
  const key = operationKey(candidate, profileKey)
  const windowsPointer = candidate.target.startsWith("win32-")
  const versionPath = join(installRoot, "versions", candidate.releaseVersion)
  const sourceInventory = join(sourceBundleRoot, "bundle-inventory.json")
  const installedInventory = join(versionPath, "bundle-inventory.json")

  const activeProfile = await readFile(join(installRoot, ACTIVE_PROFILE_RECEIPT), "utf8")
    .then((value) => value.trim())
    .catch(() => undefined)
  if (
    (await readCurrentVersion(installRoot, windowsPointer)) === candidate.releaseVersion &&
    (await matchingInventory(sourceInventory, installedInventory)) &&
    (!input.complete || activeProfile === profileKey)
  ) {
    return { status: "already_active", releaseVersion: candidate.releaseVersion, operationKey: key }
  }

  if (!(await safeDirectory(sourceBundleRoot))) return reject("install_source_unsafe")
  if (!(await safeDirectory(installRoot, true))) return reject("install_root_unsafe")
  const lifecycleLock = await acquireInstallerLifecycleLock({
    installRoot,
    owner: input.owner,
    isProcessAlive: input.isProcessAlive,
  })
  if (lifecycleLock.status !== "acquired") return lifecycleLock
  const marker = await ensureInstallRootMarker(installRoot)
  if (marker.status !== "ready") {
    await releaseInstallerLifecycleLock(lifecycleLock, input.owner)
    return marker
  }
  await mkdir(join(installRoot, "versions"), { recursive: true, mode: 0o755 })
  await mkdir(launcherDirectory, { recursive: true, mode: 0o755 })

  const operationStateRoot = join(installerStateRoot, key)
  const acquired = await acquireInstallerTransactionStore({
    stateRoot: operationStateRoot,
    operationId: `installer:${key}`,
    owner: input.owner,
    isProcessAlive: input.isProcessAlive,
  })
  if (acquired.status !== "acquired") {
    await releaseInstallerLifecycleLock(lifecycleLock, input.owner)
    return acquired
  }

  const token = `${process.pid}.${randomUUID()}`
  const temporaryVersionPath = join(
    installRoot,
    "versions",
    `.${candidate.releaseVersion}.${token}`,
  )
  let previousReleaseVersion = null
  let pointerChanged = false
  try {
    let state = startInstallerTransaction({
      operationId: `installer:${key}`,
      idempotencyKey: `candidate:${key}`,
      targetFingerprint: candidate.manifestSha256,
      desiredVersion: candidate.releaseVersion,
    })
    const initialSave = await acquired.store.save(state)
    if (initialSave.status !== "saved" && initialSave.status !== "unchanged") {
      throw new InstallApplicationError(initialSave.reasonCode)
    }
    state = await saveTransition(
      acquired.store,
      state,
      eventFor(state, candidate, 1, "preflight_passed", `preflight:${candidate.target}`),
    )
    state = await saveTransition(
      acquired.store,
      state,
      eventFor(state, candidate, 2, "bundle_downloaded", `download:${key}`),
    )
    state = await saveTransition(
      acquired.store,
      state,
      eventFor(state, candidate, 3, "bundle_verified", `verification:${key}`),
    )

    const existingVersion = await lstat(versionPath).catch(() => undefined)
    if (existingVersion) {
      if (
        !existingVersion.isDirectory() ||
        existingVersion.isSymbolicLink() ||
        !(await matchingInventory(sourceInventory, installedInventory))
      ) {
        throw new InstallApplicationError("install_version_conflict")
      }
    } else {
      await copyRegularTree(sourceBundleRoot, temporaryVersionPath)
      if (
        !(await matchingInventory(
          sourceInventory,
          join(temporaryVersionPath, "bundle-inventory.json"),
        ))
      ) {
        throw new InstallApplicationError("install_stage_inventory_mismatch")
      }
      await rename(temporaryVersionPath, versionPath)
    }
    state = await saveTransition(
      acquired.store,
      state,
      eventFor(state, candidate, 4, "stage_prepared", `stage:${key}`),
    )

    previousReleaseVersion = await readCurrentVersion(installRoot, windowsPointer)
    if (windowsPointer) {
      await writeAtomicText(
        join(installRoot, "current-version"),
        `${candidate.releaseVersion}\n`,
        token,
      )
      pointerChanged = true
      await writeAtomicText(
        join(launcherDirectory, "knowbee.cmd"),
        windowsStableLauncher(),
        token,
        0o644,
      )
    } else {
      await replaceSymlink(
        join(installRoot, "current"),
        join("versions", candidate.releaseVersion),
        token,
      )
      pointerChanged = true
      await replaceSymlink(
        join(launcherDirectory, "knowbee"),
        join(installRoot, "current", candidate.entrypoint),
        token,
      )
    }
    state = await saveTransition(
      acquired.store,
      state,
      eventFor(state, candidate, 5, "activation_completed", `activation:${key}`, {
        previousReleaseId: previousReleaseVersion,
      }),
    )
    if (input.complete) {
      const completed = await input.complete({
        state,
        store: acquired.store,
        rollbackFilesystem: () =>
          restorePosixPointers({
            installRoot,
            launcherDirectory,
            launcherName: candidate.target.startsWith("win32-") ? "knowbee.cmd" : "knowbee",
            previousReleaseVersion,
            token,
          }),
      })
      if (completed.status === "committed") {
        await writeAtomicText(join(installRoot, ACTIVE_PROFILE_RECEIPT), `${profileKey}\n`, token)
      }
      return completed
    }
    return {
      status: "activated",
      releaseVersion: candidate.releaseVersion,
      previousReleaseVersion,
      operationKey: key,
      transactionRevision: state.revision,
      next: "service_registration",
    }
  } catch (error) {
    await rm(temporaryVersionPath, { recursive: true, force: true })
    if (pointerChanged) {
      await restorePosixPointers({
        installRoot,
        launcherDirectory,
        launcherName: candidate.target.startsWith("win32-") ? "knowbee.cmd" : "knowbee",
        previousReleaseVersion,
        token,
      }).catch(() => undefined)
    }
    return error instanceof InstallApplicationError
      ? reject(error.reasonCode)
      : reject("install_application_failed")
  } finally {
    await acquired.store.close()
    await releaseInstallerLifecycleLock(lifecycleLock, input.owner)
  }
}
