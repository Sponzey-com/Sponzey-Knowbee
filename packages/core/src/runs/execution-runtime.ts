import { runAgent } from "../agent/index.js"
import type { AgentChunk, AgentContextMode } from "../agent/index.js"
import type { AIProvider } from "../ai/index.js"
import type { ChannelSource } from "../channels/contracts.js"
import type { KnowbeeConfig } from "../config/types.js"
import type { AgentEntityType } from "../contracts/sub-agent-orchestration.js"
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js"
import type { MemoryJournalRepository } from "../memory/journal.js"
import type { AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js"
import type { WebExecutionState } from "../contracts/web-execution-state.js"

export interface ExecutionChunkStreamParams {
  artifactStorage: ArtifactStorageContext
  memoryJournal: MemoryJournalRepository
  config: KnowbeeConfig
  userMessage: string
  requiredToolNames: string[]
  completionConditions?: readonly string[] | undefined
  admittedCapabilityExecutionScope?: AdmittedCapabilityExecutionScope | undefined
  webExecutionState: WebExecutionState
  memorySearchQuery: string
  scheduleId?: string | undefined
  includeScheduleMemory?: boolean | undefined
  sessionId: string
  runId: string
  model?: string | undefined
  providerId?: string | undefined
  provider?: AIProvider | undefined
  workDir: string
  source: ChannelSource
  agentId?: string | undefined
  agentType?: AgentEntityType | undefined
  signal: AbortSignal
  toolsEnabled?: boolean | undefined
  isRootRequest: boolean
  requestGroupId: string
  contextMode: AgentContextMode
}

export interface ExecutionRuntimeDependencies {
  runAgent: typeof runAgent
}

const defaultExecutionRuntimeDependencies: ExecutionRuntimeDependencies = {
  runAgent,
}

export function createExecutionChunkStream(
  params: ExecutionChunkStreamParams,
  dependencies: ExecutionRuntimeDependencies = defaultExecutionRuntimeDependencies,
): AsyncGenerator<AgentChunk> {
  return dependencies.runAgent({
    artifactStorage: params.artifactStorage,
    memoryJournal: params.memoryJournal,
    config: params.config,
    userMessage: params.userMessage,
    requiredToolNames: params.requiredToolNames,
    ...(params.completionConditions
      ? { completionConditions: params.completionConditions }
      : {}),
    ...(params.admittedCapabilityExecutionScope
      ? { admittedCapabilityExecutionScope: params.admittedCapabilityExecutionScope }
      : {}),
    webExecutionState: params.webExecutionState,
    memorySearchQuery: params.memorySearchQuery,
    ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
    ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
    sessionId: params.sessionId,
    runId: params.runId,
    ...(params.model ? { model: params.model } : {}),
    ...(params.providerId ? { providerId: params.providerId } : {}),
    ...(params.provider ? { provider: params.provider } : {}),
    workDir: params.workDir,
    source: params.source,
    ...(params.agentId ? { agentId: params.agentId } : {}),
    ...(params.agentType ? { agentType: params.agentType } : {}),
    signal: params.signal,
    ...(params.toolsEnabled === false ? { toolsEnabled: false } : {}),
    ...(params.isRootRequest ? {} : { requestGroupId: params.requestGroupId }),
    contextMode: params.contextMode,
  })
}
