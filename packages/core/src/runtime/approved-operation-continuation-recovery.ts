import { randomUUID } from "node:crypto"
import {
  createArtifactStorageContext,
  resolveArtifactReference,
} from "../artifacts/lifecycle.js"
import type { RuntimePaths } from "../config/paths.js"
import type { KnowbeeConfig } from "../config/types.js"
import { SqliteApprovedOperationContinuationRepository } from "../db/approved-operation-continuation-repository.js"
import { SqliteSideEffectOperationRepository } from "../db/side-effect-operation-repository.js"
import {
  getDb,
  getMessagesForRun,
  getSession,
  hasArtifactReceipt,
} from "../db/index.js"
import { handoffApprovedOperationResult } from "../runs/approved-operation-result-handoff.js"
import { getApprovalRegistryRow } from "../runs/approval-registry.js"
import {
  consumeApprovedOperationContinuation,
  type ApprovedOperationContinuationExecutionResult,
} from "../runs/approved-operation-continuation-consumer.js"
import type { ApprovedOperationContinuation } from "../runs/approved-operation-continuation.js"
import { getRootRun } from "../runs/store.js"
import { evaluateAndRecordToolPolicy } from "../security/tool-policy.js"
import type {
  CanonicalPendingDeliveryHandlerResolver,
} from "../runs/canonical-pending-response-recovery-runtime.js"
import {
  executeToolWithSideEffectLedger,
  resolveToolSideEffectOperation,
} from "../tools/side-effect-runtime.js"
import {
  resolveApprovedArtifactDeliveryOperation,
} from "../tools/approved-artifact-delivery-operation.js"
import { telegramSendFileTool } from "../tools/builtin/telegram-send.js"
import {
  createTelegramSendContinuationAdapter,
  type TelegramSendContinuationCandidate,
} from "../tools/builtin/telegram-send-continuation.js"
import { yeonjangCameraCaptureTool } from "../tools/builtin/yeonjang.js"
import {
  createYeonjangCameraContinuationAdapter,
  type YeonjangCameraContinuationCandidate,
} from "../tools/builtin/yeonjang-camera-continuation.js"
import {
  isArtifactDeliveryResultDetails,
  type AnyTool,
  type ToolContext,
} from "../tools/types.js"
import type { ToolResult } from "../tools/types.js"
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js"
import { parseTelegramSessionKey } from "../channels/telegram/session.js"

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u
const CAMERA_TOOL = yeonjangCameraCaptureTool as AnyTool
const TELEGRAM_SEND_TOOL = telegramSendFileTool as AnyTool

export interface ApprovedOperationContinuationRecoverySummary {
  readonly claimed: number
  readonly completed: number
  readonly blocked: number
  readonly cancelled: boolean
  readonly completedRunIds: readonly string[]
}

function approvalExecutionTargetFingerprint(
  approvalId: string,
): `sha256:${string}` | undefined {
  const row = getApprovalRegistryRow(approvalId)
  if (!row?.metadata_json) return undefined
  try {
    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>
    const value = metadata.executionTargetFingerprint
    return typeof value === "string" && HASH_PATTERN.test(value)
      ? value as `sha256:${string}`
      : undefined
  } catch {
    return undefined
  }
}

function cameraCandidates(): YeonjangCameraContinuationCandidate[] {
  return listYeonjangRegistryInstances()
    .filter((instance) => instance.runnableTarget)
    .map((instance) => ({
      extensionId: instance.nodeId,
      ...(instance.session?.sessionId
        ? { targetSessionId: instance.session.sessionId }
        : {}),
    }))
}

function parseCameraCandidate(
  value: unknown,
): YeonjangCameraContinuationCandidate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const input = value as Record<string, unknown>
  if (typeof input.extensionId !== "string" || !input.extensionId.trim()) {
    return undefined
  }
  const requestedFacing =
    input.requestedFacing === "front" || input.requestedFacing === "rear"
      ? input.requestedFacing
      : undefined
  return {
    extensionId: input.extensionId,
    ...(typeof input.targetSessionId === "string"
      ? { targetSessionId: input.targetSessionId }
      : {}),
    ...(typeof input.deviceId === "string"
      ? { deviceId: input.deviceId }
      : {}),
    ...(requestedFacing ? { requestedFacing } : {}),
  }
}

