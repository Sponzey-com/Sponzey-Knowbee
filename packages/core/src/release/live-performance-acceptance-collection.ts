import {
  type LivePerformanceEvidenceSource,
  collectLivePerformanceEvidence,
} from "../maintenance/live-performance-evidence.js"
import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  type RepresentativeFlowId,
} from "../maintenance/performance-baseline.js"
import {
  type PerformanceAcceptanceAuthorizationRepository,
  type PerformanceAcceptanceMatrixSelector,
  selectPerformanceAcceptanceMatrix,
} from "./performance-acceptance-authorization.js"
import { buildPerformanceAcceptanceEvidence } from "./performance-acceptance-evidence.js"
import type { ReleasePerformanceAcceptanceEvidence } from "./performance-gate.js"

export interface LivePerformanceAcceptanceRunSelector {
  flowId: RepresentativeFlowId
  runId: string
}

function baselineOnly(
  selector: PerformanceAcceptanceMatrixSelector,
  reasonCode: string,
  authorizationId: string | null = null,
): ReleasePerformanceAcceptanceEvidence {
  return {
    status: "baseline_only",
    matrixId: selector.matrixId,
    matrixVersion: selector.matrixVersion,
    baselineVersion: selector.baselineVersion,
    authorizationId,
    reasonCodes: [reasonCode],
  }
}

export function collectLivePerformanceAcceptanceEvidence(input: {
  selector: PerformanceAcceptanceMatrixSelector
  repository: PerformanceAcceptanceAuthorizationRepository
  source: LivePerformanceEvidenceSource
  runs: readonly LivePerformanceAcceptanceRunSelector[]
}): ReleasePerformanceAcceptanceEvidence {
  const knownFlows = new Set<string>(REQUIRED_REPRESENTATIVE_FLOW_IDS)
  const flowIds = new Set<string>()
  const runIds = new Set<string>()
  for (const run of input.runs) {
    if (!knownFlows.has(run.flowId)) {
      return baselineOnly(input.selector, `performance_flow_unknown:${run.flowId}`)
    }
    if (flowIds.has(run.flowId)) {
      return baselineOnly(input.selector, `performance_flow_duplicate:${run.flowId}`)
    }
    if (!run.runId.trim()) {
      return baselineOnly(input.selector, `performance_run_id_required:${run.flowId}`)
    }
    if (runIds.has(run.runId)) {
      return baselineOnly(input.selector, `performance_run_duplicate:${run.runId}`)
    }
    flowIds.add(run.flowId)
    runIds.add(run.runId)
  }
  for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
    if (!flowIds.has(flowId)) {
      return baselineOnly(input.selector, `performance_flow_missing:${flowId}`)
    }
  }

  const selected = selectPerformanceAcceptanceMatrix({
    selector: input.selector,
    repository: input.repository,
  })
  if (selected.status === "baseline_only") {
    return baselineOnly(
      input.selector,
      selected.reasonCodes[0] ?? "performance_matrix_selection_failed",
    )
  }
  const authorizationId = selected.authorizationPort.resolve(selected.candidate)?.authorizationId
  const samples = []
  for (const run of input.runs) {
    const collected = collectLivePerformanceEvidence({
      source: input.source,
      runId: run.runId,
      flowId: run.flowId,
    })
    if (collected.status === "rejected") {
      return baselineOnly(
        input.selector,
        `flow:${run.flowId}:collection:${collected.reasonCode}`,
        authorizationId ?? null,
      )
    }
    samples.push(collected.sample)
  }
  return buildPerformanceAcceptanceEvidence({ selected, samples })
}
