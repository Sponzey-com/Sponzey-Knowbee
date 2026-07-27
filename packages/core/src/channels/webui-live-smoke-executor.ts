import {
  channelSmokeScenarioRequiresCapabilityAdmission,
  type ChannelSmokeScenario,
  type ChannelSmokeTrace,
} from "./smoke-runner.js"
import type { RequestExecutionOutcome } from "../runs/flow-contract.js"
import type { LiveSmokeLatencyEvidence } from "./live-smoke-terminal-observer.js"

export interface StartedCanonicalWebUiSmokeRequest {
  requestId: string
  runId: string
  requestGroupId: string
}

export interface CanonicalWebUiSmokeToolReceipt {
  runId: string
  requestGroupId: string
  toolName: string
  result: "success" | "failed" | "denied"
}

export interface CanonicalWebUiSmokeApprovalReceipt {
  runId: string
  requestGroupId: string
  channel: "webui"
  toolName: string
  status: "requested" | "approved" | "consumed" | "denied" | "expired"
  uiVisible: boolean
}

export interface CanonicalWebUiSmokeArtifactReceipt {
  runId: string
  requestGroupId: string
  channel: "webui"
  mode: "inline_preview" | "download_link"
  url: string
}

export interface CanonicalWebUiSmokeCapabilityReceipt {
  runId: string
  requestGroupId: string
  capability: string
  receiptStatus: "unsupported_capability"
}

export interface CanonicalWebUiSmokeObservation {
  requestId: string
  runId: string
  requestGroupId: string
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
  toolReceipts?: readonly CanonicalWebUiSmokeToolReceipt[]
  approvalReceipts?: readonly CanonicalWebUiSmokeApprovalReceipt[]
  artifactReceipts?: readonly CanonicalWebUiSmokeArtifactReceipt[]
  capabilityReceipts?: readonly CanonicalWebUiSmokeCapabilityReceipt[]
  resultReviewReasonCodes?: readonly string[]
  userReportDelivered?: boolean
  userReportDeliveryCount?: number
  deliveryReceiptRef?: string
  executionOutcome?: RequestExecutionOutcome
  latencyEvidence?: LiveSmokeLatencyEvidence
}

export interface WebUiLiveSmokeExecutorPorts {
  startRequest(input: {
    request: string
    source: "webui"
  }): Promise<StartedCanonicalWebUiSmokeRequest> | StartedCanonicalWebUiSmokeRequest
  observeTerminal(input: {
    started: StartedCanonicalWebUiSmokeRequest
    signal?: AbortSignal
  }): Promise<CanonicalWebUiSmokeObservation>
}

function requiredId(value: string): boolean {
  return value.trim().length > 0
}

function validateStart(started: StartedCanonicalWebUiSmokeRequest): void {
  if (
    !requiredId(started.requestId) ||
    !requiredId(started.runId) ||
    !requiredId(started.requestGroupId) ||
    started.requestGroupId !== started.runId
  ) {
    throw new Error("webui_live_smoke_start_receipt_invalid")
  }
}

