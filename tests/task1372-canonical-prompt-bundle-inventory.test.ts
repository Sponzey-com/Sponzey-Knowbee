import { describe, expect, it } from "vitest"
import { CANONICAL_PROMPT_MODULE_IDS } from "../packages/core/src/contracts/canonical-prompt-responsibility-manifest.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  CANONICAL_AGENT_PROMPT_SOURCE_IDS,
  auditAgentPromptSourceComposition,
  composeAgentPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

function ids(values: readonly { sourceId: string }[]): string[] {
  return values.map((value) => value.sourceId)
}

describe("task1372 canonical prompt bundle inventory", () => {
  it("registers every GOAL canonical module as an enabled English prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const eligible = registry.filter((source) => source.locale === "en" && source.enabled)
    const counts = new Map<string, number>()
    for (const source of eligible) counts.set(source.sourceId, (counts.get(source.sourceId) ?? 0) + 1)

    for (const sourceId of CANONICAL_PROMPT_MODULE_IDS) {
      expect(counts.get(sourceId), sourceId).toBe(1)
    }
  })

  it("composes the main agent from the canonical common runtime modules exactly once", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const audit = auditAgentPromptSourceComposition({ sources: registry, agentType: "knowbee", hasExplicitUserTraits: false })
    const composed = composeAgentPromptSources({ sources: registry, agentType: "knowbee", hasExplicitUserTraits: false })

    expect(audit.status).toBe("eligible")
    expect(ids(composed)).toEqual([...CANONICAL_AGENT_PROMPT_SOURCE_IDS])
    expect(new Set(ids(composed)).size).toBe(composed.length)
    expect(ids(composed)).not.toContain("sub_agent_base")
    expect(ids(composed)).not.toContain("agent_persona")
  })

  it("adds only sub_agent_base and an explicit agent_persona to the common sub-agent bundle", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const main = ids(composeAgentPromptSources({ sources: registry, agentType: "knowbee", hasExplicitUserTraits: false }))
    const withoutPersona = ids(composeAgentPromptSources({ sources: registry, agentType: "sub_agent", hasExplicitUserTraits: false }))
    const withPersona = ids(composeAgentPromptSources({ sources: registry, agentType: "sub_agent", hasExplicitUserTraits: true }))

    expect(withoutPersona.filter((sourceId) => !main.includes(sourceId))).toEqual(["sub_agent_base"])
    expect(withPersona.filter((sourceId) => !main.includes(sourceId))).toEqual(["sub_agent_base", "agent_persona"])
    expect(withPersona.filter((sourceId) => main.includes(sourceId))).toEqual(main)
    expect(withPersona.filter((sourceId) => sourceId === "sub_agent_base" || sourceId === "agent_persona"))
      .toEqual(["sub_agent_base", "agent_persona"])
  })

  it("rejects a missing common source, sub-agent base, or duplicate persona", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const noIdentity = registry.filter((source) => source.sourceId !== "identity")
    const noBase = registry.filter((source) => source.sourceId !== "sub_agent_base")
    const persona = registry.find((source) => source.sourceId === "agent_persona" && source.locale === "en")!

    expect(auditAgentPromptSourceComposition({ sources: noIdentity, agentType: "knowbee", hasExplicitUserTraits: false }).issueCodes)
      .toContain("source_missing:identity")
    expect(auditAgentPromptSourceComposition({ sources: noBase, agentType: "sub_agent", hasExplicitUserTraits: false }).issueCodes)
      .toContain("source_missing:sub_agent_base")
    expect(auditAgentPromptSourceComposition({ sources: [...registry, persona], agentType: "sub_agent", hasExplicitUserTraits: true }).issueCodes)
      .toContain("source_duplicate:agent_persona")
  })
})
