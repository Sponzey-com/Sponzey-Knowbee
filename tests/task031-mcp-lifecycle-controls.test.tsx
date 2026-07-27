import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { McpLifecycleControls } from "../packages/webui/src/components/capabilities/McpLifecycleControls.js"
import {
  initialMcpLifecycleFlow,
  reduceMcpLifecycleFlow,
} from "../packages/webui/src/lib/mcp-lifecycle-flow.js"

const detail = {
  mcpRef: "mcp-public",
  displayName: "Penpot",
  transport: "stdio" as const,
  configuredStatus: "enabled" as const,
  runtimeStatus: "ready" as const,
  required: false,
  toolCount: 1,
  bindingCount: 0,
  issueCode: null,
  revision: 7,
  tools: [],
  bindings: { boundAgents: [], availableAgents: [] },
}
const callbacks = {
  onBegin: () => undefined,
  onConfirm: () => undefined,
  onCancel: () => undefined,
}
const render = (input = detail, flow = initialMcpLifecycleFlow()) =>
  renderToStaticMarkup(createElement(McpLifecycleControls, { detail: input, flow, ...callbacks }))

describe("task031 MCP lifecycle controls", () => {
  it("renders 44px status and delete actions in the existing detail hierarchy", () => {
    const html = render()
    expect(html).toContain("연결 상태")
    expect(html).toContain("비활성화")
    expect(html).toContain("삭제")
    expect(html).toContain("min-h-[44px]")
    expect(html).not.toMatch(/drawer|dialog/i)
  })

  it("requires inline confirmation and exposes pending verification", () => {
    let flow = reduceMcpLifecycleFlow(initialMcpLifecycleFlow(), {
      type: "begin",
      action: "disable",
    })
    expect(render(detail, flow)).toContain("이 MCP 연결을 비활성화하시겠습니까")
    flow = reduceMcpLifecycleFlow(flow, { type: "save", sequence: 1 })
    flow = reduceMcpLifecycleFlow(flow, { type: "save_completed", sequence: 1, active: true })
    expect(render(detail, flow)).toContain("최신 상태를 확인하고 있습니다")
  })

  it("blocks delete and names bound agents", () => {
    const html = render({
      ...detail,
      bindingCount: 1,
      bindings: {
        boundAgents: [{ agentRef: "agent-public", name: "Writer" }],
        availableAgents: [],
      },
    })
    expect(html).toContain("Writer")
    expect(html).toContain("먼저")
    expect(html).toMatch(/disabled=""/)
  })
})
