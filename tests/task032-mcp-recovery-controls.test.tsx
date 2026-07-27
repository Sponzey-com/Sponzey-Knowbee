import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { McpRecoveryControls } from "../packages/webui/src/components/capabilities/McpRecoveryControls"

describe("task032 MCP recovery controls", () => {
  it("keeps recovery beside the issue with a stable action target", () => {
    const html = renderToStaticMarkup(
      createElement(McpRecoveryControls, {
        issueCode: "mcp_runtime_unavailable",
        issueText: "연결이 준비되지 않았습니다.",
        flow: { state: "idle", sequence: 0, reasonCode: null },
        onRecover: () => {},
        onCancel: () => {},
      }),
    )
    expect(html).toContain("연결이 준비되지 않았습니다.")
    expect(html).toContain("다시 검사")
    expect(html).toContain("min-h-[44px]")
  })

  it("shows pending and reason-code failure feedback without internal configuration", () => {
    const pending = renderToStaticMarkup(
      createElement(McpRecoveryControls, {
        issueCode: "mcp_runtime_unavailable",
        issueText: "issue",
        flow: { state: "applying", sequence: 2, reasonCode: null },
        onRecover: () => {},
        onCancel: () => {},
      }),
    )
    expect(pending).toContain("이 연결만 다시 적용하고 있습니다.")
    expect(pending).toContain("취소")
    const failed = renderToStaticMarkup(
      createElement(McpRecoveryControls, {
        issueCode: "mcp_runtime_unavailable",
        issueText: "issue",
        flow: { state: "failed", sequence: 2, reasonCode: "mcp_recovery_not_ready" },
        onRecover: () => {},
        onCancel: () => {},
      }),
    )
    expect(failed).toContain("재적용 후 연결이 준비되지 않았습니다.")
    expect(failed).not.toMatch(/command|args|cwd|environment|secret/i)
  })
})
