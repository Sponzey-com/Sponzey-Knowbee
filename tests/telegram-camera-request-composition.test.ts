import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  buildCompletionReviewExpectedConditions,
  reviewTaskCompletion,
} from "../packages/core/src/agent/completion-review.ts"
import type {
  AIProvider,
  ChatParams,
} from "../packages/core/src/ai/types.ts"
import {
  CameraConversationProbeAdapter,
  projectCameraConversationCompletedSnapshot,
  projectCameraConversationDeliveryApprovalSnapshot,
  projectCameraConversationPostEffectSnapshot,
  projectCameraConversationPreEffectSnapshot,
} from "../packages/core/src/channels/camera-conversation-probe.ts"
import {
  validateCameraChannelAcceptance,
} from "../packages/core/src/channels/camera-acceptance.ts"
import {
  VerifyConversationProcessUseCase,
} from "../packages/core/src/channels/conversation-process-verification.ts"
import {
  createStartRootRunConversationProbe,
} from "../packages/core/src/channels/start-root-run-conversation-probe.ts"
import {
  createArtifactStorageContextFromRoot,
  recordArtifactMetadata,
  resolveArtifactReference,
} from "../packages/core/src/artifacts/lifecycle.ts"
import {
  closeDb,
  getDb,
  insertSession,
  listArtifactMetadataForRun,
  listArtifactReceiptsForRun,
  listMessageLedgerEvents,
} from "../packages/core/src/db/index.js"
import {
  createInstructionRuntimeContext,
} from "../packages/core/src/instructions/merge.ts"
import {
  getActiveApprovalForRun,
  getLatestApprovalForRun,
} from "../packages/core/src/runs/approval-registry.ts"
import {
  buildChannelArtifactDeliveryExecutionTargetRef,
} from "../packages/core/src/runs/channel-artifact-delivery-requirement.ts"
import {
  buildCanonicalCompletionOutcomeDescriptor,
} from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import {
  decideCompletionFlow,
} from "../packages/core/src/runs/completion-flow.ts"
import {
  deriveCompletionStageState,
} from "../packages/core/src/runs/completion-state.ts"
import {
  deliverArtifactOnce,
  resetArtifactDeliveryDedupeForTest,
} from "../packages/core/src/runs/delivery.ts"
import {
  completeRunWithAssistantMessage,
} from "../packages/core/src/runs/finalization.ts"
import {
  dispatchRunScopedTool,
} from "../packages/core/src/runs/run-scoped-tool-admission.ts"
import {
  createRootRun,
  getRequestExecutionOutcome,
} from "../packages/core/src/runs/store.ts"
import {
  buildDirectLlmResponseReviewReceipt,
} from "../packages/core/src/runs/user-facing-response-gate.ts"
import {
  buildYeonjangEvidenceEnvelope,
} from "../packages/core/src/yeonjang/evidence.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type {
  AnyTool,
  ToolContext,
} from "../packages/core/src/tools/types.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const runId = "run:camera-composition"
const sessionId = "session:camera-composition"
const targetId = "yeonjang:yeonjang-main"
const targetFingerprint =
  `sha256:${createHash("sha256").update(targetId).digest("hex")}` as const

let rootDir = ""
let runtimeFixture: TestRuntimeConfigFixture

function cameraTool(effect: ReturnType<typeof vi.fn>): AnyTool {
  return {
    name: "yeonjang_camera_capture",
    description: "Capture one camera image from an exact admitted target.",
    parameters: {
      type: "object",
      properties: {
        extensionId: { type: "string" },
        requestedFacing: { type: "string", enum: ["front", "rear"] },
      },
      required: ["extensionId", "requestedFacing"],
    },
    riskLevel: "dangerous",
    requiresApproval: true,
    sideEffect: {
      effectClass: "external_write",
      compensationSupport: "irreversible",
      canonicalOperation: (params) => ({
        extensionId: params.extensionId,
        requestedFacing: params.requestedFacing,
      }),
      targetRef: () => targetId,
      expectedState: () => ({ artifactCreated: true }),
      observe: async () => ({
        available: true,
        targetRef: targetId,
        expectedState: { artifactCreated: true },
        observedState: { artifactCreated: true },
      }),
    },
    execute: effect,
  }
}