function validateObservation(
  scenario: ChannelSmokeScenario,
  started: StartedCanonicalWebUiSmokeRequest,
  observation: CanonicalWebUiSmokeObservation,
): { auditEventId: string; directResponse: boolean } {
  if (
    observation.requestId !== started.requestId ||
    observation.runId !== started.runId ||
    observation.requestGroupId !== started.requestGroupId
  ) {
    throw new Error("webui_live_smoke_observation_identity_mismatch")
  }
  const expectedFailedTerminal =
    scenario.expectsFailure === true && observation.terminalStatus === "failed"
  if (observation.terminalStatus !== "completed" && !expectedFailedTerminal) {
    throw new Error(`webui_live_smoke_terminal_${observation.terminalStatus}`)
  }
  if (!observation.latencyEvidence) {
    throw new Error("webui_live_smoke_latency_evidence_missing")
  }
  if (
    observation.latencyEvidence.runId !== started.runId
    || observation.latencyEvidence.requestGroupId !== started.requestGroupId
  ) {
    throw new Error("webui_live_smoke_latency_evidence_identity_mismatch")
  }
  if (observation.latencyEvidence.status !== "ok") {
    throw new Error("webui_live_smoke_first_response_latency_budget_exceeded")
  }
  if (!observation.userReportDelivered) {
    throw new Error("webui_live_smoke_user_report_not_delivered")
  }
  if (!observation.deliveryReceiptRef?.trim()) {
    throw new Error("webui_live_smoke_delivery_receipt_ref_missing")
  }
  const directResponse =
    scenario.kind === "basic_query"
    && observation.directResponseReceiptValid === true
    && observation.topologyRunCount === 0
  if (directResponse) {
    if (!observation.directResponseReceiptId?.trim()) {
      throw new Error("webui_live_smoke_direct_response_receipt_missing")
    }
    if (observation.userReportDeliveryCount !== 1) {
      throw new Error("webui_live_smoke_direct_response_delivery_count_invalid")
    }
    return {
      auditEventId: observation.directResponseReceiptId.trim(),
      directResponse: true,
    }
  }
  if (observation.typedTraceStatus !== "ready") {
    throw new Error("webui_live_smoke_typed_trace_unavailable")
  }
  if (!observation.typedTraceTerminal || observation.typedTraceIssueCount !== 0) {
    throw new Error("webui_live_smoke_typed_trace_invalid")
  }
  if (!observation.analysisCompleted) {
    throw new Error("webui_live_smoke_analysis_receipt_missing")
  }
  if (!observation.requestDiagnosisReceiptId?.trim()) {
    throw new Error("webui_live_smoke_request_diagnosis_receipt_missing")
  }
  if (!observation.solutionPlanReceiptId?.trim()) {
    throw new Error("webui_live_smoke_solution_plan_receipt_missing")
  }
  if (!observation.evidenceRecorded) {
    throw new Error("webui_live_smoke_evidence_receipt_missing")
  }
  if (!observation.reviewCompleted) {
    throw new Error("webui_live_smoke_review_receipt_missing")
  }
  if (!observation.resultReviewReceiptId?.trim()) {
    throw new Error("webui_live_smoke_result_review_receipt_missing")
  }
  if (!observation.finalResponseReceiptId?.trim()) {
    throw new Error("webui_live_smoke_final_response_receipt_missing")
  }
  if (!observation.decisionReceiptOrderValid) {
    throw new Error("webui_live_smoke_decision_receipt_order_invalid")
  }
  if (!(observation.resultReviewReasonCodes ?? []).some((code) => code.trim())) {
    throw new Error("webui_live_smoke_result_review_reason_missing")
  }
  if (!observation.finalizationCompleted) {
    throw new Error("webui_live_smoke_finalization_receipt_missing")
  }
  if (!observation.rootOwnerFinalized || observation.finalAnswerCount !== 1) {
    throw new Error("webui_live_smoke_root_finalization_invalid")
  }
  if (!observation.auditEventId?.trim()) {
    throw new Error("webui_live_smoke_audit_receipt_missing")
  }
  return { auditEventId: observation.auditEventId.trim(), directResponse: false }
}

function scopedToolReceipts(
  started: StartedCanonicalWebUiSmokeRequest,
  observation: CanonicalWebUiSmokeObservation,
): readonly CanonicalWebUiSmokeToolReceipt[] {
  return (observation.toolReceipts ?? []).filter(
    (receipt) =>
      receipt.runId === started.runId && receipt.requestGroupId === started.requestGroupId,
  )
}

function scopedApprovalReceipts(
  started: StartedCanonicalWebUiSmokeRequest,
  observation: CanonicalWebUiSmokeObservation,
): readonly CanonicalWebUiSmokeApprovalReceipt[] {
  return (observation.approvalReceipts ?? []).filter(
    (receipt) =>
      receipt.runId === started.runId && receipt.requestGroupId === started.requestGroupId,
  )
}

