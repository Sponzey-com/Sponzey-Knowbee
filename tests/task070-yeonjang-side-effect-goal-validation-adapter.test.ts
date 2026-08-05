import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
  type SideEffectOperationEvent,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { SqliteSideEffectOperationRepository } from "../packages/core/src/db/side-effect-operation-repository.ts"
import { transitionReservedSideEffectOperation, reserveSideEffectOperation } from "../packages/core/src/runs/side-effect-operation-use-case.ts"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { loadYeonjangSideEffectGoalValidationCandidate } from "../packages/core/src/yeonjang/side-effect-goal-validation-adapter.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

function identity() {
  return buildSideEffectOperationIdentity({
    runId: "run-070",
    workId: "work:root:run-070",
    stepKey: "step-click",
    adapterId: "tool:mouse_click",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    paramsFingerprint: `sha256:${"b".repeat(64)}`,
  })
}

function receipt(operationIdentity: ReturnType<typeof identity>, event: SideEffectOperationEvent, revision: number) {
  return buildSideEffectOperationReceipt({
    identity: operationIdentity,
    event,
    operationRevision: revision,
    evidenceFingerprint: `sha256:${revision.toString(16).repeat(64).slice(0, 64)}`,
    evidenceRefs: [`operation-evidence:${event.toLowerCase()}:070`],
    issuedAt: revision,
  })
}

function saveManualOperation() {
  const repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
  const operationIdentity = identity()
  const reserved = reserveSideEffectOperation({ repository, identity: operationIdentity })
  if (reserved.status === "rejected") throw new Error(reserved.reasonCode)
  for (const [index, event] of [
    "START_EFFECT",
    "RECORD_EFFECT",
    "BEGIN_VERIFICATION",
    "VERIFICATION_FAILED",
    "MARK_MANUAL",
  ].entries()) {
    const changed = transitionReservedSideEffectOperation({
      repository,
      operationId: operationIdentity.operationId,
      scopeId: operationIdentity.scopeId,
      expectedRevision: index,
      event: event as SideEffectOperationEvent,
      receipt: receipt(operationIdentity, event as SideEffectOperationEvent, index + 1),
    })
    if (changed.status !== "applied") throw new Error(changed.reasonCode)
  }
  return operationIdentity
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-side-effect-goal-validation-adapter-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  getDb({ paths })
  const now = Date.now()
  insertSession({
    id: "session-070",
    source: "webui",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({ id: "run-070", sessionId: "session-070", prompt: "click", source: "webui" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("Task 070 Yeonjang side-effect goal validation adapter", () => {
  it("loads a scoped manual operation candidate without exposing raw fingerprints in public summary", () => {
    const operationIdentity = saveManualOperation()

    const candidate = loadYeonjangSideEffectGoalValidationCandidate({
      db: getDb(),
      operationId: operationIdentity.operationId,
      expectedRunId: "run-070",
      expectedWorkId: "work:root:run-070",
      now: () => 2,
    })

    expect(candidate).toMatchObject({
      status: "ready",
      publicSummary: {
        operationId: operationIdentity.operationId,
        runId: "run-070",
        workId: "work:root:run-070",
        adapterId: "tool:mouse_click",
        state: "MANUAL_INTERVENTION",
        revision: 5,
        transitionCount: 5,
      },
    })
    if (candidate.status !== "ready") throw new Error(candidate.reasonCode)
    expect(candidate.operation.identity.operationId).toBe(operationIdentity.operationId)
    expect(candidate.loadReceipt(candidate.operation.transitions[0].receiptRef)).toMatchObject({
      event: "START_EFFECT",
    })
    expect(JSON.stringify(candidate.publicSummary)).not.toContain("sha256:")
    expect(JSON.stringify(candidate.publicSummary)).not.toContain("receipt")
  })

  it("rejects operation ids outside the expected run scope", () => {
    const operationIdentity = saveManualOperation()

    expect(loadYeonjangSideEffectGoalValidationCandidate({
      db: getDb(),
      operationId: operationIdentity.operationId,
      expectedRunId: "run-other",
      now: () => 2,
    })).toEqual({
      status: "not_ready",
      reasonCode: "operation_run_scope_mismatch",
    })
  })

  it("rejects unknown operation ids", () => {
    expect(loadYeonjangSideEffectGoalValidationCandidate({
      db: getDb(),
      operationId: "operation:missing",
      expectedRunId: "run-070",
      now: () => 2,
    })).toEqual({
      status: "not_ready",
      reasonCode: "operation_not_found",
    })
  })
})
