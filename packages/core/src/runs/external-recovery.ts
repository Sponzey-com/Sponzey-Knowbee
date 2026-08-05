import type { AIProvider } from "../ai/index.js"
import type { AIProviderFailureReasonCode } from "../ai/provider-failure.js"
import {
  buildAiErrorRecoveryPrompt,
  buildAiRecoveryKey,
  buildWorkerRuntimeErrorRecoveryPrompt,
  buildWorkerRuntimeRecoveryKey,
} from "./recovery.js"
import type { TaskProfile } from "./types.js"
import type { WorkerRuntimeTarget } from "./worker-runtime.js"

export type ExternalRecoveryKind = "ai" | "worker_runtime"

export interface ExternalRecoveryPayload {
  summary: string
  reason: string
  message: string
  providerFailureReasonCode?: AIProviderFailureReasonCode
}

export interface ExternalRecoveryState {
  model: string | undefined
  providerId: string | undefined
  provider: AIProvider | undefined
  targetId: string | undefined
  targetLabel: string | undefined
  workerRuntime: WorkerRuntimeTarget | undefined
}

export interface ExternalRecoveryPlan {
  recoveryKey: string
  eventLabel: string
  routeChanged: boolean
  routeEventLabel?: string
  nextState: ExternalRecoveryState
  nextMessage: string
  reviewRequired?: true
  duplicateStop?: {
    summary: string
    reason: string
    rawMessage?: string
    remainingItems: string[]
  }
}

export function planExternalRecovery(params: {
  kind: ExternalRecoveryKind
  taskProfile: TaskProfile
  current: ExternalRecoveryState
  payload: ExternalRecoveryPayload
  seenKeys: Set<string>
  originalRequest: string
  previousResult: string
}): ExternalRecoveryPlan {
  const recoveryKey = params.kind === "ai"
    ? buildAiRecoveryKey({
        targetId: params.current.targetId,
        workerRuntimeKind: params.current.workerRuntime?.kind,
        providerId: params.current.providerId,
        model: params.current.model,
        reason: params.payload.providerFailureReasonCode ?? params.payload.reason,
        message: params.payload.message,
      })
    : buildWorkerRuntimeRecoveryKey({
        targetId: params.current.targetId,
        workerRuntimeKind: params.current.workerRuntime?.kind,
        providerId: params.current.providerId,
        model: params.current.model,
        reason: params.payload.reason,
        message: params.payload.message,
      })

  const nextState: ExternalRecoveryState = {
    model: params.current.model,
    providerId: params.current.providerId,
    provider: params.current.provider,
    targetId: params.current.targetId,
    targetLabel: params.current.targetLabel,
    workerRuntime: params.current.workerRuntime,
  }
  const sameAiRecovery = params.current.targetLabel ?? params.current.targetId ?? params.current.providerId ?? params.current.model ?? "현재 AI 연결"
  const sameTargetDirective = `Recover on the same AI connection (${sameAiRecovery}) and target. Change only the approach.`
  const fallbackToEmbeddedAi = Boolean(params.current.workerRuntime)
  let routeEventLabel: string | undefined
  if (fallbackToEmbeddedAi) {
    nextState.workerRuntime = undefined
    routeEventLabel = `${params.current.workerRuntime?.label ?? "작업 세션"} 대신 같은 AI 연결의 기본 추론 경로로 복구합니다.`
  }

  const deterministicProviderContractFailure =
    params.kind === "ai"
    && params.payload.providerFailureReasonCode === "provider_contract_rejected"

  if (
    !fallbackToEmbeddedAi
    && params.kind === "ai"
    && (deterministicProviderContractFailure || params.seenKeys.has(recoveryKey))
  ) {
    return {
      recoveryKey,
      eventLabel: "AI 실행 실패를 동일 계약으로 재전송하지 않고 completion review로 전달합니다.",
      routeChanged: false,
      nextState,
      nextMessage: "",
      reviewRequired: true,
    }
  }

  if (!fallbackToEmbeddedAi && params.seenKeys.has(recoveryKey)) {
    return {
      recoveryKey,
      eventLabel: "작업 세션 오류를 분석하고 다른 방법으로 재시도합니다.",
      routeChanged: false,
      nextState,
      nextMessage: "",
      duplicateStop: {
        summary: "같은 작업 세션 오류가 같은 대상에서 반복되어 자동 진행을 멈췄습니다.",
        reason: params.payload.reason,
        ...(params.payload.message.trim() ? { rawMessage: params.payload.message } : {}),
        remainingItems: ["같은 AI 연결과 같은 대상에서 동일한 작업 세션 오류가 반복되어 다른 수동 조치가 필요합니다."],
      },
    }
  }

  return {
    recoveryKey,
    eventLabel: params.kind === "ai"
      ? "AI 오류를 분석하고 다른 방법으로 재시도합니다."
      : "작업 세션 오류를 분석하고 다른 방법으로 재시도합니다.",
    routeChanged: false,
    ...(routeEventLabel ? { routeEventLabel } : {}),
    nextState,
    nextMessage: params.kind === "ai"
      ? buildAiErrorRecoveryPrompt({
          originalRequest: params.originalRequest,
          previousResult: params.previousResult,
          summary: params.payload.summary,
          reason: params.payload.reason,
          message: params.payload.message,
          failedRoute: describeCurrentAttempt(params.current),
          nextRouteHint: sameTargetDirective,
        })
      : buildWorkerRuntimeErrorRecoveryPrompt({
          originalRequest: params.originalRequest,
          previousResult: params.previousResult,
          summary: params.payload.summary,
          reason: params.payload.reason,
          message: params.payload.message,
          failedRoute: describeCurrentAttempt(params.current),
          nextRouteHint: sameTargetDirective,
        }),
  }
}

function describeCurrentTarget(state: ExternalRecoveryState): string {
  return state.targetLabel ?? state.targetId ?? state.model ?? "현재 대상"
}

function describeCurrentAttempt(state: ExternalRecoveryState): string {
  if (state.workerRuntime) {
    const details = [state.workerRuntime.label]
    if (state.targetLabel && state.targetLabel !== state.workerRuntime.label) details.push(state.targetLabel)
    if (state.model) details.push(state.model)
    return details.join(" / ")
  }

  const details = [state.targetLabel ?? state.targetId ?? "기본 AI 경로"]
  if (state.providerId) details.push(state.providerId)
  if (state.model) details.push(state.model)
  return details.join(" / ")
}
