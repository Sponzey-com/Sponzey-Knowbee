import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  getDb,
  getMessagesForRun,
  insertSession,
} from "../packages/core/src/db/index.js"
import {
  applyCanonicalWorkEvent,
} from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import {
  SqliteCanonicalWorkRepository,
} from "../packages/core/src/db/canonical-work-repository.ts"
import {
  handoffApprovedOperationResult,
  loadRecoveredApprovedOperationAttempt,
} from "../packages/core/src/runs/approved-operation-result-handoff.ts"
import type {
  ApprovedOperationContinuation,
} from "../packages/core/src/runs/approved-operation-continuation.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import {
  createTestDbRuntimeFixture,
  type TestDbRuntimeFixture,
} from "./fixtures/runtime-db.ts"

let runtime: TestDbRuntimeFixture

beforeEach(() => {
  runtime = createTestDbRuntimeFixture(
    "knowbee-approved-operation-result-handoff-",
  )
  insertSession({
    id: "session:camera:handoff",
    source: "telegram",
    source_id: "chat:handoff",
    created_at: 10,
    updated_at: 10,
    summary: null,
  })
  createRootRun({
    id: "run:camera:handoff",
    sessionId: "session:camera:handoff",
    requestGroupId: "group:camera:handoff",
    prompt: "Take one photo and send it here.",
    source: "telegram",
  })
  const repository = new SqliteCanonicalWorkRepository(getDb(), () => 20)
  let aggregate = repository.load("work:root:run:camera:handoff")
  if (!aggregate) throw new Error("canonical fixture is missing")
  for (const event of [
    "DIAGNOSIS_ACCEPTED",
    "POLICY_ALLOWED",
    "EXECUTION_STARTED",
    "APPROVAL_REQUESTED",
    "APPROVAL_CONSUMED",
  ] as const) {
    const applied = applyCanonicalWorkEvent({
      aggregate,
      expectedRevision: aggregate.revision,
      event,
      receiptRef: `fixture:${event}`,
    })
    if (!applied.applied) throw new Error(`fixture transition failed: ${event}`)
    repository.save({
      aggregate: applied.aggregate,
      expectedRevision: aggregate.revision,
    })
    aggregate = applied.aggregate
  }
})

afterEach(() => {
  closeDb()
  runtime.dispose()
})

function continuation(): ApprovedOperationContinuation {
  return {
    continuationId: "approval-continuation:approval:camera:handoff",
    approvalId: "approval:camera:handoff",
    runId: "run:camera:handoff",
    requestGroupId: "group:camera:handoff",
    toolName: "yeonjang_camera_capture",
    decision: "allow_once",
    operationId: "operation:camera:handoff",
    operationBindingHash: `sha256:${"a".repeat(64)}`,
    schemaVersion: 1,
    status: "claimed",
    claimOwnerId: "gateway:handoff",
    claimExpiresAt: 200,
    createdAt: 100,
    updatedAt: 110,
    completedAt: null,
  }
}

describe("approved operation result handoff", () => {
  it("persists one bounded result for the exact tool use across duplicate settlement", () => {
    const artifactRef =
      "artifact:11111111-1111-4111-8111-111111111111"
    const result = {
      success: true,
      output: "/private/raw/camera.jpg",
      details: {
        artifactVerification: {
          status: "verified",
          artifactRef,
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          filePath: "/private/raw/camera.jpg",
        },
      },
    }

    expect(handoffApprovedOperationResult({
      continuation: continuation(),
      toolUseId: "tool-use:camera:handoff",
      result,
    })).toEqual({ ok: true, inserted: true })
    expect(handoffApprovedOperationResult({
      continuation: continuation(),
      toolUseId: "tool-use:camera:handoff",
      result,
    })).toEqual({ ok: true, inserted: false })

    const messages = getMessagesForRun(
      "session:camera:handoff",
      "run:camera:handoff",
    )
    const persisted = messages.filter((message) =>
      message.id.endsWith(":tool-result"))
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.tool_calls).toContain(artifactRef)
    expect(persisted[0]?.tool_calls).not.toContain("/private/raw/camera.jpg")
    expect(new SqliteCanonicalWorkRepository(getDb(), () => 30).load(
      "work:root:run:camera:handoff",
    )?.state).toBe("RESULT_REVIEW")
    expect(JSON.stringify(getDb().prepare(
      `SELECT evidence_refs_json
       FROM canonical_work_receipts
       WHERE kind = 'attempt'`,
    ).all())).toContain(artifactRef)
    expect(loadRecoveredApprovedOperationAttempt(
      "run:camera:handoff",
    )).toEqual({
      ok: true,
      attempt: {
        preview:
          "A verified side-effect artifact is ready for result review and requested delivery.",
        canonicalAttemptEvidenceRefs: [
          "side-effect-operation:operation:camera:handoff",
          artifactRef,
        ],
      },
    })
  })

  it("rejects a result bound to another request group", () => {
    expect(handoffApprovedOperationResult({
      continuation: {
        ...continuation(),
        requestGroupId: "group:other",
      },
      toolUseId: "tool-use:camera:handoff",
      result: { success: true, output: "captured" },
    })).toEqual({
      ok: false,
      reasonCode: "approval_continuation_run_binding_invalid",
    })
  })
})