function telegramDeliveryTool(
  send: ReturnType<typeof vi.fn>,
  deliveryTargetId: string,
): AnyTool {
  return {
    name: "telegram_send_file",
    description: "Deliver one verified artifact to the current Telegram chat.",
    parameters: {
      type: "object",
      properties: {
        artifactRef: { type: "string" },
      },
      required: ["artifactRef"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    availableSources: ["telegram"],
    channelCapability: {
      kind: "direct_artifact_delivery",
      channel: "telegram",
    },
    sideEffect: {
      effectClass: "external_write",
      compensationSupport: "irreversible",
      canonicalOperation: (params) => ({
        artifactRef: params.artifactRef,
      }),
      targetRef: () => deliveryTargetId,
      expectedState: (params) => ({
        artifactRef: params.artifactRef,
        delivered: true,
      }),
      observe: async (params) => ({
        available: true,
        targetRef: deliveryTargetId,
        expectedState: {
          artifactRef: params.artifactRef,
          delivered: true,
        },
        observedState: {
          artifactRef: params.artifactRef,
          delivered: true,
        },
      }),
    },
    async execute(params, context) {
      const artifactRef =
        typeof params.artifactRef === "string" ? params.artifactRef : ""
      const resolved = resolveArtifactReference({
        artifactRef,
        runId: context.runId,
        requestGroupId: context.requestGroupId ?? context.runId,
      }, context.artifactStorage)
      if (!resolved.ok) {
        return {
          success: false,
          output: "artifact scope validation failed",
          error: `ARTIFACT_REF_${resolved.reason.toUpperCase()}`,
        }
      }
      const delivery = await deliverArtifactOnce({
        artifactStorage: context.artifactStorage,
        runId: context.runId,
        channel: "telegram",
        filePath: resolved.filePath,
        channelTarget: deliveryTargetId,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
        task: async () => send({
          artifactRef: resolved.artifactRef,
          destinationFingerprint: deliveryTargetId,
        }),
      })
      return {
        success: true,
        output: delivery === undefined ? "already delivered" : "delivered",
        details: {
          kind: "artifact_delivery",
          channel: "telegram",
          artifactRef: resolved.artifactRef,
          size: resolved.sizeBytes,
          source: context.source,
          mimeType: resolved.mimeType,
        },
      }
    },
  }
}

function toolContext(): ToolContext {
  return {
    artifactStorage: createArtifactStorageContextFromRoot(
      join(rootDir, "artifacts"),
    ),
    sessionId,
    runId,
    requestGroupId: runId,
    workDir: rootDir,
    userMessage: "사진을 촬영해 현재 대화로 보내 주세요.",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

function createVerifiedDeliveryHarness(input: {
  send: ReturnType<typeof vi.fn>
  signal?: AbortSignal
}) {
  const artifactPath = join(
    rootDir,
    "artifacts",
    "camera",
    "delivery-fixture.jpg",
  )
  mkdirSync(join(rootDir, "artifacts", "camera"), { recursive: true })
  writeFileSync(artifactPath, Buffer.from("verified-delivery-fixture"))
  const artifactId = recordArtifactMetadata({
    artifactPath,
    ownerChannel: "telegram",
    sourceRunId: runId,
    requestGroupId: runId,
    mimeType: "image/jpeg",
    sizeBytes: 25,
    retentionPolicy: "standard",
    dataClassification: "user",
    metadata: {
      sourceKind: "yeonjang_camera_capture",
      artifactRefVisibility: "bounded",
    },
  }, createArtifactStorageContextFromRoot(join(rootDir, "artifacts")))
  const artifactRef = `artifact:${artifactId}`
  const deliveryTargetId =
    buildChannelArtifactDeliveryExecutionTargetRef("telegram", sessionId)
  const dispatcher = new ToolDispatcher({ config: runtimeFixture.config })
  dispatcher.register(telegramDeliveryTool(input.send, deliveryTargetId))
  const scope = {
    schemaVersion: 1 as const,
    kind: "tool_bundle_skill" as const,
    runId,
    ownerAgentId: "agent:knowbee",
    receiptId: "receipt:capability-admission:delivery-failure",
    capabilitySnapshotFingerprint: `sha256:${"f".repeat(64)}` as const,
    selectedCapabilityId: "telegram_send_file",
    selectedCapabilityIds: ["telegram_send_file"],
    selectedTargetIds: [deliveryTargetId],
    approvalRequiredCapabilityIds: ["telegram_send_file"],
    toolNames: ["telegram_send_file"],
  }
  const context = {
    ...toolContext(),
    ...(input.signal ? { signal: input.signal } : {}),
  }
  return {
    artifactRef,
    dispatcher,
    dispatch: () => dispatchRunScopedTool({
      scope,
      runId,
      ownerAgentId: "agent:knowbee",
      toolName: "telegram_send_file",
      params: { artifactRef },
      context,
      dispatcher,
    }),
  }
}

async function waitForApproval() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const approval = getActiveApprovalForRun(runId)
    if (approval) return approval
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  throw new Error("camera composition approval was not recorded")
}

beforeEach(() => {
  closeDb()
  resetArtifactDeliveryDedupeForTest()
  rootDir = mkdtempSync(join(tmpdir(), "knowbee-camera-composition-"))
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
      security: {
        approvalMode: "always",
        approvalTimeout: 60,
        approvalTimeoutFallback: "deny"
      }
    }`,
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  const now = Date.now()
  insertSession({
    id: sessionId,
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: runId,
    sessionId,
    prompt: "camera composition fixture",
    source: "telegram",
  })
})

afterEach(() => {
  vi.useRealTimers()
  closeDb()
  resetArtifactDeliveryDedupeForTest()
  if (rootDir) rmSync(rootDir, { recursive: true, force: true })
  rootDir = ""
})

describe("Telegram camera production composition", () => {
  it("binds separate capture and delivery approvals to one verified artifact", async () => {
    const remoteCapture = vi.fn(async (
      _params: Record<string, unknown>,
      context: ToolContext,
    ) => {
      const artifactPath = join(
        context.artifactStorage.rootDir,
        "camera",
        "captured.jpg",
      )
      mkdirSync(join(context.artifactStorage.rootDir, "camera"), {
        recursive: true,
      })
      writeFileSync(artifactPath, Buffer.from("verified-camera-fixture"))
      const artifactId = recordArtifactMetadata({
        artifactPath,
        ownerChannel: context.source,
        sourceRunId: context.runId,
        requestGroupId: context.requestGroupId ?? context.runId,
        mimeType: "image/jpeg",
        sizeBytes: 23,
        retentionPolicy: "standard",
        dataClassification: "user",
        metadata: {
          sourceKind: "yeonjang_camera_capture",
          artifactRefVisibility: "bounded",
        },
      }, context.artifactStorage)
      return {
        success: true,
        output: "captured",
        details: {
          artifactVerification: {
            status: "verified",
            artifactRef: `artifact:${artifactId}`,
            mimeType: "image/jpeg",
            sizeBytes: 23,
          },
        },
      }
    })
    const dispatcher = new ToolDispatcher({ config: runtimeFixture.config })
    dispatcher.register(cameraTool(remoteCapture))

    const scope = {
      schemaVersion: 1 as const,
      kind: "tool_bundle_skill" as const,
      runId,
      ownerAgentId: "agent:knowbee",
      receiptId: "receipt:capability-admission:camera-composition",
      capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}` as const,
      selectedCapabilityId: "yeonjang_camera_capture",
      selectedCapabilityIds: ["yeonjang_camera_capture"],
      selectedTargetIds: [targetId],
      approvalRequiredCapabilityIds: ["yeonjang_camera_capture"],
      toolNames: ["yeonjang_camera_capture"],
    }
    const dispatchCamera = () => dispatchRunScopedTool({
      scope,
      runId,
      ownerAgentId: "agent:knowbee",
      toolName: "yeonjang_camera_capture",
      params: { requestedFacing: "front" },
      context: toolContext(),
      dispatcher,
    })
    const pendingDispatch = dispatchCamera()
    const approval = await waitForApproval()
    const approvalMetadata = JSON.parse(approval.metadata_json ?? "{}") as {
      executionTargetFingerprint?: string
    }
    const startEffectCount = getDb()
      .prepare<[], { count: number }>(
        `SELECT COUNT(*) AS count
         FROM side_effect_operation_receipts
         WHERE event = 'START_EFFECT'`,
      )
      .get()?.count ?? 0
    const approvalRequestedCount = listMessageLedgerEvents({
      runId,
      limit: 100,
    }).filter((event) => event.event_kind === "approval_requested").length

    expect(approvalMetadata.executionTargetFingerprint).toBe(targetFingerprint)
    expect(remoteCapture).not.toHaveBeenCalled()
    expect(startEffectCount).toBe(0)
    expect(approvalRequestedCount).toBe(1)

    const requestOutcome = getRequestExecutionOutcome(runId)!
    expect(requestOutcome).toEqual({
      executionStatus: "in_progress",
      deliveryStatus: "not_started",
    })
    const facts = {
      evidenceMode: "fixture",
      smokeStatus: "passed",
      binding: { runId, requestGroupId: runId, sessionId },
      requestOutcome,
      receipts: {
        requestDiagnosisReceiptId: "llm-invocation:camera-diagnosis",
        solutionPlanReceiptId: "llm-invocation:camera-plan",
        capabilityAdmissionReceiptId:
          "receipt:capability-admission:camera-composition",
        resultReviewReceiptId: "",
        finalResponseReceiptId: "",
        decisionReceiptOrderValid: false,
      },
      deliveryTarget: {
        channel: "telegram",
        targetRef: "telegram-target:current-chat",
      },
      approval: {
        approvalRequestRef: approval.id,
        runId: approval.run_id,
        requestGroupId: approval.request_group_id ?? "",
        toolName: approval.tool_name,
        status: approval.status,
        executionTargetFingerprint:
          approvalMetadata.executionTargetFingerprint ?? "",
      },
      capabilityAdmission: {
        receiptId: "receipt:capability-admission:camera-composition",
        capability: "yeonjang_camera_capture",
        executionTargetFingerprint: targetFingerprint,
      },
      effect: {
        startEffectCount,
        remoteCaptureCount: remoteCapture.mock.calls.length,
      },
    } as const
    const projected = projectCameraConversationPreEffectSnapshot(facts)

    if (projected.status !== "success") throw new Error(projected.reasonCode)
    expect(Object.isFrozen(projected.value)).toBe(true)
    expect(Object.isFrozen(projected.value.conversation)).toBe(true)
    expect(Object.isFrozen(projected.value.camera)).toBe(true)
    expect(validateCameraChannelAcceptance(projected.value.camera)).toEqual({
      status: "passed",
      failures: [],
    })

    let consumedSnapshot = projected.value
    const startRootRun = vi.fn(() => ({
      runId,
      sessionId,
      status: "started" as const,
      finished: pendingDispatch.then(() => undefined),
    }))
    const startProbe = createStartRootRunConversationProbe({
      buildStartParams: (input) => ({
        source: "telegram",
        runId,
        requestGroupId: runId,
        message: input.userRequest,
      } as never),
      startRootRun,
    })
    const probe = new CameraConversationProbeAdapter({
      startRootRun: startProbe,
      readPreEffectFacts: async () => ({
        status: "success",
        value: facts,
      }),
      consumeSnapshot: (snapshot) => {
        consumedSnapshot = snapshot
      },
    })
    const verifier = new VerifyConversationProcessUseCase({
      probe,
      control: {
        interact: vi.fn(async () => ({ status: "success" })),
        cancel: vi.fn(async () => ({ status: "success" })),
      },
      delivery: {
        verifyDelivery: vi.fn(async () => ({
          status: "blocked",
          reasonCode: "delivery_not_started",
        })),
      },
    })
    await expect(verifier.execute({
      scenarioId: "telegram.camera.capture.pre_effect",
      channel: "telegram",
      userRequest: "fixture input is not interpreted by the adapter",
      expectedExecutionStatus: "succeeded",
      expectedTargetRef: "telegram-target:current-chat",
      allowedEffects: ["yeonjang_camera_capture"],
      userReportExpected: true,
      requiresCapabilityAdmission: true,
      requiresDistinctDecisionReceipts: true,
    })).resolves.toMatchObject({
      verificationStatus: "additional_input_required",
      reasonCode: "request_input_required",
      observedRequestOutcome: {
        executionStatus: "awaiting_approval",
      },
    })
    expect(startRootRun).toHaveBeenCalledOnce()
    expect(consumedSnapshot.camera).toEqual(projected.value.camera)
    expect(validateCameraChannelAcceptance(consumedSnapshot.camera)).toEqual({
      status: "passed",
      failures: [],
    })

    dispatcher.resolvePendingInteraction(runId, "allow_once")
    await expect(pendingDispatch).resolves.toMatchObject({
      success: true,
    })
    expect(remoteCapture).toHaveBeenCalledOnce()

    const consumedApproval = getLatestApprovalForRun(runId)
    const consumedMetadata = JSON.parse(
      consumedApproval?.metadata_json ?? "{}",
    ) as {
      executionTargetFingerprint?: string
    }
    const sideEffectEvents = getDb()
      .prepare<[], { event: string; count: number }>(
        `SELECT event, COUNT(*) AS count
         FROM side_effect_operation_receipts
         GROUP BY event`,
      )
      .all()
    const eventCount = (event: string) =>
      sideEffectEvents.find((row) => row.event === event)?.count ?? 0
    const artifacts = listArtifactMetadataForRun(runId)

    expect(consumedApproval?.status).toBe("consumed")
    expect(consumedMetadata.executionTargetFingerprint).toBe(
      targetFingerprint,
    )
    expect(eventCount("START_EFFECT")).toBe(1)
    expect(eventCount("VERIFICATION_PASSED")).toBe(1)
    expect(artifacts).toHaveLength(1)

    const artifact = artifacts[0]!
    const postEffectFacts = {
      evidenceMode: "fixture",
      smokeStatus: "passed",
      binding: { runId, requestGroupId: runId, sessionId },
      requestOutcome: getRequestExecutionOutcome(runId)!,
      receipts: facts.receipts,
      deliveryTarget: facts.deliveryTarget,
      approval: {
        approvalRequestRef: consumedApproval!.id,
        runId: consumedApproval!.run_id,
        requestGroupId: consumedApproval!.request_group_id ?? "",
        toolName: consumedApproval!.tool_name,
        status: "consumed",
        executionTargetFingerprint:
          consumedMetadata.executionTargetFingerprint ?? "",
      },
      capabilityAdmission: facts.capabilityAdmission,
      effect: {
        startEffectCount: eventCount("START_EFFECT"),
        remoteCaptureCount: remoteCapture.mock.calls.length,
        verificationPassedCount: eventCount("VERIFICATION_PASSED"),
      },
      artifact: {
        artifactRef: `artifact:${artifact.id}`,
        mimeType: artifact.mime_type,
        sizeBytes: artifact.size_bytes ?? 0,
        verification: "verified",
      },
    } as const
    const postEffect =
      projectCameraConversationPostEffectSnapshot(postEffectFacts)
    if (postEffect.status !== "success") {
      throw new Error(postEffect.reasonCode)
    }
    expect(validateCameraChannelAcceptance(postEffect.value.camera)).toEqual({
      status: "passed",
      failures: [],
    })
    const publicSnapshot = JSON.stringify(postEffect.value)
    expect(publicSnapshot).not.toContain(rootDir)
    expect(publicSnapshot).not.toContain("verified-camera-fixture")
    expect(publicSnapshot).not.toContain(targetId)

    const artifactRef = `artifact:${artifact.id}`
    const deliveryTargetId =
      buildChannelArtifactDeliveryExecutionTargetRef("telegram", sessionId)
    const deliveryTargetFingerprint =
      `sha256:${createHash("sha256").update(deliveryTargetId).digest("hex")}` as const
    const telegramSend = vi.fn(async () => ({
      provider: "telegram",
      status: "sent",
    }))
    dispatcher.register(telegramDeliveryTool(telegramSend, deliveryTargetId))
    const deliveryScope = {
      schemaVersion: 1 as const,
      kind: "tool_bundle_skill" as const,
      runId,
      ownerAgentId: "agent:knowbee",
      receiptId: "receipt:capability-admission:telegram-delivery",
      capabilitySnapshotFingerprint: `sha256:${"b".repeat(64)}` as const,
      selectedCapabilityId: "telegram_send_file",
      selectedCapabilityIds: ["telegram_send_file"],
      selectedTargetIds: [deliveryTargetId],
      approvalRequiredCapabilityIds: ["telegram_send_file"],
      toolNames: ["telegram_send_file"],
    }
    const dispatchDelivery = (
      context: ToolContext = toolContext(),
      requestedArtifactRef = artifactRef,
    ) => dispatchRunScopedTool({
      scope: deliveryScope,
      runId,
      ownerAgentId: "agent:knowbee",
      toolName: "telegram_send_file",
      params: { artifactRef: requestedArtifactRef },
      context,
      dispatcher,
    })

    await expect(dispatchDelivery({
      ...toolContext(),
      sessionId: "session:other-chat",
    })).resolves.toMatchObject({
      success: false,
      error: "run_scoped_delivery_target_mismatch",
    })
    expect(telegramSend).not.toHaveBeenCalled()

    const pendingDelivery = dispatchDelivery()
    const deliveryApproval = await waitForApproval()
    const deliveryApprovalMetadata = JSON.parse(
      deliveryApproval.metadata_json ?? "{}",
    ) as {
      executionTargetFingerprint?: string
    }
    expect(deliveryApproval.id).not.toBe(consumedApproval?.id)
    expect(deliveryApproval.tool_name).toBe("telegram_send_file")
    expect(deliveryApprovalMetadata.executionTargetFingerprint).toBe(
      deliveryTargetFingerprint,
    )
    expect(deliveryTargetFingerprint).not.toBe(targetFingerprint)
    expect(telegramSend).not.toHaveBeenCalled()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(0)

    const awaitingDelivery =
      projectCameraConversationDeliveryApprovalSnapshot({
        capture: postEffectFacts,
        deliveryApproval: {
          approvalRequestRef: deliveryApproval.id,
          runId: deliveryApproval.run_id,
          requestGroupId: deliveryApproval.request_group_id ?? "",
          toolName: "telegram_send_file",
          status: "requested",
          executionTargetFingerprint:
            deliveryApprovalMetadata.executionTargetFingerprint ?? "",
          artifactRef,
        },
      })
    if (awaitingDelivery.status !== "success") {
      throw new Error(awaitingDelivery.reasonCode)
    }
    expect(validateCameraChannelAcceptance(
      awaitingDelivery.value.camera,
    )).toEqual({
      status: "passed",
      failures: [],
    })
    expect(awaitingDelivery.value.conversation.pendingInteraction).toEqual({
      kind: "approval",
      approvalRequestRef: deliveryApproval.id,
    })
    const awaitingPublicSnapshot = JSON.stringify(awaitingDelivery.value)
    expect(awaitingPublicSnapshot).not.toContain(rootDir)
    expect(awaitingPublicSnapshot).not.toContain(deliveryTargetId)
    expect(awaitingPublicSnapshot).not.toContain(targetId)

    expect(projectCameraConversationDeliveryApprovalSnapshot({
      capture: postEffectFacts,
      deliveryApproval: {
        approvalRequestRef: deliveryApproval.id,
        runId: deliveryApproval.run_id,
        requestGroupId: deliveryApproval.request_group_id ?? "",
        toolName: "telegram_send_file",
        status: "requested",
        executionTargetFingerprint: deliveryTargetFingerprint,
        artifactRef: "artifact:00000000-0000-0000-0000-000000000000",
      },
    })).toEqual({
      status: "failure",
      reasonCode: "camera_delivery_approval_binding_invalid",
    })

    dispatcher.resolvePendingInteraction(runId, "allow_once")
    await expect(pendingDelivery).resolves.toMatchObject({
      success: true,
    })
    expect(telegramSend).toHaveBeenCalledOnce()
    const deliveryReceipts = listArtifactReceiptsForRun(runId)
    expect(deliveryReceipts).toHaveLength(1)
    expect(deliveryReceipts[0]).toMatchObject({
      run_id: runId,
      request_group_id: runId,
      channel: "telegram",
      mime_type: "image/jpeg",
    })

    await expect(dispatchDelivery()).resolves.toMatchObject({
      success: true,
      details: {
        kind: "duplicate_tool_suppressed",
      },
    })
    expect(telegramSend).toHaveBeenCalledOnce()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(1)

    const deliveryConsumedApproval = getLatestApprovalForRun(runId)!
    const deliveryConsumedMetadata = JSON.parse(
      deliveryConsumedApproval.metadata_json ?? "{}",
    ) as {
      executionTargetFingerprint?: string
    }
    expect(deliveryConsumedApproval.status).toBe("consumed")

    const completionConditions = [
      "One verified camera image was captured from the admitted target.",
      "The same artifact was delivered once to the current Telegram chat.",
    ]
    const completionEvidenceRef =
      `tool-result:yeonjang:${"c".repeat(64)}` as const
    const deliveryEvidenceRef =
      `delivery:telegram:${deliveryReceipts[0]!.id}`
    const observedAt = new Date().toISOString()
    const successfulTools = [{
      toolName: "yeonjang_camera_capture",
      output: "A verified camera artifact was created.",
      details: {
        via: "yeonjang",
        evidence: buildYeonjangEvidenceEnvelope({
          targetRef: targetFingerprint,
          toolName: "yeonjang_camera_capture",
          methodIds: ["camera.capture"],
          group: "camera",
          riskLevel: "dangerous",
          requiresApproval: true,
          summary: "One verified camera artifact was created.",
          postCheck: {
            kind: "verified",
            verified: true,
            exists: true,
            bytes: artifact.size_bytes ?? 0,
            artifactRef,
            mimeType: artifact.mime_type,
          },
        }),
      },
      evidenceSource: {
        sourceKind: "yeonjang" as const,
        sourceRef: completionEvidenceRef,
        trustClass: "untrusted_external" as const,
        instructionIsolation: "data_only" as const,
      },
    }]
    const operationalEvidence = {
      artifacts: [{
        artifactRef,
        targetRef: targetFingerprint,
        observedAt,
        receiptRef: deliveryEvidenceRef,
      }],
      stateChanges: [],
      deliveries: [{
        deliveryRef: deliveryEvidenceRef,
        targetRef: deliveryTargetFingerprint,
        observedAt,
        status: "satisfied" as const,
      }],
    }
    const expectedConditions =
      buildCompletionReviewExpectedConditions(completionConditions)
    const reviewJson = JSON.stringify({
      status: "complete",
      summary: "사진 촬영과 현재 Telegram 대화 전송을 확인했습니다.",
      reason: "검증된 artifact와 전달 영수증이 동일 실행에 결속되어 있습니다.",
      remaining_items: [],
      criterion_assessments: COMPLETION_REVIEW_CRITERION_KEYS.map(
        (criterionKey) => ({
          criterion_key: criterionKey,
          applicable: true,
          verdict: "satisfied",
          evidence_refs: [
            criterionKey === "delivery"
              ? deliveryEvidenceRef
              : criterionKey === "freshness"
                ? artifactRef
                : completionEvidenceRef,
          ],
          uncertainty: "",
          reason: `${criterionKey} verified`,
        }),
      ),
      condition_assessments: expectedConditions.map((condition) => ({
        condition_id: condition.conditionId,
        verdict: "satisfied",
        evidence_refs: [
          completionEvidenceRef,
          artifactRef,
          deliveryEvidenceRef,
        ],
        uncertainty: "",
        reason: "condition verified",
      })),
    })
    const reviewCalls: ChatParams[] = []
    const reviewRejected = vi.fn()
    const reviewProvider: AIProvider = {
      id: "camera-completion-review-provider",
      supportedModels: ["camera-completion-model"],
      maxContextTokens: () => 32_768,
      async *chat(params) {
        reviewCalls.push(params)
        yield { type: "text_delta", delta: reviewJson }
      },
    }
    const finalText =
      "사진을 촬영해 현재 Telegram 대화로 전송했습니다."
    const completionReview = await reviewTaskCompletion({
      instructionRuntime: createInstructionRuntimeContext(
        join(rootDir, "instruction-state"),
      ),
      originalRequest: "사진을 촬영해 현재 대화로 보내 주세요.",
      latestAssistantMessage: finalText,
      model: "camera-completion-model",
      providerId: reviewProvider.id,
      provider: reviewProvider,
      config: runtimeFixture.config,
      workDir: rootDir,
      successfulTools,
      operationalEvidence,
      completionConditions,
      requiresSuccessfulToolEvidence: true,
      runId,
      requestGroupId: runId,
      sessionId,
      onRejected: reviewRejected,
    })
    expect(completionReview?.status, JSON.stringify(
      reviewRejected.mock.calls,
    )).toBe("complete")
    expect(reviewCalls).toHaveLength(1)
    expect(reviewRejected).not.toHaveBeenCalled()
    if (!completionReview?.contextReceipt) {
      throw new Error("completion review receipt missing")
    }

    const executionSemantics = {
      filesystemEffect: "none" as const,
      artifactDelivery: "direct" as const,
      approvalRequired: true,
      approvalTool: "yeonjang_camera_capture",
      privilegedOperation: "external_system" as const,
    }
    const completionState = deriveCompletionStageState({
      review: completionReview,
      executionSemantics,
      preview: finalText,
      deliverySatisfied: true,
      successfulTools,
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })
    const completionDecision = decideCompletionFlow({
      review: completionReview,
      executionSemantics,
      preview: finalText,
      deliverySatisfied: true,
      successfulTools,
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })
    expect(completionDecision.kind).toBe("complete")
    if (completionDecision.kind !== "complete") {
      throw new Error("completion decision was not complete")
    }
    const canonicalCompletion = buildCanonicalCompletionOutcomeDescriptor({
      runId,
      review: completionReview,
      requiresLlmResultDiagnosis: true,
      expectedLlmDiagnosisContext: completionReview.contextReceipt,
      expectedLlmDiagnosisConditions: expectedConditions,
      state: completionState,
      application: completionDecision,
      preview: finalText,
    })
    expect(canonicalCompletion).toMatchObject({
      ok: true,
      descriptor: {
        event: "ALL_CRITERIA_VERIFIED",
      },
    })

    const finalResponseReceipt = buildDirectLlmResponseReviewReceipt({
      rawText: finalText,
      responseText: finalText,
      taskIntakePromptSha256: "d".repeat(64),
      finalResponsePromptSha256: "e".repeat(64),
      providerInvocationRef: "provider-invocation:camera-final",
    })
    const finalTelegramSend = vi.fn()
    const onFinalChunk = vi.fn(async (chunk: { type: string }) => {
      if (chunk.type !== "done") return undefined
      finalTelegramSend()
      return {
        textDeliveries: [{
          channel: "telegram" as const,
          text: finalText,
          messageIds: ["telegram-message:camera-final"],
          deliveryReceipts: [{
            channelId: "telegram:primary",
            provider: "telegram",
            connectionId: "telegram:primary",
            target: { roomId: "current-chat" },
            status: "sent" as const,
            timestamp: Date.now(),
            idempotencyKey: "telegram:camera-final:once",
            messageId: "telegram-message:camera-final",
          }],
        }],
      }
    })
    const finalizationDependencies = {
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunSuccess: vi.fn(),
      rememberRunFailure: vi.fn(),
      deliveryDependencies: {
        now: () => Date.now(),
        createId: () => "message:camera-final",
        insertMessage: vi.fn(),
        emitStart: vi.fn(),
        emitStream: vi.fn(),
        emitEnd: vi.fn(),
        writeReplyLog: vi.fn(),
      },
    }
    const finalize = () => completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: finalText,
      textSource: "llm_generated" as const,
      preauthorizedResponseReview: {
        rawText: finalText,
        rawTextSource: "llm_generated" as const,
        contentKind: "direct_answer" as const,
        expectedLanguage: "ko" as const,
        receipt: finalResponseReceipt,
      },
      source: "telegram" as const,
      onChunk: onFinalChunk,
      dependencies: finalizationDependencies,
    })
    await expect(finalize()).resolves.toMatchObject({
      status: "completed",
    })
    await expect(finalize()).resolves.toMatchObject({
      status: "completed",
    })
    expect(finalTelegramSend).toHaveBeenCalledOnce()
    expect(reviewCalls).toHaveLength(1)
    expect(remoteCapture).toHaveBeenCalledOnce()
    expect(telegramSend).toHaveBeenCalledOnce()

    const finalDeliveredEvents = listMessageLedgerEvents({
      runId,
      limit: 100,
    }).filter((event) => event.event_kind === "final_answer_delivered")
    expect(finalDeliveredEvents).toHaveLength(1)
    const completedFacts = {
      capture: postEffectFacts,
      requestOutcome: {
        executionStatus: "succeeded" as const,
        deliveryStatus: "delivered" as const,
      },
      deliveryApproval: {
        approvalRequestRef: deliveryConsumedApproval.id,
        runId: deliveryConsumedApproval.run_id,
        requestGroupId:
          deliveryConsumedApproval.request_group_id ?? "",
        toolName: "telegram_send_file",
        status: "consumed",
        executionTargetFingerprint:
          deliveryConsumedMetadata.executionTargetFingerprint ?? "",
        artifactRef,
      },
      delivery: {
        providerSendCount: telegramSend.mock.calls.length,
        receiptCount: deliveryReceipts.length,
        receiptRef: deliveryReceipts[0]!.id,
        artifactRef,
        executionTargetFingerprint: deliveryTargetFingerprint,
      },
      completionReview: {
        invocationCount: reviewCalls.length,
        receiptId: completionReview.contextReceipt.receiptId,
        status: "complete",
      },
      finalResponse: {
        deliveryCount: finalDeliveredEvents.length,
        receiptId: finalResponseReceipt.receiptId,
        language: "ko",
        rootOwnerFinalized: true as const,
      },
    }
    expect(projectCameraConversationCompletedSnapshot({
      ...completedFacts,
      completionReview: {
        ...completedFacts.completionReview,
        invocationCount: 0,
      },
    })).toEqual({
      status: "failure",
      reasonCode: "camera_completed_llm_receipts_invalid",
    })
    const completed =
      projectCameraConversationCompletedSnapshot(completedFacts)
    if (completed.status !== "success") {
      throw new Error(completed.reasonCode)
    }
    expect(validateCameraChannelAcceptance(completed.value.camera)).toEqual({
      status: "passed",
      failures: [],
    })
    const terminalVerifier = new VerifyConversationProcessUseCase({
      probe: {
        start: vi.fn(async () => ({
          status: "success",
          value: { runId, requestGroupId: runId, sessionId },
        })),
        observe: vi.fn(async () => ({
          status: "success",
          value: completed.value.conversation,
        })),
      },
      control: {
        interact: vi.fn(async () => ({ status: "success" })),
        cancel: vi.fn(async () => ({ status: "success" })),
      },
      delivery: {
        verifyDelivery: vi.fn(async () => ({
          status: "success",
          value: {
            delivered: true,
            channel: "telegram",
            targetRef: facts.deliveryTarget.targetRef,
            receiptRef: finalDeliveredEvents[0]!.id,
          },
        })),
      },
    })
    await expect(terminalVerifier.execute({
      scenarioId: "telegram.camera.capture.completed",
      channel: "telegram",
      userRequest: "fixture input is not interpreted by the adapter",
      expectedExecutionStatus: "succeeded",
      expectedTargetRef: facts.deliveryTarget.targetRef,
      allowedEffects: [
        "yeonjang_camera_capture",
        "telegram_send_file",
      ],
      userReportExpected: true,
      requiresCapabilityAdmission: true,
      requiresDistinctDecisionReceipts: true,
    })).resolves.toMatchObject({
      verificationStatus: "success",
      releaseReadiness: "passed",
    })
    const completedPublicSnapshot = JSON.stringify(completed.value)
    expect(completedPublicSnapshot).not.toContain(rootDir)
    expect(completedPublicSnapshot).not.toContain(deliveryTargetId)
    expect(completedPublicSnapshot).not.toContain(targetId)

    await expect(dispatchCamera()).resolves.toMatchObject({
      success: false,
      error: "recovery_strategy_unchanged",
    })
    expect(remoteCapture).toHaveBeenCalledOnce()
    expect(listMessageLedgerEvents({
      runId,
      limit: 100,
    }).filter((event) => event.event_kind === "approval_requested")).toHaveLength(2)
  })

  it("stops a denied delivery before the Telegram provider boundary", async () => {
    const telegramSend = vi.fn()
    const harness = createVerifiedDeliveryHarness({ send: telegramSend })

    const pending = harness.dispatch()
    const approval = await waitForApproval()
    expect(harness.dispatcher.resolvePendingInteraction(
      runId,
      "deny",
    )).toBe(true)
    await expect(pending).resolves.toMatchObject({
      success: false,
      error: "denied",
    })

    expect(getLatestApprovalForRun(runId)).toMatchObject({
      id: approval.id,
      status: "denied",
      decision_source: "user",
    })
    expect(telegramSend).not.toHaveBeenCalled()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(0)
    expect(listArtifactMetadataForRun(runId)).toHaveLength(1)
    expect(listMessageLedgerEvents({
      runId,
      limit: 100,
    }).filter((event) =>
      event.event_kind === "final_answer_delivered"
    )).toHaveLength(0)
  })

  it("expires a delivery approval without sending or losing the artifact", async () => {
    vi.useFakeTimers({ now: Date.now() })
    const telegramSend = vi.fn()
    const harness = createVerifiedDeliveryHarness({ send: telegramSend })

    const pending = harness.dispatch()
    const approval = getActiveApprovalForRun(runId)
    expect(approval?.status).toBe("requested")
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(pending).resolves.toMatchObject({
      success: false,
      error: "denied",
    })

    expect(getLatestApprovalForRun(runId)).toMatchObject({
      id: approval?.id,
      status: "expired",
      decision_source: "timeout",
    })
    expect(telegramSend).not.toHaveBeenCalled()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(0)
    expect(listArtifactMetadataForRun(runId)).toHaveLength(1)
  })

  it("cancels an awaiting delivery without treating abort as camera failure", async () => {
    const telegramSend = vi.fn()
    const controller = new AbortController()
    const harness = createVerifiedDeliveryHarness({
      send: telegramSend,
      signal: controller.signal,
    })

    const pending = harness.dispatch()
    const approval = await waitForApproval()
    controller.abort()
    await expect(pending).resolves.toMatchObject({
      success: false,
      error: "denied",
    })

    expect(getLatestApprovalForRun(runId)).toMatchObject({
      id: approval.id,
      status: "denied",
      decision_source: "abort",
    })
    expect(telegramSend).not.toHaveBeenCalled()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(0)
    expect(listArtifactMetadataForRun(runId)).toHaveLength(1)
  })

  it("preserves a verified capture when Telegram transport fails once", async () => {
    const telegramSend = vi.fn(async () => {
      throw new Error("telegram transport unavailable")
    })
    const harness = createVerifiedDeliveryHarness({ send: telegramSend })

    const pending = harness.dispatch()
    await waitForApproval()
    harness.dispatcher.resolvePendingInteraction(runId, "allow_once")
    const failed = await pending

    expect(failed.success).toBe(false)
    expect(failed.error).not.toMatch(/camera|permission/iu)
    expect(telegramSend).toHaveBeenCalledOnce()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(0)
    expect(listArtifactMetadataForRun(runId)).toHaveLength(1)
    expect(listMessageLedgerEvents({
      runId,
      limit: 100,
    }).filter((event) =>
      event.event_kind === "final_answer_delivered"
    )).toHaveLength(0)

    await expect(harness.dispatch()).resolves.toMatchObject({
      success: true,
      details: {
        kind: "duplicate_tool_suppressed",
      },
    })
    expect(telegramSend).toHaveBeenCalledOnce()
    expect(listArtifactReceiptsForRun(runId)).toHaveLength(0)
  })
})
