import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement, createRef } from "../packages/webui/node_modules/react/index.js"
import { McpConnectionDrawer } from "../packages/webui/src/components/capabilities/McpConnectionDrawer.js"
import {
  initialMcpConnectionFlow,
  reduceMcpConnectionFlow,
} from "../packages/webui/src/lib/mcp-connection-flow.js"

const callbacks = {
  onDraftChange: () => undefined,
  onProbe: () => undefined,
  onSave: () => undefined,
  onClose: () => undefined,
}
function render(flow = initialMcpConnectionFlow()) {
  return renderToStaticMarkup(
    createElement(McpConnectionDrawer, {
      open: true,
      flow,
      returnFocusRef: createRef(),
      ...callbacks,
    }),
  )
}

describe("task030 MCP connection Drawer", () => {
  it("renders the create fields and three explicit steps", () => {
    const html = render()
    expect(html).toContain("MCP 연결 추가")
    expect(html).toContain("1. 입력")
    expect(html).toContain("2. 연결 확인")
    expect(html).toContain("3. 저장 확인")
    expect(html).toContain("실행 파일")
    expect(html).not.toMatch(/environment|token|secret|내부 ID/)
  })

  it("keeps existing connection details hidden until replacement is selected", () => {
    const edit = initialMcpConnectionFlow({
      mode: "edit",
      mcpRef: `mcp_v1_${"a".repeat(24)}`,
      displayName: "Penpot",
      required: true,
    })
    const html = render(edit)
    expect(html).toContain("기존 연결 유지")
    expect(html).not.toContain("실행 파일")
    expect(
      render(
        reduceMcpConnectionFlow(edit, {
          type: "draft_changed",
          patch: { replaceConnection: true },
        }),
      ),
    ).toContain("실행 파일")
  })

  it("shows field errors and enables save only after a ready probe", () => {
    let flow = reduceMcpConnectionFlow(initialMcpConnectionFlow(), { type: "probe", sequence: 1 })
    flow = reduceMcpConnectionFlow(flow, {
      type: "probe_completed",
      sequence: 1,
      ready: false,
      reasonCode: "mcp_command_missing",
    })
    expect(render(flow)).toContain("실행 파일을 입력해 주세요.")
    flow = reduceMcpConnectionFlow(flow, { type: "probe", sequence: 2 })
    flow = reduceMcpConnectionFlow(flow, { type: "probe_completed", sequence: 2, ready: true })
    const html = render(flow)
    expect(html).toContain("연결 확인 완료")
    expect(html).toMatch(/>저장<\/button>/)
  })
})
