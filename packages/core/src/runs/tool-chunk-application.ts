import {
  applyToolExecutionReceipt,
  buildToolExecutionReceipt,
  type AppliedToolExecutionReceiptState,
} from "./execution.js"
import type { FailedCommandTool, SuccessfulToolEvidence } from "./recovery.js"
import type { ToolEvidenceSourceReceipt } from "../tools/types.js"
import {
  collectYeonjangSideEffectGoalValidationCandidate,
  type YeonjangSideEffectGoalValidationCandidate,
} from "../yeonjang/side-effect-goal-validation-review.js"

export interface ToolChunkApplicationDependencies {
  appendRunEvent: (runId: string, event: string) => void
  updateRunSummary: (runId: string, summary: string) => void
}

export function applyToolStartChunk(
  params: {
    runId: string
    toolName: string
    toolParams: unknown
    pendingToolParams: Map<string, unknown>
  },
  dependencies: ToolChunkApplicationDependencies,
): void {
  params.pendingToolParams.set(params.toolName, params.toolParams)
  const summary = `${params.toolName} 실행 중`
  dependencies.appendRunEvent(params.runId, `${params.toolName} 실행 시작`)
  dependencies.updateRunSummary(params.runId, summary)
}

export function applyToolEndChunk(
  params: {
    runId: string
    toolName: string
    success: boolean
    output: string
    toolDetails?: unknown
    evidenceSource?: Readonly<ToolEvidenceSourceReceipt>
    workDir: string
    pendingToolParams: Map<string, unknown>
    successfulTools: SuccessfulToolEvidence[]
    filesystemMutationPaths: Set<string>
    failedCommandTools: FailedCommandTool[]
    commandFailureSeen: boolean
    yeonjangSideEffectGoalValidationCandidates?: YeonjangSideEffectGoalValidationCandidate[]
  },
  dependencies: ToolChunkApplicationDependencies,
): AppliedToolExecutionReceiptState {
  const toolParams = params.pendingToolParams.get(params.toolName)
  params.pendingToolParams.delete(params.toolName)

  const toolReceipt = buildToolExecutionReceipt({
    toolName: params.toolName,
    success: params.success,
    output: params.output,
    toolParams,
    toolDetails: params.toolDetails,
    ...(params.evidenceSource ? { evidenceSource: params.evidenceSource } : {}),
    workDir: params.workDir,
    commandFailureSeen: params.commandFailureSeen,
  })

  const nextState = applyToolExecutionReceipt({
    receipt: toolReceipt,
    successfulTools: params.successfulTools,
    filesystemMutationPaths: params.filesystemMutationPaths,
    failedCommandTools: params.failedCommandTools,
    toolParams,
    previousCommandFailureSeen: params.commandFailureSeen,
  })

  if (params.yeonjangSideEffectGoalValidationCandidates) {
    collectYeonjangSideEffectGoalValidationCandidate({
      toolName: params.toolName,
      success: params.success,
      output: params.output,
      details: params.toolDetails,
      candidates: params.yeonjangSideEffectGoalValidationCandidates,
    })
  }

  dependencies.appendRunEvent(params.runId, toolReceipt.summary)
  dependencies.updateRunSummary(params.runId, toolReceipt.summary)
  return nextState
}
