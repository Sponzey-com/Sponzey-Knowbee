import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  AGENT_PROMPT_BUNDLE_SOURCE_IDS,
  SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const CANONICAL_RUNTIME_SOURCE_IDS = [
  "system",
  "definitions",
  "identity",
  "user",
  "task_intake",
  "work_record",
  "tool_policy",
  "memory_policy",
  "prompt_visibility",
  "soul",
  "planner",
  "knowbee_execution",
  "workflow",
  "sub_agent_delegation",
  "yeonjang_policy",
  "prompt_improvement",
  "recovery_policy",
  "topology_executor_policy",
  "completion_policy",
  "output_policy",
  "maintenance_policy",
  "ui_policy",
  "runtime_environment_policy",
  "logging_policy",
  "channel",
  "result_review",
  "final_response",
] as const

const SUB_AGENT_ONLY_SOURCE_IDS = [
  "sub_agent_base",
  "agent_persona",
] as const

function firstPurposeLine(content: string): string {
  const lines = content.split(/\r?\n/u)
  const purposeIndex = lines.findIndex((line) => line.trim() === "## Purpose")
  if (purposeIndex < 0) return ""
  return lines
    .slice(purposeIndex + 1)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? ""
}

describe("task1015 canonical prompt module coverage", () => {
  it("registers every GOAL canonical runtime prompt module as an English runtime source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const sourceIds = registry
      .filter((source) => source.locale === "en" && source.usageScope === "runtime")
      .map((source) => source.sourceId)

    expect(sourceIds).toEqual(expect.arrayContaining([...CANONICAL_RUNTIME_SOURCE_IDS]))
    expect(sourceIds).toEqual(expect.arrayContaining([...SUB_AGENT_ONLY_SOURCE_IDS]))
  })

  it("keeps canonical prompt module purpose lines ownership-oriented", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const requiredIds = [...CANONICAL_RUNTIME_SOURCE_IDS, ...SUB_AGENT_ONLY_SOURCE_IDS]
    const offenders: string[] = []

    for (const sourceId of requiredIds) {
      const source = registry.find((item) => item.locale === "en" && item.sourceId === sourceId)
      const firstLine = firstPurposeLine(source?.content ?? "")
      if (!/^Own\s/u.test(firstLine)) {
        offenders.push(`${sourceId}: ${firstLine || "<missing purpose>"}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it("keeps sub-agent-only prompt sources out of the main-agent bundle", () => {
    expect(AGENT_PROMPT_BUNDLE_SOURCE_IDS).toEqual([...CANONICAL_RUNTIME_SOURCE_IDS])
    expect(AGENT_PROMPT_BUNDLE_SOURCE_IDS).not.toEqual(expect.arrayContaining([...SUB_AGENT_ONLY_SOURCE_IDS]))
  })

  it("adds sub-agent base and persona sources after the shared main-agent bundle", () => {
    expect(SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS).toEqual([
      ...AGENT_PROMPT_BUNDLE_SOURCE_IDS,
      ...SUB_AGENT_ONLY_SOURCE_IDS,
    ])
  })
})
