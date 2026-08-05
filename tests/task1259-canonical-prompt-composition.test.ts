import { describe, expect, it } from "vitest"
import type { LoadedPromptSource } from "../packages/core/src/memory/knowbee-md.ts"
import {
  composeAgentPromptSources,
  CANONICAL_AGENT_PROMPT_SOURCE_IDS,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

function source(sourceId: string, priority: number): LoadedPromptSource {
  return {
    sourceId,
    locale: "en",
    path: `/prompts/${sourceId}.md`,
    version: "1",
    priority,
    enabled: true,
    required: true,
    usageScope: "runtime",
    checksum: `sha256:${sourceId}`,
    content: `${sourceId} policy`,
  }
}

const allSources = [
  ...CANONICAL_AGENT_PROMPT_SOURCE_IDS,
  "sub_agent_base",
  "agent_persona",
  "definitions",
  "planner",
].map((sourceId, index) => source(sourceId, 500 - index))

describe("task1259 canonical prompt composition", () => {
  it("uses the canonical order and excludes legacy and sub-agent modules for the main agent", () => {
    expect(composeAgentPromptSources({
      sources: allSources,
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    }).map((item) => item.sourceId)).toEqual(CANONICAL_AGENT_PROMPT_SOURCE_IDS)
  })

  it("adds the sub-agent base but not an empty persona", () => {
    const ids = composeAgentPromptSources({
      sources: allSources,
      agentType: "sub_agent",
      hasExplicitUserTraits: false,
    }).map((item) => item.sourceId)

    expect(ids).toEqual([
      ...CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(0, -2),
      "sub_agent_base",
      ...CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(-2),
    ])
    expect(ids).not.toContain("agent_persona")
  })

  it("adds the persona exactly once only for explicit user traits", () => {
    const ids = composeAgentPromptSources({
      sources: [...allSources, source("agent_persona", 1)],
      agentType: "sub_agent",
      hasExplicitUserTraits: true,
    }).map((item) => item.sourceId)

    expect(ids).toEqual([
      ...CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(0, -2),
      "sub_agent_base",
      "agent_persona",
      ...CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(-2),
    ])
    expect(ids.filter((id) => id === "agent_persona")).toHaveLength(1)
  })
})
