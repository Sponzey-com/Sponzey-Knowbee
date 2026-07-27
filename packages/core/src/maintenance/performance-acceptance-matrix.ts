import type {
  MeasuredRepresentativeFlowSample,
  PerformanceAcceptanceThresholds,
  PerformanceReferenceFlow,
  RepresentativeFlowBaselineResult,
  RepresentativeFlowId,
} from "./performance-baseline.js"
import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  compareMeasuredFlowToBaseline,
} from "./performance-baseline.js"

export interface PerformanceAcceptanceMatrixCandidate {
  schemaVersion: 1
  matrixId: string
  matrixVersion: number
  baselineVersion: string
  baselineSnapshot: PerformanceAcceptanceBaselineSnapshot
  thresholds: Partial<Record<RepresentativeFlowId, PerformanceAcceptanceThresholds>>
}

export interface PerformanceAcceptanceBaselineFlowSnapshot {
  flowId: RepresentativeFlowId
  latencyP95Ms: number
  llmCallCount: number
  attemptCount: number
}

export interface PerformanceAcceptanceBaselineSnapshot {
  schemaVersion: 1
  baselineVersion: string
  flows: readonly PerformanceAcceptanceBaselineFlowSnapshot[]
}

export interface PerformanceAcceptanceAuthorizationReceipt {
  schemaVersion: 1
  authorizationId: string
  decision: "approved" | "denied" | "revoked"
  actorType: "administrator" | "system"
  actorId: string
  scope: "performance_release_gate"
  matrixId: string
  matrixVersion: number
  baselineVersion: string
  thresholdSnapshot: PerformanceAcceptanceMatrixCandidate["thresholds"]
  baselineSnapshot: PerformanceAcceptanceBaselineSnapshot
  approvedAt: number
}

export interface PerformanceAcceptanceAuthorizationPort {
  resolve(
    candidate: Readonly<PerformanceAcceptanceMatrixCandidate>,
  ): PerformanceAcceptanceAuthorizationReceipt | undefined
}

export type PerformanceAcceptanceMatrixValidationResult =
  | { status: "valid"; candidate: Readonly<PerformanceAcceptanceMatrixCandidate> }
  | { status: "baseline_only"; reasonCodes: string[] }

export interface ActivePerformanceAcceptanceMatrix {
  readonly candidate: Readonly<PerformanceAcceptanceMatrixCandidate>
  readonly authorization: Readonly<PerformanceAcceptanceAuthorizationReceipt>
}

function validateBaselineSnapshot(
  snapshot: unknown,
  baselineVersion: string,
):
  | { status: "valid"; snapshot: Readonly<PerformanceAcceptanceBaselineSnapshot> }
  | { status: "baseline_only"; reasonCodes: string[] } {
  if (!snapshot || typeof snapshot !== "object") {
    return { status: "baseline_only", reasonCodes: ["matrix_baseline_snapshot_required"] }
  }
  const value = snapshot as Partial<PerformanceAcceptanceBaselineSnapshot>
  if (value.schemaVersion !== 1) {
    return { status: "baseline_only", reasonCodes: ["matrix_baseline_schema_unsupported"] }
  }
  if (value.baselineVersion !== baselineVersion) {
    return { status: "baseline_only", reasonCodes: ["matrix_baseline_version_mismatch"] }
  }
  if (!Array.isArray(value.flows)) {
    return { status: "baseline_only", reasonCodes: ["matrix_baseline_flows_required"] }
  }
  const knownFlows = new Set<string>(REQUIRED_REPRESENTATIVE_FLOW_IDS)
  const seen = new Set<string>()
  for (const flow of value.flows) {
    if (!flow || typeof flow !== "object" || !knownFlows.has(flow.flowId)) {
      return {
        status: "baseline_only",
        reasonCodes: [`matrix_baseline_flow_unknown:${String(flow?.flowId ?? "unknown")}`],
      }
    }
    if (seen.has(flow.flowId)) {
      return {
        status: "baseline_only",
        reasonCodes: [`matrix_baseline_flow_duplicate:${flow.flowId}`],
      }
    }
    seen.add(flow.flowId)
    for (const metric of ["latencyP95Ms", "llmCallCount", "attemptCount"] as const) {
      const metricValue = flow[metric]
      if (
        !Number.isFinite(metricValue) ||
        metricValue < 0 ||
        (metric !== "latencyP95Ms" && !Number.isSafeInteger(metricValue))
      ) {
        return {
          status: "baseline_only",
          reasonCodes: [`matrix_baseline_metric_invalid:${flow.flowId}:${metric}`],
        }
      }
    }
  }
  for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
    if (!seen.has(flowId)) {
      return {
        status: "baseline_only",
        reasonCodes: [`matrix_baseline_flow_missing:${flowId}`],
      }
    }
  }
  const flows = REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => {
    const flow = value.flows?.find((candidate) => candidate.flowId === flowId)
    if (!flow) throw new Error("validated baseline flow is missing")
    return Object.freeze({ ...flow })
  })
  return {
    status: "valid",
    snapshot: Object.freeze({ schemaVersion: 1, baselineVersion, flows: Object.freeze(flows) }),
  }
}

