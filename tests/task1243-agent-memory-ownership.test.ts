import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { AGENT_MEMORY_STORE_KINDS, evaluateAgentMemoryOwnership, writeAgentMemoryEntry, type ShortTermMemoryEntryIntent } from "../packages/core/src/index.ts"

const agents = [{ agentId: "agent:main", lifecycle: "active" }, { agentId: "agent:researcher", lifecycle: "active" }] as const
const bindings = agents.flatMap((agent) => AGENT_MEMORY_STORE_KINDS.map((storeKind) => ({ agentId: agent.agentId, storeKind, namespaceId: `${agent.agentId}:${storeKind}`, lifecycle: "active" as const })))
const entries: ShortTermMemoryEntryIntent[] = [
  { entryId: "e:conversation", ownerAgentId: "agent:main", sourceOwnerAgentId: "agent:main", category: "current_conversation", scopeType: "session", scopeId: "session:1", scopeLifecycle: "active" },
  { entryId: "e:work", ownerAgentId: "agent:researcher", sourceOwnerAgentId: "agent:researcher", category: "current_work", scopeType: "work", scopeId: "work:1", scopeLifecycle: "active" },
  { entryId: "e:tool", ownerAgentId: "agent:researcher", sourceOwnerAgentId: "agent:researcher", category: "recent_tool_result", scopeType: "run", scopeId: "run:1", scopeLifecycle: "active" },
  { entryId: "e:delegation", ownerAgentId: "agent:researcher", sourceOwnerAgentId: "agent:researcher", category: "active_delegation", scopeType: "delegation", scopeId: "delegation:1", scopeLifecycle: "active" },
  { entryId: "e:judgment", ownerAgentId: "agent:main", sourceOwnerAgentId: "agent:main", category: "provisional_judgment", scopeType: "work", scopeId: "work:2", scopeLifecycle: "active" },
]

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateAgentMemoryOwnership({ agents: [...agents], bindings, shortTermEntries: entries, ...overrides })
}

function codes(result: ReturnType<typeof evaluate>): string[] {
  return result.status === "blocked" ? result.issues.map((issue) => issue.code) : []
}

describe("task1243 per-agent memory ownership", () => {
  it("accepts independent short-term, long-term, history stores and the five temporary categories", () => {
    expect(evaluate()).toEqual({ status: "eligible", activeAgentIds: ["agent:main", "agent:researcher"] })
  })

  it("rejects missing and duplicate store bindings", () => {
    expect(codes(evaluate({ bindings: bindings.filter((item) => !(item.agentId === "agent:main" && item.storeKind === "history")) }))).toContain("memory_store_binding_missing")
    expect(codes(evaluate({ bindings: [...bindings, bindings[0]] }))).toContain("memory_store_binding_duplicate")
  })

  it("rejects shared namespaces and unknown binding owners", () => {
    const shared = bindings.map((item) => item.agentId === "agent:researcher" && item.storeKind === "short_term" ? { ...item, namespaceId: "agent:main:short_term" } : item)
    expect(codes(evaluate({ bindings: shared }))).toContain("memory_namespace_shared")
    expect(codes(evaluate({ bindings: [...bindings, { ...bindings[0], agentId: "agent:unknown", namespaceId: "unknown:short" }] }))).toContain("memory_binding_owner_unknown")
  })

  it("rejects duplicate agent owners", () => {
    expect(codes(evaluate({ agents: [...agents, agents[0]] }))).toContain("agent_owner_duplicate")
  })

  it("rejects cross-agent, unknown-category, invalid-scope, and terminated short-term writes", () => {
    const base = entries[0]
    expect(codes(evaluate({ shortTermEntries: [{ ...base, sourceOwnerAgentId: "agent:researcher" }] }))).toContain("short_term_source_owner_mismatch")
    expect(codes(evaluate({ shortTermEntries: [{ ...base, category: "durable_fact" }] }))).toContain("short_term_category_invalid")
    expect(codes(evaluate({ shortTermEntries: [{ ...base, scopeType: "run" }] }))).toContain("short_term_scope_invalid")
    expect(codes(evaluate({ shortTermEntries: [{ ...base, scopeLifecycle: "terminated" }] }))).toContain("short_term_scope_terminated")
  })

  it("does not call the store port after a blocked decision", async () => {
    const write = vi.fn(async () => "stored")
    await expect(writeAgentMemoryEntry({ decision: evaluate({ bindings: [] }), write })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeAgentMemoryEntry({ decision: evaluate(), write })).resolves.toEqual({ status: "written", result: "stored" })
  })

  it("keeps the ownership decision independent from infrastructure", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/agent-memory-ownership.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
