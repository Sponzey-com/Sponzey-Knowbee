import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { describeMcpConnectionTarget, formatExternalToolDisplayName } from "../packages/webui/src/lib/mcp-display.ts"

const panelSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "McpServersPanel.tsx"), "utf-8")
const setupFormSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "McpSetupForm.tsx"),
  "utf-8",
)

const text = (ko: string, _en: string) => ko

describe("task0446 mcp status redaction", () => {
  it("does not render command, url, or registered tool names in the status panel", () => {
    expect(panelSource).not.toContain("value={server.command}")
    expect(panelSource).not.toContain("value={server.url}")
    expect(panelSource).not.toContain("{tool.registeredName}</div>")
    expect(panelSource).not.toContain("font-mono")
    expect(panelSource).toContain("describeMcpConnectionTarget(server.transport, text)")
    expect(panelSource).toContain("formatExternalToolDisplayName(tool.name || tool.registeredName, index + 1, text)")
  })

  it("uses the shared display formatter for setup connection check tools", () => {
    expect(setupFormSource).not.toContain(">\n                {tool}\n              </span>")
    expect(setupFormSource).toContain("formatExternalToolDisplayName(tool, index + 1, text)")
  })

  it("formats internal MCP registered names into user-facing labels", () => {
    expect(formatExternalToolDisplayName("mcp__browser__read_file", 1, text)).toBe("Read file")
    expect(formatExternalToolDisplayName("shell_exec", 1, text)).toBe("Shell exec")
    expect(formatExternalToolDisplayName("", 3, text)).toBe("외부 도구 3")
    expect(describeMcpConnectionTarget("stdio", text)).toBe("로컬 실행 연결")
    expect(describeMcpConnectionTarget("http", text)).toBe("네트워크 연결")
  })
})