function findExactCameraToolUseId(input: {
  continuation: ApprovedOperationContinuation
  sessionId: string
  projectOperation(
    params: YeonjangCameraContinuationCandidate,
  ): {
    operationId: string
    operationBindingHash: `sha256:${string}`
  } | null
}): string | undefined {
  const messages = getMessagesForRun(
    input.sessionId,
    input.continuation.runId,
  )
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "assistant" || !message.tool_calls) continue
    let blocks: unknown
    try {
      blocks = JSON.parse(message.tool_calls)
    } catch {
      continue
    }
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue
      const candidate = block as Record<string, unknown>
      if (
        candidate.type !== "tool_use"
        || candidate.name !== input.continuation.toolName
        || typeof candidate.id !== "string"
      ) {
        continue
      }
      const params = parseCameraCandidate(candidate.input)
      if (!params) continue
      const projected = input.projectOperation(params)
      if (
        projected?.operationId === input.continuation.operationId
        && projected.operationBindingHash
          === input.continuation.operationBindingHash
      ) {
        return candidate.id
      }
    }
  }
  return undefined
}

function telegramSendCandidates(input: {
  continuation: ApprovedOperationContinuation
  sessionId: string
}): TelegramSendContinuationCandidate[] {
  const candidates: TelegramSendContinuationCandidate[] = []
  const messages = getMessagesForRun(
    input.sessionId,
    input.continuation.runId,
  )
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "assistant" || !message.tool_calls) continue
    let blocks: unknown
    try {
      blocks = JSON.parse(message.tool_calls)
    } catch {
      continue
    }
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (!block || typeof block !== "object" || Array.isArray(block)) {
        continue
      }
      const candidate = block as Record<string, unknown>
      const params =
        candidate.input
        && typeof candidate.input === "object"
        && !Array.isArray(candidate.input)
          ? candidate.input as Record<string, unknown>
          : null
      if (
        candidate.type !== "tool_use"
        || candidate.name !== "telegram_send_file"
        || typeof candidate.id !== "string"
        || typeof params?.artifactRef !== "string"
      ) {
        continue
      }
      candidates.push({
        toolUseId: candidate.id,
        artifactRef: params.artifactRef,
        ...(typeof params.caption === "string"
          ? { caption: params.caption }
          : {}),
      })
    }
  }
  return candidates
}

function verifiedCameraResult(
  result: ToolResult,
  input: {
    continuation: ApprovedOperationContinuation
    context: ToolContext
  },
): ToolResult | undefined {
  const details = result.details && typeof result.details === "object"
      && !Array.isArray(result.details)
    ? result.details as Record<string, unknown>
    : {}
  const verification = details.artifactVerification
    && typeof details.artifactVerification === "object"
    && !Array.isArray(details.artifactVerification)
    ? details.artifactVerification as Record<string, unknown>
    : {}
  if (
    result.success
    && verification.status === "verified"
    && typeof verification.artifactRef === "string"
  ) {
    const resolved = resolveArtifactReference({
      artifactRef: verification.artifactRef,
      runId: input.continuation.runId,
      requestGroupId:
        input.continuation.requestGroupId ?? input.continuation.runId,
    }, input.context.artifactStorage)
    return resolved.ok ? result : undefined
  }
  if (!result.success) return undefined

  const repository = new SqliteSideEffectOperationRepository(
    getDb(),
    () => Date.now(),
  )
  const aggregate = repository.listByRun(input.continuation.runId).find(
    (candidate) =>
      candidate.identity.operationId === input.continuation.operationId
      && candidate.state === "VERIFIED",
  )
  const effectTransition = aggregate?.transitions.find(
    (transition) => transition.event === "RECORD_EFFECT",
  )
  const receipt = effectTransition
    ? repository.loadReceipt(effectTransition.receiptRef)
    : undefined
  const artifactRef = receipt?.evidenceRefs.find((ref) =>
    ref.startsWith("artifact:"))
  if (!artifactRef) return undefined
  const resolved = resolveArtifactReference({
    artifactRef,
    runId: input.continuation.runId,
    requestGroupId:
      input.continuation.requestGroupId ?? input.continuation.runId,
  }, input.context.artifactStorage)
  if (!resolved.ok || resolved.sizeBytes < 1) return undefined
  return {
    success: true,
    output: "Recovered the verified camera artifact from the side-effect receipt.",
    details: {
      artifactVerification: {
        status: "verified",
        artifactRef: resolved.artifactRef,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      },
    },
  }
}

