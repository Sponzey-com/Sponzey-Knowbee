import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  getDb,
} from "../packages/core/src/db/index.js"
import { SqliteApprovedOperationContinuationRepository } from "../packages/core/src/db/approved-operation-continuation-repository.ts"
import {
  consumeApprovalRegistryDecision,
  createApprovalRegistryRequest,
  resolveApprovalRegistryDecision,
} from "../packages/core/src/runs/approval-registry.ts"
import type { ApprovedOperationResumeCommand } from "../packages/core/src/runs/approved-operation-resume.ts"
import {
  createTestDbRuntimeFixture,
  type TestDbRuntimeFixture,
} from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture(
    "knowbee-approved-operation-continuation-",
  )
})

afterEach(() => {
  closeDb()
  dbRuntime.dispose()
})

function resumeCommand(
  overrides: Partial<ApprovedOperationResumeCommand> = {},
): ApprovedOperationResumeCommand {
  return {
    schemaVersion: 1,
    approvalId: "approval:continuation:1",
    runId: "run:continuation:1",
    requestGroupId: "group:continuation:1",
    toolName: "yeonjang_camera_capture",
    decision: "allow_once",
    operationId: "operation:camera:1",
    operationBindingHash: `sha256:${"a".repeat(64)}`,
    continuationSchemaVersion: 1,
    ...overrides,
  }
}

function prepareConsumedApproval(): void {
  createApprovalRegistryRequest({
    id: "approval:continuation:1",
    runId: "run:continuation:1",
    requestGroupId: "group:continuation:1",
    channel: "telegram",
    toolName: "yeonjang_camera_capture",
    riskLevel: "moderate",
    kind: "approval",
    params: {},
    operationBinding: {
      operationId: "operation:camera:1",
      operationBindingHash: `sha256:${"a".repeat(64)}`,
      continuationSchemaVersion: 1,
    },
    now: 90,
  })
  resolveApprovalRegistryDecision({
    approvalId: "approval:continuation:1",
    decision: "allow_once",
    decisionBy: "telegram",
    decisionSource: "user",
    now: 95,
  })
  consumeApprovalRegistryDecision("approval:continuation:1", 96)
}

describe("approved operation continuation repository", () => {
  it("enqueues one opaque continuation and rejects conflicting approval identity", () => {
    prepareConsumedApproval()
    const repository = new SqliteApprovedOperationContinuationRepository(
      getDb(),
    )
    expect(repository.enqueue(resumeCommand(), 100)).toMatchObject({
      status: "enqueued",
      continuation: {
        approvalId: "approval:continuation:1",
        operationId: "operation:camera:1",
        status: "pending",
      },
    })
    expect(repository.enqueue(resumeCommand(), 101)).toMatchObject({
      status: "existing",
    })
    expect(repository.enqueue(resumeCommand({
      operationId: "operation:camera:other",
    }), 102)).toEqual({
      status: "rejected",
      reasonCode: "approval_continuation_source_invalid",
    })

    const storedJson = JSON.stringify(
      getDb().prepare(
        "SELECT * FROM approved_operation_continuations",
      ).all(),
    )
    expect(storedJson).not.toContain("params")
    expect(storedJson).not.toContain("target")
    expect(storedJson).not.toContain("path")
  })

  it("claims once across repository recreation and reclaims only after lease expiry", () => {
    prepareConsumedApproval()
    const first = new SqliteApprovedOperationContinuationRepository(getDb())
    first.enqueue(resumeCommand(), 100)

    expect(first.claimNext({
      ownerId: "gateway:before-restart",
      now: 110,
      leaseMs: 50,
    })).toMatchObject({
      status: "claimed",
      continuation: {
        approvalId: "approval:continuation:1",
        claimOwnerId: "gateway:before-restart",
      },
    })
    expect(first.claimNext({
      ownerId: "gateway:duplicate",
      now: 120,
      leaseMs: 50,
    })).toEqual({ status: "none" })

    const restarted = new SqliteApprovedOperationContinuationRepository(
      getDb(),
    )
    expect(restarted.claimNext({
      ownerId: "gateway:after-restart",
      now: 161,
      leaseMs: 50,
    })).toMatchObject({
      status: "claimed",
      continuation: {
        approvalId: "approval:continuation:1",
        claimOwnerId: "gateway:after-restart",
      },
    })
    expect(restarted.complete({
      continuationId: "approval-continuation:approval:continuation:1",
      ownerId: "gateway:before-restart",
      now: 170,
    })).toEqual({
      status: "rejected",
      reasonCode: "approval_continuation_claim_mismatch",
    })
    expect(restarted.complete({
      continuationId: "approval-continuation:approval:continuation:1",
      ownerId: "gateway:after-restart",
      now: 171,
    })).toMatchObject({
      status: "completed",
      continuation: { status: "completed" },
    })
  })

  it("persists cancellation as a terminal continuation state across restart", () => {
    prepareConsumedApproval()
    const first = new SqliteApprovedOperationContinuationRepository(getDb())
    first.enqueue(resumeCommand(), 100)
    const claimed = first.claimNext({
      ownerId: "gateway:before-cancel",
      now: 110,
      leaseMs: 50,
    })
    expect(claimed.status).toBe("claimed")

    expect(first.cancel({
      continuationId: "approval-continuation:approval:continuation:1",
      ownerId: "gateway:before-cancel",
      now: 120,
    })).toMatchObject({
      status: "cancelled",
      continuation: {
        status: "cancelled",
        claimExpiresAt: null,
      },
    })

    const restarted = new SqliteApprovedOperationContinuationRepository(
      getDb(),
    )
    expect(restarted.claimNext({
      ownerId: "gateway:after-cancel",
      now: 200,
      leaseMs: 50,
    })).toEqual({ status: "none" })
  })
})
