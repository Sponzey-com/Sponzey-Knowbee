import {
  channelSmokeScenarioRequiresCapabilityAdmission,
  type ChannelSmokeScenario,
  type ChannelSmokeTrace,
} from "./smoke-runner.js"
import type { RequestExecutionOutcome } from "../runs/flow-contract.js"
import type { LiveSmokeLatencyEvidence } from "./live-smoke-terminal-observer.js"

export interface StartedCanonicalTelegramSmokeRequest {
  requestId: string
  runId: string
  requestGroupId: string
  targetFingerprint: string
}

export interface CanonicalTelegramSmokeToolReceipt {
  runId: string
  requestGroupId: string
  toolName: string
  result: "success" | "failed" | "denied"
}

export interface CanonicalTelegramSmokeApprovalReceipt {
  runId: string
  requestGroupId: string
  channel: "telegram"
  toolName: string
  status: "requested" | "approved" | "consumed" | "denied" | "expired"
  uiVisible: boolean
}

export interface CanonicalTelegramSmokeArtifactReceipt {
  runId: string
  requestGroupId: string
  channel: "telegram"
  mode: "native_file" | "download_link"
  url?: string
}

export interface CanonicalTelegramSmokeCapabilityReceipt {
  runId: string
  requestGroupId: string
  capability: string
  receiptStatus: "unsupported_capability"
}

export interface CanonicalTelegramSmokeObservation extends StartedCanonicalTelegramSmokeRequest {
  terminalStatus: "completed" | "failed" | "cancelled" | "interrupted" | "timed_out"
  typedTraceStatus: "ready" | "not_recorded" | "unavailable"
  typedTraceTerminal: boolean
  typedTraceIssueCount: number
  analysisCompleted: boolean
  directResponseReceiptId?: string
  directResponseReceiptValid?: boolean
  requestDiagnosisReceiptId?: string
  solutionPlanReceiptId?: string
  capabilityAdmissionReceiptId?: string
  evidenceRecorded: boolean
  reviewCompleted: boolean
  resultReviewReceiptId?: string
  finalResponseReceiptId?: string
  decisionReceiptOrderValid?: boolean
  finalizationCompleted: boolean
  rootOwnerFinalized?: boolean
  finalAnswerCount?: number
  topologyRunCount: number
  auditEventId?: string
  providerDeliveryReceipted: boolean
  targetMatched: boolean
  userReportDelivered: boolean
  userReportDeliveryCount?: number
  deliveryReceiptRef?: string
  capabilitySelectionDecisionTraceId?: string
  toolReceipts?: readonly CanonicalTelegramSmokeToolReceipt[]
  approvalReceipts?: readonly CanonicalTelegramSmokeApprovalReceipt[]
  artifactReceipts?: readonly CanonicalTelegramSmokeArtifactReceipt[]
  capabilityReceipts?: readonly CanonicalTelegramSmokeCapabilityReceipt[]
  resultReviewReasonCodes?: readonly string[]
  executionOutcome?: RequestExecutionOutcome
  latencyEvidence?: LiveSmokeLatencyEvidence
}

export interface TelegramLiveSmokeExecutorPorts {
  startRequest(input: {
    request: string
    source: "telegram"
  }): Promise<StartedCanonicalTelegramSmokeRequest> | StartedCanonicalTelegramSmokeRequest
  observeTerminal(input: {
    started: StartedCanonicalTelegramSmokeRequest
    signal?: AbortSignal
  }): Promise<CanonicalTelegramSmokeObservation>
}

function scopedReceipts<T extends { runId: string; requestGroupId: string }>(
  receipts: readonly T[] | undefined,
  started: StartedCanonicalTelegramSmokeRequest,
): readonly T[] {
  return (receipts ?? []).filter(
    (receipt) =>
      receipt.runId === started.runId && receipt.requestGroupId === started.requestGroupId,
  )
}

