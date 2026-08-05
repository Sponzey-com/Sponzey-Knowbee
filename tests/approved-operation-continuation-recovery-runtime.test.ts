import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createArtifactStorageContext,
  recordArtifactMetadata,
} from "../packages/core/src/artifacts/lifecycle.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  closeDb,
  getDb,
  getMessagesForRun,
  insertArtifactReceipt,
  insertMessage,
  insertSession,
} from "../packages/core/src/db/index.js"
import { SqliteApprovedOperationContinuationRepository } from "../packages/core/src/db/approved-operation-continuation-repository.ts"
import {
  consumeApprovalRegistryDecision,
  createApprovalRegistryRequest,
  resolveApprovalRegistryDecision,
} from "../packages/core/src/runs/approval-registry.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import {
  applyCanonicalWorkEvent,
} from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import {
  SqliteCanonicalWorkRepository,
} from "../packages/core/src/db/canonical-work-repository.ts"
import {
  resolveApprovedArtifactDeliveryOperation,
} from "../packages/core/src/tools/approved-artifact-delivery-operation.ts"
import { telegramSendFileTool } from "../packages/core/src/tools/builtin/telegram-send.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import {
  recoverApprovedOperationContinuations,
} from "../packages/core/src/runtime/approved-operation-continuation-recovery.ts"
import {
  loadRecoveredApprovedOperationAttempt,
} from "../packages/core/src/runs/approved-operation-result-handoff.ts"
import {
  createTestDbRuntimeFixture,
  type TestDbRuntimeFixture,
} from "./fixtures/runtime-db.ts"

let runtime: TestDbRuntimeFixture

beforeEach(() => {
  runtime = createTestDbRuntimeFixture(
    "knowbee-approved-operation-recovery-runtime-",
  )
})

afterEach(() => {
  closeDb()
  runtime.dispose()
})

function enqueueConsumedCameraContinuation(): void {
  insertSession({
    id: "session:camera:recovery",
    source: "telegram",
    source_id: "chat:recovery",
    created_at: 10,
    updated_at: 10,
    summary: null,
  })
  createRootRun({
    id: "run:camera:recovery",
    sessionId: "session:camera:recovery",
    requestGroupId: "group:camera:recovery",
    prompt: "Take one camera photo.",
    source: "telegram",
  })
  createApprovalRegistryRequest({
    id: "approval:camera:recovery",
    runId: "run:camera:recovery",
    requestGroupId: "group:camera:recovery",
    channel: "telegram",
    toolName: "yeonjang_camera_capture",
    riskLevel: "moderate",
    kind: "approval",
    params: {},
    operationBinding: {
      operationId: "operation:camera:recovery",
      operationBindingHash: `sha256:${"a".repeat(64)}`,
      continuationSchemaVersion: 1,
    },
    now: 20,
  })
  resolveApprovalRegistryDecision({
    approvalId: "approval:camera:recovery",
    decision: "allow_once",
    decisionBy: "telegram",
    decisionSource: "user",
    now: 30,
  })
  consumeApprovalRegistryDecision("approval:camera:recovery", 31)
  const repository = new SqliteApprovedOperationContinuationRepository(
    getDb(),
  )
  expect(repository.enqueue({
    schemaVersion: 1,
    approvalId: "approval:camera:recovery",
    runId: "run:camera:recovery",
    requestGroupId: "group:camera:recovery",
    toolName: "yeonjang_camera_capture",
    decision: "allow_once",
    operationId: "operation:camera:recovery",
    operationBindingHash: `sha256:${"a".repeat(64)}`,
    continuationSchemaVersion: 1,
  }, 32)).toMatchObject({ status: "enqueued" })
}

