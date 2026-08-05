import { createHash } from "node:crypto"
import type { AgentScopedToolDispatchInput, ToolDispatcher } from "../tools/dispatcher.js"
import type { ToolContext } from "../tools/types.js"
import type {
  ExtensionLiveSmokeExecutePort,
  ExtensionLiveSmokeExecutionInput,
} from "./extension-live-smoke-runner.js"

type AgentScopedContext = ToolContext & {
  agentId: string
  capabilityPolicy: NonNullable<ToolContext["capabilityPolicy"]>
  auditId: string
}

function evidenceHash(input: {
  runId: string
  scenarioId: string
  toolName: string
  success: boolean
  output: string
  error?: string
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function createExtensionLiveToolDispatchAdapter(input: {
  readonly dispatcher: Pick<ToolDispatcher, "dispatchAgentScoped">
  readonly contextFor: (input: ExtensionLiveSmokeExecutionInput) => AgentScopedContext
  readonly findAuditEventId: (input: {
    runId: string
    requestGroupId: string
    toolName: string
  }) => string | null
}): ExtensionLiveSmokeExecutePort {
  return async (execution) => {
    const scenario = execution.selection.scenario
    const context = input.contextFor(execution)
    const dispatch: AgentScopedToolDispatchInput = {
      toolName: scenario.expectedToolName,
      params: { ...execution.selection.params },
      capabilityBindingId: scenario.expectedBindingId,
      resultSharing: "data_exchange",
      ctx: {
        ...context,
        runId: execution.runId,
        requestGroupId: execution.runId,
        signal: execution.signal,
        agentId: scenario.expectedAgentId,
      },
    }
    const result = await input.dispatcher.dispatchAgentScoped(dispatch)
    const auditEventId = input.findAuditEventId({
      runId: execution.runId,
      requestGroupId: execution.runId,
      toolName: scenario.expectedToolName,
    })
    const evidenceRef = `tool-result:${scenario.capability}:${evidenceHash({
      runId: execution.runId,
      scenarioId: scenario.id,
      toolName: scenario.expectedToolName,
      success: result.success,
      output: result.output,
      ...(result.error ? { error: result.error } : {}),
    })}`
    return {
      toolExecution: {
        runId: execution.runId,
        requestGroupId: execution.runId,
        capability: scenario.capability,
        agentId: scenario.expectedAgentId,
        bindingId: scenario.expectedBindingId,
        catalogId: scenario.expectedCatalogId,
        toolName: scenario.expectedToolName,
        status: result.success ? "succeeded" : result.error === "denied" ? "denied" : "failed",
        executionObserved: result.success && Boolean(auditEventId),
        evidenceRef,
      },
      auditEventId,
      diagnosisPayload: Object.freeze({
        success: result.success,
        output: result.output,
        ...(result.error ? { error: result.error } : {}),
      }),
    }
  }
}
