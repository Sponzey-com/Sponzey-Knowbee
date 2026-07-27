import { buildChildOwnMemoryBootstrap } from "../../packages/core/src/memory/agent-state.ts"
import type {
  RunSubSessionInput,
  SubSessionRuntimeDependencies,
} from "../../packages/core/src/orchestration/sub-session-runner.ts"

export type TestSubSessionMemoryDependencies = Pick<
  SubSessionRuntimeDependencies,
  "prepareMemoryBootstrap" | "initializeAgentMemoryState"
>

function targetAgentName(input: RunSubSessionInput): string | undefined {
  return input.command.targetAgentName?.trim()
    || input.command.targetAgentNameSnapshot?.trim()
    || input.agent.agentName?.trim()
    || undefined
}

export function createTestSubSessionMemoryDependencies(): TestSubSessionMemoryDependencies {
  return Object.freeze({
    prepareMemoryBootstrap: (input, now) => input.memoryBootstrap ?? buildChildOwnMemoryBootstrap({
      agentId: input.agent.agentId,
      ...(targetAgentName(input) ? { agentNameSnapshot: targetAgentName(input) } : {}),
      sessionId: input.parentSessionId,
      requestGroupId: input.command.commandRequestId,
      lineageId: input.command.subSessionId,
      taskScope: input.command.taskScope,
      additionalContextRefs: input.command.contextPackageIds,
      sourceProvenanceRefs: input.command.contextPackageIds,
      ...(input.channelKey?.trim() ? { channelKey: input.channelKey.trim() } : {}),
      ...(input.threadKey?.trim() ? { threadKey: input.threadKey.trim() } : {}),
      now,
    }),
    initializeAgentMemoryState: () => undefined,
  })
}
