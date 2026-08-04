import { createHash, randomUUID } from "node:crypto"
import mqtt, { type MqttClient } from "mqtt"
import type { ChannelSource } from "../channels/contracts.js"
import type { MqttConfig } from "../config/types.js"
import { createLogger, redactLogText } from "../logger/index.js"
import { type MqttExtensionSnapshot, getMqttBrokerSnapshot, getMqttExtensionSnapshots, validateMqttBrokerConfig } from "../mqtt/broker.js"
import { recordMessageLedgerEvent } from "../runs/message-ledger.js"
import {
  type YeonjangCommandAttemptEvidence,
  projectYeonjangResponseFailure,
} from "./command-attempt.js"
import type {
  YeonjangAuthorizationReceipt,
  YeonjangExecutionAuthorizationGrant,
  YeonjangExecutionAuthorizationIssuerPort,
} from "./execution-authorization-receipt.js"
import {
  type YeonjangMqttV2ExpectedArtifactFetchRejection,
  admitYeonjangMqttV2ArtifactFetchRejection,
  createYeonjangMqttV2ArtifactAssembler,
  createYeonjangMqttV2ArtifactControl,
} from "./mqtt-v2-artifact.js"
import { createYeonjangMqttV2Cancellation } from "./mqtt-v2-cancel.js"
import {
  type YeonjangMqttV2CommandMethod,
  buildYeonjangMqttV2Topics,
  createYeonjangMqttV2Command,
  deriveYeonjangMqttV2HmacKey,
  mapYeonjangMqttV2WireIdentity,
} from "./mqtt-v2-contract.js"
import {
  admitYeonjangMqttV2CapturePermissionResponse,
  createYeonjangMqttV2CapturePermissionQuery,
} from "./mqtt-v2-permission.js"
import { admitYeonjangMqttV2ResponseAckResult, createYeonjangMqttV2ResponseAck } from "./mqtt-v2-response-ack.js"
import { admitYeonjangMqttV2TerminalResponse } from "./mqtt-v2-response.js"
import { resolveYeonjangMqttV2Target } from "./mqtt-v2-target.js"

export type { YeonjangAuthorizationReceipt } from "./execution-authorization-receipt.js"

const log = createLogger("yeonjang:mqtt")
export const YEONJANG_COMMAND_PROTOCOL_VERSION = 1 as const

function yeonjangMqttErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface YeonjangRequestEnvelope {
  protocolVersion: typeof YEONJANG_COMMAND_PROTOCOL_VERSION
  id: string
  method: string
  params: Record<string, unknown>
  metadata?: YeonjangRequestMetadata
}

export interface YeonjangRequestMetadata {
  runId?: string
  requestGroupId?: string
  sessionId?: string
  targetSessionId?: string
  commandId?: string
  operationId?: string
  targetFingerprint?: `sha256:${string}`
  deliveryId?: string
  idempotencyKey?: string
  expiresAt?: number
  cancelToken?: string
  broadcastRunId?: string
  broadcastIndex?: number
  broadcastTotal?: number
  source?: ChannelSource
  agentId?: string
  auditId?: string
  capabilityDelegationId?: string
  authorizationReceipt?: YeonjangAuthorizationReceipt
}

export interface YeonjangErrorBody {
  code: string
  message: string
}

export interface YeonjangResponseEnvelope<T = unknown> {
  id?: string
  ok: boolean
  result?: T
  error?: YeonjangErrorBody
  attempt?: unknown
}

export class YeonjangCommandError extends Error {
  readonly code: string
  readonly attempt?: YeonjangCommandAttemptEvidence

  constructor(input: {
    code: string
    message: string
    attempt?: YeonjangCommandAttemptEvidence
  }) {
    super(input.message)
    this.name = "YeonjangCommandError"
    this.code = input.code
    if (input.attempt) this.attempt = input.attempt
  }
}

const MQTT_V2_CAMERA_FAILURE_CODES = Object.freeze({
  permission_not_determined: "camera_permission_not_determined",
  permission_denied: "camera_permission_denied",
  permission_restricted: "camera_permission_restricted",
  resource_busy: "camera_busy",
  cancelled: "camera_capture_cancelled",
  deadline_exceeded: "camera_capture_timeout",
  helper_timed_out: "camera_helper_timeout",
} as const)

function boundedTerminalFailureCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,127}$/u.test(value)
    ? value
    : null
}

/**
 * Converts the signed MQTT v2 terminal failure into the existing command-attempt
 * contract. The terminal, not user-facing prose, owns whether an effect started.
 */
export function projectYeonjangMqttV2TerminalFailure(input: {
  readonly method: YeonjangMqttV2CommandMethod
  readonly commandId: string
  readonly operationId: string
  readonly targetFingerprint: string
  readonly executionOutcome: "blocked" | "failed" | "cancelled" | "effect_unknown"
  readonly failure: Readonly<Record<string, unknown>> | null
}): {
  readonly code: string
  readonly message: string
  readonly attempt?: YeonjangCommandAttemptEvidence
} {
  const rawReasonCode = boundedTerminalFailureCode(input.failure?.reason_code)
  const reasonCode = input.method === "camera.capture" && rawReasonCode
    && Object.hasOwn(MQTT_V2_CAMERA_FAILURE_CODES, rawReasonCode)
      ? MQTT_V2_CAMERA_FAILURE_CODES[
          rawReasonCode as keyof typeof MQTT_V2_CAMERA_FAILURE_CODES
        ]
      : rawReasonCode ?? `yeonjang_v2_${input.executionOutcome}`
  const effectState = input.failure?.effect_state
  const retrySafety = input.failure?.retry_safety
  const terminalStage: YeonjangCommandAttemptEvidence["terminalStage"] =
    effectState === "not_started" || effectState === "confirmed_not_applied"
      ? "rejected"
      : input.executionOutcome === "cancelled"
        ? "cancelled"
        : input.failure?.stage === "helper_execution"
          && rawReasonCode === "helper_timed_out"
          ? "helper_timeout"
          : "handler_failed"
  const projectedRetrySafety: YeonjangCommandAttemptEvidence["retrySafety"] | null =
    retrySafety === "safe_redelivery_same_idempotency"
      ? "safe_same_command"
      : retrySafety === "material_change_required"
        || retrySafety === "local_action_required"
        || retrySafety === "not_retryable"
        ? "change_strategy"
        : retrySafety === "manual_verification_required"
          ? "unknown_effect_state"
          : null
  const targetFingerprint = /^sha256:[a-f0-9]{64}$/u.test(input.targetFingerprint)
    ? input.targetFingerprint as `sha256:${string}`
    : null
  const attempt = rawReasonCode && projectedRetrySafety && targetFingerprint
    ? {
        schemaVersion: 1 as const,
        method: input.method,
        commandId: input.commandId,
        operationId: input.operationId,
        targetFingerprint,
        terminalStage,
        reasonCode,
        retrySafety: projectedRetrySafety,
      }
    : undefined
  return {
    code: reasonCode,
    message: "Yeonjang MQTT v2 execution did not succeed.",
    ...(attempt ? { attempt } : {}),
  }
}

interface YeonjangChunkEnvelope {
  transport: "chunk"
  id: string
  chunk_index: number
  chunk_count: number
  total_size_bytes: number
  payload_digest: string
  encoding: "base64"
  mime_type: "application/json"
  base64_data: string
}

export type YeonjangChunkAssemblyResult =
  | { kind: "pending" }
  | { kind: "complete"; payload: Buffer }
  | {
      kind: "rejected"
      code: "invalid_response_chunk" | "response_chunk_too_large"
    }

export interface YeonjangChunkAssembler {
  accept(value: unknown): YeonjangChunkAssemblyResult
}

const DEFAULT_MAX_YEONJANG_RESPONSE_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_YEONJANG_RESPONSE_CHUNKS = 1024

export function createYeonjangChunkAssembler(input: {
  requestId: string
  maxTotalBytes?: number
  maxChunkCount?: number
}): YeonjangChunkAssembler {
  const maxTotalBytes = boundedPositiveInteger(
    input.maxTotalBytes,
    DEFAULT_MAX_YEONJANG_RESPONSE_BYTES,
  )
  const maxChunkCount = boundedPositiveInteger(
    input.maxChunkCount,
    DEFAULT_MAX_YEONJANG_RESPONSE_CHUNKS,
  )
  const parts = new Map<number, Buffer>()
  let expected:
    | {
        chunkCount: number
        totalSizeBytes: number
        payloadDigest: string
      }
    | undefined
  let terminal: YeonjangChunkAssemblyResult | undefined

  return {
    accept(value: unknown): YeonjangChunkAssemblyResult {
      if (terminal) return terminal
      const chunk = parseYeonjangChunkEnvelope(value)
      if (!chunk || chunk.id !== input.requestId) {
        terminal = rejectedChunk("invalid_response_chunk")
        return terminal
      }
      if (
        chunk.chunk_count > maxChunkCount
        || chunk.total_size_bytes > maxTotalBytes
        || chunk.base64_data.length > Math.ceil(maxTotalBytes / 3) * 4 + 4
      ) {
        terminal = rejectedChunk("response_chunk_too_large")
        return terminal
      }

      const normalizedDigest = chunk.payload_digest.toLowerCase()
      if (!expected) {
        expected = {
          chunkCount: chunk.chunk_count,
          totalSizeBytes: chunk.total_size_bytes,
          payloadDigest: normalizedDigest,
        }
      } else if (
        expected.chunkCount !== chunk.chunk_count
        || expected.totalSizeBytes !== chunk.total_size_bytes
        || expected.payloadDigest !== normalizedDigest
      ) {
        terminal = rejectedChunk("invalid_response_chunk")
        return terminal
      }

      const decoded = decodeCanonicalBase64(chunk.base64_data)
      if (!decoded) {
        terminal = rejectedChunk("invalid_response_chunk")
        return terminal
      }
      const existing = parts.get(chunk.chunk_index)
      if (existing && !existing.equals(decoded)) {
        terminal = rejectedChunk("invalid_response_chunk")
        return terminal
      }
      parts.set(chunk.chunk_index, decoded)
      const observedBytes = [...parts.values()].reduce(
        (total, part) => total + part.length,
        0,
      )
      if (observedBytes > expected.totalSizeBytes || observedBytes > maxTotalBytes) {
        terminal = rejectedChunk("response_chunk_too_large")
        return terminal
      }
      if (parts.size < expected.chunkCount) return { kind: "pending" }

      const ordered: Buffer[] = []
      for (let index = 0; index < expected.chunkCount; index += 1) {
        const part = parts.get(index)
        if (!part) {
          terminal = rejectedChunk("invalid_response_chunk")
          return terminal
        }
        ordered.push(part)
      }
      const payload = Buffer.concat(ordered)
      const actualDigest = `sha256:${createHash("sha256").update(payload).digest("hex")}`
      if (
        payload.length !== expected.totalSizeBytes
        || actualDigest !== expected.payloadDigest
      ) {
        terminal = rejectedChunk("invalid_response_chunk")
        return terminal
      }
      terminal = { kind: "complete", payload }
      return terminal
    },
  }
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback
}

