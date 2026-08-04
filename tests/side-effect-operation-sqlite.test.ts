import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  type SideEffectOperationEvent,
  buildSideEffectOperationAuthorization,
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { MIGRATIONS } from "../packages/core/src/db/migrations.ts"
import { SqliteSideEffectOperationRepository } from "../packages/core/src/db/side-effect-operation-repository.ts"
import { executeSideEffectOperation } from "../packages/core/src/runs/side-effect-operation-executor.ts"
import {
  reserveSideEffectOperation,
  transitionReservedSideEffectOperation,
} from "../packages/core/src/runs/side-effect-operation-use-case.ts"
import { createRootRun } from "../packages/core/src/runs/store.js"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

function identity(paramsChar = "b") {
  return buildSideEffectOperationIdentity({
    runId: "run-1",
    workId: "work:root:run-1",
    stepKey: "executing",
    adapterId: "tool:file_write",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    paramsFingerprint: `sha256:${paramsChar.repeat(64)}`,
  })
}

function receipt(
  operationIdentity: ReturnType<typeof identity>,
  event: SideEffectOperationEvent,
  operationRevision: number,
) {
  return buildSideEffectOperationReceipt({
    identity: operationIdentity,
    event,
    operationRevision,
    evidenceFingerprint: `sha256:${"f".repeat(64)}`,
    evidenceRefs: [`test-evidence:${event}`],
    issuedAt: operationRevision,
  })
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-side-effect-operation-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  getDb({ paths })
  const now = Date.now()
  insertSession({
    id: "session-1",
    source: "webui",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({ id: "run-1", sessionId: "session-1", prompt: "write file", source: "webui" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("side-effect operation SQLite repository", () => {
  it("reserves exactly once across repository instances and rejects changed params", () => {
    const first = new SqliteSideEffectOperationRepository(getDb(), () => 1)
    const second = new SqliteSideEffectOperationRepository(getDb(), () => 2)
    expect(reserveSideEffectOperation({ repository: first, identity: identity() }).status).toBe(
      "reserved",
    )
    expect(reserveSideEffectOperation({ repository: second, identity: identity() }).status).toBe(
      "existing",
    )
    expect(reserveSideEffectOperation({ repository: second, identity: identity("c") })).toEqual({
      status: "rejected",
      reasonCode: "operation_scope_params_conflict",
    })
    expect(first.listByRun("run-1", 10)).toHaveLength(1)
  })

  it("restores transition state after closing and reopening the database", () => {
    let repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
    const reserved = reserveSideEffectOperation({ repository, identity: identity() })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    transitionReservedSideEffectOperation({
      repository,
      operationId: reserved.aggregate.identity.operationId,
      scopeId: reserved.aggregate.identity.scopeId,
      expectedRevision: 0,
      event: "START_EFFECT",
      receipt: receipt(reserved.aggregate.identity, "START_EFFECT", 1),
    })
    closeDb()
    repository = new SqliteSideEffectOperationRepository(getDb({ paths }), () => 2)
    expect(repository.loadByScope(reserved.aggregate.identity.scopeId)).toMatchObject({
      state: "EFFECT_STARTED",
      revision: 1,
    })
    expect(
      repository.loadReceipt(receipt(reserved.aggregate.identity, "START_EFFECT", 1).receiptId),
    ).toMatchObject({
      event: "START_EFFECT",
      kind: "authorization",
      operationRevision: 1,
    })
  })

  it("preserves existing operation and receipt rows while widening the v77 state contract", () => {
    const repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
    const operationIdentity = identity()
    const reserved = reserveSideEffectOperation({ repository, identity: operationIdentity })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    const changed = transitionReservedSideEffectOperation({
      repository,
      operationId: operationIdentity.operationId,
      scopeId: operationIdentity.scopeId,
      expectedRevision: 0,
      event: "START_EFFECT",
      receipt: receipt(operationIdentity, "START_EFFECT", 1),
    })
    if (changed.status !== "applied") throw new Error(changed.reasonCode)

    const migration = MIGRATIONS.find((item) => item.version === 77)
    if (!migration) throw new Error("migration 77 missing")
    migration.up(getDb())

    const migrated = new SqliteSideEffectOperationRepository(getDb(), () => 2)
    expect(migrated.loadByScope(operationIdentity.scopeId)).toMatchObject({
      state: "EFFECT_STARTED",
      revision: 1,
    })
    expect(migrated.loadReceipt(receipt(operationIdentity, "START_EFFECT", 1).receiptId))
      .toMatchObject({ event: "START_EFFECT", kind: "authorization" })
    expect(
      getDb()
        .prepare<[], { integrity_check: string }>("PRAGMA integrity_check")
        .get()?.integrity_check,
    ).toBe("ok")
  })

  it("rolls back receipt insertion when the operation revision update conflicts", () => {
    const operationIdentity = identity()
    const repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
    const reserved = reserveSideEffectOperation({ repository, identity: operationIdentity })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    const transitionReceipt = receipt(operationIdentity, "START_EFFECT", 1)
    const result = repository.saveTransition({
      aggregate: {
        ...reserved.aggregate,
        state: "EFFECT_STARTED",
        revision: 1,
        transitions: [
          {
            revision: 1,
            previousState: "RESERVED",
            event: "START_EFFECT",
            nextState: "EFFECT_STARTED",
            receiptRef: transitionReceipt.receiptId,
          },
        ],
      },
      expectedRevision: 99,
      receipt: transitionReceipt,
    })

    expect(result).toMatchObject({ saved: false, reasonCode: "revision_conflict" })
    expect(repository.loadReceipt(transitionReceipt.receiptId)).toBeUndefined()
    expect(repository.loadByScope(operationIdentity.scopeId)).toMatchObject({
      state: "RESERVED",
      revision: 0,
    })
  })

  it("rejects a persisted receipt whose evidence contract is corrupted", () => {
    const operationIdentity = identity()
    const repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
    const reserved = reserveSideEffectOperation({ repository, identity: operationIdentity })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    const transitionReceipt = receipt(operationIdentity, "START_EFFECT", 1)
    const changed = transitionReservedSideEffectOperation({
      repository,
      operationId: operationIdentity.operationId,
      scopeId: operationIdentity.scopeId,
      expectedRevision: 0,
      event: "START_EFFECT",
      receipt: transitionReceipt,
    })
    if (changed.status !== "applied") throw new Error(changed.reasonCode)
    getDb()
      .prepare(
        "UPDATE side_effect_operation_receipts SET evidence_fingerprint = ? WHERE receipt_id = ?",
      )
      .run("not-a-fingerprint", transitionReceipt.receiptId)

    expect(() => repository.loadReceipt(transitionReceipt.receiptId)).toThrow(
      "side_effect_operation_persistence_corrupt",
    )
  })

  it("resumes recorded effects after reopen without executing the effect again", async () => {
    const operationIdentity = identity()
    let repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
    const reserved = reserveSideEffectOperation({ repository, identity: operationIdentity })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    for (const [revision, event] of [
      [0, "START_EFFECT"],
      [1, "RECORD_EFFECT"],
    ] as const) {
      const changed = transitionReservedSideEffectOperation({
        repository,
        operationId: operationIdentity.operationId,
        scopeId: operationIdentity.scopeId,
        expectedRevision: revision,
        event,
        receipt: receipt(operationIdentity, event, revision + 1),
      })
      if (changed.status !== "applied") throw new Error(changed.reasonCode)
    }
    closeDb()
    repository = new SqliteSideEffectOperationRepository(getDb({ paths }), () => 2)
    const executeEffect = vi.fn()
    const result = await executeSideEffectOperation(
      {
        identity: operationIdentity,
        compensationSupport: "irreversible",
        executeEffect,
        observePostState: vi.fn(),
        observeCurrentPostState: async () => ({
          available: true,
          targetFingerprint: operationIdentity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"d".repeat(64)}`,
          capturedAt: 2,
        }),
      },
      {
        repository,
        authorization: buildSideEffectOperationAuthorization({
          identity: operationIdentity,
          policyDecisionId: "policy:resume",
          policyReceiptRef: "receipt:policy:resume",
          effectClass: "local_write",
          scopeFingerprint: `sha256:${"c".repeat(64)}`,
          expectedEffectFingerprint: `sha256:${"d".repeat(64)}`,
        }),
        createReceipt: ({ identity: receiptIdentity, event, operationRevision }) =>
          receipt(receiptIdentity, event, operationRevision),
        isCancelled: () => false,
      },
    )

    expect(result).toMatchObject({ status: "resumed_verified" })
    expect(executeEffect).not.toHaveBeenCalled()
    expect(repository.loadByScope(operationIdentity.scopeId)).toMatchObject({
      state: "VERIFIED",
      revision: 4,
    })
  })
})
