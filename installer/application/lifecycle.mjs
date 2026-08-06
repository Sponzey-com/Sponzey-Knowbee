import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, open, readFile, readdir, rename, rm, rmdir } from "node:fs/promises"
import { basename, isAbsolute, join, resolve } from "node:path"

export const INSTALL_ROOT_MARKER = ".knowbee-install-root.json"
const ACTIVE_PROFILE_RECEIPT = ".knowbee-active-profile"

const INSTALLATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const TOKEN_HASH = /^[a-f0-9]{64}$/u

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

export function parseInstallerLifecycleArguments(values) {
  if (!Array.isArray(values)) return reject("installer_lifecycle_arguments_invalid")
  if (values.length === 1 && values[0] === "uninstall") {
    return { command: "uninstall", purge: false }
  }
  if (values.length === 2 && values[0] === "uninstall" && values[1] === "--purge") {
    return { command: "uninstall", purge: true }
  }
  return reject("installer_lifecycle_arguments_invalid")
}

function validMarker(value) {
  return (
    value?.kind === "knowbee.install_root" &&
    value.schemaVersion === 1 &&
    typeof value.installationId === "string" &&
    INSTALLATION_ID.test(value.installationId) &&
    Object.keys(value).length === 3
  )
}

async function readOwnedMarker(installRoot) {
  const markerPath = join(installRoot, INSTALL_ROOT_MARKER)
  const metadata = await lstat(markerPath).catch(() => undefined)
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size === 0 ||
    metadata.size > 4096
  )
    return undefined
  try {
    const value = JSON.parse(await readFile(markerPath, "utf8"))
    return validMarker(value) ? value : undefined
  } catch {
    return undefined
  }
}

export async function ensureInstallRootMarker(installRoot) {
  const existing = await lstat(join(installRoot, INSTALL_ROOT_MARKER)).catch(() => undefined)
  if (existing) {
    return (await readOwnedMarker(installRoot))
      ? { status: "ready" }
      : reject("install_root_marker_invalid")
  }
  const value = {
    kind: "knowbee.install_root",
    schemaVersion: 1,
    installationId: randomUUID(),
  }
  const temporaryPath = join(installRoot, `${INSTALL_ROOT_MARKER}.tmp.${randomUUID()}`)
  const file = await open(temporaryPath, "wx", 0o600)
  try {
    await file.writeFile(`${JSON.stringify(value)}\n`, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await rename(temporaryPath, join(installRoot, INSTALL_ROOT_MARKER))
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (error?.code !== "EEXIST" || !(await readOwnedMarker(installRoot))) throw error
  }
  return { status: "ready" }
}

function validateInput(input) {
  const installRoot = resolve(input?.installRoot ?? "")
  const stateRoot = resolve(input?.applicationStateRoot ?? "")
  const launcherDirectory = resolve(input?.launcherDirectory ?? "")
  return (
    (input?.platform === "darwin" || input?.platform === "linux" || input?.platform === "win32") &&
    isAbsolute(installRoot) &&
    basename(installRoot).toLowerCase() === "knowbee" &&
    input.installerStateRoot === join(input.installRoot, "installer-state") &&
    isAbsolute(launcherDirectory) &&
    isAbsolute(stateRoot) &&
    basename(stateRoot) === ".knowbee" &&
    typeof input.service?.stop === "function" &&
    Number.isSafeInteger(input.owner?.pid) &&
    input.owner.pid > 0 &&
    typeof input.owner.token === "string" &&
    input.owner.token.length > 0 &&
    Number.isSafeInteger(input.owner.startedAt) &&
    typeof input.isProcessAlive === "function" &&
    (input.purge === undefined || typeof input.purge === "boolean")
  )
}

function validLockOwner(value) {
  return (
    Number.isSafeInteger(value?.pid) &&
    value.pid > 0 &&
    typeof value?.tokenHash === "string" &&
    TOKEN_HASH.test(value.tokenHash) &&
    Number.isSafeInteger(value?.startedAt)
  )
}

async function readLockOwner(lockPath) {
  const ownerPath = join(lockPath, "owner.json")
  const metadata = await lstat(ownerPath).catch(() => undefined)
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size === 0 ||
    metadata.size > 4096
  )
    return undefined
  try {
    const value = JSON.parse(await readFile(ownerPath, "utf8"))
    return validLockOwner(value) ? value : undefined
  } catch {
    return undefined
  }
}

async function writeLockOwner(lockPath, owner) {
  const file = await open(join(lockPath, "owner.json"), "wx", 0o600)
  try {
    await file.writeFile(
      `${JSON.stringify({
        pid: owner.pid,
        tokenHash: createHash("sha256").update(owner.token).digest("hex"),
        startedAt: owner.startedAt,
      })}\n`,
      "utf8",
    )
    await file.sync()
  } finally {
    await file.close()
  }
}

