import { describe, expect, it } from "vitest"
import { buildMcpToolAccessProjection } from "../packages/core/src/capabilities/mcp-tool-access-projection.js"

const agentRef = (id: string) => `agent_v1_${id.repeat(24).slice(0, 24)}`
const tools = [
  { name: "inspect", registeredName: "mcp__penpot__inspect", description: "Inspect" },
  { name: "export-file", registeredName: "mcp__penpot__export_file", description: "Export" },
]
const agents = [
  { agent_id: "a1", agent_name: "Analyst", status: "enabled" },
  { agent_id: "a2", agent_name: "Writer", status: "enabled" },
  { agent_id: "a3", agent_name: "Disabled", status: "disabled" },
]

describe("task032 MCP tool access projection", () => {
  it("matches raw, registered and server-qualified names with explicit disable priority", () => {
    const result = buildMcpToolAccessProjection({
      catalogId: "mcp:penpot",
      serverName: "penpot",
      tools,
      agents,
      bindings: [
        { agent_id: "a1", catalog_id: "mcp:penpot", status: "enabled", enabled_tool_names: ["mcp__penpot__inspect", "penpot:export-file"], disabled_tool_names: ["mcp__penpot__export_file"] },
      ],
      publicRefForAgentId: (id) => agentRef(id === "a1" ? "a" : "b"),
    })
    expect(result.tools).toEqual([
      { name: "export-file", description: "Export", access: [{ agentRef: agentRef("a"), agentName: "Analyst", status: "disabled" }, { agentRef: agentRef("b"), agentName: "Writer", status: "not_bound" }] },
      { name: "inspect", description: "Inspect", access: [{ agentRef: agentRef("a"), agentName: "Analyst", status: "allowed" }, { agentRef: agentRef("b"), agentName: "Writer", status: "not_bound" }] },
    ])
  })

  it("allows every discovered tool for a bound agent with an empty enabled list", () => {
    const result = buildMcpToolAccessProjection({ catalogId: "mcp:penpot", serverName: "penpot", tools, agents: agents.slice(0, 1), bindings: [{ agent_id: "a1", catalog_id: "mcp:penpot", status: "enabled", enabled_tool_names: [], disabled_tool_names: [] }], publicRefForAgentId: () => agentRef("a") })
    expect(result.tools.flatMap((tool) => tool.access.map((access) => access.status))).toEqual(["allowed", "allowed"])
  })

  it("ignores disabled agents, archived bindings and bindings for another MCP", () => {
    const result = buildMcpToolAccessProjection({ catalogId: "mcp:penpot", serverName: "penpot", tools: tools.slice(0, 1), agents, bindings: [{ agent_id: "a1", catalog_id: "mcp:other", status: "enabled", enabled_tool_names: [], disabled_tool_names: [] }, { agent_id: "a2", catalog_id: "mcp:penpot", status: "archived", enabled_tool_names: [], disabled_tool_names: [] }, { agent_id: "a3", catalog_id: "mcp:penpot", status: "enabled", enabled_tool_names: [], disabled_tool_names: [] }], publicRefForAgentId: (id) => agentRef(id) })
    expect(result.tools[0]?.access).toEqual([{ agentRef: agentRef("a1"), agentName: "Analyst", status: "not_bound" }, { agentRef: agentRef("a2"), agentName: "Writer", status: "not_bound" }])
  })
})