function buildRecoveryContext(input: {
  continuation: ApprovedOperationContinuation
  config: KnowbeeConfig
  paths: RuntimePaths
  signal: AbortSignal
}): ToolContext | undefined {
  const run = getRootRun(input.continuation.runId)
  if (!run) return undefined
  return {
    artifactStorage: createArtifactStorageContext(input.paths),
    sessionId: run.sessionId,
    runId: run.id,
    requestGroupId: run.requestGroupId,
    workDir: input.config.profile.workspace,
    userMessage: run.prompt,
    source: run.source,
    allowWebAccess: false,
    onProgress: () => undefined,
    signal: input.signal,
    mqttConfig: input.config.mqtt,
    securityConfig: input.config.security,
    searchConfig: input.config.search,
    memoryConfig: input.config.memory,
  }
}

function createCameraAdapter(input: {
  continuation: ApprovedOperationContinuation
  config: KnowbeeConfig
  paths: RuntimePaths
  signal: AbortSignal
}) {
  const context = buildRecoveryContext(input)
  const executionTargetFingerprint =
    approvalExecutionTargetFingerprint(input.continuation.approvalId)
  const project = (params: YeonjangCameraContinuationCandidate) => {
    if (!context) return null
    const resolution = resolveToolSideEffectOperation({
      tool: CAMERA_TOOL,
      params: { ...params },
      ctx: context,
      ...(executionTargetFingerprint
        ? { executionTargetFingerprint }
        : {}),
    })
    return resolution.status === "resolved"
      ? {
          operationId: resolution.operation.prepared.identity.operationId,
          operationBindingHash:
            resolution.operation.prepared.operationBindingHash,
          operation: resolution.operation,
        }
      : null
  }
  return createYeonjangCameraContinuationAdapter({
    candidates: cameraCandidates,
    projectOperation: (params) => {
      const projected = project(params)
      return projected ?? {
        operationId: "unavailable",
        operationBindingHash: `sha256:${"0".repeat(64)}`,
      }
    },
    execute: async (
      params,
      continuation,
      signal,
    ): Promise<ApprovedOperationContinuationExecutionResult> => {
      if (!context || signal.aborted) {
        return {
          status: signal.aborted ? "cancelled" : "blocked",
          reasonCode: signal.aborted
            ? "approval_continuation_cancelled"
            : "approval_continuation_run_missing",
        }
      }
      const projected = project(params)
      if (
        !projected
        || projected.operationId !== continuation.operationId
        || projected.operationBindingHash
          !== continuation.operationBindingHash
      ) {
        return {
          status: "blocked",
          reasonCode: "camera_continuation_binding_not_rehydratable",
        }
      }
      const toolUseId = findExactCameraToolUseId({
        continuation,
        sessionId: context.sessionId,
        projectOperation: project,
      })
      if (!toolUseId) {
        return {
          status: "blocked",
          reasonCode: "camera_continuation_tool_use_binding_missing",
        }
      }
      const policy = evaluateAndRecordToolPolicy({
        toolName: CAMERA_TOOL.name,
        riskLevel: CAMERA_TOOL.riskLevel,
        params: projected.operation.executionParams,
        authorizationParams: projected.operation.authorizationParams,
        ctx: context,
        security: input.config.security,
        approvalId: continuation.approvalId,
        approvalDecision: continuation.decision,
      })
      if (policy.decision !== "allow") {
        return {
          status: "blocked",
          reasonCode: policy.reasonCode,
        }
      }
      const result = await executeToolWithSideEffectLedger({
        tool: CAMERA_TOOL,
        params: projected.operation.executionParams,
        preparedOperation: projected.operation,
        ctx: {
          ...context,
          authorizationReceipt: Object.freeze({
            policyDecisionId: policy.id,
            toolName: CAMERA_TOOL.name,
            paramsHash: policy.paramsHash,
            policyDecision: "allow",
            permissionScope: policy.permissionScope,
            runId: continuation.runId,
            requestGroupId:
              continuation.requestGroupId ?? continuation.runId,
            ...(executionTargetFingerprint
              ? { executionTargetFingerprint }
              : {}),
            approvalDecision: continuation.decision,
            approvalId: continuation.approvalId,
          }),
        },
      })
      const verifiedResult = verifiedCameraResult(result, {
        continuation,
        context,
      })
      if (!verifiedResult) {
        return {
          status: signal.aborted ? "cancelled" : "blocked",
          reasonCode: signal.aborted
            ? "approval_continuation_cancelled"
            : "camera_continuation_effect_failed",
        }
      }
      return {
        status: "completed",
        toolUseId,
        result: verifiedResult,
      }
    },
  })
}

