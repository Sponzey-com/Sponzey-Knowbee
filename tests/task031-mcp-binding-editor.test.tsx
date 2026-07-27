import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { McpBindingEditor } from "../packages/webui/src/components/capabilities/McpBindingEditor.js"
import {
  initialMcpBindingFlow,
  reduceMcpBindingFlow,
} from "../packages/webui/src/lib/mcp-binding-flow.js"

const agents = {
  boundAgents: [{ agentRef: "agent-a", name: "Researcher" }],
  availableAgents: [{ agentRef: "agent-b", name: "Writer" }],
}
const callbacks = {
  onEdit: () => undefined,
  onToggle: () => undefined,
  onSave: () => undefined,
  onCancel: () => undefined,
}
const render = (flow = initialMcpBindingFlow(["agent-a"])) =>
  renderToStaticMarkup(createElement(McpBindingEditor, { ...agents, flow, ...callbacks }))

describe("task031 MCP binding editor", () => {
  it("shows only bound names before editing", () => {
    const html = render()
    expect(html).toContain("Researcher")
    expect(html).not.toContain("Writer")
    expect(html).toContain("연결 편집")
  })
  it("shows labeled 44px checkboxes and actions while editing", () => {
    const html = render(reduceMcpBindingFlow(initialMcpBindingFlow(["agent-a"]), { type: "edit" }))
    expect(html).toContain("Researcher")
    expect(html).toContain("Writer")
    expect(html).toContain("min-h-11")
    expect(html).toContain("연결 저장")
  })
  it("disables controls and reports reconciliation during verification failure", () => {
    let flow = reduceMcpBindingFlow(initialMcpBindingFlow(["agent-a"]), { type: "edit" })
    flow = reduceMcpBindingFlow(flow, { type: "save", sequence: 1 })
    expect(render(flow)).toContain("disabled")
    flow = reduceMcpBindingFlow(flow, { type: "save_completed", sequence: 1, active: true })
    flow = reduceMcpBindingFlow(flow, {
      type: "verification_completed",
      sequence: 1,
      verified: false,
      persistedRefs: ["agent-a"],
      reasonCode: "mcp_binding_verify_failed",
    })
    expect(render(flow)).toContain("최신 상태를 반영했습니다")
  })
})