function rejectedChunk(
  code: "invalid_response_chunk" | "response_chunk_too_large",
): YeonjangChunkAssemblyResult {
  return { kind: "rejected", code }
}

function parseYeonjangChunkEnvelope(value: unknown): YeonjangChunkEnvelope | null {
  if (!isChunkEnvelope(value)) return null
  const candidate = value as unknown as Record<string, unknown>
  if (
    typeof candidate.id !== "string"
    || candidate.id.length === 0
    || !Number.isSafeInteger(candidate.chunk_index)
    || !Number.isSafeInteger(candidate.chunk_count)
    || !Number.isSafeInteger(candidate.total_size_bytes)
    || (candidate.chunk_index as number) < 0
    || (candidate.chunk_count as number) < 1
    || (candidate.chunk_index as number) >= (candidate.chunk_count as number)
    || (candidate.total_size_bytes as number) < 1
    || typeof candidate.payload_digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/iu.test(candidate.payload_digest)
    || candidate.encoding !== "base64"
    || candidate.mime_type !== "application/json"
    || typeof candidate.base64_data !== "string"
    || candidate.base64_data.length === 0
  ) {
    return null
  }
  return candidate as unknown as YeonjangChunkEnvelope
}

function decodeCanonicalBase64(value: string): Buffer | null {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    return null
  }
  const decoded = Buffer.from(value, "base64")
  return decoded.toString("base64") === value ? decoded : null
}

interface YeonjangAttemptStageEnvelope {
  transport: "attempt_stage"
  id?: string
  schema_version: 1
  method: string
  command_id: string
  stage: "received" | "handler_started" | "helper_started"
}

export interface YeonjangClientOptions {
  extensionId?: string
  timeoutMs?: number
  forceRefresh?: boolean
  signal?: AbortSignal
  metadata?: YeonjangRequestMetadata
  mqttConfig?: MqttConfig
  executionAuthorization?: {
    readonly issuer: YeonjangExecutionAuthorizationIssuerPort
    readonly resourceScope: string
    readonly grant: YeonjangExecutionAuthorizationGrant
  }
}

export interface YeonjangCommandDispatch {
  requestId: string
  commandId: string
  deliveryId: string
  idempotencyKey: string
  expiresAt: number
  cancelToken: string
  metadata: YeonjangRequestMetadata
  request: YeonjangRequestEnvelope
}

export function createYeonjangCancellationRequest(input: {
  commandId: string
  cancelToken: string
  targetSessionId?: string
}): YeonjangRequestEnvelope {
  const commandId = input.commandId.trim()
  const cancelToken = input.cancelToken.trim()
  if (!commandId || !cancelToken) {
    throw new Error("Yeonjang cancellation requires an exact command and cancel token.")
  }
  const cancellationCommandId = randomUUID()
  return {
    protocolVersion: YEONJANG_COMMAND_PROTOCOL_VERSION,
    id: randomUUID(),
    method: "command.cancel",
    params: {
      command_id: commandId,
      cancel_token: cancelToken,
    },
    metadata: {
      commandId: cancellationCommandId,
      expiresAt: Date.now() + 5_000,
      ...(input.targetSessionId?.trim()
        ? { targetSessionId: input.targetSessionId.trim() }
        : {}),
    },
  }
}

export interface YeonjangMethodCapability {
  name: string
  implemented: boolean
  supported?: boolean
  supportState?: string
  requiresApproval?: boolean
  requiresPermission?: boolean
  permissionSetting?: string | null
  knownLimitations?: string[]
  requiresInteractiveDesktop?: boolean
  broadcastSafe?: boolean
  defaultTargetPolicy?: string
  reasonCodes?: string[]
  platformBaseline?: Record<string, unknown>
  outputModes?: string[]
  lastCheckedAt?: number
}

export interface ArmedYeonjangResponseWaiter<T> {
  readonly response: Promise<T>
  cancel(): Promise<void>
}

export function armYeonjangResponseWaiter<T>(
  createResponseWaiter: (cancellationSignal: AbortSignal) => Promise<T>,
): ArmedYeonjangResponseWaiter<T> {
  const cancellation = new AbortController()
  const response = createResponseWaiter(cancellation.signal)
  // Attach a rejection observer immediately so a publish failure cannot leave
  // a temporarily unhandled response-waiter rejection.
  void response.catch(() => undefined)
  return {
    response,
    async cancel() {
      cancellation.abort()
      await response.catch(() => undefined)
    },
  }
}

export interface YeonjangCapabilityMatrixEntry {
  supported?: boolean
  supportState?: string
  requiresApproval?: boolean
  requiresPermission?: boolean
  permissionSetting?: string | null
  knownLimitations?: string[]
  requiresInteractiveDesktop?: boolean
  broadcastSafe?: boolean
  defaultTargetPolicy?: string
  reasonCodes?: string[]
  platformBaseline?: Record<string, unknown>
  outputModes?: string[]
  lastCheckedAt?: number
}

export interface YeonjangCapabilitiesPayload {
  node?: string
  version?: string
  protocolVersion?: string
  protocol_version?: string
  gitTag?: string
  git_tag?: string
  gitCommit?: string
  git_commit?: string
  buildTarget?: string
  build_target?: string
  os?: string
  arch?: string
  platform?: string
  supportProfile?: string
  configuredSupportProfile?: string
  supportProfileReasonCodes?: string[]
  interactiveDesktopAvailable?: boolean
  trayRuntimeAvailable?: boolean
  transport?: string | string[]
  capabilityHash?: string
  capability_hash?: string
  capabilityMatrix?: Record<string, YeonjangCapabilityMatrixEntry>
  capability_matrix?: Record<string, YeonjangCapabilityMatrixEntry>
  methods?: YeonjangMethodCapability[]
  permissions?: Record<string, unknown>
  toolHealth?: Record<string, unknown>
  tool_health?: Record<string, unknown>
  lastCapabilityRefreshAt?: number
  lastCheckedAt?: number
}

export const DEFAULT_YEONJANG_EXTENSION_ID = "yeonjang-main"
const YEONJANG_CAPABILITY_TTL_MS = 5_000

const capabilityCache = new Map<string, { payload: YeonjangCapabilitiesPayload; cachedAt: number }>()
const extensionExecutionQueues = new Map<string, Promise<void>>()

export function buildYeonjangTopics(extensionId = DEFAULT_YEONJANG_EXTENSION_ID): {
  statusTopic: string
  capabilitiesTopic: string
  requestTopic: string
  responseTopic: string
  eventTopic: string
} {
  const normalized = extensionId.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const prefix = `knowbee/v1/node/${normalized}`
  return {
    statusTopic: `${prefix}/status`,
    capabilitiesTopic: `${prefix}/capabilities`,
    requestTopic: `${prefix}/request`,
    responseTopic: `${prefix}/response`,
    eventTopic: `${prefix}/event`,
  }
}

