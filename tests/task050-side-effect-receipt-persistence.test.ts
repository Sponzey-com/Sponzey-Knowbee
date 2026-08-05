import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  type SideEffectOperationReceipt,
  buildSideEffectOperationIdentity,
  validateSideEffectOperationReceipt,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.js"

let root = ""

afterEach(() => {
  closeDb()
  if (root) rmSync(root, { recursive: true, force: true })
  root = ""
})

describe("Task 050 side-effect receipt persistence", () => {
  const identity = buildSideEffectOperationIdentity({
    runId: "run:receipt",
    workId: "work:root:run:receipt",
    stepKey: "executing",
    adapterId: "tool:file_write",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    paramsFingerprint: `sha256:${"b".repeat(64)}`,
  })

  function receipt(
    overrides: Partial<SideEffectOperationReceipt> = {},
  ): SideEffectOperationReceipt {
    return {
      schemaVersion: 1,
      receiptId: "side-effect-receipt:authorization:1",
      operationId: identity.operationId,
      workId: identity.workId,
      event: "START_EFFECT",
      kind: "authorization",
      evidenceFingerprint: `sha256:${"c".repeat(64)}`,
      evidenceRefs: ["policy:allow:1"],
      operationRevision: 1,
      issuedAt: 1,
      ...overrides,
    }
  }

  it("validates operation ownership, revision and event-specific receipt kind", () => {
    expect(
      validateSideEffectOperationReceipt({
        receipt: receipt(),
        identity,
        event: "START_EFFECT",
        operationRevision: 1,
      }),
    ).toEqual({ ok: true })
    expect(
      validateSideEffectOperationReceipt({
        receipt: receipt({ kind: "effect" }),
        identity,
        event: "START_EFFECT",
        operationRevision: 1,
      }),
    ).toEqual({ ok: false, reasonCode: "side_effect_receipt_invalid" })
    expect(
      validateSideEffectOperationReceipt({
        receipt: receipt({ operationId: "operation:other" }),
        identity,
        event: "START_EFFECT",
        operationRevision: 1,
      }),
    ).toEqual({ ok: false, reasonCode: "side_effect_receipt_invalid" })
  })

  it("migrates a dedicated durable receipt table for side-effect operations", () => {
    root = mkdtempSync(join(tmpdir(), "knowbee-side-effect-receipts-"))
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: root },
      { homeDir: root, exists: () => false },
    )
    const db = getDb({ paths })
    const table = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'side_effect_operation_receipts'",
      )
      .get()

    expect(table?.name).toBe("side_effect_operation_receipts")
    const columns = db
      .prepare<[], { name: string }>("PRAGMA table_info(side_effect_operation_receipts)")
      .all()
      .map((column) => column.name)
    expect(columns).toContain("evidence_fingerprint")
    expect(columns).toContain("evidence_refs_json")
    expect(columns).not.toContain("raw_evidence_json")
    expect(columns).not.toContain("payload_json")
    expect(
      db
        .prepare<[], { version: number }>(
          "SELECT version FROM schema_migrations WHERE version = 59",
        )
        .get()?.version,
    ).toBe(59)
  })
})
