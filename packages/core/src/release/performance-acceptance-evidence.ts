import {
  activatePerformanceAcceptanceMatrix,
  evaluateMeasuredFlowWithAcceptanceMatrix,
} from "../maintenance/performance-acceptance-matrix.js"
import {
  type MeasuredRepresentativeFlowSample,
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  type RepresentativeFlowBaselineResult,
  type RepresentativeFlowId,
} from "../maintenance/performance-baseline.js"
import type { SelectedPerformanceAcceptanceMatrix } from "./performance-acceptance-authorization.js"
import type { ReleasePerformanceAcceptanceEvidence } from "./performance-gate.js"

export function buildPerformanceAcceptanceEvidence(input: {
  selected: SelectedPerformanceAcceptanceMatrix
  baseline?: Readonly<RepresentativeFlowBaselineResult>
  samples: readonly MeasuredRepresentativeFlowSample[]
}): ReleasePerformanceAcceptanceEvidence {
  const baseEvidence = {
    matrixId: input.selected.candidate.matrixId,
    matrixVersion: input.selected.candidate.matrixVersion,
    baselineVersion: input.selected.candidate.baselineVersion,
  }
  const activation = activatePerformanceAcceptanceMatrix(input.selected)
  if (activation.status === "baseline_only") {
    return {
      status: "baseline_only",
      ...baseEvidence,
      authorizationId: null,
      reasonCodes: activation.reasonCodes,
    }
  }
  const authorizationId = activation.matrix.authorization.authorizationId
  if (
    input.baseline &&
    (!input.baseline.complete ||
      input.baseline.fixtureVersion !== input.selected.candidate.baselineVersion)
  ) {
    return {
      status: "baseline_only",
      ...baseEvidence,
      authorizationId,
      reasonCodes: ["performance_baseline_binding_mismatch"],
    }
  }
  const snapshotMatches =
    !input.baseline ||
    REQUIRED_REPRESENTATIVE_FLOW_IDS.every((flowId) => {
      const approved = input.selected.candidate.baselineSnapshot.flows.find(
        (flow) => flow.flowId === flowId,
      )
      const supplied = input.baseline?.flows.find((flow) => flow.flowId === flowId)
      return (
        approved?.latencyP95Ms === supplied?.latencyP95Ms &&
        approved?.llmCallCount === supplied?.llmCallCount &&
        approved?.attemptCount === supplied?.attemptCount
      )
    })
  if (!snapshotMatches) {
    return {
      status: "baseline_only",
      ...baseEvidence,
      authorizationId,
      reasonCodes: ["performance_baseline_snapshot_mismatch"],
    }
  }

  const knownFlows = new Set<string>(REQUIRED_REPRESENTATIVE_FLOW_IDS)
  const sampleByFlow = new Map<RepresentativeFlowId, MeasuredRepresentativeFlowSample>()
  for (const sample of input.samples) {
    if (!knownFlows.has(sample.flowId)) {
      return {
        status: "baseline_only",
        ...baseEvidence,
        authorizationId,
        reasonCodes: [`performance_flow_unknown:${sample.flowId}`],
      }
    }
    if (sampleByFlow.has(sample.flowId)) {
      return {
        status: "baseline_only",
        ...baseEvidence,
        authorizationId,
        reasonCodes: [`performance_flow_duplicate:${sample.flowId}`],
      }
    }
    sampleByFlow.set(sample.flowId, sample)
  }
  for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
    if (!sampleByFlow.has(flowId)) {
      return {
        status: "baseline_only",
        ...baseEvidence,
        authorizationId,
        reasonCodes: [`performance_flow_missing:${flowId}`],
      }
    }
  }

  const referenceFlows = input.baseline?.flows ?? input.selected.candidate.baselineSnapshot.flows
  const reasonCodes: string[] = []
  let status: ReleasePerformanceAcceptanceEvidence["status"] = "accepted"
  for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
    const reference = referenceFlows.find((flow) => flow.flowId === flowId)
    const live = sampleByFlow.get(flowId)
    if (!reference || !live) {
      return {
        status: "baseline_only",
        ...baseEvidence,
        authorizationId,
        reasonCodes: [`performance_baseline_flow_missing:${flowId}`],
      }
    }
    const evaluation = evaluateMeasuredFlowWithAcceptanceMatrix({
      candidate: input.selected.candidate,
      authorizationPort: input.selected.authorizationPort,
      referenceBaselineVersion: input.selected.candidate.baselineVersion,
      reference,
      live,
    })
    reasonCodes.push(...evaluation.reasonCodes.map((code) => `flow:${flowId}:${code}`))
    if (evaluation.status === "baseline_only") status = "baseline_only"
    else if (evaluation.status === "rejected" && status !== "baseline_only") status = "rejected"
  }
  return {
    status,
    ...baseEvidence,
    authorizationId,
    reasonCodes,
  }
}