export async function invokeYeonjangMethod<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  options: YeonjangClientOptions = {},
): Promise<T> {
  const extensionId = options.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const timeoutMs = clampTimeout(options.timeoutMs)
  const mqttConfig = requireMqttClientConfig(options)
  const normalizedMetadata = normalizeYeonjangRequestMetadata(options.metadata)
  const dispatchBase = createYeonjangCommandDispatch(method, params, {
    extensionId,
    timeoutMs,
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
    ...(options.executionAuthorization
      ? { executionAuthorization: options.executionAuthorization }
      : {}),
  })
  const v2Snapshots = getMqttExtensionSnapshots().filter((candidate) =>
    candidate.protocolVersion === "2"
    && (candidate.extensionId === extensionId || candidate.nodeId === extensionId || candidate.instanceId === extensionId),
  )
  if (v2Snapshots.length > 0) {
    if (
      method !== "camera.capture"
      && method !== "screen.capture"
      && method !== "camera.permission_status"
    ) {
      throw new YeonjangCommandError({
        code: "yeonjang_v2_method_unsupported",
        message: `Yeonjang MQTT v2 does not advertise ${method}.`,
      })
    }
    const resolved = resolveYeonjangMqttV2Target({
      snapshots: v2Snapshots,
      requestedExtensionId: extensionId,
      ...(dispatchBase.metadata.targetSessionId
        ? { expectedSessionId: dispatchBase.metadata.targetSessionId }
        : {}),
    })
    if (!resolved.ok) {
      throw new YeonjangCommandError({ code: resolved.reasonCode, message: "Yeonjang MQTT v2 target resolution failed." })
    }
    const requesterId = mqttConfig.yeonjangV2?.requesterId.trim() ?? ""
    if (!requesterId) {
      throw new YeonjangCommandError({ code: "yeonjang_v2_requester_not_enrolled", message: "Gateway MQTT v2 requester enrollment is required." })
    }
    if (method === "camera.permission_status") {
      return await invokeYeonjangMqttV2CapturePermissionStatus<T>({
        options,
        mqttConfig,
        timeoutMs,
        dispatch: dispatchBase,
        requesterId,
        target: resolved.target,
        platform: v2Snapshots.find((snapshot) => snapshot.instanceId === resolved.target.instanceId)?.platform ?? "unknown",
      })
    }
    return await invokeYeonjangMqttV2Capture<T>({
      method,
      params,
      options,
      mqttConfig,
      timeoutMs,
      dispatch: dispatchBase,
      requesterId,
      target: resolved.target,
    })
  }
  const execute = async (): Promise<T> => {
    const topics = buildYeonjangTopics(extensionId)
    const autoRetryEligible = isYeonjangSafeRetryMethod(method)
    const maxAttempts = autoRetryEligible ? 2 : 1
    let attempt = 0
    let lastError: unknown = null

    while (attempt < maxAttempts) {
      attempt += 1
      const remainingMs = dispatchBase.expiresAt - Date.now()
      if (remainingMs <= 0) {
        recordYeonjangDeliveryLedgerEvent({
          metadata: dispatchBase.metadata,
          deliveryKey: dispatchBase.commandId,
          idempotencyKey: `${dispatchBase.idempotencyKey}:expired`,
          eventKind: "delivery_finalized",
          status: "failed",
          summary: `yeonjang command expired before delivery: ${method}`,
          detail: {
            method,
            extensionId,
            commandId: dispatchBase.commandId,
            targetSessionId: dispatchBase.metadata.targetSessionId ?? null,
          },
        })
        throw new Error("Yeonjang 명령 유효기간이 만료되었습니다.")
      }

      const request = createYeonjangCommandDispatch(method, params, {
        extensionId,
        timeoutMs,
        ...(options.executionAuthorization
          ? { executionAuthorization: options.executionAuthorization }
          : {}),
        metadata: {
          ...dispatchBase.metadata,
          commandId: dispatchBase.commandId,
          idempotencyKey: dispatchBase.idempotencyKey,
          expiresAt: dispatchBase.expiresAt,
          cancelToken: dispatchBase.cancelToken,
        },
      })
      const client = createClient(mqttConfig)

      log.debug(`invoking ${method} on ${extensionId} (attempt ${attempt}/${maxAttempts})`)

      try {
        throwIfYeonjangCancelled(options.signal, method, request.commandId)
        const attemptTimeoutMs = clampAttemptTimeout(timeoutMs, remainingMs)
        await waitForConnect(client, attemptTimeoutMs)
        throwIfYeonjangCancelled(options.signal, method, request.commandId)
        await subscribe(client, topics.responseTopic)
        throwIfYeonjangCancelled(options.signal, method, request.commandId)
        const responseWaiter = armYeonjangResponseWaiter<T>((cancellationSignal) =>
          waitForResponse<T>(
            client,
            topics.responseTopic,
            request.requestId,
            method,
            request.commandId,
            attemptTimeoutMs,
            options.signal,
            cancellationSignal,
            async () => {
              const cancellationRequest = createYeonjangCancellationRequest({
                commandId: request.commandId,
                cancelToken: request.cancelToken,
                ...(request.metadata.targetSessionId
                  ? { targetSessionId: request.metadata.targetSessionId }
                  : {}),
              })
              await publishCancellationBestEffort(
                client,
                topics.requestTopic,
                cancellationRequest,
              )
            },
          ))
        try {
          await publish(client, topics.requestTopic, request.request)
        } catch (publishError) {
          await responseWaiter.cancel()
          throw publishError
        }
        recordYeonjangDeliveryLedgerEvent({
          metadata: request.metadata,
          deliveryKey: request.commandId,
          idempotencyKey: `${request.idempotencyKey}:sent:${request.deliveryId}`,
          eventKind: "delivery_attempted",
          status: "sent",
          summary: `yeonjang delivery sent: ${method}`,
          detail: {
            method,
            extensionId,
            commandId: request.commandId,
            deliveryId: request.deliveryId,
            targetSessionId: request.metadata.targetSessionId ?? null,
            expiresAt: request.expiresAt,
            attempt,
            maxAttempts,
            autoRetryEligible,
          },
        })
        const response = await responseWaiter.response
        recordYeonjangDeliveryLedgerEvent({
          metadata: request.metadata,
          deliveryKey: request.commandId,
          idempotencyKey: `${request.idempotencyKey}:acked:${request.deliveryId}`,
          eventKind: "delivery_receipted",
          status: "delivered",
          summary: `yeonjang delivery acked: ${method}`,
          detail: {
            method,
            extensionId,
            commandId: request.commandId,
            deliveryId: request.deliveryId,
            targetSessionId: request.metadata.targetSessionId ?? null,
            attempt,
            maxAttempts,
            autoRetryEligible,
          },
        })
        return response
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts && isYeonjangUnavailableError(error) && dispatchBase.expiresAt > Date.now()) {
          recordYeonjangDeliveryLedgerEvent({
            metadata: request.metadata,
            deliveryKey: request.commandId,
            idempotencyKey: `${request.idempotencyKey}:retry:${attempt}`,
            eventKind: "delivery_backoff_scheduled",
            status: "pending",
            summary: `yeonjang delivery retry scheduled: ${method}`,
            detail: {
              method,
              extensionId,
              commandId: request.commandId,
              deliveryId: request.deliveryId,
              attempt,
              maxAttempts,
              autoRetryEligible,
              error: yeonjangMqttErrorMessage(error),
            },
          })
          continue
        }
        recordYeonjangDeliveryLedgerEvent({
          metadata: request.metadata,
          deliveryKey: request.commandId,
          idempotencyKey: `${request.idempotencyKey}:failed:${request.deliveryId}`,
          eventKind: "delivery_finalized",
          status: "failed",
          summary: `yeonjang delivery failed: ${method}`,
          detail: {
            method,
            extensionId,
            commandId: request.commandId,
            deliveryId: request.deliveryId,
            targetSessionId: request.metadata.targetSessionId ?? null,
            attempt,
            maxAttempts,
            autoRetryEligible,
            error: yeonjangMqttErrorMessage(error),
          },
        })
      } finally {
        await closeClient(client)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Yeonjang 요청이 실패했습니다."))
  }

  if (!shouldSerializeYeonjangMethod(method)) {
    return await execute()
  }
  return await enqueueYeonjangExtensionExecution(extensionId, execute)
}

async function invokeYeonjangMqttV2CapturePermissionStatus<T>(input: {
  readonly options: YeonjangClientOptions
  readonly mqttConfig: MqttConfig
  readonly timeoutMs: number
  readonly dispatch: YeonjangCommandDispatch
  readonly requesterId: string
  readonly target: { readonly instanceId: string; readonly sessionId: string; readonly targetFingerprint: string }
  readonly platform: string
}): Promise<T> {
  const enrollment = { ...input.target, requesterId: input.requesterId }
  const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(input.mqttConfig.password, "utf8"))
  const client = createClient(input.mqttConfig)
  const topics = buildYeonjangMqttV2Topics(enrollment)
  const now = Date.now()
  const expiresAt = Math.min(input.dispatch.expiresAt, now + input.timeoutMs)
  const requestId = mapYeonjangMqttV2WireIdentity("request", input.dispatch.requestId)
  const commandId = mapYeonjangMqttV2WireIdentity("command", input.dispatch.commandId)
  const operationId = mapYeonjangMqttV2WireIdentity(
    "permission",
    `${input.dispatch.requestId}:capture-permission`,
  )
  const idempotencyKey = mapYeonjangMqttV2WireIdentity(
    "idempotency",
    `${input.dispatch.idempotencyKey}:capture-permission`,
  )
  const query = createYeonjangMqttV2CapturePermissionQuery({
    enrollment,
    targetFingerprint: input.target.targetFingerprint,
    identity: {
      messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()),
      requestId,
      commandId,
      operationId,
      correlationId: mapYeonjangMqttV2WireIdentity("correlation", input.dispatch.metadata.requestGroupId ?? input.dispatch.metadata.runId ?? input.dispatch.requestId),
      causationId: mapYeonjangMqttV2WireIdentity("causation", input.dispatch.deliveryId),
      idempotencyKey,
      authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()),
      nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()),
    },
    issuedAt: now,
    expiresAt,
    sequence: 1,
    hmacKey,
  })
  try {
    throwIfYeonjangCancelled(input.options.signal, "camera.permission_status", commandId)
    await waitForConnect(client, input.timeoutMs)
    await subscribe(client, topics.responseTopic)
    const responsePayload = waitForExactMqttPayload({
      client,
      topic: topics.responseTopic,
      timeoutMs: input.timeoutMs,
      ...(input.options.signal ? { signal: input.options.signal } : {}),
      predicate: (payload) => {
        try {
          const value = JSON.parse(payload.toString("utf8")) as Record<string, unknown>
          return value.schema_id === "yeonjang.capture-permission-response.v2" && value.request_id === requestId
        } catch { return false }
      },
    })
    await publishJson(client, query.topic, query.envelope)
    const admitted = admitYeonjangMqttV2CapturePermissionResponse({
      payload: await responsePayload,
      nowMs: Date.now(),
      hmacKey,
      expected: {
        enrollment,
        requestId,
        commandId,
        operationId,
        idempotencyKey,
        targetFingerprint: input.target.targetFingerprint,
      },
    })
    if (!admitted.ok) {
      throw new YeonjangCommandError({
        code: admitted.reasonCode,
        message: "Yeonjang MQTT v2 permission response verification failed.",
      })
    }
    const camera = admitted.permission.permissions?.find((row) => row.method === "camera.capture")
    if (admitted.permission.outcome !== "available" || !camera) {
      throw new YeonjangCommandError({
        code: "yeonjang_v2_permission_observation_unavailable",
        message: "Yeonjang MQTT v2 camera permission observation was unavailable.",
      })
    }
    const status = camera.osPermission === "granted"
      ? "authorized"
      : camera.osPermission
    return {
      status,
      reason: `mqtt_v2_permission_${admitted.permission.outcome}`,
      platform: input.platform,
      canAttemptCapture: camera.platformAvailable && camera.localPolicy === "allowed" && camera.osPermission === "granted",
      requiresUserAction: camera.osPermission === "not_determined" || camera.osPermission === "denied" || camera.osPermission === "restricted",
    } as T
  } finally {
    await closeClient(client)
    hmacKey.fill(0)
  }
}

