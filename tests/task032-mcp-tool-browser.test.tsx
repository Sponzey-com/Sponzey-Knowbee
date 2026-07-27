import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import {
  McpToolBrowser,
  filterMcpTools,
} from "../packages/webui/src/components/capabilities/McpToolBrowser.js"

const analyst = { agentRef: "agent-a", agentName: "Analyst", status: "allowed" as const }
const writer = { agentRef: "agent-b", agentName: "Writer", status: "not_bound" as const }
const access = [analyst, writer]
const tools = [
  { name: "inspect", description: "Inspect a design", access },
  {
    name: "export",
    description: "Export a file",
    access: [{ ...analyst, status: "disabled" as const }, writer],
  },
]

describe("task032 MCP tool browser", () => {
  it("renders search, agent selection, result count and access status with 44px targets", () => {
    const html = renderToStaticMarkup(createElement(McpToolBrowser, { tools }))
    expect(html).toContain("도구 검색")
    expect(html).toContain("Analyst")
    expect(html).toContain("Writer")
    expect(html).toContain("2개 결과")
    expect(html).toContain("허용")
    expect(html).toContain("min-h-11")
  })

  it("filters 200 tools deterministically by name or description", () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      name: `tool-${index}`,
      description: index === 137 ? "Needle operation" : "Common operation",
    }))
    const startedAt = performance.now()
    expect(filterMcpTools(many, "needle")).toEqual([
      { name: "tool-137", description: "Needle operation" },
    ])
    expect(performance.now() - startedAt).toBeLessThan(100)
  })

  it("shows the zero-tool state without rendering an agent selector", () => {
    const html = renderToStaticMarkup(createElement(McpToolBrowser, { tools: [] }))
    expect(html).toContain("현재 사용할 수 있는 도구가 없습니다")
    expect(html).not.toContain("<select")
  })
})