function createTelegramDeliveryAdapter(input: {
  continuation: ApprovedOperationContinuation
  config: KnowbeeConfig
  paths: RuntimePaths
  signal: AbortSignal
  resolveDeliveryHandler?: CanonicalPendingDeliveryHandlerResolver
}) {
  const context = buildRecoveryContext(input)
  const project = (candidate: TelegramSendContinuationCandidate) => {
    if (!context) return null
    const resolution = resolveApprovedArtifactDeliveryOperation({
      tool: TELEGRAM_SEND_TOOL,
      params: {
        artifactRef: candidate.artifactRef,
        ...(candidate.caption ? { caption: candidate.caption } : {}),
      },
      ctx: context,
    })
    return resolution.status === "resolved"
      ? resolution.operation
      : null
  }
  return createTelegramSendContinuationAdapter({
    candidates: () => context
      ? telegramSendCandidates({
          continuation: input.continuation,
          sessionId: context.sessionId,
        })
      : [],
    projectOperation: (candidate) => {
      const operation = project(candidate)
      return operation
        ? {
            operationId: operation.binding.operationId,
            operationBindingHash:
              operation.binding.operationBindingHash,
          }
        : null
    },
    execute: async (candidate, continuation, signal) => {
      if (!context || signal.aborted) {
        return {
          status: signal.aborted ? "cancelled" : "blocked",
          reasonCode: signal.aborted
            ? "approval_continuation_cancelled"
            : "approval_continuation_run_missing",
        }
      }
      const operation = project(candidate)
      if (
        !operation
        || operation.binding.operationId !== continuation.operationId
        || operation.binding.operationBindingHash
          !== continuation.operationBindingHash
      ) {
        return {
          status: "blocked",
          reasonCode:
            "telegram_delivery_continuation_binding_not_rehydratable",
        }
      }
      const session = getSession(context.sessionId)
      const target =
        session?.source === "telegram" && session.source_id
          ? parseTelegramSessionKey(session.source_id)
          : null
      const onChunk = input.resolveDeliveryHandler?.({
        runId: continuation.runId,
        sessionId: context.sessionId,
        source: "telegram",
      })
      if (!target || !onChunk) {
        return {
          status: "blocked",
          reasonCode: "telegram_delivery_runtime_target_unavailable",
        }
      }
      const params = {
        artifactRef: candidate.artifactRef,
        ...(candidate.caption ? { caption: candidate.caption } : {}),
      }
      const policy = evaluateAndRecordToolPolicy({
        toolName: TELEGRAM_SEND_TOOL.name,
        riskLevel: TELEGRAM_SEND_TOOL.riskLevel,
        params,
        authorizationParams: operation.authorizationParams,
        ctx: context,
        security: input.config.security,
        approvalId: continuation.approvalId,
        approvalDecision: continuation.decision,
      })
      if (policy.decision !== "allow") {
        return { status: "blocked", reasonCode: policy.reasonCode }
      }
      const result = await TELEGRAM_SEND_TOOL.execute(params, {
        ...context,
        authorizationReceipt: Object.freeze({
          policyDecisionId: policy.id,
          toolName: TELEGRAM_SEND_TOOL.name,
          paramsHash: policy.paramsHash,
          policyDecision: "allow",
          permissionScope: policy.permissionScope,
          runId: continuation.runId,
          requestGroupId:
            continuation.requestGroupId ?? continuation.runId,
          executionTargetFingerprint: operation.targetFingerprint,
          approvalDecision: continuation.decision,
          approvalId: continuation.approvalId,
        }),
      })
      if (
        !result.success
        || !isArtifactDeliveryResultDetails(result.details)
        || !("artifactRef" in result.details)
        || result.details.artifactRef !== candidate.artifactRef
      ) {
        return {
          status: "blocked",
          reasonCode: "telegram_delivery_continuation_prepare_failed",
        }
      }
      const resolved = resolveArtifactReference({
        artifactRef: candidate.artifactRef,
        runId: continuation.runId,
        requestGroupId:
          continuation.requestGroupId ?? continuation.runId,
      }, context.artifactStorage)
      if (!resolved.ok) {
        return {
          status: "blocked",
          reasonCode: "telegram_delivery_continuation_artifact_missing",
        }
      }
      const delivery = await onChunk({
        type: "tool_end",
        toolName: TELEGRAM_SEND_TOOL.name,
        success: true,
        output: result.output,
        details: result.details,
      })
      const exactTarget =
        `${target.chatId}${target.threadId !== undefined
          ? `:${target.threadId}`
          : ""}`
      const directDelivery = delivery?.artifactDeliveries?.some(
        (entry) =>
          entry.channel === "telegram"
          && entry.filePath === resolved.filePath
          && !entry.url
          && !entry.downloadUrl
          && entry.deliveryReceipts?.some((receipt) =>
            receipt.status === "sent"
            || receipt.status === "delivered"
          ),
      )
      const durableDelivery = hasArtifactReceipt({
        runId: continuation.runId,
        channel: "telegram",
        artifactPath: resolved.filePath,
        channelTarget: exactTarget,
      })
      if (!directDelivery && !durableDelivery) {
        if (signal.aborted) {
          return {
            status: "cancelled",
            reasonCode: "approval_continuation_cancelled",
          }
        }
        return {
          status: "completed",
          toolUseId: candidate.toolUseId,
          result: {
            success: false,
            output:
              "The approved Telegram artifact delivery did not produce a verified provider receipt.",
            error: "TELEGRAM_DELIVERY_PROVIDER_UNVERIFIED",
            details: {
              ...result.details,
              deliveryVerification: {
                status: "failed",
                reasonCode:
                  "telegram_delivery_continuation_provider_unverified",
                targetFingerprint: operation.targetFingerprint,
              },
            },
          },
        }
      }
      return {
        status: "completed",
        toolUseId: candidate.toolUseId,
        result: {
          ...result,
          output: "The approved artifact was delivered to the bound Telegram conversation.",
          details: {
            ...result.details,
            deliveryVerification: {
              status: "verified",
              targetFingerprint: operation.targetFingerprint,
            },
          },
        },
      }
    },
  })
}

