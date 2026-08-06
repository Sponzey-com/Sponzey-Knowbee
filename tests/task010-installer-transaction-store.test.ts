import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  type InstallerTransactionState,
  reduceInstallerTransaction,
  startInstallerTransaction,
} from "../packages/core/src/release/installer-transaction.js"
import { acquireInstallerTransactionStore } from "../scripts/lib/installer-transaction-store.mjs"

const tempDirs: string[] = []
const targetFingerprint = `sha256:${"a".repeat(64)}`

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "knowbee-installer-store-"))
  tempDirs.push(directory)
  return directory
}

function initial(operationId = "install:9.8.7:device-a") {
  return startInstallerTransaction({
    operationId,
    idempotencyKey: "installer:device-a:9.8.7",
    targetFingerprint,
    desiredVersion: "9.8.7",
  })
}

function advance(state: InstallerTransactionState, suffix: string): InstallerTransactionState {
  const result = reduceInstallerTransaction(state, {
    type: state.phase === "preflight" ? "preflight_passed" : "bundle_downloaded",
    eventId: `event:${suffix}`,
    operationId: state.operationId,
    targetFingerprint: state.targetFingerprint,
    expectedRevision: state.revision,
    receiptRef: `receipt:${suffix}`,
  })
  if (result.status !== "applied") throw new Error(result.reasonCode)
  return result.state
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task010 installer transaction store", () => {
  it("persists only the same operation with contiguous revisions and idempotent replay", async () => {
    const stateRoot = makeTempDir()
    const acquired = await acquireInstallerTransactionStore({
      stateRoot,
      operationId: initial().operationId,
      owner: { pid: 1001, token: "owner-a", startedAt: 1 },
      isProcessAlive: () => false,
    })
    expect(acquired.status).toBe("acquired")
    if (acquired.status !== "acquired") return

    const state0 = initial()
    expect(await acquired.store.save(state0)).toEqual({ status: "saved", revision: 0 })
    expect(await acquired.store.save(state0)).toEqual({ status: "unchanged", revision: 0 })
    const state1 = advance(state0, "preflight")
    expect(await acquired.store.save(state1)).toEqual({ status: "saved", revision: 1 })
    expect(await acquired.store.load()).toEqual({ status: "loaded", state: state1 })

    const state2 = advance(state1, "download")
    const gapRoot = makeTempDir()
    const gap = await acquireInstallerTransactionStore({
      stateRoot: gapRoot,
      operationId: state2.operationId,
      owner: { pid: 1002, token: "owner-gap", startedAt: 1 },
      isProcessAlive: () => false,
    })
    expect(gap.status).toBe("acquired")
    if (gap.status !== "acquired") return
    expect(await gap.store.save(state2)).toEqual({
      status: "rejected",
      reasonCode: "installer_store_revision_gap",
    })
    expect(await gap.store.close()).toEqual({ status: "released" })

    expect(await acquired.store.save(initial("install:other"))).toEqual({
      status: "rejected",
      reasonCode: "installer_store_operation_mismatch",
    })
    expect(await acquired.store.close()).toEqual({ status: "released" })
  })

  it("blocks a live owner and atomically reclaims a confirmed dead owner", async () => {
    const stateRoot = makeTempDir()
    const first = await acquireInstallerTransactionStore({
      stateRoot,
      operationId: initial().operationId,
      owner: { pid: 2001, token: "owner-first", startedAt: 10 },
      isProcessAlive: () => false,
    })
    expect(first.status).toBe("acquired")
    if (first.status !== "acquired") return

    expect(
      await acquireInstallerTransactionStore({
        stateRoot,
        operationId: initial().operationId,
        owner: { pid: 2002, token: "owner-live-contender", startedAt: 11 },
        isProcessAlive: (pid: number) => pid === 2001,
      }),
    ).toEqual({ status: "rejected", reasonCode: "installer_store_concurrent_owner" })

    const recovered = await acquireInstallerTransactionStore({
      stateRoot,
      operationId: initial().operationId,
      owner: { pid: 2003, token: "owner-recovered", startedAt: 12 },
      isProcessAlive: () => false,
    })
    expect(recovered.status).toBe("acquired")
    if (recovered.status !== "acquired") return
    expect(await first.store.close()).toEqual({ status: "not_owner" })
    expect(await recovered.store.close()).toEqual({ status: "released" })
  })

  it("ignores orphan temp files but rejects a malformed canonical snapshot", async () => {
    const stateRoot = makeTempDir()
    const acquired = await acquireInstallerTransactionStore({
      stateRoot,
      operationId: initial().operationId,
      owner: { pid: 3001, token: "owner-a", startedAt: 1 },
      isProcessAlive: () => false,
    })
    expect(acquired.status).toBe("acquired")
    if (acquired.status !== "acquired") return
    await acquired.store.save(initial())
    writeFileSync(join(stateRoot, ".transaction.orphan.tmp"), "partial", "utf8")
    expect(await acquired.store.load()).toMatchObject({ status: "loaded" })

    writeFileSync(join(stateRoot, "transaction.json"), "{truncated", "utf8")
    expect(await acquired.store.load()).toEqual({
      status: "rejected",
      reasonCode: "installer_store_snapshot_invalid",
    })
    expect(readFileSync(join(stateRoot, ".transaction.orphan.tmp"), "utf8")).toBe("partial")
    expect(await acquired.store.close()).toEqual({ status: "released" })
  })
})