function scopedArtifactReceipts(
  started: StartedCanonicalWebUiSmokeRequest,
  observation: CanonicalWebUiSmokeObservation,
): readonly CanonicalWebUiSmokeArtifactReceipt[] {
  return (observation.artifactReceipts ?? []).filter(
    (receipt) =>
      receipt.runId === started.runId && receipt.requestGroupId === started.requestGroupId,
  )
}

function scopedCapabilityReceipts(
  started: StartedCanonicalWebUiSmokeRequest,
  observation: CanonicalWebUiSmokeObservation,
): readonly CanonicalWebUiSmokeCapabilityReceipt[] {
  return (observation.capabilityReceipts ?? []).filter(
    (receipt) =>
      receipt.runId === started.runId && receipt.requestGroupId === started.requestGroupId,
  )
}

function validateArtifactUrl(url: string): void {
  if (
    !url.startsWith("/api/artifacts/") ||
    /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\|Bearer\s+)/u.test(url)
  ) {
    throw new Error("webui_live_smoke_artifact_projection_unsafe")
  }
}

function projectScenarioEvidence(
  scenario: ChannelSmokeScenario,
  started: StartedCanonicalWebUiSmokeRequest,
  observation: CanonicalWebUiSmokeObservation,
): Pick<ChannelSmokeTrace, "toolCalls" | "approval" | "artifacts" | "capabilityFallbacks"> {
  if (scenario.kind === "basic_query") return {}
  if (scenario.kind === "failure_tool") {
    if (
      observation.executionOutcome?.executionStatus !== "exhausted"
      || observation.executionOutcome.deliveryStatus !== "delivered"
    ) {
      throw new Error("webui_live_smoke_expected_exhausted_outcome")
    }
    const scopedReceipts = scopedCapabilityReceipts(started, observation)
    if (
      scopedReceipts.length === 0
      && (observation.capabilityReceipts?.length ?? 0) > 0
    ) {
      throw new Error("webui_live_smoke_capability_receipt_missing")
    }
    if (!(observation.resultReviewReasonCodes ?? []).includes("paths_exhausted")) {
      throw new Error("webui_live_smoke_paths_not_exhausted")
    }
    if (observation.userReportDelivered !== true) {
      throw new Error("webui_live_smoke_failure_report_not_delivered")
    }
    const capabilityReceipts =
      scopedReceipts.length > 0
        ? scopedReceipts
        : [
            {
              runId: started.runId,
              requestGroupId: started.requestGroupId,
              capability: "tool_execution",
              receiptStatus: "unsupported_capability" as const,
            },
          ]
    return {
      capabilityFallbacks: capabilityReceipts.map((receipt) => ({
        capability: receipt.capability,
        receiptStatus: receipt.receiptStatus,
        userVisible: true,
      })),
    }
  }
  const expectedTool = scenario.expectedTool?.trim()
  if (!expectedTool) throw new Error("webui_live_smoke_expected_tool_missing")

  const toolReceipt = scopedToolReceipts(started, observation).find(
    (receipt) => receipt.toolName === expectedTool,
  )
  if (!toolReceipt) throw new Error("webui_live_smoke_tool_receipt_missing")
  if (toolReceipt.result !== "success") {
    throw new Error(`webui_live_smoke_tool_${toolReceipt.result}`)
  }

  const artifacts = scopedArtifactReceipts(started, observation)
  if (scenario.expectsArtifact && artifacts.length === 0) {
    throw new Error("webui_live_smoke_artifact_receipt_missing")
  }
  for (const artifact of artifacts) validateArtifactUrl(artifact.url)

  if (scenario.kind === "artifact_delivery" || scenario.kind === "web_skill") {
    return {
      toolCalls: [
        {
          toolName: toolReceipt.toolName,
          sourceChannel: "webui",
          deliveryChannel: "webui",
        },
      ],
      artifacts: artifacts.map((artifact) => ({
        channel: artifact.channel,
        mode: artifact.mode,
        url: artifact.url,
      })),
    }
  }

  const approval = scopedApprovalReceipts(started, observation).find(
    (receipt) => receipt.toolName === expectedTool,
  )
  if (!approval) throw new Error("webui_live_smoke_approval_receipt_missing")
  if (approval.status === "requested") {
    throw new Error("webui_live_smoke_approval_unresolved")
  }
  if (approval.status === "denied") throw new Error("webui_live_smoke_approval_denied")
  if (approval.status === "expired") throw new Error("webui_live_smoke_approval_timed_out")
  if (!approval.uiVisible) throw new Error("webui_live_smoke_approval_ui_missing")

  return {
    toolCalls: [
      {
        toolName: toolReceipt.toolName,
        sourceChannel: "webui",
        deliveryChannel: "webui",
      },
    ],
    approval: {
      requested: true,
      targetChannel: approval.channel,
      correlationKey: "webui_run_id",
      uiVisible: true,
      uiKind: "inline",
    },
    artifacts: artifacts.map((artifact) => ({
      channel: artifact.channel,
      mode: artifact.mode,
      url: artifact.url,
    })),
  }
}

