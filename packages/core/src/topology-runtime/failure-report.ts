import {
  ENTERPRISE_TOPOLOGY_SCHEMA_VERSION,
  type EnterpriseMetadata,
  type EnterpriseTimestamp,
  type FailureReport,
  type NodeContract,
  type NodeResultOutput,
  type WorkOrder,
} from "../contracts/enterprise-topology.js"
import type { NodeExhaustionCheckResult } from "./exhaustion-checker.js"
import type { NodeRecoveryControllerResult } from "./recovery-controller.js"

export interface GenerateFailureReportInput {
  workOrder: WorkOrder
  nodeContractSnapshot: NodeContract
  nodeRunId: string
  outputs: NodeResultOutput[]
  risksOrGaps: string[]
  recoveryReview: NodeRecoveryControllerResult
  exhaustion: NodeExhaustionCheckResult
  partialResult?: EnterpriseMetadata
  recommendedAction?: string
  failureReportId?: string
  createdAt?: EnterpriseTimestamp
}

export function generateFailureReport(input: GenerateFailureReportInput): FailureReport {
  return {
    schemaVersion: ENTERPRISE_TOPOLOGY_SCHEMA_VERSION,
    failureReportId: input.failureReportId ?? `failure:${input.workOrder.workOrderId}`,
    topologyRunId: input.workOrder.topologyRunId,
    nodeRunId: input.nodeRunId,
    workOrderId: input.workOrder.workOrderId,
    nodeId: input.nodeContractSnapshot.id,
    exhaustionSummary: input.exhaustion.exhaustionSummary,
    attempts: input.recoveryReview.attempts.map((attempt) => ({ ...attempt })),
    untriedOptions: [...input.exhaustion.untriedOptions],
    ...(input.partialResult !== undefined ? { partialResult: structuredClone(input.partialResult) } : {}),
    recommendedAction: input.recommendedAction ?? recommendedActionForFailure(input),
    createdAt: input.createdAt ?? Date.now(),
  }
}

function recommendedActionForFailure(input: GenerateFailureReportInput): string {
  if (input.exhaustion.blockingUntriedOptions.length > 0) {
    return `Review untried recovery options before declaring final failure: ${input.exhaustion.blockingUntriedOptions.join(", ")}.`
  }
  if (input.exhaustion.unmetSuccessCriteriaIds.length > 0) {
    return `Escalate with unmet success criteria: ${input.exhaustion.unmetSuccessCriteriaIds.join(", ")}.`
  }
  if (input.risksOrGaps.length > 0) {
    return `Review unresolved runtime risks: ${input.risksOrGaps.slice(0, 3).join(", ")}.`
  }
  return "Escalate to the accountable owner with the failure report and runtime trace."
}