function baselineSnapshotsMatch(
  left: unknown,
  right: Readonly<PerformanceAcceptanceBaselineSnapshot>,
): boolean {
  const validation = validateBaselineSnapshot(left, right.baselineVersion)
  if (validation.status === "baseline_only") return false
  return REQUIRED_REPRESENTATIVE_FLOW_IDS.every((flowId) => {
    const leftFlow = validation.snapshot.flows.find((flow) => flow.flowId === flowId)
    const rightFlow = right.flows.find((flow) => flow.flowId === flowId)
    return (
      leftFlow?.latencyP95Ms === rightFlow?.latencyP95Ms &&
      leftFlow?.llmCallCount === rightFlow?.llmCallCount &&
      leftFlow?.attemptCount === rightFlow?.attemptCount
    )
  })
}

function thresholdSnapshotsMatch(
  left: unknown,
  right: PerformanceAcceptanceMatrixCandidate["thresholds"],
  baselineSnapshot: PerformanceAcceptanceBaselineSnapshot,
): boolean {
  if (!left || typeof left !== "object") return false
  const validation = validatePerformanceAcceptanceMatrix({
    schemaVersion: 1,
    matrixId: "threshold-snapshot-validation",
    matrixVersion: 1,
    baselineVersion: "threshold-snapshot-validation",
    baselineSnapshot: {
      ...baselineSnapshot,
      baselineVersion: "threshold-snapshot-validation",
    },
    thresholds: left as PerformanceAcceptanceMatrixCandidate["thresholds"],
  })
  if (validation.status === "baseline_only") return false
  return REQUIRED_REPRESENTATIVE_FLOW_IDS.every((flowId) => {
    const leftThreshold = validation.candidate.thresholds[flowId]
    const rightThreshold = right[flowId]
    return (
      leftThreshold?.maxLatencyRegressionRatio === rightThreshold?.maxLatencyRegressionRatio &&
      leftThreshold?.maxLlmCallIncrease === rightThreshold?.maxLlmCallIncrease &&
      leftThreshold?.maxAttemptIncrease === rightThreshold?.maxAttemptIncrease
    )
  })
}

export function validatePerformanceAcceptanceMatrix(
  candidate: PerformanceAcceptanceMatrixCandidate,
): PerformanceAcceptanceMatrixValidationResult {
  if (candidate.schemaVersion !== 1) {
    return { status: "baseline_only", reasonCodes: ["matrix_schema_unsupported"] }
  }
  if (!candidate.matrixId.trim()) {
    return { status: "baseline_only", reasonCodes: ["matrix_id_required"] }
  }
  if (!Number.isSafeInteger(candidate.matrixVersion) || candidate.matrixVersion < 1) {
    return { status: "baseline_only", reasonCodes: ["matrix_version_invalid"] }
  }
  if (!candidate.baselineVersion.trim()) {
    return { status: "baseline_only", reasonCodes: ["matrix_baseline_version_required"] }
  }
  const baselineValidation = validateBaselineSnapshot(
    candidate.baselineSnapshot,
    candidate.baselineVersion.trim(),
  )
  if (baselineValidation.status === "baseline_only") return baselineValidation
  if (!candidate.thresholds || typeof candidate.thresholds !== "object") {
    return { status: "baseline_only", reasonCodes: ["matrix_thresholds_required"] }
  }
  const knownFlows = new Set<string>(REQUIRED_REPRESENTATIVE_FLOW_IDS)
  const unknownFlow = Object.keys(candidate.thresholds).find((flowId) => !knownFlows.has(flowId))
  if (unknownFlow) {
    return { status: "baseline_only", reasonCodes: [`matrix_flow_unknown:${unknownFlow}`] }
  }
  for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
    const threshold = candidate.thresholds[flowId]
    if (!threshold) {
      return { status: "baseline_only", reasonCodes: [`matrix_required_flow_missing:${flowId}`] }
    }
    for (const metric of [
      "maxLatencyRegressionRatio",
      "maxLlmCallIncrease",
      "maxAttemptIncrease",
    ] as const) {
      if (!Number.isFinite(threshold[metric]) || threshold[metric] < 0) {
        return {
          status: "baseline_only",
          reasonCodes: [`matrix_threshold_invalid:${flowId}:${metric}`],
        }
      }
      if (metric !== "maxLatencyRegressionRatio" && !Number.isSafeInteger(threshold[metric])) {
        return {
          status: "baseline_only",
          reasonCodes: [`matrix_threshold_invalid:${flowId}:${metric}`],
        }
      }
    }
  }
  const frozenThresholds = Object.fromEntries(
    REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [
      flowId,
      Object.freeze({ ...candidate.thresholds[flowId] }),
    ]),
  ) as Record<RepresentativeFlowId, PerformanceAcceptanceThresholds>
  return {
    status: "valid",
    candidate: Object.freeze({
      ...candidate,
      matrixId: candidate.matrixId.trim(),
      baselineVersion: candidate.baselineVersion.trim(),
      baselineSnapshot: baselineValidation.snapshot,
      thresholds: Object.freeze(frozenThresholds),
    }),
  }
}