describe("approved operation continuation production recovery", () => {
  it("claims once and fails closed without an exact current camera target", async () => {
    enqueueConsumedCameraContinuation()

    await expect(recoverApprovedOperationContinuations({
      config: {
        ...DEFAULT_CONFIG,
        profile: {
          ...DEFAULT_CONFIG.profile,
          workspace: runtime.rootDir,
        },
        security: {
          ...DEFAULT_CONFIG.security,
          allowedPaths: [runtime.rootDir],
        },
      },
      paths: runtime.paths,
      signal: new AbortController().signal,
      ownerId: "gateway:test-recovery",
    })).resolves.toEqual({
      claimed: 1,
      completed: 0,
      blocked: 1,
      cancelled: false,
      completedRunIds: [],
    })
    expect(getDb().prepare<
      [],
      { status: string; claim_owner_id: string }
    >(
      `SELECT status, claim_owner_id
       FROM approved_operation_continuations`,
    ).get()).toEqual({
      status: "failed",
      claim_owner_id: "gateway:test-recovery",
    })

    await expect(recoverApprovedOperationContinuations({
      config: DEFAULT_CONFIG,
      paths: runtime.paths,
      signal: new AbortController().signal,
      ownerId: "gateway:test-recovery-again",
    })).resolves.toMatchObject({
      claimed: 0,
      completed: 0,
      blocked: 0,
      completedRunIds: [],
    })
  })

  it("starts only after the API is ready and has an owned shutdown path", () => {
    const source = readFileSync(
      "packages/core/src/runtime/bootstrap.ts",
      "utf8",
    )
    const apiReady = source.indexOf("await startServer(")
    const recoveryStart = source.indexOf(
      "recoverApprovedOperationContinuations({",
    )
    expect(apiReady).toBeGreaterThanOrEqual(0)
    expect(recoveryStart).toBeGreaterThan(apiReady)
    expect(source).toContain(
      "createApprovedOperationContinuationRecoverySupervisor({",
    )
    expect(source).toContain('"approval.continuation.enqueued"')
    expect(source).toContain(
      "channelRecoveryRuntime?.resumeExistingRootRun(runId, signal)",
    )
    expect(source).toContain("await supervisor?.stop()")
    expect(source).toContain("await stopContinuationRecovery()")
  })

  it("delivers one exactly bound Telegram artifact after restart and hands it back to the same run", async () => {
    const sessionId = "session:telegram:delivery-recovery"
    const runId = "run:telegram:delivery-recovery"
    const requestGroupId = "group:telegram:delivery-recovery"
    insertSession({
      id: sessionId,
      source: "telegram",
      source_id: "telegram:7001:main",
      created_at: 10,
      updated_at: 10,
      summary: null,
    })
    createRootRun({
      id: runId,
      sessionId,
      requestGroupId,
      prompt: "Take one photo and send it here.",
      source: "telegram",
    })
    const artifactPath = join(
      runtime.paths.stateDir,
      "artifacts",
      "camera",
      "recovered.jpg",
    )
    mkdirSync(join(runtime.paths.stateDir, "artifacts", "camera"), {
      recursive: true,
    })
    writeFileSync(artifactPath, Buffer.from("recovered-camera"))
    const artifactId = recordArtifactMetadata({
      artifactPath,
      ownerChannel: "telegram",
      sourceRunId: runId,
      requestGroupId,
      mimeType: "image/jpeg",
      sizeBytes: 16,
      retentionPolicy: "standard",
      dataClassification: "user",
    }, createArtifactStorageContext(runtime.paths))
    const artifactRef = `artifact:${artifactId}`
    const context: ToolContext = {
      artifactStorage: createArtifactStorageContext(runtime.paths),
      sessionId,
      runId,
      requestGroupId,
      workDir: runtime.rootDir,
      userMessage: "Take one photo and send it here.",
      source: "telegram",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    const projected = resolveApprovedArtifactDeliveryOperation({
      tool: telegramSendFileTool,
      params: { artifactRef },
      ctx: context,
    })
    expect(projected.status).toBe("resolved")
    if (projected.status !== "resolved") return
    insertMessage({
      id: "message:telegram:delivery-tool-use",
      session_id: sessionId,
      root_run_id: runId,
      role: "assistant",
      content: "",
      tool_calls: JSON.stringify([{
        type: "tool_use",
        id: "tool-use:telegram:delivery-recovery",
        name: "telegram_send_file",
        input: { artifactRef },
      }]),
      tool_call_id: null,
      created_at: 20,
    })
    const canonicalRepository =
      new SqliteCanonicalWorkRepository(getDb(), () => 25)
    let aggregate = canonicalRepository.load(`work:root:${runId}`)
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
      canonicalRepository.save({
        aggregate: applied.aggregate,
        expectedRevision: aggregate.revision,
      })
      aggregate = applied.aggregate
    }
    createApprovalRegistryRequest({
      id: "approval:telegram:delivery-recovery",
      runId,
      requestGroupId,
      channel: "telegram",
      toolName: "telegram_send_file",
      riskLevel: "moderate",
      kind: "approval",
      params: { artifactRef },
      authorizationParams: projected.operation.authorizationParams,
      operationBinding: projected.operation.binding,
      now: 30,
    })
    resolveApprovalRegistryDecision({
      approvalId: "approval:telegram:delivery-recovery",
      decision: "allow_once",
      decisionBy: "telegram",
      decisionSource: "user",
      now: 31,
    })
    consumeApprovalRegistryDecision(
      "approval:telegram:delivery-recovery",
      32,
    )
    const continuationRepository =
      new SqliteApprovedOperationContinuationRepository(getDb())
    expect(continuationRepository.enqueue({
      schemaVersion: 1,
      approvalId: "approval:telegram:delivery-recovery",
      runId,
      requestGroupId,
      toolName: "telegram_send_file",
      decision: "allow_once",
      operationId: projected.operation.binding.operationId,
      operationBindingHash:
        projected.operation.binding.operationBindingHash,
      continuationSchemaVersion: 1,
    }, 33)).toMatchObject({ status: "enqueued" })
    let providerCalls = 0

    const recovery = await recoverApprovedOperationContinuations({
      config: {
        ...DEFAULT_CONFIG,
        profile: {
          ...DEFAULT_CONFIG.profile,
          workspace: runtime.rootDir,
        },
        security: {
          ...DEFAULT_CONFIG.security,
          allowedPaths: [runtime.rootDir],
        },
      },
      paths: runtime.paths,
      signal: new AbortController().signal,
      ownerId: "gateway:telegram-delivery-recovery",
      resolveDeliveryHandler: () => async (chunk) => {
        expect(chunk).toMatchObject({
          type: "tool_end",
          toolName: "telegram_send_file",
          success: true,
        })
        providerCalls += 1
        insertArtifactReceipt({
          runId,
          requestGroupId,
          channel: "telegram",
          artifactPath,
          deliveredAt: 40,
          deliveryReceipt: {
            channelTarget: "7001",
            providerMessageId: "message:7001:1",
          },
        })
        return undefined
      },
    })
    expect(providerCalls).toBe(1)
    expect(recovery).toMatchObject({
      claimed: 1,
      completed: 1,
      blocked: 0,
      completedRunIds: [runId],
    })
    expect(getMessagesForRun(sessionId, runId).filter((message) =>
      message.id.endsWith(":tool-result"))).toHaveLength(1)
    expect(loadRecoveredApprovedOperationAttempt(runId)).toMatchObject({
      ok: true,
      attempt: {
        successfulFileDeliveries: [{
          toolName: "telegram_send_file",
          channel: "telegram",
          filePath: artifactPath,
        }],
      },
    })
  })
})
