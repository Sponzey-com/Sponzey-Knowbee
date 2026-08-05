import { describe, expect, it } from "vitest"
import type { LoadedPromptSource } from "../packages/core/src/memory/knowbee-md.ts"
import {
  auditAgentPromptSourceComposition,
  buildAgentPromptStageIds,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

function source(sourceId: string, overrides: Partial<LoadedPromptSource> = {}): LoadedPromptSource {
  return {
    sourceId,
    locale: "en",
    path: `/prompts/${sourceId}.md`,
    version: "1",
    priority: 10,
    enabled: true,
    required: true,
    usageScope: "runtime",
    checksum: `sha256:${sourceId}`,
    content: `${sourceId} policy`,
    ...overrides,
  }
}

describe("task1260 canonical prompt stage audit", () => {
  it("places system first and handoff before review and final response", () => {
    const stages = buildAgentPromptStageIds({ agentType: "sub_agent", hasExplicitUserTraits: true })

    expect(stages[0]).toBe("system")
    expect(stages.indexOf("sub_agent_base")).toBeLessThan(stages.indexOf("agent_persona"))
    expect(stages.indexOf("agent_persona")).toBeLessThan(stages.indexOf("work_handoff"))
    expect(stages.indexOf("work_handoff")).toBeLessThan(stages.indexOf("result_review"))
    expect(stages.at(-1)).toBe("final_response")
  })

  it("omits sub-agent stages for the main agent and empty persona for a sub-agent", () => {
    expect(buildAgentPromptStageIds({ agentType: "knowbee", hasExplicitUserTraits: false })).not.toEqual(
      expect.arrayContaining(["sub_agent_base", "agent_persona"]),
    )
    expect(buildAgentPromptStageIds({ agentType: "sub_agent", hasExplicitUserTraits: false })).toContain("sub_agent_base")
    expect(buildAgentPromptStageIds({ agentType: "sub_agent", hasExplicitUserTraits: false })).not.toContain("agent_persona")
  })

  it("accepts exactly one eligible source for every non-handoff stage", () => {
    const stages = buildAgentPromptStageIds({ agentType: "knowbee", hasExplicitUserTraits: false })
    const result = auditAgentPromptSourceComposition({
      sources: stages.filter((id) => id !== "work_handoff").map((id) => source(id)),
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    })

    expect(result).toEqual({ status: "eligible", stageIds: stages, issueCodes: [] })
  })

  it("rejects missing, duplicate, disabled, non-English, and non-runtime sources", () => {
    const stages = buildAgentPromptStageIds({ agentType: "knowbee", hasExplicitUserTraits: false })
    const valid = stages.filter((id) => id !== "work_handoff").map((id) => source(id))
    const withoutIdentity = valid.filter((item) => item.sourceId !== "identity")

    expect(auditAgentPromptSourceComposition({
      sources: [...withoutIdentity, source("identity", { enabled: false })],
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    }).issueCodes).toContain("source_missing:identity")
    expect(auditAgentPromptSourceComposition({
      sources: [...valid, source("identity")],
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    }).issueCodes).toContain("source_duplicate:identity")
    expect(auditAgentPromptSourceComposition({
      sources: [...withoutIdentity, source("identity", { locale: "ko" })],
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    }).issueCodes).toContain("source_missing:identity")
    expect(auditAgentPromptSourceComposition({
      sources: [...withoutIdentity, source("identity", { usageScope: "internal" })],
      agentType: "knowbee",
      hasExplicitUserTraits: false,
    }).issueCodes).toContain("source_missing:identity")
  })
})
