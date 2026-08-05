import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.js"
import { closeDb, getCapabilityMutationReceipt, getCapabilityMutationReceiptByNonce, getDb, reserveCapabilityMutationReceipt, updateCapabilityMutationReceipt } from "../packages/core/src/db/index.js"

let root = ""
afterEach(() => { closeDb(); if (root) rmSync(root, { recursive: true, force: true }); root = "" })

describe("task023 capability mutation receipt DB", () => {
  it("migrates the receipt table and atomically reserves a nonce", () => {
    root = mkdtempSync(join(tmpdir(), "knowbee-capability-mutation-"))
    const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
    getDb({ paths })
    const input = { mutationId: "m1", nonce: "n1", actorRef: "user:self", scope: "capability:write", purpose: "skill_create", capabilityKind: "skill" as const, targetRevision: 2, state: "validating", now: 10 }
    expect(reserveCapabilityMutationReceipt(input)).toBe(true)
    expect(reserveCapabilityMutationReceipt({ ...input, mutationId: "m2" })).toBe(false)
    expect(getCapabilityMutationReceiptByNonce("n1")).toMatchObject({ mutation_id: "m1", state: "validating" })
    expect(updateCapabilityMutationReceipt({ mutationId: "m1", state: "active", now: 20 })).toBe(true)
    expect(getCapabilityMutationReceipt("m1")).toMatchObject({ state: "active", updated_at: 20 })

    const db = getDb({ paths })
    db.exec("DROP TABLE capability_mutation_receipts; DELETE FROM schema_migrations WHERE version = 63")
    closeDb()
    const upgraded = getDb({ paths })
    expect(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'capability_mutation_receipts'").get()).toMatchObject({ name: "capability_mutation_receipts" })
  })
})