export async function recoverApprovedOperationContinuations(input: {
  config: KnowbeeConfig
  paths: RuntimePaths
  signal: AbortSignal
  ownerId?: string
  resolveDeliveryHandler?: CanonicalPendingDeliveryHandlerResolver
}): Promise<ApprovedOperationContinuationRecoverySummary> {
  const repository = new SqliteApprovedOperationContinuationRepository(
    getDb(),
  )
  const ownerId =
    input.ownerId?.trim() || `startup-continuation:${randomUUID()}`
  let claimed = 0
  let completed = 0
  let blocked = 0
  const completedRunIds: string[] = []

  while (!input.signal.aborted) {
    const next = repository.claimNext({
      ownerId,
      leaseMs: 120_000,
    })
    if (next.status === "none") break
    claimed += 1
    const result = await consumeApprovedOperationContinuation({
      continuation: next.continuation,
      ownerId,
      signal: input.signal,
    }, {
      repository,
      adapters: [
        createCameraAdapter({
          continuation: next.continuation,
          config: input.config,
          paths: input.paths,
          signal: input.signal,
        }),
        createTelegramDeliveryAdapter({
          continuation: next.continuation,
          config: input.config,
          paths: input.paths,
          signal: input.signal,
          ...(input.resolveDeliveryHandler
            ? {
                resolveDeliveryHandler:
                  input.resolveDeliveryHandler,
              }
            : {}),
        }),
      ],
      handoffCompletedResult: async ({
        continuation,
        toolUseId,
        result,
      }) => handoffApprovedOperationResult({
        continuation,
        toolUseId,
        result,
      }),
    })
    if (result.status === "completed") {
      completed += 1
      completedRunIds.push(next.continuation.runId)
    }
    else blocked += 1
  }
  return {
    claimed,
    completed,
    blocked,
    cancelled: input.signal.aborted,
    completedRunIds: [...new Set(completedRunIds)],
  }
}