function projectScenarioEvidence(
  scenario: ChannelSmokeScenario,
  started: StartedCanonicalTelegramSmokeRequest,
  observation: CanonicalTelegramSmokeObservation,
): Pick<ChannelSmokeTrace, "toolCalls" | "approval" | "artifacts" | "capabilityFallbacks"> {
  if (scenario.kind === "basic_query") return {}
  if (scenario.kind === "failure_tool") {
    const capabilityReceipts = scopedReceipts(observation.capabilityReceipts, started)
    if (capabilityReceipts.length === 0) {
      throw new Error("telegram_live_smoke_capability_receipt_missing")
    }
    if (!(observation.resultReviewReasonCodes ?? []).includes("paths_exhausted")) {
      throw new Error("telegram_live_smoke_paths_not_exhausted")
    }
    return {
      capabilityFallbacks: capabilityReceipts.map((receipt) => ({
        capability: receipt.capability,
        receiptStatus: receipt.receiptStatus,
        userVisible: true,
      })),
    }
  }

  const expectedTool = scenario.expectedTool?.trim()
  if (!expectedTool) throw new Error("telegram_live_smoke_expected_tool_missing")
  const toolReceipt = scopedReceipts(observation.toolReceipts, started).find(
    (receipt) => receipt.toolName === expectedTool,
  )
  if (!toolReceipt) throw new Error("telegram_live_smoke_tool_receipt_missing")
  if (toolReceipt.result !== "success") {
    throw new Error(`telegram_live_smoke_tool_${toolReceipt.result}`)
  }

  const artifacts = scopedReceipts(observation.artifactReceipts, started)
  if (scenario.expectsArtifact && artifacts.length === 0) {
    throw new Error("telegram_live_smoke_artifact_receipt_missing")
  }
  for (const artifact of artifacts) {
    if (
      artifact.mode === "download_link" &&
      (!artifact.url?.startsWith("/api/artifacts/") ||
        /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\|Bearer\s+)/u.test(artifact.url))
    ) {
      throw new Error("telegram_live_smoke_artifact_projection_unsafe")
    }
  }

  const projected = {
    toolCalls: [
      {
        toolName: toolReceipt.toolName,
        sourceChannel: "telegram" as const,
        deliveryChannel: "telegram" as const,
      },
    ],
    artifacts: artifacts.map((artifact) => ({
      channel: artifact.channel,
      mode: artifact.mode,
      ...(artifact.url ? { url: artifact.url } : {}),
    })),
  }
  if (scenario.kind === "artifact_delivery" || scenario.kind === "web_skill") return projected

  const approval = scopedReceipts(observation.approvalReceipts, started).find(
    (receipt) => receipt.toolName === expectedTool,
  )
  if (!approval) throw new Error("telegram_live_smoke_approval_receipt_missing")
  if (approval.status === "requested") {
    throw new Error("telegram_live_smoke_approval_unresolved")
  }
  if (approval.status === "denied") throw new Error("telegram_live_smoke_approval_denied")
  if (approval.status === "expired") throw new Error("telegram_live_smoke_approval_timed_out")
  if (!approval.uiVisible) throw new Error("telegram_live_smoke_approval_ui_missing")

  return {
    ...projected,
    approval: {
      requested: true,
      targetChannel: "telegram",
      correlationKey: "telegram_chat_thread",
      uiVisible: true,
      uiKind: "button",
    },
  }
}

