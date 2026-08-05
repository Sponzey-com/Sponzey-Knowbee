import { describe, expect, it } from "vitest"
import {
  buildAgentNameSnapshotFromAgentConfig,
  findAgentNameNamespaceConflict,
  normalizeAgentName,
  normalizeAgentNameSnapshot,
  type AgentNameNamespaceEntry,
} from "../packages/core/src/index.ts"

describe("task0070 canonical agent name snapshot contract", () => {
  it("normalizes agent_name snapshots with trim, whitespace collapse, and case folding", () => {
    expect(normalizeAgentNameSnapshot("  Research   Agent  ")).toBe("Research Agent")
    expect(normalizeAgentName("  Research   Agent  ")).toBe("research agent")
  })

  it("detects duplicate agent_name snapshots across different internal ids", () => {
    const entries: AgentNameNamespaceEntry[] = [
      { entityType: "sub_agent", entityId: "agent:research", agentNameSnapshot: "Research Agent" },
      { entityType: "sub_agent", entityId: "agent:writer", agentNameSnapshot: " research   agent " },
    ]

    const conflict = findAgentNameNamespaceConflict(entries)

    expect(conflict).toMatchObject({
      normalizedAgentName: "research agent",
      existing: { entityId: "agent:research", agentNameSnapshot: "Research Agent" },
      attempted: { entityId: "agent:writer", agentNameSnapshot: " research   agent " },
    })
  })

  it("builds attribution snapshots with agentName as the canonical alias", () => {
    expect(buildAgentNameSnapshotFromAgentConfig({
      agentType: "sub_agent",
      agentId: "agent:research",
      agentName: "  Research   Agent  ",
    })).toEqual({
      entityType: "sub_agent",
      entityId: "agent:research",
      agentName: "Research Agent",
      agentNameSnapshot: "Research Agent",
    })
  })

  it("uses one canonical namespace for main agents, sub-agents, and teams", () => {
    const agentNameEntries: AgentNameNamespaceEntry[] = [
      { entityType: "knowbee", entityId: "agent:knowbee", agentNameSnapshot: "노비" },
      { entityType: "team", entityId: "team:worker", agentNameSnapshot: " 노비 " },
    ]

    expect(findAgentNameNamespaceConflict(agentNameEntries)).toMatchObject({
      normalizedAgentName: "노비",
      existing: { entityId: "agent:knowbee", agentNameSnapshot: "노비" },
      attempted: { entityId: "team:worker", agentNameSnapshot: " 노비 " },
    })
  })
})
