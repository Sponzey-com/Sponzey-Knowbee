import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CANONICAL_AGENT_PROMPT_SOURCE_IDS,
  auditAgentPromptSourceComposition,
  buildAgentPromptStageIds,
  composeAgentPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const prompts = join(process.cwd(), "prompts")
const prompt = (name: string): string => readFileSync(join(prompts, `${name}.md`), "utf8")
const source = (sourceId: string) => ({
  sourceId,
  locale: "en" as const,
  path: `/prompts/${sourceId}.md`,
  version: "1",
  priority: 1,
  enabled: true,
  required: true,
  usageScope: "runtime" as const,
  checksum: `checksum:${sourceId}`,
  content: `# ${sourceId}`,
})

describe("task1266 sub-agent prompt boundaries", () => {
  it("keeps sub_agent_base limited to role, capability, model, and prompt-layer order", () => {
    const text = prompt("sub_agent_base")

    expect(text).toContain("platform base prompt before this sub-agent base policy")
    expect(text).toContain("configured role")
    expect(text).toContain("capability policy")
    expect(text).toContain("model policy")
    expect(text).toContain("memory_policy.md")
    expect(text).toContain("sub_agent_delegation.md")
    expect(text).not.toContain("Use only explicit handoff context, approved shared context, and the sub-agent's own memory")
  })

  it("keeps agent_persona optional, explicit, subordinate, and UI-policy neutral", () => {
    const text = prompt("agent_persona")

    expect(text).toContain("explicitly provides them for this agent")
    expect(text).toContain("Ignore empty persona values")
    expect(text).toContain("Do not use persona details to bypass platform policy")
    expect(text).toContain("Follow `ui_policy.md`")
    expect(text).not.toContain("Keep persona details out of ordinary UI")
  })

  it("keeps delegation limited to direct-child handoff, merge, and changed redelegation", () => {
    const text = prompt("sub_agent_delegation")

    expect(text).toContain("only to direct top-level sub-agents")
    expect(text).toContain("WorkHandoffPackage")
    expect(text).toContain("ChildWorkResult")
    expect(text).toContain("Link every child work record to the parent work record")
    expect(text).toContain("result_review.md")
    expect(text).toContain("must change at least one axis")
    expect(text).not.toContain("If a child result is insufficient")
  })

  it("composes persona exactly once only for explicit user traits", () => {
    const sources = [
      ...["system", "identity", "task_intake", "work_record", "tool_policy", "memory_policy", "prompt_visibility", "workflow", "sub_agent_delegation", "yeonjang_policy", "prompt_improvement", "maintenance_policy", "ui_policy", "result_review", "final_response", "sub_agent_base", "agent_persona"].map(source),
    ]

    const withoutTraits = composeAgentPromptSources({ sources, agentType: "sub_agent", hasExplicitUserTraits: false })
    const withTraits = composeAgentPromptSources({ sources, agentType: "sub_agent", hasExplicitUserTraits: true })

    expect(withoutTraits.map((entry) => entry.sourceId)).not.toContain("agent_persona")
    expect(withTraits.filter((entry) => entry.sourceId === "agent_persona")).toHaveLength(1)
  })

  it("keeps the complete common stack before sub-agent base, optional persona, and handoff", () => {
    const commonBeforeFinal = CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(0, -2)
    const finalStages = CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(-2)

    expect(buildAgentPromptStageIds({ agentType: "sub_agent", hasExplicitUserTraits: false })).toEqual([
      ...commonBeforeFinal,
      "sub_agent_base",
      "work_handoff",
      ...finalStages,
    ])
    expect(buildAgentPromptStageIds({ agentType: "sub_agent", hasExplicitUserTraits: true })).toEqual([
      ...commonBeforeFinal,
      "sub_agent_base",
      "agent_persona",
      "work_handoff",
      ...finalStages,
    ])
  })

  it("rejects missing or duplicate prompt stages instead of silently composing a partial stack", () => {
    const requiredIds = buildAgentPromptStageIds({ agentType: "sub_agent", hasExplicitUserTraits: true })
      .filter((id) => id !== "work_handoff")
    const complete = requiredIds.map(source)
    expect(auditAgentPromptSourceComposition({
      sources: complete,
      agentType: "sub_agent",
      hasExplicitUserTraits: true,
    }).status).toBe("eligible")

    const missingBase = complete.filter((item) => item.sourceId !== "sub_agent_base")
    expect(auditAgentPromptSourceComposition({
      sources: missingBase,
      agentType: "sub_agent",
      hasExplicitUserTraits: true,
    }).issueCodes).toContain("source_missing:sub_agent_base")

    expect(auditAgentPromptSourceComposition({
      sources: [...complete, source("agent_persona")],
      agentType: "sub_agent",
      hasExplicitUserTraits: true,
    }).issueCodes).toContain("source_duplicate:agent_persona")
  })
})
