import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement, createRef } from "../packages/webui/node_modules/react/index.js"
import { McpConnectionDrawer } from "../packages/webui/src/components/capabilities/McpConnectionDrawer.js"
import {
  createMcpProtectedUpdateRequest,
  initialMcpConnectionFlow,
  normalizeMcpDraft,
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

describe("task033 HTTP MCP connection UI", () => {
  it("renders only the selected transport fields", () => {
    let flow = initialMcpConnectionFlow()
    expect(render(flow)).toContain("실행 파일")
    flow = reduceMcpConnectionFlow(flow, {
      type: "draft_changed",
      patch: {
        transport: "http",
        command: "",
        argsText: "",
        cwd: "",
        url: "https://mcp.example.test/endpoint",
      },
    })
    const html = render(flow)
    expect(html).toContain("HTTP endpoint")
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain("실행 파일")
    expect(html).not.toContain("작업 폴더")
  })

  it("places URL errors by the endpoint and keeps save disabled before probe", () => {
    let flow = initialMcpConnectionFlow({ transport: "http" })
    flow = reduceMcpConnectionFlow(flow, { type: "probe", sequence: 1 })
    flow = reduceMcpConnectionFlow(flow, {
      type: "probe_completed",
      sequence: 1,
      ready: false,
      reasonCode: "mcp_url_missing",
    })
    const html = render(flow)
    expect(html).toContain('id="mcp-url-error"')
    expect(html).toContain("HTTP endpoint를 입력해 주세요.")
    expect(html).toMatch(/>저장<\/button>/)
    expect(html).toMatch(/disabled=""[^>]*>저장<\/button>|disabled[^>]*>저장<\/button>/)
  })

  it("normalizes and protects an HTTP replacement without stdio values", () => {
    const draft = {
      ...initialMcpConnectionFlow({ transport: "http" }).draft,
      displayName: " Penpot ",
      url: " https://mcp.example.test/endpoint ",
      command: "must-not-leak",
      argsText: "--must-not-leak",
      cwd: "/must-not-leak",
      required: true,
      replaceConnection: true,
    }
    expect(normalizeMcpDraft(draft)).toEqual({
      displayName: "Penpot",
      transport: "http",
      command: "",
      args: [],
      cwd: "",
      url: "https://mcp.example.test/endpoint",
      required: true,
    })
    const request = createMcpProtectedUpdateRequest({
      draft,
      revision: 4,
      now: 10,
      randomId: (() => {
        let value = 0
        return () => `id-${++value}`
      })(),
    })
    expect(request.change.replacement).toEqual({
      transport: "http",
      command: "",
      args: [],
      cwd: "",
      url: "https://mcp.example.test/endpoint",
    })
    expect(JSON.stringify(request)).not.toContain("must-not-leak")
  })
})
