import { describe, expect, it } from "vitest"
import { listPromptSourceDefinitions } from "../packages/core/src/memory/knowbee-md.ts"
import {
  AGENT_PROMPT_BUNDLE_SOURCE_IDS,
  SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

function runtimeDefaultIdsByPriority(): string[] {
  return listPromptSourceDefinitions()
    .filter((definition) => definition.usageScope === "runtime" && definition.defaultRuntime)
    .sort((a, b) => a.priority - b.priority || a.sourceId.localeCompare(b.sourceId))
    .map((definition) => definition.sourceId)
}

function subAgentOnlyRuntimeIdsByPriority(): string[] {
  return listPromptSourceDefinitions()
    .filter((definition) => definition.usageScope === "runtime" && !definition.defaultRuntime)
    .sort((a, b) => a.priority - b.priority || a.sourceId.localeCompare(b.sourceId))
    .map((definition) => definition.sourceId)
}

describe("task0918 prompt composition order gate", () => {
  it("keeps prompt registry definitions declared in priority order", () => {
    const definitions = listPromptSourceDefinitions()
    const priorities = definitions.map((definition) => definition.priority)
    const sortedPriorities = [...priorities].sort((a, b) => a - b)

    expect(priorities).toEqual(sortedPriorities)
  })

  it("keeps runtime bundle declarations aligned with registry priority order", () => {
    const runtimeDefaultIds = runtimeDefaultIdsByPriority()
    const subAgentOnlyIds = subAgentOnlyRuntimeIdsByPriority()

    expect(AGENT_PROMPT_BUNDLE_SOURCE_IDS).toEqual(runtimeDefaultIds)
    expect(SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS).toEqual([
      ...runtimeDefaultIds,
      ...subAgentOnlyIds,
    ])
    expect(runtimeDefaultIds.slice(-2)).toEqual(["result_review", "final_response"])
  })
})