export function createTelegramLiveSmokeExecutor(
  ports: TelegramLiveSmokeExecutorPorts,
): (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace> {
  return async (scenario) => {
    if (
      scenario.channel !== "telegram" ||
      (scenario.kind !== "basic_query" &&
        scenario.kind !== "web_skill" &&
        scenario.kind !== "approval_required_tool" &&
        scenario.kind !== "artifact_delivery" &&
        scenario.kind !== "failure_tool")
    ) {
      throw new Error("telegram_live_smoke_scenario_unsupported")
    }

    let started: StartedCanonicalTelegramSmokeRequest
    try {
      started = await ports.startRequest({ request: scenario.request, source: "telegram" })
    } catch {
      throw new Error("telegram_live_smoke_start_failed")
    }
    if (
      !started.requestId.trim() ||
      !started.runId.trim() ||
      started.requestGroupId !== started.runId ||
      !started.targetFingerprint.trim()
    ) {
      throw new Error("telegram_live_smoke_start_receipt_invalid")
    }

    let observation: CanonicalTelegramSmokeObservation
    try {
      observation = await ports.observeTerminal({ started })
    } catch {
      throw new Error("telegram_live_smoke_observation_failed")
    }
    if (
      observation.requestId !== started.requestId ||
      observation.runId !== started.runId ||
      observation.requestGroupId !== started.requestGroupId ||
      observation.targetFingerprint !== started.targetFingerprint
    ) {
      throw new Error("telegram_live_smoke_observation_identity_mismatch")
    }
    if (observation.terminalStatus !== "completed") {
      throw new Error(`telegram_live_smoke_terminal_${observation.terminalStatus}`)
    }
    if (!observation.latencyEvidence) {
      throw new Error("telegram_live_smoke_latency_evidence_missing")
    }
    if (
      observation.latencyEvidence.runId !== started.runId
      || observation.latencyEvidence.requestGroupId !== started.requestGroupId
    ) {
      throw new Error("telegram_live_smoke_latency_evidence_identity_mismatch")
    }
    if (observation.latencyEvidence.status !== "ok") {
      throw new Error("telegram_live_smoke_first_response_latency_budget_exceeded")
    }
    if (!observation.providerDeliveryReceipted) {
      throw new Error("telegram_live_smoke_provider_receipt_missing")
    }
    if (!observation.targetMatched) {
      throw new Error("telegram_live_smoke_target_mismatch")
    }
    if (!observation.userReportDelivered) {
      throw new Error("telegram_live_smoke_user_report_not_delivered")
    }
    if (!observation.deliveryReceiptRef?.trim()) {
      throw new Error("telegram_live_smoke_delivery_receipt_ref_missing")
    }
    const directResponse =
      scenario.kind === "basic_query"
      && observation.directResponseReceiptValid === true
      && observation.topologyRunCount === 0
    if (directResponse) {
      if (!observation.directResponseReceiptId?.trim()) {
        throw new Error("telegram_live_smoke_direct_response_receipt_missing")
      }
      if (observation.userReportDeliveryCount !== 1) {
        throw new Error("telegram_live_smoke_direct_response_delivery_count_invalid")
      }
    } else {
      if (observation.typedTraceStatus !== "ready") {
        throw new Error("telegram_live_smoke_typed_trace_unavailable")
      }
      if (!observation.typedTraceTerminal || observation.typedTraceIssueCount !== 0) {
        throw new Error("telegram_live_smoke_typed_trace_invalid")
      }
      if (!observation.analysisCompleted) {
        throw new Error("telegram_live_smoke_analysis_receipt_missing")
      }
      if (!observation.requestDiagnosisReceiptId?.trim()) {
        throw new Error("telegram_live_smoke_request_diagnosis_receipt_missing")
      }
      if (!observation.solutionPlanReceiptId?.trim()) {
        throw new Error("telegram_live_smoke_solution_plan_receipt_missing")
      }
      if (!observation.evidenceRecorded) {
        throw new Error("telegram_live_smoke_evidence_receipt_missing")
      }
      if (!observation.reviewCompleted) {
        throw new Error("telegram_live_smoke_review_receipt_missing")
      }
      if (!observation.resultReviewReceiptId?.trim()) {
        throw new Error("telegram_live_smoke_result_review_receipt_missing")
      }
      if (!observation.finalResponseReceiptId?.trim()) {
        throw new Error("telegram_live_smoke_final_response_receipt_missing")
      }
      if (!observation.decisionReceiptOrderValid) {
        throw new Error("telegram_live_smoke_decision_receipt_order_invalid")
      }
      if (!(observation.resultReviewReasonCodes ?? []).some((code) => code.trim())) {
        throw new Error("telegram_live_smoke_result_review_reason_missing")
      }
      if (!observation.finalizationCompleted) {
        throw new Error("telegram_live_smoke_finalization_receipt_missing")
      }
      if (!observation.rootOwnerFinalized || observation.finalAnswerCount !== 1) {
        throw new Error("telegram_live_smoke_root_finalization_invalid")
      }
      if (!observation.auditEventId?.trim()) {
        throw new Error("telegram_live_smoke_audit_receipt_missing")
      }
      if (!observation.executionOutcome) {
        throw new Error("telegram_live_smoke_semantic_outcome_missing")
      }
    }
    const capabilityAdmissionRequired =
      channelSmokeScenarioRequiresCapabilityAdmission(scenario.kind)
    if (
      capabilityAdmissionRequired &&
      !observation.capabilityAdmissionReceiptId?.trim()
    ) {
      throw new Error(
        "telegram_live_smoke_capability_admission_receipt_missing",
      )
    }
    const scenarioEvidence = projectScenarioEvidence(scenario, started, observation)

    return {
      sourceChannel: "telegram",
      responseChannel: "telegram",
      correlationKey: "telegram_chat_thread",
      requestFlow: {
        runId: observation.runId,
        requestGroupId: observation.requestGroupId,
        requestGroupMatchesRunId: observation.requestGroupId === observation.runId,
        flowKind: directResponse ? "direct_response" : "execution",
        ...(directResponse
          ? {
              directResponseReceiptId: observation.directResponseReceiptId!.trim(),
            }
          : {
              decisionTracePresent:
                observation.analysisCompleted && observation.reviewCompleted,
              requestDiagnosisReceiptId:
                observation.requestDiagnosisReceiptId!.trim(),
              solutionPlanReceiptId: observation.solutionPlanReceiptId!.trim(),
              resultReviewReceiptId:
                observation.resultReviewReceiptId!.trim(),
              finalResponseReceiptId:
                observation.finalResponseReceiptId!.trim(),
              decisionReceiptOrderValid: true,
            }),
        ...(capabilityAdmissionRequired
          ? {
              capabilityAdmissionRequired: true,
              capabilityAdmissionReceiptId:
                observation.capabilityAdmissionReceiptId!.trim(),
            }
          : {}),
        topologyRunCreated: observation.topologyRunCount > 0,
        providerDirectUsed: false,
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      latency: {
        metricId: observation.latencyEvidence.metricId,
        runId: observation.latencyEvidence.runId,
        requestGroupId: observation.latencyEvidence.requestGroupId,
        firstResponseLatencyMs: observation.latencyEvidence.durationMs,
        firstResponseBudgetMs: observation.latencyEvidence.budgetMs,
        firstResponseStatus: observation.latencyEvidence.status,
        terminalResponseLatencyMs:
          observation.latencyEvidence.terminalResponseLatencyMs,
      },
      finalDelivery: {
        delivered: true,
        targetChannel: "telegram",
        correlationKey: "telegram_chat_thread",
        receiptRef: observation.deliveryReceiptRef!.trim(),
        userVisible: true,
      },
      auditLogId: directResponse
        ? observation.directResponseReceiptId!.trim()
        : observation.auditEventId!.trim(),
      semanticOutcome: directResponse
        ? {
            executionStatus: "succeeded",
            deliveryStatus: "delivered",
          }
        : observation.executionOutcome!,
      semanticReview: {
        requiredCompletionConditionIds: ["condition:execution", "condition:delivery"],
        satisfiedCompletionConditionIds: ["condition:execution", "condition:delivery"],
        reasonCodes: directResponse
          ? ["direct_response_completed"]
          : observation.resultReviewReasonCodes!.map((code) => code.trim()).filter(Boolean),
        terminalReport: "delivered",
        evidenceRefs: [
          ...(capabilityAdmissionRequired
            ? [observation.capabilityAdmissionReceiptId!.trim()]
            : []),
          directResponse
            ? observation.directResponseReceiptId!.trim()
            : observation.resultReviewReceiptId!.trim(),
          observation.deliveryReceiptRef!.trim(),
        ],
      },
      ...scenarioEvidence,
    }
  }
}
