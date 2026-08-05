import { describe, expect, it } from "vitest"
import {
  projectAgentWorkspaceQueryLog,
  queryAgentWorkspace,
  resolveAgentWorkspaceDetail,
} from "../packages/core/src/agents/agent-workspace-query.js"

const items = Array.from({ length: 100 }, (_, index) => ({
  agentRef: `agent_v1_${index.toString(16).padStart(24, "0")}`,
  name: `Agent ${index.toString().padStart(3, "0")}`,
  role: index % 2 ? "Research" : "Review",
  status: index % 3 ? ("enabled" as const) : ("disabled" as const),
  profileVersion: 1,
  updatedAt: 1_000 - index,
  model: { configured: true, availability: "ready" as const, modelName: "worker" },
  parentName: "마당쇠",
  directChildCount: 0,
  bindingCounts: { skills: 0, mcpServers: 0, yeonjang: 0 },
  diagnosticCodes: [],
}))
const projection = {
  items,
  details: items.map((item) => ({
    ...item,
    bindingNames: { skills: [], mcpServers: [], yeonjang: [] },
    directChildNames: [],
  })),
  summary: {
    total: 100,
    enabled: 66,
    disabled: 34,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
  observedAt: 1_000,
}

describe("Task 037 agent workspace query", () => {
  it("projects three bounded log levels without identifiers or filter values", () => {
    const logs = (["product", "field_debug", "development"] as const).map((level) =>
      projectAgentWorkspaceQueryLog({
        level,
        status: "passed",
        resultCount: 3,
        durationMs: 12.9,
        filterCount: 2,
      }),
    )
    expect(logs[0]).toEqual({ level: "product", status: "passed", resultCount: 3 })
    expect(logs[1]).toMatchObject({ durationMs: 12, filterCount: 2 })
    expect(logs[2]).toMatchObject({ transition: "query_projected" })
    expect(JSON.stringify(logs)).not.toMatch(/agentId|agentRef|search|cursor|binding|catalog/iu)
  })
  it("filters and paginates with a stable public cursor", () => {
    const first = queryAgentWorkspace(projection, { search: "agent", status: "enabled", limit: 7 })
    expect(first.items).toHaveLength(7)
    expect(first.nextCursor).toMatch(/^agent_v1_/u)
    const second = queryAgentWorkspace(projection, {
      status: "enabled",
      limit: 7,
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.items[0]?.agentRef).not.toBe(first.items[0]?.agentRef)
  })

  it("fails closed for malformed cursors and internal ids", () => {
    expect(queryAgentWorkspace(projection, { cursor: "agent:private" })).toMatchObject({
      cursorValid: false,
      items: [],
    })
    expect(resolveAgentWorkspaceDetail(projection, "agent:private")).toBeNull()
    expect(resolveAgentWorkspaceDetail(projection, items[2].agentRef)).toMatchObject({
      ...items[2],
      bindingNames: { skills: [], mcpServers: [], yeonjang: [] },
      directChildNames: [],
    })
  })
})