function normalizeYeonjangRequestMetadata(
  metadata?: YeonjangRequestMetadata,
): YeonjangRequestMetadata | undefined {
  if (!metadata) return undefined
  const normalizedEntries = Object.entries(metadata).filter(([key, value]) => {
    if (key === "authorizationReceipt" || key === "authorization_receipt") return false
    if (typeof value === "string") return value.trim().length > 0
    return value != null
  })
  if (normalizedEntries.length === 0) return undefined
  return Object.fromEntries(normalizedEntries) as YeonjangRequestMetadata
}

function normalizeMetadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizeMetadataNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.floor(parsed)
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`
}

function buildDefaultYeonjangIdempotencyKey(params: {
  commandId: string
  method: string
  extensionId: string
  targetSessionId?: string | null
  params: Record<string, unknown>
}): string {
  const hash = createHash("sha256")
    .update(stableStringify({
      commandId: params.commandId,
      method: params.method,
      extensionId: params.extensionId,
      targetSessionId: params.targetSessionId ?? null,
      params: params.params,
    }))
    .digest("hex")
  return `yeonjang-command:${hash}`
}

export function createYeonjangCommandDispatch(
  method: string,
  params: Record<string, unknown> = {},
  options: YeonjangClientOptions = {},
): YeonjangCommandDispatch {
  const timeoutMs = clampTimeout(options.timeoutMs)
  const now = Date.now()
  const extensionId = normalizeExtensionId(options.extensionId)
  const metadata = normalizeYeonjangRequestMetadata(options.metadata) ?? {}
  const commandId = normalizeMetadataString(metadata.commandId) ?? randomUUID()
  const deliveryId = randomUUID()
  const targetSessionId = normalizeMetadataString(metadata.targetSessionId)
  const expiresAt = normalizeMetadataNumber(metadata.expiresAt) ?? (now + timeoutMs)
  const cancelToken = normalizeMetadataString(metadata.cancelToken) ?? `yeonjang-cancel:${commandId}`
  const idempotencyKey = normalizeMetadataString(metadata.idempotencyKey) ?? buildDefaultYeonjangIdempotencyKey({
    commandId,
    method,
    extensionId,
    targetSessionId,
    params,
  })
  const unsignedMetadata: YeonjangRequestMetadata = {
    ...metadata,
    ...(targetSessionId ? { targetSessionId } : {}),
    commandId,
    deliveryId,
    idempotencyKey,
    expiresAt,
    cancelToken,
  }
  const executionAuthorization = options.executionAuthorization
  const authorization = executionAuthorization
    ? executionAuthorization.issuer.issue({
        extensionId,
        targetSessionId: targetSessionId ?? "",
        method,
        resourceScope: executionAuthorization.resourceScope,
        commandId,
        operationId: normalizeMetadataString(metadata.operationId) ?? "",
        targetFingerprint: normalizeMetadataString(metadata.targetFingerprint) ?? "",
        idempotencyKey,
        expiresAt,
        grant: executionAuthorization.grant,
      })
    : undefined
  if (authorization && !authorization.ok) {
    throw new YeonjangCommandError({
      code: authorization.reasonCode,
      message: "Yeonjang execution authorization could not be issued.",
    })
  }
  const nextMetadata: YeonjangRequestMetadata = {
    ...unsignedMetadata,
    ...(authorization?.ok ? { authorizationReceipt: authorization.receipt } : {}),
  }
  return {
    requestId: deliveryId,
    commandId,
    deliveryId,
    idempotencyKey,
    expiresAt,
    cancelToken,
    metadata: nextMetadata,
    request: {
      protocolVersion: YEONJANG_COMMAND_PROTOCOL_VERSION,
      id: deliveryId,
      method,
      params,
      metadata: nextMetadata,
    },
  }
}

export function isYeonjangSafeRetryMethod(method: string): boolean {
  const normalized = method.trim().toLowerCase()
  return normalized === "node.capabilities"
    || normalized === "node.ping"
    || normalized === "system.info"
    || normalized === "camera.list"
    || normalized === "screen.capture"
}

function recordYeonjangDeliveryLedgerEvent(input: {
  metadata: YeonjangRequestMetadata
  deliveryKey: string
  idempotencyKey: string
  eventKind: "delivery_attempted" | "delivery_receipted" | "delivery_backoff_scheduled" | "delivery_finalized"
  status: "pending" | "sent" | "delivered" | "failed"
  summary: string
  detail: Record<string, unknown>
}): void {
  if (!input.metadata.runId && !input.metadata.requestGroupId) return
  recordMessageLedgerEvent({
    runId: input.metadata.runId ?? null,
    requestGroupId: input.metadata.requestGroupId ?? input.metadata.runId ?? null,
    sessionKey: input.metadata.sessionId ?? null,
    channel: input.metadata.source ?? "unknown",
    eventKind: input.eventKind,
    deliveryKey: input.deliveryKey,
    idempotencyKey: input.idempotencyKey,
    status: input.status,
    summary: input.summary,
    detail: {
      ...input.detail,
      kind: "yeonjang_delivery",
      source: input.metadata.source ?? null,
      agentId: input.metadata.agentId ?? null,
      auditId: input.metadata.auditId ?? null,
      capabilityDelegationId: input.metadata.capabilityDelegationId ?? null,
      commandId: input.metadata.commandId ?? null,
      deliveryId: input.metadata.deliveryId ?? null,
      idempotencyKey: input.metadata.idempotencyKey ?? null,
      targetSessionId: input.metadata.targetSessionId ?? null,
      expiresAt: input.metadata.expiresAt ?? null,
      cancelToken: input.metadata.cancelToken ?? null,
    },
  })
}

export async function getYeonjangCapabilities(options: YeonjangClientOptions = {}): Promise<YeonjangCapabilitiesPayload> {
  const extensionId = normalizeExtensionId(options.extensionId)
  if (!options.forceRefresh) {
    const cached = getFreshCachedCapabilities(extensionId)
    if (cached) return cached

    const snapshot = getFreshCapabilitySnapshot(extensionId)
    if (snapshot) {
      const payload = snapshotToYeonjangCapabilitiesPayload(snapshot)
      rememberCapabilities(extensionId, payload)
      return payload
    }
  }

  const payload = await invokeYeonjangMethod<YeonjangCapabilitiesPayload>(
    "node.capabilities",
    {},
    { ...options, extensionId },
  )
  rememberCapabilities(extensionId, payload)
  return payload
}

export function clearYeonjangCapabilityCache(): void {
  capabilityCache.clear()
}

export function shouldSerializeYeonjangMethod(method: string): boolean {
  const normalized = method.trim().toLowerCase()
  return normalized !== "node.capabilities" && normalized !== "camera.list"
}

export async function enqueueYeonjangExtensionExecution<T>(
  extensionId: string,
  task: () => Promise<T>,
): Promise<T> {
  const normalizedExtensionId = normalizeExtensionId(extensionId)
  const previous = extensionExecutionQueues.get(normalizedExtensionId) ?? Promise.resolve()
  let releaseCurrentQueue!: () => void
  const currentQueue = new Promise<void>((resolve) => {
    releaseCurrentQueue = resolve
  })
  const queued = previous
    .catch(() => undefined)
    .then(() => currentQueue)
  extensionExecutionQueues.set(normalizedExtensionId, queued)

  await previous.catch(() => undefined)
  try {
    return await task()
  } finally {
    releaseCurrentQueue()
    if (extensionExecutionQueues.get(normalizedExtensionId) === queued) {
      extensionExecutionQueues.delete(normalizedExtensionId)
    }
  }
}

export async function canYeonjangHandleMethod(
  method: string,
  options: YeonjangClientOptions = {},
): Promise<boolean> {
  try {
    const capabilities = await getYeonjangCapabilities(options)
    return doesYeonjangCapabilitySupportMethod(capabilities, method)
  } catch (error) {
    if (isYeonjangUnavailableError(error)) return false
    throw error
  }
}

export function resolveYeonjangMethodCapability(
  capabilities: YeonjangCapabilitiesPayload,
  method: string,
): YeonjangCapabilityMatrixEntry | YeonjangMethodCapability | null {
  const matrix = capabilities.capabilityMatrix ?? capabilities.capability_matrix
  const matrixEntry = matrix?.[method]
  if (matrixEntry) return matrixEntry
  return capabilities.methods?.find((candidate) => candidate.name === method) ?? null
}

export function doesYeonjangCapabilitySupportMethod(
  capabilities: YeonjangCapabilitiesPayload,
  method: string,
): boolean {
  const entry = resolveYeonjangMethodCapability(capabilities, method)
  if (!entry) return false
  if ("supported" in entry && typeof entry.supported === "boolean") return entry.supported
  if ("implemented" in entry && typeof entry.implemented === "boolean") return entry.implemented
  return false
}

export function hasYeonjangCapabilityMatrix(capabilities: YeonjangCapabilitiesPayload): boolean {
  return Boolean(capabilities.capabilityMatrix ?? capabilities.capability_matrix)
}

export function resolveYeonjangCapabilityOutputModes(
  capabilities: YeonjangCapabilitiesPayload,
  method: string,
): string[] | null {
  const entry = resolveYeonjangMethodCapability(capabilities, method)
  if (!entry || !Array.isArray(entry.outputModes)) return null
  return entry.outputModes
    .map((mode) => mode.trim().toLowerCase())
    .filter(Boolean)
}

export function doesYeonjangCapabilitySupportOutputMode(
  capabilities: YeonjangCapabilitiesPayload,
  method: string,
  outputMode: string,
): boolean | null {
  const modes = resolveYeonjangCapabilityOutputModes(capabilities, method)
  if (!modes) return null
  return modes.includes(outputMode.trim().toLowerCase())
}

export function snapshotToYeonjangCapabilitiesPayload(snapshot: MqttExtensionSnapshot): YeonjangCapabilitiesPayload {
  const matrix = snapshot.capabilityMatrix as Record<string, YeonjangCapabilityMatrixEntry> | undefined
  return {
    node: "knowbee-yeonjang",
    ...(snapshot.version ? { version: snapshot.version } : {}),
    ...(snapshot.protocolVersion ? { protocolVersion: snapshot.protocolVersion } : {}),
    ...(snapshot.gitTag ? { gitTag: snapshot.gitTag } : {}),
    ...(snapshot.gitCommit ? { gitCommit: snapshot.gitCommit } : {}),
    ...(snapshot.buildTarget ? { buildTarget: snapshot.buildTarget } : {}),
    ...(snapshot.os ? { os: snapshot.os } : {}),
    ...(snapshot.arch ? { arch: snapshot.arch } : {}),
    ...(snapshot.platform ? { platform: snapshot.platform } : {}),
    ...(snapshot.transport ? { transport: snapshot.transport } : {}),
    ...(snapshot.capabilityHash ? { capabilityHash: snapshot.capabilityHash } : {}),
    ...(snapshot.supportProfile ? { supportProfile: snapshot.supportProfile } : {}),
    ...(snapshot.configuredSupportProfile ? { configuredSupportProfile: snapshot.configuredSupportProfile } : {}),
    ...(snapshot.supportProfileReasonCodes ? { supportProfileReasonCodes: snapshot.supportProfileReasonCodes } : {}),
    ...(typeof snapshot.interactiveDesktopAvailable === "boolean" ? { interactiveDesktopAvailable: snapshot.interactiveDesktopAvailable } : {}),
    ...(typeof snapshot.trayRuntimeAvailable === "boolean" ? { trayRuntimeAvailable: snapshot.trayRuntimeAvailable } : {}),
    ...(matrix ? { capabilityMatrix: matrix } : {}),
    methods: matrix
      ? Object.entries(matrix).map(([name, entry]) => matrixEntryToMethodCapability(name, entry))
      : snapshot.methods.map((name) => ({ name, implemented: true })),
    ...(snapshot.permissions ? { permissions: snapshot.permissions } : {}),
    ...(snapshot.toolHealth ? { toolHealth: snapshot.toolHealth } : {}),
    lastCapabilityRefreshAt: snapshot.lastCapabilityRefreshAt ?? snapshot.lastSeenAt,
  }
}

function matrixEntryToMethodCapability(
  name: string,
  entry: YeonjangCapabilityMatrixEntry,
): YeonjangMethodCapability {
  return {
    name,
    implemented: entry.supported !== false,
    ...(typeof entry.supported === "boolean" ? { supported: entry.supported } : {}),
    ...(typeof entry.supportState === "string" ? { supportState: entry.supportState } : {}),
    ...(typeof entry.requiresApproval === "boolean" ? { requiresApproval: entry.requiresApproval } : {}),
    ...(typeof entry.requiresPermission === "boolean" ? { requiresPermission: entry.requiresPermission } : {}),
    ...(entry.permissionSetting !== undefined ? { permissionSetting: entry.permissionSetting } : {}),
    ...(entry.knownLimitations ? { knownLimitations: entry.knownLimitations } : {}),
    ...(typeof entry.requiresInteractiveDesktop === "boolean" ? { requiresInteractiveDesktop: entry.requiresInteractiveDesktop } : {}),
    ...(typeof entry.broadcastSafe === "boolean" ? { broadcastSafe: entry.broadcastSafe } : {}),
    ...(typeof entry.defaultTargetPolicy === "string" ? { defaultTargetPolicy: entry.defaultTargetPolicy } : {}),
    ...(entry.reasonCodes ? { reasonCodes: entry.reasonCodes } : {}),
    ...(entry.platformBaseline ? { platformBaseline: entry.platformBaseline } : {}),
    ...(entry.outputModes ? { outputModes: entry.outputModes } : {}),
    ...(typeof entry.lastCheckedAt === "number" ? { lastCheckedAt: entry.lastCheckedAt } : {}),
  }
}

function normalizeExtensionId(extensionId?: string): string {
  return extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
}

function rememberCapabilities(extensionId: string, payload: YeonjangCapabilitiesPayload): void {
  capabilityCache.set(extensionId, { payload, cachedAt: Date.now() })
}

function getFreshCachedCapabilities(extensionId: string): YeonjangCapabilitiesPayload | null {
  const cached = capabilityCache.get(extensionId)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > YEONJANG_CAPABILITY_TTL_MS) return null
  return cached.payload
}

function getFreshCapabilitySnapshot(extensionId: string): MqttExtensionSnapshot | null {
  const now = Date.now()
  const matches = getMqttExtensionSnapshots().filter((candidate) =>
    candidate.extensionId === extensionId
    || candidate.nodeId === extensionId
    || candidate.instanceId === extensionId,
  )
  // An alias shared by multiple instances is never a valid execution target.
  if (matches.length !== 1) return null
  const snapshot = matches[0]!
  if (String(snapshot.state ?? "").toLowerCase() === "offline") return null
  if (!snapshot.capabilityMatrix && snapshot.methods.length === 0) return null
  const refreshedAt = snapshot.lastCapabilityRefreshAt ?? snapshot.lastSeenAt
  if (now - refreshedAt > YEONJANG_CAPABILITY_TTL_MS) return null
  return snapshot
}

export function isYeonjangUnavailableError(error: unknown): boolean {
  if (
    error instanceof YeonjangCommandError
    && (
      error.code === "yeonjang_response_timeout"
      || error.code === "camera_response_timeout"
    )
  ) {
    return true
  }
  const message = yeonjangMqttErrorMessage(error)
  const normalized = message.toLowerCase()
  return [
    "mqtt 브로커가 비활성화되어 있습니다",
    "mqtt 브로커가 실행 중이 아닙니다",
    "yeonjang mqtt 연결 시간이 초과되었습니다",
    "yeonjang mqtt 응답 시간이 초과되었습니다",
    "yeonjang mqtt 연결이 닫혔습니다",
    "yeonjang mqtt 응답 대기 중 연결이 닫혔습니다",
    "connection refused",
    "connack timeout",
    "econnrefused",
    "getaddrinfo",
    "not authorized",
    "authentication",
  ].some((pattern) => normalized.includes(pattern))
}

async function invokeYeonjangMqttV2Capture<T>(input: {
  readonly method: YeonjangMqttV2CommandMethod
  readonly params: Record<string, unknown>
  readonly options: YeonjangClientOptions
  readonly mqttConfig: MqttConfig
  readonly timeoutMs: number
  readonly dispatch: YeonjangCommandDispatch
  readonly requesterId: string
  readonly target: { readonly instanceId: string; readonly sessionId: string; readonly targetFingerprint: string }
}): Promise<T> {
  const operationCanonical = input.dispatch.metadata.operationId?.trim()
  if (!operationCanonical) {
    throw new YeonjangCommandError({ code: "yeonjang_v2_operation_identity_required", message: "Canonical side-effect operation identity is required." })
  }
  const enrollment = { ...input.target, requesterId: input.requesterId }
  const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(input.mqttConfig.password, "utf8"))
  const client = createClient(input.mqttConfig)
  const topics = buildYeonjangMqttV2Topics(enrollment)
  const wire = {
    requestId: mapYeonjangMqttV2WireIdentity("request", input.dispatch.requestId),
    commandId: mapYeonjangMqttV2WireIdentity("command", input.dispatch.commandId),
    operationId: mapYeonjangMqttV2WireIdentity("operation", operationCanonical),
    idempotencyKey: mapYeonjangMqttV2WireIdentity("idempotency", input.dispatch.idempotencyKey),
    cancellationId: mapYeonjangMqttV2WireIdentity("cancellation", input.dispatch.commandId),
    cancelToken: mapYeonjangMqttV2WireIdentity("cancel", input.dispatch.cancelToken),
  }
  const now = Date.now()
  const expiresAt = Math.min(input.dispatch.expiresAt, now + input.timeoutMs)
  const command = createYeonjangMqttV2Command({
    enrollment,
    targetFingerprint: input.target.targetFingerprint,
    method: input.method,
    params: input.method === "camera.capture"
      ? {
          ...(typeof input.params.device_id === "string" ? { device_id: input.params.device_id } : {}),
          ...(typeof input.params.capture_timeout_ms === "number" ? { capture_timeout_ms: input.params.capture_timeout_ms } : {}),
        }
      : { ...(typeof input.params.display === "number" ? { display: input.params.display } : {}) },
    identity: {
      messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()),
      requestId: wire.requestId,
      commandId: wire.commandId,
      operationId: wire.operationId,
      correlationId: mapYeonjangMqttV2WireIdentity("correlation", input.dispatch.metadata.requestGroupId ?? input.dispatch.metadata.runId ?? input.dispatch.requestId),
      causationId: mapYeonjangMqttV2WireIdentity("causation", input.dispatch.deliveryId),
      idempotencyKey: wire.idempotencyKey,
      cancellationId: wire.cancellationId,
      cancelToken: wire.cancelToken,
      authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()),
      nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()),
    },
    issuedAt: now,
    expiresAt,
    sequence: 1,
    hmacKey,
  })
  let commandDispatched = false
  let commandTerminal = false
  let artifactTransferActive = false
  let artifactCancellation: ReturnType<typeof createYeonjangMqttV2ArtifactControl> | null = null
  const terminalWaitStartedAt = Date.now()
  let terminalWaitTrace = createMqttV2TerminalWaitTrace(wire.requestId)
  try {
    throwIfYeonjangCancelled(input.options.signal, input.method, wire.commandId)
    await waitForConnect(client, input.timeoutMs)
    await subscribe(client, topics.responseTopic)
    await subscribe(client, topics.artifactChunkFilter)
    log.fieldDebug("mqtt_v2_terminal_dispatch", {
      stage: "response_waiter_ready",
      correlationIdHash: terminalWaitTrace.correlationIdHash,
      elapsedMs: Math.max(0, Date.now() - terminalWaitStartedAt),
    })
    const responsePayload = waitForExactMqttPayload({
      client,
      topic: topics.responseTopic,
      timeoutMs: input.timeoutMs,
      ...(input.options.signal ? { signal: input.options.signal } : {}),
      onDiagnostic: (event) => {
        terminalWaitTrace = recordMqttV2TerminalWaitTrace(terminalWaitTrace, event)
        if (event.kind === "settled") {
          log.fieldDebug("mqtt_v2_terminal_waiter", {
            stage: "terminal_waiter",
            ...terminalWaitTrace,
          })
        }
      },
      predicate: (payload) => {
        try {
          const value = JSON.parse(payload.toString("utf8")) as Record<string, unknown>
          return value.request_id === wire.requestId
        } catch { return false }
      },
    })
    commandDispatched = true
    await publishJson(client, command.topic, command.envelope)
    log.fieldDebug("mqtt_v2_terminal_dispatch", {
      stage: "command_published",
      correlationIdHash: terminalWaitTrace.correlationIdHash,
      elapsedMs: Math.max(0, Date.now() - terminalWaitStartedAt),
    })
    const terminalPayload = await responsePayload
    const admitted = admitYeonjangMqttV2TerminalResponse({
      payload: terminalPayload,
      nowMs: Date.now(),
      hmacKey,
      expected: {
        enrollment,
        requestId: wire.requestId,
        commandId: wire.commandId,
        operationId: wire.operationId,
        idempotencyKey: wire.idempotencyKey,
        targetFingerprint: input.target.targetFingerprint,
      },
    })
    log.fieldDebug("mqtt_v2_terminal_admission", {
      stage: "terminal_admission",
      correlationIdHash: terminalWaitTrace.correlationIdHash,
      elapsedMs: Math.max(0, Date.now() - terminalWaitStartedAt),
      outcome: admitted.ok ? "admitted" : "rejected",
      ...(admitted.ok
        ? { executionOutcome: admitted.terminal.executionOutcome }
        : { reasonCode: admitted.reasonCode }),
    })
    if (!admitted.ok) throw new YeonjangCommandError({ code: admitted.reasonCode, message: "Yeonjang MQTT v2 terminal verification failed." })
    commandTerminal = true
    if (admitted.terminal.executionOutcome !== "succeeded") {
      const failure = projectYeonjangMqttV2TerminalFailure({
        method: input.method,
        commandId: wire.commandId,
        operationId: wire.operationId,
        targetFingerprint: input.target.targetFingerprint,
        executionOutcome: admitted.terminal.executionOutcome,
        failure: admitted.terminal.failure,
      })
      throw new YeonjangCommandError(failure)
    }
    const artifact = admitted.terminal.artifact
    if (!artifact) throw new YeonjangCommandError({ code: "yeonjang_v2_artifact_missing", message: "Successful capture terminal did not contain an artifact." })
    const transferId = mapYeonjangMqttV2WireIdentity("transfer", randomUUID())
    const artifactIdentityBase = {
      messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()),
      requestId: mapYeonjangMqttV2WireIdentity("request", randomUUID()),
      commandId: mapYeonjangMqttV2WireIdentity("command", randomUUID()),
      operationId: mapYeonjangMqttV2WireIdentity("operation", `${operationCanonical}:artifact`),
      correlationId: mapYeonjangMqttV2WireIdentity("correlation", wire.requestId),
      causationId: command.envelope.message_id,
      idempotencyKey: mapYeonjangMqttV2WireIdentity("idempotency", `${wire.idempotencyKey}:artifact`),
      authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()),
      nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()),
    }
    const fetch = createYeonjangMqttV2ArtifactControl({
      kind: "fetch", enrollment, targetFingerprint: input.target.targetFingerprint,
      ownerRequestId: wire.requestId, ownerOperationId: wire.operationId,
      descriptor: artifact, transferId, expectedRevision: artifact.lifecycleRevision,
      identity: artifactIdentityBase, issuedAt: Date.now(), expiresAt, sequence: 1, hmacKey,
    })
    artifactCancellation = createYeonjangMqttV2ArtifactControl({
      kind: "cancel", enrollment, targetFingerprint: input.target.targetFingerprint,
      ownerRequestId: wire.requestId, ownerOperationId: wire.operationId,
      descriptor: artifact, transferId, expectedRevision: artifact.lifecycleRevision + 1,
      identity: {
        ...artifactIdentityBase,
        messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()),
        requestId: mapYeonjangMqttV2WireIdentity("request", randomUUID()),
        commandId: mapYeonjangMqttV2WireIdentity("command", randomUUID()),
        operationId: mapYeonjangMqttV2WireIdentity("operation", `${operationCanonical}:artifact-cancel`),
        idempotencyKey: mapYeonjangMqttV2WireIdentity("idempotency", `${wire.idempotencyKey}:artifact-cancel`),
        authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()),
        nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()),
      },
      issuedAt: Date.now(), expiresAt, sequence: 2, hmacKey,
    })
    const assembler = createYeonjangMqttV2ArtifactAssembler({
      transferId, artifactRef: artifact.artifactRef, ownerRequesterId: input.requesterId,
      ownerRequestId: wire.requestId, fullDigest: artifact.fullDigest, totalSize: artifact.sizeBytes,
      expiresAtMs: artifact.expiresAtMs, nowMs: Date.now,
    })
    const artifactWaitStartedAt = Date.now()
    const artifactTrace = createMqttV2TerminalWaitTrace(wire.requestId)
    const bytesPromise = waitForArtifactBytes({
      client,
      filter: topics.artifactChunkFilter,
      responseTopic: topics.responseTopic,
      transferId,
      assembler,
      hmacKey,
      fetchResponseExpected: {
        enrollment,
        targetFingerprint: input.target.targetFingerprint,
        messageId: fetch.envelope.message_id,
        requestId: fetch.envelope.request_id,
        commandId: fetch.envelope.command_id,
        operationId: fetch.envelope.operation_id,
        correlationId: fetch.envelope.correlation_id,
        idempotencyKey: fetch.envelope.idempotency_key,
        artifactRef: artifact.artifactRef,
        ownerRequestId: wire.requestId,
        ownerOperationId: wire.operationId,
        transferId,
        expectedRevision: artifact.lifecycleRevision,
      },
      timeoutMs: input.timeoutMs,
      ...(input.options.signal ? { signal: input.options.signal } : {}),
      onDiagnostic: (event) => {
        log.fieldDebug("mqtt_v2_artifact_waiter", {
          stage: "artifact_waiter",
          correlationIdHash: artifactTrace.correlationIdHash,
          ...event,
        })
      },
    })
    artifactTransferActive = true
    log.fieldDebug("mqtt_v2_artifact_dispatch", {
      stage: "artifact_waiter_ready",
      correlationIdHash: artifactTrace.correlationIdHash,
      elapsedMs: Math.max(0, Date.now() - artifactWaitStartedAt),
    })
    await publishJson(client, fetch.topic, fetch.envelope)
    log.fieldDebug("mqtt_v2_artifact_dispatch", {
      stage: "artifact_fetch_published",
      correlationIdHash: artifactTrace.correlationIdHash,
      elapsedMs: Math.max(0, Date.now() - artifactWaitStartedAt),
    })
    let bytes: Buffer
    try {
      bytes = await bytesPromise
    } catch (error) {
      if (error instanceof AdmittedArtifactFetchRejectionError) artifactTransferActive = false
      throw error
    }
    artifactTransferActive = false
    const ack = createYeonjangMqttV2ArtifactControl({
      kind: "ack", enrollment, targetFingerprint: input.target.targetFingerprint,
      ownerRequestId: wire.requestId, ownerOperationId: wire.operationId,
      descriptor: artifact, transferId, expectedRevision: artifact.lifecycleRevision + 1,
      identity: { ...artifactIdentityBase, messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()), requestId: mapYeonjangMqttV2WireIdentity("request", randomUUID()), commandId: mapYeonjangMqttV2WireIdentity("command", randomUUID()), operationId: mapYeonjangMqttV2WireIdentity("operation", `${operationCanonical}:artifact-ack`), idempotencyKey: mapYeonjangMqttV2WireIdentity("idempotency", `${wire.idempotencyKey}:artifact-ack`), authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()), nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()) },
      issuedAt: Date.now(), expiresAt, sequence: 2, hmacKey,
    })
    await publishJson(client, ack.topic, ack.envelope)
    const responseAckIdentity = {
      messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()),
      requestId: mapYeonjangMqttV2WireIdentity("request", randomUUID()),
      commandId: mapYeonjangMqttV2WireIdentity("command", randomUUID()),
      operationId: mapYeonjangMqttV2WireIdentity("operation", `${operationCanonical}:response-ack`),
      correlationId: mapYeonjangMqttV2WireIdentity("correlation", wire.requestId),
      causationId: command.envelope.message_id,
      idempotencyKey: mapYeonjangMqttV2WireIdentity("idempotency", `${wire.idempotencyKey}:response-ack`),
      authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()),
      nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()),
    }
    const responseAck = createYeonjangMqttV2ResponseAck({
      enrollment,
      targetFingerprint: input.target.targetFingerprint,
      terminalIdentity: {
        requestId: wire.requestId,
        commandId: wire.commandId,
        operationId: wire.operationId,
        idempotencyKey: wire.idempotencyKey,
      },
      terminal: admitted.terminal,
      identity: responseAckIdentity,
      issuedAt: Date.now(), expiresAt, sequence: 3, hmacKey,
    })
    const responseAckResultPromise = waitForExactMqttPayload({
      client, topic: topics.responseTopic, timeoutMs: input.timeoutMs,
      ...(input.options.signal ? { signal: input.options.signal } : {}),
      predicate: (payload) => {
        try {
          const value = JSON.parse(payload.toString("utf8")) as Record<string, unknown>
          return value.schema_id === "yeonjang.response-ack-result.v2" && value.request_id === responseAckIdentity.requestId
        } catch { return false }
      },
    })
    await publishJson(client, responseAck.topic, responseAck.envelope)
    const responseAckResult = admitYeonjangMqttV2ResponseAckResult({
      payload: await responseAckResultPromise,
      nowMs: Date.now(),
      hmacKey,
      expected: {
        enrollment,
        requestId: responseAckIdentity.requestId,
        commandId: responseAckIdentity.commandId,
        operationId: responseAckIdentity.operationId,
        idempotencyKey: responseAckIdentity.idempotencyKey,
        targetFingerprint: input.target.targetFingerprint,
        receiptId: admitted.terminal.receiptId,
        targetRequestId: wire.requestId,
        targetCommandId: wire.commandId,
        targetOperationId: wire.operationId,
        targetIdempotencyKey: wire.idempotencyKey,
        terminalRevision: admitted.terminal.terminalRevision,
        responseDigest: admitted.terminal.responseDigest,
      },
    })
    if (!responseAckResult.ok) throw new YeonjangCommandError({ code: responseAckResult.reasonCode, message: "Yeonjang MQTT v2 response acknowledgement was not confirmed." })
    const extension = artifact.mediaType === "image/png" ? "png" : "jpg"
    return {
      ...(typeof input.params.device_id === "string" ? { device_id: input.params.device_id } : {}),
      file_name: `${input.method === "camera.capture" ? "camera" : "screen"}-${wire.requestId}.${extension}`,
      file_extension: extension,
      mime_type: artifact.mediaType,
      size_bytes: bytes.length,
      transfer_encoding: "base64",
      base64_data: bytes.toString("base64"),
      message: "Yeonjang MQTT v2 capture artifact verified.",
    } as T
  } catch (error) {
    if (artifactTransferActive && artifactCancellation) {
      try {
        await publishJson(client, artifactCancellation.topic, artifactCancellation.envelope)
      } catch {
        // Preserve the typed primary failure; the caller must not see a
        // transport-cleanup failure as execution success.
      }
    } else if (
      commandDispatched
      && !commandTerminal
      && (input.options.signal?.aborted || (error instanceof YeonjangCommandError && error.code === "yeonjang_response_timeout"))
    ) {
      const cancelIssuedAt = Date.now()
      const cancellation = createYeonjangMqttV2Cancellation({
        enrollment,
        targetFingerprint: input.target.targetFingerprint,
        target: {
          requestId: wire.requestId,
          commandId: wire.commandId,
          operationId: wire.operationId,
          idempotencyKey: wire.idempotencyKey,
          cancellationId: wire.cancellationId,
          cancelToken: wire.cancelToken,
        },
        identity: {
          messageId: mapYeonjangMqttV2WireIdentity("message", randomUUID()),
          requestId: mapYeonjangMqttV2WireIdentity("request", randomUUID()),
          commandId: mapYeonjangMqttV2WireIdentity("command", randomUUID()),
          operationId: mapYeonjangMqttV2WireIdentity("operation", `${operationCanonical}:cancel`),
          correlationId: mapYeonjangMqttV2WireIdentity("correlation", wire.requestId),
          causationId: command.envelope.message_id,
          idempotencyKey: mapYeonjangMqttV2WireIdentity("idempotency", `${wire.idempotencyKey}:cancel`),
          authorizationId: mapYeonjangMqttV2WireIdentity("authorization", randomUUID()),
          nonce: mapYeonjangMqttV2WireIdentity("nonce", randomUUID()),
        },
        issuedAt: cancelIssuedAt,
        expiresAt: cancelIssuedAt + 5_000,
        sequence: 2,
        hmacKey,
        reason: input.options.signal?.aborted ? "user_requested" : "deadline_exceeded",
      })
      try {
        await publishJson(client, cancellation.topic, cancellation.envelope)
      } catch {
        // Cancellation delivery is best-effort after the caller has already
        // withdrawn authority; the original typed cancellation remains final.
      }
    }
    throw error
  } finally {
    await closeClient(client)
    hmacKey.fill(0)
  }
}

async function publishJson(client: MqttClient, topic: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => client.publish(topic, JSON.stringify(value), { qos: 1, retain: false }, (error) => error ? reject(error) : resolve()))
}

type MqttExactPayloadWaitDiagnostic =
  | { readonly kind: "candidate"; readonly category: "other_topic" | "unmatched_expected_topic" | "matched_expected_topic" }
  | { readonly kind: "settled"; readonly outcome: "matched" | "timeout" | "cancelled" | "transport_failure" }

type MqttExactPayloadWaitDiagnosticWithLatency = MqttExactPayloadWaitDiagnostic & {
  readonly elapsedMs: number
}

interface MqttV2TerminalWaitTrace {
  readonly correlationIdHash: string
  readonly otherTopicCandidateCount: number
  readonly unmatchedExpectedTopicCandidateCount: number
  readonly matchedExpectedTopicCandidateCount: number
  readonly outcome?: "matched" | "timeout" | "cancelled" | "transport_failure"
  readonly elapsedMs?: number
}

function createMqttV2TerminalWaitTrace(requestId: string): MqttV2TerminalWaitTrace {
  return {
    correlationIdHash: `sha256:${createHash("sha256").update(requestId).digest("hex").slice(0, 16)}`,
    otherTopicCandidateCount: 0,
    unmatchedExpectedTopicCandidateCount: 0,
    matchedExpectedTopicCandidateCount: 0,
  }
}

function recordMqttV2TerminalWaitTrace(
  trace: MqttV2TerminalWaitTrace,
  event: MqttExactPayloadWaitDiagnosticWithLatency,
): MqttV2TerminalWaitTrace {
  if (event.kind === "settled") {
    return { ...trace, outcome: event.outcome, elapsedMs: event.elapsedMs }
  }
  if (event.category === "other_topic") {
    return { ...trace, otherTopicCandidateCount: Math.min(16, trace.otherTopicCandidateCount + 1) }
  }
  if (event.category === "unmatched_expected_topic") {
    return {
      ...trace,
      unmatchedExpectedTopicCandidateCount: Math.min(16, trace.unmatchedExpectedTopicCandidateCount + 1),
    }
  }
  return {
    ...trace,
    matchedExpectedTopicCandidateCount: Math.min(16, trace.matchedExpectedTopicCandidateCount + 1),
  }
}

function waitForExactMqttPayload(input: {
  readonly client: MqttClient
  readonly topic: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
  readonly onDiagnostic?: (event: MqttExactPayloadWaitDiagnosticWithLatency) => void
  readonly predicate: (payload: Buffer) => boolean
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const observe = (event: MqttExactPayloadWaitDiagnostic): void => {
      try {
        input.onDiagnostic?.({ ...event, elapsedMs: Math.max(0, Date.now() - startedAt) })
      } catch {
        // Field diagnosis must not alter command admission, timeout, or cancellation.
      }
    }
    const cleanup = () => { clearTimeout(timer); input.client.off("message", onMessage); input.client.off("error", onError); input.signal?.removeEventListener("abort", onAbort) }
    const onMessage = (topic: string, payload: Buffer) => {
      if (topic !== input.topic) {
        observe({ kind: "candidate", category: "other_topic" })
        return
      }
      const matches = input.predicate(payload)
      observe({ kind: "candidate", category: matches ? "matched_expected_topic" : "unmatched_expected_topic" })
      if (matches) { cleanup(); observe({ kind: "settled", outcome: "matched" }); resolve(payload) }
    }
    const onError = (error: Error) => { cleanup(); observe({ kind: "settled", outcome: "transport_failure" }); reject(error) }
    const onAbort = () => { cleanup(); observe({ kind: "settled", outcome: "cancelled" }); reject(new YeonjangCommandError({ code: "cancelled", message: "Yeonjang MQTT v2 request cancelled." })) }
    const timer = setTimeout(() => { cleanup(); observe({ kind: "settled", outcome: "timeout" }); reject(new YeonjangCommandError({ code: "yeonjang_response_timeout", message: "Yeonjang MQTT v2 response timed out." })) }, input.timeoutMs)
    input.client.on("message", onMessage); input.client.once("error", onError); input.signal?.addEventListener("abort", onAbort, { once: true })
  })
}

type MqttArtifactWaitDiagnostic = {
  readonly elapsedMs: number
  readonly matchingChunkCount: number
  readonly outcome: "completed" | "timeout" | "cancelled" | "transport_failure" | "rejected"
  readonly reasonCode?: string
}

class AdmittedArtifactFetchRejectionError extends YeonjangCommandError {}

async function waitForArtifactBytes(input: {
  readonly client: MqttClient
  readonly filter: string
  readonly responseTopic: string
  readonly transferId: string
  readonly assembler: ReturnType<typeof createYeonjangMqttV2ArtifactAssembler>
  readonly hmacKey: Uint8Array
  readonly fetchResponseExpected: YeonjangMqttV2ExpectedArtifactFetchRejection
  readonly timeoutMs: number
  readonly signal?: AbortSignal
  readonly onDiagnostic?: (event: MqttArtifactWaitDiagnostic) => void
}): Promise<Buffer> {
  const suffix = `/artifact/${input.transferId}/chunk`
  return await new Promise((resolve, reject) => {
    const startedAt = Date.now()
    let matchingChunkCount = 0
    const observe = (outcome: MqttArtifactWaitDiagnostic["outcome"], reasonCode?: string): void => {
      try {
        input.onDiagnostic?.({
          elapsedMs: Math.max(0, Date.now() - startedAt),
          matchingChunkCount: Math.min(16, matchingChunkCount),
          outcome,
          ...(reasonCode ? { reasonCode } : {}),
        })
      } catch {
        // Field diagnosis must not change artifact transfer, cancellation, or verification.
      }
    }
    const cleanup = () => { clearTimeout(timer); input.client.off("message", onMessage); input.client.off("error", onError); input.signal?.removeEventListener("abort", onAbort) }
    const onMessage = (topic: string, payload: Buffer) => {
      if (topic === input.responseTopic) {
        let candidate: unknown
        try {
          candidate = JSON.parse(payload.toString("utf8")) as unknown
        } catch {
          return
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return
        const record = candidate as Record<string, unknown>
        if (record.schema_id !== "yeonjang.artifact-fetch-result.v2"
          || record.request_id !== input.fetchResponseExpected.requestId) return
        const admitted = admitYeonjangMqttV2ArtifactFetchRejection({
          payload,
          nowMs: Date.now(),
          hmacKey: input.hmacKey,
          expected: input.fetchResponseExpected,
        })
        cleanup()
        if (!admitted.ok) {
          observe("rejected", admitted.reasonCode)
          reject(new YeonjangCommandError({
            code: admitted.reasonCode,
            message: "Yeonjang MQTT v2 artifact fetch response verification failed.",
          }))
          return
        }
        const reasonCode = `yeonjang_v2_artifact_fetch_${admitted.rejection.reason}`
        observe("rejected", reasonCode)
        reject(new AdmittedArtifactFetchRejectionError({
          code: reasonCode,
          message: "Yeonjang MQTT v2 artifact fetch was rejected.",
        }))
        return
      }
      if (!topic.endsWith(suffix) || !topic.startsWith(input.filter.slice(0, input.filter.indexOf("+")))) return
      matchingChunkCount += 1
      const result = input.assembler.accept(payload)
      if (!result.ok) {
        cleanup()
        observe("rejected", result.reasonCode)
        reject(new YeonjangCommandError({ code: result.reasonCode, message: "Yeonjang MQTT v2 artifact verification failed." }))
      } else if (result.state === "complete") {
        cleanup()
        observe("completed")
        resolve(result.bytes)
      }
    }
    const onError = (error: Error) => { cleanup(); observe("transport_failure"); reject(error) }
    const onAbort = () => { cleanup(); observe("cancelled"); reject(new YeonjangCommandError({ code: "cancelled", message: "Yeonjang MQTT v2 artifact fetch cancelled." })) }
    const timer = setTimeout(() => { cleanup(); observe("timeout"); reject(new YeonjangCommandError({ code: "yeonjang_v2_artifact_timeout", message: "Yeonjang MQTT v2 artifact fetch timed out." })) }, input.timeoutMs)
    input.client.on("message", onMessage); input.client.once("error", onError); input.signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function requireMqttClientConfig(options: YeonjangClientOptions): MqttConfig {
  if (options.mqttConfig) return options.mqttConfig
  throw new Error("Yeonjang MQTT config snapshot is required.")
}

function createClient(config: MqttConfig): MqttClient {
  const snapshot = getMqttBrokerSnapshot()
  const validationError = validateMqttBrokerConfig(config)
  if (!config.enabled) {
    throw new Error("MQTT 브로커가 비활성화되어 있습니다.")
  }
  if (validationError) {
    throw new Error(validationError)
  }
  if (!snapshot.running) {
    throw new Error(snapshot.reason ?? "MQTT 브로커가 실행 중이 아닙니다.")
  }

  const host = normalizeConnectHost(config.host)
  return mqtt.connect(`mqtt://${host}:${config.port}`, {
    clientId: `knowbee-core-${process.pid}-${randomUUID().slice(0, 8)}`,
    username: config.username,
    password: config.password,
    connectTimeout: 5_000,
    reconnectPeriod: 0,
    clean: true,
  })
}