export async function acquireInstallerLifecycleLock(input) {
  const lockPath = join(input.installRoot, ".lifecycle-lock")
  try {
    await mkdir(lockPath, { mode: 0o700 })
  } catch (error) {
    if (error?.code !== "EEXIST") return reject("installer_lifecycle_lock_failed")
    const previousOwner = await readLockOwner(lockPath)
    if (!previousOwner) return reject("installer_lifecycle_lock_invalid")
    let alive
    try {
      alive = input.isProcessAlive(previousOwner.pid)
    } catch {
      return reject("installer_lifecycle_liveness_unknown")
    }
    if (alive) return { status: "blocked", reasonCode: "installer_lifecycle_busy" }
    const stalePath = `${lockPath}.stale.${randomUUID()}`
    try {
      await rename(lockPath, stalePath)
      await rm(stalePath, { recursive: true })
      await mkdir(lockPath, { mode: 0o700 })
    } catch {
      return { status: "blocked", reasonCode: "installer_lifecycle_busy" }
    }
  }
  try {
    await writeLockOwner(lockPath, input.owner)
    return { status: "acquired", lockPath }
  } catch {
    await rm(lockPath, { recursive: true, force: true })
    return reject("installer_lifecycle_lock_failed")
  }
}

export async function releaseInstallerLifecycleLock(lock, owner) {
  if (lock?.status !== "acquired" || typeof lock.lockPath !== "string")
    return reject("installer_lifecycle_lock_release_invalid")
  const stored = await readLockOwner(lock.lockPath)
  const expectedTokenHash = createHash("sha256")
    .update(owner?.token ?? "")
    .digest("hex")
  if (
    !stored ||
    stored.pid !== owner?.pid ||
    stored.startedAt !== owner?.startedAt ||
    stored.tokenHash !== expectedTokenHash
  ) {
    return reject("installer_lifecycle_lock_owner_mismatch")
  }
  await rm(lock.lockPath, { recursive: true })
  return { status: "released" }
}

async function validateOwnedLayout(input) {
  const rootMetadata = await lstat(input.installRoot).catch(() => undefined)
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink())
    return reject("installer_lifecycle_root_unowned")
  if (!(await readOwnedMarker(input.installRoot))) return reject("installer_lifecycle_root_unowned")

  const allowed = new Set([
    INSTALL_ROOT_MARKER,
    ACTIVE_PROFILE_RECEIPT,
    ".lifecycle-lock",
    "versions",
    "installer-state",
    ...(input.platform === "win32" ? ["current-version", "bin"] : ["current"]),
  ])
  const entries = await readdir(input.installRoot)
  if (entries.some((entry) => !allowed.has(entry)))
    return reject("installer_lifecycle_root_contains_unowned_data")
  const launcherName = input.platform === "win32" ? "knowbee.cmd" : "knowbee"
  const launcherPath = join(input.launcherDirectory, launcherName)
  const launcher = await lstat(launcherPath).catch(() => undefined)
  if (launcher && !launcher.isFile() && !launcher.isSymbolicLink())
    return reject("installer_lifecycle_launcher_unsafe")
  if (input.purge) {
    const state = await lstat(input.applicationStateRoot).catch(() => undefined)
    if (state && (!state.isDirectory() || state.isSymbolicLink()))
      return reject("installer_lifecycle_state_unsafe")
  }
  return { status: "ready", launcherPath }
}

export async function uninstallKnowbee(input) {
  if (!validateInput(input)) return reject("installer_lifecycle_input_invalid")
  const layout = await validateOwnedLayout(input)
  if (layout.status !== "ready") return layout
  const acquired = await acquireInstallerLifecycleLock(input)
  if (acquired.status !== "acquired") return acquired

  const service = await input.service.stop()
  if (service.status !== "stopped" && service.status !== "absent") {
    await releaseInstallerLifecycleLock(acquired, input.owner)
    return reject("installer_lifecycle_service_stop_failed")
  }

  try {
    await rm(join(input.installRoot, "versions"), { recursive: true, force: true })
    await rm(join(input.installRoot, "current"), { force: true })
    await rm(join(input.installRoot, "current-version"), { force: true })
    await rm(input.installerStateRoot, { recursive: true, force: true })
    await rm(layout.launcherPath, { force: true })
    if (input.platform === "win32") {
      await rmdir(input.launcherDirectory).catch((error) => {
        if (error?.code !== "ENOENT") throw error
      })
    }
    await rm(join(input.installRoot, INSTALL_ROOT_MARKER), { force: true })
    await rm(join(input.installRoot, ACTIVE_PROFILE_RECEIPT), { force: true })
    await rm(acquired.lockPath, { recursive: true, force: true })
    await rmdir(input.installRoot)
    if (input.purge) await rm(input.applicationStateRoot, { recursive: true, force: true })
    return { status: "uninstalled", state: input.purge ? "purged" : "preserved" }
  } catch {
    return reject("installer_lifecycle_removal_failed")
  }
}