export function createWebUiLiveSmokeExecutor(
  ports: WebUiLiveSmokeExecutorPorts,
): (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace> {
  return async (scenario) => {
    if (
      scenario.channel !== "webui" ||
      (scenario.kind !== "basic_query" &&
        scenario.kind !== "web_skill" &&
        scenario.kind !== "approval_required_tool" &&
        scenario.kind !== "artifact_delivery" &&
        scenario.kind !== "failure_tool")
    ) {
      throw new Error("webui_live_smoke_scenario_unsupported")
    }

    let started: StartedCanonicalWebUiSmokeRequest
    try {
      started = await ports.startRequest({ request: scenario.request, source: "webui" })
    } catch {
      throw new Error("webui_live_smoke_start_failed")
    }
    validateStart(started)

    let observation: CanonicalWebUiSmokeObservation
    try {
      observation = await ports.observeTerminal({ started })
    } catch {
      throw new Error("webui_live_smoke_observation_failed")
    }
    const validation = validateObservation(scenario, started, observation)
    const { auditEventId, directResponse } = validation
    const latencyEvidence = observation.latencyEvidence!
    if (!directResponse && !observation.executionOutcome) {
      throw new Error("webui_live_smoke_semantic_outcome_missing")
    }
    const capabilityAdmissionRequired =
      channelSmokeScenarioRequiresCapabilityAdmission(scenario.kind)
    if (
      capabilityAdmissionRequired &&
      !observation.capabilityAdmissionReceiptId?.trim()
    ) {
      throw new Error(
        "webui_live_smoke_capability_admission_receipt_missing",
      )
    }
    const scenarioEvidence = projectScenarioEvidence(scenario, started, observation)

    return {
      sourceChannel: "webui",
      responseChannel: "webui",
      correlationKey: "webui_run_id",
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
        metricId: latencyEvidence.metricId,
        runId: latencyEvidence.runId,
        requestGroupId: latencyEvidence.requestGroupId,
        firstResponseLatencyMs: latencyEvidence.durationMs,
        firstResponseBudgetMs: latencyEvidence.budgetMs,
        firstResponseStatus: latencyEvidence.status,
        terminalResponseLatencyMs: latencyEvidence.terminalResponseLatencyMs,
      },
      finalDelivery: {
        delivered: true,
        targetChannel: "webui",
        correlationKey: "webui_run_id",
        receiptRef: observation.deliveryReceiptRef!.trim(),
        userVisible: true,
      },
      auditLogId: auditEventId,
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