function normalizeConnectHost(host: string): string {
  const trimmed = host.trim()
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::") {
    return "127.0.0.1"
  }
  return trimmed
}

function clampTimeout(timeoutMs?: number): number {
  const candidate = Number(timeoutMs)
  if (!Number.isFinite(candidate)) return 15_000
  return Math.max(1_000, Math.min(60_000, Math.floor(candidate)))
}

function clampAttemptTimeout(timeoutMs: number, remainingMs: number): number {
  if (!Number.isFinite(remainingMs)) return timeoutMs
  return Math.max(250, Math.min(timeoutMs, Math.floor(remainingMs)))
}

async function waitForConnect(client: MqttClient, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("Yeonjang MQTT 연결 시간이 초과되었습니다."))
    }, timeoutMs)

    const onConnect = () => {
      cleanup()
      resolve()
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onClose = () => {
      if (settled) return
      cleanup()
      reject(new Error("Yeonjang MQTT 연결이 닫혔습니다."))
    }

    const cleanup = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      client.off("connect", onConnect)
      client.off("error", onError)
      client.off("close", onClose)
    }

    client.once("connect", onConnect)
    client.once("error", onError)
    client.once("close", onClose)
  })
}

async function subscribe(client: MqttClient, topic: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

async function publish(client: MqttClient, topic: string, request: YeonjangRequestEnvelope): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.publish(topic, JSON.stringify(request), { qos: 1 }, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

async function waitForResponse<T>(
  client: MqttClient,
  responseTopic: string,
  requestId: string,
  method: string,
  commandId: string,
  timeoutMs: number,
  callerSignal?: AbortSignal,
  waiterCancellationSignal?: AbortSignal,
  onCallerCancel?: () => Promise<void>,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const chunkAssembler = createYeonjangChunkAssembler({ requestId })
    let lastObservedStage:
      | YeonjangAttemptStageEnvelope["stage"]
      | undefined

    const timer = setTimeout(() => {
      cleanup()
      const failure = projectYeonjangResponseFailure({
        kind: "response_timeout",
        method,
        commandId,
        ...(lastObservedStage ? { lastObservedStage } : {}),
      })
      reject(new YeonjangCommandError(failure))
    }, timeoutMs)

    const cancellationError = () =>
      new YeonjangCommandError(projectYeonjangResponseFailure({
        kind: "cancelled",
        method,
        commandId,
      }))

    const onCallerAbort = () => {
      cleanup()
      void (async () => {
        try {
          await onCallerCancel?.()
        } finally {
          reject(cancellationError())
        }
      })()
    }

    const onWaiterCancellation = () => {
      cleanup()
      reject(cancellationError())
    }

    const onMessage = (topic: string, payload: Buffer) => {
      if (topic !== responseTopic) return

      let parsed: unknown
      try {
        parsed = JSON.parse(payload.toString("utf8")) as unknown
      } catch (error) {
        cleanup()
        reject(new Error(`Yeonjang 응답 JSON 파싱 실패: ${yeonjangMqttErrorMessage(error)}`))
        return
      }

      if (isAttemptStageEnvelope(parsed)) {
        if (parsed.id && parsed.id !== requestId) return
        if (parsed.method !== method || parsed.command_id !== commandId) return
        lastObservedStage = parsed.stage
        return
      }

      if (isChunkEnvelope(parsed)) {
        const assembly = chunkAssembler.accept(parsed)
        if (assembly.kind === "pending") return
        if (assembly.kind === "rejected") {
          cleanup()
          reject(new YeonjangCommandError({
            code: assembly.code,
            message: "Yeonjang response chunk verification failed.",
          }))
          return
        }

        let response: YeonjangResponseEnvelope<T>
        try {
          response = JSON.parse(assembly.payload.toString("utf8")) as YeonjangResponseEnvelope<T>
        } catch (error) {
          cleanup()
          reject(new Error(`Yeonjang 청크 응답 복원 실패: ${yeonjangMqttErrorMessage(error)}`))
          return
        }

        if (response.id && response.id !== requestId) return
        cleanup()
        if (!response.ok) {
          reject(createYeonjangResponseError({
            error: response.error,
            attempt: response.attempt,
            method,
            commandId,
          }))
          return
        }
        resolve((response.result ?? null) as T)
        return
      }

      const response = parsed as YeonjangResponseEnvelope<T>
      if (response.id && response.id !== requestId) return

      cleanup()
      if (!response.ok) {
        reject(createYeonjangResponseError({
          error: response.error,
          attempt: response.attempt,
          method,
          commandId,
        }))
        return
      }
      resolve((response.result ?? null) as T)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onClose = () => {
      cleanup()
      reject(new Error("Yeonjang MQTT 응답 대기 중 연결이 닫혔습니다."))
    }

    const cleanup = () => {
      clearTimeout(timer)
      client.off("message", onMessage)
      client.off("error", onError)
      client.off("close", onClose)
      callerSignal?.removeEventListener("abort", onCallerAbort)
      waiterCancellationSignal?.removeEventListener(
        "abort",
        onWaiterCancellation,
      )
    }

    if (callerSignal?.aborted) {
      onCallerAbort()
      return
    }
    if (waiterCancellationSignal?.aborted) {
      onWaiterCancellation()
      return
    }
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true })
    waiterCancellationSignal?.addEventListener(
      "abort",
      onWaiterCancellation,
      { once: true },
    )
    client.on("message", onMessage)
    client.once("error", onError)
    client.once("close", onClose)
  })
}