export function activatePerformanceAcceptanceMatrix(input: {
  candidate: PerformanceAcceptanceMatrixCandidate
  authorizationPort: PerformanceAcceptanceAuthorizationPort
}):
  | { status: "active"; matrix: ActivePerformanceAcceptanceMatrix }
  | { status: "baseline_only"; reasonCodes: string[] } {
  const validation = validatePerformanceAcceptanceMatrix(input.candidate)
  if (validation.status === "baseline_only") return validation
  const receipt = input.authorizationPort.resolve(validation.candidate)
  if (!receipt) {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_missing"] }
  }
  if (receipt.schemaVersion !== 1) {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_schema_unsupported"] }
  }
  if (receipt.decision !== "approved") {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_not_approved"] }
  }
  if (receipt.actorType !== "administrator" || !receipt.actorId.trim()) {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_actor_invalid"] }
  }
  if (receipt.scope !== "performance_release_gate") {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_scope_invalid"] }
  }
  if (
    !receipt.authorizationId.trim() ||
    !Number.isSafeInteger(receipt.approvedAt) ||
    receipt.approvedAt < 0
  ) {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_receipt_invalid"] }
  }
  if (
    receipt.matrixId !== validation.candidate.matrixId ||
    receipt.matrixVersion !== validation.candidate.matrixVersion ||
    receipt.baselineVersion !== validation.candidate.baselineVersion ||
    !thresholdSnapshotsMatch(
      receipt.thresholdSnapshot,
      validation.candidate.thresholds,
      validation.candidate.baselineSnapshot,
    ) ||
    !baselineSnapshotsMatch(receipt.baselineSnapshot, validation.candidate.baselineSnapshot)
  ) {
    return { status: "baseline_only", reasonCodes: ["matrix_authorization_binding_mismatch"] }
  }
  return {
    status: "active",
    matrix: Object.freeze({
      candidate: validation.candidate,
      authorization: Object.freeze({ ...receipt }),
    }),
  }
}

export function evaluateMeasuredFlowWithAcceptanceMatrix(input: {
  candidate: PerformanceAcceptanceMatrixCandidate
  authorizationPort: PerformanceAcceptanceAuthorizationPort
  referenceBaselineVersion: string
  reference: PerformanceReferenceFlow
  live: MeasuredRepresentativeFlowSample
}): {
  status: "baseline_only" | "accepted" | "rejected"
  reasonCodes: string[]
} {
  const activation = activatePerformanceAcceptanceMatrix(input)
  if (activation.status === "baseline_only") return activation
  if (input.referenceBaselineVersion !== activation.matrix.candidate.baselineVersion) {
    return { status: "baseline_only", reasonCodes: ["matrix_baseline_binding_mismatch"] }
  }
  if (input.reference.flowId !== input.live.flowId) {
    return { status: "baseline_only", reasonCodes: ["matrix_flow_binding_mismatch"] }
  }
  const threshold = activation.matrix.candidate.thresholds[input.live.flowId]
  if (!threshold) {
    return { status: "baseline_only", reasonCodes: ["matrix_flow_threshold_missing"] }
  }
  const comparison = compareMeasuredFlowToBaseline({
    reference: input.reference,
    live: input.live,
    thresholds: threshold,
  })
  return { status: comparison.status, reasonCodes: comparison.reasonCodes }
}
