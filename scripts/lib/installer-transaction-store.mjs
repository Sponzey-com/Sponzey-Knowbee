import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, mkdir, open, readFile, rename, rmdir, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"

import { parseInstallerTransactionSnapshot } from "../../packages/core/src/release/installer-transaction.js"

const OWNER_KEYS = ["kind", "schemaVersion", "pid", "token", "startedAt", "operationIdHash"]
const SAFE_TOKEN = /^[A-Za-z0-9._-]{1,120}$/
const SHA256_ID = /^sha256:[a-f0-9]{64}$/

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value, expected) {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function operationIdHash(operationId) {
  return `sha256:${createHash("sha256").update(operationId).digest("hex")}`
}

function parseOwner(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, OWNER_KEYS) ||
    value.kind !== "knowbee.installer.store_owner" ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    typeof value.token !== "string" ||
    !SAFE_TOKEN.test(value.token) ||
    !Number.isSafeInteger(value.startedAt) ||
    value.startedAt < 0 ||
    typeof value.operationIdHash !== "string" ||
    !SHA256_ID.test(value.operationIdHash)
  ) {
    return undefined
  }
  return value
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return undefined
  }
}

async function writeExclusiveJson(path, value) {
  const file = await open(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
    0o600,
  )
  try {
    await file.writeFile(`${JSON.stringify(value)}\n`, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }
}

async function removeKnownLock(lockPath) {
  try {
    await unlink(join(lockPath, "owner.json"))
  } catch {}
  try {
    await rmdir(lockPath)
  } catch {}
}

async function ensureSafeStateRoot(path) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const metadata = await lstat(path)
  return metadata.isDirectory() && !metadata.isSymbolicLink()
}

async function installOwner(lockPath, ownerRecord) {
  await mkdir(lockPath, { mode: 0o700 })
  try {
    await writeExclusiveJson(join(lockPath, "owner.json"), ownerRecord)
  } catch (error) {
    await removeKnownLock(lockPath)
    throw error
  }
}

async function loadSnapshot(path) {
  let value
  try {
    value = JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { status: "empty" }
    }
    return reject("installer_store_snapshot_invalid")
  }
  const parsed = parseInstallerTransactionSnapshot(value)
  return parsed.status === "accepted"
    ? { status: "loaded", state: parsed.state }
    : reject("installer_store_snapshot_invalid")
}

export async function acquireInstallerTransactionStore(input) {
  if (
    typeof input?.stateRoot !== "string" ||
    input.stateRoot.length === 0 ||
    typeof input.operationId !== "string" ||
    input.operationId.length === 0 ||
    input.operationId.length > 240 ||
    !isRecord(input.owner) ||
    !Number.isSafeInteger(input.owner.pid) ||
    input.owner.pid <= 0 ||
    typeof input.owner.token !== "string" ||
    !SAFE_TOKEN.test(input.owner.token) ||
    !Number.isSafeInteger(input.owner.startedAt) ||
    input.owner.startedAt < 0 ||
    typeof input.isProcessAlive !== "function"
  ) {
    return reject("installer_store_input_invalid")
  }

  const stateRoot = resolve(input.stateRoot)
  const lockPath = join(stateRoot, ".installer-lock")
  const ownerPath = join(lockPath, "owner.json")
  const statePath = join(stateRoot, "transaction.json")
  const ownerRecord = Object.freeze({
    kind: "knowbee.installer.store_owner",
    schemaVersion: 1,
    pid: input.owner.pid,
    token: input.owner.token,
    startedAt: input.owner.startedAt,
    operationIdHash: operationIdHash(input.operationId),
  })

  try {
    if (!(await ensureSafeStateRoot(stateRoot))) {
      return reject("installer_store_state_root_unsafe")
    }
  } catch {
    return reject("installer_store_state_root_unsafe")
  }

  try {
    await installOwner(lockPath, ownerRecord)
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
      return reject("installer_store_lock_unavailable")
    }
    const existingOwner = parseOwner(await readJson(ownerPath))
    if (!existingOwner) return reject("installer_store_lock_invalid")
    let alive = true
    try {
      alive = (await input.isProcessAlive(existingOwner.pid)) === true
    } catch {
      alive = true
    }
    if (alive) return reject("installer_store_concurrent_owner")

    const staleLockPath = join(stateRoot, `.installer-lock.stale.${input.owner.token}`)
    try {
      await rename(lockPath, staleLockPath)
      await installOwner(lockPath, ownerRecord)
      await removeKnownLock(staleLockPath)
    } catch {
      return reject("installer_store_lock_reclaim_raced")
    }
  }

  let owned = true
  let writeChain = Promise.resolve()

  async function stillOwner() {
    if (!owned) return false
    const current = parseOwner(await readJson(ownerPath))
    return (
      current?.token === ownerRecord.token &&
      current.operationIdHash === ownerRecord.operationIdHash
    )
  }

  async function saveSnapshot(state) {
    if (!(await stillOwner())) return reject("installer_store_not_owner")
    const parsed = parseInstallerTransactionSnapshot(state)
    if (parsed.status !== "accepted") return reject("installer_store_snapshot_invalid")
    if (parsed.state.operationId !== input.operationId) {
      return reject("installer_store_operation_mismatch")
    }
    const current = await loadSnapshot(statePath)
    if (current.status === "rejected") return current
    if (current.status === "empty") {
      if (parsed.state.revision !== 0) return reject("installer_store_revision_gap")
    } else if (parsed.state.revision === current.state.revision) {
      return JSON.stringify(parsed.state) === JSON.stringify(current.state)
        ? { status: "unchanged", revision: parsed.state.revision }
        : reject("installer_store_revision_conflict")
    } else if (parsed.state.revision !== current.state.revision + 1) {
      return reject("installer_store_revision_gap")
    }

    const temporaryPath = join(stateRoot, `.transaction.${ownerRecord.token}.tmp`)
    try {
      const file = await open(
        temporaryPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
        0o600,
      )
      try {
        await file.writeFile(`${JSON.stringify(parsed.state)}\n`, "utf8")
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporaryPath, statePath)
      return { status: "saved", revision: parsed.state.revision }
    } catch {
      try {
        await unlink(temporaryPath)
      } catch {}
      return reject("installer_store_write_failed")
    }
  }

  const store = Object.freeze({
    async load() {
      await writeChain
      if (!(await stillOwner())) return reject("installer_store_not_owner")
      return loadSnapshot(statePath)
    },
    save(state) {
      const result = writeChain.then(() => saveSnapshot(state))
      writeChain = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    async close() {
      await writeChain
      if (!(await stillOwner())) {
        owned = false
        return { status: "not_owner" }
      }
      owned = false
      await removeKnownLock(lockPath)
      return { status: "released" }
    },
  })
  return { status: "acquired", store }
}