async function publishCancellationBestEffort(
  client: MqttClient,
  topic: string,
  request: YeonjangRequestEnvelope,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 750)
    client.publish(topic, JSON.stringify(request), { qos: 1 }, () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function throwIfYeonjangCancelled(
  signal: AbortSignal | undefined,
  method: string,
  commandId: string,
): void {
  if (!signal?.aborted) return
  throw new YeonjangCommandError(projectYeonjangResponseFailure({
    kind: "cancelled",
    method,
    commandId,
  }))
}

function isAttemptStageEnvelope(value: unknown): value is YeonjangAttemptStageEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.transport === "attempt_stage"
    && candidate.schema_version === 1
    && typeof candidate.method === "string"
    && candidate.method.length > 0
    && typeof candidate.command_id === "string"
    && candidate.command_id.length > 0
    && (
      candidate.stage === "received"
      || candidate.stage === "handler_started"
      || candidate.stage === "helper_started"
    )
  )
}

function isChunkEnvelope(value: unknown): value is YeonjangChunkEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { transport?: unknown }).transport === "chunk",
  )
}

function createYeonjangResponseError(input: {
  error: YeonjangErrorBody | undefined
  attempt: unknown
  method: string
  commandId: string
}): YeonjangCommandError {
  const failure = projectYeonjangResponseFailure({
    kind: "response_error",
    method: input.method,
    commandId: input.commandId,
    error: {
      ...(input.error?.code ? { code: input.error.code } : {}),
      message: yeonjangMqttErrorMessage(
        input.error?.message ?? "Yeonjang 요청이 실패했습니다.",
      ),
    },
    attempt: input.attempt,
  })
  return new YeonjangCommandError(failure)
}

async function closeClient(client: MqttClient): Promise<void> {
  await new Promise<void>((resolve) => {
    client.end(true, {}, () => resolve())
  })
}
