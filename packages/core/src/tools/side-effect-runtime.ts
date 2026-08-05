import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import {
  buildPreparedSideEffectOperation,
  buildSideEffectOperationAuthorization,
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
  type PreparedSideEffectOperation,
} from "../contracts/side-effect-operation.js"
import { getDb } from "../db/index.js"
import { SqliteSideEffectOperationRepository } from "../db/side-effect-operation-repository.js"
import { hashApprovalParams } from "../runs/approval-registry.js"
import { executeSideEffectOperation } from "../runs/side-effect-operation-executor.js"
import {
  prepareSideEffectOperation,
  type PrepareSideEffectOperationResult,
} from "../runs/side-effect-operation-use-case.js"
import { buildToolAuthorizationBinding } from "./authorization-binding.js"
import {
  canonicalToolOperationParams,
  type AnyTool,
  type ToolContext,
  type ToolResult,
  type ToolSideEffectRecoveryEvidence,
} from "./types.js"

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function fingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`
}

export interface ResolvedToolSideEffectOperation {
  prepared: PreparedSideEffectOperation
  executionParams: Record<string, unknown>
  targetRef: string
  expectedState: unknown
  authorizationParams: Record<string, unknown>
}

export type ResolveToolSideEffectOperationResult =
  | { status: "not_required" }
  | { status: "rejected"; result: ToolResult }
  | { status: "resolved"; operation: ResolvedToolSideEffectOperation }

export function resolveToolSideEffectOperation(input: {
  tool: AnyTool
  params: Record<string, unknown>
  ctx: ToolContext
  executionTargetFingerprint?: `sha256:${string}`
}): ResolveToolSideEffectOperationResult {
  const contract = input.tool.sideEffect
  if (!contract) return { status: "not_required" }
  const adapterPreparation = contract.prepareOperation?.(input.params, input.ctx)
  if (adapterPreparation?.status === "rejected") return adapterPreparation
  const executionParams =
    adapterPreparation?.status === "prepared"
      ? adapterPreparation.executionParams
      : input.params
  const targetRef =
    adapterPreparation?.status === "prepared"
      ? adapterPreparation.targetRef
      : contract.targetRef(input.params, input.ctx)
  const effectParams =
    adapterPreparation?.status === "prepared"
      ? adapterPreparation.effectParams
      : canonicalToolOperationParams({
          contract,
          params: input.params,
          ctx: input.ctx,
        })
  const expectedState =
    adapterPreparation?.status === "prepared"
      ? adapterPreparation.expectedState
      : contract.expectedState(input.params, input.ctx)
  const identity = buildSideEffectOperationIdentity({
    runId: input.ctx.runId,
    workId: canonicalWorkIdForRootRun(input.ctx.runId),
    stepKey: "executing",
    adapterId: `tool:${input.tool.name}`,
    targetFingerprint: fingerprint({
      targetRef,
      executionTargetFingerprint: input.executionTargetFingerprint ?? null,
    }),
    paramsFingerprint: fingerprint(effectParams),
  })
  const operationBindingHash = fingerprint({
    operationId: identity.operationId,
    targetFingerprint: identity.targetFingerprint,
    effectFingerprint: identity.paramsFingerprint,
  })
  const prepared = buildPreparedSideEffectOperation({
    identity,
    operationBindingHash,
  })
  return {
    status: "resolved",
    operation: {
      prepared,
      executionParams,
      targetRef,
      expectedState,
      authorizationParams:
        adapterPreparation?.status === "prepared"
          ? {
              operationId: identity.operationId,
              operationBindingHash,
            }
          : effectParams,
    },
  }
}

export type PrepareToolSideEffectOperationResult =
  | { status: "not_required" }
  | { status: "rejected"; result: ToolResult }
  | {
      status: "ready"
      admission: Extract<
        PrepareSideEffectOperationResult,
        { status: "reserved_new" | "reserved_existing" }
      >
      operation: ResolvedToolSideEffectOperation
    }
  | {
      status: "existing"
      admission: Exclude<
        PrepareSideEffectOperationResult,
        { status: "reserved_new" | "reserved_existing" | "rejected" }
      >
      operation: ResolvedToolSideEffectOperation
      result: ToolResult
    }

function existingPreparationResult(
  admission: Exclude<
    PrepareSideEffectOperationResult,
    { status: "reserved_new" | "reserved_existing" | "rejected" }
  >,
): ToolResult {
  switch (admission.status) {
    case "verified_existing":
      return {
        success: true,
        output: "동일한 검증 완료 작업이 있어 외부 변경을 다시 실행하지 않았습니다.",
        details: {
          kind: "side_effect_duplicate_verified",
          reasonCode: "side_effect_existing_verified",
        },
      }
    case "manual_intervention_existing":
      return {
        success: false,
        output: "이 작업은 이전 실행 결과가 불확실하여 자동으로 다시 실행하지 않았습니다.",
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
        details: {
          kind: "side_effect_manual_intervention",
          reasonCode: "side_effect_existing_manual_intervention",
        },
      }
    case "effect_rejected_existing":
      return {
        success: false,
        output: "동일한 작업이 외부 효과 실행 전에 거절되어 다시 실행하지 않았습니다.",
        error: "SIDE_EFFECT_EFFECT_REJECTED",
        details: {
          kind: "side_effect_effect_rejected",
          reasonCode: "side_effect_existing_effect_rejected",
        },
      }
    case "compensated_existing":
    case "active_existing":
      return {
        success: false,
        output: "기존 부작용 작업 상태가 남아 있어 새 실행을 시작하지 않았습니다.",
        error: "SIDE_EFFECT_OPERATION_BLOCKED",
        details: {
          kind: "side_effect_operation_blocked",
          reasonCode:
            admission.status === "compensated_existing"
              ? "side_effect_existing_compensated"
              : "side_effect_existing_active",
        },
      }
  }
}

export function prepareToolSideEffectOperation(input: {
  tool: AnyTool
  params: Record<string, unknown>
  ctx: ToolContext
  executionTargetFingerprint?: `sha256:${string}`
}): PrepareToolSideEffectOperationResult {
  const resolved = resolveToolSideEffectOperation(input)
  if (resolved.status !== "resolved") return resolved
  return admitResolvedToolSideEffectOperation(resolved.operation)
}

export function admitResolvedToolSideEffectOperation(
  operation: ResolvedToolSideEffectOperation,
): Exclude<PrepareToolSideEffectOperationResult, { status: "not_required" }> {
  const repository = new SqliteSideEffectOperationRepository(getDb(), () => Date.now())
  const admission = prepareSideEffectOperation({
    repository,
    prepared: operation.prepared,
  })
  if (admission.status === "rejected") {
    return {
      status: "rejected",
      result: {
        success: false,
        output: "기존 부작용 작업과 실행 범위가 충돌하여 새 실행을 시작하지 않았습니다.",
        error: "SIDE_EFFECT_OPERATION_BLOCKED",
        details: {
          kind: "side_effect_operation_blocked",
          reasonCode: admission.reasonCode,
        },
      },
    }
  }
  if (
    admission.status === "reserved_new"
    || admission.status === "reserved_existing"
  ) {
    return { status: "ready", admission, operation }
  }
  return {
    status: "existing",
    admission,
    operation,
    result: existingPreparationResult(admission),
  }
}

function boundedEffectEvidenceRefs(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const refs = (value as { effectEvidenceRefs?: unknown }).effectEvidenceRefs
  if (!Array.isArray(refs)) return []
  return [...new Set(refs.filter((ref): ref is string =>
    typeof ref === "string" &&
    (
      /^artifact:[0-9a-f-]{36}$/iu.test(ref) ||
      ref === "side-effect-fact:camera-device-constraint-satisfied:v1"
    )
  ))]
}

function boundedRecoveryEvidence(value: unknown): ToolSideEffectRecoveryEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const evidence = value as Record<string, unknown>
  const allowedReasons = new Set([
    "camera_resolved_device_missing",
    "camera_resolved_device_mismatch",
    "camera_device_constraint_evidence_missing",
  ])
  if (
    evidence.kind !== "artifact_candidate" ||
    typeof evidence.artifactRef !== "string" ||
    !/^artifact:[0-9a-f-]{36}$/iu.test(evidence.artifactRef) ||
    typeof evidence.mimeType !== "string" ||
    !["image/jpeg", "image/png", "image/webp"].includes(evidence.mimeType) ||
    typeof evidence.sizeBytes !== "number" ||
    !Number.isSafeInteger(evidence.sizeBytes) ||
    evidence.sizeBytes <= 0 ||
    typeof evidence.reasonCode !== "string" ||
    !allowedReasons.has(evidence.reasonCode) ||
    typeof evidence.resolvedDevicePresent !== "boolean"
  ) {
    return undefined
  }
  return {
    kind: "artifact_candidate",
    artifactRef: evidence.artifactRef,
    mimeType: evidence.mimeType,
    sizeBytes: evidence.sizeBytes,
    reasonCode: evidence.reasonCode,
    resolvedDevicePresent: evidence.resolvedDevicePresent,
  }
}

const BOUNDED_EFFECT_FAILURE_REASONS = new Set([
  "camera_response_timeout",
  "camera_handler_timeout",
  "camera_helper_timeout",
  "camera_capture_timeout",
  "camera_busy",
  "camera_capture_cancelled",
  "camera_permission_denied",
  "camera_permission_restricted",
  "camera_permission_not_determined",
  "screen_permission_denied",
  "side_effect_binding_required",
  "side_effect_authorization_required",
  "side_effect_authorization_rejected",
  "invalid_request_params",
  "unknown_method",
  "resource_busy",
  "resource_state_unavailable",
  "screen_capture_artifact_empty",
  "yeonjang_screen_capture_remote_failure",
  "yeonjang_capability_matrix_required",
])

const BOUNDED_EFFECT_TERMINAL_STAGES = new Set([
  "response_timeout",
  "handler_timeout",
  "helper_timeout",
  "handler_failed",
  "cancelled",
  "rejected",
])

const BOUNDED_EFFECT_RETRY_SAFETY = new Set([
  "safe_same_command",
  "change_strategy",
  "unknown_effect_state",
  "completed",
])

function boundedEffectFailure(
  value: ToolResult | undefined,
): {
  reasonCode: string
  retrySameStrategy: false
  terminalStage?:
    | "response_timeout"
    | "handler_timeout"
    | "helper_timeout"
    | "handler_failed"
    | "cancelled"
    | "rejected"
  retrySafety?:
    | "safe_same_command"
    | "change_strategy"
    | "unknown_effect_state"
    | "completed"
} | undefined {
  if (
    !value?.details
    || typeof value.details !== "object"
    || Array.isArray(value.details)
  ) {
    return undefined
  }
  const failure = (value.details as Record<string, unknown>).failure
  if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
    return undefined
  }
  const reasonCode = (failure as Record<string, unknown>).reasonCode
  if (
    typeof reasonCode !== "string"
    || !BOUNDED_EFFECT_FAILURE_REASONS.has(reasonCode)
  ) {
    return undefined
  }
  const terminalStage = (failure as Record<string, unknown>).terminalStage
  const retrySafety = (failure as Record<string, unknown>).retrySafety
  return {
    reasonCode,
    retrySameStrategy: false,
    ...(typeof terminalStage === "string"
      && BOUNDED_EFFECT_TERMINAL_STAGES.has(terminalStage)
      ? {
          terminalStage: terminalStage as
            | "response_timeout"
            | "handler_timeout"
            | "helper_timeout"
            | "handler_failed"
            | "cancelled"
            | "rejected",
        }
      : {}),
    ...(typeof retrySafety === "string"
      && BOUNDED_EFFECT_RETRY_SAFETY.has(retrySafety)
      ? {
          retrySafety: retrySafety as
            | "safe_same_command"
            | "change_strategy"
            | "unknown_effect_state"
            | "completed",
        }
      : {}),
  }
}

function boundedTerminalFailureControls(value: ToolResult | undefined): {
  stopAfterFailure: true
  via: "yeonjang"
  failureKind: "remote_failure" | "remote_rejected" | "path_bug" | "timeout"
} | undefined {
  if (!value?.details || typeof value.details !== "object" || Array.isArray(value.details)) {
    return undefined
  }
  const details = value.details as Record<string, unknown>
  const failureKind = details.failureKind
  if (
    details.stopAfterFailure !== true ||
    details.via !== "yeonjang" ||
    (failureKind !== "remote_failure" &&
      failureKind !== "remote_rejected" &&
      failureKind !== "path_bug" &&
      failureKind !== "timeout")
  ) {
    return undefined
  }
  return { stopAfterFailure: true, via: "yeonjang", failureKind }
}

export async function executeToolWithSideEffectLedger(input: {
  tool: AnyTool
  params: Record<string, unknown>
  ctx: ToolContext
  preparedOperation?: ResolvedToolSideEffectOperation
}): Promise<ToolResult> {
  const contract = input.tool.sideEffect
  if (!contract) return input.tool.execute(input.params, input.ctx)
  const policy = input.ctx.authorizationReceipt
  const preparation = input.preparedOperation
    ? { status: "resolved" as const, operation: input.preparedOperation }
    : resolveToolSideEffectOperation(input)
  if (preparation.status === "rejected") return preparation.result
  if (preparation.status !== "resolved") {
    return input.tool.execute(input.params, input.ctx)
  }
  const {
    prepared,
    executionParams,
    targetRef,
    expectedState,
    authorizationParams,
  } = preparation.operation
  const authorizationBinding = policy
    ? buildToolAuthorizationBinding(
        authorizationParams,
        policy.executionTargetFingerprint
          ? {
              executionTargetFingerprint: policy.executionTargetFingerprint,
            }
          : undefined,
      )
    : null
  const identity = prepared.identity
  const authorization =
    policy &&
    policy.policyDecision === "allow" &&
    policy.runId === input.ctx.runId &&
    policy.toolName === input.tool.name &&
    authorizationBinding !== null &&
    policy.paramsHash === hashApprovalParams(authorizationBinding)
      ? buildSideEffectOperationAuthorization({
          identity,
          policyDecisionId: policy.policyDecisionId,
          policyReceiptRef: `tool-policy:${policy.policyDecisionId}`,
          effectClass: contract.effectClass,
          scopeFingerprint: fingerprint(policy.permissionScope),
          expectedEffectFingerprint: fingerprint(expectedState),
        })
      : undefined
  const repository = new SqliteSideEffectOperationRepository(getDb(), () => Date.now())
  const effectContext: ToolContext = {
    ...input.ctx,
    sideEffectOperation: Object.freeze({
      operationId: identity.operationId,
      targetFingerprint: identity.targetFingerprint,
    }),
  }
  let executedToolResult: ToolResult | undefined
  const result = await executeSideEffectOperation(
    {
      identity,
      compensationSupport: contract.compensationSupport,
      executeEffect: async () => {
        const value = await input.tool.execute(executionParams, effectContext)
        executedToolResult = value
        const effectFailure = boundedEffectFailure(value)
        const rejectionRetrySafety = effectFailure?.retrySafety
        const preEffectRejection =
          !value.success
          && effectFailure?.terminalStage === "rejected"
          && (
            rejectionRetrySafety === "safe_same_command"
            || rejectionRetrySafety === "change_strategy"
          )
            ? {
                reasonCode: effectFailure.reasonCode,
                retrySafety: rejectionRetrySafety,
              }
            : undefined
        const effectEvidenceRefs =
          contract.effectEvidenceRefs?.(executionParams, input.ctx, value) ?? []
        return {
          value,
          success: value.success,
          resultFingerprint: fingerprint({
            success: value.success,
            output: value.output,
            error: value.error ?? null,
            details: value.details ?? null,
          }),
          recordedAt: Date.now(),
          ...(effectEvidenceRefs.length > 0 ? { effectEvidenceRefs } : {}),
          ...(preEffectRejection ? { preEffectRejection } : {}),
        }
      },
      observePostState: async (value) => {
        const observation = await contract.observe(executionParams, input.ctx, value)
        return {
          available: observation.available,
          targetFingerprint:
            observation.targetRef === targetRef
              ? identity.targetFingerprint
              : fingerprint({
                  targetRef: observation.targetRef,
                  executionTargetFingerprint: null,
                }),
          expectedStateFingerprint: fingerprint(observation.expectedState),
          observedStateFingerprint: fingerprint(observation.observedState),
          capturedAt: Date.now(),
          ...(observation.recoveryEvidence !== undefined
            ? { recoveryEvidence: observation.recoveryEvidence }
            : {}),
        }
      },
      ...(contract.observeCurrent
        ? {
            observeCurrentPostState: async ({ effectEvidenceRefs }) => {
              const observation = await contract.observeCurrent?.(
                executionParams,
                input.ctx,
                effectEvidenceRefs,
              )
              return {
                available: observation?.available ?? false,
                targetFingerprint:
                  (observation?.targetRef ?? targetRef) === targetRef
                    ? identity.targetFingerprint
                    : fingerprint({
                        targetRef: observation?.targetRef ?? "",
                        executionTargetFingerprint: null,
                      }),
                expectedStateFingerprint: fingerprint(observation?.expectedState ?? null),
                observedStateFingerprint: fingerprint(observation?.observedState ?? null),
                capturedAt: Date.now(),
                ...(observation?.recoveryEvidence !== undefined
                  ? { recoveryEvidence: observation.recoveryEvidence }
                  : {}),
              }
            },
          }
        : {}),
      ...(contract.compensate
        ? {
            compensate: async (value: ToolResult) => {
              const compensation = await contract.compensate?.(executionParams, input.ctx, value)
              return {
                success: compensation?.success ?? false,
                receiptEvidence: compensation?.evidence ?? null,
              }
            },
          }
        : {}),
      ...(contract.verifyCompensation
        ? {
            verifyCompensation: async () => {
              const verification = await contract.verifyCompensation?.(executionParams, input.ctx)
              return {
                verified: verification?.verified ?? false,
                receiptEvidence: verification?.evidence ?? null,
              }
            },
          }
        : {}),
    },
    {
      repository,
      ...(authorization ? { authorization } : {}),
      createReceipt: ({ identity: receiptIdentity, event, operationRevision, evidence }) => {
        const evidenceFingerprint = fingerprint(evidence)
        const effectEvidenceRefs =
          event === "RECORD_EFFECT" ? boundedEffectEvidenceRefs(evidence) : []
        return buildSideEffectOperationReceipt({
          identity: receiptIdentity,
          event,
          operationRevision,
          evidenceFingerprint,
          evidenceRefs:
            event === "START_EFFECT" && authorization
              ? [authorization.policyReceiptRef]
              : effectEvidenceRefs.length > 0
                ? effectEvidenceRefs
              : [`operation-evidence:${event.toLowerCase()}:${evidenceFingerprint.slice(-24)}`],
          issuedAt: Date.now(),
        })
      },
      isCancelled: () => input.ctx.signal.aborted,
    },
  )

  switch (result.status) {
    case "verified":
      return result.value
    case "duplicate_verified":
    case "resumed_verified":
      return {
        success: true,
        output: `${input.tool.name}의 동일한 검증 완료 작업이 있어 외부 변경을 다시 실행하지 않았습니다.`,
        details: { kind: "side_effect_duplicate_verified", operationId: identity.operationId },
      }
    case "cancelled_before_effect":
      return {
        success: false,
        output: "취소 요청으로 외부 변경을 시작하지 않았습니다.",
        error: "SIDE_EFFECT_CANCELLED_BEFORE_EXECUTION",
      }
    case "compensated":
      return {
        success: false,
        output: "외부 변경 검증에 실패해 원상 복구했습니다.",
        error: "SIDE_EFFECT_COMPENSATED",
      }
    case "effect_rejected": {
      const failure = boundedEffectFailure(executedToolResult)
      const terminalFailureControls = boundedTerminalFailureControls(executedToolResult)
      return {
        success: false,
        output:
          executedToolResult?.output
          ?? "외부 효과를 실행하기 전에 요청이 거절되었습니다.",
        error:
          result.reasonCode === "side_effect_existing_effect_rejected"
            ? "SIDE_EFFECT_EFFECT_REJECTED"
            : executedToolResult?.error ?? "SIDE_EFFECT_EFFECT_REJECTED",
        details: {
          kind: "side_effect_effect_rejected",
          operationId: identity.operationId,
          reasonCode: result.reasonCode,
          ...(failure ? { failure } : {}),
          ...(terminalFailureControls ?? {}),
        },
      }
    }
    case "manual_intervention": {
      const recoveryEvidence = boundedRecoveryEvidence(result.recoveryEvidence)
      const effectFailure = boundedEffectFailure(executedToolResult)
      const terminalFailureControls = boundedTerminalFailureControls(executedToolResult)
      // A Yeonjang adapter may have a typed terminal decision that is newer
      // than this Gateway's closed failure-code allowlist. Keep its already
      // redacted tool output visible; replacing it here with a generic manual
      // message destroys the only actionable MQTT boundary evidence.
      const terminalFailureOutput = terminalFailureControls && executedToolResult?.output
      return {
        success: false,
        output:
          (effectFailure || terminalFailureOutput) && executedToolResult?.output
            ? executedToolResult.output
            : "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
        details: {
          kind: "side_effect_manual_intervention",
          operationId: identity.operationId,
          reasonCode: result.reasonCode,
          goalValidationCandidate: !effectFailure,
          ...(result.priorReceiptRef
            ? {
                priorState: "MANUAL_INTERVENTION",
                priorReceiptRef: result.priorReceiptRef,
              }
            : {}),
          ...(recoveryEvidence ? { recoveryEvidence } : {}),
          ...(effectFailure ? { failure: effectFailure } : {}),
          ...(terminalFailureControls ?? {}),
        },
      }
    }
    case "blocked":
      return {
        success: false,
        output: "동일 외부 변경 작업의 안전한 실행 상태를 확인할 수 없습니다.",
        error: "SIDE_EFFECT_OPERATION_BLOCKED",
        details: { reasonCode: result.reasonCode },
      }
  }
}
